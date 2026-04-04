import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import * as jose from 'jose';
// Updated to import from public entrypoint
import { AcmeAccount, type AccountKeys, AcmeClient, AccountError } from '../../src/index.js';
import type { AcmeRequestSigner } from '../../src/lib/core/acme-request-signer.js';
import type { AcmeOrderManager } from '../../src/lib/core/acme-order-manager.js';
import type { AcmeChallengeSolver } from '../../src/lib/core/acme-challenge-solver.js';

function makeMockSigner(keys: AccountKeys): AcmeRequestSigner {
  return {
    keys,
    kid: '',
    signedPost: jest.fn().mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: {},
    }),
    keyAuthorization: jest.fn().mockResolvedValue('token.thumbprint'),
    getDirectory: jest.fn().mockResolvedValue({
      newNonce: 'https://acme.test/new-nonce',
      newAccount: 'https://acme.test/new-account',
      newOrder: 'https://acme.test/new-order',
      revokeCert: 'https://acme.test/revoke-cert',
    }),
    createExternalAccountBinding: jest.fn().mockResolvedValue('eab-jws'),
  } as unknown as AcmeRequestSigner;
}

function makeMockOrders(): AcmeOrderManager {
  return {
    createOrder: jest.fn().mockResolvedValue({
      status: 'pending',
      identifiers: [{ type: 'dns', value: 'example.com' }],
      authorizations: [],
      finalize: 'https://acme.test/finalize/1',
    }),
    finalize: jest.fn().mockResolvedValue({ status: 'processing' }),
    waitOrder: jest.fn().mockResolvedValue({ status: 'valid' }),
    downloadCertificate: jest.fn().mockResolvedValue('-----BEGIN CERTIFICATE-----\n...'),
  } as unknown as AcmeOrderManager;
}

function makeMockChallenges(): AcmeChallengeSolver {
  return {
    resolveAuthorization: jest.fn(),
    getChallenge: jest.fn().mockResolvedValue({ type: 'dns-01', status: 'pending' }),
    acceptChallenge: jest.fn().mockResolvedValue({ type: 'dns-01', status: 'processing' }),
    solveDns01: jest.fn().mockResolvedValue({ status: 'ready' }),
    solveHttp01: jest.fn().mockResolvedValue({ status: 'ready' }),
  } as unknown as AcmeChallengeSolver;
}

describe('AcmeAccount', () => {
  let client: AcmeClient;
  let account: AcmeAccount;
  let keys: AccountKeys;

  beforeEach(async () => {
    // Generate test key pair
    const keyPair = await jose.generateKeyPair('ES256');
    keys = {
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
    };

    // Create mock client
    client = new AcmeClient('https://acme-staging-v02.api.letsencrypt.org/directory');
    account = new AcmeAccount(client, keys);
  });

  describe('keyAuthorization', () => {
    test('should generate valid key authorization per RFC 8555 Section 8.1', async () => {
      const token = 'evaGxfADs6pSRb2LAv9IZf17Dt3juxGJ-PCt92wr-oA';

      const keyAuth = await account.keyAuthorization(token);

      // Key authorization should be in format: token.thumbprint
      expect(keyAuth).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

      // Should start with the token
      expect(keyAuth.startsWith(token)).toBe(true);

      // Should contain exactly one dot separator
      const parts = keyAuth.split('.');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe(token);

      // Thumbprint should be base64url encoded (no padding, URL-safe chars)
      const thumbprint = parts[1];
      expect(thumbprint).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(thumbprint).not.toContain('='); // No padding
      expect(thumbprint).not.toContain('+'); // No non-URL-safe chars
      expect(thumbprint).not.toContain('/'); // No non-URL-safe chars
    });

    test('should generate consistent key authorization for same token', async () => {
      const token = 'test-token-123';

      const keyAuth1 = await account.keyAuthorization(token);
      const keyAuth2 = await account.keyAuthorization(token);

      expect(keyAuth1).toBe(keyAuth2);
    });

    test('should generate different key authorization for different tokens', async () => {
      const token1 = 'token-1';
      const token2 = 'token-2';

      const keyAuth1 = await account.keyAuthorization(token1);
      const keyAuth2 = await account.keyAuthorization(token2);

      expect(keyAuth1).not.toBe(keyAuth2);
      expect(keyAuth1.split('.')[1]).toBe(keyAuth2.split('.')[1]); // Same thumbprint
      expect(keyAuth1.split('.')[0]).toBe(token1);
      expect(keyAuth2.split('.')[0]).toBe(token2);
    });

    test('should match jose library thumbprint calculation', async () => {
      const token = 'verification-token';

      // Calculate using our method
      const keyAuth = await account.keyAuthorization(token);
      const ourThumbprint = keyAuth.split('.')[1];

      // Calculate using jose library directly
      const jwk = await jose.exportJWK(keys.publicKey);
      const expectedThumbprint = await jose.calculateJwkThumbprint(jwk, 'sha256');

      expect(ourThumbprint).toBe(expectedThumbprint);
    });

    test('should handle special characters in token', async () => {
      const token = 'token_with-special_chars123'; // Avoid dots in token for this test

      const keyAuth = await account.keyAuthorization(token);

      expect(keyAuth.startsWith(token)).toBe(true);
      expect(keyAuth.split('.')[0]).toBe(token);
    });

    test('should handle tokens with dots correctly', async () => {
      const token = 'token.with.dots.123';

      const keyAuth = await account.keyAuthorization(token);

      // Key authorization format should be: token.thumbprint
      // But if token contains dots, we need to split more carefully
      expect(keyAuth.startsWith(token + '.')).toBe(true);

      // Extract thumbprint by removing token and first dot
      const thumbprint = keyAuth.substring(token.length + 1);
      expect(thumbprint).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(thumbprint).not.toContain('.'); // Thumbprint shouldn't contain dots
    });

    test('should generate thumbprint according to RFC 7517', async () => {
      const token = 'rfc-test-token';

      const keyAuth = await account.keyAuthorization(token);
      const thumbprint = keyAuth.split('.')[1];

      // Thumbprint should be 43 characters for SHA-256 (256 bits / 6 bits per base64url char)
      // Actually it's 43 chars because base64url encoding of 32 bytes (256 bits) = ceil(32*8/6) = 43
      expect(thumbprint).toHaveLength(43);

      // Verify it's a valid base64url string
      const decoded = jose.base64url.decode(thumbprint);
      expect(decoded).toHaveLength(32); // SHA-256 produces 32 bytes
    });
  });

  describe('with injected dependencies', () => {
    let mockSigner: AcmeRequestSigner;
    let mockOrders: AcmeOrderManager;
    let mockChallenges: AcmeChallengeSolver;
    let diAccount: AcmeAccount;

    beforeEach(async () => {
      mockSigner = makeMockSigner(keys);
      mockOrders = makeMockOrders();
      mockChallenges = makeMockChallenges();
      diAccount = new AcmeAccount(client, keys, {
        _signer: mockSigner,
        _orders: mockOrders,
        _challenges: mockChallenges,
      });
    });

    describe('register', () => {
      test('successful registration returns accountUrl', async () => {
        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 201,
          headers: { location: 'https://acme.test/acct/1' },
          body: { status: 'valid', contact: ['mailto:test@example.com'] },
        });

        const result = await diAccount.register({
          contact: 'test@example.com',
          termsOfServiceAgreed: true,
        });

        expect(result.accountUrl).toBe('https://acme.test/acct/1');
        expect(result.account).toHaveProperty('status', 'valid');
        expect(mockSigner.kid).toBe('https://acme.test/acct/1');
      });

      test('handles contact as array', async () => {
        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 200,
          headers: { location: 'https://acme.test/acct/2' },
          body: { status: 'valid' },
        });

        await diAccount.register({
          contact: ['mailto:a@test.com', 'b@test.com'],
          termsOfServiceAgreed: true,
        });

        const call = (mockSigner.signedPost as jest.Mock).mock.calls[0];
        const payload = call[1] as Record<string, unknown>;
        const contacts = payload.contact as string[];
        expect(contacts).toContain('mailto:a@test.com');
        expect(contacts).toContain('mailto:b@test.com');
      });

      test('throws on non-200/201 response', async () => {
        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 403,
          headers: {},
          body: { type: 'urn:ietf:params:acme:error:unauthorized', detail: 'no' },
        });

        await expect(
          diAccount.register({ contact: 'x@test.com', termsOfServiceAgreed: true }),
        ).rejects.toThrow();
      });

      test('throws AccountError when Location header missing', async () => {
        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 201,
          headers: {},
          body: { status: 'valid' },
        });

        await expect(
          diAccount.register({ contact: 'x@test.com', termsOfServiceAgreed: true }),
        ).rejects.toThrow();
      });

      test('throws on non-HTTPS Location header', async () => {
        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 201,
          headers: { location: 'http://insecure.test/acct/1' },
          body: { status: 'valid' },
        });

        await expect(
          diAccount.register({ contact: 'x@test.com', termsOfServiceAgreed: true }),
        ).rejects.toThrow('Invalid account URL');
      });

      test('includes EAB when configured', async () => {
        const eabAccount = new AcmeAccount(client, keys, {
          _signer: mockSigner,
          _orders: mockOrders,
          _challenges: mockChallenges,
          externalAccountBinding: { kid: 'eab-kid', hmacKey: 'dGVzdA' },
        });

        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 201,
          headers: { location: 'https://acme.test/acct/3' },
          body: { status: 'valid' },
        });

        await eabAccount.register({
          contact: 'x@test.com',
          termsOfServiceAgreed: true,
        });

        expect(mockSigner.createExternalAccountBinding).toHaveBeenCalledWith(
          { kid: 'eab-kid', hmacKey: 'dGVzdA' },
          'https://acme.test/new-account',
        );
      });
    });

    describe('getAccount', () => {
      test('returns account info when registered', async () => {
        mockSigner.kid = 'https://acme.test/acct/1';
        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 200,
          body: { status: 'valid', contact: ['mailto:test@example.com'] },
        });

        const result = await diAccount.getAccount();
        expect(result).toHaveProperty('status', 'valid');
      });

      test('throws AccountError when not registered', async () => {
        mockSigner.kid = '';

        await expect(diAccount.getAccount()).rejects.toThrow(AccountError);
      });

      test('throws on non-200 response', async () => {
        mockSigner.kid = 'https://acme.test/acct/1';
        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 403,
          body: { type: 'urn:ietf:params:acme:error:unauthorized', detail: 'gone' },
        });

        await expect(diAccount.getAccount()).rejects.toThrow();
      });
    });

    describe('fetch', () => {
      test('returns parsed body on success', async () => {
        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 200,
          body: { data: 'value' },
        });

        const result = await diAccount.fetch<{ data: string }>('https://acme.test/resource');
        expect(result.data).toBe('value');
      });

      test('throws on non-200 response', async () => {
        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 404,
          body: { type: 'urn:ietf:params:acme:error:malformed', detail: 'not found' },
        });

        await expect(diAccount.fetch('https://acme.test/missing')).rejects.toThrow();
      });
    });

    describe('revokeCertificate', () => {
      test('succeeds on 200 response', async () => {
        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 200,
          body: {},
        });

        const pem =
          '-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJALRiMLAh9lvBMA0GCSqGSIb3DQEBCwUA\n-----END CERTIFICATE-----';
        await expect(diAccount.revokeCertificate(pem)).resolves.toBeUndefined();
      });

      test('includes reason code when provided', async () => {
        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 200,
          body: {},
        });

        const pem =
          '-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJALRiMLAh9lvBMA0GCSqGSIb3DQEBCwUA\n-----END CERTIFICATE-----';
        await diAccount.revokeCertificate(pem, 1);

        const call = (mockSigner.signedPost as jest.Mock).mock.calls[0];
        const payload = call[1] as Record<string, unknown>;
        expect(payload.reason).toBe(1);
      });

      test('throws on non-200 response', async () => {
        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 403,
          body: { type: 'urn:ietf:params:acme:error:unauthorized', detail: 'no' },
        });

        const pem =
          '-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJALRiMLAh9lvBMA0GCSqGSIb3DQEBCwUA\n-----END CERTIFICATE-----';
        await expect(diAccount.revokeCertificate(pem)).rejects.toThrow();
      });
    });

    describe('delegation methods', () => {
      test('createOrder delegates to orders', async () => {
        await diAccount.createOrder(['example.com']);
        expect(mockOrders.createOrder).toHaveBeenCalledWith(['example.com']);
      });

      test('finalize delegates to orders', async () => {
        const order = { status: 'ready' } as any;
        await diAccount.finalize(order, 'csr-base64url');
        expect(mockOrders.finalize).toHaveBeenCalledWith(order, 'csr-base64url');
      });

      test('waitOrder delegates to orders', async () => {
        const order = { status: 'processing' } as any;
        await diAccount.waitOrder(order, ['valid']);
        expect(mockOrders.waitOrder).toHaveBeenCalledWith(order, ['valid']);
      });

      test('downloadCertificate delegates to orders', async () => {
        const order = { status: 'valid', certificate: 'url' } as any;
        const cert = await diAccount.downloadCertificate(order);
        expect(cert).toContain('BEGIN CERTIFICATE');
        expect(mockOrders.downloadCertificate).toHaveBeenCalledWith(order);
      });

      test('getChallenge delegates to challenges', async () => {
        await diAccount.getChallenge('https://acme.test/chall/1');
        expect(mockChallenges.getChallenge).toHaveBeenCalledWith('https://acme.test/chall/1');
      });

      test('acceptChallenge delegates to challenges', async () => {
        await diAccount.acceptChallenge('https://acme.test/chall/1');
        expect(mockChallenges.acceptChallenge).toHaveBeenCalledWith('https://acme.test/chall/1');
      });

      test('solveDns01 delegates to challenges', async () => {
        const order = { status: 'pending' } as any;
        const opts = { setDns: jest.fn(), waitFor: jest.fn() };
        await diAccount.solveDns01(order, opts);
        expect(mockChallenges.solveDns01).toHaveBeenCalledWith(order, opts);
      });

      test('solveHttp01 delegates to challenges', async () => {
        const order = { status: 'pending' } as any;
        const opts = { setHttp: jest.fn(), waitFor: jest.fn() };
        await diAccount.solveHttp01(order, opts);
        expect(mockChallenges.solveHttp01).toHaveBeenCalledWith(order, opts);
      });
    });

    describe('getters/setters', () => {
      test('keys returns signer keys', () => {
        expect(diAccount.keys).toBe(keys);
      });

      test('kid getter returns signer kid', () => {
        mockSigner.kid = 'https://acme.test/acct/1';
        expect(diAccount.kid).toBe('https://acme.test/acct/1');
      });

      test('kid returns undefined when empty', () => {
        mockSigner.kid = '';
        expect(diAccount.kid).toBeUndefined();
      });

      test('kid setter updates signer kid', () => {
        diAccount.kid = 'https://acme.test/acct/2';
        expect(mockSigner.kid).toBe('https://acme.test/acct/2');
      });

      test('getDirectory delegates to signer', async () => {
        const dir = await diAccount.getDirectory();
        expect(dir.newAccount).toBe('https://acme.test/new-account');
      });
    });

    describe('getAuthorization', () => {
      test('returns authorization on success', async () => {
        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 200,
          body: { identifier: { type: 'dns', value: 'example.com' }, status: 'pending' },
        });

        const authz = await diAccount.getAuthorization('https://acme.test/authz/1');
        expect(authz.identifier.value).toBe('example.com');
      });

      test('throws on non-200 response', async () => {
        (mockSigner.signedPost as jest.Mock).mockResolvedValueOnce({
          statusCode: 404,
          body: { type: 'urn:ietf:params:acme:error:malformed', detail: 'not found' },
        });

        await expect(
          diAccount.getAuthorization('https://acme.test/authz/missing'),
        ).rejects.toThrow();
      });
    });
  });
});
