/**
 * RFC 8555 ACME Order and Challenge Types
 *
 * Type definitions for ACME orders, authorizations, and challenges
 * according to RFC 8555 specifications.
 */

// Import modern types
import type {
  AcmeOrderStatus,
  AcmeAuthorizationStatus,
  AcmeChallengeStatus,
  AcmeChallengeType,
} from './status.js';

// Re-export for convenience
export type {
  AcmeOrderStatus,
  AcmeAuthorizationStatus,
  AcmeChallengeStatus,
  AcmeChallengeType,
} from './status.js';

/**
 * ACME Identifier
 */
export interface AcmeIdentifier {
  /** Type of identifier (usually 'dns') */
  type: string;
  /** The identifier value (domain name) */
  value: string;
}

/**
 * ACME Challenge according to RFC 8555
 */
export interface AcmeChallenge {
  /** Challenge type */
  type: AcmeChallengeType;
  /** Challenge URL */
  url: string;
  /** Challenge status */
  status: AcmeChallengeStatus;
  /** Challenge token */
  token: string;
  /** Validation timestamp */
  validated?: string;
  /** Error information if validation failed */
  error?: unknown;
}

/**
 * ACME Authorization according to RFC 8555
 */
export interface AcmeAuthorization {
  /** Authorization identifier */
  identifier: AcmeIdentifier;
  /** Authorization status */
  status: AcmeAuthorizationStatus;
  /** Expiration timestamp */
  expires?: string;
  /** Available challenges */
  challenges: AcmeChallenge[];
  /** Wildcard authorization flag */
  wildcard?: boolean;
}

/**
 * ACME Order according to RFC 8555
 */
export interface AcmeOrder {
  /** Order status */
  status: AcmeOrderStatus;
  /** Order expiration */
  expires?: string;
  /** Identifiers for this order */
  identifiers: AcmeIdentifier[];
  /** Authorization URLs */
  authorizations: string[];
  /** Finalize URL for CSR submission */
  finalize: string;
  /** Certificate URL (available when status is 'valid') */
  certificate?: string;
  /** Order URL (set by client) */
  url?: string;
  /** Error information if order failed */
  error?: unknown;
}

// Backward compatibility with old naming
export type ACMEOrder = AcmeOrder;
export type ACMEChallenge = AcmeChallenge;
export type ACMEAuthorization = AcmeAuthorization;
