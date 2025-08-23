import {
  ACMEClient,
  type ACMEAuthorization,
  type ACMEChallenge,
  type ACMEOrder,
} from '../src/acme-client.js';
import { directory, RejectedIdentifierError } from '../src/index.js';
import * as jose from 'jose';
import * as jest from 'jest-mock';
import { setLogger } from '../src/logger.js';
import util from 'util';

describe('ACME Order E2E Tests', () => {
  let client: ACMEClient;
  let logger: jest.Mock;

  beforeAll(async () => {
    client = new ACMEClient(directory.letsencrypt.staging.directoryUrl);
    logger = jest.fn();
    setLogger(logger);

    const keyPair = await jose.generateKeyPair('ES256');
    client.setAccount(keyPair);
  });

  beforeEach(() => {
    logger.mockClear();
  });

  describe('Directory Discovery', () => {
    it('should successfully initialize with ACME directory', async () => {
      // Since getDirectory is now private, we'll test it indirectly
      // by checking that we can get a nonce, which requires the directory
      const nonce = await client.getNonce();

      expect(nonce).toBeDefined();
    });

    it('should get valid nonce', async () => {
      const nonce = await client.getNonce();

      expect(nonce).toBeDefined();
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThan(0);
    });
  });

  describe('Account Management', () => {
    it('should attempt to create new account', async () => {
      const keyPair = await jose.generateKeyPair('ES256');
      client.setAccount(keyPair);

      await client.createAccount();
      const account = await client.createAccount();
      expect(account).toBeDefined();
      expect(logger).toHaveBeenCalledWith(
        'WARN: Account already exists - keyId is set. This indicates an account was previously created using the current key pair. To recreate or register a new account with different credentials, replace the stored privateKey and publicKey before calling setAccount/createAccount.',
      );
      expect(account.privateKey).toBe(keyPair.privateKey);
      expect(account.publicKey).toBe(keyPair.publicKey);
      expect(account.keyId).toBeDefined();
      expect(account.keyId).toMatch(
        /^https:\/\/acme-staging-v02\.api\.letsencrypt\.org\/acme\/acct\/\d+$/,
      );
    });
  });

  describe('Order Creation', () => {
    it('should attempt to create new order for domain', async () => {
      await client.createAccount();
      const identifiers = [{ type: 'dns', value: 'test.acme-love.com' }];
      const order = await client.createOrder(identifiers);

      expect(order).toBeDefined();
      expect(order.identifiers).toEqual(identifiers);

      if (order.status) {
        expect(typeof order.status).toBe('string');
      }

      if (order.authorizations) {
        expect(Array.isArray(order.authorizations)).toBe(true);
      }

      if (order.finalize) {
        expect(typeof order.finalize).toBe('string');
      }
    });

    it('should attempt to create order for multiple domains', async () => {
      const identifiers = [
        { type: 'dns', value: 'test1.acme-love.com' },
        { type: 'dns', value: 'test2.acme-love.com' },
      ];
      await client.createAccount();
      const order = await client.createOrder(identifiers);

      console.log('Order response:', order);

      expect(order).toBeDefined();
      expect(order.identifiers).toEqual(identifiers);

      if (order.authorizations) {
        expect(Array.isArray(order.authorizations)).toBe(true);
        expect(order.authorizations.length).toBe(identifiers.length);
      }
    });

    it('should handle invalid domain gracefully', async () => {
      const identifiers = [{ type: 'dns', value: 'invalid-domain' }];

      await client.createAccount();
      await expect(client.createOrder(identifiers)).rejects.toThrow({
        name: RejectedIdentifierError.name,
        message:
          'Invalid identifiers requested :: Cannot issue for "invalid-domain": Domain name needs at least one dot',
      });
    });
  });

  describe('Authorization Retrieval', () => {
    let order: any;
    let authz: any;

    beforeAll(async () => {
      await client.createAccount();
      order = await client.createOrder([{ type: 'dns', value: 'test.acme-love.com' }]);
    });

    it('should attempt to get authorization details', async () => {
      expect(order.authorizations.length).toBeGreaterThan(0);
      authz = await client.getAuthorization(order.authorizations[0]);

      expect(authz).toBeDefined();
      expect(authz.identifier.type).toBe('dns');
      expect(Array.isArray(authz.challenges)).toBe(true);
    });

    it('should verify challenge structure if available', async () => {
      expect(Array.isArray(authz.challenges)).toBe(true);
      const challenge = authz.challenges[0];

      expect(challenge.type).toBeDefined();
      expect(challenge.url).toBeDefined();

      expect(typeof challenge.token).toBe('string');
    });
  });

  describe.only('Challenge Completion', () => {
    let order: ACMEOrder;
    let authz: ACMEAuthorization;
    let challenge: ACMEChallenge;

    beforeAll(async () => {
      const identifiers = [{ type: 'dns', value: 'test.acme-love.com' }];

      await client.createAccount();
      order = await client.createOrder(identifiers);
      authz = await client.getAuthorization(order.authorizations[0]);
      const found = authz.challenges.find((c: ACMEChallenge) => c.type === 'http-01');
      if (!found) {
        throw new Error('HTTP-01 challenge not found for authorization');
      }
      challenge = found;
    });

    it('should generate key authorization if challenge available', async () => {
      const keyAuth = await client.generateKeyAuthorization(challenge.token);

      console.log('Generated key authorization:', keyAuth);
      expect(keyAuth).toBeDefined();
      expect(typeof keyAuth).toBe('string');
      expect(keyAuth).toContain(challenge.token);
    });

    it('should handle challenge completion for test domains', async () => {
      const completeChallenge = await client.completeChallenge(challenge);
      const completeChallenge2 = await client.fetchResource(challenge.url);
      const authorization = await client.fetchResource<ACMEAuthorization>(order.authorizations[0]);

      console.log('Challenge completion response:', completeChallenge, completeChallenge2, order);

      console.log(util.inspect(authorization, { depth: null, colors: true }));
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid directory URL', async () => {
      const invalidClient = new ACMEClient('https://invalid-acme-server.example.com/directory');

      // Since getDirectory is private, test using getNonce which will fail
      // if directory initialization fails
      await expect(invalidClient.getNonce()).rejects.toThrow();
    });
    it('should handle requests without account', async () => {
      const clientWithoutAccount = new ACMEClient(directory.letsencrypt.staging.directoryUrl);

      // Initialize client by getting a nonce
      await clientWithoutAccount.getNonce();
      await expect(
        clientWithoutAccount.createOrder([{ type: 'dns', value: 'test.example.com' }]),
      ).rejects.toThrow();
    });
  });
});
