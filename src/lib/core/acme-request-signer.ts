/**
 * ACME Request Signer
 *
 * Handles JWS-authenticated requests to ACME servers with automatic nonce
 * management and algorithm detection per RFC 8555 Section 6.2.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-6.2
 * @see https://datatracker.ietf.org/doc/html/rfc7515
 */

import * as jose from 'jose';

import type { webcrypto } from 'crypto';
import type { AcmeClient } from './acme-client.js';
import { NonceManager, type NonceManagerOptions } from '../managers/nonce-manager.js';
import type { AcmeDirectory } from '../types/directory.js';
import type { ParsedResponseData } from '../transport/http-client.js';

/**
 * Keys bound to a single ACME account session
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-11.1
 */
export interface AccountKeys {
  privateKey: webcrypto.CryptoKey;
  publicKey: webcrypto.CryptoKey;
}

/**
 * External Account Binding parameters for CA pre-authorization
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.3.4
 */
export interface ExternalAccountBinding {
  /** Key identifier provided by the CA */
  kid: string;
  /** HMAC key (base64url encoded) provided by the CA */
  hmacKey: string;
}

/**
 * Detect JWS algorithm from a WebCrypto public key
 *
 * Inspects the JWK representation of the key to determine the appropriate
 * JWS algorithm. Supports EC (P-256, P-384, P-521) and RSA keys.
 *
 * @param publicKey - WebCrypto public key to inspect
 * @returns JWS algorithm identifier (e.g., 'ES256', 'RS256')
 */
export async function detectJwsAlgorithm(publicKey: webcrypto.CryptoKey): Promise<string> {
  const jwk = await jose.exportJWK(publicKey);

  if (jwk.kty === 'EC') {
    switch (jwk.crv) {
      case 'P-256':
        return 'ES256';
      case 'P-384':
        return 'ES384';
      case 'P-521':
        return 'ES512';
      default:
        throw new Error(`Unsupported EC curve: ${jwk.crv}`);
    }
  }

  if (jwk.kty === 'RSA') {
    return 'RS256';
  }

  throw new Error(`Unsupported key type: ${jwk.kty}`);
}

/**
 * ACME Request Signer
 *
 * Low-level signing layer that produces JWS-authenticated POST requests
 * with automatic nonce management, algorithm detection, and EAB support.
 */
export class AcmeRequestSigner {
  public readonly keys: AccountKeys;
  public kid: string;

  private readonly client: AcmeClient;
  private nonce: NonceManager | null = null;
  private readonly nonceOptions: Partial<NonceManagerOptions>;
  private jwsAlgorithm: string | null = null;

  constructor(
    client: AcmeClient,
    keys: AccountKeys,
    opts: { kid?: string; nonce?: Partial<NonceManagerOptions> },
  ) {
    this.client = client;
    this.keys = keys;
    this.kid = opts.kid || '';
    this.nonceOptions = opts.nonce || {};
  }

  async getDirectory(): Promise<AcmeDirectory> {
    return this.client.getDirectory();
  }

  /**
   * Create signed POST request to ACME server with automatic nonce retry
   *
   * @param url - Target ACME resource URL
   * @param payload - Request payload (object, string, Uint8Array, or null for POST-as-GET)
   * @param forceJwk - Force use of jwk header instead of kid (required for newAccount)
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-6.2
   */
  async signedPost(
    url: string,
    payload: string | Record<string, unknown> | Uint8Array | null | undefined,
    forceJwk = false,
  ): Promise<ParsedResponseData> {
    const nonceManager = await this.ensureNonceManager();
    const namespace = new URL(this.client.directoryUrl).host;
    const alg = await this.getAlgorithm();

    return nonceManager.withNonceRetry(namespace, async (nonce) => {
      const protectedHeader: Record<string, unknown> = {
        alg,
        nonce,
        url,
      };

      if (forceJwk || !this.kid) {
        protectedHeader.jwk = await jose.exportJWK(this.keys.publicKey);
      } else {
        protectedHeader.kid = this.kid;
      }

      const encodedPayload =
        payload === null || payload === undefined
          ? new Uint8Array(0)
          : new TextEncoder().encode(
              typeof payload === 'string' ? payload : JSON.stringify(payload),
            );

      const jws = await new jose.FlattenedSign(encodedPayload)
        .setProtectedHeader(protectedHeader)
        .sign(this.keys.privateKey);

      return this.client.getHttp().post(url, jws, {
        'Content-Type': 'application/jose+json',
      });
    });
  }

  /**
   * Compute Key Authorization per RFC 8555 Section 8.1
   *
   * Format: token || '.' || base64url(JWK_Thumbprint(accountKey))
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-8.1
   * @see https://datatracker.ietf.org/doc/html/rfc7638
   */
  async keyAuthorization(token: string): Promise<string> {
    const jwk = await jose.exportJWK(this.keys.publicKey);
    const thumbprint = await jose.calculateJwkThumbprint(jwk, 'sha256');
    return `${token}.${thumbprint}`;
  }

  /**
   * Create External Account Binding JWS
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.3.4
   */
  async createExternalAccountBinding(eab: ExternalAccountBinding, url: string): Promise<string> {
    const publicKeyJwk = await jose.exportJWK(this.keys.publicKey);

    const payload = JSON.stringify(publicKeyJwk);
    const protectedHeader = {
      alg: 'HS256',
      kid: eab.kid,
      url,
    };

    const hmacKey = await jose.importJWK({
      kty: 'oct',
      k: eab.hmacKey,
    });

    return await new jose.SignJWT(JSON.parse(payload))
      .setProtectedHeader(protectedHeader)
      .sign(hmacKey);
  }

  private async ensureNonceManager(): Promise<NonceManager> {
    if (!this.nonce) {
      const directory = await this.client.getDirectory();
      this.nonce = new NonceManager({
        newNonceUrl: directory.newNonce,
        fetch: (url: string) => this.client.getHttp().head(url),
        ...this.client.getDefaultNonceOptions(),
        ...this.nonceOptions,
      });
    }
    return this.nonce;
  }

  private async getAlgorithm(): Promise<string> {
    if (!this.jwsAlgorithm) {
      this.jwsAlgorithm = await detectJwsAlgorithm(this.keys.publicKey);
    }
    return this.jwsAlgorithm;
  }
}
