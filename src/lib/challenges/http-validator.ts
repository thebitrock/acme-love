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
import { isIP } from 'net';
import { buildUserAgent } from '../utils/user-agent.js';

/** RFC 1123 hostname pattern (labels separated by dots, no trailing dot). */
const HOSTNAME_RE = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})*$/;

/** Private/reserved IPv4 CIDR prefixes that must be blocked to prevent SSRF. */
const PRIVATE_IPV4_PREFIXES = [
  '127.',
  '10.',
  '0.',
  '169.254.',
  // 172.16.0.0/12
  ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.`),
  // 192.168.0.0/16
  '192.168.',
];

function isPrivateOrReservedIP(host: string): boolean {
  if (
    host === '::1' ||
    host === '::' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd')
  ) {
    return true;
  }
  return PRIVATE_IPV4_PREFIXES.some((prefix) => host.startsWith(prefix));
}

function validateDomain(domain: string): void {
  if (isIP(domain) !== 0) {
    if (isPrivateOrReservedIP(domain)) {
      throw new Error(`SSRF blocked: "${domain}" resolves to a private/reserved IP address`);
    }
    return; // public IP is allowed
  }
  if (!HOSTNAME_RE.test(domain)) {
    throw new Error(`Invalid domain name: "${domain}"`);
  }
  if (domain === 'localhost' || domain.endsWith('.localhost') || domain.endsWith('.local')) {
    throw new Error(`SSRF blocked: "${domain}" is a loopback/local domain`);
  }
}

function validateChallengeUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid protocol in challenge URL: ${parsed.protocol}`);
  }
  validateDomain(parsed.hostname);
}

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
  validateDomain(domain);
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
  const { timeoutMs = 4000, followRedirects = true, userAgent = buildUserAgent() } = opts;

  try {
    validateChallengeUrl(challengeUrl);
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
