import { ACMEClient } from '../src/acme/client/client.js';
import { BadNonceError, UnauthorizedError, ServerInternalError } from '../src/errors.js';
import { generateKeyPairSync } from 'crypto';

// Mock for HTTP client
class MockHttpClient {
  mockResponses: Map<string, any> = new Map();

  setMockResponse(url: string, response: any) {
    this.mockResponses.set(url, response);
  }

  async get(url: string) {
    if (this.mockResponses.has(url)) {
      return this.mockResponses.get(url);
    }
    throw new Error(`No mock response for GET ${url}`);
  }

  async head(url: string) {
    if (this.mockResponses.has(url)) {
      return this.mockResponses.get(url);
    }
    throw new Error(`No mock response for HEAD ${url}`);
  }

  async post(url: string, _data: unknown, _headers?: Record<string, string>) {
    if (this.mockResponses.has(url)) {
      return this.mockResponses.get(url);
    }
    throw new Error(`No mock response for POST ${url}`);
  }
}

describe('ACME Client Mock Tests', () => {
  let client: ACMEClient;
  let mockHttpClient: MockHttpClient;

  beforeEach(() => {
    // Create client and replace HTTP client with mock
    client = new ACMEClient('https://example.com/directory');
    mockHttpClient = new MockHttpClient();
    // @ts-ignore - replace private property for testing
    client['http'] = mockHttpClient;

    // Configure basic mocks
    mockHttpClient.setMockResponse('https://example.com/directory', {
      status: 200,
      data: {
        newNonce: 'https://example.com/acme/new-nonce',
        newAccount: 'https://example.com/acme/new-account',
        newOrder: 'https://example.com/acme/new-order',
        revokeCert: 'https://example.com/acme/revoke-cert',
        keyChange: 'https://example.com/acme/key-change',
      },
    });

    mockHttpClient.setMockResponse('https://example.com/acme/new-nonce', {
      status: 200,
      headers: {
        'replay-nonce': 'mock-nonce-12345',
      },
    });

    // Generate account keys
    const keyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Set account credentials
    client.setAccount({
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
    });
  });

  describe('Directory and Nonce', () => {
    it('should initialize directory and get nonce', async () => {
      await client.getNonce();

      // @ts-ignore - access private property for verification
      const dir = client['directory'];
      expect(dir).toBeDefined();
      expect(dir?.newNonce).toBe('https://example.com/acme/new-nonce');

      // @ts-ignore - access private property for verification
      const nonce = client['nonce'];
      expect(nonce).toBe('mock-nonce-12345');
    });
  });

  describe('Error Handling', () => {
    it('should handle bad nonce errors', async () => {
      // Configure mock to return a bad nonce error
      mockHttpClient.setMockResponse('https://example.com/acme/new-order', {
        status: 400,
        data: {
          type: 'urn:ietf:params:acme:error:badNonce',
          detail: 'Invalid nonce',
          status: 400,
        },
      });

      // Initialize directory
      await client.getNonce();

      // Attempt to create order should throw BadNonceError
      await expect(async () => {
        await client.createOrder([{ type: 'dns', value: 'test.example.com' }]);
      }).rejects.toThrow(BadNonceError);
    });

    it('should handle unauthorized errors', async () => {
      // Configure mock to return an unauthorized error
      mockHttpClient.setMockResponse('https://example.com/acme/new-order', {
        status: 401,
        data: {
          type: 'urn:ietf:params:acme:error:unauthorized',
          detail: 'Account does not exist',
          status: 401,
        },
      });

      // Инициализируем директорию
      await client.getNonce();

      // Попытка создать заказ должна вызвать UnauthorizedError
      await expect(async () => {
        await client.createOrder([{ type: 'dns', value: 'test.example.com' }]);
      }).rejects.toThrow(UnauthorizedError);
    });

    it('should handle server errors', async () => {
      // Настраиваем мок для получения внутренней ошибки сервера
      mockHttpClient.setMockResponse('https://example.com/acme/new-order', {
        status: 500,
        data: {
          type: 'urn:ietf:params:acme:error:serverInternal',
          detail: 'Internal server error',
          status: 500,
        },
      });

      // Инициализируем директорию
      await client.getNonce();

      // Попытка создать заказ должна вызвать ServerInternalError
      await expect(async () => {
        await client.createOrder([{ type: 'dns', value: 'test.example.com' }]);
      }).rejects.toThrow(ServerInternalError);
    });
  });
});
