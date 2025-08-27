/**
 * Rate Limiting Tests
 * ------------------
 * Tests for handling Let's Encrypt rate limits to ensure we don't hit API limitations
 * and can recover gracefully from rate limit errors.
 */

import { jest } from '@jest/globals';
import { NonceManager } from '../src/acme/client/nonce-manager.js';
import { RateLimiter, RateLimitError } from '../src/acme/client/rate-limiter.js';

describe('ACME Rate Limiting Tests', () => {
  let mockFetch: jest.MockedFunction<any>;
  let nonceManager: NonceManager;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockFetch = jest.fn();
    rateLimiter = new RateLimiter({
      maxRetries: 2,
      baseDelayMs: 100, // Faster for testing
      maxDelayMs: 1000,
      respectRetryAfter: true
    });
    
    nonceManager = new NonceManager({
      newNonceUrl: 'https://test-staging.acme-love.com/acme/new-nonce', // Fake URL for testing
      fetch: mockFetch,
      rateLimiter
    });
  });

  describe('Rate Limiter', () => {
    test('should handle 503 with Retry-After header', async () => {
      let callCount = 0;
      const mockFn = jest.fn(async () => {
        callCount++;
        if (callCount === 1) {
          // First call returns 503 with Retry-After
          const error = new Error('Rate limited');
          (error as any).response = {
            status: 503,
            headers: { 'retry-after': '1' } // 1 second
          };
          throw error;
        }
        // Second call succeeds
        return 'success';
      });

      const startTime = Date.now();
      const result = await rateLimiter.executeWithRateLimit(mockFn, '/test-endpoint');
      const elapsed = Date.now() - startTime;

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(elapsed).toBeGreaterThanOrEqual(900); // Should wait ~1 second
    });

    test('should handle rate limit in error message', async () => {
      let callCount = 0;
      const mockFn = jest.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('too many new registrations (10) from this IP address in the last 3h0m0s, retry after 2025-01-01 00:00:01 UTC.');
        }
        return 'success';
      });

      const result = await rateLimiter.executeWithRateLimit(mockFn, '/test-endpoint');
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    test('should throw RateLimitError after max retries', async () => {
      const mockFn = jest.fn(async () => {
        const error = new Error('Rate limited');
        (error as any).response = {
          status: 503,
          headers: { 'retry-after': '1' }
        };
        throw error;
      });

      await expect(
        rateLimiter.executeWithRateLimit(mockFn, '/test-endpoint')
      ).rejects.toThrow(RateLimitError);

      expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    test('should not retry non-rate-limit errors', async () => {
      const mockFn = jest.fn(async () => {
        throw new Error('Network error');
      });

      await expect(
        rateLimiter.executeWithRateLimit(mockFn, '/test-endpoint')
      ).rejects.toThrow('Network error');

      expect(mockFn).toHaveBeenCalledTimes(1); // No retries
    });

    test('should track rate limit windows', async () => {
      const mockFn = jest.fn(async () => {
        const error = new Error('Rate limited');
        (error as any).response = {
          status: 503,
          headers: { 'retry-after': '10' } // 10 seconds
        };
        throw error;
      });

      // First call should hit rate limit
      await expect(
        rateLimiter.executeWithRateLimit(mockFn, '/test-endpoint')
      ).rejects.toThrow(RateLimitError);

      // Check that rate limit window is tracked
      const status = rateLimiter.getRateLimitStatus('/test-endpoint');
      expect(status.isLimited).toBe(true);
      expect(status.retryAfter).toBeGreaterThan(Date.now());

      // Clear rate limit for cleanup
      rateLimiter.clearRateLimit('/test-endpoint');
    });
  });

  describe('Nonce Manager with Rate Limiting', () => {
    test('should handle nonce fetch rate limits gracefully', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call returns 503 rate limit with proper headers
          const error = new Error('Rate limited');
          (error as any).status = 503;
          (error as any).headers = { 'retry-after': '1' };
          throw error;
        }
        // Second call succeeds with nonce
        return {
          status: 200,
          headers: { 'replay-nonce': 'test-nonce-123' },
          data: null
        };
      });

      const namespace = NonceManager.makeNamespace('test-ca');
      const startTime = Date.now();
      const nonce = await nonceManager.take(namespace);
      const elapsed = Date.now() - startTime;

      expect(nonce).toBe('test-nonce-123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(elapsed).toBeGreaterThanOrEqual(900); // Should wait for rate limit
    });

    test('should detect Let\'s Encrypt rate limit responses', async () => {
      // Simulate actual Let's Encrypt 503 response structure
      mockFetch.mockImplementation(async () => {
        const error = new Error('newNonce failed: HTTP 503');
        (error as any).status = 503;
        (error as any).headers = { 
          'retry-after': '10',
          'content-type': 'application/problem+json'
        };
        throw error;
      });

      const namespace = NonceManager.makeNamespace('test-ca');
      
      // Should fail after retries due to persistent rate limiting
      await expect(nonceManager.take(namespace)).rejects.toThrow(/Rate limit exceeded/);
      
      // Should have attempted multiple times
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    test('should work without rate limiting when no issues', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        headers: { 'replay-nonce': 'quick-nonce-456' },
        data: null
      });

      const namespace = NonceManager.makeNamespace('test-ca');
      const startTime = Date.now();
      const nonce = await nonceManager.take(namespace);
      const elapsed = Date.now() - startTime;

      expect(nonce).toBe('quick-nonce-456');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(elapsed).toBeLessThan(100); // Should be fast without rate limits
    });

    test('should handle concurrent requests with rate limiting', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          // First two calls hit rate limit
          const error = new Error('Rate limited');
          (error as any).status = 503;
          (error as any).headers = { 'retry-after': '1' };
          throw error;
        }
        // Subsequent calls succeed
        return {
          status: 200,
          headers: { 'replay-nonce': `nonce-${callCount}` },
          data: null
        };
      });

      const namespace = NonceManager.makeNamespace('test-ca');
      
      // Make 3 concurrent requests
      const promises = [
        nonceManager.take(namespace),
        nonceManager.take(namespace),
        nonceManager.take(namespace)
      ];

      const results = await Promise.all(promises);
      
      // All should succeed eventually
      expect(results).toHaveLength(3);
      results.forEach(nonce => {
        expect(nonce).toMatch(/nonce-\d+/);
      });

      // Should have made multiple fetch attempts due to rate limiting
      expect(mockFetch).toHaveBeenCalledTimes(5); // 2 failures + 3 successes
    });
  });

  describe('Production Rate Limit Configuration', () => {
    test('should use production-friendly rate limit settings', () => {
      const prodRateLimiter = new RateLimiter({
        maxRetries: 5,           // More retries for production
        baseDelayMs: 2000,       // 2 second base delay
        maxDelayMs: 300000,      // 5 minute max delay
        respectRetryAfter: true  // Always respect server Retry-After
      });

      const prodNonceManager = new NonceManager({
        newNonceUrl: 'https://acme-v02.api.letsencrypt.org/acme/new-nonce',
        fetch: mockFetch,
        rateLimiter: prodRateLimiter
      });

      expect(prodNonceManager).toBeDefined();
      
      // Test that rate limiter has correct settings
      const status = prodRateLimiter.getRateLimitStatus('/test');
      expect(status.isLimited).toBe(false);
    });

    test('should provide known endpoint constants', () => {
      const endpoints = RateLimiter.getKnownEndpoints();
      
      expect(endpoints.NEW_NONCE).toBe('/acme/new-nonce');
      expect(endpoints.NEW_ACCOUNT).toBe('/acme/new-account');
      expect(endpoints.NEW_ORDER).toBe('/acme/new-order');
      expect(endpoints.REVOKE_CERT).toBe('/acme/revoke-cert');
      expect(endpoints.RENEWAL_INFO).toBe('/acme/renewal-info');
      expect(endpoints.ACME_GENERAL).toBe('/acme/*');
      expect(endpoints.DIRECTORY).toBe('/directory');
    });
  });
});
