/**
 * ACME Nonce Manager
 * ------------------
 * RFC 8555 (ACME) requires every JWS request to the CA to include a fresh, unused nonce taken
 * from the CA via the "newNonce" endpoint (HEAD /acme/new-nonce). If a request reuses or provides
 * an expired nonce the server answers with an ACME problem document `badNonce` and the client
 * should retry with a fresh value.
 *
 * High‑performance ACME clients often pipeline or parallelize multiple requests; naively issuing
 * a network round‑trip (HEAD newNonce) before each signed request increases latency and amplifies
 * CA rate limits. This manager implements a small in‑memory nonce pool per *namespace* and an
 * adaptive refill strategy so callers can simply "take" a nonce when they need one and optionally
 * let the manager prefetch ahead of demand.
 *
 * Key features:
 *  - Namespace isolation (e.g. per CA origin OR origin+account) to avoid cross‑account reuse.
 *  - Opportunistic prefetch with configurable low/high water marks.
 *  - Coalesced concurrent refills (multiple simultaneous consumers trigger only one network fetch).
 *  - Passive harvesting of nonces from normal ACME responses (Replay-Nonce header) to recycle
 *    what the server already gives back without extra calls.
 *  - Automatic garbage collection of stale nonces (protect against replay window / server expiry).
 *  - Retry helper that transparently handles `badNonce` errors while surfacing other problems.
 *
 * Not in scope:
 *  - Persistent storage (pool is in‑memory only).
 *  - Multi‑process / distributed coordination (each process manages its own pool).
 *
 * Thread‑safety / Concurrency:
 *  - Designed for single Node.js event loop; operations are atomic relative to microtasks.
 *  - Uses `promise-coalesce` to serialize refill loops per namespace key.
 *
 * Usage outline:
 *  ```ts
 *  const nm = new NonceManager({ newNonceUrl, fetch });
 *  const ns = NonceManager.makeNamespace(directoryUrl);
 *  const nonce = await nm.take(ns); // obtain a usable nonce
 *  // sign JWS with nonce ...
 *  const res = await http.post(...);
 *  // nm.withNonceRetry(namespace, signerFn) can be used to auto retry badNonce responses.
 *  ```
 */
import { coalesceAsync } from 'promise-coalesce';
import { BadNonceError, ServerInternalError } from '../errors/errors.js';
import { createErrorFromProblem } from '../errors/factory.js';
import type { HttpResponse } from '../http/http-client.js';
import { safeReadBody } from '../utils.js';
import { debugNonce } from '../debug.js';

/**
 * Minimal fetch‑like function signature returning an HttpResponse
 * (your implementation can wrap undici / node fetch / custom HTTP client).
 */
export type FetchLike = (url: string) => Promise<HttpResponse<any>>;

export interface NonceManagerOptions {
  /** Full URL of the ACME newNonce endpoint (absolute). */
  newNonceUrl: string;
  /** Fetch / HTTP function returning a structured response (status, headers, data). */
  fetch: FetchLike;
  /** Max nonce age (ms) before considered stale & discarded. Defaults to 5 minutes. */
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
  /** Optional logger function for diagnostics. */
  log?: (msg: string, ...args: unknown[]) => void;
}

/** Opaque key segregating nonce pools (e.g. per CA origin or CA+account). */
type Namespace = string;

/** Nonce plus insertion timestamp for expiry / GC. */
type StampedNonce = { value: string; ts: number };
/** Outstanding `take()` requests waiting for a nonce. */
type PendingWaiter = { resolve: (v: string) => void; reject: (e: unknown) => void };

export class NonceManager {
  /** URL to call for fresh nonces. */
  private readonly newNonceUrl: string;
  private readonly fetch: FetchLike;
  private readonly maxAgeMs: number;
  private readonly maxPool: number;
  private readonly prefetchLowWater: number;
  private readonly prefetchHighWater: number;
  private readonly log: (msg: string, ...args: unknown[]) => void;

  private pools = new Map<Namespace, StampedNonce[]>();
  private pending = new Map<Namespace, PendingWaiter[]>();

  /**
   * Create a new manager.
   * @param opts Configuration options (see NonceManagerOptions)
   */
  constructor(opts: NonceManagerOptions) {
    this.newNonceUrl = opts.newNonceUrl;
    debugNonce('Initializing NonceManager: url=%s, maxPool=%d, prefetchLow=%d, prefetchHigh=%d', 
      this.newNonceUrl, opts.maxPool ?? 32, opts.prefetchLowWater ?? 0, opts.prefetchHighWater ?? 0);
    this.fetch = opts.fetch;
    this.maxAgeMs = opts.maxAgeMs ?? 5 * 60_000;
    this.maxPool = opts.maxPool ?? 32;
    this.prefetchLowWater = Math.max(0, opts.prefetchLowWater ?? 0);
    this.prefetchHighWater = Math.max(this.prefetchLowWater, opts.prefetchHighWater ?? 0);
    this.log = opts.log ?? (() => { });
  }

  /**
   * Produce a namespace key from a CA directory URL.
   * You may augment this (e.g. append account key thumbprint) to isolate accounts.
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
        debugNonce('Returned cached nonce: namespace=%s, remainingInPool=%d', namespace, pool.length);
        return n.value;
      }
    }

    debugNonce('No cached nonce available, queueing request: namespace=%s', namespace);
    return new Promise<string>((resolve, reject) => {
      const q = this.pending.get(namespace) ?? [];
      q.push({ resolve, reject });
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
   * @param namespace Pool key.
   * @param fn Function that performs the HTTP request using the provided nonce.
   * @param maxAttempts Retry cap (default 3). Last response (even if badNonce) is returned.
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

      this.log(`Attempt ${attempt}: HTTP ${res.status} (pool size ${this.getPoolSize(namespace)})`);

      if (res.status >= 200 && res.status < 400) {
        return res;
      }

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

      if (attempt < maxAttempts) {
        continue;
      }
      return res;
    }

    throw lastErr ?? new ServerInternalError('Nonce retry exhausted');
  }

  /** Extract & validate a single Replay-Nonce header. */
  private nonceExtractor(res: HttpResponse<any>): string {
    const nonce = res.headers['replay-nonce'] || res.headers['Replay-Nonce'];
    if (!nonce) {
      throw new ServerInternalError('newNonce: missing Replay-Nonce header');
    }
    if (Array.isArray(nonce)) {
      throw new ServerInternalError('Multiple Replay-Nonce headers in response');
    }
    return nonce;
  }

  /** Perform network request for a fresh nonce and store it. */
  private async fetchNewNonce(namespace: Namespace): Promise<string> {
    debugNonce('Fetching new nonce: namespace=%s, url=%s', namespace, this.newNonceUrl);
    const res = await this.fetch(this.newNonceUrl);
    this.log(`Fetched new nonce from ${this.newNonceUrl}: HTTP ${res.status}`);
    debugNonce('Nonce fetch response: status=%d', res.status);
    if (!res.status || res.status < 200 || res.status >= 400) {
      throw new ServerInternalError(`newNonce failed: HTTP ${res.status}`);
    }
    const nonce = this.nonceExtractor(res);
    this.add(namespace, nonce);
    debugNonce('Added nonce to pool: namespace=%s, poolSize=%d', namespace, this.getPoolSize(namespace));
    return nonce;
  }

  /**
   * Satisfy as many pending waiters as currently possible with pooled nonces.
   * Triggers another refill if waiters remain unsatisfied.
   */
  private drain(namespace: Namespace): void {
    const q = this.pending.get(namespace);
    if (!q || q.length === 0) return;

    const pool = this.pools.get(namespace) ?? [];

    while (q.length && pool.length) {
      const waiter = q.shift()!;
      const n = pool.pop()!;
      waiter.resolve(n.value);
    }
    this.pools.set(namespace, pool);

    if (q.length) {
      this.pending.set(namespace, q);
      void this.runRefill(namespace);
    } else {
      this.pending.delete(namespace);
    }
  }

  /**
   * Refill loop with coalescing.
   * Strategy:
   *  - If there are pending waiters → fetch until all are served.
   *  - If prefetch is enabled → also top-up pool to prefetchHighWater (bounded by maxPool).
   *  - Hard-cap per run to avoid infinite loops on persistent server failure.
   */
  /**
   * Refill loop: coalesced so only one runs per namespace concurrently.
   * Conditions for fetching:
   *  - There are pending waiters OR pool below lowWater (if prefetch enabled).
   * Stops if: pool reaches highWater/maxPool or no further need.
   */
  private runRefill(namespace: Namespace): Promise<void> {
    const key = `nonce-refill:${namespace}`;
    return coalesceAsync(key, async () => {
      const HARD_CAP = Math.max(8, this.maxPool); // safety bound per run

      for (let i = 0; i < HARD_CAP; i++) {
        const queueNeed = (this.pending.get(namespace)?.length ?? 0);
        const pool = this.pools.get(namespace) ?? [];
        const poolLen = pool.length;

        // Determine if we need another fetch
        let needAnother =
          queueNeed > 0 ||
          (this.prefetchLowWater > 0 && poolLen < this.prefetchLowWater);

        if (!needAnother) break;

        // Also respect high-water (don’t overfill the pool)
        if (this.prefetchHighWater > 0 && poolLen >= this.prefetchHighWater) break;
        if (poolLen >= this.maxPool) break;

        try {
          await this.fetchNewNonce(namespace);
          this.drain(namespace);
        } catch (e) {
          // On failure, reject all waiters and stop
          const q = this.pending.get(namespace) ?? [];
          this.pending.delete(namespace);
          for (const w of q) w.reject(e);
          break;
        }
      }
    });
  }

  /** Insert a nonce into the pool (deduplicated, size‑bounded). */
  private add(namespace: Namespace, value: string): void {
    const pool = this.pools.get(namespace) ?? [];
    // Avoid duplicates (can happen when server returns multiple RN headers or concurrent calls land)
    if (!pool.some((n) => n.value === value)) {
      pool.push({ value, ts: Date.now() });
      // Trim to maxPool, keep the freshest
      if (pool.length > this.maxPool) {
        pool.splice(0, pool.length - this.maxPool);
      }
      this.pools.set(namespace, pool);
    }
  }

  /** Remove expired nonces for the namespace (time‑based GC). */
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
}
