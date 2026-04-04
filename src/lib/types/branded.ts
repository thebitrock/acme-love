/**
 * Branded (Opaque) Types for ACME Protocol Values
 *
 * These types prevent accidental mixing of semantically different string values
 * at compile time. Each type extends `string` so it's usable everywhere a string
 * is expected, but a plain `string` cannot be assigned to a branded type without
 * an explicit cast via the helper functions below.
 *
 * @example
 * ```typescript
 * const nonce = asNonce('abc123');
 * const url = asAccountUrl('https://acme.test/acct/1');
 *
 * // OK: branded types are assignable to string
 * const s: string = nonce;
 *
 * // ERROR: string is not assignable to branded type
 * const n: Nonce = 'plain-string';
 *
 * // ERROR: different branded types are not interchangeable
 * const u: AccountUrl = nonce;
 * ```
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ---------------------------------------------------------------------------
// Branded string types
// ---------------------------------------------------------------------------

/** ACME account URL (kid) — e.g. `https://acme.test/acct/123` */
export type AccountUrl = Brand<string, 'AccountUrl'>;

/** Replay-nonce value for anti-replay protection (RFC 8555 §6.5) */
export type Nonce = Brand<string, 'Nonce'>;

/** Base64url-encoded string without padding */
export type Base64UrlString = Brand<string, 'Base64UrlString'>;

/** PEM-encoded certificate or key */
export type PemString = Brand<string, 'PemString'>;

/** ACME challenge token (base64url, RFC 8555 §8.1) */
export type ChallengeToken = Brand<string, 'ChallengeToken'>;

/** HTTPS URL pointing to an ACME directory */
export type DirectoryUrl = Brand<string, 'DirectoryUrl'>;

// ---------------------------------------------------------------------------
// Branding helpers — use these at trust boundaries (API entry points,
// after validation, after parsing server responses).
// ---------------------------------------------------------------------------

export function asAccountUrl(s: string): AccountUrl {
  return s as AccountUrl;
}

export function asNonce(s: string): Nonce {
  return s as Nonce;
}

export function asBase64Url(s: string): Base64UrlString {
  return s as Base64UrlString;
}

export function asPem(s: string): PemString {
  return s as PemString;
}

export function asChallengeToken(s: string): ChallengeToken {
  return s as ChallengeToken;
}

export function asDirectoryUrl(s: string): DirectoryUrl {
  return s as DirectoryUrl;
}
