import { NonceManager, type NonceManagerOptions } from '../src/lib/managers/nonce-manager.js';
import { RateLimiter } from '../src/lib/managers/rate-limiter.js';
import type { ParsedResponseData } from '../src/lib/transport/http-client.js';

// Helper to create complete ParsedResponseData mock objects
function createMockResponse(partial: {
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
}): ParsedResponseData {
  return {
    statusCode: partial.statusCode,
    headers: partial.headers,
    body: partial.body,
    trailers: {},
    opaque: null,
    context: {},
  };
}

// Returns a fetch that consumes the provided responses and then throws.
function makeFetchOnce(responses: ParsedResponseData[]) {
  let i = 0;
  return async () => {
    if (i >= responses.length) {
      throw new Error('No more mock responses');
    }
    return responses[i++];
  };
}

// Returns a fetch that consumes the provided responses and then repeats the last one forever.
function makeFetchRepeatLast(responses: ParsedResponseData[]) {
  let i = 0;
  return async () => {
    if (responses.length === 0) {
      throw new Error('No responses configured');
    }
    if (i < responses.length) {
      return responses[i++];
    }
    return responses[responses.length - 1];
  };
}

// Returns a fetch that never resolves (keeps waiters pending).
function makeHangingFetch() {
  let rejectFn: (e: any) => void;
  const p = new Promise<never>((_, reject) => {
    rejectFn = reject;
  });
  return Object.assign(() => p, { cancel: () => rejectFn?.(new Error('fetch aborted')) });
}

function makeOptions(
  fetchImpl: NonceManagerOptions['fetch'],
  extra?: Partial<NonceManagerOptions>,
): NonceManagerOptions {
  return {
    newNonceUrl: 'https://example.test/acme/new-nonce',
    fetch: fetchImpl,
    ...extra,
  };
}

describe('NonceManager', () => {
  const ns = 'caBase::acctX';

  it('returns nonce from new-nonce response', async () => {
    const nm = new NonceManager(
      makeOptions(
        makeFetchOnce([
          createMockResponse({
            statusCode: 200,
            headers: { 'replay-nonce': 'nonceA' },
            body: undefined,
          }),
        ]),
      ),
    );

    const nonce = await nm.get(ns); // Используем get() вместо take()
    expect(nonce).toBe('nonceA');
    expect(nm.getStats(ns).poolSize).toBe(0); // Используем getStats() вместо getPoolSize()
  });

  it('prefetches nonces automatically when pool is low', async () => {
    // Configure to trigger prefetch with low water mark
    const nm = new NonceManager(
      makeOptions(
        makeFetchRepeatLast([
          createMockResponse({
            statusCode: 200,
            headers: { 'replay-nonce': 'nonce1' },
            body: undefined,
          }),
          createMockResponse({
            statusCode: 200,
            headers: { 'replay-nonce': 'nonce2' },
            body: undefined,
          }),
          createMockResponse({
            statusCode: 200,
            headers: { 'replay-nonce': 'nonce3' },
            body: undefined,
          }),
        ]),
        {
          prefetchLowWater: 1,
          prefetchHighWater: 3,
          maxPool: 5,
        },
      ),
    );

    // First get: fetches "nonce1" directly (pool is empty)
    const n1 = await nm.get(ns);
    expect(n1).toBe('nonce1');

    // Should trigger prefetch since pool is now empty (< lowWater=1)
    // Give prefetch time to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Pool should have some nonces now from prefetch
    const stats = nm.getStats(ns);
    expect(stats.poolSize).toBeGreaterThan(0);
  });

  it('handles errors from fetch gracefully', async () => {
    // Test error handling when fetch fails
    const nm = new NonceManager(
      makeOptions(async () => {
        throw new Error('Network error');
      }),
    );

    await expect(nm.get(ns)).rejects.toThrow(/Network error/);
  });

  it('handles bad nonce responses gracefully', async () => {
    // Test when server returns success but no nonce header
    const nm = new NonceManager(
      makeOptions(
        makeFetchOnce([
          createMockResponse({
            statusCode: 200,
            headers: {}, // No replay-nonce header
            body: undefined,
          }),
        ]),
      ),
    );

    await expect(nm.get(ns)).rejects.toThrow(/No replay-nonce header/);
  });

  it('handles server errors gracefully', async () => {
    // Test when server returns error status
    const nm = new NonceManager(
      makeOptions(
        makeFetchOnce([
          createMockResponse({
            statusCode: 500,
            headers: { 'content-type': 'application/problem+json' },
            body: {
              type: 'urn:ietf:params:acme:error:serverInternal',
              detail: 'Internal server error',
            },
          }),
        ]),
      ),
    );

    await expect(nm.get(ns)).rejects.toThrow();
  });

  it('gc removes expired nonces (without triggering network)', async () => {
    const nm = new NonceManager(
      makeOptions(
        makeFetchRepeatLast([
          createMockResponse({
            statusCode: 200,
            headers: { 'replay-nonce': 'fresh' },
            body: undefined,
          }),
        ]),
        {
          maxAgeMs: 1,
        },
      ),
    );

    // Manually prefill pool with an "old" nonce
    (nm as any).add(ns, 'oldNonce');
    expect(nm.getStats(ns).poolSize).toBe(1);

    // Wait for it to expire and run GC directly (avoid calling get(), which would fetch)
    await new Promise((r) => setTimeout(r, 2));
    (nm as any).cleanStale(ns);

    expect(nm.getStats(ns).poolSize).toBe(0);
  });

  it('prefetch fills pool up to high-water and then serves waiters', async () => {
    // First call returns a nonce; next calls repeat the last response → infinite supply.
    const nm = new NonceManager(
      makeOptions(
        makeFetchRepeatLast([
          createMockResponse({
            statusCode: 200,
            headers: { 'replay-nonce': 'nonceA' },
            body: undefined,
          }),
        ]),
        {
          maxPool: 10,
          prefetchLowWater: 1,
          prefetchHighWater: 3,
        },
      ),
    );

    // Trigger a get → will fetch one directly
    const n = await nm.get(ns);
    expect(typeof n).toBe('string');

    // Give the prefetch loop a moment to run (triggered because pool becomes empty < lowWater)
    await new Promise((r) => setTimeout(r, 200));

    const size = nm.getStats(ns).poolSize;
    // Should have prefetched nonces in the pool
    expect(size).toBeGreaterThanOrEqual(1);
    expect(size).toBeLessThanOrEqual(3);

    // Now get several and ensure they're served from pool
    const n2 = await nm.get(ns);
    const n3 = await nm.get(ns);
    expect(typeof n2).toBe('string');
    expect(typeof n3).toBe('string');
  });

  it('cleanup rejects pending waiters', async () => {
    // Hanging fetch keeps the waiter pending until cleanup is called
    const nm = new NonceManager(makeOptions(makeHangingFetch()));

    const p = nm.get(ns);
    // Give the code a tick to enqueue waiter and start refill
    await new Promise((r) => setImmediate(r));

    nm.clear();
    await expect(p).rejects.toThrow(/cleanup/i);
  });

  it('rejects waiter when new-nonce fails with 5xx beyond retries', async () => {
    // Configure rate limiter to give up quickly: maxRetries=1 → total 2 attempts.
    const rateLimiter = new RateLimiter({ maxRetries: 1, baseDelayMs: 1, maxDelayMs: 5 });

    const nm = new NonceManager(
      makeOptions(
        makeFetchOnce([
          createMockResponse({
            statusCode: 503,
            headers: {},
            body: undefined,
          }),
          createMockResponse({
            statusCode: 503,
            headers: {},
            body: undefined,
          }),
        ]),
        { rateLimiter },
      ),
    );

    await expect(nm.get(ns)).rejects.toThrow(/503|Rate limit exceeded|No more mock responses/);
  });
});
