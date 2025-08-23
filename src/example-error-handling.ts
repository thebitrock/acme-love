/**
 * Example showing how to use ACME error classes and types
 */

import { ACMEClient, AcmeError, BadNonceError, ACME_ERROR_BAD_NONCE } from './index.js';

async function errorHandlingExample(): Promise<void> {
  try {
    // Some code that throws an ACME error
    const client = new ACMEClient('https://acme-v02.api.letsencrypt.org/directory');

    // This will likely fail with a BadNonceError or similar
    await client.createAccount(
      ['mailto:admin@example.org'],
      true, // termsOfServiceAgreed
    );
  } catch (error) {
    // Check if it's an ACME error
    if (error instanceof AcmeError) {
      console.error(`ACME Error: ${error.detail}`);
      console.error(`Type: ${error.type}`);

      // You can also check specific error types
      if (error instanceof BadNonceError) {
        console.error('Bad nonce error detected, retrying with a new nonce...');
        // Retry logic here
      }

      // Or check by error type string
      if (error.type === ACME_ERROR_BAD_NONCE) {
        console.error('Bad nonce error detected by type string');
      }

      // Check if there are subproblems
      if (error.subproblems && error.subproblems.length > 0) {
        console.error('Subproblems:');
        error.subproblems.forEach((subproblem, index) => {
          console.error(`  ${index + 1}: ${subproblem.detail}`);
        });
      }
    } else {
      // Not an ACME error
      console.error(`Unexpected error: ${error}`);
    }
  }
}

// Run the example
errorHandlingExample().catch(console.error);
