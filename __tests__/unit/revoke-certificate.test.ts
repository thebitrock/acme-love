import { describe, it, expect, jest } from '@jest/globals';
import { pemToBase64Url } from '../../src/lib/utils/index.js';
import { REVOCATION_REASON } from '../../src/lib/constants/status.js';

const SAMPLE_PEM = `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJALRiMLAh4DhcMA0GCSqGSIb3DQEBCwUAMBMxETAPBgNVBAMMCHRl
c3QuY29tMB4XDTI1MDEwMTAwMDAwMFoXDTI2MDEwMTAwMDAwMFowEzERMA8GA1UE
AwwIdGVzdC5jb20wXDANBgkqhkiG9w0BAQEFAANLADBIAkEA0Z3VS5JJcds3xf0g
-----END CERTIFICATE-----`;

describe('pemToBase64Url', () => {
  it('strips PEM headers and converts to base64url', () => {
    const result = pemToBase64Url(SAMPLE_PEM);
    expect(result).not.toContain('-----BEGIN');
    expect(result).not.toContain('-----END');
    expect(result).not.toContain('\n');
    expect(result).not.toContain('+');
    expect(result).not.toContain('/');
    expect(result).not.toContain('=');
    expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces decodable base64url', () => {
    const result = pemToBase64Url(SAMPLE_PEM);
    let padded = result.replace(/-/g, '+').replace(/_/g, '/');
    while (padded.length % 4 !== 0) padded += '=';
    const buf = Buffer.from(padded, 'base64');
    expect(buf.length).toBeGreaterThan(0);
  });

  it('handles multi-certificate PEM (chain)', () => {
    const chain = `${SAMPLE_PEM}\n${SAMPLE_PEM}`;
    const result = pemToBase64Url(chain);
    expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('handles PEM with extra whitespace', () => {
    const messy = `  -----BEGIN CERTIFICATE-----\n  MIIB  \n  -----END CERTIFICATE-----  `;
    const result = pemToBase64Url(messy);
    expect(result).toBe('MIIB');
  });
});

describe('REVOCATION_REASON', () => {
  it('has standard RFC 5280 reason codes', () => {
    expect(REVOCATION_REASON.UNSPECIFIED).toBe(0);
    expect(REVOCATION_REASON.KEY_COMPROMISE).toBe(1);
    expect(REVOCATION_REASON.CA_COMPROMISE).toBe(2);
    expect(REVOCATION_REASON.AFFILIATION_CHANGED).toBe(3);
    expect(REVOCATION_REASON.SUPERSEDED).toBe(4);
    expect(REVOCATION_REASON.CESSATION_OF_OPERATION).toBe(5);
  });
});

describe('AcmeAccount.revokeCertificate', () => {
  function makeMockSigner(responses: any[] = []) {
    let callIndex = 0;
    return {
      signedPost: jest.fn<any>(async () => {
        if (callIndex < responses.length) return responses[callIndex++];
        return { statusCode: 200, headers: {}, body: {} };
      }),
      getDirectory: jest.fn<any>(async () => ({
        newNonce: 'https://acme.test/new-nonce',
        newAccount: 'https://acme.test/new-acct',
        newOrder: 'https://acme.test/new-order',
        revokeCert: 'https://acme.test/revoke-cert',
        keyChange: 'https://acme.test/key-change',
      })),
      keys: {},
      kid: 'https://acme.test/acct/1',
      keyAuthorization: jest.fn<any>(),
    };
  }

  // We can't easily import AcmeAccount without real crypto keys,
  // so we test the revoke logic via the signer mock pattern used in order-manager tests.
  // The actual integration is: AcmeAccount.revokeCertificate calls signer.signedPost(revokeCert, payload)

  it('calls signedPost with correct revokeCert URL and certificate payload', async () => {
    const { AcmeAccount } = await import('../../src/lib/core/acme-account.js');
    const { generateKeyPair } = await import('../../src/lib/crypto/index.js');
    const keys = await generateKeyPair({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });
    const { AcmeClient } = await import('../../src/lib/core/acme-client.js');

    const client = new AcmeClient('https://acme.test/directory');
    const account = new AcmeAccount(client, {
      privateKey: keys.privateKey!,
      publicKey: keys.publicKey!,
    });

    // Mock the internal signer's signedPost
    const mockSignedPost = jest.fn<any>(async () => ({
      statusCode: 200,
      headers: {},
      body: {},
    }));

    // Access internal signer to mock it
    const signer = (account as any).signer;
    signer.signedPost = mockSignedPost;
    signer.getDirectory = jest.fn<any>(async () => ({
      newNonce: 'https://acme.test/new-nonce',
      newAccount: 'https://acme.test/new-acct',
      newOrder: 'https://acme.test/new-order',
      revokeCert: 'https://acme.test/revoke-cert',
      keyChange: 'https://acme.test/key-change',
    }));

    await account.revokeCertificate(SAMPLE_PEM);

    expect(mockSignedPost).toHaveBeenCalledTimes(1);
    const [url, payload] = mockSignedPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('https://acme.test/revoke-cert');
    expect(payload.certificate).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(payload.reason).toBeUndefined();
  });

  it('includes reason code when provided', async () => {
    const { AcmeAccount } = await import('../../src/lib/core/acme-account.js');
    const { generateKeyPair } = await import('../../src/lib/crypto/index.js');
    const keys = await generateKeyPair({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });
    const { AcmeClient } = await import('../../src/lib/core/acme-client.js');

    const client = new AcmeClient('https://acme.test/directory');
    const account = new AcmeAccount(client, {
      privateKey: keys.privateKey!,
      publicKey: keys.publicKey!,
    });

    const mockSignedPost = jest.fn<any>(async () => ({
      statusCode: 200,
      headers: {},
      body: {},
    }));
    const signer = (account as any).signer;
    signer.signedPost = mockSignedPost;
    signer.getDirectory = jest.fn<any>(async () => ({
      newNonce: 'https://acme.test/new-nonce',
      newAccount: 'https://acme.test/new-acct',
      newOrder: 'https://acme.test/new-order',
      revokeCert: 'https://acme.test/revoke-cert',
      keyChange: 'https://acme.test/key-change',
    }));

    await account.revokeCertificate(SAMPLE_PEM, REVOCATION_REASON.KEY_COMPROMISE);

    const [, payload] = mockSignedPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.reason).toBe(1);
  });

  it('throws on non-200 response', async () => {
    const { AcmeAccount } = await import('../../src/lib/core/acme-account.js');
    const { generateKeyPair } = await import('../../src/lib/crypto/index.js');
    const keys = await generateKeyPair({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });
    const { AcmeClient } = await import('../../src/lib/core/acme-client.js');

    const client = new AcmeClient('https://acme.test/directory');
    const account = new AcmeAccount(client, {
      privateKey: keys.privateKey!,
      publicKey: keys.publicKey!,
    });

    const signer = (account as any).signer;
    signer.signedPost = jest.fn<any>(async () => ({
      statusCode: 400,
      headers: {},
      body: {
        type: 'urn:ietf:params:acme:error:alreadyRevoked',
        detail: 'Certificate already revoked',
      },
    }));
    signer.getDirectory = jest.fn<any>(async () => ({
      newNonce: 'https://acme.test/new-nonce',
      newAccount: 'https://acme.test/new-acct',
      newOrder: 'https://acme.test/new-order',
      revokeCert: 'https://acme.test/revoke-cert',
      keyChange: 'https://acme.test/key-change',
    }));

    await expect(account.revokeCertificate(SAMPLE_PEM)).rejects.toThrow('already revoked');
  });
});
