import { describe, it, expect } from '@jest/globals';
import {
  AcmeError,
  AccountDoesNotExistError,
  AlreadyRevokedError,
  BadCSRError,
  BadNonceError,
  BadPublicKeyError,
  BadRevocationReasonError,
  BadSignatureAlgorithmError,
  CAAError,
  CompoundError,
  ConnectionError,
  DNSError,
  ExternalAccountRequiredError,
  IncorrectResponseError,
  InvalidContactError,
  MalformedError,
  OrderNotReadyError,
  RateLimitedError,
  RejectedIdentifierError,
  ServerInternalError,
  ServerMaintenanceError,
  TLSError,
  UnauthorizedError,
  UnsupportedContactError,
  UnsupportedIdentifierError,
  UserActionRequiredError,
} from '../../src/lib/errors/acme-server-errors.js';
import { ACME_ERROR } from '../../src/lib/errors/codes.js';

describe('AcmeError base', () => {
  it('constructs with detail and status', () => {
    const err = new AcmeError('test detail', 418);
    expect(err.detail).toBe('test detail');
    expect(err.status).toBe(418);
    expect(err.message).toBe('test detail');
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults status to 500', () => {
    const err = new AcmeError('test');
    expect(err.status).toBe(500);
  });

  it('toJSON includes type, detail, status', () => {
    const err = new AcmeError('test', 400, { type: 'urn:test', instance: 'https://example.com/1' });
    const json = err.toJSON();
    expect(json.type).toBe('urn:test');
    expect(json.detail).toBe('test');
    expect(json.status).toBe(400);
    expect(json.instance).toBe('https://example.com/1');
  });

  it('toJSON omits instance when not set', () => {
    const err = new AcmeError('test', 400);
    expect(err.toJSON().instance).toBeUndefined();
  });

  it('addSubproblem chains', () => {
    const parent = new AcmeError('parent', 400);
    const child = new AcmeError('child', 400);
    const result = parent.addSubproblem(child);
    expect(result).toBe(parent);
    expect(parent.subproblems).toHaveLength(1);
    expect(parent.subproblems![0].detail).toBe('child');
  });

  it('toJSON includes subproblems', () => {
    const parent = new AcmeError('parent', 400);
    parent.addSubproblem(new AcmeError('child', 400));
    const json = parent.toJSON();
    expect(json.subproblems).toHaveLength(1);
  });
});

describe('specific error classes', () => {
  const errorCases: Array<{
    Class: new (...args: any[]) => AcmeError;
    expectedType: string;
    expectedStatus: number;
    name: string;
  }> = [
    {
      Class: AccountDoesNotExistError,
      expectedType: ACME_ERROR.accountDoesNotExist,
      expectedStatus: 400,
      name: 'AccountDoesNotExistError',
    },
    {
      Class: AlreadyRevokedError,
      expectedType: ACME_ERROR.alreadyRevoked,
      expectedStatus: 400,
      name: 'AlreadyRevokedError',
    },
    {
      Class: BadCSRError,
      expectedType: ACME_ERROR.badCSR,
      expectedStatus: 400,
      name: 'BadCSRError',
    },
    {
      Class: BadNonceError,
      expectedType: ACME_ERROR.badNonce,
      expectedStatus: 400,
      name: 'BadNonceError',
    },
    {
      Class: BadPublicKeyError,
      expectedType: ACME_ERROR.badPublicKey,
      expectedStatus: 400,
      name: 'BadPublicKeyError',
    },
    {
      Class: BadRevocationReasonError,
      expectedType: ACME_ERROR.badRevocationReason,
      expectedStatus: 400,
      name: 'BadRevocationReasonError',
    },
    { Class: CAAError, expectedType: ACME_ERROR.caa, expectedStatus: 400, name: 'CAAError' },
    {
      Class: CompoundError,
      expectedType: ACME_ERROR.compound,
      expectedStatus: 400,
      name: 'CompoundError',
    },
    {
      Class: ConnectionError,
      expectedType: ACME_ERROR.connection,
      expectedStatus: 400,
      name: 'ConnectionError',
    },
    { Class: DNSError, expectedType: ACME_ERROR.dns, expectedStatus: 400, name: 'DNSError' },
    {
      Class: ExternalAccountRequiredError,
      expectedType: ACME_ERROR.externalAccountRequired,
      expectedStatus: 400,
      name: 'ExternalAccountRequiredError',
    },
    {
      Class: IncorrectResponseError,
      expectedType: ACME_ERROR.incorrectResponse,
      expectedStatus: 400,
      name: 'IncorrectResponseError',
    },
    {
      Class: InvalidContactError,
      expectedType: ACME_ERROR.invalidContact,
      expectedStatus: 400,
      name: 'InvalidContactError',
    },
    {
      Class: MalformedError,
      expectedType: ACME_ERROR.malformed,
      expectedStatus: 400,
      name: 'MalformedError',
    },
    {
      Class: OrderNotReadyError,
      expectedType: ACME_ERROR.orderNotReady,
      expectedStatus: 400,
      name: 'OrderNotReadyError',
    },
    {
      Class: RejectedIdentifierError,
      expectedType: ACME_ERROR.rejectedIdentifier,
      expectedStatus: 400,
      name: 'RejectedIdentifierError',
    },
    {
      Class: ServerInternalError,
      expectedType: ACME_ERROR.serverInternal,
      expectedStatus: 500,
      name: 'ServerInternalError',
    },
    { Class: TLSError, expectedType: ACME_ERROR.tls, expectedStatus: 400, name: 'TLSError' },
    {
      Class: UnauthorizedError,
      expectedType: ACME_ERROR.unauthorized,
      expectedStatus: 401,
      name: 'UnauthorizedError',
    },
    {
      Class: UnsupportedContactError,
      expectedType: ACME_ERROR.unsupportedContact,
      expectedStatus: 400,
      name: 'UnsupportedContactError',
    },
    {
      Class: UnsupportedIdentifierError,
      expectedType: ACME_ERROR.unsupportedIdentifier,
      expectedStatus: 400,
      name: 'UnsupportedIdentifierError',
    },
  ];

  it.each(errorCases)(
    '$name has correct type and status',
    ({ Class, expectedType, expectedStatus }) => {
      const err = new Class();
      expect(err.type).toBe(expectedType);
      expect(err.status).toBe(expectedStatus);
      expect(err).toBeInstanceOf(AcmeError);
      expect(err).toBeInstanceOf(Error);
    },
  );
});

describe('BadSignatureAlgorithmError', () => {
  it('stores algorithms list', () => {
    const err = new BadSignatureAlgorithmError('bad algo', 400, ['ES256', 'RS256']);
    expect(err.algorithms).toEqual(['ES256', 'RS256']);
    expect(err.type).toBe(ACME_ERROR.badSignatureAlgorithm);
  });

  it('toJSON includes algorithms', () => {
    const err = new BadSignatureAlgorithmError('bad', 400, ['ES256']);
    const json = err.toJSON();
    expect(json.algorithms).toEqual(['ES256']);
  });

  it('toJSON omits empty algorithms', () => {
    const err = new BadSignatureAlgorithmError('bad', 400, []);
    const json = err.toJSON();
    expect(json.algorithms).toBeUndefined();
  });

  it('defaults algorithms to empty array', () => {
    const err = new BadSignatureAlgorithmError();
    expect(err.algorithms).toEqual([]);
  });
});

describe('RateLimitedError', () => {
  it('stores retryAfter date', () => {
    const future = new Date(Date.now() + 60_000);
    const err = new RateLimitedError('rate limited', 429, future);
    expect(err.retryAfter).toBe(future);
    expect(err.status).toBe(429);
  });

  it('getRetryAfterSeconds returns seconds until retryAfter', () => {
    const future = new Date(Date.now() + 30_000);
    const err = new RateLimitedError('rate limited', 429, future);
    const seconds = err.getRetryAfterSeconds();
    expect(seconds).toBeGreaterThan(25);
    expect(seconds).toBeLessThanOrEqual(31);
  });

  it('getRetryAfterSeconds returns 0 for past date', () => {
    const past = new Date(Date.now() - 60_000);
    const err = new RateLimitedError('rate limited', 429, past);
    expect(err.getRetryAfterSeconds()).toBe(0);
  });

  it('getRetryAfterSeconds returns undefined when no retryAfter', () => {
    const err = new RateLimitedError();
    expect(err.getRetryAfterSeconds()).toBeUndefined();
  });

  it('toJSON includes retryAfter as ISO string', () => {
    const date = new Date('2025-01-01T00:00:00Z');
    const err = new RateLimitedError('limited', 429, date);
    const json = err.toJSON();
    expect(json.retryAfter).toBe('2025-01-01T00:00:00.000Z');
  });
});

describe('CompoundError', () => {
  it('toString lists subproblems', () => {
    const err = new CompoundError('multiple errors');
    err.addSubproblem(new BadNonceError('nonce1'));
    err.addSubproblem(new DNSError('dns fail'));
    const str = err.toString();
    expect(str).toContain('multiple errors');
    expect(str).toContain('nonce1');
    expect(str).toContain('dns fail');
  });

  it('toString without subproblems', () => {
    const err = new CompoundError('no subs');
    expect(err.toString()).toBe('CompoundError: no subs');
  });
});

describe('ServerMaintenanceError', () => {
  it('sets isMaintenanceError flag', () => {
    const err = new ServerMaintenanceError();
    expect(err.isMaintenanceError).toBe(true);
    expect(err.status).toBe(503);
  });

  it('toString includes maintenance info', () => {
    const err = new ServerMaintenanceError('maintenance mode');
    const str = err.toString();
    expect(str).toContain('maintenance');
    expect(str).toContain('letsencrypt.status.io');
  });
});

describe('UserActionRequiredError', () => {
  it('stores instance URL', () => {
    const err = new UserActionRequiredError('action needed', 403, 'https://example.com/tos');
    expect(err.instance).toBe('https://example.com/tos');
    expect(err.status).toBe(403);
  });

  it('works without instance', () => {
    const err = new UserActionRequiredError();
    expect(err.instance).toBeUndefined();
  });
});
