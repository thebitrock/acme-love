import { describe, it, expect } from '@jest/globals';
import { parseAlgorithm } from '../../src/cli/utils/algorithms.js';

describe('parseAlgorithm', () => {
  it('parses ec-p256', () => {
    expect(parseAlgorithm('ec-p256')).toEqual({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });
  });

  it('parses ec-p384', () => {
    expect(parseAlgorithm('ec-p384')).toEqual({ kind: 'ec', namedCurve: 'P-384', hash: 'SHA-384' });
  });

  it('parses ec-p521', () => {
    expect(parseAlgorithm('ec-p521')).toEqual({ kind: 'ec', namedCurve: 'P-521', hash: 'SHA-512' });
  });

  it('parses rsa-2048', () => {
    expect(parseAlgorithm('rsa-2048')).toEqual({
      kind: 'rsa',
      modulusLength: 2048,
      hash: 'SHA-256',
    });
  });

  it('parses rsa-3072', () => {
    expect(parseAlgorithm('rsa-3072')).toEqual({
      kind: 'rsa',
      modulusLength: 3072,
      hash: 'SHA-256',
    });
  });

  it('parses rsa-4096', () => {
    expect(parseAlgorithm('rsa-4096')).toEqual({
      kind: 'rsa',
      modulusLength: 4096,
      hash: 'SHA-384',
    });
  });

  it('throws on unknown algorithm', () => {
    expect(() => parseAlgorithm('unknown')).toThrow('Unknown algorithm: unknown');
  });

  it('throws on empty string', () => {
    expect(() => parseAlgorithm('')).toThrow('Unknown algorithm: ');
  });
});
