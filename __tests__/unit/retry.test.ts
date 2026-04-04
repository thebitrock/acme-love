import { describe, it, expect } from '@jest/globals';
import {
  calculateRetryDelay,
  isRetryableError,
  getRetryAfterMs,
  sleep,
  withRetry,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from '../../src/lib/transport/retry.js';

describe('isRetryableError', () => {
  it('returns true for retryable status codes', () => {
    for (const code of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableError({ statusCode: code })).toBe(true);
    }
  });

  it('returns false for non-retryable status codes', () => {
    for (const code of [400, 401, 403, 404, 405, 422]) {
      expect(isRetryableError({ statusCode: code })).toBe(false);
    }
  });

  it('returns true for retryable network error codes', () => {
    for (const code of [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'UND_ERR_SOCKET',
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_BODY_TIMEOUT',
    ]) {
      expect(isRetryableError({ code })).toBe(true);
    }
  });

  it('returns false for non-retryable error codes', () => {
    expect(isRetryableError({ code: 'EACCES' })).toBe(false);
    expect(isRetryableError({ code: 'ENOENT' })).toBe(false);
  });

  it('returns false for null, undefined, strings, numbers', () => {
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
    expect(isRetryableError('error')).toBe(false);
    expect(isRetryableError(42)).toBe(false);
  });

  it('returns false for plain Error without code/statusCode', () => {
    expect(isRetryableError(new Error('oops'))).toBe(false);
  });
});

describe('getRetryAfterMs', () => {
  it('parses integer seconds', () => {
    expect(getRetryAfterMs({ 'retry-after': '120' })).toBe(120_000);
  });

  it('parses zero seconds', () => {
    expect(getRetryAfterMs({ 'retry-after': '0' })).toBe(0);
  });

  it('returns null for missing header', () => {
    expect(getRetryAfterMs({})).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getRetryAfterMs({ 'retry-after': '' })).toBeNull();
  });

  it('handles array header value', () => {
    expect(getRetryAfterMs({ 'retry-after': ['60', '120'] })).toBe(60_000);
  });

  it('parses HTTP date string', () => {
    const future = new Date(Date.now() + 10_000);
    const result = getRetryAfterMs({ 'retry-after': future.toUTCString() });
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(10_500);
  });

  it('returns 0 for past date', () => {
    const past = new Date(Date.now() - 60_000);
    const result = getRetryAfterMs({ 'retry-after': past.toUTCString() });
    expect(result).toBe(0);
  });
});

describe('calculateRetryDelay', () => {
  const config: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30_000,
    backoffFactor: 2,
    jitterPercent: 0.1,
    respectRetryAfter: true,
  };

  it('uses Retry-After when respectRetryAfter is true', () => {
    expect(calculateRetryDelay(0, config, 5000)).toBe(5000);
  });

  it('caps Retry-After at maxDelayMs', () => {
    expect(calculateRetryDelay(0, config, 999_999)).toBe(30_000);
  });

  it('ignores Retry-After when respectRetryAfter is false', () => {
    const noRetryAfter = { ...config, respectRetryAfter: false };
    const delay = calculateRetryDelay(0, noRetryAfter, 5000);
    // Should use exponential backoff, not 5000
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(1100); // 1000 + 10% jitter
  });

  it('increases delay exponentially', () => {
    const noJitter = { ...config, jitterPercent: 0 };
    expect(calculateRetryDelay(0, noJitter)).toBe(1000);
    expect(calculateRetryDelay(1, noJitter)).toBe(2000);
    expect(calculateRetryDelay(2, noJitter)).toBe(4000);
  });

  it('caps delay at maxDelayMs', () => {
    const noJitter = { ...config, jitterPercent: 0 };
    expect(calculateRetryDelay(10, noJitter)).toBe(30_000);
  });

  it('adds jitter within bounds', () => {
    const delays = Array.from({ length: 50 }, () => calculateRetryDelay(0, config));
    const min = Math.min(...delays);
    const max = Math.max(...delays);
    // base=1000, jitter 10% → range [900, 1100]
    expect(min).toBeGreaterThanOrEqual(900);
    expect(max).toBeLessThanOrEqual(1100);
  });

  it('returns non-negative delay when exponential is small', () => {
    const tiny = { ...config, baseDelayMs: 1, jitterPercent: 0.5 };
    const delay = calculateRetryDelay(0, tiny);
    expect(delay).toBeGreaterThanOrEqual(0);
  });
});

describe('sleep', () => {
  it('resolves after delay', async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});

describe('DEFAULT_RETRY_CONFIG', () => {
  it('has expected defaults', () => {
    expect(DEFAULT_RETRY_CONFIG).toEqual({
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30_000,
      backoffFactor: 2,
      jitterPercent: 0.1,
      respectRetryAfter: true,
    });
  });
});

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const result = await withRetry(async () => 'ok', { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
  });

  it('retries on retryable error and succeeds', async () => {
    let attempt = 0;
    const result = await withRetry(
      async () => {
        attempt++;
        if (attempt === 1) {
          const err: any = new Error('503');
          err.statusCode = 503;
          throw err;
        }
        return 'recovered';
      },
      { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5, jitterPercent: 0 },
    );
    expect(result).toBe('recovered');
    expect(attempt).toBe(2);
  });

  it('throws immediately on non-retryable error', async () => {
    let attempt = 0;
    await expect(
      withRetry(
        async () => {
          attempt++;
          const err: any = new Error('bad request');
          err.statusCode = 400;
          throw err;
        },
        { maxRetries: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('bad request');
    expect(attempt).toBe(1);
  });

  it('exhausts retries and throws last error', async () => {
    let attempt = 0;
    await expect(
      withRetry(
        async () => {
          attempt++;
          const err: any = new Error('timeout');
          err.statusCode = 503;
          throw err;
        },
        { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2, jitterPercent: 0 },
      ),
    ).rejects.toThrow('timeout');
    expect(attempt).toBe(3); // initial + 2 retries
  });

  it('extracts Retry-After from error headers', async () => {
    let attempt = 0;
    const result = await withRetry(
      async () => {
        attempt++;
        if (attempt === 1) {
          const err: any = new Error('503');
          err.statusCode = 503;
          err.headers = { 'retry-after': '1' };
          throw err;
        }
        return 'ok';
      },
      { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5, jitterPercent: 0, respectRetryAfter: true },
    );
    expect(result).toBe('ok');
    expect(attempt).toBe(2);
  });
});
