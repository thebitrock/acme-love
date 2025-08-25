import type { HttpResponse } from '../http/http-client.js';
import { SimpleHttpClient } from '../http/http-client.js';
import { NonceManager } from './nonce-manager.js';
import type { AcmeSigner } from './acme-signer.js';
import * as jose from 'jose';

/**
 * Responsible for signed ACME HTTP calls and Nonce handling.
 * Encapsulates: SimpleHttpClient, NonceManager and JWS creation.
 */
export class AcmeTransport {
  private readonly nonceManager: NonceManager;

  constructor(
    private readonly directoryBaseUrl: string,
    private readonly newNonceUrl: string,
    private readonly http: SimpleHttpClient,
    private readonly signer: AcmeSigner,
  ) {
    this.nonceManager = new NonceManager({
      newNonceUrl: this.newNonceUrl,
      fetch: (url) => this.http.head(url),
      maxPool: 64,
      prefetchLowWater: 12,
      prefetchHighWater: 40,
      log: (...args) => console.debug('[nonce]', ...args),
    });
  }

  /** Builds the ACME protected header for this request. */
  private async buildHeader(url: string, nonce: string): Promise<jose.JWSHeaderParameters> {
    const kid = this.signer.getAccountKid();
    const header: jose.JWSHeaderParameters = { alg: 'ES256', url, nonce };
    if (kid) {
      header.kid = kid;
    } else {
      header.jwk = await this.signer.getJwk();
    }
    return header;
  }

  /** Returns namespace string used by NonceManager (CA base + account kid or empty). */
  private getNamespace(): string {
    return NonceManager.makeNamespace(this.directoryBaseUrl);
  }

  /** ACME signed POST (with JSON body or empty). */
  async post<T = any>(url: string, payload?: unknown): Promise<HttpResponse<T>> {
    const namespace = this.getNamespace();

    return this.nonceManager.withNonceRetry(namespace, async (nonce) => {
      const header = await this.buildHeader(url, nonce);

      const data =
        payload == null
          ? new Uint8Array(0)
          : new TextEncoder().encode(
            typeof payload === 'string' ? payload : JSON.stringify(payload),
          );

      const jws = await this.signer.signJws(data, header);

      return await this.http.post<T>(url, jws, {
        'Content-Type': 'application/jose+json',
        Accept: '*/*',
      });
    });
  }

  async postAsGet<T = any>(url: string): Promise<HttpResponse<T>> {
    return this.post<T>(url, '');
  }
}
