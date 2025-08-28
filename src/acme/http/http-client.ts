import { request } from 'undici';
import { debugHttp } from '../debug.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string | string[]>;
  data: T;
}

export class SimpleHttpClient {
  private static userAgent = SimpleHttpClient.initUserAgent();

  private static initUserAgent(): string {
    try {
      // dist layout: dist/acme/http/http-client.js -> go up 3 to reach dist/, then package.json is two levels up? Actually source at runtime: dist/src/acme/http/http-client.js => adjust relative
      // Use URL resolution relative to this file, then walk up to package.json
      const __filename = fileURLToPath(import.meta.url);
      const pkgPath = findPackageJson(dirname(__filename));
      if (pkgPath) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string; version?: string; homepage?: string };
        const name = pkg.name || 'acme-love';
        const version = pkg.version || '0.0.0-dev';
        const homepage = pkg.homepage || 'https://github.com/thebitrock/acme-love';
        return `${name}/${version} (+${homepage}; Node/${process.version.replace(/^v/, '')})`;
      }
    } catch (e) {
      debugHttp('User-Agent init error: %s', (e as Error).message);
    }
    return 'acme-love (version-unknown)';
  }

  private ensureUserAgent(headers: Record<string, string>): Record<string, string> {
    const hasUA = Object.keys(headers).some(k => k.toLowerCase() === 'user-agent');
    if (!hasUA) {
      headers['User-Agent'] = SimpleHttpClient.userAgent;
    }
    return headers;
  }

  async get<T>(url: string, headers: Record<string, string> = {}): Promise<HttpResponse<T>> {
    headers = this.ensureUserAgent({ ...headers });
    debugHttp('GET %s init headers=%j', url, headers);
    let res;
    let data: unknown;
    const start = Date.now();
    try {
      res = await request(url, { method: 'GET', headers });
      debugHttp('GET %s response status=%d durationMs=%d content-type=%s', url, res.statusCode, Date.now() - start, res.headers['content-type']);
      try {
        data = await res.body.json();
        debugHttp('GET %s parsed json ok', url);
      } catch (e) {
        debugHttp('GET %s json parse failed: %s', url, (e as Error).message);
        throw e;
      }
    } catch (err) {
      debugHttp('GET %s error: %s', url, (err as Error).message);
      throw err;
    }

    return {
      status: res.statusCode,
      headers: this.normalizeHeaders(res.headers),
      data: data as T,
    };
  }

  async post<T>(
    url: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<HttpResponse<T>> {
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
    let res;
    try {
      res = await request(url, {
        method: 'POST',
        headers,
        body: serializedBody,
      });
      debugHttp('POST %s response status=%d durationMs=%d content-type=%s', url, res.statusCode, Date.now() - start, res.headers['content-type']);
    } catch (err) {
      debugHttp('POST %s network error: %s', url, (err as Error).message);
      throw err;
    }

    const rawCt = res.headers["content-type"];
    const ct = (Array.isArray(rawCt) ? rawCt[0] : rawCt)?.toLowerCase() ?? "";

    let data: unknown;
    try {
      if (ct.includes("application/json") || ct.includes("application/problem+json")) {
        data = await res.body.json();
        debugHttp('POST %s parsed json', url);
      } else if (ct.startsWith("text/") || ct.includes("application/pem-certificate-chain")) {
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

    return {
      status: res.statusCode,
      headers: this.normalizeHeaders(res.headers),
      data: data as T,
    };
  }

  async head(url: string, headers: Record<string, string> = {}): Promise<HttpResponse<void>> {
  headers = this.ensureUserAgent({ ...headers });
    debugHttp('HEAD %s init headers=%j', url, headers);
    const start = Date.now();
    let res;
    try {
      res = await request(url, { method: 'HEAD', headers });
      debugHttp('HEAD %s response status=%d durationMs=%d', url, res.statusCode, Date.now() - start);
    } catch (err) {
      debugHttp('HEAD %s error: %s', url, (err as Error).message);
      throw err;
    }

    return {
      status: res.statusCode,
      headers: this.normalizeHeaders(res.headers),
      data: undefined,
    };
  }

  private normalizeHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'undefined') {
        continue;
      }

      result[key] = value;
    }

    return result;
  }

  private describeBodyForDebug(body: string | Uint8Array | Buffer | null): any {
    if (body === null) return { type: 'null' };
    if (typeof body === 'string') {
      return { type: 'string', length: body.length, preview: body.length > 120 ? body.slice(0, 120) + '…' : body };
    }
    if (body instanceof Uint8Array) {
      // Covers Buffer too since Buffer extends Uint8Array in Node.js
      const isBuffer = typeof Buffer !== 'undefined' && body instanceof Buffer;
      return { type: isBuffer ? 'buffer' : 'uint8array', length: body.length };
    }
    return { type: typeof body };
  }
}

// Helper to locate nearest package.json walking up dirs (limited depth)
function findPackageJson(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 6; i++) { // limit to prevent infinite loop
    const candidate = join(dir, 'package.json');
    try {
      readFileSync(candidate);
      return candidate;
    } catch { /* continue up */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
