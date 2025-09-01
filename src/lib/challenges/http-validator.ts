/**
 * RFC 8555 ACME HTTP-01 Challenge Validator
 *
 * HTTP-01 challenge validation for ACME protocol according to RFC 8555 Section 8.3.
 * Features:
 * - Standard HTTP challenge file validation
 * - Redirect following with limits
 * - Configurable timeouts and options
 * - Comprehensive error reporting
 * - Key authorization validation
 */

import { request } from 'undici';

/**
 * Result of HTTP-01 challenge validation
 */
export interface AcmeHttpValidationResult {
  /** Validation success status */
  ok: boolean;
  /** Actual response content from challenge URL */
  content?: string;
  /** HTTP response status code */
  statusCode?: number;
  /** Validation failure reasons */
  reasons?: string[];
}

/**
 * Options for HTTP-01 challenge validation
 */
export interface AcmeHttpValidationOptions {
  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Follow HTTP redirects with max 3 hops (default: true) */
  followRedirects?: boolean;
  /** Custom User-Agent header for requests */
  userAgent?: string;
}

/**
 * Validate HTTP-01 challenge by fetching the challenge file
 *
 * RFC 8555 Section 8.3: The ACME server validates the challenge by performing
 * an HTTP GET request to the challenge URL.
 *
 * @param domain The domain being validated
 * @param token The challenge token from ACME server
 * @param expectedKeyAuth The expected key authorization value
 * @param opts Validation options
 */
export async function validateHttp01Challenge(
  domain: string,
  token: string,
  expectedKeyAuth?: string,
  opts: AcmeHttpValidationOptions = {},
): Promise<AcmeHttpValidationResult> {
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
  opts: AcmeHttpValidationOptions = {},
): Promise<AcmeHttpValidationResult> {
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
