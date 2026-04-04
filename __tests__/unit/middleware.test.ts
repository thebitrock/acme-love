import { describe, it, expect } from '@jest/globals';
import {
  MiddlewarePipeline,
  timingMiddleware,
  loggingMiddleware,
  statusValidationMiddleware,
  userAgentMiddleware,
  rateLimitMiddleware,
  acmeMiddleware,
  createDefaultPipeline,
  type RequestContext,
} from '../../src/lib/transport/middleware.js';

function makeContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    url: 'https://acme.test/dir',
    method: 'GET',
    headers: {},
    attempt: 0,
    startTime: Date.now(),
    ...overrides,
  };
}

function makeResponse(statusCode = 200, headers: Record<string, string> = {}) {
  return {
    statusCode,
    headers,
    body: { ok: true },
    trailers: {},
    opaque: null,
    context: {},
  } as any;
}

describe('MiddlewarePipeline', () => {
  it('executes final handler when no middleware', async () => {
    const pipeline = new MiddlewarePipeline();
    const ctx = makeContext();
    const response = makeResponse();
    const result = await pipeline.execute(ctx, async () => response);
    expect(result).toBe(response);
  });

  it('executes middleware in order', async () => {
    const order: number[] = [];
    const pipeline = new MiddlewarePipeline();
    pipeline
      .use(async (_ctx, next) => {
        order.push(1);
        const res = await next();
        order.push(4);
        return res;
      })
      .use(async (_ctx, next) => {
        order.push(2);
        const res = await next();
        order.push(3);
        return res;
      });

    await pipeline.execute(makeContext(), async () => makeResponse());
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('length returns middleware count', () => {
    const pipeline = new MiddlewarePipeline();
    expect(pipeline.length).toBe(0);
    pipeline.use(async (_ctx, next) => next());
    expect(pipeline.length).toBe(1);
  });

  it('clear removes all middleware', () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async (_ctx, next) => next());
    pipeline.clear();
    expect(pipeline.length).toBe(0);
  });

  it('use returns this for chaining', () => {
    const pipeline = new MiddlewarePipeline();
    const result = pipeline.use(async (_ctx, next) => next());
    expect(result).toBe(pipeline);
  });
});

describe('timingMiddleware', () => {
  it('passes through response on success', async () => {
    const mw = timingMiddleware();
    const ctx = makeContext();
    const response = makeResponse();
    const result = await mw(ctx, async () => response);
    expect(result).toBe(response);
  });

  it('re-throws error from next', async () => {
    const mw = timingMiddleware();
    const ctx = makeContext();
    await expect(
      mw(ctx, async () => {
        throw new Error('downstream error');
      }),
    ).rejects.toThrow('downstream error');
  });
});

describe('loggingMiddleware', () => {
  it('passes through response', async () => {
    const mw = loggingMiddleware();
    const ctx = makeContext();
    const response = makeResponse();
    const result = await mw(ctx, async () => response);
    expect(result).toBe(response);
  });

  it('verbose mode passes through', async () => {
    const mw = loggingMiddleware(true);
    const ctx = makeContext({ body: { test: true } });
    const response = makeResponse();
    const result = await mw(ctx, async () => response);
    expect(result).toBe(response);
  });

  it('re-throws errors', async () => {
    const mw = loggingMiddleware();
    await expect(
      mw(makeContext(), async () => {
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
  });
});

describe('statusValidationMiddleware', () => {
  it('allows 200 by default', async () => {
    const mw = statusValidationMiddleware();
    const result = await mw(makeContext(), async () => makeResponse(200));
    expect(result.statusCode).toBe(200);
  });

  it('allows 201, 202, 204 by default', async () => {
    const mw = statusValidationMiddleware();
    for (const code of [201, 202, 204]) {
      const result = await mw(makeContext(), async () => makeResponse(code));
      expect(result.statusCode).toBe(code);
    }
  });

  it('throws on 500 by default', async () => {
    const mw = statusValidationMiddleware();
    await expect(mw(makeContext(), async () => makeResponse(500))).rejects.toThrow('HTTP 500');
  });

  it('error includes statusCode and response', async () => {
    const mw = statusValidationMiddleware();
    try {
      await mw(makeContext(), async () => makeResponse(403));
      throw new Error('should have thrown');
    } catch (err: any) {
      expect(err.statusCode).toBe(403);
      expect(err.response).toBeDefined();
    }
  });

  it('respects custom valid codes', async () => {
    const mw = statusValidationMiddleware([200, 400]);
    const result = await mw(makeContext(), async () => makeResponse(400));
    expect(result.statusCode).toBe(400);
  });
});

describe('userAgentMiddleware', () => {
  it('adds User-Agent when missing', async () => {
    const mw = userAgentMiddleware('test-agent/1.0');
    const ctx = makeContext();
    await mw(ctx, async () => makeResponse());
    expect(ctx.headers['User-Agent']).toBe('test-agent/1.0');
  });

  it('preserves existing User-Agent', async () => {
    const mw = userAgentMiddleware('test-agent/1.0');
    const ctx = makeContext({ headers: { 'User-Agent': 'existing/2.0' } });
    await mw(ctx, async () => makeResponse());
    expect(ctx.headers['User-Agent']).toBe('existing/2.0');
  });

  it('case-insensitive header check', async () => {
    const mw = userAgentMiddleware('test-agent/1.0');
    const ctx = makeContext({ headers: { 'user-agent': 'existing' } });
    await mw(ctx, async () => makeResponse());
    expect(ctx.headers['user-agent']).toBe('existing');
  });
});

describe('rateLimitMiddleware', () => {
  it('passes through normal response', async () => {
    const mw = rateLimitMiddleware();
    const result = await mw(makeContext(), async () => makeResponse(200));
    expect(result.statusCode).toBe(200);
  });

  it('passes through rate-limited response (tracks headers)', async () => {
    const mw = rateLimitMiddleware();
    const response = makeResponse(200, {
      'x-ratelimit-limit': '100',
      'x-ratelimit-remaining': '5',
      'retry-after': '60',
    });
    const result = await mw(makeContext(), async () => response);
    expect(result.statusCode).toBe(200);
  });
});

describe('acmeMiddleware', () => {
  it('adds content-type for POST with body', async () => {
    const mw = acmeMiddleware();
    const ctx = makeContext({ method: 'POST', body: { test: true } });
    await mw(ctx, async () => makeResponse());
    expect(ctx.headers['content-type']).toBe('application/jose+json');
  });

  it('does not override existing content-type', async () => {
    const mw = acmeMiddleware();
    const ctx = makeContext({
      method: 'POST',
      body: { test: true },
      headers: { 'content-type': 'text/plain' },
    });
    await mw(ctx, async () => makeResponse());
    expect(ctx.headers['content-type']).toBe('text/plain');
  });

  it('adds accept header', async () => {
    const mw = acmeMiddleware();
    const ctx = makeContext();
    await mw(ctx, async () => makeResponse());
    expect(ctx.headers['accept']).toContain('application/json');
  });

  it('does not add content-type for GET', async () => {
    const mw = acmeMiddleware();
    const ctx = makeContext({ method: 'GET' });
    await mw(ctx, async () => makeResponse());
    expect(ctx.headers['content-type']).toBeUndefined();
  });
});

describe('createDefaultPipeline', () => {
  it('creates pipeline with standard middlewares', () => {
    const pipeline = createDefaultPipeline();
    expect(pipeline.length).toBeGreaterThanOrEqual(4);
  });

  it('creates pipeline with user agent', () => {
    const pipeline = createDefaultPipeline('test/1.0');
    expect(pipeline.length).toBeGreaterThanOrEqual(5);
  });

  it('pipeline executes end to end', async () => {
    const pipeline = createDefaultPipeline('test/1.0');
    const ctx = makeContext();
    const result = await pipeline.execute(ctx, async () => makeResponse(200));
    expect(result.statusCode).toBe(200);
    expect(ctx.headers['User-Agent']).toBe('test/1.0');
  });
});
