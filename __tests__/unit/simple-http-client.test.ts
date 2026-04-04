import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockRequest = jest.fn(async (_url: string, opts: any) => {
  const method = opts.method;
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: {
      json: async () => ({ ok: true, method }),
      text: async () => JSON.stringify({ ok: true, method }),
      arrayBuffer: async () => new ArrayBuffer(0),
    },
    trailers: {},
    opaque: null,
    context: {},
  } as any;
});

jest.unstable_mockModule('undici', () => ({ request: mockRequest }));

async function loadClient() {
  const { AcmeHttpClient } = await import('../../src/index.js');
  return AcmeHttpClient;
}

describe('AcmeHttpClient', () => {
  beforeEach(() => {
    mockRequest.mockClear();
  });

  it('GET injects User-Agent and parses JSON', async () => {
    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    const res = await client.get('https://acme-love.test/dir');
    expect(res.body).toEqual({ ok: true, method: 'GET' });
    const firstCall = mockRequest.mock.calls[0] as [string, any];
    expect(firstCall[1].method).toBe('GET');
    const headers = firstCall[1].headers as Record<string, string>;
    const uaKey = Object.keys(headers).find((k) => k.toLowerCase() === 'user-agent');
    expect(uaKey).toBeDefined();
  });

  it('POST serializes object body', async () => {
    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    const res = await client.post<any>('https://acme-love.test/new', { a: 1 });
    expect(res.body).toEqual({ ok: true, method: 'POST' });
    const call = mockRequest.mock.calls[0] as [string, any];
    expect(call[1].method).toBe('POST');
  });

  it('POST handles string body', async () => {
    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    await client.post('https://acme-love.test/new', 'raw-string');
    const call = mockRequest.mock.calls[0] as [string, any];
    expect(call[1].body).toBe('raw-string');
  });

  it('POST handles null body', async () => {
    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    await client.post('https://acme-love.test/new', null);
    const call = mockRequest.mock.calls[0] as [string, any];
    expect(call[1].body).toBeNull();
  });

  it('POST handles undefined body', async () => {
    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    await client.post('https://acme-love.test/new', undefined);
    const call = mockRequest.mock.calls[0] as [string, any];
    expect(call[1].body).toBeNull();
  });

  it('POST handles Uint8Array body', async () => {
    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    const data = new Uint8Array([1, 2, 3]);
    await client.post('https://acme-love.test/new', data);
    const call = mockRequest.mock.calls[0] as [string, any];
    expect(call[1].body).toBe(data);
  });

  it('POST handles ArrayBuffer body', async () => {
    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    const data = new ArrayBuffer(4);
    await client.post('https://acme-love.test/new', data);
    const call = mockRequest.mock.calls[0] as [string, any];
    expect(call[1].body).toBeInstanceOf(Uint8Array);
  });

  it('HEAD returns void body', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'replay-nonce': 'abc123' },
      body: { text: async () => '' },
      trailers: {},
      opaque: null,
      context: {},
    } as any);

    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    const res = await client.head('https://acme-love.test/nonce');
    expect(res.body).toBeUndefined();
    const call = mockRequest.mock.calls[0] as [string, any];
    expect(call[1].method).toBe('HEAD');
  });

  it('parses text/* content type', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
      body: {
        json: async () => ({}),
        text: async () => 'hello world',
        arrayBuffer: async () => new ArrayBuffer(0),
      },
      trailers: {},
      opaque: null,
      context: {},
    } as any);

    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    const res = await client.get('https://acme-love.test/text');
    expect(res.body).toBe('hello world');
  });

  it('parses application/pem-certificate-chain content type', async () => {
    const pemChain = '-----BEGIN CERTIFICATE-----\nMIIBx...\n-----END CERTIFICATE-----';
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'application/pem-certificate-chain' },
      body: {
        json: async () => ({}),
        text: async () => pemChain,
        arrayBuffer: async () => new ArrayBuffer(0),
      },
      trailers: {},
      opaque: null,
      context: {},
    } as any);

    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    const res = await client.get('https://acme-love.test/cert');
    expect(res.body).toBe(pemChain);
  });

  it('parses application/problem+json content type', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 400,
      headers: { 'content-type': 'application/problem+json' },
      body: {
        json: async () => ({ type: 'urn:error', detail: 'bad' }),
        text: async () => '{}',
        arrayBuffer: async () => new ArrayBuffer(0),
      },
      trailers: {},
      opaque: null,
      context: {},
    } as any);

    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    const res = await client.get('https://acme-love.test/err');
    expect(res.body).toEqual({ type: 'urn:error', detail: 'bad' });
  });

  it('parses binary fallback content type', async () => {
    const buf = new ArrayBuffer(4);
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'application/octet-stream' },
      body: {
        json: async () => ({}),
        text: async () => '',
        arrayBuffer: async () => buf,
      },
      trailers: {},
      opaque: null,
      context: {},
    } as any);

    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    const res = await client.get('https://acme-love.test/binary');
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it('enforces content length limit for JSON responses', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'content-length': '999999999' },
      body: {
        json: async () => ({}),
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0),
      },
      trailers: {},
      opaque: null,
      context: {},
    } as any);

    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    await expect(client.get('https://acme-love.test/big')).rejects.toThrow(
      'exceeds maximum allowed size',
    );
  });

  it('rejects http:// URLs', async () => {
    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    await expect(client.get('http://insecure.test/dir')).rejects.toThrow(
      'ACME protocol requires HTTPS',
    );
  });

  it('rejects invalid URLs', async () => {
    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    await expect(client.get('not-a-url')).rejects.toThrow('Invalid URL');
  });

  it('HEAD rejects http:// URLs', async () => {
    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    await expect(client.head('http://insecure.test/nonce')).rejects.toThrow(
      'ACME protocol requires HTTPS',
    );
  });

  it('POST rejects http:// URLs', async () => {
    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    await expect(client.post('http://insecure.test/new', {})).rejects.toThrow(
      'ACME protocol requires HTTPS',
    );
  });

  it('GET propagates network errors', async () => {
    mockRequest.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    await expect(client.get('https://acme-love.test/dir')).rejects.toThrow('ECONNREFUSED');
  });

  it('POST propagates network errors', async () => {
    mockRequest.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    await expect(client.post('https://acme-love.test/new', {})).rejects.toThrow('ECONNREFUSED');
  });

  it('HEAD propagates network errors', async () => {
    mockRequest.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    await expect(client.head('https://acme-love.test/nonce')).rejects.toThrow('ECONNREFUSED');
  });

  it('does not duplicate User-Agent if already present', async () => {
    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    await client.get('https://acme-love.test/dir', { 'User-Agent': 'custom/1.0' });
    const call = mockRequest.mock.calls[0] as [string, any];
    const headers = call[1].headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('custom/1.0');
  });

  it('handles content-type as array', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': ['application/json', 'charset=utf-8'] },
      body: {
        json: async () => ({ multi: true }),
        text: async () => '{}',
        arrayBuffer: async () => new ArrayBuffer(0),
      },
      trailers: {},
      opaque: null,
      context: {},
    } as any);

    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    const res = await client.get('https://acme-love.test/multi');
    expect(res.body).toEqual({ multi: true });
  });

  it('handles missing content-type header', async () => {
    const buf = new ArrayBuffer(2);
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      headers: {},
      body: {
        json: async () => ({}),
        text: async () => '',
        arrayBuffer: async () => buf,
      },
      trailers: {},
      opaque: null,
      context: {},
    } as any);

    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    const res = await client.get('https://acme-love.test/no-ct');
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it('handles 429 rate limit response without crashing', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '60' },
      body: {
        json: async () => ({ type: 'rateLimited', detail: 'slow down' }),
        text: async () => '{}',
        arrayBuffer: async () => new ArrayBuffer(0),
      },
      trailers: {},
      opaque: null,
      context: {},
    } as any);

    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    const res = await client.get('https://acme-love.test/limited');
    expect(res.statusCode).toBe(429);
  });

  it('handles 503 service unavailable response', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 503,
      headers: { 'content-type': 'text/plain', 'Retry-After': '30' },
      body: {
        json: async () => ({}),
        text: async () => 'Service Unavailable',
        arrayBuffer: async () => new ArrayBuffer(0),
      },
      trailers: {},
      opaque: null,
      context: {},
    } as any);

    const AcmeHttpClient = await loadClient();
    const client = new AcmeHttpClient();
    const res = await client.get('https://acme-love.test/maint');
    expect(res.statusCode).toBe(503);
    expect(res.body).toBe('Service Unavailable');
  });
});
