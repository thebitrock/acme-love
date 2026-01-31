/**
 * Debug logging utilities for ACME Love
 *
 * Simple debug system that can be enabled with DEBUG environment variable:
 *
 * DEBUG=acme-love:* - All debug output
 * DEBUG=acme-love:nonce - Only nonce manager debug
 * DEBUG=acme-love:http - Only HTTP debug
 * DEBUG=acme-love:challenge - Only challenge debug
 *
 * In production, debug output is automatically disabled unless DEBUG is set.
 */

import { format } from 'node:util';

const createDebugger = (namespace: string) => {
  const debugEnv = process.env.DEBUG || '';
  const shouldLog =
    debugEnv.includes('acme-love:*') ||
    debugEnv.includes(`acme-love:${namespace}`) ||
    debugEnv.includes('*');

  return (message: string, ...args: unknown[]) => {
    if (shouldLog) {
      const timestamp = new Date().toISOString();
      const formattedMessage = format(message, ...args);
      console.log(`[${timestamp}] acme-love:${namespace} ${formattedMessage}`);
    }
  };
};

export const debugNonce = createDebugger('nonce');
export const debugHttp = createDebugger('http');
export const debugChallenge = createDebugger('challenge');
export const debugClient = createDebugger('client');
export const debugRateLimit = createDebugger('ratelimit');
export const debugValidator = createDebugger('validator');

export const debugMain = createDebugger('main');
