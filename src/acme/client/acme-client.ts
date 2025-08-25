import { SimpleHttpClient, type HttpResponse } from '../http/http-client.js';
import { createHash } from 'crypto';
import { ServerInternalError, UnauthorizedError } from '../errors/errors.js';
import { createErrorFromProblem } from '../errors/factory.js';
import { coalesceAsync } from 'promise-coalesce';

import type { ACMEAccount, CreateAccount } from '../types/account.js';
import type { ACMEChallenge, ACMEIdentifier, ACMEOrder } from '../types/order.js';

import { AcmeDirectory } from './acme-directory.js';
import { AcmeTransport } from './acme-transport.js';
import { JoseAcmeSigner, type AcmeSigner } from './acme-signer.js';

/**
 * High-level ACME client orchestrating account, orders, challenges and cert flow.
 * Delegates crypto to JoseAcmeSigner and HTTP/nonce handling to AcmeTransport.
 */
export class ACMEClient {
  private readonly http = new SimpleHttpClient();
  private readonly dirSvc: AcmeDirectory;

  private signer?: AcmeSigner;        // set via setAccount()
  private transport?: AcmeTransport;  // lazy-init once directory is known

  constructor(private readonly directoryUrl: string) {
    this.dirSvc = new AcmeDirectory(this.http, directoryUrl);
  }

  /** Ensures transport is initialized with directory.newNonce URL. */
  private async ensureTransport(): Promise<AcmeTransport> {
    if (this.transport) return this.transport;
    const dir = await this.dirSvc.get();
    if (!this.signer) throw new UnauthorizedError('Account not set - call setAccount() first');
    this.transport = new AcmeTransport(this.directoryUrl, dir.newNonce, this.http, this.signer);
    return this.transport;
  }

  /** Computes a coalescing key for createAccount, based on KID or JWK thumbprint. */
  private async accountCoalesceKey(): Promise<string> {
    const kid = this.signer?.getAccountKid();
    if (kid) return `acct:${this.directoryUrl}:${kid}`;

    if (!this.signer) {
      throw new UnauthorizedError('Account keys not set');
    }
    const jwk = await this.signer.getJwk();
    const thumb = createHash('sha256').update(JSON.stringify(jwk)).digest('base64url');
    return `acct:${this.directoryUrl}:${thumb}`;
  }

  /** Wraps ACME POST/POST-as-GET with common error handling for problem+json. */
  private async makeRequest<T = any>(url: string, payload?: unknown): Promise<HttpResponse<T>> {
    const transport = await this.ensureTransport();
    const res = payload === undefined ? await transport.postAsGet<T>(url) : await transport.post<T>(url, payload);

    if (res.status >= 400) {
      const problem = res.data as any;
      if (problem && problem.type) {
        throw createErrorFromProblem(problem);
      }
      throw new ServerInternalError(`ACME request failed: ${problem?.detail || res.status}`);
    }

    const ct = res.headers['content-type'];

    if (typeof ct === 'string' && ct.includes('application/json')) {
      const location = res.headers?.location || res.headers?.Location;

      const resourceUrl = ((res.data as any)?.url ||
        (location && (Array.isArray(location) ? location[0] : location))) as string;

      return {
        status: res.status,
        headers: res.headers,
        data: {
          ...res.data,
          ...(resourceUrl && { url: resourceUrl }),
        },
      };
    }

    return res;
  }

  public setAccount(account: ACMEAccount): void {
    this.signer = new JoseAcmeSigner(account);
  }

  public async createAccount(
    payload: CreateAccount = { contact: [], termsOfServiceAgreed: true },
  ): Promise<ACMEAccount> {
    if (!this.signer) {
      throw new UnauthorizedError('Account keys not set - call setAccount() before creating an account');
    }
    if (this.signer.getAccountKid()) {
      return this.signer.getAccount();
    }

    // Ensure directory and transport are ready
    await this.ensureTransport();
    const dir = await this.dirSvc.get();

    const key = await this.accountCoalesceKey();
    return coalesceAsync(key, async () => {
      if (this.signer!.getAccountKid()) {
        return this.signer!.getAccount();
      }

      const res = await this.makeRequest(dir.newAccount, payload);
      const data = res.data as any;
      const kid = data?.url || data?.kid || data?.keyId;
      if (!kid) {
        throw new ServerInternalError('Failed to create or update account - missing account location/kid');
      }
      this.signer!.setAccountKid(kid);
      return this.signer!.getAccount();
    });
  }

  public async createOrder(identifiers: ACMEIdentifier[]): Promise<ACMEOrder> {
    const dir = await this.dirSvc.get();
    const res = await this.makeRequest<ACMEOrder>(dir.newOrder, { identifiers });
    return res.data;
  }

  public async fetchResource<T>(url: string): Promise<T> {
    const res = await this.makeRequest<T>(url);
    // ACME often returns the "url" in Location or body; normalize if needed upstream.
    return { url, ...(res.data as any) };
  }

  public async completeChallenge(challenge: ACMEChallenge): Promise<ACMEChallenge> {
    if (!this.signer) throw new UnauthorizedError('Account not set');
    const payload = {
      keyAuthorization: await this.signer.generateKeyAuthorization(challenge.token),
    };
    const res = await this.makeRequest<ACMEChallenge>(challenge.url, payload);
    return res.data;
  }

  public async getChallengeKeyAuthorization(challenge: ACMEChallenge): Promise<string> {
    if (!this.signer) throw new UnauthorizedError('Account not set');

    if (challenge.type === 'http-01') {
      return this.signer.generateKeyAuthorization(challenge.token);
    }
    if (challenge.type === 'dns-01') {
      return this.signer.dns01Value(challenge.token);
    }
    if (challenge.type === 'tls-alpn-01') {
      throw new Error('For tls-alpn-01 challenges, use getTlsAlpn01Digest() to get SHA-256 digest');
    }
    throw new Error(`Unknown challenge type: ${challenge.type}`);
  }

  public async getTlsAlpn01Digest(challenge: ACMEChallenge): Promise<Buffer> {
    if (!this.signer) throw new UnauthorizedError('Account not set');
    if (challenge.type !== 'tls-alpn-01') {
      throw new Error('Not a tls-alpn-01 challenge');
    }
    return this.signer.tlsAlpn01Digest(challenge.token);
  }

  public async finalizeOrder(finalizeUrl: string, csr: Buffer | string): Promise<ACMEOrder> {
    const payload = { csr: Buffer.isBuffer(csr) ? csr.toString('base64url') : csr };
    const res = await this.makeRequest<ACMEOrder>(finalizeUrl, payload);
    return res.data;
  }

  public async downloadCertificate(certUrl: string): Promise<string> {
    // The server returns "application/pem-certificate-chain" and a PEM body
    const res = await this.makeRequest<string>(certUrl, '');
    if (res.status !== 200) {
      throw new ServerInternalError(`Failed to download certificate: ${res.status}`);
    }
    return res.data as unknown as string;
  }

  public async revokeCertificate(cert: Buffer, reason?: number): Promise<void> {
    const dir = await this.dirSvc.get();
    const payload: any = { certificate: cert.toString('base64url') };
    if (reason !== undefined) payload.reason = reason;
    await this.makeRequest(dir.revokeCert, payload);
  }
}
