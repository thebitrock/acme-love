import { AcmeHttpClient } from '../../lib/transport/http-client.js';
import type { AcmeDirectory } from '../types/directory.js';
import type { AcmeDirectoryEntry } from '../../directory.js';
import { NonceManager, type NonceManagerOptions } from '../managers/nonce-manager.js';
import { createErrorFromProblem } from '../errors/factory.js';

/**
 * Configuration options for AcmeClient
 *
 * Provides configuration for the ACME client, particularly for nonce management
 * which is required for anti-replay protection per RFC 8555 Section 6.5.
 */
export interface AcmeClientOptions {
  /**
   * Default NonceManager options
   *
   * These options configure the default NonceManager instance created when
   * getDirectory() is called. Individual AcmeAccount instances can override
   * these settings with their own NonceManager configuration.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.5 | RFC 8555 Section 6.5 - Replay Protection}
   */
  nonce?: Partial<NonceManagerOptions>;
}

/**
 * RFC 8555 compliant ACME client
 *
 * Core ACME client implementing RFC 8555 Automatic Certificate Management Environment
 * protocol. Handles directory discovery, nonce management, and basic ACME operations.
 *
 * The ACME protocol allows a client to request certificate management actions using
 * a set of JSON messages carried over HTTPS. The client authenticates to the server
 * by means of an "account key pair" and uses JWS to provide authentication of
 * request payloads, anti-replay protection, and integrity for HTTPS request URLs.
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc8555 | RFC 8555 - ACME Protocol}
 */
export class AcmeClient {
  public readonly directoryUrl: string;
  private readonly opts: AcmeClientOptions;
  private readonly http = new AcmeHttpClient();

  private directory?: AcmeDirectory;
  private nonce?: NonceManager;

  /**
   * Create a new ACME client instance
   *
   * Creates an ACME client configured with a directory URL. The directory URL is the only
   * URL needed to configure the client, as it provides all other ACME server endpoints.
   * Per RFC 8555 Section 7.1.1, the directory object contains URLs for ACME operations.
   *
   * @param directoryUrl - ACME directory URL string (e.g., Let's Encrypt staging/production)
   * @param opts - Client configuration options including nonce management settings
   *
   * @example
   * ```typescript
   * // Using Let's Encrypt staging directory
   * const client = new AcmeClient('https://acme-staging-v02.api.letsencrypt.org/directory');
   * ```
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.1 | RFC 8555 Section 7.1.1 - Directory}
   */
  constructor(directoryUrl: string, opts?: AcmeClientOptions);

  /**
   * Create a new ACME client instance
   *
   * Creates an ACME client using a pre-configured directory entry from the provider object.
   * This overload provides a convenient way to use well-known ACME servers without
   * manually specifying directory URLs.
   *
   * @param directoryEntry - Pre-configured directory entry from the provider object
   * @param opts - Client configuration options including nonce management settings
   *
   * @example
   * ```typescript
   * import { AcmeClient, provider } from 'acme-love';
   *
   * // Using a pre-configured provider entry
   * const client = new AcmeClient(provider.letsencrypt.staging);
   * ```
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.1 | RFC 8555 Section 7.1.1 - Directory}
   */
  constructor(directoryEntry: AcmeDirectoryEntry, opts?: AcmeClientOptions);

  constructor(directoryUrlOrEntry: string | AcmeDirectoryEntry, opts: AcmeClientOptions = {}) {
    this.directoryUrl =
      typeof directoryUrlOrEntry === 'string'
        ? directoryUrlOrEntry
        : directoryUrlOrEntry.directoryUrl;
    this.opts = opts;
  }

  /**
   * Fetch and cache ACME server directory
   *
   * Retrieves the ACME server directory object as defined in RFC 8555 Section 7.1.1.
   * The directory contains URLs for all ACME operations (newAccount, newOrder, etc.)
   * and optional metadata about the server. This method also initializes the default
   * NonceManager for anti-replay protection as required by RFC 8555 Section 6.5.
   *
   * The directory is cached after the first successful fetch to avoid unnecessary
   * network requests. Per RFC 8555, the directory should be the only URL needed
   * to configure an ACME client.
   *
   * @returns Promise that resolves to the ACME directory object
   * @throws {AcmeError} When the server returns an error response
   *
   * @example
   * ```typescript
   * const directory = await client.getDirectory();
   * console.log('New account URL:', directory.newAccount);
   * console.log('Terms of service:', directory.meta?.termsOfService);
   * ```
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.1 | RFC 8555 Section 7.1.1 - Directory}
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.5 | RFC 8555 Section 6.5 - Replay Protection}
   */
  public async getDirectory(): Promise<AcmeDirectory> {
    if (this.directory) return this.directory;

    const res = await this.http.get(this.directoryUrl);
    if (res.statusCode !== 200) {
      throw createErrorFromProblem(res.body);
    }

    this.directory = res.body as AcmeDirectory;

    // default NonceManager instance (can be overridden per-account)
    this.nonce = new NonceManager({
      newNonceUrl: this.directory?.newNonce,
      fetch: (url: string) => this.http.head(url),
      ...this.opts.nonce,
    });

    return this.directory;
  }

  /**
   * Get the raw HTTP client
   *
   * Returns the underlying ACME HTTP client that handles HTTPS requests to the
   * ACME server. This client is pre-configured for ACME protocol requirements
   * including proper error handling and response parsing.
   *
   * @returns The AcmeHttpClient instance used for ACME protocol communications
   *
   * @example
   * ```typescript
   * const httpClient = client.getHttp();
   * // Advanced usage: make custom requests to ACME server
   * const response = await httpClient.get('/custom-endpoint');
   * ```
   */
  public getHttp(): AcmeHttpClient {
    return this.http;
  }

  /**
   * Get the default NonceManager instance
   *
   * Returns the shared NonceManager instance used for anti-replay protection
   * as required by RFC 8555 Section 6.5. This manager handles nonce fetching,
   * caching, and rotation to prevent replay attacks on ACME requests.
   *
   * Individual AcmeAccount instances may create their own NonceManager with
   * custom options, but this provides a default shared instance.
   *
   * @returns The default NonceManager instance
   * @throws {Error} If called before getDirectory() has been called
   *
   * @example
   * ```typescript
   * await client.getDirectory(); // Initialize the nonce manager
   * const nonceManager = client.getDefaultNonce();
   * const nonce = await nonceManager.getNonce();
   * ```
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.5 | RFC 8555 Section 6.5 - Replay Protection}
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-7.2 | RFC 8555 Section 7.2 - Getting a Nonce}
   */
  public getDefaultNonce(): NonceManager {
    if (!this.nonce) {
      throw new Error('NonceManager not initialized yet. Call getDirectory() first.');
    }
    return this.nonce;
  }
}
