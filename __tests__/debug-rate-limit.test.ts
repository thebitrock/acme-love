/**
 * Simple Rate Limit Test Debug
 */

import { jest } from '@jest/globals';
import { RateLimiter } from '../src/acme/client/rate-limiter.js';

describe('Debug Rate Limiter', () => {
  test('should handle simple rate limit case', async () => {
    const rateLimiter = new RateLimiter({
      maxRetries: 1, // Just 1 retry
      baseDelayMs: 10, // Fast for testing
    });

    let callCount = 0;
    const mockFn = jest.fn(async () => {
      callCount++;
      console.log(`Mock function called: ${callCount}`);

      const error = new Error('Rate limited');
      (error as any).status = 503;
      (error as any).headers = { 'retry-after': '1' };
      console.log('Throwing rate limit error with status 503');
      throw error;
    });

    console.log('Starting rate limit test...');

    try {
      await rateLimiter.executeWithRateLimit(mockFn, '/test-endpoint');
      console.log('Unexpected success');
    } catch (error: any) {
      console.log(`Caught expected error: ${error.constructor.name}: ${error.message}`);
      expect(error.constructor.name).toBe('RateLimitError');
    }

    console.log(`Mock function was called ${callCount} times`);
    expect(callCount).toBe(2); // Original + 1 retry
  });
});
