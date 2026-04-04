import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as jose from 'jose';
import {
  AcmeRequestSigner,
  detectJwsAlgorithm,
  type AccountKeys,
} from '../../src/lib/core/acme-request-signer.js';
import type { AcmeClient } from '../../src/lib/core/acme-client.js';
import type { NonceManager } from '../../src/lib/managers/nonce-manager.js';

describe('detectJwsAlgorithm', () => {
  it('detects ES256 for P-256 key', async () => {
    const { publicKey } = await jose.generateKeyPair('ES256');
    expect(await detectJwsAlgorithm(publicKey as CryptoKey)).toBe('ES256');
  });

  it('detects ES384 for P-384 key', async () => {
    const { publicKey } = await jose.generateKeyPair('ES384');
    expect(await detectJwsAlgorithm(publicKey as CryptoKey)).toBe('ES384');
  });

  it('detects ES512 for P-521 key', async () => {
    const { publicKey } = await jose.generateKeyPair('ES512');
    expect(await detectJwsAlgorithm(publicKey as CryptoKey)).toBe('ES512');
  });

  it('detects RS256 for RSA key', async () => {
    const { publicKey } = await jose.generateKeyPair('RS256');
    expect(await detectJwsAlgorithm(publicKey as CryptoKey)).toBe('RS256');
  });
});

describe('AcmeRequestSigner', () => {
  let keys: AccountKeys;
  let mockClient: AcmeClient;
  let mockNonceManager: NonceManager;
  let mockPost: jest.Mock;

  beforeEach(async () => {
    const keyPair = await jose.generateKeyPair('ES256');
    keys = {
      privateKey: keyPair.privateKey as CryptoKey,
      publicKey: keyPair.publicKey as CryptoKey,
    };

    mockPost = jest.fn().mockResolvedValue({
      statusCode: 200,
      headers: { location: 'https://acme.test/acct/1' },
      body: { status: 'valid' },
    });

    mockClient = {
      directoryUrl: 'https://acme.test/directory',
      getDirectory: jest.fn().mockResolvedValue({
        newNonce: 'https://acme.test/new-nonce',
        newAccount: 'https://acme.test/new-account',
        newOrder: 'https://acme.test/new-order',
        revokeCert: 'https://acme.test/revoke-cert',
      }),
      getHttp: jest.fn().mockReturnValue({
        post: mockPost,
        head: jest.fn(),
      }),
      getDefaultNonceOptions: jest.fn().mockReturnValue({}),
    } as unknown as AcmeClient;

    mockNonceManager = {
      withNonceRetry: jest
        .fn()
        .mockImplementation(async (_ns: string, fn: (nonce: string) => Promise<unknown>) => {
          return fn('test-nonce-123');
        }),
      get: jest.fn().mockResolvedValue('test-nonce'),
      close: jest.fn(),
    } as unknown as NonceManager;
  });

  it('signedPost with injected NonceManager produces valid JWS', async () => {
    const signer = new AcmeRequestSigner(mockClient, keys, {
      nonceManager: mockNonceManager,
    });

    const result = await signer.signedPost('https://acme.test/new-account', { test: true }, true);

    expect(result.statusCode).toBe(200);
    expect(mockNonceManager.withNonceRetry).toHaveBeenCalled();

    // Verify the JWS body sent to HTTP client
    const postCall = mockPost.mock.calls[0];
    const jwsBody = postCall[1] as Record<string, unknown>;
    expect(jwsBody).toHaveProperty('protected');
    expect(jwsBody).toHaveProperty('payload');
    expect(jwsBody).toHaveProperty('signature');
  });

  it('signedPost uses jwk header when forceJwk=true', async () => {
    const signer = new AcmeRequestSigner(mockClient, keys, {
      nonceManager: mockNonceManager,
    });

    await signer.signedPost('https://acme.test/new-account', { test: true }, true);

    const postCall = mockPost.mock.calls[0];
    const jws = postCall[1] as Record<string, string>;
    const header = JSON.parse(Buffer.from(jws.protected, 'base64url').toString());
    expect(header).toHaveProperty('jwk');
    expect(header).not.toHaveProperty('kid');
  });

  it('signedPost uses kid header when kid is set', async () => {
    const signer = new AcmeRequestSigner(mockClient, keys, {
      kid: 'https://acme.test/acct/1',
      nonceManager: mockNonceManager,
    });

    await signer.signedPost('https://acme.test/order', { test: true });

    const postCall = mockPost.mock.calls[0];
    const jws = postCall[1] as Record<string, string>;
    const header = JSON.parse(Buffer.from(jws.protected, 'base64url').toString());
    expect(header.kid).toBe('https://acme.test/acct/1');
    expect(header).not.toHaveProperty('jwk');
  });

  it('signedPost encodes null payload as empty', async () => {
    const signer = new AcmeRequestSigner(mockClient, keys, {
      kid: 'https://acme.test/acct/1',
      nonceManager: mockNonceManager,
    });

    await signer.signedPost('https://acme.test/order', null);

    const postCall = mockPost.mock.calls[0];
    const jws = postCall[1] as Record<string, string>;
    // Empty payload for POST-as-GET
    expect(jws.payload).toBe('');
  });

  it('signedPost includes correct protected header fields', async () => {
    const signer = new AcmeRequestSigner(mockClient, keys, {
      nonceManager: mockNonceManager,
    });

    await signer.signedPost('https://acme.test/new-account', {}, true);

    const postCall = mockPost.mock.calls[0];
    const jws = postCall[1] as Record<string, string>;
    const header = JSON.parse(Buffer.from(jws.protected, 'base64url').toString());
    expect(header.alg).toBe('ES256');
    expect(header.nonce).toBe('test-nonce-123');
    expect(header.url).toBe('https://acme.test/new-account');
  });

  it('keyAuthorization generates token.thumbprint format', async () => {
    const signer = new AcmeRequestSigner(mockClient, keys, {
      nonceManager: mockNonceManager,
    });

    const keyAuth = await signer.keyAuthorization('test-token');
    const parts = keyAuth.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('test-token');
    expect(parts[1]).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('createExternalAccountBinding produces valid EAB', async () => {
    const signer = new AcmeRequestSigner(mockClient, keys, {
      nonceManager: mockNonceManager,
    });

    const eab = await signer.createExternalAccountBinding(
      { kid: 'eab-kid', hmacKey: 'dGVzdC1obWFjLWtleQ' },
      'https://acme.test/new-account',
    );

    // EAB should be a valid JWT string
    expect(typeof eab).toBe('string');
    expect(eab.split('.').length).toBe(3);
  });

  it('createExternalAccountBinding rejects invalid HMAC key', async () => {
    const signer = new AcmeRequestSigner(mockClient, keys, {
      nonceManager: mockNonceManager,
    });

    await expect(
      signer.createExternalAccountBinding(
        { kid: 'eab-kid', hmacKey: 'invalid=key+chars/' },
        'https://acme.test/new-account',
      ),
    ).rejects.toThrow('EAB HMAC key must be a valid base64url-encoded string');
  });

  it('getDirectory delegates to client', async () => {
    const signer = new AcmeRequestSigner(mockClient, keys, {
      nonceManager: mockNonceManager,
    });

    const dir = await signer.getDirectory();
    expect(dir.newAccount).toBe('https://acme.test/new-account');
    expect(mockClient.getDirectory).toHaveBeenCalled();
  });

  it('keys getter returns the key pair', () => {
    const signer = new AcmeRequestSigner(mockClient, keys, {
      nonceManager: mockNonceManager,
    });

    expect(signer.keys).toBe(keys);
  });

  it('kid is readable and writable', () => {
    const signer = new AcmeRequestSigner(mockClient, keys, {
      nonceManager: mockNonceManager,
    });

    expect(signer.kid).toBe('');
    signer.kid = 'https://acme.test/acct/1';
    expect(signer.kid).toBe('https://acme.test/acct/1');
  });
});
