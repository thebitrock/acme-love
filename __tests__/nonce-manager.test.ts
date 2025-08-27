import { NonceManager, type NonceManagerOptions } from '../src/acme/client/nonce-manager.js';
import { RateLimiter } from '../src/acme/client/rate-limiter.js';
import type { HttpResponse } from '../src/acme/http/http-client.js';


// type MockResponse = {
//   status: number;
//   headers: Record<string, any>;
//   data?: any;
// };

// Returns a fetch that consumes the provided responses and then throws.
function makeFetchOnce(responses: HttpResponse<any>[]) {
  let i = 0;
  return async () => {
    if (i >= responses.length) {
      throw new Error("No more mock responses");
    }
    return responses[i++];
  };
}

// Returns a fetch that consumes the provided responses and then repeats the last one forever.
function makeFetchRepeatLast(responses: HttpResponse<any>[]) {
  let i = 0;
  return async () => {
    if (responses.length === 0) {
      throw new Error("No responses configured");
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
  return Object.assign(
    () => p,
    { cancel: () => rejectFn?.(new Error("fetch aborted")) }
  );
}

function makeOptions(
  fetchImpl: NonceManagerOptions["fetch"],
  extra?: Partial<NonceManagerOptions>
): NonceManagerOptions {
  return {
    newNonceUrl: "https://example.test/acme/new-nonce",
    fetch: fetchImpl,
    ...extra,
  };
}

describe("NonceManager", () => {
  const ns = "caBase::acctX";

  it("returns nonce from new-nonce response", async () => {
    const nm = new NonceManager(
      makeOptions(makeFetchOnce([{
        status: 200, headers: { "replay-nonce": "nonceA" },
        data: undefined
      }]))
    );

    const nonce = await nm.take(ns);
    expect(nonce).toBe("nonceA");
    expect(nm.getPoolSize(ns)).toBe(0);
  });

  it("caches and reuses nonce from putFromResponse", async () => {
    const nm = new NonceManager(
      makeOptions(makeFetchOnce([{
        status: 200, headers: { "replay-nonce": "nonce1" },
        data: undefined
      }]))
    );

    // First take: fetches "nonce1"
    const n1 = await nm.take(ns);
    expect(n1).toBe("nonce1");

    // Simulate ACME response providing a new nonce
    (nm as any).putFromResponse(ns, { status: 200, headers: { "replay-nonce": "nonce2" }, data: {} });

    // Second take should use the cached "nonce2"
    const n2 = await nm.take(ns);
    expect(n2).toBe("nonce2");
  });

  it("withNonceRetry retries on badNonce once and then succeeds", async () => {
    const nm = new NonceManager(
      makeOptions(makeFetchRepeatLast([{
        status: 200, headers: { "replay-nonce": "nonceX" },
        data: undefined
      }]))
    );

    let attempt = 0;
    const res = await nm.withNonceRetry<{ type?: string; detail?: string; ok?: boolean }>(ns, async (_nonce) => {
      attempt++;
      if (attempt === 1) {
        // simulate ACME problem+json badNonce
        return {
          status: 400,
          headers: {
            "content-type": "application/problem+json",
            "replay-nonce": "nonceY", // server refreshes nonce in error response
          },
          data: {
            type: "urn:ietf:params:acme:error:badNonce",
            detail: "bad nonce",
          },
        };
      }
      return { status: 200, headers: {}, data: { ok: true } };
    });

    expect(attempt).toBe(2);
    expect(res.status).toBe(200);
    if (typeof res.data === "object" && res.data !== null && "ok" in res.data) {
      expect((res.data as { ok: boolean }).ok).toBe(true);
    } else {
      throw new Error("Response data missing ok property");
    }
  });

  it("withNonceRetry does not retry on non-badNonce problem", async () => {
    const nm = new NonceManager(
      makeOptions(makeFetchRepeatLast([{
        status: 200, headers: { "replay-nonce": "nonceZ" },
        data: undefined
      }]))
    );

    const res = await nm.withNonceRetry(ns, async () => {
      return {
        status: 400,
        headers: { "content-type": "application/problem+json" },
        data: { type: "urn:ietf:params:acme:error:other", detail: "some other error" },
      };
    });

    expect(res.status).toBe(400);
    expect(res.data.type).toBe("urn:ietf:params:acme:error:other");
  });

  it("gc removes expired nonces (without triggering network)", async () => {
    const nm = new NonceManager(
      makeOptions(makeFetchRepeatLast([{
        status: 200, headers: { "replay-nonce": "fresh" },
        data: undefined
      }]), {
        maxAgeMs: 1,
      })
    );

    // Manually prefill pool with an "old" nonce
    (nm as any).add(ns, "oldNonce");
    expect(nm.getPoolSize(ns)).toBe(1);

    // Wait for it to expire and run GC directly (avoid calling take(), which would fetch)
    await new Promise((r) => setTimeout(r, 2));
    (nm as any).gc(ns);

    expect(nm.getPoolSize(ns)).toBe(0);
  });

  it("prefetch fills pool up to high-water and then serves waiters", async () => {
    // First call returns a nonce; next calls repeat the last response → infinite supply.
    const nm = new NonceManager(
      makeOptions(
        makeFetchRepeatLast([{
          status: 200, headers: { "replay-nonce": "nonceA" },
          data: undefined
        }]),
        {
          maxPool: 10,
          prefetchLowWater: 2,
          prefetchHighWater: 5,
        }
      )
    );

    // Trigger a take → will fetch one and may prefill to ~high water
    const n = await nm.take(ns);
    expect(typeof n).toBe("string");

    // Give the refill loop a moment to run
    await new Promise((r) => setTimeout(r, 5));

    const size = nm.getPoolSize(ns);
    // Should be between lowWater and highWater depending on timing; at least 1 is expected.
    expect(size).toBeGreaterThanOrEqual(1);
    expect(size).toBeLessThanOrEqual(5);

    // Now take several and ensure they’re served from pool
    const n2 = await nm.take(ns);
    const n3 = await nm.take(ns);
    expect(typeof n2).toBe("string");
    expect(typeof n3).toBe("string");
  });

  it.skip("cleanup rejects pending waiters", async () => {
    // Hanging fetch keeps the waiter pending until cleanup is called
    const nm = new NonceManager(makeOptions(makeHangingFetch()));

    const p = nm.take(ns);
    // Give the code a tick to enqueue waiter and start refill
    await new Promise((r) => setImmediate(r));

    nm.cleanup();
    await expect(p).rejects.toThrow(/cleanup/i);
  });

  it.skip("rejects waiter when new-nonce fails with 5xx beyond retries", async () => {
    // Configure rate limiter to give up quickly: maxRetries=1 → total 2 attempts.
    const rateLimiter = new RateLimiter({ maxRetries: 1, baseDelayMs: 1, maxDelayMs: 5 });

    const nm = new NonceManager(
      makeOptions(
        makeFetchOnce([
          {
            status: 503, headers: {},
            data: undefined
          },
          {
            status: 503, headers: {},
            data: undefined
          },
        ]),
        { rateLimiter }
      )
    );

    await expect(nm.take(ns)).rejects.toThrow(/503|Rate limit exceeded|No more mock responses/);
  });
});
