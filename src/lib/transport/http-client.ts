import { request, type Dispatcher } from 'undici';
import { debugHttp } from '../utils/debug.js';
import { buildUserAgent } from '../utils/user-agent.js';

// Extend ResponseData with parsed body
export interface ParsedResponseData extends Omit<Dispatcher.ResponseData, 'body'> {
  body: unknown;
}

/**
 * RFC 8555 compliant HTTP transport layer
 *
 * High-performance HTTP client specifically designed for ACME protocol communication.
 * Features:
 * - Automatic User-Agent injection
 * - Content-type aware body parsing (JSON, text, binary)
 * - Comprehensive debug logging
 * - Support for JSON, text, and binary responses
 * - Optimized for ACME protocol requirements
 * - Undici-based for maximum performance
 */
export class AcmeHttpClient {
  private static userAgent = buildUserAgent();

  private ensureUserAgent(headers: Record<string, string>): Record<string, string> {
    const hasUA = Object.keys(headers).some((k) => k.toLowerCase() === 'user-agent');
    if (!hasUA) {
      headers['User-Agent'] = AcmeHttpClient.userAgent;
    }
    return headers;
  }

  async get(url: string, headers: Record<string, string> = {}): Promise<ParsedResponseData> {
    headers = this.ensureUserAgent({ ...headers });
    debugHttp('GET %s init headers=%j', url, headers);
    const start = Date.now();

    try {
      const res = await request(url, { method: 'GET', headers });
      debugHttp(
        'GET %s response status=%d durationMs=%d content-type=%s headers=%j',
        url,
        res.statusCode,
        Date.now() - start,
        res.headers['content-type'],
        res.headers,
      );

      this.logRateLimit('GET', url, res.statusCode, res.headers);

      const data = await this.parseResponseBody(res.headers, res.body);
      debugHttp('GET %s response body=%j', url, data);

      return { ...res, body: data };
    } catch (err) {
      debugHttp('GET %s error: %s', url, (err as Error).message);
      throw err;
    }
  }

  async post<T>(
    url: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<Omit<Dispatcher.ResponseData, 'body'> & { body: T }> {
    headers = this.ensureUserAgent({ ...headers });
    let serializedBody: string | Uint8Array | Buffer | null;

    if (typeof body === 'undefined') {
      serializedBody = null;
    } else if (
      typeof body === 'string' ||
      body instanceof Uint8Array ||
      (typeof Buffer !== 'undefined' && body instanceof Buffer) ||
      body === null
    ) {
      serializedBody = body as string | Uint8Array | Buffer | null;
    } else if (body instanceof ArrayBuffer) {
      serializedBody = new Uint8Array(body);
    } else {
      serializedBody = JSON.stringify(body);
    }

    const bodyDesc = this.describeBodyForDebug(serializedBody);
    debugHttp('POST %s init headers=%j body=%j', url, headers, bodyDesc);
    const start = Date.now();

    try {
      const res = await request(url, {
        method: 'POST',
        headers,
        body: serializedBody,
      });
      debugHttp(
        'POST %s response status=%d durationMs=%d content-type=%s headers=%j',
        url,
        res.statusCode,
        Date.now() - start,
        res.headers['content-type'],
        res.headers,
      );

      this.logRateLimit('POST', url, res.statusCode, res.headers);

      const data = await this.parseResponseBody(res.headers, res.body);
      debugHttp('POST %s response body=%j', url, data);

      return { ...res, body: data as T };
    } catch (err) {
      debugHttp('POST %s network error: %s', url, (err as Error).message);
      throw err;
    }
  }

  async head(
    url: string,
    headers: Record<string, string> = {},
  ): Promise<Omit<Dispatcher.ResponseData, 'body'> & { body: void }> {
    headers = this.ensureUserAgent({ ...headers });
    debugHttp('HEAD %s init headers=%j', url, headers);
    const start = Date.now();

    try {
      const res = await request(url, { method: 'HEAD', headers });
      debugHttp(
        'HEAD %s response status=%d durationMs=%d headers=%j',
        url,
        res.statusCode,
        Date.now() - start,
        res.headers,
      );

      this.logRateLimit('HEAD', url, res.statusCode, res.headers);

      // Return undici response format but with undefined body for HEAD
      return {
        ...res,
        body: undefined,
      };
    } catch (err) {
      debugHttp('HEAD %s error: %s', url, (err as Error).message);
      throw err;
    }
  }

  private async parseResponseBody(
    headers: Record<string, string | string[] | undefined>,
    body: Dispatcher.ResponseData['body'],
  ): Promise<unknown> {
    const rawCt = headers['content-type'];
    const ct = (Array.isArray(rawCt) ? rawCt[0] : rawCt)?.toLowerCase() ?? '';

    if (ct.includes('application/json') || ct.includes('application/problem+json')) {
      return body.json();
    }
    if (ct.startsWith('text/') || ct.includes('application/pem-certificate-chain')) {
      return body.text();
    }
    // Binary fallback
    const buf = await body.arrayBuffer();
    return Buffer.from(buf);
  }

  private logRateLimit(
    method: string,
    url: string,
    statusCode: number,
    headers: Record<string, string | string[] | undefined>,
  ): void {
    if (statusCode === 429 || statusCode === 503) {
      const retryAfter = headers['retry-after'] || headers['Retry-After'];
      debugHttp(
        'RATE LIMIT DETECTED: %s %s status=%d retry-after=%s',
        method,
        url,
        statusCode,
        retryAfter || 'NOT_SET',
      );
    }
  }

  private describeBodyForDebug(body: string | Uint8Array | Buffer | null): unknown {
    if (body === null) return { type: 'null' };
    if (typeof body === 'string') {
      return {
        type: 'string',
        length: body.length,
        preview: body.length > 120 ? body.slice(0, 120) + '…' : body,
      };
    }
    if (body instanceof Uint8Array) {
      // Covers Buffer too since Buffer extends Uint8Array in Node.js
      const isBuffer = typeof Buffer !== 'undefined' && body instanceof Buffer;
      return { type: isBuffer ? 'buffer' : 'uint8array', length: body.length };
    }
    return { type: typeof body };
  }
}
