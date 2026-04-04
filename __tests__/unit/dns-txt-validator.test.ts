import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --- Mock dns/promises BEFORE any import of dns-txt-validator ---

const mockResolveNs = jest.fn<(name: string) => Promise<string[]>>();
const mockResolveTxt = jest.fn<(name: string) => Promise<string[][]>>();
const mockResolve4 = jest.fn<(name: string) => Promise<string[]>>();
const mockResolve6 = jest.fn<(name: string) => Promise<string[]>>();
const mockResolverResolveTxt = jest.fn<(name: string) => Promise<string[][]>>();

const MockResolver = jest.fn().mockImplementation(() => ({
  setServers: jest.fn(),
  resolveTxt: mockResolverResolveTxt,
}));

jest.unstable_mockModule('dns/promises', () => ({
  resolveNs: mockResolveNs,
  resolveTxt: mockResolveTxt,
  resolve4: mockResolve4,
  resolve6: mockResolve6,
  Resolver: MockResolver,
}));

// Import everything via dynamic import AFTER mock registration
const {
  normalizeTxtFragments,
  isValidAcmeChallengeToken,
  canDecodeTo32Bytes,
  validateAcmeTxtSet,
  findZoneWithNs,
  resolveNsToIPs,
  resolveAndValidateAcmeTxtAuthoritative,
  resolveAndValidateAcmeTxt,
} = await import('../../src/lib/challenges/dns-txt-validator.js');

function makeValidToken(seed = 0): string {
  const buf = Buffer.alloc(32, seed);
  return buf.toString('base64url');
}

// --- Pure function tests ---

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
    expect(isValidAcmeChallengeToken('ABCDEFGHIJ_-abcdefghij0123456789_-ABCDEFGHI')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidAcmeChallengeToken('')).toBe(false);
  });
});

describe('canDecodeTo32Bytes', () => {
  it('returns true for valid 43-char base64url encoding 32 bytes', () => {
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

  it('finds valid candidate without expected value', () => {
    const valid = makeValidToken(5);
    const result = validateAcmeTxtSet([['short'], [valid]]);
    expect(result.ok).toBe(true);
    expect(result.matched).toBe(valid);
  });
});

// --- DNS function tests ---

describe('findZoneWithNs', () => {
  beforeEach(() => {
    mockResolveNs.mockReset();
  });

  it('finds zone by walking labels up', async () => {
    mockResolveNs
      .mockRejectedValueOnce(new Error('ENOTFOUND'))
      .mockRejectedValueOnce(new Error('ENOTFOUND'))
      .mockResolvedValueOnce(['ns1.example.com']);

    const zone = await findZoneWithNs('_acme-challenge.sub.example.com');
    expect(zone).toBe('example.com');
  });

  it('returns null when no zone has NS records', async () => {
    mockResolveNs.mockRejectedValue(new Error('ENOTFOUND'));

    const zone = await findZoneWithNs('unknown.tld');
    expect(zone).toBeNull();
  });

  it('returns first zone found', async () => {
    mockResolveNs.mockResolvedValueOnce(['ns1.sub.example.com']);

    const zone = await findZoneWithNs('sub.example.com');
    expect(zone).toBe('sub.example.com');
  });

  it('handles trailing dot', async () => {
    mockResolveNs.mockResolvedValueOnce(['ns1.example.com']);

    const zone = await findZoneWithNs('example.com.');
    expect(zone).toBe('example.com');
  });

  it('returns null for empty NS array', async () => {
    mockResolveNs.mockResolvedValue([]);

    const zone = await findZoneWithNs('example.com');
    expect(zone).toBeNull();
  });
});

describe('resolveNsToIPs', () => {
  beforeEach(() => {
    mockResolve4.mockReset();
    mockResolve6.mockReset();
  });

  it('returns IPv4 addresses', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    mockResolve6.mockRejectedValue(new Error('ENODATA'));

    const ips = await resolveNsToIPs(['ns1.example.com']);
    expect(ips).toContain('1.2.3.4');
  });

  it('returns both IPv4 and IPv6', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    mockResolve6.mockResolvedValue(['::1']);

    const ips = await resolveNsToIPs(['ns1.example.com']);
    expect(ips).toContain('1.2.3.4');
    expect(ips).toContain('::1');
  });

  it('returns empty array when all fail', async () => {
    mockResolve4.mockRejectedValue(new Error('fail'));
    mockResolve6.mockRejectedValue(new Error('fail'));

    const ips = await resolveNsToIPs(['ns1.example.com']);
    expect(ips).toEqual([]);
  });

  it('deduplicates IPs across multiple NS hosts', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    mockResolve6.mockRejectedValue(new Error('ENODATA'));

    const ips = await resolveNsToIPs(['ns1.example.com', 'ns2.example.com']);
    expect(ips).toEqual(['1.2.3.4']);
  });

  it('handles empty NS list', async () => {
    const ips = await resolveNsToIPs([]);
    expect(ips).toEqual([]);
  });
});

describe('resolveAndValidateAcmeTxtAuthoritative', () => {
  beforeEach(() => {
    mockResolveNs.mockReset();
    mockResolve4.mockReset();
    mockResolve6.mockReset();
    mockResolverResolveTxt.mockReset();
    MockResolver.mockClear();
  });

  it('validates TXT record successfully', async () => {
    const token = makeValidToken(1);

    mockResolveNs.mockImplementation(async (name: string) => {
      if (name === 'example.com') return ['ns1.example.com'];
      throw new Error('ENOTFOUND');
    });
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    mockResolve6.mockRejectedValue(new Error('ENODATA'));
    mockResolverResolveTxt.mockResolvedValue([[token]]);

    const result = await resolveAndValidateAcmeTxtAuthoritative(
      '_acme-challenge.example.com',
      token,
    );
    expect(result.ok).toBe(true);
    expect(result.matched).toBe(token);
    expect(result.zone).toBe('example.com');
    expect(result.nsHosts).toContain('ns1.example.com');
    expect(result.nsIPs).toContain('1.2.3.4');
  });

  it('returns error when no zone found', async () => {
    mockResolveNs.mockRejectedValue(new Error('ENOTFOUND'));

    const result = await resolveAndValidateAcmeTxtAuthoritative('unknown.tld');
    expect(result.ok).toBe(false);
    expect(result.zone).toBeNull();
    expect(result.reasons![0]).toContain('Failed to find zone');
  });

  it('returns error when NS resolution fails after zone found', async () => {
    // findZoneWithNs succeeds for first series of calls, then the explicit resolveNs call fails
    let callCount = 0;
    mockResolveNs.mockImplementation(async (name: string) => {
      callCount++;
      // First calls are from findZoneWithNs — succeed for zone
      if (name === 'example.com' && callCount <= 2) return ['ns1.example.com'];
      // Subsequent call (explicit NS resolve) fails
      throw new Error('NS lookup failed');
    });

    const result = await resolveAndValidateAcmeTxtAuthoritative('_acme-challenge.example.com');
    expect(result.ok).toBe(false);
    expect(result.reasons![0]).toContain('Failed to resolve NS');
  });

  it('returns error when no IPs for NS', async () => {
    mockResolveNs.mockResolvedValue(['ns1.example.com']);
    mockResolve4.mockRejectedValue(new Error('fail'));
    mockResolve6.mockRejectedValue(new Error('fail'));

    const result = await resolveAndValidateAcmeTxtAuthoritative('_acme-challenge.example.com');
    expect(result.ok).toBe(false);
    expect(result.reasons![0]).toContain('No IPs for NS');
  });

  it('returns error when TXT resolution fails', async () => {
    mockResolveNs.mockResolvedValue(['ns1.example.com']);
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    mockResolve6.mockRejectedValue(new Error('ENODATA'));
    mockResolverResolveTxt.mockRejectedValue(new Error('TXT lookup failed'));

    const result = await resolveAndValidateAcmeTxtAuthoritative('_acme-challenge.example.com');
    expect(result.ok).toBe(false);
    expect(result.reasons![0]).toContain('Failed to resolve TXT');
  });
});

describe('resolveAndValidateAcmeTxt', () => {
  beforeEach(() => {
    mockResolveTxt.mockReset();
  });

  it('validates via system resolver', async () => {
    const token = makeValidToken(1);
    mockResolveTxt.mockResolvedValue([[token]]);

    const result = await resolveAndValidateAcmeTxt('example.com', token);
    expect(result.ok).toBe(true);
    expect(result.matched).toBe(token);
  });

  it('returns error on DNS failure', async () => {
    mockResolveTxt.mockRejectedValue(new Error('ENOTFOUND'));

    const result = await resolveAndValidateAcmeTxt('nonexistent.example.com');
    expect(result.ok).toBe(false);
    expect(result.reasons![0]).toContain('Failed to resolve TXT');
  });

  it('handles trailing dot in domain', async () => {
    const token = makeValidToken(1);
    mockResolveTxt.mockResolvedValue([[token]]);

    const result = await resolveAndValidateAcmeTxt('example.com.', token);
    expect(result.ok).toBe(true);
  });
});
