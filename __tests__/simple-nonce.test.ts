import { AcmeClient } from '../src/lib/core/acme-client.js';
import { afterAll } from '@jest/globals';
import { cleanupTestResources } from './test-utils.js';

const STAGING_DIRECTORY_URL = 'https://acme-staging-v02.api.letsencrypt.org/directory';

describe('Simple Nonce Test', () => {
  it('should fetch a single nonce without deadlock', async () => {
    console.log('🧪 Testing single nonce fetch...');

    const client = new AcmeClient(STAGING_DIRECTORY_URL);

    // Initialize directory
    console.log('   Initializing directory...');
    await client.getDirectory();
    console.log('   Directory initialized ✅');

    const nonceManager = client.getDefaultNonce();
    const namespace = STAGING_DIRECTORY_URL;

    console.log('   Fetching single nonce...');
    const start = Date.now();

    try {
      const nonce = await nonceManager.get(namespace); // Using get() instead of take()
      const duration = Date.now() - start;
      console.log(`   ✅ Single nonce fetched in ${duration}ms: ${nonce.substring(0, 10)}...`);

      expect(nonce).toBeTruthy();
      expect(duration).toBeLessThan(10000); // Should not take more than 10 seconds
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`   ❌ Single nonce failed after ${duration}ms: ${error}`);
      throw error;
    }
  }, 30000);

  it('should fetch multiple sequential nonces', async () => {
    console.log('🧪 Testing sequential nonce fetches...');

    const client = new AcmeClient(STAGING_DIRECTORY_URL);
    await client.getDirectory();

    const nonceManager = client.getDefaultNonce();
    const namespace = STAGING_DIRECTORY_URL; // In the new API we simply use a string

    const nonces = [];
    for (let i = 0; i < 3; i++) {
      console.log(`   Fetching nonce ${i + 1}/3...`);
      const start = Date.now();

      try {
        const nonce = await nonceManager.get(namespace);
        const duration = Date.now() - start;
        console.log(`   ✅ Nonce ${i + 1} fetched in ${duration}ms: ${nonce.substring(0, 10)}...`);
        nonces.push(nonce);

        expect(duration).toBeLessThan(10000);
      } catch (error) {
        const duration = Date.now() - start;
        console.error(`   ❌ Nonce ${i + 1} failed after ${duration}ms: ${error}`);
        throw error;
      }
    }

    expect(nonces.length).toBe(3);
    // All nonces should be unique
    expect(new Set(nonces).size).toBe(3);
  }, 60000);

  it('should handle concurrent nonce requests (small scale)', async () => {
    console.log('🧪 Testing small scale concurrent nonce fetches...');

    const client = new AcmeClient(STAGING_DIRECTORY_URL);
    await client.getDirectory();

    const nonceManager = client.getDefaultNonce();
    const namespace = STAGING_DIRECTORY_URL;

    console.log('   Starting 3 concurrent requests...');
    const start = Date.now();

    const promises = Array.from({ length: 3 }, (_, i) => {
      return nonceManager
        .get(namespace) // Using get() instead of deprecated take()
        .then((nonce: string) => {
          const duration = Date.now() - start;
          console.log(
            `   ✅ Concurrent nonce ${i + 1} fetched in ${duration}ms: ${nonce.substring(0, 10)}...`,
          );
          return nonce;
        })
        .catch((error: Error) => {
          const duration = Date.now() - start;
          console.error(`   ❌ Concurrent nonce ${i + 1} failed after ${duration}ms: ${error}`);
          throw error;
        });
    });

    try {
      const nonces = await Promise.all(promises);
      const totalDuration = Date.now() - start;
      console.log(`   ✅ All 3 concurrent nonces completed in ${totalDuration}ms`);

      expect(nonces.length).toBe(3);
      expect(totalDuration).toBeLessThan(30000); // Should complete within 30 seconds

      // All nonces should be unique
      expect(new Set(nonces).size).toBe(3);
    } catch (error) {
      const totalDuration = Date.now() - start;
      console.error(`   ❌ Concurrent test failed after ${totalDuration}ms: ${error}`);
      throw error;
    }
  }, 60000);

  afterAll(async () => {
    // Comprehensive cleanup
    await cleanupTestResources();
  });
});
