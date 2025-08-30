import { describe, it, expect } from '@jest/globals';
import {
  AcmeAccountSession,
  type AccountKeys,
} from '../../src/acme/client/acme-account-session.js';
import { CompoundError, IncorrectResponseError } from '../../src/acme/errors/errors.js';

// Authorization response fixture (simplified) based on provided sample
const AUTHZ_FIXTURE = {
  identifier: { type: 'dns', value: 'smpl.kpi-kharkov.click' },
  status: 'pending',
  challenges: [
    {
      type: 'http-01',
      url: 'https://example.test/acme/authz/xxx/1',
      status: 'pending',
      token: 'TOKEN_HTTP',
    },
    {
      type: 'dns-01',
      url: 'https://example.test/acme/authz/xxx/2',
      status: 'processing',
      validated: '2025-08-30T10:03:37Z',
      token: 'TOKEN_DNS',
      error: {
        type: 'urn:ietf:params:acme:error:compound',
        title: 'Forbidden',
        status: 403,
        detail: 'Errors during validation',
        subproblems: [
          {
            type: 'urn:ietf:params:acme:error:incorrectResponse',
            title: 'Bad Request',
            status: 400,
            detail: "Response received didn't match the challenge's requirements",
          },
          {
            type: 'urn:ietf:params:acme:error:incorrectResponse',
            title: 'Bad Request',
            status: 400,
            detail: "Response received didn't match the challenge's requirements",
          },
        ],
      },
    },
  ],
  wildcard: false,
};

describe('challenge compound error propagation', () => {
  // Minimal stub for AcmeClientCore used only for directoryUrl reference inside session
  const clientStub: any = {
    directoryUrl: 'https://example.test/directory',
    getHttp() {
      return {
        post: () => {
          throw new Error('should not reach network');
        },
        head: () => {
          throw new Error('no head');
        },
      };
    },
    getDirectory: async () => ({ newNonce: '', newAccount: '', newOrder: '' }),
    getDefaultNonce: () => ({}),
  };

  // Dummy keys (not used because error thrown before signing is needed)
  const keys: AccountKeys = { privateKey: {} as any, publicKey: {} as any };

  class TestSession extends AcmeAccountSession {
    // Override fetch to return our authorization fixture regardless of URL
    public override async fetch<T>(_url: string): Promise<T> {
      return AUTHZ_FIXTURE as unknown as T;
    }
  }

  it('throws CompoundError with mapped IncorrectResponse subproblems', async () => {
    const session = new TestSession(clientStub, keys, {});

    const order = {
      url: 'https://example.test/order/1',
      status: 'pending' as const,
      identifiers: [{ type: 'dns', value: 'smpl.kpi-kharkov.click' }],
      authorizations: ['https://example.test/acme/authz/xxx'],
      finalize: 'https://example.test/acme/finalize/1',
    };

    await expect(
      session.solveDns01(order as any, {
        setDns: async () => {
          throw new Error('should not set DNS due to early error');
        },
        waitFor: async () => {
          throw new Error('should not wait');
        },
      }),
    ).rejects.toBeInstanceOf(CompoundError);

    try {
      await session.solveDns01(order as any, { setDns: async () => {}, waitFor: async () => {} });
    } catch (e) {
      const err = e as CompoundError;
      expect(err).toBeInstanceOf(CompoundError);
      expect(err.subproblems).toHaveLength(2);
      expect(err.subproblems?.every((sp) => sp instanceof IncorrectResponseError)).toBe(true);
      expect(err.toString()).toMatch(/1\. \[/);
      return;
    }
    throw new Error('Expected CompoundError was not thrown');
  });
});
