/**
 * RFC 8555 ACME Account Types
 *
 * Type definitions for ACME account management according to RFC 8555
 */

/**
 * ACME Account Status
 */
export type AcmeAccountStatus = 'valid' | 'deactivated' | 'revoked';

/**
 * ACME Account object according to RFC 8555 Section 7.3
 */
export interface AcmeAccountObject {
  /** Account status */
  status: AcmeAccountStatus;
  /** Contact information */
  contact?: string[];
  /** Terms of service agreement */
  termsOfServiceAgreed?: boolean;
  /** External account binding */
  externalAccountBinding?: any;
  /** Account creation date */
  createdAt?: string;
  /** Account orders URL */
  orders?: string;
}

/**
 * ACME Account registration response
 */
export interface AcmeAccountResponse {
  /** Account URL */
  accountUrl: string;
  /** Account object */
  account: AcmeAccountObject;
}

/**
 * ACME Problem Details according to RFC 7807
 */
export interface AcmeProblemDetails {
  /** Problem type URI */
  type: string;
  /** Human-readable problem description */
  detail: string;
  /** HTTP status code */
  status?: number;
  /** Problem instance URI */
  instance?: string;
  /** Additional problem-specific data */
  [key: string]: any;
}
