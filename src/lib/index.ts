/**
 * ACME Love Library - Core Exports
 *
 * Modern RFC 8555 compliant ACME client library
 */

// Core ACME client
export { AcmeClient, type AcmeClientOptions } from './core/acme-client.js';
export {
  AcmeAccount,
  type AcmeAccountOptions,
  type AccountKeys,
  type ExternalAccountBinding,
} from './core/acme-account.js';

// Error handling
export {
  AcmeError,
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
} from './errors/errors.js';

export { createErrorFromProblem } from './errors/factory.js';
export { ACME_ERROR, type AcmeErrorType } from './errors/codes.js';

// Types
export type { AcmeDirectory, AcmeDirectoryMeta } from './types/directory.js';
export type {
  AcmeOrder,
  ACMEOrder,
  AcmeOrderStatus,
  AcmeChallenge,
  AcmeChallengeStatus,
  AcmeChallengeType,
  AcmeAuthorization,
  AcmeAuthorizationStatus,
  AcmeIdentifier,
} from './types/order.js';

// Managers
export {
  NonceManager,
  type NonceManagerOptions,
  type FetchLike,
} from './managers/nonce-manager.js';
export { RateLimiter, type RateLimiterOptions, RateLimitError } from './managers/rate-limiter.js';

// Challenge validators
export {
  normalizeTxtFragments,
  isValidAcmeChallengeToken,
  canDecodeTo32Bytes,
  validateAcmeTxtSet,
  resolveAndValidateAcmeTxtAuthoritative,
  resolveAndValidateAcmeTxt,
  findZoneWithNs,
  resolveNsToIPs,
  validateHttp01Challenge,
  validateHttp01ChallengeByUrl,
  type AcmeDnsValidationResult,
  type AuthoritativeOptions,
  type AcmeHttpValidationResult,
  type AcmeHttpValidationOptions,
} from './challenges/index.js';

// Transport layer
export { AcmeHttpClient, type ParsedResponseData } from './transport/http-client.js';
export {
  withRetry,
  isRetryableError,
  getRetryAfterMs,
  calculateRetryDelay,
  sleep,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from './transport/retry.js';
export {
  MiddlewarePipeline,
  createDefaultPipeline,
  timingMiddleware,
  loggingMiddleware,
  statusValidationMiddleware,
  userAgentMiddleware,
  rateLimitMiddleware,
  acmeMiddleware,
  type Middleware,
  type RequestContext,
  type ResponseContext,
} from './transport/middleware.js';

// Cryptographic operations
export {
  generateKeyPair,
  createAcmeCsr,
  type AcmeEcAlgorithm,
  type AcmeRsaAlgorithm,
  type AcmeCertificateAlgorithm,
  type AcmeCryptoKeyPair,
  type AcmeAccountKeyPair,
  type CreateCsrResult,
  type AcmeSigner,
  JoseAcmeSigner,
} from './crypto/index.js';

// Utils
export { safeReadBody } from './utils/index.js';
export { buildUserAgent, getPackageInfo, type PackageInfo } from './utils/user-agent.js';
