/**
 * RFC 8555 ACME Account Management
 *
 * This module implements the Automatic Certificate Management Environment (ACME)
 * protocol as defined in RFC 8555. It provides a complete implementation of the
 * ACME account management and certificate lifecycle operations.
 *
 * The ACME protocol allows for automated certificate issuance, renewal, and
 * revocation through a standardized API. This implementation supports:
 *
 * - Account registration and management
 * - Certificate order creation and tracking
 * - HTTP-01 and DNS-01 challenge validation
 * - Certificate finalization and download
 * - External Account Binding for enterprise CAs
 * - Proper error handling with RFC 7807 problem details
 *
 * Security Features:
 * - JSON Web Signature (JWS) authentication
 * - Replay protection via nonces
 * - URL integrity protection
 * - Account key isolation
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555
 * @see https://datatracker.ietf.org/doc/html/rfc7515 (JSON Web Signature)
 * @see https://datatracker.ietf.org/doc/html/rfc7807 (Problem Details)
 */

import * as jose from 'jose';

import type { webcrypto } from 'crypto';
import type { AcmeClient } from './acme-client.js';
import { NonceManager, type NonceManagerOptions } from '../managers/nonce-manager.js';
import type {
  AcmeOrder,
  AcmeChallenge,
  AcmeAuthorization,
  AcmeOrderStatus,
  AcmeChallengeType,
} from '../../lib/types/order.js';
import {
  ORDER_STATUS,
  AUTHORIZATION_STATUS,
  CHALLENGE_STATUS,
  CHALLENGE_TYPE,
} from '../types/status.js';
import { createErrorFromProblem } from '../errors/factory.js';
import { debugChallenge } from '../utils/debug.js';
import type { AcmeDirectory } from '../types/directory.js';
import type { ParsedResponseData } from '../transport/http-client.js';
import {
  AuthorizationError,
  ChallengeError,
  OrderError,
  AccountError,
} from '../errors/acme-operation-errors.js';

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
    if (chRaw.status === CHALLENGE_STATUS.INVALID) {
      throw ChallengeError.invalidWithoutDetail(chRaw.type);
    }
  }
}

/**
 * Keys bound to a single ACME account session
 *
 * Account key pairs are used exclusively for ACME authentication and must
 * never be reused for certificates or other purposes. Each account should
 * have a unique key pair to ensure proper security isolation.
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
 * External Account Binding allows CAs to associate ACME accounts with
 * existing customer accounts in non-ACME systems. The CA provides both
 * a key identifier and HMAC key through out-of-band mechanisms.
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
 * Payload for ACME account registration.
 *
 * termsOfServiceAgreed is a required literal true (cannot be false) to ensure
 * explicit acknowledgement at call sites. This prevents automated agreement
 * without user interaction as recommended by RFC 8555.
 *
 * Contact information must use supported URL schemes (mailto is required).
 * The server validates contact URLs and may reject unsupported schemes.
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
 * These options control various aspects of account behavior including
 * authentication, nonce management, and external account binding.
 * Most options are optional and have sensible defaults.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.3
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
 * Handles all account-related operations for the ACME protocol according to
 * RFC 8555 "Automatic Certificate Management Environment (ACME)". This class
 * implements the complete certificate lifecycle management including:
 *
 * - Account registration and management (Section 7.3)
 * - Order creation and tracking (Section 7.4)
 * - Identifier authorization and challenge handling (Section 7.5, Section 8)
 * - Certificate issuance and download (Section 7.4.2)
 * - Authenticated resource access via POST-as-GET (Section 6.3)
 *
 * Key Features:
 * - Automatic nonce management with retry logic
 * - Support for HTTP-01 and DNS-01 challenges
 * - External Account Binding for enterprise CAs
 * - Proper error handling with RFC 7807 problem details
 * - JWS authentication with ES256 signatures
 *
 * Security Considerations:
 * - Account keys should be used exclusively for ACME authentication
 * - Certificate keys must be different from account keys
 * - All requests include replay protection via nonces
 * - URL integrity protection prevents MITM attacks
 *
 * @example
 * ```typescript
 * const account = new AcmeAccount(client, keys, { kid: accountUrl });
 *
 * // Create certificate order
 * const order = await account.createOrder(['example.com', 'www.example.com']);
 *
 * // Solve DNS-01 challenges
 * await account.solveDns01(order, {
 *   setDns: async (prep) => { ... },
 *   waitFor: async (prep) => { ... }
 * });
 *
 * // Finalize and download certificate
 * const finalOrder = await account.finalize(order, csrDerBase64Url);
 * const cert = await account.downloadCertificate(finalOrder);
 * ```
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555
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
   * Implements RFC 8555 Section 7.3 (Account Management). This method creates
   * a new account with the ACME server by sending a POST request to the
   * newAccount URL. The account creation process includes:
   * 1. Contact information validation
   * 2. Terms of service agreement
   * 3. External account binding (if required by CA)
   * 4. Account key registration
   *
   * @param contact - Contact information (email addresses). The server MUST support
   *                  the "mailto" scheme and validate that contact URLs are properly formatted.
   * @param termsOfServiceAgreed - Explicit agreement to terms of service (must be true).
   *                              Required literal true to ensure explicit acknowledgement.
   * @returns Promise resolving to account registration result
   * @throws {AccountError} If registration fails due to invalid contact, unsupported schemes,
   *                        or server rejection of the account creation request
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
      throw AccountError.noAccountUrl();
    }

    this.kid = accountUrl;

    return {
      accountUrl,
      account: response.body as Record<string, unknown>,
    };
  }

  /**
   * Create External Account Binding JWS
   *
   * Implements RFC 8555 Section 7.3.4 (External Account Binding). This method
   * creates a JWS object that binds the ACME account key to an external account
   * at the CA. This is required when CAs need to associate ACME accounts with
   * existing customer accounts or billing systems.
   *
   * The binding JWS contains:
   * - Protected header with HMAC algorithm, key ID, and URL
   * - Payload containing the account public key in JWK format
   * - Signature using the HMAC key provided by the CA
   *
   * The CA must provide both a key identifier (kid) and HMAC key through
   * an out-of-band mechanism before account creation.
   *
   * @param eab - External account binding parameters from CA
   * @param url - The newAccount URL being posted to
   * @returns Promise resolving to the binding JWS string
   * @throws {AccountError} If JWS creation fails or parameters are invalid
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.3.4
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
   *
   * Implements RFC 8555 Section 6.2 (Request Authentication) and Section 6.5
   * (Replay Protection). This method creates a properly authenticated ACME
   * request using JSON Web Signature (JWS) with the following features:
   *
   * - Automatic nonce management with retry on badNonce errors
   * - Account key authentication via kid or jwk header parameters
   * - URL integrity protection via url header parameter
   * - Replay protection via nonce header parameter
   *
   * The method uses ES256 algorithm for signing and handles the complete
   * ACME authentication flow including nonce acquisition and retry logic.
   *
   * @param url - Target ACME resource URL
   * @param payload - Request payload (object, string, Uint8Array, or null for POST-as-GET)
   * @param forceJwk - Force use of jwk header instead of kid (required for newAccount)
   * @returns Promise resolving to server response with parsed JSON body
   * @throws {AccountError} If signing fails, nonce exhaustion, or server rejects request
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-6.2
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-6.5
   * @see https://datatracker.ietf.org/doc/html/rfc7515 (JSON Web Signature)
   */
  private async signedPost(
    url: string,
    payload: string | Record<string, unknown> | Uint8Array | null | undefined,
    forceJwk = false,
  ): Promise<ParsedResponseData> {
    const nonceManager = await this.ensureNonceManager();
    const namespace = new URL(this.client.directoryUrl).host;

    return nonceManager.withNonceRetry(namespace, async (nonce) => {
      const protectedHeader: Record<string, unknown> = {
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
   *
   * Implements RFC 8555 Section 7.3.2 (Account Update). This method retrieves
   * the current account object from the ACME server using POST-as-GET.
   * The account object contains contact information, status, and links to
   * related resources.
   *
   * @returns Promise resolving to current account object
   * @throws {AccountError} If account is not registered or retrieval fails
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.3.2
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.2 (Account Objects)
   */
  async getAccount(): Promise<Record<string, unknown>> {
    if (!this.kid) {
      throw AccountError.notRegistered();
    }

    const response = await this.signedPost(this.kid, '');

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    return response.body as Record<string, unknown>;
  }

  /**
   * Public fetch method for authenticated resource access (compatibility with old API)
   *
   * Implements RFC 8555 Section 6.3 (POST-as-GET Requests). This method performs
   * authenticated resource fetching using POST requests with empty payloads,
   * which is the standard ACME mechanism for retrieving protected resources.
   *
   * All ACME resources except directory and newNonce require authentication
   * via signed POST-as-GET requests. This method handles the authentication
   * automatically using the account key.
   *
   * @param url - URL of the ACME resource to fetch
   * @returns Promise resolving to the resource data
   * @throws {AccountError} If authentication fails or resource cannot be accessed
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-6.3
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
   * Implements RFC 8555 Section 7.4 (Applying for Certificate Issuance).
   * This method initiates the certificate issuance process by submitting an order
   * to the ACME server. The order specifies the identifiers for which a certificate
   * is requested and any timing constraints.
   *
   * The server will respond with an order object containing:
   * - Authorization URLs that must be completed before certificate issuance
   * - A finalize URL for submitting the CSR after authorizations are complete
   * - Status tracking information for the order lifecycle
   *
   * Order status transitions: pending -> ready -> processing -> valid
   *
   * @param identifiers - Array of domain names for the certificate. Each identifier
   *                      must be a fully qualified domain name. Wildcard domain names
   *                      (starting with "*") are supported if the server allows them.
   * @returns Promise resolving to an order object with authorization URLs
   * @throws {OrderError} If the server cannot fulfill the request as specified or if
   *                      identifiers are invalid/unsupported
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.4
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.3 (Order Objects)
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
   *
   * Implements RFC 8555 Section 7.5 (Identifier Authorization). This method
   * retrieves the current state of an authorization object, which represents
   * the server's authorization for an account to manage certificates for a
   * specific identifier.
   *
   * Authorization objects contain:
   * - The identifier being authorized
   * - Current status (pending, valid, invalid, deactivated, expired, revoked)
   * - Available challenges for proving control of the identifier
   * - Expiration time for valid authorizations
   *
   * Status transitions: pending -> (valid|invalid) -> (expired|deactivated|revoked)
   *
   * @param authzUrl - URL of the authorization resource from order.authorizations
   * @returns Promise resolving to authorization object with challenge details
   * @throws {AuthorizationError} If authorization cannot be retrieved or URL is invalid
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.5
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.4 (Authorization Objects)
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
   *
   * Implements RFC 8555 Section 7.5.1 (Responding to Challenges). This method
   * retrieves the current state of a specific challenge within an authorization.
   * Challenges are used to prove control of an identifier before certificate issuance.
   *
   * Challenge status transitions: pending -> processing -> (valid|invalid)
   *
   * @param challengeUrl - URL of the challenge resource
   * @returns Promise resolving to challenge object with current status and details
   * @throws {ChallengeError} If challenge cannot be retrieved or URL is invalid
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.5.1
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.5 (Challenge Objects)
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
   *
   * Implements RFC 8555 Section 7.5.1 (Responding to Challenges). This method
   * signals to the ACME server that the client is ready for challenge validation
   * by sending an empty JSON object ({}) to the challenge URL.
   *
   * Before calling this method, the client must:
   * 1. Set up the required challenge response (DNS record, HTTP file, etc.)
   * 2. Ensure the challenge response is accessible to the ACME server
   * 3. Wait for any propagation delays if necessary
   *
   * After calling this method, the server will begin validation attempts and
   * the challenge status will change from "pending" to "processing".
   *
   * @param challengeUrl - URL of the challenge to accept
   * @returns Promise resolving to updated challenge object
   * @throws {ChallengeError} If challenge acceptance fails or challenge is invalid
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.5.1
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
   * This method implements the key authorization computation used by all
   * standard ACME challenges (HTTP-01, DNS-01) to bind the challenge
   * response to the account key pair. The JWK thumbprint is computed
   * using SHA-256 as specified in RFC 7638.
   *
   * @param token - Challenge token from ACME server (base64url encoded random value
   *                with at least 128 bits of entropy)
   * @returns Key authorization string for challenge response
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-8.1 (Key Authorizations)
   * @see https://datatracker.ietf.org/doc/html/rfc7638 (JWK Thumbprint)
   */
  async keyAuthorization(token: string): Promise<string> {
    const jwk = await jose.exportJWK(this.keys.publicKey);
    const thumbprint = await jose.calculateJwkThumbprint(jwk, 'sha256');
    return `${token}.${thumbprint}`;
  }

  /**
   * Finalize order with CSR (base64url DER)
   *
   * Implements RFC 8555 Section 7.4 (Applying for Certificate Issuance).
   * This method submits a Certificate Signing Request (CSR) to complete
   * the certificate issuance process after all required authorizations
   * have been validated.
   *
   * The CSR must:
   * - Be in DER format, base64url encoded
   * - Include the exact same set of identifiers as the original order
   * - Have identifiers in either the CN field or SAN extension
   * - Use acceptable algorithms and key sizes per server policy
   *
   * @param order - Order object with finalize URL (must be in "ready" status)
   * @param csrDerBase64Url - Certificate Signing Request in base64url-encoded DER format
   * @returns Promise resolving to updated order object
   * @throws {OrderError} If order is not ready, CSR is invalid, or server rejects the request
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.4
   * @see https://datatracker.ietf.org/doc/html/rfc2986 (PKCS#10 CSR format)
   */
  async finalize(order: AcmeOrder, csrDerBase64Url: string): Promise<AcmeOrder> {
    if (!order.finalize) {
      throw OrderError.noFinalizeUrl();
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
   *
   * Implements RFC 8555 Section 7.1.6 (Status Changes) polling mechanism.
   * This method continuously polls the order resource until it reaches one
   * of the specified target statuses or times out.
   *
   * Order status transitions:
   * pending -> ready -> processing -> valid
   *            |-> invalid (on error or expiration)
   *
   * The method uses POST-as-GET requests with appropriate retry intervals
   * to check order status. Servers may include Retry-After headers to
   * suggest optimal polling intervals.
   *
   * @param order - Order object to monitor (must have URL)
   * @param targetStatuses - Array of acceptable final statuses to wait for
   * @returns Promise resolving to order object when target status is reached
   * @throws {OrderError} If timeout is reached or order enters an unexpected state
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.6
   */
  async waitOrder(order: AcmeOrder, targetStatuses: AcmeOrderStatus[]): Promise<AcmeOrder> {
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
      throw OrderError.timeout(targetStatuses, currentOrder.status, maxAttempts);
    }

    return currentOrder;
  }

  /**
   * Download certificate from finalized order
   *
   * Implements RFC 8555 Section 7.4.2 (Downloading the Certificate).
   * This method retrieves the issued certificate after the order has
   * reached "valid" status following successful finalization.
   *
   * The certificate is returned in PEM format (application/pem-certificate-chain)
   * containing the end-entity certificate followed by any intermediate
   * certificates in the chain. The format follows RFC 7468 strict encoding.
   *
   * Certificate resources are immutable once issued. For certificate
   * renewal, a new order must be created.
   *
   * @param order - Finalized order with certificate URL (status must be "valid")
   * @returns Promise resolving to certificate chain in PEM format
   * @throws {OrderError} If order has no certificate URL or download fails
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.4.2
   * @see https://datatracker.ietf.org/doc/html/rfc7468 (PEM format)
   */
  async downloadCertificate(order: AcmeOrder): Promise<string> {
    if (!order.certificate) {
      throw OrderError.noCertificateUrl();
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
   *
   * Implements RFC 8555 Section 8.4 (DNS Challenge). This method automates
   * the DNS-01 challenge validation process by:
   * 1. Computing the required TXT record value for each domain
   * 2. Setting up DNS records via the provided callback
   * 3. Waiting for DNS propagation
   * 4. Triggering server validation
   *
   * For each domain in the order, a TXT record is created at:
   * _acme-challenge.<domain> IN TXT "<base64url(SHA256(keyAuthorization))>"
   *
   * The DNS-01 challenge is suitable for:
   * - Wildcard certificates
   * - Domains behind firewalls
   * - Automated certificate management systems
   *
   * @param order - Order object containing authorizations to validate
   * @param opts.setDns - Callback to provision DNS TXT records
   * @param opts.waitFor - Callback to wait for DNS propagation before validation
   * @returns Promise resolving to updated order object
   * @throws {AuthorizationError|ChallengeError} If DNS setup fails or validation is rejected
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-8.4
   */
  async solveDns01(
    order: AcmeOrder,
    opts: {
      waitFor: (preparation: ChallengePreparation) => Promise<void>;
      setDns: (preparation: ChallengePreparation) => Promise<void>;
    },
  ): Promise<AcmeOrder> {
    return this.solveChallenge(order, {
      challengeType: CHALLENGE_TYPE.DNS_01,
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
   *
   * Implements RFC 8555 Section 8.3 (HTTP Challenge). This method automates
   * the HTTP-01 challenge validation process by:
   * 1. Computing the required key authorization for each domain
   * 2. Setting up HTTP resources via the provided callback
   * 3. Waiting for HTTP server configuration
   * 4. Triggering server validation
   *
   * For each domain in the order, an HTTP resource is created at:
   * http://<domain>/.well-known/acme-challenge/<token>
   * Content: <keyAuthorization>
   *
   * The HTTP-01 challenge requirements:
   * - Must be served over HTTP (not HTTPS) on port 80
   * - Content-Type should be application/octet-stream or text/plain
   * - Redirects are allowed but should be carefully configured
   *
   * @param order - Order object containing authorizations to validate
   * @param opts.setHttp - Callback to provision HTTP challenge files
   * @param opts.waitFor - Callback to wait for HTTP server setup before validation
   * @returns Promise resolving to updated order object
   * @throws {AuthorizationError|ChallengeError} If HTTP setup fails or validation is rejected
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-8.3
   */
  async solveHttp01(
    order: AcmeOrder,
    opts: {
      waitFor: (preparation: ChallengePreparation) => Promise<void>;
      setHttp: (preparation: ChallengePreparation) => Promise<void>;
    },
  ): Promise<AcmeOrder> {
    return this.solveChallenge(order, {
      challengeType: CHALLENGE_TYPE.HTTP_01,
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
   *
   * Implements RFC 8555 challenge validation flow with proper status checking
   * and error handling according to Section 7.1.6 (Status Changes).
   *
   * @param order - Order containing authorizations to process
   * @param opts - Challenge type specific configuration
   * @returns Promise resolving to updated order object
   * @throws {AuthorizationError|ChallengeError} If authorization is invalid or challenge processing fails
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.5.1
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.6
   */
  private async solveChallenge(
    order: AcmeOrder,
    opts: {
      challengeType: AcmeChallengeType;
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

      // RFC 8555 Section 7.1.6: Check authorization status
      if (authorization.status === AUTHORIZATION_STATUS.VALID) {
        continue; // Skip already validated authorizations
      }

      if (authorization.status === AUTHORIZATION_STATUS.INVALID) {
        throw AuthorizationError.invalid(authorization.identifier.value);
      }

      if (authorization.status === AUTHORIZATION_STATUS.DEACTIVATED) {
        throw AuthorizationError.deactivated(authorization.identifier.value);
      }

      if (authorization.status === AUTHORIZATION_STATUS.EXPIRED) {
        throw AuthorizationError.expired(authorization.identifier.value);
      }

      if (authorization.status === AUTHORIZATION_STATUS.REVOKED) {
        throw AuthorizationError.revoked(authorization.identifier.value);
      }

      // Find the requested challenge type
      const challenge = authorization.challenges?.find((ch) => ch.type === opts.challengeType);
      if (!challenge) {
        throw ChallengeError.notFound(opts.challengeType, authorization.identifier.value);
      }

      // RFC 8555 Section 7.1.6: Check challenge status
      if (challenge.status === CHALLENGE_STATUS.VALID) {
        continue; // Skip already validated challenges
      }

      if (challenge.status === CHALLENGE_STATUS.INVALID) {
        throw ChallengeError.invalid(opts.challengeType, authorization.identifier.value);
      }

      if (challenge.status === CHALLENGE_STATUS.PROCESSING) {
        // Challenge is already being validated, skip to avoid duplicate submission
        continue;
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
    return await this.waitOrder(order, [ORDER_STATUS.READY, ORDER_STATUS.VALID]);
  }

  /**
   * Complete a specific challenge by notifying the ACME server
   *
   * Implements RFC 8555 Section 7.5.1 (Responding to Challenges). According to
   * the specification, the client indicates readiness for validation by sending
   * an empty JSON object ({}) to the challenge URL, not the key authorization.
   *
   * @param challenge - Challenge object to complete
   * @throws {ChallengeError} If challenge completion fails or server rejects request
   *
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.5.1
   */
  private async completeChallenge(challenge: AcmeChallenge): Promise<void> {
    if (challenge.status === CHALLENGE_STATUS.VALID) {
      return;
    }

    // RFC 8555 Section 7.5.1: Send empty JSON object to indicate readiness
    const response = await this.signedPost(challenge.url, {});

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
