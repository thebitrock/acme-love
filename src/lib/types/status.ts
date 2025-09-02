/**
 * ACME Status Types and Constants
 *
 * Modern TypeScript approach combining type safety with runtime constants.
 * This approach provides both compile-time type checking and runtime validation
 * while maintaining excellent IntelliSense support and preventing typos.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.6
 */

/**
 * ACME Order Status
 *
 * Order status transitions according to RFC 8555:
 * pending -> ready -> processing -> valid
 *            |-> invalid (on error or expiration)
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.3
 */
export const ORDER_STATUS = {
  PENDING: 'pending',
  READY: 'ready',
  PROCESSING: 'processing',
  VALID: 'valid',
  INVALID: 'invalid',
} as const;

export type AcmeOrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/**
 * ACME Authorization Status
 *
 * Authorization status transitions according to RFC 8555:
 * pending -> (valid|invalid) -> (expired|deactivated|revoked)
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.4
 */
export const AUTHORIZATION_STATUS = {
  PENDING: 'pending',
  VALID: 'valid',
  INVALID: 'invalid',
  DEACTIVATED: 'deactivated',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
} as const;

export type AcmeAuthorizationStatus =
  (typeof AUTHORIZATION_STATUS)[keyof typeof AUTHORIZATION_STATUS];

/**
 * ACME Challenge Status
 *
 * Challenge status transitions according to RFC 8555:
 * pending -> processing -> (valid|invalid)
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.5
 */
export const CHALLENGE_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  VALID: 'valid',
  INVALID: 'invalid',
} as const;

export type AcmeChallengeStatus = (typeof CHALLENGE_STATUS)[keyof typeof CHALLENGE_STATUS];

/**
 * ACME Challenge Types
 *
 * Standard challenge types defined in RFC 8555 and related specifications.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-8
 */
export const CHALLENGE_TYPE = {
  HTTP_01: 'http-01',
  DNS_01: 'dns-01',
  TLS_ALPN_01: 'tls-alpn-01',
} as const;

export type AcmeChallengeType = (typeof CHALLENGE_TYPE)[keyof typeof CHALLENGE_TYPE];

/**
 * Type guards for runtime validation
 *
 * These functions provide type-safe runtime checking of status values.
 * They're useful for validating data from external sources or APIs.
 */

export function isAcmeOrderStatus(value: string): value is AcmeOrderStatus {
  return Object.values(ORDER_STATUS).includes(value as AcmeOrderStatus);
}

export function isAcmeAuthorizationStatus(value: string): value is AcmeAuthorizationStatus {
  return Object.values(AUTHORIZATION_STATUS).includes(value as AcmeAuthorizationStatus);
}

export function isAcmeChallengeStatus(value: string): value is AcmeChallengeStatus {
  return Object.values(CHALLENGE_STATUS).includes(value as AcmeChallengeStatus);
}

export function isAcmeChallengeType(value: string): value is AcmeChallengeType {
  return Object.values(CHALLENGE_TYPE).includes(value as AcmeChallengeType);
}

/**
 * Status transition validators
 *
 * These functions validate whether a status transition is valid according to RFC 8555.
 */

export function isValidOrderStatusTransition(from: AcmeOrderStatus, to: AcmeOrderStatus): boolean {
  const validTransitions: Record<AcmeOrderStatus, AcmeOrderStatus[]> = {
    [ORDER_STATUS.PENDING]: [ORDER_STATUS.READY, ORDER_STATUS.INVALID],
    [ORDER_STATUS.READY]: [ORDER_STATUS.PROCESSING, ORDER_STATUS.INVALID],
    [ORDER_STATUS.PROCESSING]: [ORDER_STATUS.VALID, ORDER_STATUS.INVALID],
    [ORDER_STATUS.VALID]: [], // Terminal state
    [ORDER_STATUS.INVALID]: [], // Terminal state
  };

  return validTransitions[from]?.includes(to) ?? false;
}

export function isValidAuthorizationStatusTransition(
  from: AcmeAuthorizationStatus,
  to: AcmeAuthorizationStatus,
): boolean {
  const validTransitions: Record<AcmeAuthorizationStatus, AcmeAuthorizationStatus[]> = {
    [AUTHORIZATION_STATUS.PENDING]: [AUTHORIZATION_STATUS.VALID, AUTHORIZATION_STATUS.INVALID],
    [AUTHORIZATION_STATUS.VALID]: [
      AUTHORIZATION_STATUS.EXPIRED,
      AUTHORIZATION_STATUS.DEACTIVATED,
      AUTHORIZATION_STATUS.REVOKED,
    ],
    [AUTHORIZATION_STATUS.INVALID]: [
      AUTHORIZATION_STATUS.EXPIRED,
      AUTHORIZATION_STATUS.DEACTIVATED,
      AUTHORIZATION_STATUS.REVOKED,
    ],
    [AUTHORIZATION_STATUS.DEACTIVATED]: [], // Terminal state
    [AUTHORIZATION_STATUS.EXPIRED]: [], // Terminal state
    [AUTHORIZATION_STATUS.REVOKED]: [], // Terminal state
  };

  return validTransitions[from]?.includes(to) ?? false;
}

export function isValidChallengeStatusTransition(
  from: AcmeChallengeStatus,
  to: AcmeChallengeStatus,
): boolean {
  const validTransitions: Record<AcmeChallengeStatus, AcmeChallengeStatus[]> = {
    [CHALLENGE_STATUS.PENDING]: [CHALLENGE_STATUS.PROCESSING, CHALLENGE_STATUS.INVALID],
    [CHALLENGE_STATUS.PROCESSING]: [CHALLENGE_STATUS.VALID, CHALLENGE_STATUS.INVALID],
    [CHALLENGE_STATUS.VALID]: [], // Terminal state
    [CHALLENGE_STATUS.INVALID]: [], // Terminal state
  };

  return validTransitions[from]?.includes(to) ?? false;
}
