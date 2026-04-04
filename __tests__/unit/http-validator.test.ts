import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock undici before imports
const mockRequest = jest.fn<any>();
jest.unstable_mockModule('undici', () => ({ request: mockRequest }));

// Dynamic import after mock
const { validateHttp01Challenge, validateHttp01ChallengeByUrl } =
  await import('../../src/lib/challenges/http-validator.js');

function mockResponse(statusCode: number, body: string) {
  return {
    statusCode,
    headers: { 'content-type': 'text/plain' },
    body: { text: async () => body },
  };
}

describe('validateHttp01Challenge', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('validates matching key authorization', async () => {
    mockRequest.mockResolvedValue(mockResponse(200, 'expected-key-auth'));
    const result = await validateHttp01Challenge('example.com', 'token123', 'expected-key-auth');
    expect(result.ok).toBe(true);
    expect(result.content).toBe('expected-key-auth');
    expect(result.statusCode).toBe(200);
  });

  it('returns ok without expected value', async () => {
    mockRequest.mockResolvedValue(mockResponse(200, 'some-content'));
    const result = await validateHttp01Challenge('example.com', 'token123');
    expect(result.ok).toBe(true);
    expect(result.content).toBe('some-content');
  });

  it('fails on content mismatch', async () => {
    mockRequest.mockResolvedValue(mockResponse(200, 'wrong-value'));
    const result = await validateHttp01Challenge('example.com', 'token123', 'expected-value');
    expect(result.ok).toBe(false);
    expect(result.reasons).toBeDefined();
    expect(result.reasons![0]).toContain('mismatch');
  });

  it('fails on non-200 status', async () => {
    mockRequest.mockResolvedValue(mockResponse(404, 'not found'));
    const result = await validateHttp01Challenge('example.com', 'token123', 'expected');
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
    expect(result.reasons![0]).toContain('404');
  });

  it('handles network error', async () => {
    mockRequest.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await validateHttp01Challenge('example.com', 'token123');
    expect(result.ok).toBe(false);
    expect(result.reasons![0]).toContain('ECONNREFUSED');
  });

  it('trims whitespace from response content', async () => {
    mockRequest.mockResolvedValue(mockResponse(200, '  expected-value  \n'));
    const result = await validateHttp01Challenge('example.com', 'token', 'expected-value');
    expect(result.ok).toBe(true);
    expect(result.content).toBe('expected-value');
  });

  it('constructs correct URL', async () => {
    mockRequest.mockResolvedValue(mockResponse(200, 'auth'));
    await validateHttp01Challenge('example.com', 'my-token');
    expect(mockRequest).toHaveBeenCalledWith(
      'http://example.com/.well-known/acme-challenge/my-token',
      expect.any(Object),
    );
  });
});

describe('validateHttp01ChallengeByUrl', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('validates with direct URL', async () => {
    mockRequest.mockResolvedValue(mockResponse(200, 'key-auth'));
    const result = await validateHttp01ChallengeByUrl(
      'http://example.com/.well-known/acme-challenge/token',
      'key-auth',
    );
    expect(result.ok).toBe(true);
  });

  it('uses custom timeout', async () => {
    mockRequest.mockResolvedValue(mockResponse(200, 'ok'));
    await validateHttp01ChallengeByUrl('http://example.com/test', undefined, { timeoutMs: 1000 });
    const callOpts = mockRequest.mock.calls[0][1] as any;
    expect(callOpts.bodyTimeout).toBe(1000);
    expect(callOpts.headersTimeout).toBe(1000);
  });

  it('uses custom user agent', async () => {
    mockRequest.mockResolvedValue(mockResponse(200, 'ok'));
    await validateHttp01ChallengeByUrl('http://example.com/test', undefined, {
      userAgent: 'custom/1.0',
    });
    const callOpts = mockRequest.mock.calls[0][1] as any;
    expect(callOpts.headers['User-Agent']).toBe('custom/1.0');
  });

  it('rejects private IPv6 addresses', async () => {
    for (const ip of ['::1', 'fe80::1', 'fc00::1', 'fd00::1']) {
      const result = await validateHttp01ChallengeByUrl(
        `http://[${ip}]/.well-known/acme-challenge/token`,
        'auth',
      );
      expect(result.ok).toBe(false);
      expect(result.reasons!.length).toBeGreaterThan(0);
    }
  });

  it('rejects private IPv4 addresses', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.1.1', '172.16.0.1', '192.168.1.1']) {
      const result = await validateHttp01ChallengeByUrl(
        `http://${ip}/.well-known/acme-challenge/token`,
        'auth',
      );
      expect(result.ok).toBe(false);
      expect(result.reasons![0]).toContain('SSRF');
    }
  });

  it('rejects invalid hostname', async () => {
    const result = await validateHttp01ChallengeByUrl(
      'http://not valid!/.well-known/acme-challenge/token',
      'auth',
    );
    expect(result.ok).toBe(false);
  });

  it('rejects localhost domain', async () => {
    const result = await validateHttp01ChallengeByUrl(
      'http://localhost/.well-known/acme-challenge/token',
      'auth',
    );
    expect(result.ok).toBe(false);
    expect(result.reasons![0]).toContain('SSRF');
  });

  it('rejects .local domain', async () => {
    const result = await validateHttp01ChallengeByUrl(
      'http://foo.local/.well-known/acme-challenge/token',
      'auth',
    );
    expect(result.ok).toBe(false);
    expect(result.reasons![0]).toContain('SSRF');
  });

  it('rejects .localhost subdomain', async () => {
    const result = await validateHttp01ChallengeByUrl(
      'http://sub.localhost/.well-known/acme-challenge/token',
      'auth',
    );
    expect(result.ok).toBe(false);
    expect(result.reasons![0]).toContain('SSRF');
  });

  it('rejects ftp protocol', async () => {
    const result = await validateHttp01ChallengeByUrl(
      'ftp://example.com/.well-known/acme-challenge/token',
      'auth',
    );
    expect(result.ok).toBe(false);
    expect(result.reasons![0]).toContain('protocol');
  });

  it('allows public IP address', async () => {
    mockRequest.mockResolvedValue(mockResponse(200, 'key-auth'));
    const result = await validateHttp01ChallengeByUrl(
      'http://8.8.8.8/.well-known/acme-challenge/token',
      'key-auth',
    );
    expect(result.ok).toBe(true);
  });
});
