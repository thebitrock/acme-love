/**
 * ACME Status Constants
 *
 * Constants for ACME entity statuses according to RFC 8555.
 * Using these constants instead of string literals provides type safety
 * and prevents typos in status comparisons.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.6
 */

/**
 * ACME Order Status Constants
 *
 * Order status transitions:
 * pending -> ready -> processing -> valid
 *            |-> invalid (on error or expiration)
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.3
 */
export const ACME_ORDER_STATUS = {
  /** Order is pending and awaiting authorization validation */
  PENDING: 'pending' as const,
  /** Order is ready for finalization (all authorizations valid) */
  READY: 'ready' as const,
  /** Order is being processed by the server */
  PROCESSING: 'processing' as const,
  /** Order is valid and certificate is available */
  VALID: 'valid' as const,
  /** Order has failed and cannot be completed */
  INVALID: 'invalid' as const,
} as const;

/**
 * ACME Authorization Status Constants
 *
 * Authorization status transitions:
 * pending -> (valid|invalid) -> (expired|deactivated|revoked)
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.4
 */
export const ACME_AUTHORIZATION_STATUS = {
  /** Authorization is pending challenge validation */
  PENDING: 'pending' as const,
  /** Authorization is valid and can be used for certificate issuance */
  VALID: 'valid' as const,
  /** Authorization failed validation and is invalid */
  INVALID: 'invalid' as const,
  /** Authorization was deactivated by the client */
  DEACTIVATED: 'deactivated' as const,
  /** Authorization has expired */
  EXPIRED: 'expired' as const,
  /** Authorization was revoked by the server */
  REVOKED: 'revoked' as const,
} as const;

/**
 * ACME Challenge Status Constants
 *
 * Challenge status transitions:
 * pending -> processing -> (valid|invalid)
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.5
 */
export const ACME_CHALLENGE_STATUS = {
  /** Challenge is pending and awaiting client response */
  PENDING: 'pending' as const,
  /** Challenge is being validated by the server */
  PROCESSING: 'processing' as const,
  /** Challenge validation succeeded */
  VALID: 'valid' as const,
  /** Challenge validation failed */
  INVALID: 'invalid' as const,
} as const;

/**
 * ACME Challenge Type Constants
 *
 * Standard challenge types defined in RFC 8555 and related RFCs.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-8
 */
export const ACME_CHALLENGE_TYPE = {
  /** HTTP-01 challenge for domain validation via HTTP */
  HTTP_01: 'http-01' as const,
  /** DNS-01 challenge for domain validation via DNS TXT records */
  DNS_01: 'dns-01' as const,
  /** TLS-ALPN-01 challenge for domain validation via TLS extension */
  TLS_ALPN_01: 'tls-alpn-01' as const,
} as const;

/**
 * Type aliases for status constant values
 */
export type AcmeOrderStatusValue = (typeof ACME_ORDER_STATUS)[keyof typeof ACME_ORDER_STATUS];
export type AcmeAuthorizationStatusValue =
  (typeof ACME_AUTHORIZATION_STATUS)[keyof typeof ACME_AUTHORIZATION_STATUS];
export type AcmeChallengeStatusValue =
  (typeof ACME_CHALLENGE_STATUS)[keyof typeof ACME_CHALLENGE_STATUS];
export type AcmeChallengeTypeValue = (typeof ACME_CHALLENGE_TYPE)[keyof typeof ACME_CHALLENGE_TYPE];
