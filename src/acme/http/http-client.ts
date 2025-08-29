import { request, type Dispatcher } from 'undici';
import { debugHttp } from '../debug.js';
import { buildUserAgent } from '../utils.js';

// Extend ResponseData with parsed body
export interface ParsedResponseData extends Omit<Dispatcher.ResponseData, 'body'> {
  body: unknown;
}

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
        'GET %s response status=%d durationMs=%d content-type=%s',
        url,
        res.statusCode,
        Date.now() - start,
        res.headers['content-type'],
      );

      let data: unknown;
      try {
        data = await res.body.json();
        debugHttp('GET %s parsed json ok', url);
      } catch (e) {
        debugHttp('GET %s json parse failed: %s', url, (e as Error).message);
        throw e;
      }

      // Return undici response format but with parsed body
      return {
        ...res,
        body: data,
      };
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
        'POST %s response status=%d durationMs=%d content-type=%s',
        url,
        res.statusCode,
        Date.now() - start,
        res.headers['content-type'],
      );

      const rawCt = res.headers['content-type'];
      const ct = (Array.isArray(rawCt) ? rawCt[0] : rawCt)?.toLowerCase() ?? '';

      let data: unknown;
      try {
        if (ct.includes('application/json') || ct.includes('application/problem+json')) {
          data = await res.body.json();
          debugHttp('POST %s parsed json', url);
        } else if (ct.startsWith('text/') || ct.includes('application/pem-certificate-chain')) {
          data = await res.body.text();
          debugHttp('POST %s read text len=%d', url, typeof data === 'string' ? data.length : 0);
        } else {
          const buf = await res.body.arrayBuffer();
          data = Buffer.from(buf);
          debugHttp('POST %s read binary len=%d', url, (data as Buffer).length);
        }
      } catch (e) {
        debugHttp('POST %s body parse error: %s', url, (e as Error).message);
        throw e;
      }

      // Return undici response format but with parsed body
      return {
        ...res,
        body: data as T,
      };
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
        'HEAD %s response status=%d durationMs=%d',
        url,
        res.statusCode,
        Date.now() - start,
      );

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
