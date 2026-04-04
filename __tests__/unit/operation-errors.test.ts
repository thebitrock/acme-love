import { describe, it, expect } from '@jest/globals';
import {
  AuthorizationError,
  ChallengeError,
  OrderError,
  AccountError,
  AcmeOperationError,
  isAuthorizationError,
  isChallengeError,
  isOrderError,
  isAccountError,
  isAcmeOperationError,
} from '../../src/lib/errors/acme-operation-errors.js';

describe('AuthorizationError', () => {
  it('invalid() creates error with domain and reason', () => {
    const err = AuthorizationError.invalid('example.com', 'DNS failed');
    expect(err).toBeInstanceOf(AuthorizationError);
    expect(err).toBeInstanceOf(AcmeOperationError);
    expect(err.message).toContain('example.com');
    expect(err.message).toContain('DNS failed');
    expect(err.code).toBe('AUTHORIZATION_ERROR');
    expect(err.type).toBe('authorization');
    expect(err.context).toEqual({ domain: 'example.com', status: 'invalid', reason: 'DNS failed' });
  });

  it('invalid() without reason', () => {
    const err = AuthorizationError.invalid('example.com');
    expect(err.message).toContain('example.com');
    expect(err.message).toContain('invalid');
  });

  it('deactivated()', () => {
    const err = AuthorizationError.deactivated('test.com');
    expect(err.message).toContain('deactivated');
    expect(err.context?.status).toBe('deactivated');
  });

  it('expired()', () => {
    const err = AuthorizationError.expired('test.com');
    expect(err.message).toContain('expired');
  });

  it('revoked()', () => {
    const err = AuthorizationError.revoked('test.com');
    expect(err.message).toContain('revoked');
  });
});

describe('ChallengeError', () => {
  it('notFound()', () => {
    const err = ChallengeError.notFound('dns-01', 'example.com');
    expect(err.code).toBe('CHALLENGE_ERROR');
    expect(err.type).toBe('challenge');
    expect(err.message).toContain('dns-01');
    expect(err.message).toContain('example.com');
  });

  it('invalid()', () => {
    const err = ChallengeError.invalid('http-01', 'example.com', 'timeout');
    expect(err.message).toContain('timeout');
    expect(err.context?.challengeType).toBe('http-01');
  });

  it('invalidWithoutDetail()', () => {
    const err = ChallengeError.invalidWithoutDetail('dns-01');
    expect(err.message).toContain('without error detail');
  });
});

describe('OrderError', () => {
  it('noFinalizeUrl()', () => {
    const err = OrderError.noFinalizeUrl();
    expect(err.code).toBe('ORDER_ERROR');
    expect(err.message).toContain('finalize');
  });

  it('noCertificateUrl()', () => {
    const err = OrderError.noCertificateUrl();
    expect(err.message).toContain('certificate');
  });

  it('timeout()', () => {
    const err = OrderError.timeout(['ready', 'valid'], 'pending', 10);
    expect(err.message).toContain('ready');
    expect(err.message).toContain('pending');
    expect(err.message).toContain('10');
    expect(err.context).toEqual({
      targetStatuses: ['ready', 'valid'],
      currentStatus: 'pending',
      attempts: 10,
    });
  });
});

describe('AccountError', () => {
  it('notRegistered()', () => {
    const err = AccountError.notRegistered();
    expect(err.code).toBe('ACCOUNT_ERROR');
    expect(err.message).toContain('register');
  });

  it('noAccountUrl()', () => {
    const err = AccountError.noAccountUrl();
    expect(err.message).toContain('account URL');
  });
});

describe('type guards', () => {
  it('isAuthorizationError', () => {
    expect(isAuthorizationError(AuthorizationError.invalid('x'))).toBe(true);
    expect(isAuthorizationError(new Error('x'))).toBe(false);
    expect(isAuthorizationError(null)).toBe(false);
  });

  it('isChallengeError', () => {
    expect(isChallengeError(ChallengeError.notFound('dns-01', 'x'))).toBe(true);
    expect(isChallengeError(new Error('x'))).toBe(false);
  });

  it('isOrderError', () => {
    expect(isOrderError(OrderError.noFinalizeUrl())).toBe(true);
    expect(isOrderError(new Error('x'))).toBe(false);
  });

  it('isAccountError', () => {
    expect(isAccountError(AccountError.notRegistered())).toBe(true);
    expect(isAccountError(new Error('x'))).toBe(false);
  });

  it('isAcmeOperationError matches all subtypes', () => {
    expect(isAcmeOperationError(AuthorizationError.invalid('x'))).toBe(true);
    expect(isAcmeOperationError(ChallengeError.notFound('dns-01', 'x'))).toBe(true);
    expect(isAcmeOperationError(OrderError.noFinalizeUrl())).toBe(true);
    expect(isAcmeOperationError(AccountError.notRegistered())).toBe(true);
    expect(isAcmeOperationError(new Error('x'))).toBe(false);
  });
});

describe('error name and stack', () => {
  it('has correct constructor name', () => {
    const err = AuthorizationError.invalid('x');
    expect(err.name).toBe('AuthorizationError');
  });

  it('has stack trace', () => {
    const err = ChallengeError.notFound('dns-01', 'x');
    expect(err.stack).toBeDefined();
  });
});
