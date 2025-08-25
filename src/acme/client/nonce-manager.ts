import { coalesceAsync } from 'promise-coalesce';
import { BadNonceError, ServerInternalError } from '../errors/errors.js';
import { createErrorFromProblem } from '../errors/factory.js';
import type { HttpResponse } from '../http/http-client.js';
import { safeReadBody } from '../utils.js';

export type FetchLike = (url: string) => Promise<HttpResponse<any>>;

export interface NonceManagerOptions {
  /** Full URL of the newNonce endpoint (from directory), e.g. https://acme-v02.api.letsencrypt.org/acme/new-nonce */
  newNonceUrl: string;
  /** fetch-compatible function (node: globalThis.fetch / undici fetch) */
  fetch: FetchLike;
  /** How long to keep nonces, ms (protection against "stale" nonces); default: 5 minutes */
  maxAgeMs?: number;
  /** Maximum pool size per namespace; default: 32 */
  maxPool?: number;
  /** Optional low-water mark for prefetch; if > 0, refill keeps pool at least this size */
  prefetchLowWater?: number;
  /** Optional high-water target for prefetch; if set, refill tries to fill up to this size */
  prefetchHighWater?: number;
  /** Optional logger */
  log?: (msg: string, ...args: unknown[]) => void;
}

/** One pool per namespace (typically: CA base + account KID/JWK thumbprint) */
type Namespace = string;

type StampedNonce = { value: string; ts: number };
type PendingWaiter = { resolve: (v: string) => void; reject: (e: unknown) => void };

export class NonceManager {
  private readonly newNonceUrl: string;
  private readonly fetch: FetchLike;
  private readonly maxAgeMs: number;
  private readonly maxPool: number;
  private readonly prefetchLowWater: number;
  private readonly prefetchHighWater: number;
  private readonly log: (msg: string, ...args: unknown[]) => void;

  private pools = new Map<Namespace, StampedNonce[]>();
  private pending = new Map<Namespace, PendingWaiter[]>();

  constructor(opts: NonceManagerOptions) {
    this.newNonceUrl = opts.newNonceUrl;
    this.fetch = opts.fetch;
    this.maxAgeMs = opts.maxAgeMs ?? 5 * 60_000;
    this.maxPool = opts.maxPool ?? 32;
    this.prefetchLowWater = Math.max(0, opts.prefetchLowWater ?? 0);
    this.prefetchHighWater = Math.max(this.prefetchLowWater, opts.prefetchHighWater ?? 0);
    this.log = opts.log ?? (() => { });
  }

  /** Normalized namespace key: create your own strategy. */
  static makeNamespace(caUrl: string): Namespace {
    return new URL(caUrl).origin;
  }

  async take(namespace: Namespace): Promise<string> {
    this.gc(namespace);

    const pool = this.pools.get(namespace) ?? [];

    while (pool.length) {
      const n = pool.pop()!;
      if (!this.isExpired(n.ts)) {
        this.pools.set(namespace, pool);
        return n.value;
      }
    }

    return new Promise<string>((resolve, reject) => {
      const q = this.pending.get(namespace) ?? [];
      q.push({ resolve, reject });
      this.pending.set(namespace, q);
      void this.runRefill(namespace);
    });
  }

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

  private async fetchNewNonce(namespace: Namespace): Promise<string> {
    const res = await this.fetch(this.newNonceUrl);
    this.log(`Fetched new nonce from ${this.newNonceUrl}: HTTP ${res.status}`);
    if (!res.status || res.status < 200 || res.status >= 400) {
      throw new ServerInternalError(`newNonce failed: HTTP ${res.status}`);
    }
    const nonce = this.nonceExtractor(res);
    this.add(namespace, nonce);
    return nonce;
  }

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

  private gc(namespace: Namespace): void {
    const pool = this.pools.get(namespace);
    if (!pool) return;

    const now = Date.now();
    const alive = pool.filter((n) => now - n.ts <= this.maxAgeMs);
    if (alive.length !== pool.length) {
      this.pools.set(namespace, alive);
    }
  }

  private isExpired(ts: number): boolean {
    return Date.now() - ts > this.maxAgeMs;
  }

  public getPoolSize(namespace: Namespace): number {
    return (this.pools.get(namespace) ?? []).length;
  }
}
