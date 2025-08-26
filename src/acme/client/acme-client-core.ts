import { SimpleHttpClient } from '../http/http-client.js';
import type { ACMEDirectory } from '../types/directory.js';
import { NonceManager, type NonceManagerOptions } from './nonce-manager.js';

export interface AcmeClientCoreOptions {
  /** Default NonceManager options; can be overridden per-account in AcmeAccountSession */
  nonce?: Partial<NonceManagerOptions>;
}

export class AcmeClientCore {
  public readonly directoryUrl: string;
  private readonly opts: AcmeClientCoreOptions;
  private readonly http = new SimpleHttpClient();

  private directory?: ACMEDirectory;
  private nonce?: NonceManager;

  constructor(directoryUrl: string, opts: AcmeClientCoreOptions = {}) {
    this.directoryUrl = directoryUrl;
    this.opts = opts;
  }

  /** Fetch and cache directory; initialize default NonceManager */
  public async getDirectory(): Promise<ACMEDirectory> {
    if (this.directory) return this.directory;

    const res = await this.http.get<ACMEDirectory>(this.directoryUrl);
    if (res.status !== 200) {
      throw new Error(`Failed to fetch directory: HTTP ${res.status}`);
    }
    this.directory = res.data;

    // default NonceManager instance (can be overridden per-account)
    this.nonce = new NonceManager({
      newNonceUrl: this.directory.newNonce,
      fetch: (url) => this.http.head(url),
      ...this.opts.nonce,
    });

    return this.directory!;
  }

  /** Raw HTTP client (POST/GET/HEAD wrappers) */
  public getHttp(): SimpleHttpClient {
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
