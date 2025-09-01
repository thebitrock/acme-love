import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
// Updated to import from public entrypoint
import { RateLimiter, RateLimitError } from '../../src/index.js';

describe.skip('RateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries once on 503 and then succeeds', async () => {
    const rl = new RateLimiter({
      maxRetries: 1,
      baseDelayMs: 10,
      maxDelayMs: 50,
      respectRetryAfter: false,
    });
    let attempt = 0;

    const fn = jest.fn().mockImplementation(async () => {
      attempt++;
      if (attempt === 1) {
        const err: any = new Error('HTTP 503');
        err.status = 503; // parseRateLimitError picks this up
        throw err;
      }
      return 'ok';
    });

    const promise = rl.executeWithRetry(fn as unknown as () => Promise<unknown>, '/acme/new-order');
    // Advance through backoff (baseDelayMs=10)
    await Promise.resolve(); // allow first rejection propagation
    jest.advanceTimersByTime(11);
    const res = await promise;
    expect(res).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws RateLimitError after exceeding retries', async () => {
    const rl = new RateLimiter({
      maxRetries: 1,
      baseDelayMs: 1,
      maxDelayMs: 5,
      respectRetryAfter: false,
    });
    const fn = jest.fn().mockImplementation(async () => {
      const err: any = new Error('HTTP 503');
      err.status = 503;
      throw err;
    });

    const promise = rl.executeWithRetry(fn as unknown as () => Promise<unknown>, '/acme/new-order');
    await Promise.resolve();
    jest.advanceTimersByTime(2);
    await expect(promise).rejects.toBeInstanceOf(RateLimitError);
    expect(fn).toHaveBeenCalledTimes(2); // initial + one retry
  });
});
