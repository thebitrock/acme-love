/**
 * Rate Limiter for ACME Operations
 *
 * Manages rate limiting and backoff for ACME protocol requests
 */

import { debugRateLimit } from '../utils/debug.js';

export interface RateLimiterOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay between retries in ms (default: 5 minutes) */
  maxDelayMs?: number;
  /** Whether to respect Retry-After header from 503/429 responses (default: true) */
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

/**
 * Rate limit error with retry information
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly rateLimitInfo: RateLimitInfo,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * ACME Rate Limiter
 *
 * Handles rate limiting and exponential backoff for ACME operations.
 * Respects server rate limit responses and implements client-side throttling.
 */
export class RateLimiter {
  private readonly opts: Required<RateLimiterOptions>;
  private readonly rateLimits = new Map<string, number>();
  private readonly pendingAcquires = new Map<string, Promise<void>>();
  private lastRequest = 0;
  private readonly minInterval = 100; // Minimum 100ms between requests

  constructor(opts: RateLimiterOptions = {}) {
    this.opts = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 5 * 60 * 1000, // 5 minutes
      respectRetryAfter: true,
      ...opts,
    };
  }

  /**
   * Acquire permission to make a request (with rate limiting)
   *
   * @param endpoint - Optional endpoint identifier for per-endpoint limiting
   */
  async acquire(endpoint = 'default'): Promise<void> {
    // Check if there's already a pending acquire for this endpoint
    const pendingAcquire = this.pendingAcquires.get(endpoint);
    if (pendingAcquire) {
      // Show rate limit status while coordinating
      const rateLimitedUntil = this.rateLimits.get(endpoint);
      if (rateLimitedUntil && Date.now() < rateLimitedUntil) {
        const waitMs = rateLimitedUntil - Date.now();
        const waitSeconds = Math.ceil(waitMs / 1000);
        debugRateLimit(
          'RATE LIMIT COORDINATION: waiting for existing acquire on endpoint %s (rate limited for %ds more)',
          endpoint,
          waitSeconds,
        );
      } else {
        debugRateLimit(
          'RATE LIMIT COORDINATION: waiting for existing acquire on endpoint %s',
          endpoint,
        );
      }

      await pendingAcquire;
      // After the first acquire completes, others can proceed without additional delay
      return;
    }

    // Create and store the acquire promise for coordination
    const acquirePromise = this.doAcquire(endpoint);
    this.pendingAcquires.set(endpoint, acquirePromise);

    try {
      await acquirePromise;
    } finally {
      // Clean up the pending promise when done
      this.pendingAcquires.delete(endpoint);
    }
  }

  /**
   * Internal acquire logic without coordination
   */
  private async doAcquire(endpoint: string): Promise<void> {
    const now = Date.now();

    // Check if this endpoint is currently rate limited
    const rateLimitedUntil = this.rateLimits.get(endpoint);
    if (rateLimitedUntil && now < rateLimitedUntil) {
      const waitMs = rateLimitedUntil - now;
      const waitSeconds = Math.ceil(waitMs / 1000);
      const expiresAt = new Date(rateLimitedUntil).toISOString();
      debugRateLimit(
        'RATE LIMIT WAIT: endpoint=%s waiting=%dms (%ds remaining until retry-after expires at %s)',
        endpoint,
        waitMs,
        waitSeconds,
        expiresAt,
      );
      await this.sleep(waitMs);
    }

    // Enforce minimum interval between requests
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < this.minInterval) {
      const waitMs = this.minInterval - timeSinceLastRequest;
      debugRateLimit('Enforcing minimum interval, waiting %dms', waitMs);
      await this.sleep(waitMs);
    }

    this.lastRequest = Date.now();
    debugRateLimit('Acquired rate limit token for endpoint %s', endpoint);
  }

  /**
   * Record a rate limit response from the server
   *
   * @param endpoint - The endpoint that was rate limited
   * @param retryAfterSeconds - Seconds to wait before retrying
   */
  recordRateLimit(endpoint: string, retryAfterSeconds: number): void {
    const retryAfter = Date.now() + retryAfterSeconds * 1000;
    this.rateLimits.set(endpoint, retryAfter);

    debugRateLimit(
      'RATE LIMIT RECORDED: endpoint=%s retry-after=%ds (wait=%dms, expires=%s)',
      endpoint,
      retryAfterSeconds,
      retryAfterSeconds * 1000,
      new Date(retryAfter).toISOString(),
    );

    // Clean up expired rate limits periodically
    setTimeout(
      () => {
        this.cleanupExpiredLimits();
      },
      retryAfterSeconds * 1000 + 1000,
    );
  }

  /**
   * Execute a function with automatic retry and rate limiting
   *
   * @param fn - Function to execute
   * @param endpoint - Endpoint identifier for rate limiting
   * @returns Promise resolving to function result
   */
  async executeWithRetry<T>(fn: () => Promise<T>, endpoint = 'default'): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.opts.maxRetries + 1; attempt++) {
      try {
        await this.acquire(endpoint);
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if this is a rate limit error
        if (this.isRateLimitError(error)) {
          const retryAfter = this.extractRetryAfter(error);

          debugRateLimit(
            'Rate limit detected for endpoint %s, retry-after: %d seconds, attempt %d/%d',
            endpoint,
            retryAfter,
            attempt,
            this.opts.maxRetries + 1,
          );

          if (retryAfter > 0) {
            this.recordRateLimit(endpoint, retryAfter);
          }

          // If we've exhausted retries for a rate limit error, throw RateLimitError
          if (attempt > this.opts.maxRetries) {
            debugRateLimit(
              'Max retries exceeded for rate limit on endpoint %s after %d attempts, final retry-after: %d seconds',
              endpoint,
              attempt,
              retryAfter,
            );
            throw new RateLimitError(
              `Rate limit exceeded for ${endpoint} after ${this.opts.maxRetries + 1} attempts`,
              {
                endpoint,
                retryAfter,
                retryDelaySeconds: Math.floor(retryAfter / 1000),
                attempts: attempt,
              },
            );
          }
        } else {
          // For non-rate-limit errors, don't retry - throw immediately
          throw error;
        }

        // Calculate exponential backoff delay
        const delay = Math.min(
          this.opts.baseDelayMs * Math.pow(2, attempt - 1),
          this.opts.maxDelayMs,
        );

        debugRateLimit(
          'RATE LIMIT RETRY: attempt=%d/%d endpoint=%s retry-after=%ds retrying-in=%dms error=%s',
          attempt,
          this.opts.maxRetries + 1,
          endpoint,
          this.extractRetryAfter(error),
          delay,
          (error as Error).message,
        );

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Check if an error indicates rate limiting
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof RateLimitError) {
      return true;
    }

    // Check for HTTP 429 or 503 status codes (both direct and nested in response)
    if (error && typeof error === 'object') {
      const errorObj = error as { status?: number; response?: { status?: number } };
      const status = errorObj.status || errorObj.response?.status;
      if (status === 429 || status === 503) {
        return true;
      }
    }

    // Check for error messages containing rate limit keywords
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message: string }).message;
      if (typeof message === 'string') {
        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Extract retry-after value from error
   */
  private extractRetryAfter(error: unknown): number {
    if (error instanceof RateLimitError) {
      return error.rateLimitInfo.retryDelaySeconds;
    }

    // Try to extract from error object headers (both direct and nested in response)
    if (error && typeof error === 'object') {
      const errorObj = error as {
        retryAfter?: unknown;
        headers?: { 'retry-after'?: string };
        response?: { headers?: { 'retry-after'?: string } };
      };

      // First check for direct retryAfter property
      if ('retryAfter' in errorObj) {
        const retryAfter = errorObj.retryAfter;
        if (typeof retryAfter === 'number') {
          return retryAfter;
        }
        if (typeof retryAfter === 'string') {
          const parsed = parseInt(retryAfter, 10);
          if (!isNaN(parsed)) {
            return parsed;
          }
        }
      }

      // Then check for retry-after header (both direct and nested)
      const headers = errorObj.headers || errorObj.response?.headers;
      if (headers && headers['retry-after']) {
        const retryAfterHeader = headers['retry-after'];
        const parsed = parseInt(retryAfterHeader, 10);
        if (!isNaN(parsed)) {
          return parsed;
        }
      }
    }

    return 0;
  }

  /**
   * Clean up expired rate limit entries
   */
  private cleanupExpiredLimits(): void {
    const now = Date.now();
    const expired: string[] = [];
    for (const [endpoint, retryAfter] of this.rateLimits.entries()) {
      if (now >= retryAfter) {
        this.rateLimits.delete(endpoint);
        expired.push(endpoint);
      }
    }
    if (expired.length > 0) {
      debugRateLimit('RATE LIMIT CLEANUP: expired endpoints=%j', expired);
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit status
   */
  getStatus(): { rateLimitedEndpoints: string[]; nextAvailable: number | null } {
    const now = Date.now();
    const rateLimitedEndpoints: string[] = [];
    let nextAvailable: number | null = null;

    for (const [endpoint, retryAfter] of this.rateLimits.entries()) {
      if (now < retryAfter) {
        rateLimitedEndpoints.push(endpoint);
        if (nextAvailable === null || retryAfter < nextAvailable) {
          nextAvailable = retryAfter;
        }
      }
    }

    return { rateLimitedEndpoints, nextAvailable };
  }

  /**
   * Clear all rate limit state
   */
  clear(): void {
    this.rateLimits.clear();
    this.pendingAcquires.clear();
    debugRateLimit('Cleared all rate limit state');
  }

  /**
   * Get rate limit status for a specific endpoint (legacy compatibility)
   */
  getRateLimitStatus(endpoint: string): { isLimited: boolean; retryAfter?: number } {
    const retryAfter = this.rateLimits.get(endpoint);
    if (retryAfter && Date.now() < retryAfter) {
      return { isLimited: true, retryAfter };
    }
    return { isLimited: false };
  }

  /**
   * Clear rate limit for a specific endpoint (legacy compatibility)
   */
  clearRateLimit(endpoint: string): void {
    this.rateLimits.delete(endpoint);
    debugRateLimit('Cleared rate limit for endpoint %s', endpoint);
  }

  /**
   * Get known ACME endpoints (legacy compatibility)
   */
  static getKnownEndpoints() {
    return {
      NEW_NONCE: '/acme/new-nonce',
      NEW_ACCOUNT: '/acme/new-account',
      NEW_ORDER: '/acme/new-order',
      REVOKE_CERT: '/acme/revoke-cert',
      RENEWAL_INFO: '/acme/renewal-info',
      ACME_GENERAL: '/acme/*',
      DIRECTORY: '/directory',
    } as const;
  }
}
