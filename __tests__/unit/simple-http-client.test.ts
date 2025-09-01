import { describe, it, expect, jest } from '@jest/globals';

// ESM-friendly module factory using unstable_mockModule (ts-jest + ESM)
// Fallback to manual mock if unavailable.
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

// @ts-ignore - unstable_mockModule may not exist in older Jest versions
if (jest.unstable_mockModule) {
  // @ts-ignore - same reasoning; type not in published @types/jest yet
  jest.unstable_mockModule('undici', () => ({ request: mockRequest }));
} else {
  jest.mock('undici', () => ({ request: mockRequest }));
}

// Dynamically import after mock registration
async function loadClient() {
  // Import from public entrypoint to ensure surface stability
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
});
