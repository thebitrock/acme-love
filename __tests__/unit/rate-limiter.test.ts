import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { RateLimiter, RateLimitError } from '../../src/index.js';

describe('RateLimiter', () => {
  // Clean up any pending timers from recordRateLimit
  const instances: RateLimiter[] = [];
  function createRL(opts?: ConstructorParameters<typeof RateLimiter>[0]) {
    const rl = new RateLimiter(opts);
    instances.push(rl);
    return rl;
  }
  afterEach(() => {
    for (const rl of instances) rl.clear();
    instances.length = 0;
  });

  it('retries once on 503 and then succeeds', async () => {
    const rl = createRL({
      maxRetries: 1,
      baseDelayMs: 1,
      maxDelayMs: 5,
      respectRetryAfter: false,
    });
    let attempt = 0;

    const fn = jest.fn().mockImplementation(async () => {
      attempt++;
      if (attempt === 1) {
        const err: any = new Error('HTTP 503');
        err.status = 503;
        throw err;
      }
      return 'ok';
    });

    const res = await rl.executeWithRetry(
      fn as unknown as () => Promise<unknown>,
      '/acme/new-order',
    );
    expect(res).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws RateLimitError after exceeding retries', async () => {
    const rl = createRL({
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

    await expect(
      rl.executeWithRetry(fn as unknown as () => Promise<unknown>, '/acme/new-order'),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-rate-limit errors', async () => {
    const rl = createRL({ maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });
    const fn = jest.fn().mockRejectedValue(new Error('network failure'));

    await expect(
      rl.executeWithRetry(fn as unknown as () => Promise<unknown>, '/test'),
    ).rejects.toThrow('network failure');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('detects rate limit from HTTP 429 status', async () => {
    const rl = createRL({ maxRetries: 0, baseDelayMs: 1, maxDelayMs: 5 });
    const fn = jest.fn().mockImplementation(async () => {
      const err: any = new Error('HTTP 429');
      err.status = 429;
      throw err;
    });

    await expect(
      rl.executeWithRetry(fn as unknown as () => Promise<unknown>, '/test'),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('detects rate limit from error message containing "rate limit"', async () => {
    const rl = createRL({ maxRetries: 0, baseDelayMs: 1, maxDelayMs: 5 });
    const fn = jest.fn().mockRejectedValue(new Error('Rate limit exceeded'));

    await expect(
      rl.executeWithRetry(fn as unknown as () => Promise<unknown>, '/test'),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('detects rate limit from "too many" in error message', async () => {
    const rl = createRL({ maxRetries: 0, baseDelayMs: 1, maxDelayMs: 5 });
    const fn = jest.fn().mockRejectedValue(new Error('Too many requests'));

    await expect(
      rl.executeWithRetry(fn as unknown as () => Promise<unknown>, '/test'),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('detects rate limit from response.status nested property', async () => {
    const rl = createRL({ maxRetries: 0, baseDelayMs: 1, maxDelayMs: 5 });
    const fn = jest.fn().mockImplementation(async () => {
      const err: any = new Error('fail');
      err.response = { status: 429 };
      throw err;
    });

    await expect(
      rl.executeWithRetry(fn as unknown as () => Promise<unknown>, '/test'),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('extracts retryAfter from error.retryAfter number', async () => {
    const rl = createRL({ maxRetries: 0, baseDelayMs: 1, maxDelayMs: 5 });
    const fn = jest.fn().mockImplementation(async () => {
      const err: any = new Error('rate limit');
      err.retryAfter = 30;
      throw err;
    });

    try {
      await rl.executeWithRetry(fn as unknown as () => Promise<unknown>, '/test');
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      const rle = e as RateLimitError;
      expect(rle.rateLimitInfo.retryAfter).toBe(30);
    }
  });

  it('extracts retryAfter from error.retryAfter string', async () => {
    const rl = createRL({ maxRetries: 0, baseDelayMs: 1, maxDelayMs: 5 });
    const fn = jest.fn().mockImplementation(async () => {
      const err: any = new Error('rate limit');
      err.retryAfter = '60';
      throw err;
    });

    try {
      await rl.executeWithRetry(fn as unknown as () => Promise<unknown>, '/test');
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      const rle = e as RateLimitError;
      expect(rle.rateLimitInfo.retryAfter).toBe(60);
    }
  });

  it('extracts retryAfter from headers retry-after', async () => {
    const rl = createRL({ maxRetries: 0, baseDelayMs: 1, maxDelayMs: 5 });
    const fn = jest.fn().mockImplementation(async () => {
      const err: any = new Error('rate limit');
      err.headers = { 'retry-after': '120' };
      throw err;
    });

    try {
      await rl.executeWithRetry(fn as unknown as () => Promise<unknown>, '/test');
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      const rle = e as RateLimitError;
      expect(rle.rateLimitInfo.retryAfter).toBe(120);
    }
  });

  it('extracts retryAfter from response.headers', async () => {
    const rl = createRL({ maxRetries: 0, baseDelayMs: 1, maxDelayMs: 5 });
    const fn = jest.fn().mockImplementation(async () => {
      const err: any = new Error('rate limit');
      err.response = { headers: { 'retry-after': '45' } };
      throw err;
    });

    try {
      await rl.executeWithRetry(fn as unknown as () => Promise<unknown>, '/test');
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      const rle = e as RateLimitError;
      expect(rle.rateLimitInfo.retryAfter).toBe(45);
    }
  });

  it('recordRateLimit and getRateLimitStatus round-trip', () => {
    const rl = createRL();
    rl.recordRateLimit('/test', 60);
    const status = rl.getRateLimitStatus('/test');
    expect(status.isLimited).toBe(true);
    expect(status.retryAfter).toBeDefined();
  });

  it('getRateLimitStatus returns not limited for unknown endpoint', () => {
    const rl = createRL();
    const status = rl.getRateLimitStatus('/unknown');
    expect(status.isLimited).toBe(false);
    expect(status.retryAfter).toBeUndefined();
  });

  it('clearRateLimit clears specific endpoint', () => {
    const rl = createRL();
    rl.recordRateLimit('/test', 60);
    rl.clearRateLimit('/test');
    const status = rl.getRateLimitStatus('/test');
    expect(status.isLimited).toBe(false);
  });

  it('clear() clears all state', () => {
    const rl = createRL();
    rl.recordRateLimit('/a', 60);
    rl.recordRateLimit('/b', 60);
    rl.clear();
    expect(rl.getRateLimitStatus('/a').isLimited).toBe(false);
    expect(rl.getRateLimitStatus('/b').isLimited).toBe(false);
  });

  it('getStatus returns rate limited endpoints', () => {
    const rl = createRL();
    rl.recordRateLimit('/limited', 60);
    const status = rl.getStatus();
    expect(status.rateLimitedEndpoints).toContain('/limited');
    expect(status.nextAvailable).toBeDefined();
    expect(status.nextAvailable).toBeGreaterThan(Date.now());
  });

  it('getStatus returns empty when no limits', () => {
    const rl = createRL();
    const status = rl.getStatus();
    expect(status.rateLimitedEndpoints).toEqual([]);
    expect(status.nextAvailable).toBeNull();
  });

  it('getKnownEndpoints returns endpoint map', () => {
    const endpoints = RateLimiter.getKnownEndpoints();
    expect(endpoints.NEW_ORDER).toBe('/acme/new-order');
    expect(endpoints.NEW_ACCOUNT).toBe('/acme/new-account');
    expect(endpoints.NEW_NONCE).toBe('/acme/new-nonce');
    expect(endpoints.REVOKE_CERT).toBe('/acme/revoke-cert');
    expect(endpoints.DIRECTORY).toBe('/directory');
  });

  it('acquire enforces minimum interval', async () => {
    const rl = createRL({ baseDelayMs: 1, maxDelayMs: 5 });
    // Two rapid acquires should both succeed (second may wait briefly)
    await rl.acquire('/test');
    await rl.acquire('/test');
  });

  it('succeeds on first try without retry', async () => {
    const rl = createRL({ maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });
    const fn = jest.fn().mockResolvedValue('success');

    const result = await rl.executeWithRetry(fn as unknown as () => Promise<unknown>, '/test');
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries multiple times before success', async () => {
    const rl = createRL({ maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });
    let attempt = 0;
    const fn = jest.fn().mockImplementation(async () => {
      attempt++;
      if (attempt <= 2) {
        const err: any = new Error('HTTP 503');
        err.status = 503;
        throw err;
      }
      return 'finally';
    });

    const result = await rl.executeWithRetry(fn as unknown as () => Promise<unknown>, '/test');
    expect(result).toBe('finally');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('RateLimitError has correct properties', () => {
    const info = {
      endpoint: '/test',
      retryAfter: 30,
      retryDelaySeconds: 30,
      attempts: 3,
    };
    const err = new RateLimitError('test error', info);
    expect(err.name).toBe('RateLimitError');
    expect(err.message).toBe('test error');
    expect(err.rateLimitInfo).toEqual(info);
    expect(err).toBeInstanceOf(Error);
  });
});
