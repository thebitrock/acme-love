/**
 * ACME Rate Limiter
 * -----------------
 * Handles Let's Encrypt rate limits to prevent hitting API limitations:
 *
 * 1. Overall Requests Limit (per IP):
 *    - /acme/new-nonce: 20/sec, retry after 10 seconds
 *    - /acme/new-order: 300/sec, retry after 200 seconds
 *    - /acme/* (general): 250/sec, retry after 125 seconds
 *
 * 2. Account Registration Limits:
 *    - New Registrations per IP: 10 per 3 hours
 *
 * 3. Certificate Issuance Limits:
 *    - New Orders per Account: 300 per 3 hours
 *    - Authorization Failures: 5 per hour per identifier
 *    - Duplicate Certificate: 5 per exact set of identifiers per 7 days
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Rate limit detection from 503 responses with Retry-After header
 * - Endpoint-specific rate limiting
 * - Configurable retry strategies
 */

import { debugRateLimit } from '../debug.js';

export interface RateLimiterOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay between retries in ms (default: 300000 = 5 minutes) */
  maxDelayMs?: number;
  /** Whether to respect Retry-After header from 503 responses (default: true) */
  respectRetryAfter?: boolean;
}

export interface RateLimitInfo {
  /** The endpoint that was rate limited */
  endpoint: string;
  /** Time when we can retry (Unix timestamp) */
  retryAfter: number;
  /** Original retry delay in seconds from server */
  retryDelaySeconds: number;
  /** Number of attempts made */
  attempts: number;
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly rateLimitInfo: RateLimitInfo
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class RateLimiter {
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly respectRetryAfter: boolean;

  // Track rate limit windows per endpoint
  private rateLimitWindows = new Map<string, number>();

  constructor(options: RateLimiterOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 300_000; // 5 minutes
    this.respectRetryAfter = options.respectRetryAfter ?? true;
  }

  /**
   * Execute a function with automatic rate limit handling
   */
  async executeWithRateLimit<T>(
    fn: () => Promise<T>,
    endpoint: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        // Check if we're still in a rate limit window
        const rateLimitUntil = this.rateLimitWindows.get(endpoint);
        if (rateLimitUntil && Date.now() < rateLimitUntil) {
          const waitMs = rateLimitUntil - Date.now();
          debugRateLimit('Rate limit active for %s, waiting %dms', endpoint, waitMs);
          await this.delay(waitMs);
        }

        const result = await fn();

        // Success - clear any rate limit window
        this.rateLimitWindows.delete(endpoint);

        if (attempt > 1) {
          debugRateLimit('Rate limit retry succeeded for %s on attempt %d', endpoint, attempt);
        }

        return result;

      } catch (error: any) {
        lastError = error;

        // Check if this is a rate limit error (503 with Retry-After)
        const rateLimitInfo = this.parseRateLimitError(error, endpoint, attempt);

        if (rateLimitInfo) {
          debugRateLimit('Rate limit detected: %s, retryAfter=%d, attempt=%d/%d',
            endpoint, rateLimitInfo.retryAfter, attempt, this.maxRetries + 1);

          // Store the rate limit window
          this.rateLimitWindows.set(endpoint, rateLimitInfo.retryAfter);

          if (attempt <= this.maxRetries) {
            const delayMs = this.calculateRetryDelay(rateLimitInfo, attempt);
            debugRateLimit('Rate limited on %s, waiting %dms (attempt %d/%d)', endpoint, delayMs, attempt, this.maxRetries + 1);
            await this.delay(delayMs);
            continue;
          } else {
            throw new RateLimitError(
              `Rate limit exceeded for ${endpoint} after ${this.maxRetries + 1} attempts`,
              rateLimitInfo
            );
          }
        } else {
          // Not a rate limit error, re-throw immediately
          throw error;
        }
      }
    }

    throw lastError || new Error('Unexpected error in rate limiter');
  }

  /**
   * Parse error to detect rate limiting
   */
  private parseRateLimitError(error: any, endpoint: string, attempt: number): RateLimitInfo | null {
    // Check for HTTP 503 status (Service Unavailable) in various places
    const status = error?.response?.status || error?.status;
    const headers = error?.response?.headers || error?.headers;

    // Also check if it's our ServerInternalError with status 503 from fetch
    const isHttp503 = status === 503 ||
      (error?.message && error.message.includes('HTTP 503'));

    if (isHttp503) {
      const retryAfterHeader = headers?.['retry-after'];

      if (retryAfterHeader) {
        const retryDelaySeconds = parseInt(retryAfterHeader, 10);
        if (!isNaN(retryDelaySeconds)) {
          return {
            endpoint,
            retryAfter: Date.now() + (retryDelaySeconds * 1000),
            retryDelaySeconds,
            attempts: attempt
          };
        }
      }

      // 503 without Retry-After header - use exponential backoff
      return {
        endpoint,
        retryAfter: Date.now() + this.calculateExponentialDelay(attempt),
        retryDelaySeconds: this.calculateExponentialDelay(attempt) / 1000,
        attempts: attempt
      };
    }

    // Check for rate limit in error message
    if (error?.message && typeof error.message === 'string') {
      const message = error.message.toLowerCase();
      if (message.includes('rate limit') || message.includes('too many')) {
        // Try to parse retry time from message
        const retryMatch = message.match(/retry after ([0-9-]+ [0-9:]+)/);
        if (retryMatch) {
          const retryTime = new Date(retryMatch[1]).getTime();
          if (!isNaN(retryTime)) {
            return {
              endpoint,
              retryAfter: retryTime,
              retryDelaySeconds: Math.ceil((retryTime - Date.now()) / 1000),
              attempts: attempt
            };
          }
        }

        // Generic rate limit error - use exponential backoff
        return {
          endpoint,
          retryAfter: Date.now() + this.calculateExponentialDelay(attempt),
          retryDelaySeconds: this.calculateExponentialDelay(attempt) / 1000,
          attempts: attempt
        };
      }
    }

    return null;
  }

  /**
   * Calculate retry delay based on rate limit info and attempt number
   */
  private calculateRetryDelay(rateLimitInfo: RateLimitInfo, attempt: number): number {
    if (this.respectRetryAfter && rateLimitInfo.retryDelaySeconds > 0) {
      // Use server-provided delay, but cap it at maxDelayMs
      const serverDelay = rateLimitInfo.retryDelaySeconds * 1000;
      return Math.min(serverDelay, this.maxDelayMs);
    }

    // Fall back to exponential backoff
    return this.calculateExponentialDelay(attempt);
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateExponentialDelay(attempt: number): number {
    const delay = this.baseDelayMs * Math.pow(2, attempt - 1);
    return Math.min(delay, this.maxDelayMs);
  }

  /**
   * Sleep for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit status for an endpoint
   */
  getRateLimitStatus(endpoint: string): { isLimited: boolean; retryAfter?: number } {
    const retryAfter = this.rateLimitWindows.get(endpoint);
    if (retryAfter && Date.now() < retryAfter) {
      return { isLimited: true, retryAfter };
    }
    return { isLimited: false };
  }

  /**
   * Clear rate limit window for an endpoint (useful for testing)
   */
  clearRateLimit(endpoint: string): void {
    this.rateLimitWindows.delete(endpoint);
  }

  /**
   * Get recommended endpoints for rate limiting
   */
  static getKnownEndpoints() {
    return {
      NEW_NONCE: '/acme/new-nonce',
      NEW_ACCOUNT: '/acme/new-account',
      NEW_ORDER: '/acme/new-order',
      REVOKE_CERT: '/acme/revoke-cert',
      RENEWAL_INFO: '/acme/renewal-info',
      ACME_GENERAL: '/acme/*',
      DIRECTORY: '/directory'
    } as const;
  }
}
