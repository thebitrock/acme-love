import { SimpleHttpClient, type HttpResponse } from '../http/http-client.js';
import { createHash } from 'crypto';
import { TextEncoder } from 'util';
import * as jose from 'jose';
import { ServerInternalError, UnauthorizedError } from '../errors/errors.js';
import { createErrorFromProblem } from '../errors/factory.js';
import { NonceManager } from './nonce-manager.js';

import type { ACMEAccount, CreateAccount } from '../types/account.js';
import type { ACMEDirectory } from '../types/directory.js';
import type { ACMEChallenge, ACMEIdentifier, ACMEOrder } from '../types/order.js';
import { coalesceAsync } from 'promise-coalesce';

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
    await coalesceAsync(`dir:${this.directoryUrl}`, async () => {
      if (this.directory && this.nonceManager) {
        return;
      }

      const response = await this.http.get<ACMEDirectory>(this.directoryUrl);

      if (response.status !== 200) {
        throw new ServerInternalError(`Failed to get directory: ${response.status}`);
      }

      this.directory = response.data;

      this.nonceManager = new NonceManager({
        newNonceUrl: this.directory.newNonce,
        fetch: (url) => this.http.head(url),
      });
    });
  }

  private async accountCoalesceKey(): Promise<string> {
    if (this.account?.keyId) {
      return `acct:${this.directoryUrl}:${this.account.keyId}`;
    }

    if (!this.account?.publicKey) {
      throw new UnauthorizedError('Account keys not set');
    }

    const jwk = await jose.exportJWK(this.account.publicKey);
    const thumb = createHash('sha256').update(JSON.stringify(jwk)).digest('base64url');

    return `acct:${this.directoryUrl}:${thumb}`;
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
      console.log('Making ACME request to', url, 'with nonce', nonce);
      const jws = await this.createJWS(payload, url, nonce);

      return await this.http.post<any>(url, jws, {
        'Content-Type': 'application/jose+json',
        Accept: 'application/json',
      });
    });

    if (response.status >= 400) {
      const problemDetails = response.data;

      if (problemDetails && problemDetails?.type) {
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

      console.log(nonceManager.getPoolSize(namespace), 'nonces left in pool for', namespace);
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

  async createAccount(
    payload: CreateAccount = { contact: [], termsOfServiceAgreed: true },
  ): Promise<ACMEAccount> {
    if (this.account?.keyId) {
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

    const key = await this.accountCoalesceKey();

    return await coalesceAsync(key, async () => {
      if (this.account?.keyId) {
        return this.account;
      }

      const { data } = await this.makeRequest(this.directory!.newAccount, payload);
      const kid = data?.url || data?.kid || data?.keyId;

      if (!kid) {
        throw new ServerInternalError(
          'Failed to create or update account - missing account location/kid',
        );
      }

      this.account!.keyId = kid as string;

      return {
        privateKey: this.account!.privateKey,
        publicKey: this.account!.publicKey,
        keyId: this.account!.keyId,
      };
    });
  }

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

  public async completeChallenge(challenge: ACMEChallenge): Promise<ACMEChallenge> {
    const payload = {
      keyAuthorization: await this.generateKeyAuthorization(challenge.token),
    };

    return (await this.makeRequest(challenge.url, payload)).data;
  }

  async finalizeOrder(finalizeUrl: string, csr: Buffer): Promise<ACMEOrder> {
    const payload = {
      csr: csr.toString('base64url'),
    };

    return (await this.makeRequest(finalizeUrl, payload)).data;
  }

  async downloadCertificate(certUrl: string): Promise<string> {
    const res = await this.makeRequest(certUrl, ''); // POST-as-GET, пустой payload

    if (res.status !== 200) {
      throw new ServerInternalError(`Failed to download certificate: ${res.status}`);
    }

    return res.data as string;
  }

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
