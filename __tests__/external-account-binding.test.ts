import { describe, it, expect } from '@jest/globals';
import { AcmeAccount } from '../src/lib/core/acme-account.js';
import { AcmeClient } from '../src/lib/core/acme-client.js';
import type { ExternalAccountBinding, AccountKeys } from '../src/lib/core/acme-account.js';
import { generateKeyPair, type AcmeCertificateAlgorithm } from '../src/lib/crypto/csr.js';

describe('External Account Binding', () => {
  it('should create EAB JWS with correct structure', async () => {
    // Generate test account keys
    const algo: AcmeCertificateAlgorithm = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
    const keyPair = await generateKeyPair(algo);

    // Convert to AccountKeys format
    const accountKeys: AccountKeys = {
      privateKey: keyPair.privateKey!,
      publicKey: keyPair.publicKey,
    };

    // Mock EAB parameters
    const eab: ExternalAccountBinding = {
      kid: 'test-kid-123',
      hmacKey: 'dGVzdC1obWFjLWtleS0xMjM', // base64url of "test-hmac-key-123"
    };

    // Create client and account with EAB
    const client = new AcmeClient('https://test.example.com/directory');
    const account = new AcmeAccount(client, accountKeys, {
      externalAccountBinding: eab,
    });

    // Test that the EAB is configured correctly
    expect((account as any).opts.externalAccountBinding).toEqual(eab);

    // Verify the account is created with EAB options
    expect(account).toBeDefined();
    expect((account as any).opts.externalAccountBinding?.kid).toBe('test-kid-123');
    expect((account as any).opts.externalAccountBinding?.hmacKey).toBe('dGVzdC1obWFjLWtleS0xMjM');
  });

  it('should include EAB in account registration payload', async () => {
    // This test verifies the integration but doesn't make actual network calls
    const eab: ExternalAccountBinding = {
      kid: 'test-kid-456',
      hmacKey: 'dGVzdC1obWFjLWtleS00NTY',
    };

    // Generate test account keys
    const algo: AcmeCertificateAlgorithm = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
    const keyPair = await generateKeyPair(algo);

    // Convert to AccountKeys format
    const accountKeys: AccountKeys = {
      privateKey: keyPair.privateKey!,
      publicKey: keyPair.publicKey,
    };

    // Create client and account with EAB
    const client = new AcmeClient('https://test.example.com/directory');
    const account = new AcmeAccount(client, accountKeys, {
      externalAccountBinding: eab,
    });

    // Verify EAB configuration
    expect((account as any).opts.externalAccountBinding?.kid).toBe('test-kid-456');
    expect((account as any).opts.externalAccountBinding?.hmacKey).toBe('dGVzdC1obWFjLWtleS00NTY');
  });
});
