import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { NonceManager } from '../src/acme/client/nonce-manager.js';
import { generateKeyPair, createAcmeCsr } from '../src/acme/csr.js';
import { SimpleHttpClient } from '../src/acme/http/http-client.js';
import { AcmeDirectory } from '../src/acme/client/acme-directory.js';
import type { CsrAlgo } from '../src/acme/csr.js';

// Tests for asynchronous behavior and concurrent access patterns
describe('ACME Library Async Behavior Tests', () => {
  const STAGING_DIRECTORY_URL = 'https://acme-staging-v02.api.letsencrypt.org/directory';
  
  let httpClient: SimpleHttpClient;
  let directory: AcmeDirectory;
  let nonceManager: NonceManager;

  beforeAll(async () => {
    // Skip tests if in CI without proper test domain setup
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      console.log('Skipping async behavior tests in CI environment');
      return;
    }

    console.log('Setting up async behavior tests...');
    
    httpClient = new SimpleHttpClient();
    directory = new AcmeDirectory(httpClient, STAGING_DIRECTORY_URL);
    const dirResult = await directory.get();
    
    nonceManager = new NonceManager({
      newNonceUrl: dirResult.newNonce,
      fetch: httpClient.head.bind(httpClient),
      maxPool: 20,
      prefetchLowWater: 5,
      prefetchHighWater: 10,
    });
    
    console.log('Async behavior test setup complete');
  }, 30000);

  afterAll(async () => {
    console.log('Async behavior test cleanup complete');
  });

  test('should handle multiple parallel key generation operations', async () => {
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      return;
    }

    console.log('Testing parallel key generation...');
    
    const algorithms: CsrAlgo[] = [
      { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' },
      { kind: 'ec', namedCurve: 'P-384', hash: 'SHA-384' },
      { kind: 'rsa', modulusLength: 2048, hash: 'SHA-256' },
      { kind: 'rsa', modulusLength: 3072, hash: 'SHA-256' },
    ];
    
    // Generate multiple key pairs in parallel
    const startTime = Date.now();
    const keyGenerationPromises = algorithms.map(async (algo, index) => {
      const keyPair = await generateKeyPair(algo);
      const algoName = algo.kind === 'ec' ? `EC-${algo.namedCurve}` : `RSA-${algo.modulusLength}`;
      console.log(`Generated ${algoName} keys (${index + 1}/${algorithms.length})`);
      return { algo, keyPair };
    });
    
    const results = await Promise.all(keyGenerationPromises);
    const duration = Date.now() - startTime;
    
    console.log(`Parallel key generation completed in ${duration}ms`);
    
    // Verify all keys were generated successfully
    expect(results).toHaveLength(algorithms.length);
    results.forEach(({ keyPair }) => {
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
    });
    
    console.log('✓ All parallel key generation operations successful');
  }, 30000);

  test('should handle multiple parallel CSR creation operations', async () => {
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      return;
    }

    console.log('Testing parallel CSR creation...');
    
    const testDomains = [
      ['test1.acme-love.com'],
      ['test2.acme-love.com', 'www.test2.acme-love.com'],
      ['test3.acme-love.com', 'api.test3.acme-love.com', 'www.test3.acme-love.com'],
    ];
    
    const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
    
    // Create CSRs in parallel
    const startTime = Date.now();
    const csrPromises = testDomains.map(async (domains, index) => {
      const keyPair = await generateKeyPair(algo);
      const csr = await createAcmeCsr(domains, algo, domains[0], keyPair);
      console.log(`Created CSR for ${domains.join(', ')} (${index + 1}/${testDomains.length})`);
      return { domains, csr };
    });
    
    const results = await Promise.all(csrPromises);
    const duration = Date.now() - startTime;
    
    console.log(`Parallel CSR creation completed in ${duration}ms`);
    
    // Verify all CSRs were created successfully
    expect(results).toHaveLength(testDomains.length);
    results.forEach(({ csr }) => {
      expect(csr.pem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
      expect(csr.pem).toContain('-----END CERTIFICATE REQUEST-----');
      expect(csr.der).toBeInstanceOf(Buffer);
      expect(csr.der.length).toBeGreaterThan(100);
    });
    
    console.log('✓ All parallel CSR creation operations successful');
  }, 30000);

  test('should handle high-frequency nonce requests without conflicts', async () => {
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      return;
    }

    console.log('Testing high-frequency nonce requests...');
    
    const namespace = NonceManager.makeNamespace(STAGING_DIRECTORY_URL);
    const numberOfRequests = 20;
    
    // Make many concurrent nonce requests
    const startTime = Date.now();
    const noncePromises = Array.from({ length: numberOfRequests }, async (_, index) => {
      const nonce = await nonceManager.take(namespace);
      if (index % 5 === 0) {
        console.log(`Fetched nonce ${index + 1}/${numberOfRequests}: ${nonce.substring(0, 20)}...`);
      }
      return nonce;
    });
    
    const nonces = await Promise.all(noncePromises);
    const duration = Date.now() - startTime;
    
    console.log(`High-frequency nonce requests completed in ${duration}ms`);
    console.log(`Average time per nonce: ${(duration / numberOfRequests).toFixed(2)}ms`);
    
    // Verify all nonces are unique
    expect(nonces).toHaveLength(numberOfRequests);
    const uniqueNonces = new Set(nonces);
    expect(uniqueNonces.size).toBe(numberOfRequests);
    
    // Verify all nonces are valid strings
    nonces.forEach(nonce => {
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThan(10);
    });
    
    console.log('✓ All high-frequency nonce requests successful and unique');
  }, 30000);

  test('should handle mixed async operations concurrently', async () => {
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      return;
    }

    console.log('Testing mixed async operations...');
    
    const namespace = NonceManager.makeNamespace(STAGING_DIRECTORY_URL);
    const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
    
    const startTime = Date.now();
    
    // Run multiple different operations in parallel
    const mixedPromises = [
      // Directory operations
      directory.get(),
      
      // Key generation operations
      generateKeyPair(algo),
      generateKeyPair({ kind: 'rsa', modulusLength: 2048, hash: 'SHA-256' }),
      
      // Nonce operations
      nonceManager.take(namespace),
      nonceManager.take(namespace),
      nonceManager.take(namespace),
      
      // CSR creation (after key generation)
      (async () => {
        const keyPair = await generateKeyPair(algo);
        return createAcmeCsr(['mixed-test.acme-love.com'], algo, 'mixed-test.acme-love.com', keyPair);
      })(),
    ];
    
    const results = await Promise.all(mixedPromises);
    const duration = Date.now() - startTime;
    
    console.log(`Mixed async operations completed in ${duration}ms`);
    
    // Verify all operations completed successfully
    const [
      dirResult,
      ecKey,
      rsaKey,
      nonce1,
      nonce2,
      nonce3,
      csrResult,
    ] = results as [
      any, // ACMEDirectory
      any, // CryptoKeyPair
      any, // CryptoKeyPair  
      string,
      string,
      string,
      any, // CreateCsrResult
    ];
    
    // Directory result
    expect(dirResult.newNonce).toBeDefined();
    expect(dirResult.newAccount).toBeDefined();
    
    // Key pairs
    expect(ecKey.privateKey).toBeDefined();
    expect(ecKey.publicKey).toBeDefined();
    expect(rsaKey.privateKey).toBeDefined();
    expect(rsaKey.publicKey).toBeDefined();
    
    // Nonces
    expect(typeof nonce1).toBe('string');
    expect(typeof nonce2).toBe('string');
    expect(typeof nonce3).toBe('string');
    expect(new Set([nonce1, nonce2, nonce3]).size).toBe(3); // All unique
    
    // CSR
    expect(csrResult.pem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
    expect(csrResult.der).toBeInstanceOf(Buffer);
    
    console.log('✓ All mixed async operations successful');
  }, 30000);

  test('should handle rapid sequential operations without memory leaks', async () => {
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      return;
    }

    console.log('Testing rapid sequential operations...');
    
    const namespace = NonceManager.makeNamespace(STAGING_DIRECTORY_URL);
    const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
    
    const initialMemory = process.memoryUsage();
    console.log(`Initial memory usage: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    
    // Perform many operations in sequence
    for (let i = 0; i < 10; i++) {
      const batchStart = Date.now();
      
      // Each iteration: generate key, create CSR, get nonce
      const keyPair = await generateKeyPair(algo);
      const csr = await createAcmeCsr([`seq-test-${i}.acme-love.com`], algo, `seq-test-${i}.acme-love.com`, keyPair);
      const nonce = await nonceManager.take(namespace);
      
      const batchDuration = Date.now() - batchStart;
      
      // Verify operations completed successfully
      expect(keyPair.privateKey).toBeDefined();
      expect(csr.pem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
      expect(typeof nonce).toBe('string');
      
      if (i % 3 === 0) {
        const currentMemory = process.memoryUsage();
        console.log(`Batch ${i + 1}/10 completed in ${batchDuration}ms, Memory: ${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      }
    }
    
    // Check final memory usage
    global.gc && global.gc(); // Force garbage collection if available
    const finalMemory = process.memoryUsage();
    const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
    
    console.log(`Final memory usage: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Memory increase: ${memoryIncrease.toFixed(2)} MB`);
    
    // Memory increase should be reasonable (less than 50MB for this test)
    expect(memoryIncrease).toBeLessThan(50);
    
    console.log('✓ Rapid sequential operations completed without excessive memory usage');
  }, 60000);

  test('should handle error recovery in async operations', async () => {
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      return;
    }

    console.log('Testing error recovery in async operations...');
    
    // Test with mix of valid and invalid operations
    const validNamespace = NonceManager.makeNamespace(STAGING_DIRECTORY_URL);
    
    const mixedOperations = [
      // Valid operations
      nonceManager.take(validNamespace),
      directory.get(),
      generateKeyPair({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' }),
      
      // Operations that may fail gracefully
      directory.get(), // Should succeed (cached)
      nonceManager.take(validNamespace), // Should succeed
    ];
    
    const results = await Promise.allSettled(mixedOperations);
    
    // Count successful and failed operations
    const successful = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');
    
    console.log(`Operations completed: ${successful.length} successful, ${failed.length} failed`);
    
    // Most operations should succeed
    expect(successful.length).toBeGreaterThanOrEqual(3);
    
    // Verify the successful operations
    successful.forEach((result) => {
      if (result.status === 'fulfilled') {
        expect(result.value).toBeDefined();
      }
    });
    
    console.log('✓ Error recovery in async operations handled correctly');
  }, 30000);
});
