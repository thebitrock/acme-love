import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AcmeOrderManager } from '../../src/lib/core/acme-order-manager.js';
import { OrderError } from '../../src/lib/errors/acme-operation-errors.js';

function makeMockSigner(responses: any[] = []) {
  let callIndex = 0;
  return {
    signedPost: jest.fn(async () => {
      if (callIndex < responses.length) {
        return responses[callIndex++];
      }
      return { statusCode: 200, headers: {}, body: {} };
    }),
    getDirectory: jest.fn(async () => ({
      newNonce: 'https://acme.test/acme/new-nonce',
      newAccount: 'https://acme.test/acme/new-acct',
      newOrder: 'https://acme.test/acme/new-order',
      revokeCert: 'https://acme.test/acme/revoke-cert',
      keyChange: 'https://acme.test/acme/key-change',
    })),
  } as any;
}

describe('AcmeOrderManager', () => {
  describe('createOrder', () => {
    it('creates order and sets url from location header', async () => {
      const signer = makeMockSigner([
        {
          statusCode: 201,
          headers: { location: 'https://acme.test/order/1' },
          body: {
            status: 'pending',
            identifiers: [{ type: 'dns', value: 'example.com' }],
            authorizations: ['https://acme.test/authz/1'],
            finalize: 'https://acme.test/order/1/finalize',
          },
        },
      ]);
      const manager = new AcmeOrderManager(signer);
      const order = await manager.createOrder(['example.com']);
      expect(order.status).toBe('pending');
      expect(order.url).toBe('https://acme.test/order/1');
      expect(signer.getDirectory).toHaveBeenCalled();
      expect(signer.signedPost).toHaveBeenCalledWith('https://acme.test/acme/new-order', {
        identifiers: [{ type: 'dns', value: 'example.com' }],
      });
    });

    it('throws on non-201 response', async () => {
      const signer = makeMockSigner([
        {
          statusCode: 400,
          headers: {},
          body: {
            type: 'urn:ietf:params:acme:error:malformed',
            detail: 'bad request',
          },
        },
      ]);
      const manager = new AcmeOrderManager(signer);
      await expect(manager.createOrder(['bad.com'])).rejects.toThrow();
    });
  });

  describe('finalize', () => {
    it('finalizes order with CSR', async () => {
      const signer = makeMockSigner([
        {
          statusCode: 200,
          headers: {},
          body: { status: 'processing', url: 'https://acme.test/order/1' },
        },
      ]);
      const manager = new AcmeOrderManager(signer);
      const order = {
        status: 'ready' as const,
        url: 'https://acme.test/order/1',
        finalize: 'https://acme.test/order/1/finalize',
        identifiers: [],
        authorizations: [],
        expires: '',
      };
      const result = await manager.finalize(order, 'base64url-csr');
      expect(result.status).toBe('processing');
      expect(result.url).toBe('https://acme.test/order/1');
      expect(signer.signedPost).toHaveBeenCalledWith('https://acme.test/order/1/finalize', {
        csr: 'base64url-csr',
      });
    });

    it('throws when no finalize URL', async () => {
      const signer = makeMockSigner();
      const manager = new AcmeOrderManager(signer);
      const order = { status: 'ready' as const, identifiers: [], authorizations: [], expires: '' };
      await expect(manager.finalize(order as any, 'csr')).rejects.toThrow('finalize');
    });

    it('throws on non-200 response', async () => {
      const signer = makeMockSigner([
        {
          statusCode: 403,
          headers: {},
          body: {
            type: 'urn:ietf:params:acme:error:orderNotReady',
            detail: 'not ready',
          },
        },
      ]);
      const manager = new AcmeOrderManager(signer);
      const order = {
        status: 'ready' as const,
        finalize: 'https://acme.test/order/1/finalize',
        identifiers: [],
        authorizations: [],
        expires: '',
      };
      await expect(manager.finalize(order, 'csr')).rejects.toThrow();
    });
  });

  describe('waitOrder', () => {
    it('returns immediately when order already in target status', async () => {
      const signer = makeMockSigner();
      const manager = new AcmeOrderManager(signer);
      const order = {
        status: 'valid' as const,
        url: 'https://acme.test/order/1',
        identifiers: [],
        authorizations: [],
        expires: '',
        certificate: 'https://acme.test/cert/1',
      };
      const result = await manager.waitOrder(order, ['valid']);
      expect(result.status).toBe('valid');
      expect(signer.signedPost).not.toHaveBeenCalled();
    });

    it('polls until target status reached', async () => {
      const signer = makeMockSigner([
        { statusCode: 200, headers: {}, body: { status: 'processing' } },
        {
          statusCode: 200,
          headers: {},
          body: { status: 'valid', certificate: 'https://acme.test/cert/1' },
        },
      ]);
      const manager = new AcmeOrderManager(signer);
      const order = {
        status: 'processing' as const,
        url: 'https://acme.test/order/1',
        identifiers: [],
        authorizations: [],
        expires: '',
      };
      const result = await manager.waitOrder(order, ['valid']);
      expect(result.status).toBe('valid');
    });
  });

  describe('downloadCertificate', () => {
    it('downloads certificate PEM', async () => {
      const certPem = '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----';
      const signer = makeMockSigner([{ statusCode: 200, headers: {}, body: certPem }]);
      const manager = new AcmeOrderManager(signer);
      const order = {
        status: 'valid' as const,
        certificate: 'https://acme.test/cert/1',
        identifiers: [],
        authorizations: [],
        expires: '',
      };
      const cert = await manager.downloadCertificate(order);
      expect(cert).toBe(certPem);
    });

    it('throws when no certificate URL', async () => {
      const signer = makeMockSigner();
      const manager = new AcmeOrderManager(signer);
      const order = { status: 'valid' as const, identifiers: [], authorizations: [], expires: '' };
      await expect(manager.downloadCertificate(order as any)).rejects.toThrow('certificate');
    });

    it('throws on non-200 response', async () => {
      const signer = makeMockSigner([
        {
          statusCode: 404,
          headers: {},
          body: { type: 'urn:ietf:params:acme:error:malformed', detail: 'not found' },
        },
      ]);
      const manager = new AcmeOrderManager(signer);
      const order = {
        status: 'valid' as const,
        certificate: 'https://acme.test/cert/1',
        identifiers: [],
        authorizations: [],
        expires: '',
      };
      await expect(manager.downloadCertificate(order)).rejects.toThrow();
    });
  });
});
