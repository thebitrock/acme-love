import { beforeAll } from '@jest/globals';

// Jest-specific setup
beforeAll(async () => {
  // Ensure WebCrypto is available in test environment
  if (!globalThis.crypto) {
    try {
      const { webcrypto } = await import('crypto');
      Object.defineProperty(globalThis, 'crypto', {
        value: webcrypto,
        writable: false,
        configurable: true,
      });
    } catch (error) {
      console.warn('WebCrypto not available in test environment:', error);
    }
  }

  // Set test environment
  process.env.NODE_ENV = 'test';
});
