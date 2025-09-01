import type { ParsedResponseData } from '../transport/http-client.js';

/**
 * Safely read and parse response body from ACME HTTP response
 *
 * @param res - Parsed response data from HTTP client
 * @returns Parsed JSON object or null if parsing fails
 */
export async function safeReadBody(res: ParsedResponseData): Promise<object | null> {
  const body = res.body;

  try {
    if (typeof body === 'object' && body !== null) {
      if ('json' in body && typeof (body as { json: () => Promise<unknown> }).json === 'function') {
        const result = await (body as { json: () => Promise<unknown> }).json();
        return typeof result === 'object' && result !== null ? result : null;
      }

      if ('text' in body && typeof (body as { text: () => Promise<string> }).text === 'function') {
        const txt = await (body as { text: () => Promise<string> }).text();

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
