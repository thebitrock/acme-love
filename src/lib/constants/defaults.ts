/**
 * Default configuration constants for ACME Love
 *
 * Centralized defaults for nonce management, rate limiting, and order polling.
 * These values are used as fallbacks when no explicit configuration is provided.
 */

// Nonce Manager defaults
export const NONCE_MAX_AGE_MS = 120_000; // 2 minutes
export const NONCE_MAX_POOL_SIZE = 32;
export const NONCE_PREFETCH_LOW_WATER = 5;
export const NONCE_PREFETCH_HIGH_WATER = 10;
export const NONCE_WAITER_TIMEOUT_MS = 30_000; // 30 seconds

// Order polling defaults
export const ORDER_POLL_MAX_ATTEMPTS = 60;
export const ORDER_POLL_INTERVAL_MS = 5_000; // 5 seconds

// Rate limiter defaults
export const RATE_LIMIT_MIN_INTERVAL_MS = 100;
export const RATE_LIMIT_MAX_RETRIES = 3;
export const RATE_LIMIT_BASE_DELAY_MS = 1_000;
export const RATE_LIMIT_MAX_DELAY_MS = 5 * 60 * 1_000; // 5 minutes
