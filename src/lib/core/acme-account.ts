/**
 * RFC 8555 ACME Account Management
 *
 * Facade that composes request signing, order management, and challenge solving
 * into a unified API for ACME certificate lifecycle operations.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555
 */

import type { AcmeClient } from './acme-client.js';
import {
  AcmeRequestSigner,
  type AccountKeys,
  type ExternalAccountBinding,
} from './acme-request-signer.js';
import { AcmeOrderManager } from './acme-order-manager.js';
import { AcmeChallengeSolver, type ChallengePreparation } from './acme-challenge-solver.js';
import type { NonceManagerOptions } from '../managers/nonce-manager.js';
import type {
  AcmeOrder,
  AcmeOrderStatus,
  AcmeAuthorization,
  AcmeChallenge,
} from '../types/order.js';
import type { AcmeDirectory } from '../types/directory.js';
import { createErrorFromProblem } from '../errors/factory.js';
import { AccountError } from '../errors/acme-operation-errors.js';

// Re-export types that were originally defined here
export type { AccountKeys, ExternalAccountBinding } from './acme-request-signer.js';
export type { ChallengePreparation } from './acme-challenge-solver.js';

/**
 * Payload for ACME account registration
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.3
 */
export interface AcmeAccountRegistrationPayload {
  /** One or more contact email addresses (may include or omit mailto:) */
  contact: string[] | string;
  /** Explicit ToS agreement (must be true) */
  termsOfServiceAgreed: true;
}

/**
 * Configuration options for ACME account operations
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.3
 */
export interface AcmeAccountOptions {
  /** Pre-existing account kid (if account already registered) */
  kid?: string;
  /** Per-account NonceManager overrides */
  nonce?: Partial<NonceManagerOptions>;
  /** External account binding for CAs that require it */
  externalAccountBinding?: ExternalAccountBinding;
}

/**
 * RFC 8555 ACME Account Manager
 *
 * Unified facade for all ACME account operations including registration,
 * order management, challenge solving, and certificate download.
 *
 * @example
 * ```typescript
 * const account = new AcmeAccount(client, keys, { kid: accountUrl });
 *
 * const order = await account.createOrder(['example.com']);
 * await account.solveDns01(order, {
 *   setDns: async (prep) => { ... },
 *   waitFor: async (prep) => { ... }
 * });
 *
 * const finalOrder = await account.finalize(order, csrDerBase64Url);
 * const cert = await account.downloadCertificate(finalOrder);
 * ```
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555
 */
export class AcmeAccount {
  private readonly signer: AcmeRequestSigner;
  private readonly orders: AcmeOrderManager;
  private readonly challenges: AcmeChallengeSolver;
  private readonly opts: AcmeAccountOptions;

  constructor(client: AcmeClient, keys: AccountKeys, opts: AcmeAccountOptions = {}) {
    this.opts = opts;
    this.signer = new AcmeRequestSigner(client, keys, {
      ...(opts.kid !== undefined && { kid: opts.kid }),
      ...(opts.nonce !== undefined && { nonce: opts.nonce }),
    });
    this.orders = new AcmeOrderManager(this.signer);
    this.challenges = new AcmeChallengeSolver(this.signer, this.orders);

    // Late-bind so subclass overrides of getAuthorization are respected
    // by the internal challenge solve loop
    this.challenges.resolveAuthorization = (url) => this.getAuthorization(url);
  }

  /** Account key pair */
  get keys(): AccountKeys {
    return this.signer.keys;
  }

  /** Account key identifier (set after registration) */
  get kid(): string | undefined {
    return this.signer.kid || undefined;
  }

  set kid(value: string) {
    this.signer.kid = value;
  }

  /** Get the ACME directory for this account's client */
  async getDirectory(): Promise<AcmeDirectory> {
    return this.signer.getDirectory();
  }

  /**
   * Register new ACME account or update existing account
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.3
   */
  async register({ contact, termsOfServiceAgreed }: AcmeAccountRegistrationPayload): Promise<{
    accountUrl: string;
    account: Record<string, unknown>;
  }> {
    const directory = await this.getDirectory();
    const contactsArray = Array.isArray(contact) ? contact : [contact];
    const payload: {
      contact: string[];
      termsOfServiceAgreed: true;
      externalAccountBinding?: string;
    } = {
      contact: contactsArray.map((email) =>
        email.startsWith('mailto:') ? email : `mailto:${email}`,
      ),
      termsOfServiceAgreed,
    };

    if (this.opts.externalAccountBinding) {
      payload.externalAccountBinding = await this.signer.createExternalAccountBinding(
        this.opts.externalAccountBinding,
        directory.newAccount,
      );
    }

    const response = await this.signer.signedPost(directory.newAccount, payload, true);

    if (response.statusCode !== 200 && response.statusCode !== 201) {
      throw createErrorFromProblem(response.body);
    }

    const accountUrl = response.headers.location as string;
    if (!accountUrl) {
      throw AccountError.noAccountUrl();
    }

    this.signer.kid = accountUrl;

    return {
      accountUrl,
      account: response.body as Record<string, unknown>,
    };
  }

  /**
   * Get account information via POST-as-GET
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.3.2
   */
  async getAccount(): Promise<Record<string, unknown>> {
    if (!this.signer.kid) {
      throw AccountError.notRegistered();
    }

    const response = await this.signer.signedPost(this.signer.kid, null);

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    return response.body as Record<string, unknown>;
  }

  /**
   * Authenticated resource access via POST-as-GET
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-6.3
   */
  async fetch<T>(url: string): Promise<T> {
    const response = await this.signer.signedPost(url, null);

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    return response.body as T;
  }

  /**
   * Compute Key Authorization per RFC 8555 Section 8.1
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-8.1
   */
  async keyAuthorization(token: string): Promise<string> {
    return this.signer.keyAuthorization(token);
  }

  // --- Order management (delegated to AcmeOrderManager) ---

  async createOrder(identifiers: string[]): Promise<AcmeOrder> {
    return this.orders.createOrder(identifiers);
  }

  async finalize(order: AcmeOrder, csrDerBase64Url: string): Promise<AcmeOrder> {
    return this.orders.finalize(order, csrDerBase64Url);
  }

  async waitOrder(order: AcmeOrder, targetStatuses: AcmeOrderStatus[]): Promise<AcmeOrder> {
    return this.orders.waitOrder(order, targetStatuses);
  }

  async downloadCertificate(order: AcmeOrder): Promise<string> {
    return this.orders.downloadCertificate(order);
  }

  // --- Challenge solving (delegated to AcmeChallengeSolver) ---

  async getAuthorization(authzUrl: string): Promise<AcmeAuthorization> {
    const response = await this.signer.signedPost(authzUrl, null);

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    return response.body as AcmeAuthorization;
  }

  async getChallenge(challengeUrl: string): Promise<AcmeChallenge> {
    return this.challenges.getChallenge(challengeUrl);
  }

  async acceptChallenge(challengeUrl: string): Promise<AcmeChallenge> {
    return this.challenges.acceptChallenge(challengeUrl);
  }

  async solveDns01(
    order: AcmeOrder,
    opts: {
      waitFor: (preparation: ChallengePreparation) => Promise<void>;
      setDns: (preparation: ChallengePreparation) => Promise<void>;
    },
  ): Promise<AcmeOrder> {
    return this.challenges.solveDns01(order, opts);
  }

  async solveHttp01(
    order: AcmeOrder,
    opts: {
      waitFor: (preparation: ChallengePreparation) => Promise<void>;
      setHttp: (preparation: ChallengePreparation) => Promise<void>;
    },
  ): Promise<AcmeOrder> {
    return this.challenges.solveHttp01(order, opts);
  }
}
