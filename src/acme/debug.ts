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

// Simple debug function that can be enabled with DEBUG=acme:* environment variable
const createDebugger = (namespace: string) => {
  const debugEnv = process.env.DEBUG || '';
  const shouldLog =
    debugEnv.includes('acme-love:*') ||
    debugEnv.includes(`acme-love:${namespace}`) ||
    debugEnv.includes('*');

  return (message: string, ...args: any[]) => {
    if (shouldLog) {
      const timestamp = new Date().toISOString();
      // Simple string formatting - replace %s, %d, %j
      let formattedMessage = message;
      let argIndex = 0;
      formattedMessage = formattedMessage.replace(/%[sdj%]/g, (match) => {
        if (argIndex >= args.length) return match;
        const arg = args[argIndex++];
        switch (match) {
          case '%s':
            return String(arg);
          case '%d':
            return String(Number(arg));
          case '%j':
            return JSON.stringify(arg);
          case '%%':
            return '%';
          default:
            return match;
        }
      });
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

// Main debug logger
export const debugMain = createDebugger('main');
