import { describe, it, expect } from '@jest/globals';
// Updated to import from public entrypoint
import {
  createErrorFromProblem,
  BadSignatureAlgorithmError,
  RateLimitedError,
  ServerMaintenanceError,
  UserActionRequiredError,
  AcmeError,
  ACME_ERROR,
} from '../../src/index.js';

describe('createErrorFromProblem', () => {
  it('creates specific error type', () => {
    const err = createErrorFromProblem({
      type: ACME_ERROR.badSignatureAlgorithm,
      detail: 'algo bad',
      status: 400,
      algorithms: ['ES256', 'RS256'],
    });
    expect(err).toBeInstanceOf(BadSignatureAlgorithmError);
    expect((err as BadSignatureAlgorithmError).algorithms).toEqual(['ES256', 'RS256']);
  });

  it('parses rate limited error with retryAfter', () => {
    const now = Date.now();
    const retryIso = new Date(now + 5000).toISOString();
    const err = createErrorFromProblem({
      type: ACME_ERROR.rateLimited,
      detail: 'Too many',
      status: 429,
      retryAfter: retryIso,
    });
    expect(err).toBeInstanceOf(RateLimitedError);
    const rl = err as RateLimitedError;
    expect(rl.getRetryAfterSeconds()).toBeGreaterThanOrEqual(4); // ~5s window
  });

  it('detects server maintenance by status=503', () => {
    const err = createErrorFromProblem({
      type: ACME_ERROR.serverInternal,
      detail: 'service is down for maintenance',
      status: 503,
    });
    expect(err).toBeInstanceOf(ServerMaintenanceError);
    expect(err.toString()).toMatch(/maintenance/i);
  });

  it('attaches subproblems recursively', () => {
    const err = createErrorFromProblem({
      type: ACME_ERROR.compound,
      detail: 'multiple',
      subproblems: [
        { type: ACME_ERROR.badCSR, detail: 'csr bad' },
        { type: ACME_ERROR.unauthorized, detail: 'no auth' },
      ],
    });
    expect(err.subproblems).toHaveLength(2);
    expect(err.subproblems?.map((e) => e.type)).toEqual([
      ACME_ERROR.badCSR,
      ACME_ERROR.unauthorized,
    ]);
  });

  it('falls back to generic AcmeError with unknown type', () => {
    const err = createErrorFromProblem({ type: 'urn:custom:unknown:error', detail: 'x' });
    expect(err).toBeInstanceOf(AcmeError);
    expect(err.type).toBe('urn:custom:unknown:error');
  });

  it('returns AcmeError for null input', () => {
    const err = createErrorFromProblem(null);
    expect(err).toBeInstanceOf(AcmeError);
    expect(err.detail).toBe('Unknown error shape');
  });

  it('returns AcmeError for non-object input', () => {
    const err = createErrorFromProblem(42);
    expect(err).toBeInstanceOf(AcmeError);
    expect(err.detail).toBe('Unknown error shape');
  });

  it('creates UserActionRequiredError with instance', () => {
    const err = createErrorFromProblem({
      type: ACME_ERROR.userActionRequired,
      detail: 'Accept ToS',
      instance: 'https://example.com/tos',
    });
    expect(err).toBeInstanceOf(UserActionRequiredError);
    expect(err.instance).toBe('https://example.com/tos');
  });
});
