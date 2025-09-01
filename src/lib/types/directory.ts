/**
 * RFC 8555 ACME Directory Types
 *
 * Type definitions for ACME directory discovery according to RFC 8555 Section 7.1.1
 */

/**
 * ACME Directory structure as defined in RFC 8555
 *
 * The directory provides URLs for all ACME operations and optional metadata
 * about the ACME server's capabilities and requirements.
 */
export interface AcmeDirectory {
  /** URL for new nonce requests (RFC 8555 Section 7.2) */
  newNonce: string;

  /** URL for new account registration (RFC 8555 Section 7.3) */
  newAccount: string;

  /** URL for new order creation (RFC 8555 Section 7.4) */
  newOrder: string;

  /** URL for new authorization (optional, RFC 8555 Section 7.5) */
  newAuthz?: string;

  /** URL for certificate revocation (RFC 8555 Section 7.6) */
  revokeCert: string;

  /** URL for key change operations (RFC 8555 Section 7.3.5) */
  keyChange: string;

  /** Optional metadata about the ACME server */
  meta?: AcmeDirectoryMeta;
}

/**
 * ACME Directory metadata as defined in RFC 8555
 */
export interface AcmeDirectoryMeta {
  /** URL of the terms of service */
  termsOfService?: string;

  /** Website URL for the ACME server */
  website?: string;

  /** CAA identities for this ACME server */
  caaIdentities?: string[];

  /** Whether external account binding is required */
  externalAccountRequired?: boolean;
}
