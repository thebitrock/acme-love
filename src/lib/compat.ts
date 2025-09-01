/**
 * Compatibility layer for gradual migration to RFC 8555 compliant structure
 *
 * This file re-exports the current ACME client implementations with
 * RFC 8555 compliant names while we complete the migration.
 */

// Core exports with new naming
export { AcmeClientCore as AcmeClient } from '../acme/client/acme-client-core.js';
export type { AcmeClientCoreOptions as AcmeClientOptions } from '../acme/client/acme-client-core.js';

// Account management with new naming
export { AcmeAccountSession as AcmeAccount } from '../acme/client/acme-account-session.js';
export type { AcmeAccountSessionOptions as AcmeAccountOptions } from '../acme/client/acme-account-session.js';

// Legacy exports for backward compatibility
export {
  AcmeAccountSession,
  type AccountKeys,
  type ExternalAccountBinding,
} from '../acme/client/acme-account-session.js';
export { AcmeClientCore } from '../acme/client/acme-client-core.js';
export * from '../acme/types/account.js';
export * from '../acme/types/order.js';
export * from '../acme/types/directory.js';
export * from '../acme/validator/index.js';
export * from '../acme/csr.js';

// All error classes with original exports
export * from '../acme/errors/errors.js';
export { createErrorFromProblem } from '../acme/errors/factory.js';
export { ACME_ERROR, type AcmeErrorType } from '../acme/errors/codes.js';

// Debug utilities
export {
  debugNonce,
  debugHttp,
  debugChallenge,
  debugClient,
  debugValidator,
  debugMain,
} from '../acme/debug.js';

// Directory and types - updated naming
export type { ACMEDirectory as AcmeDirectory } from '../acme/types/directory.js';
export type {
  ACMEOrder as AcmeOrder,
  ACMEChallenge as AcmeChallenge,
  ACMEAuthorization as AcmeAuthorization,
} from '../acme/types/order.js';

// Managers and utilities
export { NonceManager } from '../acme/client/nonce-manager.js';
export type { NonceManagerOptions, FetchLike } from '../acme/client/nonce-manager.js';

export { RateLimiter, RateLimitError } from '../acme/client/rate-limiter.js';
export type { RateLimiterOptions } from '../acme/client/rate-limiter.js';

// Transport and HTTP
export { AcmeHttpClient } from '../acme/http/http-client.js';
export type { ParsedResponseData } from '../acme/http/http-client.js';

// Utilities
export { safeReadBody, buildUserAgent, getPackageInfo } from '../acme/utils.js';
export type { PackageInfo } from '../acme/utils.js';

// Re-export other acme modules for backward compatibility
export * from '../acme/csr.js';
