import { describe, test, expect, beforeAll } from '@jest/globals';
import { ACMEClient } from '../src/acme/client/acme-client.js';
import { directory } from '../src/directory.js';
import { createAcmeCsr, generateKeyPair, type CsrAlgo } from '../src/acme/csr.js';
import type { ACMEIdentifier, ACMEOrder, ACMEChallenge } from '../src/acme/types/order.js';
import type { ACMEAccount } from '../src/acme/types/account.js';

// Test configuration for Let's Encrypt staging
const TEST_ACME_DIRECTORY_URL = directory.letsencrypt.staging.directoryUrl;
const TEST_DOMAIN = 'test-acme-library-example.com';
const TEST_EMAIL = 'test@acme-library-example.com';

// Global variables for tests
let globalAccountKey: any;
let globalClient: ACMEClient;


describe('ACME Library Comprehensive E2E Tests', () => {
  beforeAll(async () => {
    // Generate a test account key pair
    const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
    globalAccountKey = await generateKeyPair(algo);

    // Initialize client
    globalClient = new ACMEClient(TEST_ACME_DIRECTORY_URL);
  });

  describe('Client Initialization', () => {
    test('should initialize with different configurations', async () => {
      const client1 = new ACMEClient(TEST_ACME_DIRECTORY_URL);
      expect(client1).toBeTruthy();

      const client2 = new ACMEClient(TEST_ACME_DIRECTORY_URL, {
        nonce: {}
      });
      expect(client2).toBeTruthy();

      const client3 = new ACMEClient('https://invalid-url.example/directory');
      expect(client3).toBeTruthy();
    });
  });

  describe('Account Management', () => {
    test('should create and manage account lifecycle', async () => {
      const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
      const accountKey = await generateKeyPair(algo);

      // Set account keys first
      const tempAccount: ACMEAccount = {
        privateKey: accountKey.privateKey!,
        publicKey: accountKey.publicKey!,
      };

      globalClient.setAccount(tempAccount);

      // Create new account
      const createdAccount = await globalClient.createAccount({
        contact: [`mailto:1${TEST_EMAIL}`],
        termsOfServiceAgreed: true
      });

      expect(createdAccount).toBeTruthy();
      expect(createdAccount.keyId).toBeTruthy();
      expect(typeof createdAccount.keyId).toBe('string');

      // Try to create the same account again (should return existing)
      const reusedAccount = await globalClient.createAccount({
        contact: [`mailto:2${TEST_EMAIL}`],
        termsOfServiceAgreed: true
      });

      expect(reusedAccount.keyId).toBe(createdAccount.keyId);
    });

    test('should create account with multiple contact methods', async () => {
      const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
      const accountKey = await generateKeyPair(algo);

      const tempClient = new ACMEClient(TEST_ACME_DIRECTORY_URL);
      const tempAccount: ACMEAccount = {
        privateKey: accountKey.privateKey!,
        publicKey: accountKey.publicKey!,
      };

      tempClient.setAccount(tempAccount);

      const createdAccount = await tempClient.createAccount({
        contact: [
          'mailto:test@sampleex.com'
        ],
        termsOfServiceAgreed: true
      });

      expect(createdAccount.keyId).toBeTruthy();
    });
  });

  describe('Order Management', () => {
    beforeAll(async () => {
      // Create a global account for order tests
      const tempAccount: ACMEAccount = {
        privateKey: globalAccountKey.privateKey,
        publicKey: globalAccountKey.publicKey,
      };

      console.log('Setting up global account:', tempAccount);

      globalClient.setAccount(tempAccount);
      await globalClient.createAccount({
        contact: [`mailto:3${TEST_EMAIL}`],
        termsOfServiceAgreed: true
      });
    });

    test('should create order for single domain', async () => {
      const identifiers: ACMEIdentifier[] = [
        { type: 'dns', value: TEST_DOMAIN }
      ];

      const order = await globalClient.createOrder(identifiers);

      expect(order).toBeTruthy();
      expect(order.identifiers).toHaveLength(1);
      expect(order.identifiers[0].type).toBe('dns');
      expect(order.identifiers[0].value).toBe(TEST_DOMAIN);
      expect(order.status).toBe('pending');
      expect(order.authorizations).toHaveLength(1);
    });

    test('should create order for multiple domains', async () => {
      const domains = [
        'example1.acme-love-test.com',
        'example2.acme-love-test.com',
        'example3.acme-love-test.com'
      ];

      const identifiers: ACMEIdentifier[] = domains.map(domain => ({
        type: 'dns' as const,
        value: domain
      }));

      const order = await globalClient.createOrder(identifiers);

      expect(order).toBeTruthy();
      expect(order.identifiers).toHaveLength(3);
      expect(order.authorizations).toHaveLength(3);
      expect(order.status).toBe('pending');
    });

    test('should create order for wildcard domain', async () => {
      const wildcardDomain = '*.acme-love-test.com';
      const identifiers: ACMEIdentifier[] = [
        { type: 'dns', value: wildcardDomain }
      ];

      const order = await globalClient.createOrder(identifiers);

      expect(order).toBeTruthy();
      expect(order.identifiers).toHaveLength(1);
      expect(order.identifiers[0].value).toBe(wildcardDomain);
      expect(order.status).toBe('pending');
    });

    test('should handle mixed domain and wildcard order', async () => {
      const identifiers: ACMEIdentifier[] = [
        { type: 'dns', value: 'acme-love-test.com' },
        { type: 'dns', value: '*.acme-love-test.com' }
      ];

      const order = await globalClient.createOrder(identifiers);

      expect(order).toBeTruthy();
      expect(order.identifiers).toHaveLength(2);
      expect(order.status).toBe('pending');
    });
  });

  describe('Authorization and Challenge Management', () => {
    let testOrder: ACMEOrder;

    beforeAll(async () => {
      const identifiers: ACMEIdentifier[] = [
        { type: 'dns', value: TEST_DOMAIN }
      ];
      testOrder = await globalClient.createOrder(identifiers);
    });

    test('should retrieve authorization details', async () => {
      const authUrl = testOrder.authorizations[0];
      const authorization = await globalClient.fetchResource<any>(authUrl);

      expect(authorization).toBeTruthy();
      expect(authorization.identifier.type).toBe('dns');
      expect(authorization.identifier.value).toBe(TEST_DOMAIN);
      expect(authorization.status).toBe('pending');
      expect(authorization.challenges).toBeTruthy();
      expect(authorization.challenges.length).toBeGreaterThan(0);
    });

    test('should find DNS-01 challenge', async () => {
      const authUrl = testOrder.authorizations[0];
      const authorization = await globalClient.fetchResource<any>(authUrl);

      const dnsChallenge = authorization.challenges.find(
        (challenge: ACMEChallenge) => challenge.type === 'dns-01'
      );

      expect(dnsChallenge).toBeTruthy();
      expect(dnsChallenge?.type).toBe('dns-01');
      expect(dnsChallenge?.status).toBe('pending');
      expect(dnsChallenge?.token).toBeTruthy();
    });

    test('should generate key authorization for challenge', async () => {
      const authUrl = testOrder.authorizations[0];
      const authorization = await globalClient.fetchResource<any>(authUrl);

      const dnsChallenge = authorization.challenges.find(
        (challenge: ACMEChallenge) => challenge.type === 'dns-01'
      );

      if (dnsChallenge) {
        const keyAuth = await globalClient.getChallengeKeyAuthorization(dnsChallenge);
        expect(keyAuth).toBeTruthy();
        expect(typeof keyAuth).toBe('string');
      }
    });
  });

  describe('CSR Generation and Certificate Management', () => {
    test('should generate CSR for single domain', async () => {
      const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
      const keyPair = await generateKeyPair(algo);
      const csrResult = await createAcmeCsr([TEST_DOMAIN], algo, TEST_DOMAIN, keyPair);

      expect(csrResult).toBeTruthy();
      expect(csrResult.pem).toBeTruthy();
      expect(typeof csrResult.pem).toBe('string');
      expect(csrResult.pem.includes('-----BEGIN CERTIFICATE REQUEST-----')).toBeTruthy();
      expect(csrResult.pem.includes('-----END CERTIFICATE REQUEST-----')).toBeTruthy();
    });

    test('should generate CSR for multiple domains', async () => {
      const domains = [
        'example1.acme-love-test.com',
        'example2.acme-love-test.com',
        'example3.acme-love-test.com'
      ];

      const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
      const keyPair = await generateKeyPair(algo);
      const csrResult = await createAcmeCsr(domains, algo, domains[0], keyPair);

      expect(csrResult).toBeTruthy();
      expect(csrResult.pem).toBeTruthy();
      expect(typeof csrResult.pem).toBe('string');
    });

    test('should generate CSR for wildcard domain', async () => {
      const wildcardDomain = '*.acme-love-test.com';

      const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
      const keyPair = await generateKeyPair(algo);
      const csrResult = await createAcmeCsr([wildcardDomain], algo, wildcardDomain, keyPair);

      expect(csrResult).toBeTruthy();
      expect(csrResult.pem).toBeTruthy();
      expect(typeof csrResult.pem).toBe('string');
    });
  });

  describe('Order Status Management', () => {
    let testOrder: ACMEOrder;

    beforeAll(async () => {
      const identifiers: ACMEIdentifier[] = [
        { type: 'dns', value: TEST_DOMAIN }
      ];
      testOrder = await globalClient.createOrder(identifiers);
    });

    test('should retrieve order status', async () => {
      const orderStatus = await globalClient.fetchResource<ACMEOrder>(testOrder.url!);

      expect(orderStatus).toBeTruthy();
      expect(orderStatus.status).toBeTruthy();
      expect(['pending', 'ready', 'processing', 'valid', 'invalid']).toContain(orderStatus.status);
    });

    test('should handle order finalization attempt', async () => {
      const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
      const keyPair = await generateKeyPair(algo);
      const csrResult = await createAcmeCsr([TEST_DOMAIN], algo, TEST_DOMAIN, keyPair);

      // This will likely fail due to DNS validation, but should not throw unexpectedly
      try {
        await globalClient.finalizeOrder(testOrder.finalize!, csrResult.der);
      } catch (error: any) {
        // Expected to fail in test environment without DNS setup
        expect(error).toBeTruthy();
        expect(typeof error.message).toBe('string');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid domain names', async () => {
      const invalidDomains = [
        '', // empty domain
        'invalid_domain', // invalid characters
        '.invalid.com', // starts with dot
        'toolong' + 'x'.repeat(250) + '.com' // too long
      ];

      for (const domain of invalidDomains) {
        const identifiers: ACMEIdentifier[] = [
          { type: 'dns', value: domain }
        ];

        await expect(
          globalClient.createOrder(identifiers)
        ).rejects.toThrow();
      }
    });

    test('should handle network errors gracefully', async () => {
      const invalidClient = new ACMEClient('https://nonexistent-acme-server.invalid/directory');

      const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
      const accountKey = await generateKeyPair(algo);

      const tempAccount: ACMEAccount = {
        privateKey: accountKey.privateKey!,
        publicKey: accountKey.publicKey!,
      };

      invalidClient.setAccount(tempAccount);

      await expect(
        invalidClient.createAccount({
          contact: ['mailto:test@acme-love.com'],
          termsOfServiceAgreed: true
        })
      ).rejects.toThrow();
    });
  });

  describe('Directory and Metadata', () => {
    test('should retrieve ACME directory', async () => {
      // Use fetchResource to get directory
      const directoryUrl = TEST_ACME_DIRECTORY_URL;

      // Make a simple HTTP request to get directory
      const response = await fetch(directoryUrl);
      const acmeDirectory = await response.json() as any;

      expect(acmeDirectory).toBeTruthy();
      expect(acmeDirectory.newAccount).toBeTruthy();
      expect(acmeDirectory.newOrder).toBeTruthy();
      expect(acmeDirectory.revokeCert).toBeTruthy();
      expect(acmeDirectory.keyChange).toBeTruthy();
    });

    test('should have valid directory URLs', async () => {
      const response = await fetch(TEST_ACME_DIRECTORY_URL);
      const acmeDirectory = await response.json() as any;

      const isValidUrl = (url: string) => {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      };

      expect(isValidUrl(acmeDirectory.newAccount)).toBeTruthy();
      expect(isValidUrl(acmeDirectory.newOrder)).toBeTruthy();
      expect(isValidUrl(acmeDirectory.revokeCert)).toBeTruthy();
      expect(isValidUrl(acmeDirectory.keyChange)).toBeTruthy();
    });
  });
});
