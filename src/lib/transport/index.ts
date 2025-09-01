/**
 * RFC 8555 Compliant Transport Layer
 *
 * High-performance HTTP transport layer for ACME protocol communication.
 * Features:
 * - Undici-based HTTP client for maximum performance
 * - Intelligent retry mechanisms with exponential backoff
 * - Comprehensive middleware system for extensibility
 * - ACME-specific optimizations and headers
 * - Rate limiting and debugging support
 */

// Core HTTP client
export { AcmeHttpClient, type ParsedResponseData } from './http-client.js';

// Retry mechanisms
export {
  withRetry,
  isRetryableError,
  getRetryAfterMs,
  calculateRetryDelay,
  sleep,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from './retry.js';

// Middleware system
export {
  MiddlewarePipeline,
  createDefaultPipeline,
  timingMiddleware,
  loggingMiddleware,
  statusValidationMiddleware,
  userAgentMiddleware,
  rateLimitMiddleware,
  acmeMiddleware,
  type Middleware,
  type RequestContext,
  type ResponseContext,
} from './middleware.js';
