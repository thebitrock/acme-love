import * as jose from 'jose';
import { createHash } from 'crypto';

import type { webcrypto } from 'crypto';
import type { AcmeClientCore } from './acme-client-core.js';
import { NonceManager, type NonceManagerOptions } from './nonce-manager.js';
import type { ACMEOrder, ACMEChallenge, ACMEAuthorization } from '../types/order.js';
import { debugChallenge } from '../debug.js';
import { createErrorFromProblem } from '../errors/factory.js';
import type { ACMEDirectory } from '../types/directory.js';
import type { ParsedResponseData } from '../http/http-client.js';

/** Keys bound to a single ACME account session */
export interface AccountKeys {
  privateKey: webcrypto.CryptoKey;
  publicKey: webcrypto.CryptoKey;
}

/** External Account Binding parameters for CA pre-authorization */
export interface ExternalAccountBinding {
  /** Key identifier provided by the CA */
  kid: string;
  /** HMAC key (base64url encoded) provided by the CA */
  hmacKey: string;
}

export interface AcmeAccountSessionOptions {
  /** Pre-existing account kid (if account already registered) */
  kid?: string;
  /** Per-account NonceManager overrides (pool, prefetch, logging, etc.) */
  nonceOverrides?: Partial<NonceManagerOptions>;
}

/** Stateless helpers to generate JWS payload/headers with kid or embedded JWK */
function encodePayload(payload: unknown): Uint8Array {
  if (payload === null || payload === undefined) return new Uint8Array(0);
  return new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

interface ChallengePreparation {
  target: string;
  value: string;
  additional?: { token: string };
}

/** Generic challenge handler interface */
interface ChallengeHandler {
  challengeType: string;
  prepareChallenge: (
    authorization: ACMEAuthorization,
    keyAuth: string,
    challenge: ACMEChallenge,
  ) => Promise<ChallengePreparation>;
  setChallenge: (challenge: ChallengePreparation) => Promise<void>;
  waitFor: (challenge: ChallengePreparation) => Promise<void>;
}

type ChallengeWithPossibleError = ACMEChallenge & { error?: unknown };

function throwIfChallengeErrors(authz: ACMEAuthorization): void {
  if (!authz.challenges) return;
  for (const chRaw of authz.challenges as ChallengeWithPossibleError[]) {
    if (chRaw.error && chRaw.status !== 'valid') {
      debugChallenge(
        'challenge error detected type=%s raw=%j',
        typeof chRaw.error === 'object' && chRaw.error && 'type' in chRaw.error
          ? (chRaw.error as { type?: unknown }).type
          : undefined,
        chRaw.error,
      );
      const mapped = createErrorFromProblem(chRaw.error);
      debugChallenge('mapped challenge error name=%s detail=%s', mapped.name, mapped.detail);
      throw mapped;
    }
    if (chRaw.status === 'invalid') {
      throw new Error(`Challenge ${chRaw.type} is invalid without error detail`);
    }
  }
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

  private requireDirectory(): ACMEDirectory {
    if (!this.directory) throw new Error('ACME directory not initialized yet');
    return this.directory;
  }

  private requireNonce(): NonceManager {
    if (!this.nonce) throw new Error('NonceManager not initialized yet');
    return this.nonce;
  }

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

  // (Removed jwk()/thumb() helpers after dropping cross-instance coalescing logic)

  private async nonceNamespace(): Promise<string> {
    return new URL(this.client.directoryUrl).host;
  }

  /** Ensure account is registered; sets this.kid on success (idempotent for a single instance) */
  public async ensureRegistered(
    payload = { contact: [] as string[], termsOfServiceAgreed: true },
    eab?: ExternalAccountBinding,
  ): Promise<string> {
    await this.ensureInit();
    if (this.kid) return this.kid;

    const dir = this.requireDirectory();
    const nm = this.requireNonce();
    const ns = await this.nonceNamespace();

    // Include EAB in payload if provided
    let finalPayload: object = payload;
    if (eab) {
      const externalAccountBinding = await this.createExternalAccountBinding(eab);
      finalPayload = { ...payload, externalAccountBinding };
    }

    const res = await nm.withNonceRetry(ns, async (nonce) => {
      const jws = await this.signJws(finalPayload, dir.newAccount, nonce, /*forceJwk*/ true);
      return this.client.getHttp().post(dir.newAccount, jws, {
        'Content-Type': 'application/jose+json',
        Accept: 'application/json',
      });
    });

    if (res.statusCode >= 400) throw createErrorFromProblem(res.body);

    const location = res.headers?.location || res.headers?.Location;
    const resourceUrl = ((res.body as Record<string, unknown>)?.url ||
      (location && (Array.isArray(location) ? location[0] : location))) as string;

    if (!resourceUrl) throw new Error('newAccount: missing account location (kid)');
    this.kid = String(resourceUrl);
    return this.kid;
  }

  private prefillUrl(response: ParsedResponseData): ParsedResponseData {
    const ct = response.headers['content-type'];
    if (typeof ct === 'string' && ct.includes('application/json')) {
      const location = response.headers?.location || response.headers?.Location;

      const resourceUrl = ((response.body as Record<string, unknown>)?.url ||
        (location && (Array.isArray(location) ? location[0] : location))) as string;

      return {
        statusCode: response.statusCode,
        headers: response.headers,
        body: {
          ...(typeof response.body === 'object' && response.body !== null ? response.body : {}),
          ...(resourceUrl && { url: resourceUrl }),
        },
        trailers: response.trailers,
        opaque: response.opaque,
        context: response.context,
      };
    }

    return response;
  }

  /** Create a new order for given DNS identifiers */
  public async newOrder(domains: string[]): Promise<ACMEOrder> {
    await this.ensureRegistered();
    const dir = this.requireDirectory();
    const nm = this.requireNonce();
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

    if (res.statusCode >= 400) throw createErrorFromProblem(res.body);
    return res.body as ACMEOrder;
  }

  /** Generic challenge solver that handles the common flow */
  private async solveChallenge(order: ACMEOrder, handler: ChallengeHandler): Promise<ACMEOrder> {
    if (order.status === 'valid' || order.status === 'ready') {
      return order;
    }

    const authzUrl = order.authorizations[0];
    if (!authzUrl) throw new Error('No authz URL');

    const authorizations: ACMEAuthorization[] = await Promise.all(
      order.authorizations.map((url) => this.fetch<ACMEAuthorization>(url)),
    );

    // Early detection of challenge-level errors (e.g., compound validation errors)
    for (const authz of authorizations) {
      throwIfChallengeErrors(authz);
    }

    for (const authorization of authorizations) {
      const challenge: ACMEChallenge | undefined = authorization.challenges?.find(
        (c: ACMEChallenge) => c.type === handler.challengeType,
      );
      if (!challenge) throw new Error(`No ${handler.challengeType} challenge`);

      const keyAuth = await this.keyAuthorization(challenge.token);
      const challengePreparation = await handler.prepareChallenge(
        authorization,
        keyAuth,
        challenge,
      );

      await handler.setChallenge(challengePreparation);
      await handler.waitFor(challengePreparation);
      await this.completeChallenge(challenge);
    }

    return await this.waitOrder(order, ['ready', 'valid']);
  }

  async solveDns01(
    order: ACMEOrder,
    opts: {
      waitFor: (preparation: ChallengePreparation) => Promise<void>;
      setDns: (preparation: ChallengePreparation) => Promise<void>;
    },
  ) {
    return this.solveChallenge(order, {
      challengeType: 'dns-01',
      prepareChallenge: async (
        authorization: ACMEAuthorization,
        keyAuth: string,
        _challenge: ACMEChallenge,
      ) => {
        const txtValue = createHash('sha256').update(keyAuth).digest('base64url');
        const fqdn = `_acme-challenge.${authorization.identifier.value}`;
        return { target: fqdn, value: txtValue };
      },
      setChallenge: opts.setDns,
      waitFor: opts.waitFor,
    });
  }

  async solveHttp01(
    order: ACMEOrder,
    opts: {
      waitFor: (preparation: ChallengePreparation) => Promise<void>;
      setHttp: (preparation: ChallengePreparation) => Promise<void>;
    },
  ) {
    return this.solveChallenge(order, {
      challengeType: 'http-01',
      prepareChallenge: async (
        authorization: ACMEAuthorization,
        keyAuth: string,
        challenge: ACMEChallenge,
      ) => {
        const url = `http://${authorization.identifier.value}/.well-known/acme-challenge/${challenge.token}`;
        return { target: url, value: keyAuth, additional: { token: challenge.token } };
      },
      setChallenge: opts.setHttp,
      waitFor: opts.waitFor,
    });
  }

  /** Complete a specific challenge (payload includes keyAuthorization) */
  public async completeChallenge(ch: ACMEChallenge): Promise<void> {
    if (ch.status === 'valid') {
      return;
    }

    const nm = this.requireNonce();
    const ns = await this.nonceNamespace();
    const res = await nm.withNonceRetry(ns, async (nonce) => {
      const jws = await this.signJws(
        { keyAuthorization: await this.keyAuthorization(ch.token) },
        ch.url,
        nonce,
      );
      return this.client.getHttp().post(ch.url, jws, {
        'Content-Type': 'application/jose+json',
        Accept: 'application/json',
      });
    });
    if (res.statusCode >= 400) throw createErrorFromProblem(res.body);
  }

  /** Wait until order status becomes one of target (or 'invalid') */
  public async waitOrder(order: ACMEOrder, target: Array<ACMEOrder['status']>): Promise<ACMEOrder> {
    if (order.status === 'valid' || target.includes(order.status)) {
      return order;
    }

    for (;;) {
      const o = await this.fetch<ACMEOrder>(order.url);
      if (target.includes(o.status) || o.status === 'invalid') return o;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  /** Finalize order with CSR (base64url DER) */
  public async finalize(order: ACMEOrder, csrDerBase64Url: string): Promise<ACMEOrder> {
    if (order.status === 'valid') {
      return order;
    }

    const nm = this.requireNonce();
    const ns = await this.nonceNamespace();

    const res = await nm.withNonceRetry(ns, async (nonce) => {
      const jws = await this.signJws({ csr: csrDerBase64Url }, order.finalize, nonce);
      const response = await this.client.getHttp().post(order.finalize, jws, {
        'Content-Type': 'application/jose+json',
        Accept: 'application/json',
      });

      return this.prefillUrl(response);
    });
    if (res.statusCode >= 400) throw createErrorFromProblem(res.body);
    return res.body as ACMEOrder;
  }

  /** Download certificate (PEM chain) for a valid order */
  public async downloadCertificate(order: ACMEOrder): Promise<string> {
    if (!order.certificate) throw new Error('No certificate URL on order');
    const nm = this.requireNonce();
    const ns = await this.nonceNamespace();

    const res = await nm.withNonceRetry(ns, async (nonce) => {
      const certUrl = order.certificate;
      if (!certUrl) throw new Error('No certificate URL on order');
      const jws = await this.signJws('', certUrl, nonce);
      return this.client.getHttp().post(certUrl, jws, {
        'Content-Type': 'application/jose+json',
        Accept: 'application/pem-certificate-chain',
      });
    });
    if (res.statusCode !== 200) throw createErrorFromProblem(res.body);
    return String(res.body);
  }

  /** Helper: POST-as-GET (authenticated resource fetch) */
  public async fetch<T>(url: string): Promise<T> {
    const nm = this.requireNonce();
    const ns = await this.nonceNamespace();

    const res = await nm.withNonceRetry(ns, async (nonce) => {
      const jws = await this.signJws('', url, nonce);
      const response = this.client.getHttp().post(url, jws, {
        'Content-Type': 'application/jose+json',
        Accept: 'application/json',
      });

      return this.prefillUrl(await response);
    });

    if (res.statusCode >= 400) throw createErrorFromProblem(res.body);
    return res.body as T;
  }

  /** ACME keyAuthorization for token */
  public async keyAuthorization(token: string): Promise<string> {
    const jwk = await jose.exportJWK(this.keys.publicKey);
    const thumb = await jose.calculateJwkThumbprint(jwk, 'sha256');
    return `${token}.${thumb}`;
  }

  /** Create External Account Binding JWS per RFC 8555 Section 7.3.4 */
  private async createExternalAccountBinding(
    eab: ExternalAccountBinding,
  ): Promise<jose.FlattenedJWS> {
    const jwk = await jose.exportJWK(this.keys.publicKey);

    // Decode HMAC key from base64url
    const hmacKeyBytes = jose.base64url.decode(eab.hmacKey);

    // Import HMAC key for signing
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      hmacKeyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const protectedHeader: jose.JWSHeaderParameters = {
      alg: 'HS256',
      kid: eab.kid,
      url: this.requireDirectory().newAccount,
    };

    return await new jose.FlattenedSign(encodePayload(jwk))
      .setProtectedHeader(protectedHeader)
      .sign(hmacKey);
  }

  /** Sign flattened JWS with kid or embedded JWK */
  private async signJws(payload: unknown, url: string, nonce: string, forceJwk = false) {
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
