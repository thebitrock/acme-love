/**
 * ACME Error classes based on RFC 8555
 * This file contains error classes for all error types defined in RFC 8555 Section 6.7
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-6.7
 */

import * as ErrorTypes from './error-types.js';

/**
 * Base ACME Error class with standardized error type URN
 */
export class AcmeError extends Error {
  type: string;
  detail: string;
  subproblems?: AcmeError[];
  status?: number;
  instance?: string;

  constructor(detail: string, status?: number) {
    super(detail);
    this.name = this.constructor.name;
    this.detail = detail;
    this.status = status || 500; // Default to 500 if not provided
    this.type = 'urn:ietf:params:acme:error:serverInternal'; // Default type, will be overridden in child classes
  }

  /**
   * Returns error in RFC7807 format
   */
  toJSON(): object {
    const result: Record<string, any> = {
      type: this.type,
      detail: this.detail,
    };

    if (this.subproblems && this.subproblems.length > 0) {
      result.subproblems = this.subproblems.map((p) => p.toJSON());
    }

    if (this.instance) {
      result.instance = this.instance;
    }

    return result;
  }

  /**
   * Add a subproblem to this error
   * @param error The error to add as a subproblem
   */
  addSubproblem(error: AcmeError): this {
    if (!this.subproblems) {
      this.subproblems = [];
    }

    this.subproblems.push(error);

    return this;
  }
}

/**
 * Error indicating that the specified account does not exist
 */
export class AccountDoesNotExistError extends AcmeError {
  constructor(detail = 'The request specified an account that does not exist', status = 400) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_ACCOUNT_DOES_NOT_EXIST;
  }
}

/**
 * Error indicating that the certificate has already been revoked
 */
export class AlreadyRevokedError extends AcmeError {
  constructor(
    detail = 'The request specified a certificate to be revoked that has already been revoked',
    status = 400,
  ) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_ALREADY_REVOKED;
  }
}

/**
 * Error indicating that the CSR is unacceptable
 */
export class BadCSRError extends AcmeError {
  constructor(detail = 'The CSR is unacceptable (e.g., due to a short key)', status = 400) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_BAD_CSR;
  }
}

/**
 * Error indicating that the client sent an unacceptable anti-replay nonce
 */
export class BadNonceError extends AcmeError {
  constructor(detail = 'The client sent an unacceptable anti-replay nonce', status = 400) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_BAD_NONCE;
  }
}

/**
 * Error indicating that the JWS was signed by a public key the server does not support
 */
export class BadPublicKeyError extends AcmeError {
  constructor(
    detail = 'The JWS was signed by a public key the server does not support',
    status = 400,
  ) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_BAD_PUBLIC_KEY;
  }
}

/**
 * Error indicating that the revocation reason provided is not allowed by the server
 */
export class BadRevocationReasonError extends AcmeError {
  constructor(
    detail = 'The revocation reason provided is not allowed by the server',
    status = 400,
  ) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_BAD_REVOCATION_REASON;
  }
}

/**
 * Error indicating that the JWS was signed with an algorithm the server does not support
 */
export class BadSignatureAlgorithmError extends AcmeError {
  algorithms?: string[]; // List of supported algorithms

  constructor(
    detail = 'The JWS was signed with an algorithm the server does not support',
    status = 400,
    algorithms?: string[],
  ) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_BAD_SIGNATURE_ALGORITHM;
    this.algorithms = algorithms || [];
  }

  override toJSON(): object {
    const result = super.toJSON() as Record<string, unknown>;

    if (this.algorithms && this.algorithms.length > 0) {
      (result as Record<string, unknown | string[]>).algorithms = this.algorithms;
    }

    return result;
  }
}

/**
 * Error indicating that CAA records forbid the CA from issuing a certificate
 */
export class CAAError extends AcmeError {
  constructor(
    detail = 'Certification Authority Authorization (CAA) records forbid the CA from issuing a certificate',
    status = 400,
  ) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_CAA;
  }
}

/**
 * Error indicating that specific error conditions are indicated in the "subproblems" array
 */
export class CompoundError extends AcmeError {
  constructor(detail = 'Multiple errors occurred', status = 400) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_COMPOUND;
  }
}

/**
 * Error indicating that the server could not connect to validation target
 */
export class ConnectionError extends AcmeError {
  constructor(detail = 'The server could not connect to validation target', status = 400) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_CONNECTION;
  }
}

/**
 * Error indicating that there was a problem with a DNS query during identifier validation
 */
export class DNSError extends AcmeError {
  constructor(
    detail = 'There was a problem with a DNS query during identifier validation',
    status = 400,
  ) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_DNS;
  }
}

/**
 * Error indicating that the request must include a value for the "externalAccountBinding" field
 */
export class ExternalAccountRequiredError extends AcmeError {
  constructor(
    detail = 'The request must include a value for the "externalAccountBinding" field',
    status = 400,
  ) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_EXTERNAL_ACCOUNT_REQUIRED;
  }
}

/**
 * Error indicating that response received didn't match the challenge's requirements
 */
export class IncorrectResponseError extends AcmeError {
  constructor(
    detail = "Response received didn't match the challenge's requirements",
    status = 400,
  ) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_INCORRECT_RESPONSE;
  }
}

/**
 * Error indicating that a contact URL for an account was invalid
 */
export class InvalidContactError extends AcmeError {
  constructor(detail = 'A contact URL for an account was invalid', status = 400) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_INVALID_CONTACT;
  }
}

/**
 * Error indicating that the request message was malformed
 */
export class MalformedError extends AcmeError {
  constructor(detail = 'The request message was malformed', status = 400) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_MALFORMED;
  }
}

/**
 * Error indicating that the request attempted to finalize an order that is not ready to be finalized
 */
export class OrderNotReadyError extends AcmeError {
  constructor(
    detail = 'The request attempted to finalize an order that is not ready to be finalized',
    status = 400,
  ) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_ORDER_NOT_READY;
  }
}

/**
 * Error indicating that the request exceeds a rate limit
 */
export class RateLimitedError extends AcmeError {
  retryAfter: Date | undefined;

  constructor(detail = 'The request exceeds a rate limit', status = 429, retryAfter?: Date) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_RATE_LIMITED;
    this.retryAfter = retryAfter;
  }

  /**
   * Get the Retry-After value in seconds
   */
  getRetryAfterSeconds(): number | undefined {
    if (!this.retryAfter) {
      return undefined;
    }

    const now = new Date();
    const seconds = Math.ceil((this.retryAfter.getTime() - now.getTime()) / 1000);

    return Math.max(0, seconds);
  }

  override toJSON(): object {
    const result = super.toJSON() as Record<string, unknown>;

    if (this.retryAfter) {
      (result as Record<string, unknown | string>).retryAfter = this.retryAfter.toISOString();
    }

    return result;
  }
}

/**
 * Error indicating that the server will not issue certificates for the identifier
 */
export class RejectedIdentifierError extends AcmeError {
  constructor(detail = 'The server will not issue certificates for the identifier', status = 400) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_REJECTED_IDENTIFIER;
  }
}

/**
 * Error indicating that the server experienced an internal error
 */
export class ServerInternalError extends AcmeError {
  constructor(detail = 'The server experienced an internal error', status = 500) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_SERVER_INTERNAL;
  }
}

/**
 * Error indicating that the server received a TLS error during validation
 */
export class TLSError extends AcmeError {
  constructor(detail = 'The server received a TLS error during validation', status = 400) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_TLS;
  }
}

/**
 * Error indicating that the client lacks sufficient authorization
 */
export class UnauthorizedError extends AcmeError {
  constructor(detail = 'The client lacks sufficient authorization', status = 401) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_UNAUTHORIZED;
  }
}

/**
 * Error indicating that a contact URL for an account used an unsupported protocol scheme
 */
export class UnsupportedContactError extends AcmeError {
  constructor(
    detail = 'A contact URL for an account used an unsupported protocol scheme',
    status = 400,
  ) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_UNSUPPORTED_CONTACT;
  }
}

/**
 * Error indicating that an identifier is of an unsupported type
 */
export class UnsupportedIdentifierError extends AcmeError {
  constructor(detail = 'An identifier is of an unsupported type', status = 400) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_UNSUPPORTED_IDENTIFIER;
  }
}

/**
 * Error indicating that the client should visit the "instance" URL and take actions specified there
 */
export class UserActionRequiredError extends AcmeError {
  constructor(
    detail = 'Visit the "instance" URL and take actions specified there',
    status = 403,
    instance?: string,
  ) {
    super(detail, status);
    this.type = ErrorTypes.ACME_ERROR_USER_ACTION_REQUIRED;

    if (instance) {
      this.instance = instance;
    }
  }
}

/**
 * Create an ACME error instance from a problem document
 * @param problem The problem document
 * @returns An appropriate AcmeError instance
 */
export function createErrorFromProblem(problem: any): AcmeError {
  const type = problem.type;
  const detail = problem.detail || 'Unknown error';
  const status = problem.status;
  const instance = problem.instance;

  let error: AcmeError;

  // Create the appropriate error based on the type
  switch (type) {
    case 'urn:ietf:params:acme:error:accountDoesNotExist':
      error = new AccountDoesNotExistError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:alreadyRevoked':
      error = new AlreadyRevokedError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:badCSR':
      error = new BadCSRError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:badNonce':
      error = new BadNonceError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:badPublicKey':
      error = new BadPublicKeyError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:badRevocationReason':
      error = new BadRevocationReasonError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:badSignatureAlgorithm':
      const algorithms = problem.algorithms;

      error = new BadSignatureAlgorithmError(detail, status, algorithms);
      break;
    case 'urn:ietf:params:acme:error:caa':
      error = new CAAError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:compound':
      error = new CompoundError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:connection':
      error = new ConnectionError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:dns':
      error = new DNSError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:externalAccountRequired':
      error = new ExternalAccountRequiredError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:incorrectResponse':
      error = new IncorrectResponseError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:invalidContact':
      error = new InvalidContactError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:malformed':
      error = new MalformedError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:orderNotReady':
      error = new OrderNotReadyError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:rateLimited':
      const retryAfter = problem.retryAfter ? new Date(problem.retryAfter) : undefined;

      error = new RateLimitedError(detail, status, retryAfter);
      break;
    case 'urn:ietf:params:acme:error:rejectedIdentifier':
      error = new RejectedIdentifierError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:serverInternal':
      error = new ServerInternalError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:tls':
      error = new TLSError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:unauthorized':
      error = new UnauthorizedError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:unsupportedContact':
      error = new UnsupportedContactError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:unsupportedIdentifier':
      error = new UnsupportedIdentifierError(detail, status);
      break;
    case 'urn:ietf:params:acme:error:userActionRequired':
      error = new UserActionRequiredError(detail, status, instance);
      break;
    default:
      error = new AcmeError(detail, status);
      error.type = type;
  }

  // Add instance if available
  if (instance) {
    error.instance = instance;
  }

  // Add subproblems if available
  if (problem.subproblems && Array.isArray(problem.subproblems)) {
    problem.subproblems.forEach((subproblem: any) => {
      error.addSubproblem(createErrorFromProblem(subproblem));
    });
  }

  return error;
}
