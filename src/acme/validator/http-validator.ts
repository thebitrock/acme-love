// http-validator.ts
import { request } from 'undici';

export interface HttpValidationResult {
  ok: boolean;
  /** Actual response content */
  content?: string;
  /** HTTP status code */
  statusCode?: number;
  /** Reasons if ok === false */
  reasons?: string[];
}

export interface HttpValidationOptions {
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Follow redirects (max 3 hops) */
  followRedirects?: boolean;
  /** Custom User-Agent header */
  userAgent?: string;
}

/**
 * Validate HTTP-01 challenge by fetching the challenge file
 * @param domain The domain being validated
 * @param token The challenge token
 * @param expectedKeyAuth The expected key authorization value
 * @param opts Validation options
 */
export async function validateHttp01Challenge(
  domain: string,
  token: string,
  expectedKeyAuth?: string,
  opts: HttpValidationOptions = {},
): Promise<HttpValidationResult> {
  const url = `http://${domain}/.well-known/acme-challenge/${token}`;
  return validateHttp01ChallengeByUrl(url, expectedKeyAuth, opts);
}

/**
 * Convenience function to validate HTTP-01 challenge with URL
 * @param challengeUrl Full URL to the challenge file
 * @param expectedKeyAuth Expected key authorization value
 * @param opts Validation options
 */
export async function validateHttp01ChallengeByUrl(
  challengeUrl: string,
  expectedKeyAuth?: string,
  opts: HttpValidationOptions = {},
): Promise<HttpValidationResult> {
  const { timeoutMs = 4000, followRedirects = true, userAgent = 'acme-love/1.0' } = opts;

  try {
    const response = await request(challengeUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/plain',
      },
      bodyTimeout: timeoutMs,
      headersTimeout: timeoutMs,
      ...(followRedirects ? {} : { maxRedirections: 0 }),
    });

    const statusCode = response.statusCode;
    const content = await response.body.text();

    // Check if response is successful
    if (statusCode !== 200) {
      return {
        ok: false,
        content,
        statusCode,
        reasons: [`HTTP ${statusCode}: ${content || 'No content'}`],
      };
    }

    // If no expected value, just check that we got a response
    if (!expectedKeyAuth) {
      return {
        ok: true,
        content,
        statusCode,
      };
    }

    // Validate the content matches expected key authorization
    const trimmedContent = content.trim();
    if (trimmedContent === expectedKeyAuth) {
      return {
        ok: true,
        content: trimmedContent,
        statusCode,
      };
    }

    return {
      ok: false,
      content: trimmedContent,
      statusCode,
      reasons: [`Content mismatch: expected '${expectedKeyAuth}', got '${trimmedContent}'`],
    };
  } catch (error) {
    return {
      ok: false,
      reasons: [
        `Failed to fetch ${challengeUrl}: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}
