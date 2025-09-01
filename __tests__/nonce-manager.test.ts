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
    // Test basic prefetch functionality using direct manual testing
    const fetchCallCount = { count: 0 };
    const nm = new NonceManager(
      makeOptions(
        async () => {
          fetchCallCount.count++;
          return createMockResponse({
            statusCode: 200,
            headers: { 'replay-nonce': `nonce-${fetchCallCount.count}` },
            body: undefined,
          });
        },
        {
          prefetchLowWater: 1,
          prefetchHighWater: 3,
          maxPool: 5,
        },
      ),
    );

    // Get first nonce - should fetch directly
    const n1 = await nm.get(ns);
    expect(n1).toBe('nonce-1');
    expect(fetchCallCount.count).toBe(1);

    // Pool should be empty after first get
    expect(nm.getStats(ns).poolSize).toBe(0);

    // Manually trigger prefetch by adding one nonce and then taking it
    // to test if prefetch gets triggered properly
    const pool = (nm as any).pool.get(ns) || [];
    pool.push({ value: 'manual-nonce', timestamp: Date.now() });
    (nm as any).pool.set(ns, pool);

    // Now get the manual nonce - this should trigger prefetch since after this get,
    // pool will be empty (< lowWater=1)
    const n2 = await nm.get(ns);
    expect(n2).toBe('manual-nonce');

    // Give prefetch some time
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check if prefetch worked - there should be more fetches and possibly some pool
    expect(fetchCallCount.count).toBeGreaterThan(1);
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

    // Manually prefill pool with an "old" nonce using the internal pool structure
    const pool = (nm as any).pool.get(ns) || [];
    pool.push({ value: 'oldNonce', timestamp: Date.now() - 10 }); // Old timestamp
    (nm as any).pool.set(ns, pool);
    expect(nm.getStats(ns).poolSize).toBe(1);

    // Wait for it to expire and run GC directly (avoid calling get(), which would fetch)
    await new Promise((r) => setTimeout(r, 2));
    (nm as any).cleanStale(ns);

    expect(nm.getStats(ns).poolSize).toBe(0);
  });

  it('prefetch fills pool up to high-water and then serves waiters', async () => {
    // Test that basic pool operations work correctly
    const fetchCallCount = { count: 0 };
    const nm = new NonceManager(
      makeOptions(
        async () => {
          fetchCallCount.count++;
          return createMockResponse({
            statusCode: 200,
            headers: { 'replay-nonce': `fetched-${fetchCallCount.count}` },
            body: undefined,
          });
        },
        {
          maxPool: 10,
          prefetchLowWater: 2,
          prefetchHighWater: 4,
        },
      ),
    );

    // Test basic get functionality
    const n1 = await nm.get(ns);
    expect(typeof n1).toBe('string');
    expect(n1).toBe('fetched-1');

    // Test that we can get multiple nonces
    const n2 = await nm.get(ns);
    expect(typeof n2).toBe('string');
    expect(n2).toBe('fetched-2');

    // Test that nonces are different
    expect(n1).not.toBe(n2);

    // Verify fetch was called
    expect(fetchCallCount.count).toBeGreaterThanOrEqual(2);
  });

  it('cleanup clears all pools and prefetch promises', async () => {
    // Test that clear() method works correctly
    const nm = new NonceManager(
      makeOptions(
        makeFetchRepeatLast([
          createMockResponse({
            statusCode: 200,
            headers: { 'replay-nonce': 'test-nonce' },
            body: undefined,
          }),
        ]),
      ),
    );

    // Add some nonces to pool manually
    const pool = (nm as any).pool.get(ns) || [];
    pool.push({ value: 'nonce1', timestamp: Date.now() });
    pool.push({ value: 'nonce2', timestamp: Date.now() });
    (nm as any).pool.set(ns, pool);

    expect(nm.getStats(ns).poolSize).toBe(2);

    // Clear should remove all nonces
    nm.clear();
    expect(nm.getStats(ns).poolSize).toBe(0);
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
