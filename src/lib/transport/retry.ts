import { debugHttp } from '../utils/debug.js';

/**
 * Retry configuration for HTTP requests
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs: number;
  /** Backoff multiplier (default: 2) */
  backoffFactor: number;
  /** Jitter percentage 0-1 (default: 0.1) */
  jitterPercent: number;
  /** Respect Retry-After header (default: true) */
  respectRetryAfter: boolean;
}

/**
 * Default retry configuration optimized for ACME protocol
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  backoffFactor: 2,
  jitterPercent: 0.1,
  respectRetryAfter: true,
};

/**
 * HTTP errors that should trigger a retry
 */
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * Network errors that should trigger a retry
 */
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  // Network/connection errors
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    if (RETRYABLE_ERROR_CODES.has(code)) {
      return true;
    }
  }

  // HTTP status code errors
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode: number }).statusCode;
    if (RETRYABLE_STATUS_CODES.has(statusCode)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract Retry-After header value in milliseconds
 */
export function getRetryAfterMs(headers: Record<string, string | string[]>): number | null {
  const retryAfter = headers['retry-after'];
  if (!retryAfter) return null;

  const value = Array.isArray(retryAfter) ? retryAfter[0] : retryAfter;
  if (!value) return null;

  // Try parsing as seconds
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return null;
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig,
  retryAfterMs?: number | null,
): number {
  // Respect Retry-After header if available and configured
  if (config.respectRetryAfter && retryAfterMs !== null && retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, config.maxDelayMs);
  }

  // Calculate exponential backoff
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffFactor, attempt);

  // Add jitter to avoid thundering herd
  const jitter = exponentialDelay * config.jitterPercent * (Math.random() * 2 - 1);
  const delayWithJitter = exponentialDelay + jitter;

  // Clamp to max delay
  return Math.min(Math.max(delayWithJitter, 0), config.maxDelayMs);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for async functions
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context?: string,
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      const result = await operation();

      if (attempt > 0) {
        debugHttp(
          'Retry %s succeeded on attempt %d/%d',
          context || 'operation',
          attempt + 1,
          finalConfig.maxRetries + 1,
        );
      }

      return result;
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt === finalConfig.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error)) {
        debugHttp(
          'Retry %s: non-retryable error on attempt %d: %s',
          context || 'operation',
          attempt + 1,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }

      // Extract Retry-After header if available
      let retryAfterMs: number | null = null;
      if (error && typeof error === 'object' && 'headers' in error) {
        const headers = (error as { headers: Record<string, string | string[]> }).headers;
        retryAfterMs = getRetryAfterMs(headers);
      }

      // Calculate delay
      const delayMs = calculateRetryDelay(attempt, finalConfig, retryAfterMs);

      debugHttp(
        'Retry %s: attempt %d/%d failed, retrying in %dms. Error: %s',
        context || 'operation',
        attempt + 1,
        finalConfig.maxRetries + 1,
        delayMs,
        error instanceof Error ? error.message : String(error),
      );

      // Wait before retry
      await sleep(delayMs);
    }
  }

  // All retries exhausted
  debugHttp('Retry %s: all %d attempts failed', context || 'operation', finalConfig.maxRetries + 1);

  throw lastError;
}
