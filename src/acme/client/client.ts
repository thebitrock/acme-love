import { SimpleHttpClient, type HttpResponse } from '../http/http-client.js';
import { createHash } from 'crypto';
import { TextEncoder } from 'util';
import * as jose from 'jose';
import { logWarn } from '../../logger.js';
import { ServerInternalError, UnauthorizedError } from '../errors/errors.js';
import { createErrorFromProblem } from '../errors/factory.js';
import { NonceManager } from './nonce-manager.js';

export interface ACMEAccount {
  privateKey: jose.CryptoKey;
  publicKey: jose.CryptoKey;
  keyId?: string;
}

export interface CreateAccount {
  contact?: string[];
  termsOfServiceAgreed?: boolean;
}

export interface ACMEDirectory {
  newNonce: string;
  newAccount: string;
  newOrder: string;
  newAuthz?: string;
  revokeCert: string;
  keyChange: string;
  meta?: {
    termsOfService?: string;
    website?: string;
    caaIdentities?: string[];
    externalAccountRequired?: boolean;
  };
}

export interface ACMEIdentifier {
  type: 'dns';
  value: string;
}

export interface ACMEOrder {
  url: string;
  status: 'pending' | 'ready' | 'processing' | 'valid' | 'invalid';
  expires?: string;
  identifiers: ACMEIdentifier[];
  authorizations: string[];
  finalize: string;
  certificate?: string;
}

export interface ACMEChallenge {
  type: 'http-01' | 'dns-01' | 'tls-alpn-01' | string;
  url: string;
  status: 'pending' | 'processing' | 'valid' | 'invalid';
  validated?: string;
  error?: ACMEError;
  token: string;
}

export interface ACMEError {
  type: string;
  detail: string;
  status: number;
}

export interface ACMEAuthorization {
  identifier: ACMEIdentifier;
  status: 'pending' | 'valid' | 'invalid' | 'deactivated' | 'expired' | 'revoked';
  expires?: string;
  challenges: ACMEChallenge[];
  wildcard?: boolean;
}

export class ACMEClient {
  private directoryUrl: string;
  private directory?: ACMEDirectory;
  private account?: ACMEAccount;
  private jwk: Promise<jose.JWK> | null = null;
  private http: SimpleHttpClient;
  private nonceManager?: NonceManager;

  constructor(directoryUrl: string) {
    this.directoryUrl = directoryUrl;
    this.http = new SimpleHttpClient();
  }

  /**
   * Get ACME directory information
   * @returns The current directory information
   */
  public getDirectoryInfo(): ACMEDirectory | undefined {
    return this.directory;
  }

  /**
   * Get ACME directory from the server
   */
  private async getDirectory(): Promise<void> {
    const response = await this.http.get<ACMEDirectory>(this.directoryUrl);

    if (response.status !== 200) {
      throw new ServerInternalError(`Failed to get directory: ${response.status}`);
    }

    this.directory = response.data;

    this.nonceManager = new NonceManager({
      newNonceUrl: this.directory.newNonce,
      fetch: this.http.head.bind(this.http),
    });
  }

  async createJWS(payload: any, url: string, nonce: string): Promise<jose.FlattenedJWS> {
    if (!this.account?.privateKey && !this.account?.keyId) {
      throw new ServerInternalError('Account key or keyId is not initialized');
    }

    const protectedHeader: jose.JWSHeaderParameters = {
      alg: 'ES256',
      nonce,
      url,
      ...(this.account?.keyId ? { kid: this.account.keyId } : {}),
    };

    if (!this.account?.keyId) {
      protectedHeader.jwk = await this.getJWK();
    }

    const data =
      payload == null
        ? new Uint8Array(0)
        : new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload));

    return await new jose.FlattenedSign(data)
      .setProtectedHeader(protectedHeader)
      .sign(this.account.privateKey);
  }

  /**
   * Get JWK (JSON Web Key) from private key
   */
  private async getJWK(): Promise<jose.JWK> {
    if (this.jwk) {
      return this.jwk;
    }

    if (!this.account?.publicKey) {
      throw new ServerInternalError('Account key is not initialized');
    }

    this.jwk = jose.exportJWK(this.account.publicKey);

    return this.jwk;
  }

  /**
   * Make authenticated request to ACME server
   */
  private async makeRequest(url: string, payload?: any): Promise<HttpResponse<any>> {
    const namespace = NonceManager.makeNamespace(this.directoryUrl, this.account?.keyId || '');

    if (!this.nonceManager) {
      throw new ServerInternalError('Nonce manager is not initialized');
    }

    const nonceManager = this.nonceManager;

    const response = await nonceManager.withNonceRetry(namespace, async (nonce: string) => {
      const jws = await this.createJWS(payload, url, nonce);

      return await this.http.post<any>(url, jws, {
        'Content-Type': 'application/jose+json',
        Accept: 'application/json',
      });
    });

    if (response.status >= 400) {
      const problemDetails = response.data;

      if (problemDetails && problemDetails.type) {
        throw createErrorFromProblem(problemDetails);
      } else {
        throw new ServerInternalError(
          `ACME request failed: ${problemDetails?.detail || response.status}`,
        );
      }
    }

    const ct = response.headers['content-type'];

    if (typeof ct === 'string' && ct.includes('application/json')) {
      const location = response.headers?.location || response.headers?.Location;

      const url = (response.data?.url ||
        (location && (Array.isArray(location) ? location[0] : location))) as string;

      return {
        status: response.status,
        headers: response.headers,
        data: {
          ...response.data,
          ...(url && { url }),
        },
      };
    }

    return response;
  }

  /**
   * Create or register an ACME account on the server.
   *
   * This method builds a JWS for the provided payload and POSTs it directly to the
   * ACME newAccount endpoint (directory.newAccount) so that response headers such
   * as Location can be inspected. On success the account's keyId (AKA "kid") is
   * determined from the Location header or the response body and stored on the
   * current account.
   *
   * Important: if this.account?.keyId is already set, that indicates an account
   * has already been created using the current key pair. To recreate or register
   * a new account with different credentials, replace the stored privateKey and
   * publicKey before calling this method.
   *
   * @param payload - Account creation payload (defaults to `{ contact: [], termsOfServiceAgreed: true }`).
   *
   * @returns A Promise that resolves to the created ACMEAccount object containing
   *          privateKey, publicKey and the resolved keyId (kid).
   *
   * @throws UnauthorizedError If account key material is not set on this instance
   *                           (call setAccount() first).
   * @throws ServerInternalError If the server directory or nonce is unavailable,
   *                             if the server response does not include an account
   *                             location/kid, or for other unexpected server-side
   *                             failures.
   * @throws Error (or a specialized error created via createErrorFromProblem) when
   *               the ACME server returns a problem detail object (HTTP >= 400).
   *
   * @remarks
   * - The method will fetch a fresh nonce if one is not already available.
   * - The nonce is updated from the response 'replay-nonce' header when present.
   * - The request is sent with 'Content-Type: application/jose+json' and
   *   'Accept: application/json'.
   * - The account keyId is resolved in the following order:
   *     1. Location header (or its first element if an array)
   *     2. response.body.kid
   *     3. response.body.keyId
   */
  async createAccount(
    payload: CreateAccount = { contact: [], termsOfServiceAgreed: true },
  ): Promise<ACMEAccount> {
    if (this.account?.keyId) {
      logWarn(
        'Account already exists - keyId is set. This indicates an account was previously created using the current key pair. To recreate or register a new account with different credentials, replace the stored privateKey and publicKey before calling setAccount/createAccount.',
      );

      return this.account;
    }

    if (!this.directory) {
      await this.getDirectory();
    }

    if (!this.directory) {
      throw new ServerInternalError('Server directory unavailable');
    }

    if (!this.account) {
      throw new UnauthorizedError(
        'Account keys not set - call setAccount() before creating an account',
      );
    }

    const { data } = await this.makeRequest(this.directory.newAccount, payload);
    const kid = data?.url || data?.kid || data?.keyId;

    if (!kid) {
      throw new ServerInternalError(
        'Failed to create or update account - missing account location/kid',
      );
    }

    this.account.keyId = kid as string;

    return {
      privateKey: this.account.privateKey,
      publicKey: this.account.publicKey,
      keyId: this.account.keyId,
    };
  }

  /**
   * Create new order ACMEOrder
   */
  public async createOrder(identifiers: ACMEIdentifier[]): Promise<ACMEOrder> {
    if (!this.directory) {
      await this.getDirectory();
    }

    const payload = {
      identifiers,
    };

    if (!this.directory) {
      throw new ServerInternalError('Server directory unavailable');
    }

    const { data } = await this.makeRequest(this.directory.newOrder, payload);

    return data;
  }

  public async fetchResource<T>(url: string): Promise<T> {
    const data = (await this.makeRequest(url)).data;

    return { url, ...data };
  }

  /**
   * Complete challenge
   */
  public async completeChallenge(challenge: ACMEChallenge): Promise<ACMEChallenge> {
    const payload = {
      keyAuthorization: await this.generateKeyAuthorization(challenge.token),
    };

    return (await this.makeRequest(challenge.url, payload)).data;
  }

  /**
   * Finalize order
   */
  async finalizeOrder(finalizeUrl: string, csr: Buffer): Promise<ACMEOrder> {
    const payload = {
      csr: csr.toString('base64url'),
    };

    return (await this.makeRequest(finalizeUrl, payload)).data;
  }

  /**
   * Download certificate
   */
  async downloadCertificate(certUrl: string): Promise<string> {
    const res = await this.makeRequest(certUrl, ''); // POST-as-GET, пустой payload

    if (res.status !== 200) {
      throw new ServerInternalError(`Failed to download certificate: ${res.status}`);
    }

    // тут придёт 'application/pem-certificate-chain'
    return res.data as string;
  }

  /**
   * Revoke certificate
   */
  async revokeCertificate(cert: Buffer, reason?: number): Promise<void> {
    if (!this.directory) {
      await this.getDirectory();
    }

    const payload: any = {
      certificate: cert.toString('base64url'),
    };

    if (reason !== undefined) {
      payload.reason = reason;
    }

    if (!this.directory) {
      throw new ServerInternalError('Server directory unavailable');
    }

    await this.makeRequest(this.directory.revokeCert, payload);
  }

  /**
   * Set account credentials
   */
  setAccount(account: ACMEAccount): void {
    this.account = account;
    this.jwk = null;
  }

  /**
   * Generate key authorization for challenge
   */
  private async generateKeyAuthorization(token: string): Promise<string> {
    if (!this.account) {
      throw new UnauthorizedError(
        'Account not set - you must set an account with setAccount before generating key authorization',
      );
    }

    const jwk = await this.getJWK();
    const thumbprint = createHash('sha256').update(JSON.stringify(jwk)).digest('base64url');

    return `${token}.${thumbprint}`;
  }
}
