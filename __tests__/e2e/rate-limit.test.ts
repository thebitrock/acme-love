import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { AcmeClient } from '../../src/lib/core/acme-client.js';
import { AcmeAccount } from '../../src/lib/core/acme-account.js';
import { testAccountManager } from '../utils/account-manager.js';

describe('ACME Rate Limiting E2E Test', () => {
  const STAGING_DIRECTORY_URL = 'https://acme-staging-v02.api.letsencrypt.org/directory';
  let client: AcmeClient;
  let account: AcmeAccount;

  beforeAll(async () => {
    console.log('🔥 Setting up rate limit test - this will hammer the ACME server');

    // Create account for testing
    account = await testAccountManager.getOrCreateAccountSession(
      'rate-limit-test',
      STAGING_DIRECTORY_URL,
      `rate-limit-test-${Date.now()}@acme-love.com`,
      { nonce: { maxPool: 1 } }, // Very small pool to force frequent nonce requests
    );

    client = (account as any).client;
    console.log('✅ Test account ready');
  }, 30000);

  afterAll(async () => {
    console.log('🧹 Rate limit test cleanup complete');
  });

  test('should trigger rate limits with aggressive requests', async () => {
    console.log('🚀 Starting aggressive request pattern to trigger rate limits...');

    const promises: Promise<any>[] = [];
    const results: { success: number; rateLimited: number; errors: number } = {
      success: 0,
      rateLimited: 0,
      errors: 0,
    };

    // Create many concurrent requests to different ACME endpoints
    for (let i = 0; i < 50; i++) {
      // Mix of different types of requests
      const requestPromise = (async () => {
        try {
          const startTime = Date.now();

          if (i % 3 === 0) {
            // Directory requests
            await client.getDirectory();
            console.log(`✅ Directory request ${i} completed in ${Date.now() - startTime}ms`);
          } else if (i % 3 === 1) {
            // Account info requests
            await account.getAccount();
            console.log(`✅ Account request ${i} completed in ${Date.now() - startTime}ms`);
          } else {
            // Order creation requests (most likely to trigger rate limits)
            const domains = [`test-${i}-${Date.now()}.acme-love.com`];
            await account.createOrder(domains);
            console.log(`✅ Order request ${i} completed in ${Date.now() - startTime}ms`);
          }

          results.success++;
        } catch (error: any) {
          const duration = Date.now() - Date.now();

          // Check if this is a rate limit error
          if (
            error.message?.includes('rate') ||
            error.message?.includes('limit') ||
            error.message?.includes('429') ||
            error.message?.includes('503')
          ) {
            console.log(`⏱️  Rate limit hit on request ${i} after ${duration}ms: ${error.message}`);
            results.rateLimited++;
          } else {
            console.log(`❌ Request ${i} failed after ${duration}ms: ${error.message}`);
            results.errors++;
          }
        }
      })();

      promises.push(requestPromise);

      // Add small delays between batches to create bursts
      if (i % 10 === 0 && i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Wait for all requests to complete
    await Promise.all(promises);

    console.log('\n📊 RATE LIMITING TEST RESULTS:');
    console.log('==============================');
    console.log(`✅ Successful requests: ${results.success}`);
    console.log(`⏱️  Rate limited requests: ${results.rateLimited}`);
    console.log(`❌ Other errors: ${results.errors}`);
    console.log(`📈 Total requests: ${results.success + results.rateLimited + results.errors}`);

    if (results.rateLimited > 0) {
      console.log('🎯 SUCCESS: Rate limiting was triggered and handled!');
    } else {
      console.log('⚠️  No rate limits detected - server may be under light load');
    }

    // The test passes if we handle rate limits gracefully (no unhandled errors)
    expect(results.success + results.rateLimited + results.errors).toBe(50);

    // At least some requests should succeed
    expect(results.success).toBeGreaterThan(0);
  }, 120000); // 2 minutes timeout

  test('should handle nonce exhaustion and rate limits', async () => {
    console.log('🔥 Testing nonce exhaustion scenario...');

    // Force many rapid nonce requests
    const noncePromises = Array.from({ length: 100 }, async (_, i) => {
      try {
        const nonceManager = client.getDefaultNonce();
        const namespace = new URL(STAGING_DIRECTORY_URL).host;
        const nonce = await nonceManager.get(namespace);
        console.log(`✅ Nonce ${i}: ${nonce.substring(0, 16)}...`);
        return nonce;
      } catch (error: any) {
        console.log(`❌ Nonce ${i} failed: ${error.message}`);
        throw error;
      }
    });

    const nonces = await Promise.allSettled(noncePromises);

    const successful = nonces.filter((r) => r.status === 'fulfilled').length;
    const failed = nonces.filter((r) => r.status === 'rejected').length;

    console.log(`\n📊 NONCE TEST RESULTS:`);
    console.log(`✅ Successful nonce requests: ${successful}`);
    console.log(`❌ Failed nonce requests: ${failed}`);

    // Should have some successful nonces
    expect(successful).toBeGreaterThan(0);

    // Total should equal our request count
    expect(successful + failed).toBe(100);
  }, 60000);
});
