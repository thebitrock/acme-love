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

// (Legacy API removed)
