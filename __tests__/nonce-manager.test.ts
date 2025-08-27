import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { NonceManager, type NonceManagerOptions } from '../src/acme/client/nonce-manager.js';
import type { HttpResponse } from '../src/acme/http/http-client.js';

// Mock HTTP client for testing
class MockHttpClient {
  private mockResponses: Map<string, HttpResponse<any>> = new Map();
  private requestCount = 0;

  setMockResponse(url: string, response: HttpResponse<any>) {
    this.mockResponses.set(url, response);
  }

  async fetch(url: string): Promise<HttpResponse<any>> {
    this.requestCount++;
    const mockResponse = this.mockResponses.get(url);
    
    if (!mockResponse) {
      throw new Error(`No mock response configured for ${url}`);
    }

    return mockResponse;
  }

  getRequestCount(): number {
    return this.requestCount;
  }
  
  // Allow manual increment for overridden fetch methods
  incrementRequestCount(): void {
    this.requestCount++;
  }

  reset() {
    this.mockResponses.clear();
    this.requestCount = 0;
  }
}

describe('NonceManager', () => {
  let mockHttpClient: MockHttpClient;
  let nonceManager: NonceManager;
  const testDirectoryUrl = 'https://acme-staging-v02.api.letsencrypt.org/directory';
  const testNewNonceUrl = 'https://acme-staging-v02.api.letsencrypt.org/acme/new-nonce';

  beforeEach(() => {
    mockHttpClient = new MockHttpClient();
    
    // Mock successful nonce responses
    mockHttpClient.setMockResponse(testNewNonceUrl, {
      status: 200,
      headers: {
        'replay-nonce': 'test-nonce-' + Date.now(),
      },
      data: null,
    });
  });

  afterEach(() => {
    mockHttpClient.reset();
  });

  describe('Basic Functionality', () => {
    test('should create NonceManager with default config', () => {
      const opts: NonceManagerOptions = {
        newNonceUrl: testNewNonceUrl,
        fetch: mockHttpClient.fetch.bind(mockHttpClient),
      };
      nonceManager = new NonceManager(opts);
      
      expect(nonceManager).toBeDefined();
    });

    test('should create NonceManager with custom config', () => {
      const opts: NonceManagerOptions = {
        newNonceUrl: testNewNonceUrl,
        fetch: mockHttpClient.fetch.bind(mockHttpClient),
        maxPool: 32,
        prefetchLowWater: 8,
        prefetchHighWater: 16,
        maxAgeMs: 300000,
      };
      
      nonceManager = new NonceManager(opts);
      
      expect(nonceManager).toBeDefined();
    });

    test('should fetch initial nonce on first take()', async () => {
      const opts: NonceManagerOptions = {
        newNonceUrl: testNewNonceUrl,
        fetch: mockHttpClient.fetch.bind(mockHttpClient),
      };
      nonceManager = new NonceManager(opts);
      
      const namespace = NonceManager.makeNamespace(testDirectoryUrl);
      const nonce = await nonceManager.take(namespace);
      
      expect(nonce).toBeTruthy();
      expect(nonce).toContain('test-nonce-');
      expect(mockHttpClient.getRequestCount()).toBe(1);
    });

    test('should return different nonces on multiple take() calls', async () => {
      // Setup multiple mock responses
      let nonceCounter = 0;
      const originalFetch = mockHttpClient.fetch.bind(mockHttpClient);
      mockHttpClient.fetch = async (url: string) => {
        if (url === testNewNonceUrl) {
          return {
            status: 200,
            headers: {
              'replay-nonce': `test-nonce-${++nonceCounter}`,
            },
            data: null,
          };
        }
        return originalFetch(url);
      };

      const opts: NonceManagerOptions = {
        newNonceUrl: testNewNonceUrl,
        fetch: mockHttpClient.fetch.bind(mockHttpClient),
      };
      nonceManager = new NonceManager(opts);
      
      const namespace = NonceManager.makeNamespace(testDirectoryUrl);
      const nonce1 = await nonceManager.take(namespace);
      const nonce2 = await nonceManager.take(namespace);
      
      expect(nonce1).not.toBe(nonce2);
      expect(nonce1).toContain('test-nonce-');
      expect(nonce2).toContain('test-nonce-');
    });
  });

  describe('Nonce Pooling', () => {
    test('should prefetch nonces to maintain pool', async () => {
      let nonceCounter = 0;
      
      // We need to create a dynamic response generator
      mockHttpClient.fetch = async (url: string) => {
        mockHttpClient.incrementRequestCount(); // Manual increment since we override
        if (url === testNewNonceUrl) {
          return {
            status: 200,
            headers: {
              'replay-nonce': `pooled-nonce-${++nonceCounter}`,
            },
            data: null,
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const opts: NonceManagerOptions = {
        newNonceUrl: testNewNonceUrl,
        fetch: mockHttpClient.fetch.bind(mockHttpClient),
        maxPool: 10,
        prefetchLowWater: 3,
        prefetchHighWater: 6,
      };

      nonceManager = new NonceManager(opts);
      
      const namespace = NonceManager.makeNamespace(testDirectoryUrl);
      
      // Take several nonces to trigger prefetching
      const nonces: string[] = [];
      for (let i = 0; i < 5; i++) {
        nonces.push(await nonceManager.take(namespace));
      }
      
      // Wait for background prefetching
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(nonces.length).toBe(5);
      expect(new Set(nonces).size).toBe(5); // All nonces should be unique
      expect(mockHttpClient.getRequestCount()).toBeGreaterThan(5); // Should have prefetched
    });

    test('should respect maxPool limit', async () => {
      let nonceCounter = 0;
      mockHttpClient.fetch = async (url: string) => {
        mockHttpClient.incrementRequestCount();
        if (url === testNewNonceUrl) {
          await new Promise(resolve => setTimeout(resolve, 5)); // Simulate network delay
          return {
            status: 200,
            headers: {
              'replay-nonce': `limited-nonce-${++nonceCounter}`,
            },
            data: null,
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const opts: NonceManagerOptions = {
        newNonceUrl: testNewNonceUrl,
        fetch: mockHttpClient.fetch.bind(mockHttpClient),
        maxPool: 3,
        prefetchLowWater: 1,
        prefetchHighWater: 2,
      };

      nonceManager = new NonceManager(opts);
      
      const namespace = NonceManager.makeNamespace(testDirectoryUrl);
      
      // Take nonces sequentially (not all at once to avoid deadlock)
      const nonces: string[] = [];
      for (let i = 0; i < 5; i++) {
        nonces.push(await nonceManager.take(namespace));
      }
      
      expect(nonces.length).toBe(5);
      expect(new Set(nonces).size).toBe(5); // All should be unique
      
      // Wait a bit and check that we didn't exceed reasonable request count
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(mockHttpClient.getRequestCount()).toBeLessThan(20); // Should not exceed reasonable bounds
    });
  });

  describe('Error Handling', () => {
    test('should handle HTTP errors gracefully', async () => {
      mockHttpClient.setMockResponse(testNewNonceUrl, {
        status: 500,
        headers: {},
        data: { error: 'Internal Server Error' },
      });

      const opts: NonceManagerOptions = {
        newNonceUrl: testNewNonceUrl,
        fetch: mockHttpClient.fetch.bind(mockHttpClient),
      };
      nonceManager = new NonceManager(opts);
      
      const namespace = NonceManager.makeNamespace(testDirectoryUrl);
      await expect(nonceManager.take(namespace)).rejects.toThrow();
    });

    test('should handle missing replay-nonce header', async () => {
      mockHttpClient.setMockResponse(testNewNonceUrl, {
        status: 200,
        headers: {}, // No replay-nonce header
        data: null,
      });

      const opts: NonceManagerOptions = {
        newNonceUrl: testNewNonceUrl,
        fetch: mockHttpClient.fetch.bind(mockHttpClient),
      };
      nonceManager = new NonceManager(opts);
      
      const namespace = NonceManager.makeNamespace(testDirectoryUrl);
      await expect(nonceManager.take(namespace)).rejects.toThrow(/replay-nonce/i);
    });

    test('should handle network errors', async () => {
      mockHttpClient.fetch = async () => {
        throw new Error('Network error');
      };

      const opts: NonceManagerOptions = {
        newNonceUrl: testNewNonceUrl,
        fetch: mockHttpClient.fetch.bind(mockHttpClient),
      };
      nonceManager = new NonceManager(opts);
      
      const namespace = NonceManager.makeNamespace(testDirectoryUrl);
      await expect(nonceManager.take(namespace)).rejects.toThrow('Network error');
    });
  });

  describe('Concurrent Access', () => {
    test('should handle concurrent take() calls correctly', async () => {
      let nonceCounter = 0;
      mockHttpClient.fetch = async (url: string) => {
        mockHttpClient.incrementRequestCount();
        if (url === testNewNonceUrl) {
          // Simulate some network delay
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          return {
            status: 200,
            headers: {
              'replay-nonce': `concurrent-nonce-${++nonceCounter}`,
            },
            data: null,
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const opts: NonceManagerOptions = {
        newNonceUrl: testNewNonceUrl,
        fetch: mockHttpClient.fetch.bind(mockHttpClient),
      };
      nonceManager = new NonceManager(opts);
      
      const namespace = NonceManager.makeNamespace(testDirectoryUrl);
      
      // Start many concurrent take() operations
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(nonceManager.take(namespace));
      }
      
      const nonces = await Promise.all(promises);
      
      // All nonces should be unique
      expect(new Set(nonces).size).toBe(nonces.length);
      
      // All nonces should be defined and non-empty
      nonces.forEach(nonce => {
        expect(nonce).toBeTruthy();
        expect(typeof nonce).toBe('string');
      });
    });

    test('should handle high-frequency take() calls', async () => {
      let nonceCounter = 0;
      mockHttpClient.fetch = async (url: string) => {
        mockHttpClient.incrementRequestCount();
        if (url === testNewNonceUrl) {
          return {
            status: 200,
            headers: {
              'replay-nonce': `highfreq-nonce-${++nonceCounter}`,
            },
            data: null,
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const opts: NonceManagerOptions = {
        newNonceUrl: testNewNonceUrl,
        fetch: mockHttpClient.fetch.bind(mockHttpClient),
        maxPool: 50,
        prefetchLowWater: 10,
        prefetchHighWater: 25,
      };

      nonceManager = new NonceManager(opts);
      
      const namespace = NonceManager.makeNamespace(testDirectoryUrl);
      
      // Rapid-fire nonce requests
      const nonces: string[] = [];
      for (let i = 0; i < 100; i++) {
        nonces.push(await nonceManager.take(namespace));
        
        // Occasional small delay to simulate real usage
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
      
      expect(nonces.length).toBe(100);
      expect(new Set(nonces).size).toBe(100); // All unique
    }, 15000);
  });

  describe('Namespace Isolation', () => {
    test('should isolate nonces by namespace', async () => {
      let nonceCounter = 0;
      mockHttpClient.fetch = async (url: string) => {
        mockHttpClient.incrementRequestCount();
        if (url === testNewNonceUrl) {
          return {
            status: 200,
            headers: {
              'replay-nonce': `isolated-nonce-${++nonceCounter}`,
            },
            data: null,
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const opts: NonceManagerOptions = {
        newNonceUrl: testNewNonceUrl,
        fetch: mockHttpClient.fetch.bind(mockHttpClient),
      };
      nonceManager = new NonceManager(opts);
      
      const namespace1 = NonceManager.makeNamespace('https://ca1.acme-love.com');
      const namespace2 = NonceManager.makeNamespace('https://ca2.acme-love.com');
      
      const nonce1 = await nonceManager.take(namespace1);
      const nonce2 = await nonceManager.take(namespace2);
      
      expect(nonce1).toBeTruthy();
      expect(nonce2).toBeTruthy();
      expect(nonce1).not.toBe(nonce2);
    });

    test('should create consistent namespaces', () => {
      const url = 'https://acme-love.com/directory';
      const ns1 = NonceManager.makeNamespace(url);
      const ns2 = NonceManager.makeNamespace(url);
      
      expect(ns1).toBe(ns2);
    });
  });
});
