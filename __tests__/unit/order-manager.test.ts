import { describe, it, expect, jest } from '@jest/globals';
import { AcmeOrderManager } from '../../src/lib/core/acme-order-manager.js';
import type { AcmeOrder } from '../../src/lib/types/order.js';

function makeOrder(overrides: Partial<AcmeOrder> = {}): AcmeOrder {
  return {
    status: 'pending',
    identifiers: [],
    authorizations: [],
    expires: '',
    finalize: 'https://acme.test/order/1/finalize',
    ...overrides,
  } as AcmeOrder;
}

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

    it('throws on non-HTTPS Location header', async () => {
      const signer = makeMockSigner([
        {
          statusCode: 201,
          headers: { location: 'http://insecure.test/order/1' },
          body: { status: 'pending', identifiers: [], authorizations: [], finalize: '' },
        },
      ]);
      const manager = new AcmeOrderManager(signer);
      await expect(manager.createOrder(['example.com'])).rejects.toThrow('Invalid order URL');
    });

    it('throws on invalid Location URL', async () => {
      const signer = makeMockSigner([
        {
          statusCode: 201,
          headers: { location: 'not-a-url' },
          body: { status: 'pending', identifiers: [], authorizations: [], finalize: '' },
        },
      ]);
      const manager = new AcmeOrderManager(signer);
      await expect(manager.createOrder(['example.com'])).rejects.toThrow('Invalid order URL');
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
      const order = makeOrder({ status: 'ready', url: 'https://acme.test/order/1' });
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
      const order = makeOrder({ status: 'ready', finalize: undefined as any });
      await expect(manager.finalize(order, 'csr')).rejects.toThrow('finalize');
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
      const order = makeOrder({ status: 'ready' });
      await expect(manager.finalize(order, 'csr')).rejects.toThrow();
    });
  });

  describe('waitOrder', () => {
    it('returns immediately when order already in target status', async () => {
      const signer = makeMockSigner();
      const manager = new AcmeOrderManager(signer);
      const order = makeOrder({
        status: 'valid',
        url: 'https://acme.test/order/1',
        certificate: 'https://acme.test/cert/1',
      });
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
      const order = makeOrder({ status: 'processing', url: 'https://acme.test/order/1' });
      const result = await manager.waitOrder(order, ['valid']);
      expect(result.status).toBe('valid');
    });
  });

  describe('downloadCertificate', () => {
    it('downloads certificate PEM', async () => {
      const certPem = '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----';
      const signer = makeMockSigner([{ statusCode: 200, headers: {}, body: certPem }]);
      const manager = new AcmeOrderManager(signer);
      const order = makeOrder({ status: 'valid', certificate: 'https://acme.test/cert/1' });
      const cert = await manager.downloadCertificate(order);
      expect(cert).toBe(certPem);
    });

    it('throws when no certificate URL', async () => {
      const signer = makeMockSigner();
      const manager = new AcmeOrderManager(signer);
      const order = makeOrder({ status: 'valid', certificate: undefined as any });
      await expect(manager.downloadCertificate(order)).rejects.toThrow('certificate');
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
      const order = makeOrder({ status: 'valid', certificate: 'https://acme.test/cert/1' });
      await expect(manager.downloadCertificate(order)).rejects.toThrow();
    });
  });
});
