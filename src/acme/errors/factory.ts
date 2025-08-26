import {
  AccountDoesNotExistError,
  AlreadyRevokedError,
  BadCSRError,
  BadNonceError,
  BadPublicKeyError,
  BadRevocationReasonError,
  BadSignatureAlgorithmError,
  CAAError,
  CompoundError,
  ConnectionError,
  DNSError,
  ExternalAccountRequiredError,
  IncorrectResponseError,
  InvalidContactError,
  MalformedError,
  OrderNotReadyError,
  RateLimitedError,
  RejectedIdentifierError,
  ServerInternalError,
  ServerMaintenanceError,
  TLSError,
  UnauthorizedError,
  UnsupportedContactError,
  UnsupportedIdentifierError,
  UserActionRequiredError,
  AcmeError,
} from './errors.js';
import { ACME_ERROR, type AcmeErrorType } from './codes.js';

// eslint-disable-next-line no-unused-vars
type Ctor = new (detail?: string, status?: number, ...rest: any[]) => AcmeError;

const FACTORY: Partial<Record<AcmeErrorType, Ctor>> = {
  [ACME_ERROR.accountDoesNotExist]: AccountDoesNotExistError,
  [ACME_ERROR.alreadyRevoked]: AlreadyRevokedError,
  [ACME_ERROR.badCSR]: BadCSRError,
  [ACME_ERROR.badNonce]: BadNonceError,
  [ACME_ERROR.badPublicKey]: BadPublicKeyError,
  [ACME_ERROR.badRevocationReason]: BadRevocationReasonError,
  [ACME_ERROR.badSignatureAlgorithm]: BadSignatureAlgorithmError,
  [ACME_ERROR.caa]: CAAError,
  [ACME_ERROR.compound]: CompoundError,
  [ACME_ERROR.connection]: ConnectionError,
  [ACME_ERROR.dns]: DNSError,
  [ACME_ERROR.externalAccountRequired]: ExternalAccountRequiredError,
  [ACME_ERROR.incorrectResponse]: IncorrectResponseError,
  [ACME_ERROR.invalidContact]: InvalidContactError,
  [ACME_ERROR.malformed]: MalformedError,
  [ACME_ERROR.orderNotReady]: OrderNotReadyError,
  [ACME_ERROR.rateLimited]: RateLimitedError,
  [ACME_ERROR.rejectedIdentifier]: RejectedIdentifierError,
  [ACME_ERROR.serverInternal]: ServerInternalError,
  [ACME_ERROR.tls]: TLSError,
  [ACME_ERROR.unauthorized]: UnauthorizedError,
  [ACME_ERROR.unsupportedContact]: UnsupportedContactError,
  [ACME_ERROR.unsupportedIdentifier]: UnsupportedIdentifierError,
  [ACME_ERROR.userActionRequired]: UserActionRequiredError,
} as const;

export function createErrorFromProblem(problem: unknown): AcmeError {
  // RFC7807/ACME
  if (!problem || typeof problem !== 'object') {
    return new AcmeError('Unknown error shape');
  }

  type Problem = {
    type?: string;
    detail?: string;
    status?: number;
    instance?: string;
    algorithms?: string[] | undefined;
    retryAfter?: string | number | undefined;
    subproblems?: unknown[] | undefined;
  };

  const p = problem as Problem;

  const type: string = p.type ?? ACME_ERROR.serverInternal;
  const detail: string = p.detail ?? 'Unknown error';
  const status: number | undefined = p.status;
  const instance: string | undefined = p.instance;

  const ctor = FACTORY[type as AcmeErrorType] ?? AcmeError;
  let err: AcmeError;

  // Special handling for maintenance errors
  if (type === ACME_ERROR.serverInternal && 
      (detail.includes('maintenance') || 
       detail.includes('service is down') ||
       detail.includes('letsencrypt.status.io') ||
       status === 503)) {
    err = new ServerMaintenanceError(detail, status);
  } else if (ctor === BadSignatureAlgorithmError) {
    err = new BadSignatureAlgorithmError(detail, status, p.algorithms);
  } else if (ctor === RateLimitedError) {
    const retryAfter = p.retryAfter ? new Date(p.retryAfter) : undefined;

    err = new RateLimitedError(detail, status ?? 429, retryAfter);
  } else if (ctor === UserActionRequiredError) {
    err = new UserActionRequiredError(detail, status ?? 403, instance);
  } else {
    err = new ctor(detail, status);

    if (err instanceof AcmeError && ctor === AcmeError) {
      err.type = type;
      err.instance = instance;
    }
  }

  if (Array.isArray(p.subproblems)) {
    for (const sub of p.subproblems) {
      err.addSubproblem(createErrorFromProblem(sub));
    }
  }

  return err;
}
