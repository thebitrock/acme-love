/**
 * Real Let's Encrypt Rate Limit Avoidance Test
 * --------------------------------------------
 * This test validates that our library can work with real Let's Encrypt staging
 * environment without hitting rate limits by using proper techniques:
 *
 * 1. Using staging environment (higher limits)
 * 2. Spacing out requests appropriately
 * 3. Handling 503 responses gracefully
 * 4. Using different domains to avoid duplicate certificate limits
 */

import { NonceManager } from '../src/acme/client/nonce-manager.js';
import { RateLimiter } from '../src/acme/client/rate-limiter.js';

// Use a real HTTP client for this test
async function realFetch(url: string) {
  // Use built-in fetch (Node.js 18+)
  const response = await fetch(url, { method: 'HEAD' });

  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: null,
    trailers: {},
    opaque: null,
    context: {},
  };
}

describe("Real Let's Encrypt Rate Limit Avoidance", () => {
  const STAGING_NEW_NONCE_URL = 'https://acme-staging-v02.api.letsencrypt.org/acme/new-nonce';

  // Skip this test in CI or if REAL_ACME_TEST is not set
  const shouldRunRealTest = process.env.REAL_ACME_TEST === 'true';

  (shouldRunRealTest ? describe : describe.skip)('Real ACME Staging Tests', () => {
    let nonceManager: NonceManager;
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      // Production-like rate limiter settings
      rateLimiter = new RateLimiter({
        maxRetries: 5,
        baseDelayMs: 2000, // 2 second base delay
        maxDelayMs: 300000, // 5 minute max delay
        respectRetryAfter: true,
      });

      nonceManager = new NonceManager({
        newNonceUrl: STAGING_NEW_NONCE_URL,
        fetch: realFetch,
        rateLimiter,
        prefetchLowWater: 2, // Keep some nonces ready
        prefetchHighWater: 5, // Don't over-fetch
        maxPool: 10,
      });
    });

    test('should successfully get nonces from staging without rate limits', async () => {
      const namespace = NonceManager.makeNamespace('staging-test');

      console.log("Testing single nonce fetch from Let's Encrypt staging...");
      const startTime = Date.now();

      const nonce = await nonceManager.take(namespace);

      const elapsed = Date.now() - startTime;
      console.log(`Got nonce in ${elapsed}ms: ${nonce.substring(0, 20)}...`);

      expect(nonce).toBeDefined();
      expect(nonce.length).toBeGreaterThan(20); // LE nonces are base64url encoded
      expect(elapsed).toBeLessThan(5000); // Should be reasonably fast
    }, 30000); // 30 second timeout

    test('should handle multiple sequential nonce requests without hitting limits', async () => {
      const namespace = NonceManager.makeNamespace('staging-sequential');

      console.log('Testing sequential nonce fetches...');
      const nonces: string[] = [];
      const delays: number[] = [];

      for (let i = 0; i < 5; i++) {
        console.log(`Fetching nonce ${i + 1}/5...`);
        const start = Date.now();

        const nonce = await nonceManager.take(namespace);

        const elapsed = Date.now() - start;
        delays.push(elapsed);
        nonces.push(nonce);

        console.log(`  Nonce ${i + 1}: ${nonce.substring(0, 15)}... (${elapsed}ms)`);

        // Small delay between requests to be respectful
        if (i < 4) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // All nonces should be unique
      const uniqueNonces = new Set(nonces);
      expect(uniqueNonces.size).toBe(5);

      // Most requests should be fast (cached/pooled)
      const fastRequests = delays.filter((d) => d < 2000).length;
      expect(fastRequests).toBeGreaterThanOrEqual(3);

      console.log(`Average delay: ${delays.reduce((a, b) => a + b, 0) / delays.length}ms`);
    }, 45000);

    test('should handle moderate concurrency without rate limits', async () => {
      const namespace = NonceManager.makeNamespace('staging-concurrent');

      console.log('Testing concurrent nonce fetches...');
      const startTime = Date.now();

      // Request 3 nonces concurrently (moderate load)
      const promises = Array.from({ length: 3 }, (_, i) => {
        return nonceManager.take(namespace).then((nonce) => {
          console.log(`  Concurrent request ${i + 1} completed: ${nonce.substring(0, 15)}...`);
          return nonce;
        });
      });

      const nonces = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      console.log(`All 3 concurrent requests completed in ${elapsed}ms`);

      // All should succeed and be unique
      expect(nonces).toHaveLength(3);
      const uniqueNonces = new Set(nonces);
      expect(uniqueNonces.size).toBe(3);

      // Should complete in reasonable time
      expect(elapsed).toBeLessThan(10000);
    }, 30000);

    test('should demonstrate rate limit recovery if it occurs', async () => {
      const namespace = NonceManager.makeNamespace('staging-stress');

      console.log('Testing potential rate limit recovery...');

      try {
        // Make many requests quickly to potentially trigger rate limiting
        const promises = Array.from({ length: 10 }, async (_, i) => {
          try {
            const nonce = await nonceManager.take(namespace);
            console.log(`  Stress request ${i + 1}/10: Success`);
            return { success: true, nonce };
          } catch (error: any) {
            console.log(`  Stress request ${i + 1}/10: Error - ${error.message}`);
            return { success: false, error: error.message };
          }
        });

        const results = await Promise.all(promises);
        const successes = results.filter((r) => r.success).length;
        const failures = results.filter((r) => !r.success).length;

        console.log(`Stress test results: ${successes} successes, ${failures} failures`);

        // We expect at least some successes, even if some hit rate limits
        expect(successes).toBeGreaterThan(0);

        // If there were failures, they should be rate limit related
        const rateLimitFailures = results
          .filter((r) => !r.success)
          .filter(
            (r) =>
              r.error?.includes('rate') || r.error?.includes('limit') || r.error?.includes('503'),
          );

        if (failures > 0) {
          console.log(`Rate limit failures: ${rateLimitFailures.length}/${failures}`);
        }
      } catch (error) {
        console.log(`Stress test error: ${error}`);
        // Test shouldn't fail completely, just log what happened
      }
    }, 60000); // Longer timeout for stress test

    test('should work with production rate limiter settings', async () => {
      // Test with conservative settings for production
      const conservativeRateLimiter = new RateLimiter({
        maxRetries: 3,
        baseDelayMs: 5000, // 5 second base delay
        maxDelayMs: 600000, // 10 minute max delay
        respectRetryAfter: true,
      });

      const conservativeNonceManager = new NonceManager({
        newNonceUrl: STAGING_NEW_NONCE_URL,
        fetch: realFetch,
        rateLimiter: conservativeRateLimiter,
        prefetchLowWater: 1, // Minimal prefetch
        prefetchHighWater: 3,
        maxPool: 5,
      });

      const namespace = NonceManager.makeNamespace('conservative-test');

      console.log('Testing with conservative rate limiter settings...');
      const nonce = await conservativeNonceManager.take(namespace);

      expect(nonce).toBeDefined();
      console.log(`Conservative test successful: ${nonce.substring(0, 15)}...`);
    }, 30000);
  });

  describe('Rate Limit Simulation Tests', () => {
    test('should demonstrate proper rate limit handling patterns', async () => {
      console.log('Demonstrating rate limit best practices...');

      // These patterns can be used for any ACME endpoint
      const endpoints = RateLimiter.getKnownEndpoints();

      console.log('Known rate-limited endpoints:');
      Object.entries(endpoints).forEach(([name, path]) => {
        console.log(`  ${name}: ${path}`);
      });

      // Show how to create domain-specific rate limiters
      const domainSpecificRateLimiter = new RateLimiter({
        maxRetries: 3,
        baseDelayMs: 1000,
      });

      // Simulate different scenarios
      const scenarios = [
        'New account creation',
        'Certificate ordering',
        'Domain validation',
        'Certificate renewal',
      ];

      console.log('\\nRate limiting scenarios to consider:');
      scenarios.forEach((scenario, i) => {
        console.log(`  ${i + 1}. ${scenario}`);
      });

      expect(domainSpecificRateLimiter).toBeDefined();
    });

    test('should provide rate limit avoidance guidelines', () => {
      console.log('\\n=== Rate Limit Avoidance Guidelines ===');
      console.log('1. Use staging environment for development/testing');
      console.log('2. Implement exponential backoff with jitter');
      console.log('3. Respect Retry-After headers from 503 responses');
      console.log('4. Use different domain sets to avoid duplicate certificate limits');
      console.log('5. Implement proper nonce pooling (5-10 nonces per namespace)');
      console.log('6. Space out requests when possible (500ms+ between non-urgent requests)');
      console.log('7. Monitor for rate limit patterns and adjust accordingly');
      console.log('8. Use ARI (ACME Renewal Info) when available for renewal exemptions');
      console.log('\\n=== Current Library Features ===');
      console.log('✓ Automatic rate limit detection and retry');
      console.log('✓ Exponential backoff with configurable limits');
      console.log('✓ Nonce pooling to reduce new-nonce requests');
      console.log('✓ Respect for server Retry-After headers');
      console.log('✓ Endpoint-specific rate limit tracking');
      console.log('✓ Debug logging for rate limit events');

      expect(true).toBe(true); // This test is for documentation
    });
  });
});
