/**
 * Debug logging utilities for ACME Love
 * 
 * Uses the 'debug' module with namespaces for different components.
 * Set DEBUG environment variable to control output:
 * 
 * DEBUG=acme-love:* - All debug output
 * DEBUG=acme-love:nonce - Only nonce manager debug
 * DEBUG=acme-love:http - Only HTTP debug
 * DEBUG=acme-love:challenge - Only challenge debug
 * 
 * In production, debug output is automatically disabled unless DEBUG is set.
 */
import debug from 'debug';

// Create debug loggers for different components
export const debugNonce = debug('acme-love:nonce');
export const debugHttp = debug('acme-love:http');
export const debugChallenge = debug('acme-love:challenge');
export const debugClient = debug('acme-love:client');
export const debugValidator = debug('acme-love:validator');

// Main debug logger
export const debugMain = debug('acme-love');

/**
 * Check if any debug logging is enabled
 */
export function isDebugEnabled(): boolean {
  return debug.enabled('acme-love*');
}

/**
 * Enable all ACME Love debug output programmatically
 */
export function enableDebug(): void {
  debug.enabled = (name: string) => name.startsWith('acme-love');
}

/**
 * Disable all ACME Love debug output programmatically
 */
export function disableDebug(): void {
  debug.enabled = () => false;
}
