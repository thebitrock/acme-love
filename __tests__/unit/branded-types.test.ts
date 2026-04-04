import { describe, it, expect } from '@jest/globals';
import {
  asAccountUrl,
  asNonce,
  asBase64Url,
  asPem,
  asChallengeToken,
  asDirectoryUrl,
} from '../../src/lib/types/branded.js';

describe('Branded type helpers', () => {
  it('asAccountUrl returns the same string value', () => {
    const url = asAccountUrl('https://acme.test/acct/1');
    expect(url).toBe('https://acme.test/acct/1');
    // Branded type is assignable to string
    const s: string = url;
    expect(s).toBe('https://acme.test/acct/1');
  });

  it('asNonce returns the same string value', () => {
    const nonce = asNonce('abc123');
    expect(nonce).toBe('abc123');
  });

  it('asBase64Url returns the same string value', () => {
    const b64 = asBase64Url('dGVzdA');
    expect(b64).toBe('dGVzdA');
  });

  it('asPem returns the same string value', () => {
    const pem = asPem('-----BEGIN CERTIFICATE-----\ndata\n-----END CERTIFICATE-----');
    expect(pem).toBe('-----BEGIN CERTIFICATE-----\ndata\n-----END CERTIFICATE-----');
  });

  it('asChallengeToken returns the same string value', () => {
    const token = asChallengeToken('evaGxfADs6pSRb2LAv9IZf17Dt3juxGJ-PCt92wr-oA');
    expect(token).toBe('evaGxfADs6pSRb2LAv9IZf17Dt3juxGJ-PCt92wr-oA');
  });

  it('asDirectoryUrl returns the same string value', () => {
    const url = asDirectoryUrl('https://acme-v02.api.letsencrypt.org/directory');
    expect(url).toBe('https://acme-v02.api.letsencrypt.org/directory');
  });
});
