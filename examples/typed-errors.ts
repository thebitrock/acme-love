/**
 * Example: Using typed ACME errors
 *
 * This example demonstrates how to use the new typed error system
 * for better error handling in ACME operations.
 */

import * as jose from 'jose';
import {
  AcmeClient,
  AcmeAccount,
  AuthorizationError,
  ChallengeError,
  OrderError,
  AccountError,
  isAuthorizationError,
  isChallengeError,
  isOrderError,
  isAccountError,
} from '../src/index.js';

export async function exampleTypedErrorHandling() {
  const client = new AcmeClient('https://acme-staging-v02.api.letsencrypt.org/directory');

  // Example with account keys (normally you'd generate these)
  const keyPair = await jose.generateKeyPair('ES256');
  const keys = {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
  };
  const account = new AcmeAccount(client, keys);

  try {
    // This will work fine
    const order = await account.createOrder(['example.com']);

    // Example DNS-01 challenge
    await account.solveDns01(order, {
      setDns: async (prep) => {
        console.log(`Set DNS record: ${prep.target} = ${prep.value}`);
      },
      waitFor: async () => {
        console.log('Waiting for DNS propagation...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      },
    });
  } catch (error) {
    // Type-safe error handling
    if (isAuthorizationError(error)) {
      console.error(`Authorization failed for domain: ${error.context?.domain}`);
      console.error(`Status: ${error.context?.status}`);

      // Handle specific authorization errors
      if (error.context?.status === 'invalid') {
        console.error('Domain authorization is invalid - check DNS/ownership');
      } else if (error.context?.status === 'expired') {
        console.error('Authorization has expired - need to re-validate');
      }
    } else if (isChallengeError(error)) {
      console.error(`Challenge failed: ${error.context?.challengeType}`);
      console.error(`Domain: ${error.context?.domain}`);

      // Handle specific challenge errors
      if (error.context?.challengeType === 'dns-01') {
        console.error('DNS challenge failed - check TXT record');
      } else if (error.context?.challengeType === 'http-01') {
        console.error('HTTP challenge failed - check web server');
      }
    } else if (isOrderError(error)) {
      console.error('Order processing failed');

      if (error.context?.missing === 'finalize') {
        console.error('Order is not ready for finalization');
      } else if (error.context?.missing === 'certificate') {
        console.error('Certificate is not yet available');
      }
    } else if (isAccountError(error)) {
      console.error('Account error occurred');

      if (error.context?.action === 'register_required') {
        console.error('Need to register account first');
      }
    } else {
      // Fallback for other error types
      console.error('Unknown error:', error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Factory method examples
 */
export function demonstrateErrorFactory() {
  // Authorization errors
  const invalidAuth = AuthorizationError.invalid('example.com', 'DNS lookup failed');
  const expiredAuth = AuthorizationError.expired('example.com');

  // Challenge errors
  const missingChallenge = ChallengeError.notFound('dns-01', 'example.com');
  const invalidChallenge = ChallengeError.invalid('http-01', 'example.com', 'Connection refused');

  // Order errors
  const timeoutOrder = OrderError.timeout(['ready', 'valid'], 'pending', 60);
  const noFinalize = OrderError.noFinalizeUrl();

  // Account errors
  const notRegistered = AccountError.notRegistered();

  console.log('Example errors created:', {
    invalidAuth: invalidAuth.message,
    expiredAuth: expiredAuth.message,
    missingChallenge: missingChallenge.message,
    invalidChallenge: invalidChallenge.message,
    timeoutOrder: timeoutOrder.message,
    noFinalize: noFinalize.message,
    notRegistered: notRegistered.message,
  });
}
