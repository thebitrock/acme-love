import { ACME_ERROR } from './codes.js';

export class AcmeError extends Error {
  type: string;
  detail: string;
  subproblems?: AcmeError[] | undefined;
  status?: number | undefined;
  instance: string | undefined;

  constructor(
    detail: string,
    status?: number,
    opts?: { type?: string; instance?: string; cause?: unknown },
  ) {
    super(detail, { cause: opts?.cause });
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = new.target.name;
    this.detail = detail;
    this.status = status ?? 500;
    this.type = opts?.type ?? ACME_ERROR.serverInternal;
    this.instance = opts?.instance;
  }

  toJSON(): Record<string, unknown> {
    const res: Record<string, unknown> = { type: this.type, detail: this.detail };

    if (this.status !== undefined) {
      res.status = this.status;
    }

    if (this.instance) {
      res.instance = this.instance;
    }

    if (this.subproblems?.length) {
      res.subproblems = this.subproblems.map((p) => p.toJSON());
    }

    return res;
  }

  addSubproblem(error: AcmeError): this {
    (this.subproblems ??= []).push(error);

    return this;
  }
}

/**
 * Error indicating that the specified account does not exist
 */
export class AccountDoesNotExistError extends AcmeError {
  constructor(detail = 'The request specified an account that does not exist', status = 400) {
    super(detail, status);
    this.type = ACME_ERROR.accountDoesNotExist;
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
    this.type = ACME_ERROR.alreadyRevoked;
  }
}

/**
 * Error indicating that the CSR is unacceptable
 */
export class BadCSRError extends AcmeError {
  constructor(detail = 'The CSR is unacceptable (e.g., due to a short key)', status = 400) {
    super(detail, status);
    this.type = ACME_ERROR.badCSR;
  }
}

/**
 * Error indicating that the client sent an unacceptable anti-replay nonce
 */
export class BadNonceError extends AcmeError {
  constructor(detail = 'The client sent an unacceptable anti-replay nonce', status = 400) {
    super(detail, status);
    this.type = ACME_ERROR.badNonce;
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
    this.type = ACME_ERROR.badPublicKey;
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
    this.type = ACME_ERROR.badRevocationReason;
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
    this.type = ACME_ERROR.badSignatureAlgorithm;
    this.algorithms = algorithms || [];
  }

  override toJSON(): Record<string, unknown> {
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
    this.type = ACME_ERROR.caa;
  }
}

/**
 * Error indicating that specific error conditions are indicated in the "subproblems" array
 */
export class CompoundError extends AcmeError {
  constructor(detail = 'Multiple errors occurred', status = 400) {
    super(detail, status);
    this.type = ACME_ERROR.compound;
  }
}

/**
 * Error indicating that the server could not connect to validation target
 */
export class ConnectionError extends AcmeError {
  constructor(detail = 'The server could not connect to validation target', status = 400) {
    super(detail, status);
    this.type = ACME_ERROR.connection;
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
    this.type = ACME_ERROR.dns;
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
    this.type = ACME_ERROR.externalAccountRequired;
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
    this.type = ACME_ERROR.incorrectResponse;
  }
}

/**
 * Error indicating that a contact URL for an account was invalid
 */
export class InvalidContactError extends AcmeError {
  constructor(detail = 'A contact URL for an account was invalid', status = 400) {
    super(detail, status);
    this.type = ACME_ERROR.invalidContact;
  }
}

/**
 * Error indicating that the request message was malformed
 */
export class MalformedError extends AcmeError {
  constructor(detail = 'The request message was malformed', status = 400) {
    super(detail, status);
    this.type = ACME_ERROR.malformed;
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
    this.type = ACME_ERROR.orderNotReady;
  }
}

/**
 * Error indicating that the request exceeds a rate limit
 */
export class RateLimitedError extends AcmeError {
  retryAfter: Date | undefined;

  constructor(detail = 'The request exceeds a rate limit', status = 429, retryAfter?: Date) {
    super(detail, status);
    this.type = ACME_ERROR.rateLimited;
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

  override toJSON(): Record<string, unknown> {
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
    this.type = ACME_ERROR.rejectedIdentifier;
  }
}

/**
 * Error indicating that the server experienced an internal error
 */
export class ServerInternalError extends AcmeError {
  constructor(detail = 'The server experienced an internal error', status = 500) {
    super(detail, status);
    this.type = ACME_ERROR.serverInternal;
  }
}

/**
 * Error indicating that the server is down for maintenance
 */
export class ServerMaintenanceError extends AcmeError {
  constructor(
    detail = 'The service is down for maintenance or had an internal error',
    status = 503,
  ) {
    super(detail, status);
    this.type = ACME_ERROR.serverInternal;
    this.isMaintenanceError = true;
  }

  isMaintenanceError: boolean;

  override toString(): string {
    return (
      `${this.constructor.name}: ${this.detail}\n` +
      `🔧 The ACME server is currently under maintenance.\n` +
      `📊 Check service status at: https://letsencrypt.status.io/\n` +
      `⏳ Please try again later when the service is restored.`
    );
  }
}

/**
 * Error indicating that the server received a TLS error during validation
 */
export class TLSError extends AcmeError {
  constructor(detail = 'The server received a TLS error during validation', status = 400) {
    super(detail, status);
    this.type = ACME_ERROR.tls;
  }
}

/**
 * Error indicating that the client lacks sufficient authorization
 */
export class UnauthorizedError extends AcmeError {
  constructor(detail = 'The client lacks sufficient authorization', status = 401) {
    super(detail, status);
    this.type = ACME_ERROR.unauthorized;
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
    this.type = ACME_ERROR.unsupportedContact;
  }
}

/**
 * Error indicating that an identifier is of an unsupported type
 */
export class UnsupportedIdentifierError extends AcmeError {
  constructor(detail = 'An identifier is of an unsupported type', status = 400) {
    super(detail, status);
    this.type = ACME_ERROR.unsupportedIdentifier;
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
    this.type = ACME_ERROR.userActionRequired;

    if (instance) {
      this.instance = instance;
    }
  }
}
