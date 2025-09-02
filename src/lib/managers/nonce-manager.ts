/**
 * RFC 8555 ACME Nonce Manager
 *
 * Manages nonce values for ACME protocol operations with rate limiting and prefetching
 */

import { BadNonceError } from '../errors/acme-server-errors.js';
import { createErrorFromProblem } from '../errors/factory.js';
import type { ParsedResponseData } from '../transport/http-client.js';
import { safeReadBody } from '../utils/index.js';
import { debugNonce } from '../utils/debug.js';
import { RateLimiter } from './rate-limiter.js';

/**
 * Minimal fetch-like function signature returning a ParsedResponseData
 * (your implementation can wrap undici / node fetch / custom HTTP client).
 */
export type FetchLike = (url: string) => Promise<ParsedResponseData>;

/**
 * Configuration options for the ACME nonce manager
 */
export interface NonceManagerOptions {
  /** Full URL of the ACME newNonce endpoint (absolute). */
  newNonceUrl: string;
  /** Fetch / HTTP function returning a structured response (status, headers, data). */
  fetch: FetchLike;
  /** Max nonce age (ms) before considered stale & discarded. Defaults to 120 seconds. */
  maxAgeMs?: number;
  /** Hard cap on pool size per namespace. Defaults to 32. */
  maxPool?: number;
  /**
   * If > 0, when a consumer asks for a nonce and pool < lowWater the manager will proactively
   * fetch more (prefetch). Set 0 to disable prefetch.
   */
  prefetchLowWater?: number;
  /** Target fill level for prefetch (must be >= lowWater). Optional. */
  prefetchHighWater?: number;
  /** Rate limiter for handling Let's Encrypt API limits. If not provided, creates default one. */
  rateLimiter?: RateLimiter;
}

/** Outstanding nonce requests waiting for a nonce */
interface PendingWaiter {
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
  timeout?: NodeJS.Timeout;
}

/**
 * Nonce value with timestamp for staleness tracking
 */
export interface NonceEntry {
  /** The nonce value from the ACME server */
  value: string;
  /** When this nonce was fetched (for staleness detection) */
  timestamp: number;
}

/**
 * RFC 8555 ACME Nonce Manager
 *
 * Manages anti-replay nonces for ACME protocol operations according to RFC 8555 Section 6.5.
 * Provides nonce pooling, prefetching, rate limiting, and automatic staleness management.
 */
export class NonceManager {
  private readonly opts: Required<NonceManagerOptions>;
  private readonly rateLimiter: RateLimiter;
  private readonly pool = new Map<string, NonceEntry[]>();
  private readonly pending = new Map<string, PendingWaiter[]>();
  private readonly refilling = new Set<string>();

  constructor(opts: NonceManagerOptions) {
    this.opts = {
      maxAgeMs: 120_000, // 2 minutes
      maxPool: 32,
      prefetchLowWater: 5,
      prefetchHighWater: 10,
      rateLimiter: new RateLimiter(),
      ...opts,
    };
    this.rateLimiter = this.opts.rateLimiter;
  }

  /**
   * Get a fresh nonce for ACME requests
   *
   * @param namespace - Optional namespace for nonce isolation (default: 'default')
   * @returns Promise resolving to a fresh nonce value
   * @throws {BadNonceError} When nonce fetch fails
   * @throws {RateLimitError} When rate limited
   */
  async get(namespace = 'default'): Promise<string> {
    debugNonce('NonceManager.get() namespace=%s', namespace);

    // Clean stale nonces first
    this.cleanStale(namespace);

    // Get pool for this namespace
    const pool = this.pool.get(namespace) || [];
    this.pool.set(namespace, pool);

    // If we have nonces, return the newest one
    while (pool.length > 0) {
      const entry = pool.pop();
      if (!entry) break; // Safety check
      if (!this.isExpired(entry.timestamp)) {
        debugNonce('NonceManager.get() returning pooled nonce, pool size now=%d', pool.length);

        // Trigger prefetch if below low water mark
        if (
          this.opts.prefetchLowWater > 0 &&
          pool.length < this.opts.prefetchLowWater &&
          !this.refilling.has(namespace)
        ) {
          this.runRefill(namespace).catch((error: unknown) => {
            debugNonce('Prefetch failed: %j', error);
          });
        }

        return entry.value;
      }
    }

    // No nonces available, queue waiter and start refill
    debugNonce('No cached nonce available, queueing request: namespace=%s', namespace);
    return new Promise<string>((resolve, reject) => {
      const waiter: PendingWaiter = {
        resolve: (value) => {
          if (waiter.timeout) clearTimeout(waiter.timeout);
          resolve(value);
        },
        reject: (error) => {
          if (waiter.timeout) clearTimeout(waiter.timeout);
          reject(error);
        },
      };

      // Add timeout for waiter
      const timeoutMs = 30_000;
      waiter.timeout = setTimeout(() => {
        const current = this.pending.get(namespace) || [];
        const idx = current.indexOf(waiter);
        if (idx >= 0) {
          current.splice(idx, 1);
          if (current.length > 0) {
            this.pending.set(namespace, current);
          } else {
            this.pending.delete(namespace);
          }
        }
        waiter.reject(
          new Error(`Nonce request timeout after ${timeoutMs}ms for namespace: ${namespace}`),
        );
      }, timeoutMs);

      const queue = this.pending.get(namespace) || [];
      queue.push(waiter);
      this.pending.set(namespace, queue);
      debugNonce('Queued nonce request: namespace=%s, queueLength=%d', namespace, queue.length);

      // Start refill process
      this.runRefill(namespace).catch((error: unknown) => {
        debugNonce('Refill failed: %j', error);
      });
    });
  }

  /**
   * Check if timestamp is older than maxAge
   */
  private isExpired(timestamp: number): boolean {
    return Date.now() - timestamp > this.opts.maxAgeMs;
  }

  /**
   * Coalesced refill per namespace: only one refill loop runs concurrently per namespace
   */
  private async runRefill(namespace: string): Promise<void> {
    if (this.refilling.has(namespace)) {
      debugNonce('Refill already in progress: %s', namespace);
      return;
    }
    this.refilling.add(namespace);
    try {
      await this.doRefill(namespace);
    } finally {
      this.refilling.delete(namespace);
    }
  }

  /**
   * Refill loop: fetch while there are waiters OR prefetch below lowWater
   */
  private async doRefill(namespace: string): Promise<void> {
    debugNonce('Starting refill operation: namespace=%s', namespace);

    const HARD_CAP = Math.max(8, this.opts.maxPool);

    for (let i = 0; i < HARD_CAP; i++) {
      const queueNeed = this.pending.get(namespace)?.length ?? 0;
      const pool = this.pool.get(namespace) ?? [];
      const poolLen = pool.length;

      const needAnother =
        queueNeed > 0 || (this.opts.prefetchLowWater > 0 && poolLen < this.opts.prefetchLowWater);

      if (!needAnother) {
        debugNonce('No more nonces needed, breaking loop: namespace=%s', namespace);
        break;
      }
      if (this.opts.prefetchHighWater > 0 && poolLen >= this.opts.prefetchHighWater) {
        debugNonce(
          'High water reached, breaking loop: namespace=%s, poolLen=%d, highWater=%d',
          namespace,
          poolLen,
          this.opts.prefetchHighWater,
        );
        break;
      }
      if (poolLen >= this.opts.maxPool) {
        debugNonce(
          'Max pool reached, breaking loop: namespace=%s, poolLen=%d, maxPool=%d',
          namespace,
          poolLen,
          this.opts.maxPool,
        );
        break;
      }

      try {
        await this.fetchNewNonce(namespace);
        this.drain(namespace);
      } catch (error) {
        debugNonce('Refill failed: %j', error);
        // On error, reject all pending waiters
        const queue = this.pending.get(namespace) ?? [];
        this.pending.delete(namespace);
        for (const waiter of queue) {
          waiter.reject(error);
        }
        throw error;
      }
    }
  }

  /**
   * Satisfy as many pending waiters as currently possible with pooled nonces
   */
  private drain(namespace: string): void {
    const queue = this.pending.get(namespace);
    if (!queue || queue.length === 0) return;

    const pool = this.pool.get(namespace) ?? [];
    debugNonce(
      'Draining namespace: %s, waiters=%d, poolSize=%d',
      namespace,
      queue.length,
      pool.length,
    );

    let drained = 0;
    while (queue.length && pool.length) {
      const waiter = queue.shift();
      const entry = pool.pop();
      if (!waiter || !entry) break;
      waiter.resolve(entry.value);
      drained++;
    }

    this.pool.set(namespace, pool);
    debugNonce(
      'Drained %d waiters for namespace: %s, remaining waiters=%d, remaining pool=%d',
      drained,
      namespace,
      queue.length,
      pool.length,
    );

    if (queue.length > 0) {
      this.pending.set(namespace, queue);
    } else {
      this.pending.delete(namespace);
    }
  }

  /**
   * Fetch a new nonce and add it to the pool
   */
  private async fetchNewNonce(namespace: string): Promise<string> {
    debugNonce('Fetching new nonce: namespace=%s', namespace);

    return this.rateLimiter.executeWithRetry(async () => {
      const response = await this.opts.fetch(this.opts.newNonceUrl);

      if (response.statusCode !== 200 && response.statusCode !== 204) {
        // For 503/429 errors, make sure the error has the proper structure for rate limiter
        if (response.statusCode === 503 || response.statusCode === 429) {
          const error = new Error(`newNonce failed: HTTP ${response.statusCode}`) as Error & {
            status: number;
            headers: Record<string, string | string[] | undefined>;
          };
          error.status = response.statusCode;
          error.headers = response.headers;
          throw error;
        }

        const problem = await safeReadBody(response);
        throw createErrorFromProblem(problem);
      }

      const nonceHeader = response.headers['replay-nonce'];
      if (!nonceHeader || typeof nonceHeader !== 'string') {
        throw new BadNonceError('No replay-nonce header in response');
      }

      debugNonce('Fetched new nonce: namespace=%s, nonce=%s', namespace, nonceHeader);
      this.putNonce(namespace, nonceHeader);
      return nonceHeader;
    }, 'new-nonce');
  }

  /**
   * Clean stale nonces from the pool
   *
   * @param namespace - Namespace to clean
   */
  private cleanStale(namespace: string): void {
    const pool = this.pool.get(namespace);
    if (!pool) return;

    const now = Date.now();
    const cutoff = now - this.opts.maxAgeMs;

    let removed = 0;
    for (let i = pool.length - 1; i >= 0; i--) {
      if (pool[i].timestamp < cutoff) {
        pool.splice(i, 1);
        removed++;
      }
    }

    if (removed > 0) {
      debugNonce(
        'NonceManager.cleanStale() namespace=%s removed=%d pool_size=%d',
        namespace,
        removed,
        pool.length,
      );
    }
  }

  /**
   * Get current pool statistics
   *
   * @param namespace - Namespace to get stats for (default: 'default')
   * @returns Pool statistics
   */
  getStats(namespace = 'default'): { poolSize: number; prefetching: boolean } {
    const pool = this.pool.get(namespace) || [];
    return {
      poolSize: pool.length,
      prefetching: this.refilling.has(namespace),
    };
  }

  /**
   * Clear all nonces from all namespaces
   */
  clear(): void {
    this.pool.clear();
    this.pending.clear();
    this.refilling.clear();

    // Clear timeouts for all pending waiters
    for (const queue of this.pending.values()) {
      for (const waiter of queue) {
        if (waiter.timeout) clearTimeout(waiter.timeout);
      }
    }

    debugNonce('NonceManager.clear() cleared all pools');
  }

  /**
   * Clear nonces for a specific namespace
   *
   * @param namespace - Namespace to clear
   */
  clearNamespace(namespace: string): void {
    this.pool.delete(namespace);

    // Clear timeouts for pending waiters in this namespace
    const queue = this.pending.get(namespace);
    if (queue) {
      for (const waiter of queue) {
        if (waiter.timeout) clearTimeout(waiter.timeout);
      }
      this.pending.delete(namespace);
    }

    this.refilling.delete(namespace);
    debugNonce('NonceManager.clearNamespace() namespace=%s', namespace);
  }

  /**
   * Execute an ACME request with automatic retry on `badNonce`.
   * The last response (even if badNonce) is returned if retries are exhausted.
   */
  async withNonceRetry(
    namespace: string,
    fn: (nonce: string) => Promise<ParsedResponseData>,
    maxAttempts = 3,
  ): Promise<ParsedResponseData> {
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const nonce = await this.get(namespace);
      const res = await fn(nonce);

      this.putFromResponse(namespace, res);

      debugNonce(
        'Attempt %d: HTTP %d (pool size %d)',
        attempt,
        res.statusCode,
        this.getStats(namespace).poolSize,
      );

      // Success (2xx/3xx)
      if (res.statusCode >= 200 && res.statusCode < 400) {
        return res;
      }

      // Try to detect badNonce ACME problem
      let isBadNonce = false;
      try {
        const rawCt = res.headers['content-type'] ?? '';
        const ctStr = Array.isArray(rawCt) ? (rawCt[0] ?? '') : rawCt;
        const ct = String(ctStr).toLowerCase();

        if (ct.includes('application/problem+json')) {
          const problem = await safeReadBody(res);
          const error = createErrorFromProblem(problem);
          isBadNonce = error instanceof BadNonceError;

          if (!isBadNonce) {
            return res;
          }
        } else {
          return res;
        }
      } catch (e) {
        lastErr = e;
        return res;
      }

      // Only badNonce reaches here → try again if attempts remain
      if (attempt < maxAttempts) {
        continue;
      }
      return res;
    }

    throw lastErr ?? new Error('Nonce retry exhausted');
  }

  /**
   * Extract and store nonce from response headers
   */
  private putFromResponse(namespace: string, res: ParsedResponseData): void {
    try {
      const raw = res.headers['replay-nonce'] || res.headers['Replay-Nonce'];
      if (!raw) return;

      const nonce = Array.isArray(raw) ? raw[raw.length - 1] : raw;
      if (!nonce) return;

      this.putNonce(namespace, nonce);
      debugNonce('Extracted nonce from response: namespace=%s, nonce=%s', namespace, nonce);

      // Drain waiters after adding nonce
      this.drain(namespace);
    } catch (error) {
      debugNonce('Failed to extract nonce from response: %s', error);
    }
  }

  /**
   * Add a nonce to the pool for a namespace
   */
  private putNonce(namespace: string, nonce: string): void {
    const pool = this.pool.get(namespace) || [];

    // Deduplicate - don't add if already exists
    if (pool.some((entry) => entry.value === nonce)) {
      debugNonce('NonceManager.putNonce() skipped duplicate nonce: namespace=%s', namespace);
      return;
    }

    // Respect max pool size
    if (pool.length >= this.opts.maxPool) {
      debugNonce('NonceManager.putNonce() pool full, removing oldest: namespace=%s', namespace);
      pool.shift(); // Remove oldest (FIFO for storage, LIFO for consumption)
    }

    pool.push({ value: nonce, timestamp: Date.now() });
    this.pool.set(namespace, pool);
    debugNonce('NonceManager.putNonce() namespace=%s, pool size now=%d', namespace, pool.length);
  }
}
