import { describe, it, expect } from '@jest/globals';
import { JoseAcmeSigner } from '../../src/lib/crypto/signer.js';
import { generateKeyPair, type AcmeAccountKeyPair } from '../../src/lib/crypto/index.js';

async function makeAccount(): Promise<AcmeAccountKeyPair> {
  const keys = await generateKeyPair({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });
  return { privateKey: keys.privateKey!, publicKey: keys.publicKey! };
}

describe('JoseAcmeSigner', () => {
  it('constructs with account keys', async () => {
    const account = await makeAccount();
    const signer = new JoseAcmeSigner(account);
    expect(signer.getAccount()).toBe(account);
  });

  it('getAccountKid returns undefined initially', async () => {
    const signer = new JoseAcmeSigner(await makeAccount());
    expect(signer.getAccountKid()).toBeUndefined();
  });

  it('setAccountKid / getAccountKid round-trip', async () => {
    const signer = new JoseAcmeSigner(await makeAccount());
    signer.setAccountKid('https://acme.test/acct/1');
    expect(signer.getAccountKid()).toBe('https://acme.test/acct/1');
  });

  it('getJwk returns JWK with kty and crv', async () => {
    const signer = new JoseAcmeSigner(await makeAccount());
    const jwk = await signer.getJwk();
    expect(jwk.kty).toBe('EC');
    expect(jwk.crv).toBe('P-256');
    expect(jwk.x).toBeDefined();
    expect(jwk.y).toBeDefined();
  });

  it('getJwk caches the result', async () => {
    const signer = new JoseAcmeSigner(await makeAccount());
    const a = await signer.getJwk();
    const b = await signer.getJwk();
    expect(a).toBe(b);
  });

  it('getJwk throws when publicKey is missing', async () => {
    const account = {
      privateKey: undefined,
      publicKey: undefined,
    } as unknown as AcmeAccountKeyPair;
    const signer = new JoseAcmeSigner(account);
    await expect(signer.getJwk()).rejects.toThrow('not initialized');
  });

  it('signJws produces valid flattened JWS', async () => {
    const signer = new JoseAcmeSigner(await makeAccount());
    const payload = new TextEncoder().encode('test-payload');
    const header = { alg: 'ES256' as const, url: 'https://acme.test/new', nonce: 'test-nonce' };
    const jws = await signer.signJws(payload, header);
    expect(jws.protected).toBeDefined();
    expect(jws.payload).toBeDefined();
    expect(jws.signature).toBeDefined();
  });

  it('signJws throws when privateKey is missing', async () => {
    const account = {
      publicKey: (await makeAccount()).publicKey,
      privateKey: undefined,
    } as unknown as AcmeAccountKeyPair;
    const signer = new JoseAcmeSigner(account);
    const payload = new TextEncoder().encode('test');
    await expect(signer.signJws(payload, { alg: 'ES256' as const })).rejects.toThrow('private key');
  });

  it('generateKeyAuthorization returns token.thumbprint format', async () => {
    const signer = new JoseAcmeSigner(await makeAccount());
    const ka = await signer.generateKeyAuthorization('test-token');
    expect(ka).toMatch(/^test-token\.[A-Za-z0-9_-]+$/);
  });

  it('dns01Value returns base64url SHA-256 of key authorization', async () => {
    const signer = new JoseAcmeSigner(await makeAccount());
    const value = await signer.dns01Value('test-token');
    // base64url chars only, 43 chars for SHA-256
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('tlsAlpn01Digest returns 32-byte Buffer', async () => {
    const signer = new JoseAcmeSigner(await makeAccount());
    const digest = await signer.tlsAlpn01Digest('test-token');
    expect(Buffer.isBuffer(digest)).toBe(true);
    expect(digest.length).toBe(32);
  });

  it('dns01Value and tlsAlpn01Digest use same key authorization', async () => {
    const signer = new JoseAcmeSigner(await makeAccount());
    const token = 'consistency-test';
    const dns = await signer.dns01Value(token);
    const alpn = await signer.tlsAlpn01Digest(token);
    // Both should derive from same key authorization, so sha256 hex should match
    const { createHash } = await import('crypto');
    const ka = await signer.generateKeyAuthorization(token);
    const expectedDns = createHash('sha256').update(ka).digest('base64url');
    const expectedAlpn = createHash('sha256').update(ka).digest();
    expect(dns).toBe(expectedDns);
    expect(alpn.equals(expectedAlpn)).toBe(true);
  });
});
