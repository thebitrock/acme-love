import { describe, it, expect } from '@jest/globals';
import { safeReadBody } from '../../src/lib/utils/index.js';

function makeResponse(body: unknown) {
  return { statusCode: 200, headers: {}, body, trailers: {}, opaque: null, context: {} } as any;
}

describe('safeReadBody', () => {
  it('returns parsed object when body is already object', async () => {
    const obj = { type: 'urn:test', detail: 'error' };
    const result = await safeReadBody(makeResponse(obj));
    expect(result).toBe(obj);
  });

  it('returns null for null body', async () => {
    const result = await safeReadBody(makeResponse(null));
    expect(result).toBeNull();
  });

  it('returns null for undefined body', async () => {
    const result = await safeReadBody(makeResponse(undefined));
    expect(result).toBeNull();
  });

  it('parses JSON string body', async () => {
    const result = await safeReadBody(makeResponse('{"type":"urn:test","detail":"error"}'));
    expect(result).toEqual({ type: 'urn:test', detail: 'error' });
  });

  it('returns null for invalid JSON string', async () => {
    const result = await safeReadBody(makeResponse('not json'));
    expect(result).toBeNull();
  });

  it('returns null for number body', async () => {
    const result = await safeReadBody(makeResponse(42));
    expect(result).toBeNull();
  });

  it('returns null for boolean body', async () => {
    const result = await safeReadBody(makeResponse(true));
    expect(result).toBeNull();
  });

  it('handles body with json() method', async () => {
    const body = {
      json: async () => ({ type: 'urn:test', detail: 'from json()' }),
    };
    const result = await safeReadBody(makeResponse(body));
    expect(result).toEqual({ type: 'urn:test', detail: 'from json()' });
  });

  it('returns null when json() returns non-object', async () => {
    const body = {
      json: async () => 'string result',
    };
    const result = await safeReadBody(makeResponse(body));
    expect(result).toBeNull();
  });

  it('falls back to text() when json() not present', async () => {
    const body = {
      text: async () => '{"type":"urn:test","detail":"from text()"}',
    };
    const result = await safeReadBody(makeResponse(body));
    expect(result).toEqual({ type: 'urn:test', detail: 'from text()' });
  });

  it('returns null when text() returns invalid JSON', async () => {
    const body = {
      text: async () => 'not json',
    };
    const result = await safeReadBody(makeResponse(body));
    expect(result).toBeNull();
  });

  it('returns null when json() throws', async () => {
    const body = {
      json: async () => {
        throw new Error('parse error');
      },
    };
    const result = await safeReadBody(makeResponse(body));
    expect(result).toBeNull();
  });
});
