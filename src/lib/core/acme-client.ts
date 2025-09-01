import { AcmeHttpClient } from '../../lib/transport/http-client.js';
import type { AcmeDirectory } from '../types/directory.js';
import type { AcmeDirectoryEntry } from '../../directory.js';
import { NonceManager, type NonceManagerOptions } from '../managers/nonce-manager.js';
import { createErrorFromProblem } from '../errors/factory.js';

export interface AcmeClientOptions {
  /** Default NonceManager options; can be overridden per-account in AcmeAccount */
  nonce?: Partial<NonceManagerOptions>;
}

/**
 * RFC 8555 compliant ACME client
 *
 * Core ACME client implementing RFC 8555 Automatic Certificate Management Environment
 * protocol. Handles directory discovery, nonce management, and basic ACME operations.
 */
export class AcmeClient {
  public readonly directoryUrl: string;
  private readonly opts: AcmeClientOptions;
  private readonly http = new AcmeHttpClient();

  private directory?: AcmeDirectory;
  private nonce?: NonceManager;

  /**
   * Create a new ACME client instance
   *
   * @param directoryUrl - ACME directory URL string
   * @param opts - Client configuration options
   *
   * @example
   * ```typescript
   * // Using a string URL
   * const client = new AcmeClient('https://acme-staging-v02.api.letsencrypt.org/directory');
   * ```
   */
  constructor(directoryUrl: string, opts?: AcmeClientOptions);

  /**
   * Create a new ACME client instance
   *
   * @param directoryEntry - Pre-configured directory entry from the provider object
   * @param opts - Client configuration options
   *
   * @example
   * ```typescript
   * import { AcmeClient, provider } from 'acme-love';
   *
   * // Using a pre-configured provider entry
   * const client = new AcmeClient(provider.letsencrypt.staging);
   * ```
   */
  constructor(directoryEntry: AcmeDirectoryEntry, opts?: AcmeClientOptions);

  constructor(directoryUrlOrEntry: string | AcmeDirectoryEntry, opts: AcmeClientOptions = {}) {
    this.directoryUrl =
      typeof directoryUrlOrEntry === 'string'
        ? directoryUrlOrEntry
        : directoryUrlOrEntry.directoryUrl;
    this.opts = opts;
  }

  /** Fetch and cache directory; initialize default NonceManager */
  public async getDirectory(): Promise<AcmeDirectory> {
    if (this.directory) return this.directory;

    const res = await this.http.get(this.directoryUrl);
    if (res.statusCode !== 200) {
      throw createErrorFromProblem(res.body);
    }

    this.directory = res.body as AcmeDirectory;

    // default NonceManager instance (can be overridden per-account)
    this.nonce = new NonceManager({
      newNonceUrl: this.directory?.newNonce,
      fetch: (url: string) => this.http.head(url),
      ...this.opts.nonce,
    });

    return this.directory;
  }

  /** Raw HTTP client (POST/GET/HEAD wrappers) */
  public getHttp(): AcmeHttpClient {
    return this.http;
  }

  /** Shared/default NonceManager (AcmeAccount may build its own with overrides) */
  public getDefaultNonce(): NonceManager {
    if (!this.nonce) {
      throw new Error('NonceManager not initialized yet. Call getDirectory() first.');
    }
    return this.nonce;
  }
}
