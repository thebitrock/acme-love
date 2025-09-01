/**
 * ACME Love - RFC 8555 Compliant ACME Client Library
 *
 * Main entry point for the modernized ACME client library
 */

// Directory utilities
export * as directory from './directory.js';
export { directory as directories, provider } from './directory.js';
export type { AcmeDirectoryEntry, AcmeProvider, AcmeDirectoryConfig } from './directory.js';

// Modern RFC 8555 compliant API (primary interface)
export * from './lib/index.js';

// Legacy exports for backward compatibility (deprecated)
// These are re-exported at the top level for existing code compatibility
export { AcmeAccountSession } from './acme/client/acme-account-session.js';
export { AcmeClientCore } from './acme/client/acme-client-core.js';
export type { AccountKeys, ExternalAccountBinding } from './acme/client/acme-account-session.js';

// Legacy types
export type { ACMEAccount, CreateAccount } from './acme/types/account.js';
export type { ACMEOrder, ACMEChallenge, ACMEAuthorization } from './acme/types/order.js';
export type { ACMEDirectory } from './acme/types/directory.js';

// Legacy CSR types
export type { CsrAlgo, EcAlgo, RsaAlgo, CryptoKeyPair } from './acme/csr.js';
