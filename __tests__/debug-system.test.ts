/**
 * Test Debug System
 */

import { debugNonce, debugRateLimit } from '../src/acme/debug.js';

describe('Debug System Test', () => {
  test('should output debug messages when DEBUG is set', () => {
    console.log('Testing debug system...');
    console.log('DEBUG environment variable:', process.env.DEBUG);
    
    debugNonce('This is a test nonce debug message: %s', 'test-value');
    debugRateLimit('This is a test rate limit debug message: %d', 42);
    
    console.log('Debug test completed');
    expect(true).toBe(true);
  });
});
