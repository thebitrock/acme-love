/**
 * RFC 8555 ACME Account Management
 *
 * Manages ACME account operations including registration, key management,
 * and certificate lifecycle according to RFC 8555 specifications.
 */

import * as jose from 'jose';

import type { webcrypto } from 'crypto';
import type { AcmeClient } from './acme-client.js';
import { NonceManager, type NonceManagerOptions } from '../managers/nonce-manager.js';
import type { AcmeOrder, AcmeChallenge, AcmeAuthorization } from '../../lib/types/order.js';
import { createErrorFromProblem } from '../errors/factory.js';
import { debugChallenge } from '../../acme/debug.js';
import type { AcmeDirectory } from '../types/directory.js';
import type { ParsedResponseData } from '../transport/http-client.js';

// Helper types for challenge error handling
type ChallengeWithPossibleError = AcmeChallenge & { error?: unknown };

// Helper function to check for challenge errors (compatibility with old API)
function throwIfChallengeErrors(authz: AcmeAuthorization): void {
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

/**
 * Configuration options for ACME account operations
 */
export interface AcmeAccountOptions {
  /** Pre-existing account kid (if account already registered) */
  kid?: string;
  /** Per-account NonceManager overrides (pool, prefetch, logging, etc.) */
  nonce?: Partial<NonceManagerOptions>;
  /** External account binding for CAs that require it */
  externalAccountBinding?: ExternalAccountBinding;
}

/**
 * RFC 8555 ACME Account Manager
 *
 * Handles all account-related operations for the ACME protocol including:
 * - Account registration and management
 * - Order creation and management
 * - Challenge handling and validation
 * - Certificate issuance and lifecycle
 *
 * This class implements RFC 8555 Section 7.3 (Account Management) and
 * related certificate lifecycle operations.
 */
export class AcmeAccount {
  public readonly keys: AccountKeys;
  public kid?: string;

  private readonly client: AcmeClient;
  private readonly opts: AcmeAccountOptions;
  private nonce: NonceManager | null = null;
  private readonly nonceOptions?: Partial<NonceManagerOptions>;

  constructor(client: AcmeClient, keys: AccountKeys, opts: AcmeAccountOptions = {}) {
    this.client = client;
    this.keys = keys;
    this.opts = opts;
    this.kid = opts.kid || '';

    // Store options for lazy initialization after directory is fetched
    this.nonceOptions = opts.nonce || {};
    this.nonce = null;
  }

  /**
   * Get the ACME directory for this account's client
   */
  async getDirectory(): Promise<AcmeDirectory> {
    return this.client.getDirectory();
  }

  /**
   * Initialize nonce manager lazily after directory is loaded
   */
  private async ensureNonceManager(): Promise<NonceManager> {
    if (!this.nonce) {
      const directory = await this.client.getDirectory();
      this.nonce = new NonceManager({
        newNonceUrl: directory.newNonce,
        fetch: (url: string) => this.client.getHttp().head(url),
        ...this.client.getDefaultNonce(),
        ...this.nonceOptions,
      });
    }
    return this.nonce;
  }

  /**
   * Register new ACME account or update existing account
   *
   * @param contact - Contact information (email addresses)
   * @param termsOfServiceAgreed - Whether user agrees to ToS
   * @returns Account URL and other registration details
   */
  async register(
    contact: string[] = [],
    termsOfServiceAgreed = false,
  ): Promise<{ accountUrl: string; account: any }> {
    const directory = await this.getDirectory();

    const payload: any = {
      contact: contact.map((email) => (email.startsWith('mailto:') ? email : `mailto:${email}`)),
      termsOfServiceAgreed,
    };

    // Add external account binding if required
    if (this.opts.externalAccountBinding) {
      payload.externalAccountBinding = await this.createExternalAccountBinding(
        this.opts.externalAccountBinding,
        directory.newAccount,
      );
    }

    const response = await this.signedPost(directory.newAccount, payload, true);

    if (response.statusCode !== 200 && response.statusCode !== 201) {
      throw createErrorFromProblem(response.body);
    }

    // Extract account URL from Location header
    const accountUrl = response.headers.location as string;
    if (!accountUrl) {
      throw new Error('No account URL in registration response');
    }

    this.kid = accountUrl;

    return {
      accountUrl,
      account: response.body,
    };
  }

  /**
   * Create External Account Binding JWS
   */
  private async createExternalAccountBinding(
    eab: ExternalAccountBinding,
    url: string,
  ): Promise<string> {
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

  /**
   * Create signed POST request to ACME server with automatic nonce retry
   */
  private async signedPost(
    url: string,
    payload: any,
    forceJwk = false,
  ): Promise<ParsedResponseData> {
    const nonceManager = await this.ensureNonceManager();
    const namespace = new URL(this.client.directoryUrl).host;

    return nonceManager.withNonceRetry(namespace, async (nonce) => {
      const protectedHeader: any = {
        alg: 'ES256', // Assuming ES256, should be determined by key type
        nonce,
        url,
      };

      // Use JWK if forced or no kid available, otherwise use kid
      if (forceJwk || !this.kid) {
        protectedHeader.jwk = await jose.exportJWK(this.keys.publicKey);
      } else {
        protectedHeader.kid = this.kid;
      }

      // Encode payload like in old API
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
   * Get account information
   */
  async getAccount(): Promise<any> {
    if (!this.kid) {
      throw new Error('Account not registered. Call register() first.');
    }

    const response = await this.signedPost(this.kid, '');

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    return response.body;
  }

  /**
   * Public fetch method for authenticated resource access (compatibility with old API)
   * This method performs POST-as-GET for authenticated resource fetching
   */
  async fetch<T>(url: string): Promise<T> {
    const response = await this.signedPost(url, '');

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    return response.body as T;
  }

  /**
   * Create new certificate order
   *
   * @param identifiers - Domain names for the certificate
   * @returns Order object with authorization URLs
   */
  async createOrder(identifiers: string[]): Promise<AcmeOrder> {
    const directory = await this.getDirectory();

    const payload = {
      identifiers: identifiers.map((domain) => ({
        type: 'dns',
        value: domain,
      })),
    };

    const response = await this.signedPost(directory.newOrder, payload);

    if (response.statusCode !== 201) {
      throw createErrorFromProblem(response.body);
    }

    const order = response.body as AcmeOrder;
    order.url = response.headers.location as string;

    return order;
  }

  /**
   * Get authorization details for a domain
   */
  async getAuthorization(authzUrl: string): Promise<AcmeAuthorization> {
    const response = await this.signedPost(authzUrl, '');

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    return response.body as AcmeAuthorization;
  }

  /**
   * Get challenge details
   */
  async getChallenge(challengeUrl: string): Promise<AcmeChallenge> {
    const response = await this.signedPost(challengeUrl, '');

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    return response.body as AcmeChallenge;
  }

  /**
   * Accept and start challenge validation
   */
  async acceptChallenge(challengeUrl: string): Promise<AcmeChallenge> {
    const response = await this.signedPost(challengeUrl, {});

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    return response.body as AcmeChallenge;
  }

  /**
   * Compute Key Authorization as per RFC 8555 Section 8.1
   *
   * The key authorization is a string that expresses a domain holder's
   * authorization for a specified key to satisfy a specified challenge,
   * by concatenating the token for the challenge with a key fingerprint.
   *
   * Format: token || '.' || base64url(JWK_Thumbprint(accountKey))
   *
   * @param token - Challenge token from ACME server
   * @returns Key authorization string for challenge response
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-8.1
   */
  async keyAuthorization(token: string): Promise<string> {
    const jwk = await jose.exportJWK(this.keys.publicKey);
    const thumbprint = await jose.calculateJwkThumbprint(jwk, 'sha256');
    return `${token}.${thumbprint}`;
  }

  /**
   * Finalize order with CSR (base64url DER)
   */
  async finalize(order: AcmeOrder, csrDerBase64Url: string): Promise<AcmeOrder> {
    if (!order.finalize) {
      throw new Error('Order does not have finalize URL');
    }

    const payload = { csr: csrDerBase64Url };
    const response = await this.signedPost(order.finalize, payload);

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    const finalizedOrder = response.body as AcmeOrder;
    if (order.url) {
      finalizedOrder.url = order.url; // Preserve original URL
    }
    return finalizedOrder;
  }

  /**
   * Wait for order to reach target status(es)
   */
  async waitOrder(order: AcmeOrder, targetStatuses: string[]): Promise<AcmeOrder> {
    let currentOrder = order;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max with 5s intervals
    
    while (!targetStatuses.includes(currentOrder.status) && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      // Fetch updated order status
      const response = await this.signedPost(currentOrder.url || '', '');
      if (response.statusCode !== 200) {
        throw createErrorFromProblem(response.body);
      }
      
      currentOrder = response.body as AcmeOrder;
      attempts++;
    }

    if (!targetStatuses.includes(currentOrder.status)) {
      throw new Error(
        `Order did not reach target status ${targetStatuses.join(', ')} after ${maxAttempts} attempts. Current status: ${currentOrder.status}`,
      );
    }

    return currentOrder;
  }

  /**
   * Download certificate from finalized order
   */
  async downloadCertificate(order: AcmeOrder): Promise<string> {
    if (!order.certificate) {
      throw new Error('Order does not have certificate URL');
    }

    const response = await this.signedPost(order.certificate, '');

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    // Certificate should be returned as text/plain or application/pem-certificate-chain
    return response.body as string;
  }

  /**
   * Solve DNS-01 challenge for all authorizations in an order
   */
  async solveDns01(
    order: AcmeOrder,
    opts: {
      waitFor: (preparation: ChallengePreparation) => Promise<void>;
      setDns: (preparation: ChallengePreparation) => Promise<void>;
    },
  ): Promise<AcmeOrder> {
    return this.solveChallenge(order, {
      challengeType: 'dns-01',
      prepareChallenge: async (
        authorization: AcmeAuthorization,
        keyAuth: string,
        _challenge: AcmeChallenge,
      ) => {
        const { createHash } = await import('crypto');
        const txtValue = createHash('sha256').update(keyAuth).digest('base64url');
        const fqdn = `_acme-challenge.${authorization.identifier.value}`;
        return { target: fqdn, value: txtValue };
      },
      setChallenge: opts.setDns,
      waitFor: opts.waitFor,
    });
  }

  /**
   * Solve HTTP-01 challenge for all authorizations in an order
   */
  async solveHttp01(
    order: AcmeOrder,
    opts: {
      waitFor: (preparation: ChallengePreparation) => Promise<void>;
      setHttp: (preparation: ChallengePreparation) => Promise<void>;
    },
  ): Promise<AcmeOrder> {
    return this.solveChallenge(order, {
      challengeType: 'http-01',
      prepareChallenge: async (
        authorization: AcmeAuthorization,
        keyAuth: string,
        challenge: AcmeChallenge,
      ) => {
        const url = `http://${authorization.identifier.value}/.well-known/acme-challenge/${challenge.token}`;
        return { target: url, value: keyAuth, additional: { token: challenge.token } };
      },
      setChallenge: opts.setHttp,
      waitFor: opts.waitFor,
    });
  }

  /**
   * Generic challenge solving method
   */
  private async solveChallenge(
    order: AcmeOrder,
    opts: {
      challengeType: string;
      prepareChallenge: (
        authorization: AcmeAuthorization,
        keyAuth: string,
        challenge: AcmeChallenge,
      ) => Promise<ChallengePreparation>;
      setChallenge: (preparation: ChallengePreparation) => Promise<void>;
      waitFor: (preparation: ChallengePreparation) => Promise<void>;
    },
  ): Promise<AcmeOrder> {
    // Process each authorization
    for (const authzUrl of order.authorizations || []) {
      const authorization = await this.getAuthorization(authzUrl);

      // Early detection of challenge-level errors (e.g., compound validation errors)
      throwIfChallengeErrors(authorization);

      if (authorization.status === 'valid') {
        continue; // Skip already validated authorizations
      }

      // Find the requested challenge type
      const challenge = authorization.challenges?.find((ch) => ch.type === opts.challengeType);
      if (!challenge) {
        throw new Error(
          `Challenge type ${opts.challengeType} not found for ${authorization.identifier.value}`,
        );
      }

      if (challenge.status === 'valid') {
        continue; // Skip already validated challenges
      }

      // Generate key authorization
      const keyAuth = await this.keyAuthorization(challenge.token);

      // Prepare challenge response
      const preparation = await opts.prepareChallenge(authorization, keyAuth, challenge);

      // Set up challenge response (DNS record, HTTP file, etc.)
      await opts.setChallenge(preparation);

      // Wait for external setup to be ready
      await opts.waitFor(preparation);

      // Signal ACME server to validate the challenge
      await this.completeChallenge(challenge);
    }

    // Wait for order to become ready
    return await this.waitOrder(order, ['ready', 'valid']);
  }

  /**
   * Complete a specific challenge by notifying the ACME server
   */
  private async completeChallenge(challenge: AcmeChallenge): Promise<void> {
    if (challenge.status === 'valid') {
      return;
    }

    const keyAuth = await this.keyAuthorization(challenge.token);
    const response = await this.signedPost(challenge.url, { keyAuthorization: keyAuth });

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }
  }
}

/** Challenge preparation data */
interface ChallengePreparation {
  target: string;
  value: string;
  additional?: Record<string, unknown>;
}
