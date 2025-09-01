import { debugHttp } from '../utils/debug.js';
import type { ParsedResponseData } from './http-client.js';

/**
 * HTTP request context for middleware
 */
export interface RequestContext {
  url: string;
  method: 'GET' | 'POST' | 'HEAD';
  headers: Record<string, string>;
  body?: unknown;
  attempt: number;
  startTime: number;
}

/**
 * HTTP response context for middleware
 */
export interface ResponseContext extends RequestContext {
  response?: ParsedResponseData;
  error?: unknown;
  endTime: number;
  duration: number;
}

/**
 * Middleware function type
 */
export type Middleware = (
  context: RequestContext,
  next: () => Promise<ParsedResponseData>,
) => Promise<ParsedResponseData>;

/**
 * Middleware that adds timing information
 */
export function timingMiddleware(): Middleware {
  return async (context, next) => {
    const start = Date.now();
    try {
      const response = await next();
      const duration = Date.now() - start;

      debugHttp(
        '%s %s completed in %dms (status: %d)',
        context.method,
        context.url,
        duration,
        response.statusCode,
      );

      return response;
    } catch (error) {
      const duration = Date.now() - start;

      debugHttp(
        '%s %s failed after %dms: %s',
        context.method,
        context.url,
        duration,
        error instanceof Error ? error.message : String(error),
      );

      throw error;
    }
  };
}

/**
 * Middleware that adds request/response logging
 */
export function loggingMiddleware(verbose = false): Middleware {
  return async (context, next) => {
    debugHttp(
      '→ %s %s headers=%j%s',
      context.method,
      context.url,
      context.headers,
      context.body && verbose ? ` body=${JSON.stringify(context.body)}` : '',
    );

    try {
      const response = await next();

      debugHttp(
        '← %s %s status=%d headers=%j%s',
        context.method,
        context.url,
        response.statusCode,
        response.headers,
        verbose && response.body ? ` body=${JSON.stringify(response.body)}` : '',
      );

      return response;
    } catch (error) {
      debugHttp(
        '← %s %s error: %s',
        context.method,
        context.url,
        error instanceof Error ? error.message : String(error),
      );

      throw error;
    }
  };
}

/**
 * Middleware that validates response status codes
 */
export function statusValidationMiddleware(validCodes: number[] = []): Middleware {
  const defaultValidCodes = [200, 201, 202, 204];
  const allValidCodes = validCodes.length > 0 ? validCodes : defaultValidCodes;

  return async (context, next) => {
    const response = await next();

    if (!allValidCodes.includes(response.statusCode)) {
      const error = new Error(
        `HTTP ${response.statusCode}: ${context.method} ${context.url}`,
      ) as Error & { statusCode: number; response: ParsedResponseData };

      error.statusCode = response.statusCode;
      error.response = response;

      throw error;
    }

    return response;
  };
}

/**
 * Middleware that adds User-Agent header if missing
 */
export function userAgentMiddleware(userAgent: string): Middleware {
  return async (context, next) => {
    const hasUA = Object.keys(context.headers).some((k) => k.toLowerCase() === 'user-agent');

    if (!hasUA) {
      context.headers['User-Agent'] = userAgent;
    }

    return next();
  };
}

/**
 * Middleware that adds rate limiting headers tracking
 */
export function rateLimitMiddleware(): Middleware {
  return async (context, next) => {
    const response = await next();

    // Track rate limiting headers
    const rateLimitHeaders = {
      limit: response.headers['x-ratelimit-limit'],
      remaining: response.headers['x-ratelimit-remaining'],
      reset: response.headers['x-ratelimit-reset'],
      retryAfter: response.headers['retry-after'],
    };

    // Filter out undefined values
    const activeHeaders = Object.fromEntries(
      Object.entries(rateLimitHeaders).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(activeHeaders).length > 0) {
      debugHttp('Rate limit headers for %s %s: %j', context.method, context.url, activeHeaders);
    }

    return response;
  };
}

/**
 * Middleware that adds ACME-specific headers
 */
export function acmeMiddleware(): Middleware {
  return async (context, next) => {
    // Add ACME-specific content type for POST requests with JSON bodies
    if (context.method === 'POST' && context.body && !context.headers['content-type']) {
      context.headers['content-type'] = 'application/jose+json';
    }

    // Add Accept header for ACME responses
    if (!context.headers['accept']) {
      context.headers['accept'] = 'application/json, application/problem+json';
    }

    return next();
  };
}

/**
 * Middleware pipeline executor
 */
export class MiddlewarePipeline {
  private middlewares: Middleware[] = [];

  /**
   * Add middleware to the pipeline
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Execute the middleware pipeline
   */
  async execute(
    context: RequestContext,
    finalHandler: () => Promise<ParsedResponseData>,
  ): Promise<ParsedResponseData> {
    let index = 0;

    const next = (): Promise<ParsedResponseData> => {
      if (index >= this.middlewares.length) {
        return finalHandler();
      }

      const middleware = this.middlewares[index++];
      return middleware(context, next);
    };

    return next();
  }

  /**
   * Get the number of middlewares in the pipeline
   */
  get length(): number {
    return this.middlewares.length;
  }

  /**
   * Clear all middlewares
   */
  clear(): this {
    this.middlewares = [];
    return this;
  }
}

/**
 * Create a default middleware pipeline for ACME HTTP client
 */
export function createDefaultPipeline(userAgent?: string): MiddlewarePipeline {
  const pipeline = new MiddlewarePipeline();

  // Add standard middlewares in order
  if (userAgent) {
    pipeline.use(userAgentMiddleware(userAgent));
  }

  pipeline
    .use(acmeMiddleware())
    .use(timingMiddleware())
    .use(loggingMiddleware())
    .use(rateLimitMiddleware())
    .use(statusValidationMiddleware([200, 201, 202, 204, 400, 401, 403, 404, 409, 429])); // Include ACME error codes

  return pipeline;
}
