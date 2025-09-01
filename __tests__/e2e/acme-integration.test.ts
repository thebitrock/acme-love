import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { AcmeClient } from '../../src/lib/core/acme-client.js';
import type { AcmeDirectory } from '../../src/lib/types/directory.js';
import { NonceManager } from '../../src/lib/managers/nonce-manager.js';
import { generateKeyPair, createAcmeCsr } from '../../src/lib/crypto/csr.js';
import { AcmeHttpClient } from '../../src/lib/transport/http-client.js';
import type { AcmeCertificateAlgorithm } from '../../src/lib/crypto/csr.js';

// These tests run against Let's Encrypt staging environment
// They require real network access and may take some time
describe('ACME Integration Tests (E2E)', () => {
  // Let's Encrypt staging environment
  const STAGING_DIRECTORY_URL = 'https://acme-staging-v02.api.letsencrypt.org/directory';

  let directory: AcmeDirectory;
  let nonceManager: NonceManager;
  let client: AcmeClient;

  beforeAll(async () => {
    // Skip tests if in CI without proper test domain setup
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      console.log('Skipping E2E tests in CI environment');
      return;
    }

    console.log('Setting up ACME integration test...');

    // Generate account key pair for testing
    const algo: AcmeCertificateAlgorithm = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
    await generateKeyPair(algo);
    console.log('Generated account key pair');

    // Initialize client
    client = new AcmeClient(STAGING_DIRECTORY_URL);

    // Initialize directory via client
    directory = await client.getDirectory();
    console.log("Loaded ACME directory from Let's Encrypt staging");

    // Get nonce manager from client
    nonceManager = client.getDefaultNonce();
    console.log('Initialized nonce manager');

    console.log('ACME integration test setup complete');
  }, 30000); // Allow 30 seconds for setup

  afterAll(async () => {
    // Cleanup any resources if needed
    console.log('ACME integration test cleanup complete');
  });

  test("should connect to Let's Encrypt staging directory", async () => {
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      return;
    }

    expect(directory).toBeDefined();

    // Directory already obtained via client.getDirectory() in beforeAll
    expect(directory.newNonce).toContain('https://acme-staging-v02.api.letsencrypt.org');
    expect(directory.newAccount).toContain('https://acme-staging-v02.api.letsencrypt.org');
    expect(directory.newOrder).toContain('https://acme-staging-v02.api.letsencrypt.org');

    console.log('Directory endpoints verified:', {
      newNonce: directory.newNonce,
      newAccount: directory.newAccount,
      newOrder: directory.newOrder,
    });
  }, 10000);

  test('should successfully fetch nonces from staging server', async () => {
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      return;
    }

    expect(nonceManager).toBeDefined();

    const namespace = STAGING_DIRECTORY_URL;

    // Fetch multiple nonces to test the functionality
    const nonces: string[] = [];
    for (let i = 0; i < 3; i++) {
      const nonce = await nonceManager.get(namespace); // Using get() instead of deprecated take()
      expect(nonce).toBeDefined();
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThan(10);
      nonces.push(nonce);
      console.log(`Fetched nonce ${i + 1}: ${nonce.substring(0, 20)}...`);
    }

    // All nonces should be unique
    expect(new Set(nonces).size).toBe(3);
    console.log('All nonces are unique as expected');
  }, 25000);

  test('should handle nonce manager concurrent access', async () => {
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      return;
    }

    expect(nonceManager).toBeDefined();

    const namespace = STAGING_DIRECTORY_URL;

    // Make multiple concurrent requests
    const promises: Promise<string>[] = [];
    for (let i = 0; i < 5; i++) {
      promises.push(nonceManager.get(namespace)); // Using get() instead of deprecated take()
    }

    const nonces = await Promise.all(promises);

    // All requests should succeed
    expect(nonces.length).toBe(5);
    nonces.forEach((nonce, index) => {
      expect(nonce).toBeDefined();
      expect(typeof nonce).toBe('string');
      console.log(`Concurrent nonce ${index + 1}: ${nonce.substring(0, 20)}...`);
    });

    // All nonces should be unique
    expect(new Set(nonces).size).toBe(5);
    console.log('All concurrent nonces are unique');
  }, 20000);

  test('should create and validate CSR with different algorithms', async () => {
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      return;
    }

    const testDomain = 'test-e2e.acme-love.com'; // Use acme-love.com for testing (won't be validated)

    // Test different key algorithms
    const algorithms: AcmeCertificateAlgorithm[] = [
      { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' },
      { kind: 'ec', namedCurve: 'P-384', hash: 'SHA-384' },
      { kind: 'rsa', modulusLength: 2048, hash: 'SHA-256' },
    ];

    for (const algorithm of algorithms) {
      const algoName =
        algorithm.kind === 'ec' ? `EC-${algorithm.namedCurve}` : `RSA-${algorithm.modulusLength}`;
      console.log(`Testing CSR creation with ${algoName}...`);

      const keyPair = await generateKeyPair(algorithm);
      expect(keyPair).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();

      const csr = await createAcmeCsr([testDomain], algorithm, testDomain, keyPair);

      expect(csr).toBeDefined();
      expect(csr.pem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
      expect(csr.pem).toContain('-----END CERTIFICATE REQUEST-----');
      expect(csr.pem.length).toBeGreaterThan(200);
      expect(csr.der).toBeInstanceOf(Buffer);

      console.log(`✓ ${algoName} CSR created successfully (${csr.pem.length} bytes)`);
    }
  }, 25000);

  test('should handle ACME client initialization and basic operations', async () => {
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      return;
    }

    expect(client).toBeDefined();

    // Test that client can fetch directory
    const dir = await client.getDirectory();
    expect(dir).toBeDefined();
    expect(dir.newNonce).toBeDefined();
    expect(dir.newAccount).toBeDefined();
    expect(dir.newOrder).toBeDefined();

    console.log('ACME client initialized successfully');

    // Test that default nonce manager is initialized
    const defaultNonce = await client.getDefaultNonce();
    expect(defaultNonce).toBeDefined();

    console.log('Default nonce manager is properly configured');
  }, 10000);

  test('should handle network errors gracefully', async () => {
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      return;
    }

    // Test with invalid directory URL using AcmeClient
    const invalidClient = new AcmeClient('https://invalid-acme-server.example.com/directory');

    await expect(invalidClient.getDirectory()).rejects.toThrow();
    console.log('Invalid directory URL handled correctly');

    // Test nonce manager with invalid URL
    const invalidNonceManager = new NonceManager({
      newNonceUrl: 'https://invalid-acme-server.acme-love.com/new-nonce',
      fetch: (url) => new AcmeHttpClient().head(url),
    });

    const namespace = 'https://invalid-acme-server.acme-love.com';
    await expect(invalidNonceManager.get(namespace)).rejects.toThrow(); // Using get() instead of deprecated take()
    console.log('Invalid nonce URL handled correctly');
  }, 15000);

  test('should validate ACME directory structure', async () => {
    if (process.env.CI && !process.env.ACME_E2E_ENABLED) {
      return;
    }

    // Directory already obtained via client.getDirectory() in beforeAll

    // Validate all required ACME directory endpoints
    expect(directory.newNonce).toBeDefined();
    expect(directory.newAccount).toBeDefined();
    expect(directory.newOrder).toBeDefined();
    expect(directory.revokeCert).toBeDefined();
    expect(directory.keyChange).toBeDefined();

    // Validate meta information
    expect(directory.meta).toBeDefined();
    if (directory.meta) {
      expect(directory.meta.termsOfService).toBeDefined();
    }

    console.log('ACME directory structure validation:', {
      newNonce: !!directory.newNonce,
      newAccount: !!directory.newAccount,
      newOrder: !!directory.newOrder,
      revokeCert: !!directory.revokeCert,
      keyChange: !!directory.keyChange,
      termsOfService: !!directory.meta?.termsOfService,
    });
  }, 10000);
});
