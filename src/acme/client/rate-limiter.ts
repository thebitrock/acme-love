import { debugRateLimit } from '../debug.js';

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

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly rateLimitInfo: RateLimitInfo,
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
    this.baseDelayMs = options.baseDelayMs ?? 1_000;
    this.maxDelayMs = options.maxDelayMs ?? 300_000; // 5 minutes
    this.respectRetryAfter = options.respectRetryAfter ?? true;
  }

  async executeWithRateLimit<T>(fn: () => Promise<T>, endpoint: string): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        // Honor active rate-limit window if any
        const until = this.rateLimitWindows.get(endpoint);
        if (until && Date.now() < until) {
          const waitMs = until - Date.now();
          debugRateLimit('Rate limit active for %s, waiting %dms', endpoint, waitMs);
          await this.delay(waitMs);
        }

        const result = await fn();
        this.rateLimitWindows.delete(endpoint);

        if (attempt > 1) {
          debugRateLimit('Retry succeeded for %s on attempt %d', endpoint, attempt);
        }
        return result;
      } catch (error: any) {
        lastError = error;

        const info = this.parseRateLimitError(error, endpoint, attempt);
        if (info) {
          debugRateLimit(
            'Rate limit detected: %s, retryAfter=%d (%ds), attempt=%d/%d',
            endpoint,
            info.retryAfter,
            info.retryDelaySeconds,
            attempt,
            this.maxRetries + 1,
          );
          this.rateLimitWindows.set(endpoint, info.retryAfter);

          if (attempt <= this.maxRetries) {
            const delayMs = this.calculateRetryDelay(info, attempt);
            debugRateLimit(
              'Waiting %dms before retry on %s (attempt %d/%d)',
              delayMs,
              endpoint,
              attempt,
              this.maxRetries + 1,
            );
            await this.delay(delayMs);
            continue;
          } else {
            throw new RateLimitError(
              `Rate limit exceeded for ${endpoint} after ${this.maxRetries + 1} attempts`,
              info,
            );
          }
        }

        // Not a rate-limit case — rethrow immediately
        throw error;
      }
    }

    throw lastError || new Error('Unexpected error in rate limiter');
  }

  /** Detect 503/429 (with case-insensitive Retry-After) or common "too many" messages. */
  private parseRateLimitError(error: any, endpoint: string, attempt: number): RateLimitInfo | null {
    const status = error?.response?.status ?? error?.status;
    // headers might be a plain object; try both lower and capitalized
    const headers: Record<string, string | string[] | undefined> =
      error?.response?.headers ?? error?.headers ?? {};

    const isLimitedHttp =
      status === 503 ||
      status === 429 ||
      (typeof error?.message === 'string' && /HTTP (?:503|429)/i.test(error.message));

    if (isLimitedHttp) {
      const retryAfterHeader =
        (headers['retry-after'] as string | undefined) ??
        (headers['Retry-After'] as string | undefined);

      if (retryAfterHeader) {
        // Retry-After seconds are most common in LE; HTTP-date support could be added if needed
        const secs = parseInt(retryAfterHeader, 10);
        if (!isNaN(secs)) {
          return {
            endpoint,
            retryAfter: Date.now() + secs * 1000,
            retryDelaySeconds: secs,
            attempts: attempt,
          };
        }
      }

      // No header or unparsable — exponential backoff
      const backoff = this.calculateExponentialDelay(attempt);
      return {
        endpoint,
        retryAfter: Date.now() + backoff,
        retryDelaySeconds: Math.ceil(backoff / 1000),
        attempts: attempt,
      };
    }

    if (typeof error?.message === 'string') {
      const m = error.message.toLowerCase();
      if (m.includes('rate limit') || m.includes('too many')) {
        const backoff = this.calculateExponentialDelay(attempt);
        return {
          endpoint,
          retryAfter: Date.now() + backoff,
          retryDelaySeconds: Math.ceil(backoff / 1000),
          attempts: attempt,
        };
      }
    }

    return null;
  }

  private calculateRetryDelay(info: RateLimitInfo, attempt: number): number {
    if (this.respectRetryAfter && info.retryDelaySeconds > 0) {
      return Math.min(info.retryDelaySeconds * 1000, this.maxDelayMs);
    }
    return this.calculateExponentialDelay(attempt);
  }

  private calculateExponentialDelay(attempt: number): number {
    const delay = this.baseDelayMs * Math.pow(2, attempt - 1);
    return Math.min(delay, this.maxDelayMs);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  getRateLimitStatus(endpoint: string): { isLimited: boolean; retryAfter?: number } {
    const retryAfter = this.rateLimitWindows.get(endpoint);
    if (retryAfter && Date.now() < retryAfter) {
      return { isLimited: true, retryAfter };
    }
    return { isLimited: false };
  }

  clearRateLimit(endpoint: string): void {
    this.rateLimitWindows.delete(endpoint);
  }

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
