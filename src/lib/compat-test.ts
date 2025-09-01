/**
 * Test compatibility layer for legacy API methods
 *
 * This module provides compatibility wrappers for tests that still use the old API.
 * It should only be used by tests during the migration period.
 */

import { NonceManager as NewNonceManager } from './managers/nonce-manager.js';
import { RateLimiter as NewRateLimiter } from './managers/rate-limiter.js';

/**
 * Legacy-compatible NonceManager wrapper
 */
export class NonceManagerCompat {
  private nonce: NewNonceManager;

  constructor(nonce: NewNonceManager) {
    this.nonce = nonce;
  }

  /**
   * Legacy take() method - maps to new get() method
   */
  async take(namespace: string): Promise<string> {
    return this.nonce.get(namespace);
  }

  /**
   * Legacy withNonceRetry method - simplified implementation for tests
   */
  async withNonceRetry<T>(namespace: string, fn: (nonce: string) => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    // Try up to 2 times for badNonce retry
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const nonce = await this.nonce.get(namespace);
        return await fn(nonce);
      } catch (error: unknown) {
        lastError = error as Error;

        // Only retry on badNonce errors
        const errorObj = error as Record<string, unknown>;
        if (
          errorObj?.type === 'urn:ietf:params:acme:error:badNonce' ||
          (typeof errorObj?.message === 'string' && errorObj.message.includes('badNonce'))
        ) {
          continue;
        }

        // Don't retry other errors
        throw error;
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error('Unexpected end of retry loop');
  }

  /**
   * Get pool size for compatibility
   */
  getPoolSize(namespace: string): number {
    return this.nonce.getStats(namespace).poolSize;
  }

  /**
   * Legacy static method - creates namespace string
   */
  static makeNamespace(namespace: string): string {
    return namespace;
  }
}

/**
 * Legacy-compatible RateLimiter wrapper
 */
export class RateLimiterCompat {
  private rateLimiter: NewRateLimiter;

  constructor(rateLimiter: NewRateLimiter) {
    this.rateLimiter = rateLimiter;
  }

  /**
   * Legacy executeWithRateLimit method
   */
  async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    await this.rateLimiter.acquire();
    return fn();
  }

  /**
   * Legacy getKnownEndpoints method - returns mock data for tests
   */
  static getKnownEndpoints(): Record<string, string> {
    return {
      'new-account': '/acme/new-account',
      'new-order': '/acme/new-order',
      'new-authz': '/acme/new-authz',
      'new-cert': '/acme/new-cert',
      'revoke-cert': '/acme/revoke-cert',
    };
  }
}

/**
 * Create a legacy-compatible NonceManager from modern components
 */
export function createCompatNonceManager(nonce: NewNonceManager): NonceManagerCompat {
  return new NonceManagerCompat(nonce);
}

/**
 * Create a legacy-compatible RateLimiter from modern components
 */
export function createCompatRateLimiter(rateLimiter: NewRateLimiter): RateLimiterCompat {
  return new RateLimiterCompat(rateLimiter);
}

// Re-export for convenience
export { NonceManagerCompat as NonceManager };
export { RateLimiterCompat as RateLimiter };
