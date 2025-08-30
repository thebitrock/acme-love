import { AcmeHttpClient } from '../http/http-client.js';
import type { ACMEDirectory } from '../types/directory.js';
import type { AcmeDirectoryEntry } from '../../directory.js';
import { NonceManager, type NonceManagerOptions } from './nonce-manager.js';
import { createErrorFromProblem } from '../errors/factory.js';

export interface AcmeClientCoreOptions {
  /** Default NonceManager options; can be overridden per-account in AcmeAccountSession */
  nonce?: Partial<NonceManagerOptions>;
}

export class AcmeClientCore {
  public readonly directoryUrl: string;
  private readonly opts: AcmeClientCoreOptions;
  private readonly http = new AcmeHttpClient();

  private directory?: ACMEDirectory;
  private nonce?: NonceManager;

  /**
   * Create a new ACME client core instance
   *
   * @param directoryUrl - ACME directory URL string
   * @param opts - Client configuration options
   *
   * @example
   * ```typescript
   * // Using a string URL
   * const client = new AcmeClientCore('https://acme-staging-v02.api.letsencrypt.org/directory');
   * ```
   */
  constructor(directoryUrl: string, opts?: AcmeClientCoreOptions);

  /**
   * Create a new ACME client core instance
   *
   * @param directoryEntry - Pre-configured directory entry from the provider object
   * @param opts - Client configuration options
   *
   * @example
   * ```typescript
   * import { AcmeClientCore, provider } from 'acme-love';
   *
   * // Using a pre-configured provider entry
   * const client = new AcmeClientCore(provider.letsencrypt.staging);
   * ```
   */
  constructor(directoryEntry: AcmeDirectoryEntry, opts?: AcmeClientCoreOptions);

  constructor(directoryUrlOrEntry: string | AcmeDirectoryEntry, opts: AcmeClientCoreOptions = {}) {
    this.directoryUrl =
      typeof directoryUrlOrEntry === 'string'
        ? directoryUrlOrEntry
        : directoryUrlOrEntry.directoryUrl;
    this.opts = opts;
  }

  /** Fetch and cache directory; initialize default NonceManager */
  public async getDirectory(): Promise<ACMEDirectory> {
    if (this.directory) return this.directory;

    const res = await this.http.get(this.directoryUrl);
    if (res.statusCode !== 200) {
      throw createErrorFromProblem(res.body);
    }

    this.directory = res.body as ACMEDirectory;

    // default NonceManager instance (can be overridden per-account)
    this.nonce = new NonceManager({
      newNonceUrl: this.directory?.newNonce,
      fetch: (url) => this.http.head(url),
      ...this.opts.nonce,
    });

    return this.directory;
  }

  /** Raw HTTP client (POST/GET/HEAD wrappers) */
  public getHttp(): AcmeHttpClient {
    return this.http;
  }

  /** Shared/default NonceManager (AcmeAccountSession may build its own with overrides) */
  public getDefaultNonce(): NonceManager {
    if (!this.nonce) {
      throw new Error('NonceManager not initialized yet. Call getDirectory() first.');
    }
    return this.nonce;
  }
}
