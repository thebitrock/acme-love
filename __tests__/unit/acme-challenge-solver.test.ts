import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AcmeChallengeSolver } from '../../src/lib/core/acme-challenge-solver.js';
import type { AcmeRequestSigner } from '../../src/lib/core/acme-request-signer.js';
import type { AcmeOrderManager } from '../../src/lib/core/acme-order-manager.js';
import type { AcmeOrder, AcmeAuthorization, AcmeChallenge } from '../../src/lib/types/order.js';
import { AuthorizationError, ChallengeError } from '../../src/lib/errors/acme-operation-errors.js';

function makeMockSigner(): AcmeRequestSigner {
  return {
    signedPost: jest.fn().mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: {},
    }),
    keyAuthorization: jest.fn().mockResolvedValue('token.thumbprint'),
  } as unknown as AcmeRequestSigner;
}

function makeMockOrderManager(): AcmeOrderManager {
  return {
    waitOrder: jest.fn().mockImplementation(async (order: AcmeOrder) => ({
      ...order,
      status: 'ready',
    })),
  } as unknown as AcmeOrderManager;
}

function makePendingAuthz(
  domain: string,
  challengeType: string,
  challengeStatus = 'pending',
): AcmeAuthorization {
  return {
    identifier: { type: 'dns', value: domain },
    status: 'pending',
    challenges: [
      {
        type: challengeType,
        status: challengeStatus,
        url: `https://acme.test/chall/${domain}`,
        token: 'evaGxfADs6pSRb2LAv9IZf17Dt3juxGJ-PCt92wr-oA',
      } as AcmeChallenge,
    ],
  } as AcmeAuthorization;
}

function makeOrder(domains: string[]): AcmeOrder {
  return {
    status: 'pending',
    identifiers: domains.map((d) => ({ type: 'dns', value: d })),
    authorizations: domains.map((d) => `https://acme.test/authz/${d}`),
    finalize: 'https://acme.test/finalize/1',
  } as AcmeOrder;
}

describe('AcmeChallengeSolver', () => {
  let signer: AcmeRequestSigner;
  let orders: AcmeOrderManager;
  let solver: AcmeChallengeSolver;

  beforeEach(() => {
    signer = makeMockSigner();
    orders = makeMockOrderManager();
    solver = new AcmeChallengeSolver(signer, orders);
  });

  describe('getChallenge', () => {
    it('returns challenge on success', async () => {
      (signer.signedPost as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: { type: 'dns-01', status: 'pending', token: 'abc' },
      });

      const result = await solver.getChallenge('https://acme.test/chall/1');
      expect(result.type).toBe('dns-01');
    });

    it('throws on non-200 response', async () => {
      (signer.signedPost as jest.Mock).mockResolvedValueOnce({
        statusCode: 403,
        body: { type: 'urn:ietf:params:acme:error:unauthorized', detail: 'no' },
      });

      await expect(solver.getChallenge('https://acme.test/chall/1')).rejects.toThrow();
    });
  });

  describe('acceptChallenge', () => {
    it('returns challenge on success', async () => {
      (signer.signedPost as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: { type: 'dns-01', status: 'processing', token: 'abc' },
      });

      const result = await solver.acceptChallenge('https://acme.test/chall/1');
      expect(result.status).toBe('processing');
    });

    it('throws on non-200 response', async () => {
      (signer.signedPost as jest.Mock).mockResolvedValueOnce({
        statusCode: 400,
        body: { type: 'urn:ietf:params:acme:error:malformed', detail: 'bad' },
      });

      await expect(solver.acceptChallenge('https://acme.test/chall/1')).rejects.toThrow();
    });
  });

  describe('solveDns01', () => {
    it('completes full challenge flow', async () => {
      const order = makeOrder(['example.com']);
      const authz = makePendingAuthz('example.com', 'dns-01');

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);

      const setDns = jest.fn().mockResolvedValue(undefined);
      const waitFor = jest.fn().mockResolvedValue(undefined);

      // completeChallenge signedPost
      (signer.signedPost as jest.Mock).mockResolvedValue({
        statusCode: 200,
        body: { status: 'processing' },
      });

      const result = await solver.solveDns01(order, { setDns, waitFor });

      expect(setDns).toHaveBeenCalledTimes(1);
      expect(waitFor).toHaveBeenCalledTimes(1);

      // Verify preparation includes _acme-challenge FQDN
      const prep = setDns.mock.calls[0][0];
      expect(prep.target).toBe('_acme-challenge.example.com');
      expect(prep.value).toMatch(/^[A-Za-z0-9_-]+$/); // base64url SHA-256

      expect(orders.waitOrder).toHaveBeenCalled();
      expect(result.status).toBe('ready');
    });

    it('skips already-valid authorizations', async () => {
      const order = makeOrder(['example.com']);
      const authz: AcmeAuthorization = {
        identifier: { type: 'dns', value: 'example.com' },
        status: 'valid',
        challenges: [],
      } as AcmeAuthorization;

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);
      const setDns = jest.fn();
      const waitFor = jest.fn();

      await solver.solveDns01(order, { setDns, waitFor });

      expect(setDns).not.toHaveBeenCalled();
      expect(waitFor).not.toHaveBeenCalled();
    });

    it('throws AuthorizationError on invalid status', async () => {
      const order = makeOrder(['example.com']);
      const authz: AcmeAuthorization = {
        identifier: { type: 'dns', value: 'example.com' },
        status: 'invalid',
        challenges: [],
      } as AcmeAuthorization;

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);

      await expect(
        solver.solveDns01(order, {
          setDns: jest.fn(),
          waitFor: jest.fn(),
        }),
      ).rejects.toThrow(AuthorizationError);
    });

    it('throws AuthorizationError on deactivated status', async () => {
      const order = makeOrder(['example.com']);
      const authz: AcmeAuthorization = {
        identifier: { type: 'dns', value: 'example.com' },
        status: 'deactivated',
        challenges: [],
      } as AcmeAuthorization;

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);

      await expect(
        solver.solveDns01(order, { setDns: jest.fn(), waitFor: jest.fn() }),
      ).rejects.toThrow(AuthorizationError);
    });

    it('throws AuthorizationError on expired status', async () => {
      const order = makeOrder(['example.com']);
      const authz: AcmeAuthorization = {
        identifier: { type: 'dns', value: 'example.com' },
        status: 'expired',
        challenges: [],
      } as AcmeAuthorization;

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);

      await expect(
        solver.solveDns01(order, { setDns: jest.fn(), waitFor: jest.fn() }),
      ).rejects.toThrow(AuthorizationError);
    });

    it('throws AuthorizationError on revoked status', async () => {
      const order = makeOrder(['example.com']);
      const authz: AcmeAuthorization = {
        identifier: { type: 'dns', value: 'example.com' },
        status: 'revoked',
        challenges: [],
      } as AcmeAuthorization;

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);

      await expect(
        solver.solveDns01(order, { setDns: jest.fn(), waitFor: jest.fn() }),
      ).rejects.toThrow(AuthorizationError);
    });

    it('throws ChallengeError when dns-01 challenge not found', async () => {
      const order = makeOrder(['example.com']);
      const authz = makePendingAuthz('example.com', 'http-01'); // wrong type

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);

      await expect(
        solver.solveDns01(order, { setDns: jest.fn(), waitFor: jest.fn() }),
      ).rejects.toThrow(ChallengeError);
    });

    it('throws ChallengeError on invalid challenge status', async () => {
      const order = makeOrder(['example.com']);
      const authz = makePendingAuthz('example.com', 'dns-01', 'invalid');

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);

      await expect(
        solver.solveDns01(order, { setDns: jest.fn(), waitFor: jest.fn() }),
      ).rejects.toThrow(ChallengeError);
    });

    it('skips already-valid challenges', async () => {
      const order = makeOrder(['example.com']);
      const authz = makePendingAuthz('example.com', 'dns-01', 'valid');

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);
      const setDns = jest.fn();
      const waitFor = jest.fn();

      await solver.solveDns01(order, { setDns, waitFor });

      expect(setDns).not.toHaveBeenCalled();
    });

    it('skips processing challenges', async () => {
      const order = makeOrder(['example.com']);
      const authz = makePendingAuthz('example.com', 'dns-01', 'processing');

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);
      const setDns = jest.fn();
      const waitFor = jest.fn();

      await solver.solveDns01(order, { setDns, waitFor });

      expect(setDns).not.toHaveBeenCalled();
    });

    it('throws ChallengeError on invalid token format', async () => {
      const order = makeOrder(['example.com']);
      const authz: AcmeAuthorization = {
        identifier: { type: 'dns', value: 'example.com' },
        status: 'pending',
        challenges: [
          {
            type: 'dns-01',
            status: 'pending',
            url: 'https://acme.test/chall/1',
            token: 'invalid token with spaces!',
          } as AcmeChallenge,
        ],
      } as AcmeAuthorization;

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);

      await expect(
        solver.solveDns01(order, { setDns: jest.fn(), waitFor: jest.fn() }),
      ).rejects.toThrow(ChallengeError);
    });

    it('handles order with no authorizations', async () => {
      const order: AcmeOrder = {
        status: 'pending',
        identifiers: [],
        authorizations: [],
        finalize: 'https://acme.test/finalize/1',
      } as AcmeOrder;

      const result = await solver.solveDns01(order, {
        setDns: jest.fn(),
        waitFor: jest.fn(),
      });

      expect(result.status).toBe('ready');
    });
  });

  describe('solveHttp01', () => {
    it('completes full HTTP-01 challenge flow', async () => {
      const order = makeOrder(['example.com']);
      const authz = makePendingAuthz('example.com', 'http-01');

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);

      const setHttp = jest.fn().mockResolvedValue(undefined);
      const waitFor = jest.fn().mockResolvedValue(undefined);

      (signer.signedPost as jest.Mock).mockResolvedValue({
        statusCode: 200,
        body: { status: 'processing' },
      });

      const result = await solver.solveHttp01(order, { setHttp, waitFor });

      expect(setHttp).toHaveBeenCalledTimes(1);
      expect(waitFor).toHaveBeenCalledTimes(1);

      // Verify preparation includes well-known URL
      const prep = setHttp.mock.calls[0][0];
      expect(prep.target).toContain('/.well-known/acme-challenge/');
      expect(prep.value).toBe('token.thumbprint');
      expect(prep.additional).toHaveProperty('token');

      expect(result.status).toBe('ready');
    });
  });

  describe('throwIfChallengeErrors', () => {
    it('throws on challenge with error object', async () => {
      const order = makeOrder(['example.com']);
      const authz: AcmeAuthorization = {
        identifier: { type: 'dns', value: 'example.com' },
        status: 'pending',
        challenges: [
          {
            type: 'dns-01',
            status: 'invalid',
            url: 'https://acme.test/chall/1',
            token: 'abc',
            error: {
              type: 'urn:ietf:params:acme:error:dns',
              detail: 'DNS problem',
              status: 400,
            },
          } as AcmeChallenge,
        ],
      } as AcmeAuthorization;

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);

      await expect(
        solver.solveDns01(order, { setDns: jest.fn(), waitFor: jest.fn() }),
      ).rejects.toThrow();
    });

    it('throws on challenge with invalid status but no error object', async () => {
      const order = makeOrder(['example.com']);
      const authz: AcmeAuthorization = {
        identifier: { type: 'dns', value: 'example.com' },
        status: 'pending',
        challenges: [
          {
            type: 'dns-01',
            status: 'invalid',
            url: 'https://acme.test/chall/1',
            token: 'abc',
          } as AcmeChallenge,
        ],
      } as AcmeAuthorization;

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);

      await expect(
        solver.solveDns01(order, { setDns: jest.fn(), waitFor: jest.fn() }),
      ).rejects.toThrow(ChallengeError);
    });

    it('does not throw when challenges have no errors', async () => {
      const order = makeOrder(['example.com']);
      const authz = makePendingAuthz('example.com', 'dns-01');

      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);

      (signer.signedPost as jest.Mock).mockResolvedValue({
        statusCode: 200,
        body: { status: 'valid' },
      });

      // Should not throw
      await solver.solveDns01(order, {
        setDns: jest.fn().mockResolvedValue(undefined),
        waitFor: jest.fn().mockResolvedValue(undefined),
      });
    });
  });

  describe('getAuthorization', () => {
    it('uses resolveAuthorization callback', async () => {
      const authz = makePendingAuthz('example.com', 'dns-01');
      solver.resolveAuthorization = jest.fn().mockResolvedValue(authz);

      const result = await solver.getAuthorization('https://acme.test/authz/1');
      expect(result).toBe(authz);
    });

    it('defaults to signedPost for resolution', async () => {
      const authz = makePendingAuthz('example.com', 'dns-01');
      (signer.signedPost as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: authz,
      });

      const result = await solver.getAuthorization('https://acme.test/authz/1');
      expect(result).toEqual(authz);
    });
  });
});
