import { request } from 'undici';

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string | string[]>;
  data: T;
}

export class SimpleHttpClient {
  async get<T>(url: string, headers: Record<string, string> = {}): Promise<HttpResponse<T>> {
    console.log('HTTP GET', url, headers);
    const res = await request(url, { method: 'GET', headers });
    const data = await res.body.json();

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

    console.log('HTTP POST', url, headers);
    const res = await request(url, {
      method: 'POST',
      headers,
      body: serializedBody,
    });

    const rawCt = res.headers["content-type"];
    const ct = (Array.isArray(rawCt) ? rawCt[0] : rawCt)?.toLowerCase() ?? "";

    let data: unknown;
    if (ct.includes("application/json")) {
      console.log(`Unknown content-type (${ct}), returning raw data as JSON`);
      data = await res.body.json();
    } else if (ct.startsWith("text/") || ct.includes("application/pem-certificate-chain")) {
      console.log(`Unknown content-type (${ct}), returning raw data as text`);
      data = await res.body.text();
    } else {
      console.log(`Unknown content-type (${ct}), returning raw data as Buffer`);
      const buf = await res.body.arrayBuffer();
      data = Buffer.from(buf);
    }

    console.log(data);
    return {
      status: res.statusCode,
      headers: this.normalizeHeaders(res.headers),
      data: data as T,
    };
  }

  async head(url: string, headers: Record<string, string> = {}): Promise<HttpResponse<void>> {
    console.log('HTTP HEAD', url);
    const res = await request(url, { method: 'HEAD', headers });

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
}
