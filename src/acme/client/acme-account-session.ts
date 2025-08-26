import * as jose from 'jose';
import { createHash } from 'crypto';
import { coalesceAsync } from 'promise-coalesce';

import type { webcrypto } from 'crypto';
import type { AcmeClientCore } from './acme-client-core.js';
import { NonceManager, type NonceManagerOptions } from './nonce-manager.js';
import type { ACMEOrder, ACMEChallenge, ACMEAuthorization } from '../types/order.js';
import { createErrorFromProblem } from '../errors/factory.js';
import type { ACMEDirectory } from '../types/directory.js';
import type { HttpResponse } from '../http/http-client.js';

/** Keys bound to a single ACME account session */
export interface AccountKeys {
  privateKey: webcrypto.CryptoKey;
  publicKey: webcrypto.CryptoKey;
}

export interface AcmeAccountSessionOptions {
  /** Pre-existing account kid (if account already registered) */
  kid?: string;
  /** Per-account NonceManager overrides (pool, prefetch, logging, etc.) */
  nonceOverrides?: Partial<NonceManagerOptions>;
}

/** Stateless helpers to generate JWS payload/headers with kid or embedded JWK */
function encodePayload(payload: unknown): Uint8Array {
  if (payload == null) return new Uint8Array(0);
  return new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

export class AcmeAccountSession {
  private readonly client: AcmeClientCore;
  private readonly keys: AccountKeys;
  private kid: string | undefined;

  // Cached directory + per-account NonceManager (may be override of default)
  private directory?: ACMEDirectory;
  private nonce?: NonceManager;

  constructor(client: AcmeClientCore, keys: AccountKeys, opts: AcmeAccountSessionOptions = {}) {
    this.client = client;
    this.keys = keys;
    this.kid = opts.kid;

    // Save nonce overrides for lazy creation
    this.nonceOverrides = opts.nonceOverrides ?? {};
  }

  private readonly nonceOverrides: Partial<NonceManagerOptions>;

  /** Initialize directory + NonceManager for this session (respects per-account overrides) */
  private async ensureInit(): Promise<void> {
    if (this.directory && this.nonce) return;
    const dir = await this.client.getDirectory();
    this.directory = dir;

    // If overrides are provided, build a dedicated NonceManager; else reuse default
    if (Object.keys(this.nonceOverrides).length) {
      this.nonce = new NonceManager({
        newNonceUrl: dir.newNonce,
        fetch: (url) => this.client.getHttp().head(url),
        ...this.nonceOverrides,
      });
    } else {
      this.nonce = this.client.getDefaultNonce();
    }
  }

  /** Export JWK and compute thumbprint (stable namespace when kid is not yet assigned) */
  private async jwk(): Promise<jose.JWK> {
    return await jose.exportJWK(this.keys.publicKey);
  }
  private async thumb(): Promise<string> {
    // RFC 7638 canonical thumbprint
    const jwk = await this.jwk();
    // jose.calculateJwkThumbprint already canonicalizes; keep it if available, else manual:
    return await jose.calculateJwkThumbprint(jwk, 'sha256');
  }

  private async nonceNamespace(): Promise<string> {
    const host = new URL(this.client.directoryUrl).host;
    // const id = this.kid ?? (await this.thumb());
    // return NonceManager.makeNamespace(host, id);
    // return NonceManager.makeNamespace(host);
    return host;
  }

  /** Ensure account is registered; sets this.kid on success (idempotent & coalesced) */
  public async ensureRegistered(payload = { contact: [] as string[], termsOfServiceAgreed: true }): Promise<string> {
    await this.ensureInit();
    if (this.kid) return this.kid;

    const dir = this.directory!;
    const id = await this.thumb();

    return await coalesceAsync(`acct:${this.client.directoryUrl}:${id}`, async () => {
      if (this.kid) return this.kid;

      const nm = this.nonce!;
      const ns = await this.nonceNamespace();

      const res = await nm.withNonceRetry(ns, async (nonce) => {
        const jws = await this.signJws(payload, dir.newAccount, nonce, /*forceJwk*/ true);
        return this.client.getHttp().post(dir.newAccount, jws, {
          'Content-Type': 'application/jose+json',
          Accept: 'application/json',
        });
      });

      if (res.status >= 400) throw createErrorFromProblem(res.data);

      const location = res.headers?.location || res.headers?.Location;

      const resourceUrl = ((res.data as any)?.url ||
        (location && (Array.isArray(location) ? location[0] : location))) as string;

      if (!resourceUrl) throw new Error('newAccount: missing account location (kid)');
      this.kid = String(resourceUrl);
      return this.kid!;
    });
  }

  private prefillUrl(response: HttpResponse<any>): HttpResponse<any> {
    const ct = response.headers['content-type'];
    if (typeof ct === 'string' && ct.includes('application/json')) {
      const location = response.headers?.location || response.headers?.Location;

      const resourceUrl = ((response.data as any)?.url ||
        (location && (Array.isArray(location) ? location[0] : location))) as string;

      return {
        status: response.status,
        headers: response.headers,
        data: {
          ...response.data,
          ...(resourceUrl && { url: resourceUrl }),
        },
      };
    }

    return response
  }

  /** Create a new order for given DNS identifiers */
  public async newOrder(domains: string[]): Promise<ACMEOrder> {
    await this.ensureRegistered();
    const dir = this.directory!;
    const nm = this.nonce!;
    const ns = await this.nonceNamespace();

    const payload = { identifiers: domains.map((d) => ({ type: 'dns', value: d })) };

    const res = await nm.withNonceRetry(ns, async (nonce) => {
      const jws = await this.signJws(payload, dir.newOrder, nonce);
      const response = this.client.getHttp().post(dir.newOrder, jws, {
        'Content-Type': 'application/jose+json',
        Accept: 'application/json',
      });

      return this.prefillUrl(await response);
    });

    if (res.status >= 400) throw createErrorFromProblem(res.data);
    return res.data as ACMEOrder;
  }

  async solveDns01(order: ACMEOrder, opts: {
    waitFor: (fqdn: string, expected: string) => Promise<void>;
    setDns: (fqdn: string, value: string) => Promise<void>;
  }) {
    const authzUrl = order.authorizations[0];
    if (!authzUrl) throw new Error('No authz URL');

    const authorizations: ACMEAuthorization[] = await Promise.all(order.authorizations.map((url) => this.fetch<ACMEAuthorization>(url)));

    for (const authorization of authorizations) {
      const challenge: ACMEChallenge | undefined = authorization.challenges?.find((c: any) => c.type === 'dns-01');
      if (!challenge) throw new Error('No dns-01 challenge');

      const keyAuth = await this.keyAuthorization(challenge.token);

      const txtValue = createHash('sha256').update(keyAuth).digest('base64url');

      const fqdn = `_acme-challenge.${authorization.identifier.value}`;
      await opts.setDns(fqdn, txtValue);
      await opts.waitFor(fqdn, txtValue);

      await this.completeChallenge(challenge);
    }

    console.log(order);
    return await this.waitOrder(order.url, ['ready', 'valid']);
  }

  /** Complete a specific challenge (payload includes keyAuthorization) */
  public async completeChallenge(ch: ACMEChallenge): Promise<void> {
    const nm = this.nonce!;
    const ns = await this.nonceNamespace();
    const res = await nm.withNonceRetry(ns, async (nonce) => {
      const jws = await this.signJws({ keyAuthorization: await this.keyAuthorization(ch.token) }, ch.url, nonce);
      return this.client.getHttp().post(ch.url, jws, {
        'Content-Type': 'application/jose+json',
        Accept: 'application/json',
      });
    });
    if (res.status >= 400) throw createErrorFromProblem(res.data);
  }

  /** Wait until order status becomes one of target (or 'invalid') */
  public async waitOrder(url: string, target: Array<ACMEOrder['status']>): Promise<ACMEOrder> {
    for (; ;) {
      const o = await this.fetch<ACMEOrder>(url);
      if (target.includes(o.status) || o.status === 'invalid') return o;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  /** Finalize order with CSR (base64url DER) */
  public async finalize(order: ACMEOrder, csrDerBase64Url: string): Promise<ACMEOrder> {
    const nm = this.nonce!;
    const ns = await this.nonceNamespace();

    const res = await nm.withNonceRetry(ns, async (nonce) => {
      const jws = await this.signJws({ csr: csrDerBase64Url }, order.finalize, nonce);
      const response = this.client.getHttp().post(order.finalize, jws, {
        'Content-Type': 'application/jose+json',
        Accept: 'application/json',
      });

      return this.prefillUrl(await response);
    });
    if (res.status >= 400) throw createErrorFromProblem(res.data);
    return res.data as ACMEOrder;
  }

  /** Download certificate (PEM chain) for a valid order */
  public async downloadCertificate(order: ACMEOrder): Promise<string> {
    if (!order.certificate) throw new Error('No certificate URL on order');
    const nm = this.nonce!;
    const ns = await this.nonceNamespace();

    const res = await nm.withNonceRetry(ns, async (nonce) => {
      const jws = await this.signJws('', order.certificate!, nonce);
      return this.client.getHttp().post(order.certificate!, jws, {
        'Content-Type': 'application/jose+json',
        Accept: 'application/pem-certificate-chain',
      });
    });
    if (res.status !== 200) throw createErrorFromProblem(res.data);
    return String(res.data);
  }

  /** Helper: POST-as-GET (authenticated resource fetch) */
  public async fetch<T>(url: string): Promise<T> {
    const nm = this.nonce!;
    const ns = await this.nonceNamespace();

    const res = await nm.withNonceRetry(ns, async (nonce) => {
      const jws = await this.signJws('', url, nonce);
      const response = this.client.getHttp().post(url, jws, {
        'Content-Type': 'application/jose+json',
        Accept: 'application/json',
      });

      return this.prefillUrl(await response);
    });

    if (res.status >= 400) throw createErrorFromProblem(res.data);
    return res.data;
  }

  /** ACME keyAuthorization for token */
  public async keyAuthorization(token: string): Promise<string> {
    const jwk = await jose.exportJWK(this.keys.publicKey);
    const thumb = await jose.calculateJwkThumbprint(jwk, 'sha256');
    return `${token}.${thumb}`;
  }

  /** Sign flattened JWS with kid or embedded JWK */
  private async signJws(payload: any, url: string, nonce: string, forceJwk = false) {
    const protectedHeader: jose.JWSHeaderParameters = {
      alg: 'ES256',
      url,
      nonce,
      ...(forceJwk || !this.kid
        ? { jwk: await jose.exportJWK(this.keys.publicKey) }
        : { kid: this.kid }),
    };

    return await new jose.FlattenedSign(encodePayload(payload))
      .setProtectedHeader(protectedHeader)
      .sign(this.keys.privateKey);
  }
}
