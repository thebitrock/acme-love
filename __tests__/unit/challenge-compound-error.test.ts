import { describe, it, expect, beforeEach } from '@jest/globals';
import { AcmeAccount, type AccountKeys } from '../../src/lib/core/acme-account.js';
import { AcmeClient } from '../../src/lib/core/acme-client.js';
import { CompoundError, IncorrectResponseError } from '../../src/lib/errors/errors.js';
import { generateKeyPair } from '../../src/lib/crypto/csr.js';

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
  // Minimal stub for AcmeClient used only for directoryUrl reference inside account
  const clientStub: any = {
    directoryUrl: 'https://example.test/directory',
    getHttp() {
      return {
        post: () => {
          throw new Error('should not reach network');
        },
        head: () => {
          // Return a mock nonce response for the test
          return Promise.resolve({
            statusCode: 200,
            headers: { 'replay-nonce': 'test-nonce-123' },
            body: '',
          });
        },
      };
    },
    getDirectory: async () => ({
      newNonce: 'https://example.test/acme/new-nonce',
      newAccount: 'https://example.test/acme/new-account',
      newOrder: 'https://example.test/acme/new-order',
    }),
    getDefaultNonce: () => ({}),
  };

  // Generate real keys for the test
  let testKeys: AccountKeys;

  beforeEach(async () => {
    const keyPair = await generateKeyPair({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });
    testKeys = {
      privateKey: keyPair.privateKey!,
      publicKey: keyPair.publicKey,
    };
  });

  class TestAccount extends AcmeAccount {
    constructor(keys: AccountKeys) {
      super(clientStub as any, keys, {});
    }

    // Override getAuthorization to return our authorization fixture
    override async getAuthorization(_authzUrl: string): Promise<any> {
      return AUTHZ_FIXTURE;
    }
  }
  it('throws CompoundError with mapped IncorrectResponse subproblems', async () => {
    const account = new TestAccount(testKeys);

    const order = {
      url: 'https://example.test/order/1',
      status: 'pending' as const,
      identifiers: [{ type: 'dns', value: 'smpl.kpi-kharkov.click' }],
      authorizations: ['https://example.test/acme/authz/xxx'],
      finalize: 'https://example.test/acme/finalize/1',
    };

    // Test the detailed error structure
    try {
      await account.solveDns01(order as any, { setDns: async () => {}, waitFor: async () => {} });
      throw new Error('Expected CompoundError was not thrown');
    } catch (e) {
      const err = e as CompoundError;
      expect(err).toBeInstanceOf(CompoundError);
      expect(err.subproblems).toHaveLength(2);
      expect(err.subproblems?.every((sp) => sp instanceof IncorrectResponseError)).toBe(true);
      expect(err.toString()).toMatch(/1\. \[/);
    }
  });
});
