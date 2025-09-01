import type { ParsedResponseData } from './http-client.js';
import { AcmeHttpClient } from './http-client.js';
import { NonceManager, type NonceManagerOptions } from '../managers/nonce-manager.js';
import type { AcmeSigner } from '../crypto/signer.js';
import type { JWSHeaderParameters } from 'jose';

/**
 * Responsible for signed ACME HTTP calls and Nonce handling.
 * Encapsulates: AcmeHttpClient, NonceManager and JWS creation.
 */
export class AcmeTransport {
  private readonly nonceManager: NonceManager;

  constructor(
    private readonly directoryBaseUrl: string,
    private readonly newNonceUrl: string,
    private readonly http: AcmeHttpClient,
    private readonly signer: AcmeSigner,
    private readonly nonceOverrides?: Partial<NonceManagerOptions>,
  ) {
    const baseConfig = {
      newNonceUrl,
      fetch: (url: string) => this.http.head(url),
    } as Pick<NonceManagerOptions, 'newNonceUrl' | 'fetch'>;

    const merged: NonceManagerOptions = {
      ...baseConfig,
      ...(this.nonceOverrides ?? {}),
      newNonceUrl: this.newNonceUrl,
      fetch: baseConfig.fetch,
    };

    this.nonceManager = new NonceManager(merged);
  }

  /** Builds the ACME protected header for this request. */
  private async buildHeader(url: string, nonce: string): Promise<JWSHeaderParameters> {
    const kid = this.signer.getAccountKid();
    const header: JWSHeaderParameters = { alg: 'ES256', url, nonce };
    if (kid) {
      header.kid = kid;
    } else {
      header.jwk = await this.signer.getJwk();
    }
    return header;
  }

  /** Returns namespace string used by NonceManager (CA base + account kid or empty). */
  private getNamespace(): string {
    // New API doesn't require static method, just use base URL as namespace
    return this.directoryBaseUrl;
  }

  /** ACME signed POST (with JSON body or empty). */
  async post(url: string, payload?: unknown): Promise<ParsedResponseData> {
    const namespace = this.getNamespace();

    // Get fresh nonce using new API
    const nonce = await this.nonceManager.get(namespace);
    const header = await this.buildHeader(url, nonce);

    const data =
      payload === null || payload === undefined
        ? new Uint8Array(0)
        : new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload));

    const jws = await this.signer.signJws(data, header);

    const result = await this.http.post(url, jws, {
      'Content-Type': 'application/jose+json',
      Accept: '*/*',
    });

    return result;
  }

  async postAsGet(url: string): Promise<ParsedResponseData> {
    return this.post(url, '');
  }
}
