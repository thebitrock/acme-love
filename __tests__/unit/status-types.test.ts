import { describe, it, expect } from '@jest/globals';
import {
  isValidOrderStatusTransition,
  isValidAuthorizationStatusTransition,
  isValidChallengeStatusTransition,
  isAcmeOrderStatus,
  isAcmeAuthorizationStatus,
  isAcmeChallengeStatus,
  isAcmeChallengeType,
  ORDER_STATUS,
  AUTHORIZATION_STATUS,
  CHALLENGE_STATUS,
} from '../../src/lib/types/status.js';

describe('isValidOrderStatusTransition', () => {
  it('allows pending -> ready', () => {
    expect(isValidOrderStatusTransition(ORDER_STATUS.PENDING, ORDER_STATUS.READY)).toBe(true);
  });

  it('allows pending -> invalid', () => {
    expect(isValidOrderStatusTransition(ORDER_STATUS.PENDING, ORDER_STATUS.INVALID)).toBe(true);
  });

  it('allows ready -> processing', () => {
    expect(isValidOrderStatusTransition(ORDER_STATUS.READY, ORDER_STATUS.PROCESSING)).toBe(true);
  });

  it('allows ready -> invalid', () => {
    expect(isValidOrderStatusTransition(ORDER_STATUS.READY, ORDER_STATUS.INVALID)).toBe(true);
  });

  it('allows processing -> valid', () => {
    expect(isValidOrderStatusTransition(ORDER_STATUS.PROCESSING, ORDER_STATUS.VALID)).toBe(true);
  });

  it('allows processing -> invalid', () => {
    expect(isValidOrderStatusTransition(ORDER_STATUS.PROCESSING, ORDER_STATUS.INVALID)).toBe(true);
  });

  it('rejects transitions from terminal state valid', () => {
    expect(isValidOrderStatusTransition(ORDER_STATUS.VALID, ORDER_STATUS.PENDING)).toBe(false);
    expect(isValidOrderStatusTransition(ORDER_STATUS.VALID, ORDER_STATUS.READY)).toBe(false);
    expect(isValidOrderStatusTransition(ORDER_STATUS.VALID, ORDER_STATUS.PROCESSING)).toBe(false);
    expect(isValidOrderStatusTransition(ORDER_STATUS.VALID, ORDER_STATUS.INVALID)).toBe(false);
  });

  it('rejects transitions from terminal state invalid', () => {
    expect(isValidOrderStatusTransition(ORDER_STATUS.INVALID, ORDER_STATUS.PENDING)).toBe(false);
    expect(isValidOrderStatusTransition(ORDER_STATUS.INVALID, ORDER_STATUS.VALID)).toBe(false);
  });

  it('rejects identity transitions', () => {
    expect(isValidOrderStatusTransition(ORDER_STATUS.PENDING, ORDER_STATUS.PENDING)).toBe(false);
    expect(isValidOrderStatusTransition(ORDER_STATUS.READY, ORDER_STATUS.READY)).toBe(false);
  });

  it('rejects backwards transitions', () => {
    expect(isValidOrderStatusTransition(ORDER_STATUS.READY, ORDER_STATUS.PENDING)).toBe(false);
    expect(isValidOrderStatusTransition(ORDER_STATUS.PROCESSING, ORDER_STATUS.READY)).toBe(false);
  });
});

describe('isValidAuthorizationStatusTransition', () => {
  it('allows pending -> valid', () => {
    expect(
      isValidAuthorizationStatusTransition(
        AUTHORIZATION_STATUS.PENDING,
        AUTHORIZATION_STATUS.VALID,
      ),
    ).toBe(true);
  });

  it('allows pending -> invalid', () => {
    expect(
      isValidAuthorizationStatusTransition(
        AUTHORIZATION_STATUS.PENDING,
        AUTHORIZATION_STATUS.INVALID,
      ),
    ).toBe(true);
  });

  it('allows valid -> expired, deactivated, revoked', () => {
    expect(
      isValidAuthorizationStatusTransition(
        AUTHORIZATION_STATUS.VALID,
        AUTHORIZATION_STATUS.EXPIRED,
      ),
    ).toBe(true);
    expect(
      isValidAuthorizationStatusTransition(
        AUTHORIZATION_STATUS.VALID,
        AUTHORIZATION_STATUS.DEACTIVATED,
      ),
    ).toBe(true);
    expect(
      isValidAuthorizationStatusTransition(
        AUTHORIZATION_STATUS.VALID,
        AUTHORIZATION_STATUS.REVOKED,
      ),
    ).toBe(true);
  });

  it('allows invalid -> expired, deactivated, revoked', () => {
    expect(
      isValidAuthorizationStatusTransition(
        AUTHORIZATION_STATUS.INVALID,
        AUTHORIZATION_STATUS.EXPIRED,
      ),
    ).toBe(true);
    expect(
      isValidAuthorizationStatusTransition(
        AUTHORIZATION_STATUS.INVALID,
        AUTHORIZATION_STATUS.DEACTIVATED,
      ),
    ).toBe(true);
    expect(
      isValidAuthorizationStatusTransition(
        AUTHORIZATION_STATUS.INVALID,
        AUTHORIZATION_STATUS.REVOKED,
      ),
    ).toBe(true);
  });

  it('rejects transitions from terminal states', () => {
    expect(
      isValidAuthorizationStatusTransition(
        AUTHORIZATION_STATUS.DEACTIVATED,
        AUTHORIZATION_STATUS.VALID,
      ),
    ).toBe(false);
    expect(
      isValidAuthorizationStatusTransition(
        AUTHORIZATION_STATUS.EXPIRED,
        AUTHORIZATION_STATUS.VALID,
      ),
    ).toBe(false);
    expect(
      isValidAuthorizationStatusTransition(
        AUTHORIZATION_STATUS.REVOKED,
        AUTHORIZATION_STATUS.VALID,
      ),
    ).toBe(false);
  });

  it('rejects invalid transitions', () => {
    expect(
      isValidAuthorizationStatusTransition(
        AUTHORIZATION_STATUS.PENDING,
        AUTHORIZATION_STATUS.EXPIRED,
      ),
    ).toBe(false);
    expect(
      isValidAuthorizationStatusTransition(
        AUTHORIZATION_STATUS.PENDING,
        AUTHORIZATION_STATUS.DEACTIVATED,
      ),
    ).toBe(false);
  });
});

describe('isValidChallengeStatusTransition', () => {
  it('allows pending -> processing', () => {
    expect(
      isValidChallengeStatusTransition(CHALLENGE_STATUS.PENDING, CHALLENGE_STATUS.PROCESSING),
    ).toBe(true);
  });

  it('allows pending -> invalid', () => {
    expect(
      isValidChallengeStatusTransition(CHALLENGE_STATUS.PENDING, CHALLENGE_STATUS.INVALID),
    ).toBe(true);
  });

  it('allows processing -> valid', () => {
    expect(
      isValidChallengeStatusTransition(CHALLENGE_STATUS.PROCESSING, CHALLENGE_STATUS.VALID),
    ).toBe(true);
  });

  it('allows processing -> invalid', () => {
    expect(
      isValidChallengeStatusTransition(CHALLENGE_STATUS.PROCESSING, CHALLENGE_STATUS.INVALID),
    ).toBe(true);
  });

  it('rejects transitions from terminal state valid', () => {
    expect(isValidChallengeStatusTransition(CHALLENGE_STATUS.VALID, CHALLENGE_STATUS.PENDING)).toBe(
      false,
    );
    expect(
      isValidChallengeStatusTransition(CHALLENGE_STATUS.VALID, CHALLENGE_STATUS.PROCESSING),
    ).toBe(false);
  });

  it('rejects transitions from terminal state invalid', () => {
    expect(
      isValidChallengeStatusTransition(CHALLENGE_STATUS.INVALID, CHALLENGE_STATUS.PENDING),
    ).toBe(false);
    expect(isValidChallengeStatusTransition(CHALLENGE_STATUS.INVALID, CHALLENGE_STATUS.VALID)).toBe(
      false,
    );
  });

  it('rejects identity transitions', () => {
    expect(
      isValidChallengeStatusTransition(CHALLENGE_STATUS.PENDING, CHALLENGE_STATUS.PENDING),
    ).toBe(false);
  });
});

describe('isAcmeOrderStatus', () => {
  it('returns true for valid statuses', () => {
    expect(isAcmeOrderStatus('pending')).toBe(true);
    expect(isAcmeOrderStatus('ready')).toBe(true);
    expect(isAcmeOrderStatus('valid')).toBe(true);
    expect(isAcmeOrderStatus('invalid')).toBe(true);
    expect(isAcmeOrderStatus('processing')).toBe(true);
  });

  it('returns false for invalid statuses', () => {
    expect(isAcmeOrderStatus('bogus')).toBe(false);
    expect(isAcmeOrderStatus('')).toBe(false);
  });
});

describe('isAcmeAuthorizationStatus', () => {
  it('returns true for valid statuses', () => {
    expect(isAcmeAuthorizationStatus('pending')).toBe(true);
    expect(isAcmeAuthorizationStatus('valid')).toBe(true);
    expect(isAcmeAuthorizationStatus('deactivated')).toBe(true);
  });

  it('returns false for invalid statuses', () => {
    expect(isAcmeAuthorizationStatus('unknown')).toBe(false);
  });
});

describe('isAcmeChallengeStatus', () => {
  it('returns true for valid statuses', () => {
    expect(isAcmeChallengeStatus('pending')).toBe(true);
    expect(isAcmeChallengeStatus('processing')).toBe(true);
    expect(isAcmeChallengeStatus('valid')).toBe(true);
  });

  it('returns false for invalid statuses', () => {
    expect(isAcmeChallengeStatus('x')).toBe(false);
  });
});

describe('isAcmeChallengeType', () => {
  it('returns true for valid types', () => {
    expect(isAcmeChallengeType('dns-01')).toBe(true);
    expect(isAcmeChallengeType('http-01')).toBe(true);
    expect(isAcmeChallengeType('tls-alpn-01')).toBe(true);
  });

  it('returns false for invalid types', () => {
    expect(isAcmeChallengeType('x')).toBe(false);
  });
});
