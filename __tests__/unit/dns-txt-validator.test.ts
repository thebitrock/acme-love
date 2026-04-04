import { describe, it, expect } from '@jest/globals';
import {
  normalizeTxtFragments,
  isValidAcmeChallengeToken,
  canDecodeTo32Bytes,
  validateAcmeTxtSet,
} from '../../src/lib/challenges/dns-txt-validator.js';

describe('normalizeTxtFragments', () => {
  it('joins multiple fragments', () => {
    expect(normalizeTxtFragments(['abc', 'def', 'ghi'])).toBe('abcdefghi');
  });

  it('returns empty string for empty array', () => {
    expect(normalizeTxtFragments([])).toBe('');
  });

  it('returns single fragment as-is', () => {
    expect(normalizeTxtFragments(['single'])).toBe('single');
  });
});

describe('isValidAcmeChallengeToken', () => {
  it('accepts valid 43-char base64url string', () => {
    // SHA-256 of "test" in base64url without padding = 43 chars
    const valid = 'n4bQgYhMfWWaL-qgxVrQFaO_TxsrC4Is0V1sFbDwCgg';
    expect(isValidAcmeChallengeToken(valid)).toBe(true);
  });

  it('rejects string shorter than 43 chars', () => {
    expect(isValidAcmeChallengeToken('abc')).toBe(false);
  });

  it('rejects string longer than 43 chars', () => {
    expect(isValidAcmeChallengeToken('a'.repeat(44))).toBe(false);
  });

  it('rejects string with invalid characters', () => {
    expect(isValidAcmeChallengeToken('a'.repeat(42) + '=')).toBe(false);
    expect(isValidAcmeChallengeToken('a'.repeat(42) + '+')).toBe(false);
    expect(isValidAcmeChallengeToken('a'.repeat(42) + '/')).toBe(false);
  });

  it('accepts string with base64url-specific chars', () => {
    // Exactly 43 chars with base64url chars including _ and -
    expect(isValidAcmeChallengeToken('ABCDEFGHIJ_-abcdefghij0123456789_-ABCDEFGHI')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidAcmeChallengeToken('')).toBe(false);
  });
});

describe('canDecodeTo32Bytes', () => {
  it('returns true for valid 43-char base64url encoding 32 bytes', () => {
    // 32 zero bytes → base64 = AAAA...AA== → base64url no pad = 43 chars
    const buf = Buffer.alloc(32, 0);
    const encoded = buf.toString('base64url');
    expect(encoded.length).toBe(43);
    expect(canDecodeTo32Bytes(encoded)).toBe(true);
  });

  it('returns false for string decoding to different length', () => {
    const buf = Buffer.alloc(16, 0);
    const encoded = buf.toString('base64url');
    expect(canDecodeTo32Bytes(encoded)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(canDecodeTo32Bytes('')).toBe(false);
  });

  it('handles base64url chars (-_) correctly', () => {
    const buf = Buffer.from('ff'.repeat(32), 'hex');
    const encoded = buf.toString('base64url');
    expect(canDecodeTo32Bytes(encoded)).toBe(true);
  });
});

describe('validateAcmeTxtSet', () => {
  // Helper: create a valid 43-char base64url string representing 32 bytes
  function makeValidToken(seed = 0): string {
    const buf = Buffer.alloc(32, seed);
    return buf.toString('base64url');
  }

  it('matches expected value when present', () => {
    const token = makeValidToken(1);
    const result = validateAcmeTxtSet([[token]], token);
    expect(result.ok).toBe(true);
    expect(result.matched).toBe(token);
  });

  it('fails when no TXT records match expected', () => {
    const expected = makeValidToken(1);
    const other = makeValidToken(2);
    const result = validateAcmeTxtSet([[other]], expected);
    expect(result.ok).toBe(false);
    expect(result.reasons).toBeDefined();
    expect(result.reasons!.length).toBeGreaterThan(0);
  });

  it('validates without expected (any valid token succeeds)', () => {
    const token = makeValidToken(1);
    const result = validateAcmeTxtSet([[token]]);
    expect(result.ok).toBe(true);
    expect(result.matched).toBe(token);
  });

  it('rejects invalid format tokens', () => {
    const result = validateAcmeTxtSet([['not-a-valid-token']]);
    expect(result.ok).toBe(false);
    expect(result.reasons!.some((r) => r.includes("doesn't look like"))).toBe(true);
  });

  it('handles multiple TXT records, returns first match', () => {
    const token1 = makeValidToken(1);
    const token2 = makeValidToken(2);
    const result = validateAcmeTxtSet([[token1], [token2]], token2);
    expect(result.ok).toBe(true);
    expect(result.matched).toBe(token2);
  });

  it('handles fragmented TXT records', () => {
    const token = makeValidToken(1);
    const half1 = token.slice(0, 20);
    const half2 = token.slice(20);
    const result = validateAcmeTxtSet([[half1, half2]], token);
    expect(result.ok).toBe(true);
  });

  it('returns all values in allValues', () => {
    const t1 = makeValidToken(1);
    const t2 = makeValidToken(2);
    const result = validateAcmeTxtSet([[t1], [t2]]);
    expect(result.allValues).toEqual([t1, t2]);
  });

  it('returns empty allValues for empty records', () => {
    const result = validateAcmeTxtSet([]);
    expect(result.allValues).toEqual([]);
    expect(result.ok).toBe(false);
  });
});
