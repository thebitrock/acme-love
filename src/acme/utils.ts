import type { HttpResponse } from './http/http-client.js';

export async function safeReadBody(res: HttpResponse<any>): Promise<object | null> {
  const body = res.data;

  try {
    if (typeof body === 'object' && body !== null) {
      if ('json' in body && typeof (body as { json: () => Promise<unknown> }).json === 'function') {
        return await body.json();
      }

      if ('text' in body && typeof (body as { text: () => Promise<string> }).text === 'function') {
        const txt = await body.text();

        return JSON.parse(txt);
      }

      return body;
    }

    if (typeof body === 'string') {
      return JSON.parse(body);
    }

    return null;
  } catch {
    return null;
  }
}
