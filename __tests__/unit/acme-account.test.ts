import { describe, test, expect, beforeEach } from '@jest/globals';
import * as jose from 'jose';
import { AcmeAccount, type AccountKeys } from '../../src/lib/core/acme-account.js';
import { AcmeClient } from '../../src/lib/core/acme-client.js';

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
});
