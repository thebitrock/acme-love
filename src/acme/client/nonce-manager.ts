import { BadNonceError, ServerInternalError } from '../errors/errors.js';
import { createErrorFromProblem } from '../errors/factory.js';
import type { HttpResponse } from '../http/http-client.js';
import { safeReadBody } from '../utils.js';
import { debugNonce } from '../debug.js';
import { RateLimiter, RateLimitError } from './rate-limiter.js';

/**
 * Minimal fetch-like function signature returning an HttpResponse
 * (your implementation can wrap undici / node fetch / custom HTTP client).
 */
export type FetchLike = (url: string) => Promise<HttpResponse<any>>;

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

/** Opaque key segregating nonce pools (e.g. per CA origin or CA+account). */
type Namespace = string;

/** Nonce plus insertion timestamp for expiry / GC. */
type StampedNonce = { value: string; ts: number };

/** Outstanding `take()` requests waiting for a nonce. */
type PendingWaiter = {
  resolve: (v: string) => void;
  reject: (e: unknown) => void;
  timeout?: NodeJS.Timeout;
};

export class NonceManager {
  /** URL to call for fresh nonces. */
  private readonly newNonceUrl: string;
  private readonly fetch: FetchLike;
  private readonly maxAgeMs: number;
  private readonly maxPool: number;
  private readonly prefetchLowWater: number;
  private readonly prefetchHighWater: number;
  private readonly rateLimiter: RateLimiter;

  private pools = new Map<Namespace, StampedNonce[]>();
  private pending = new Map<Namespace, PendingWaiter[]>();

  /** Refill coalescing guard per namespace */
  private refilling = new Set<Namespace>();

  /** Cleanup flag to abort operations */
  private isCleanedUp = false;

  constructor(opts: NonceManagerOptions) {
    this.newNonceUrl = opts.newNonceUrl;
    debugNonce(
      'Initializing NonceManager: url=%s, maxPool=%d, prefetchLow=%d, prefetchHigh=%d',
      this.newNonceUrl,
      opts.maxPool ?? 32,
      opts.prefetchLowWater ?? 0,
      opts.prefetchHighWater ?? 0,
    );
    this.fetch = opts.fetch;
    // Keep default shorter to reduce badNonce churn; server nonces are short-lived
    this.maxAgeMs = opts.maxAgeMs ?? 120_000;
    this.maxPool = opts.maxPool ?? 32;
    this.prefetchLowWater = Math.max(0, opts.prefetchLowWater ?? 0);
    this.prefetchHighWater = Math.max(this.prefetchLowWater, opts.prefetchHighWater ?? 0);
    this.rateLimiter = opts.rateLimiter ?? new RateLimiter();
  }

  /**
   * Produce a namespace key. Recommended to include CA base + account (kid or JWK thumbprint).
   */
  static makeNamespace(namespace: string): Namespace {
    return namespace;
  }

  /**
   * Obtain a nonce. If the pool has a fresh one it is returned immediately; otherwise the
   * request is queued and a refill cycle started.
   */
  async take(namespace: Namespace): Promise<string> {
    this.gc(namespace);

    const pool = this.pools.get(namespace) ?? [];
    debugNonce('Taking nonce: namespace=%s, poolSize=%d', namespace, pool.length);

    while (pool.length) {
      const n = pool.pop()!;
      if (!this.isExpired(n.ts)) {
        this.pools.set(namespace, pool);
        debugNonce(
          'Returned cached nonce: namespace=%s, remainingInPool=%d',
          namespace,
          pool.length,
        );
        return n.value;
      }
    }

    debugNonce('No cached nonce available, queueing request: namespace=%s', namespace);
    return new Promise<string>((resolve, reject) => {
      if (this.isCleanedUp) {
        reject(new Error('NonceManager has been cleaned up'));
        return;
      }

      const q = this.pending.get(namespace) ?? [];

      const waiter: PendingWaiter = {
        resolve: (v) => {
          if (waiter.timeout) clearTimeout(waiter.timeout);
          resolve(v);
        },
        reject: (e) => {
          if (waiter.timeout) clearTimeout(waiter.timeout);
          reject(e);
        },
      };

      const timeoutMs = 30_000;
      waiter.timeout = setTimeout(() => {
        const current = this.pending.get(namespace) ?? [];
        const idx = current.indexOf(waiter);
        if (idx >= 0) {
          current.splice(idx, 1);
          current.length ? this.pending.set(namespace, current) : this.pending.delete(namespace);
        }
        waiter.reject(
          new Error(`Nonce request timeout after ${timeoutMs}ms for namespace: ${namespace}`),
        );
      }, timeoutMs);

      q.push(waiter);
      this.pending.set(namespace, q);
      debugNonce('Queued nonce request: namespace=%s, queueLength=%d', namespace, q.length);
      void this.runRefill(namespace);
    });
  }

  /**
   * Harvest nonce(s) from an ACME response (Replay-Nonce header). Supports folded / multi headers.
   */
  private putFromResponse(namespace: Namespace, res: HttpResponse<any>): void {
    const raw = res.headers['replay-nonce'] || res.headers['Replay-Nonce'];
    if (!raw) return;

    if (Array.isArray(raw)) {
      for (const n of raw) this.add(namespace, n);
    } else {
      this.add(namespace, raw);
    }

    this.drain(namespace);
  }

  /**
   * Execute an ACME request with automatic retry on `badNonce`.
   * The last response (even if badNonce) is returned if retries are exhausted.
   */
  public async withNonceRetry<T>(
    namespace: Namespace,
    fn: (nonce: string) => Promise<HttpResponse<T>>,
    maxAttempts = 3,
  ): Promise<HttpResponse<T>> {
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const nonce = await this.take(namespace);
      const res = await fn(nonce);

      this.putFromResponse(namespace, res);

      debugNonce(
        'Attempt %d: HTTP %d (pool size %d)',
        attempt,
        res.status,
        this.getPoolSize(namespace),
      );

      // Success (2xx/3xx)
      if (res.status >= 200 && res.status < 400) {
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

    throw lastErr ?? new ServerInternalError('Nonce retry exhausted');
  }

  /** Extract a single Replay-Nonce header (accept arrays and pick the last). */
  private nonceExtractor(res: HttpResponse<any>): string {
    const raw = res.headers['replay-nonce'] || res.headers['Replay-Nonce'];
    if (!raw) {
      throw new ServerInternalError('newNonce: missing Replay-Nonce header');
    }
    if (Array.isArray(raw)) {
      const last = raw[raw.length - 1];
      if (!last) throw new ServerInternalError('newNonce: empty Replay-Nonce array');
      return last;
    }
    return raw;
  }

  /** Perform network request for a fresh nonce and store it. */
  private async fetchNewNonce(namespace: Namespace): Promise<string> {
    debugNonce('Fetching new nonce: namespace=%s, url=%s', namespace, this.newNonceUrl);

    return this.rateLimiter.executeWithRateLimit(async () => {
      const res = await this.fetch(this.newNonceUrl);
      debugNonce('Fetched new nonce from %s: HTTP %d', this.newNonceUrl, res.status);

      if (!res.status || res.status < 200 || res.status >= 400) {
        // Bubble up 503/429 details so RateLimiter can parse headers
        if (res.status === 503 || res.status === 429) {
          const error = new ServerInternalError(`newNonce failed: HTTP ${res.status}`);
          (error as any).status = res.status;
          (error as any).headers = res.headers;
          throw error;
        }
        throw new ServerInternalError(`newNonce failed: HTTP ${res.status}`);
      }

      const nonce = this.nonceExtractor(res);
      this.add(namespace, nonce);
      debugNonce(
        'Added nonce to pool: namespace=%s, poolSize=%d',
        namespace,
        this.getPoolSize(namespace),
      );
      return nonce;
    }, RateLimiter.getKnownEndpoints().NEW_NONCE);
  }

  /**
   * Satisfy as many pending waiters as currently possible with pooled nonces.
   * Triggers another refill if waiters remain unsatisfied.
   */
  private drain(namespace: Namespace): void {
    const q = this.pending.get(namespace);
    if (!q || q.length === 0) return;

    const pool = this.pools.get(namespace) ?? [];
    debugNonce('Draining namespace: %s, waiters=%d, poolSize=%d', namespace, q.length, pool.length);

    let drained = 0;
    while (q.length && pool.length) {
      const waiter = q.shift()!;
      const n = pool.pop()!;
      waiter.resolve(n.value);
      drained++;
    }
    this.pools.set(namespace, pool);
    debugNonce(
      'Drained %d waiters for namespace: %s, remaining waiters=%d, remaining pool=%d',
      drained,
      namespace,
      q.length,
      pool.length,
    );

    if (q.length) {
      this.pending.set(namespace, q);
      debugNonce('Still have waiters, scheduling refill for namespace: %s', namespace);
      setImmediate(() => void this.runRefill(namespace));
    } else {
      this.pending.delete(namespace);
      debugNonce('All waiters satisfied for namespace: %s', namespace);
    }
  }

  /**
   * Coalesced refill per namespace: only one refill loop runs concurrently per namespace.
   */
  private async runRefill(namespace: Namespace): Promise<void> {
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
   * Refill loop:
   *  - Fetch while there are waiters OR prefetch below lowWater.
   *  - Stop at highWater / maxPool / no-need.
   *  - Protect each iteration against failures: reject waiters on hard failure.
   */
  private async doRefill(namespace: Namespace): Promise<void> {
    debugNonce('Starting refill operation: namespace=%s', namespace);

    if (this.isCleanedUp) {
      debugNonce('Skipping refill operation - manager is cleaned up: namespace=%s', namespace);
      return;
    }

    const HARD_CAP = Math.max(8, this.maxPool);
    const refillTimeoutMs = 10_000;

    const core = (async () => {
      debugNonce('Refill loop starting: namespace=%s, HARD_CAP=%d', namespace, HARD_CAP);
      for (let i = 0; i < HARD_CAP; i++) {
        if (this.isCleanedUp) {
          debugNonce('Refill aborted due to cleanup: namespace=%s', namespace);
          return;
        }

        const queueNeed = this.pending.get(namespace)?.length ?? 0;
        const pool = this.pools.get(namespace) ?? [];
        const poolLen = pool.length;

        const needAnother =
          queueNeed > 0 || (this.prefetchLowWater > 0 && poolLen < this.prefetchLowWater);

        if (!needAnother) {
          debugNonce('No more nonces needed, breaking loop: namespace=%s', namespace);
          break;
        }
        if (this.prefetchHighWater > 0 && poolLen >= this.prefetchHighWater) {
          debugNonce(
            'High water reached, breaking loop: namespace=%s, poolLen=%d, highWater=%d',
            namespace,
            poolLen,
            this.prefetchHighWater,
          );
          break;
        }
        if (poolLen >= this.maxPool) {
          debugNonce(
            'Max pool reached, breaking loop: namespace=%s, poolLen=%d, maxPool=%d',
            namespace,
            poolLen,
            this.maxPool,
          );
          break;
        }

        try {
          await this.fetchNewNonce(namespace);
          this.drain(namespace);
        } catch (e) {
          // Rate limit: reject waiters with a clear message and stop
          if (e instanceof RateLimitError) {
            const q = this.pending.get(namespace) ?? [];
            this.pending.delete(namespace);
            for (const w of q) {
              w.reject(new Error(`Rate limit exceeded for nonce requests: ${e.message}`));
            }
            throw e;
          }

          // Other failures: reject all waiters and stop
          const q = this.pending.get(namespace) ?? [];
          this.pending.delete(namespace);
          for (const w of q) w.reject(e);
          throw e;
        }
      }

      // Final drain for any new waiters queued during last fetch
      this.drain(namespace);
    })();

    // Guarded by timeout so we don't leave hanging waiters
    let timeoutId: NodeJS.Timeout | undefined;
    const watchdog = new Promise<void>((_, reject) => {
      timeoutId = setTimeout(() => {
        const q = this.pending.get(namespace) ?? [];
        this.pending.delete(namespace);
        for (const w of q) {
          w.reject(
            new Error(
              `Nonce refill timeout after ${refillTimeoutMs}ms for namespace: ${namespace}`,
            ),
          );
        }
        reject(new Error(`Nonce refill operation timed out after ${refillTimeoutMs}ms`));
      }, refillTimeoutMs);
    });

    try {
      await Promise.race([core, watchdog]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  /** Insert a nonce into the pool (deduplicated, size-bounded). */
  private add(namespace: Namespace, value: string): void {
    const pool = this.pools.get(namespace) ?? [];
    if (!pool.some((n) => n.value === value)) {
      pool.push({ value, ts: Date.now() });
      if (pool.length > this.maxPool) {
        pool.splice(0, pool.length - this.maxPool);
      }
      this.pools.set(namespace, pool);
    }
  }

  /** Remove expired nonces for the namespace (time-based GC). */
  private gc(namespace: Namespace): void {
    const pool = this.pools.get(namespace);
    if (!pool) return;

    const now = Date.now();
    const alive = pool.filter((n) => now - n.ts <= this.maxAgeMs);
    if (alive.length !== pool.length) {
      this.pools.set(namespace, alive);
    }
  }

  /** True if timestamp is older than maxAgeMs. */
  private isExpired(ts: number): boolean {
    return Date.now() - ts > this.maxAgeMs;
  }

  /** Current pool size (diagnostics / metrics). */
  public getPoolSize(namespace: Namespace): number {
    return (this.pools.get(namespace) ?? []).length;
  }

  /**
   * Cleanup all resources and reject pending operations.
   * Useful for testing or graceful shutdown.
   */
  public cleanup(): void {
    debugNonce('Cleaning up NonceManager resources');

    this.isCleanedUp = true;

    // Reject all pending waiters (and clear their individual timeouts)
    for (const [namespace, waiters] of this.pending.entries()) {
      debugNonce('Rejecting %d pending waiters for namespace: %s', waiters.length, namespace);
      for (const waiter of waiters) {
        if (waiter.timeout) clearTimeout(waiter.timeout);
        waiter.reject(new Error('NonceManager cleanup - operation cancelled'));
      }
    }

    this.pending.clear();
    this.pools.clear();
    this.refilling.clear();

    debugNonce('NonceManager cleanup completed');
  }
}
