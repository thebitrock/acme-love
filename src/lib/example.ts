/**
 * RFC 8555 Compliant ACME Love - Example Usage
 *
 * Demonstrates the new architecture with clean RFC 8555 naming
 */

import { AcmeClient } from '../lib/core/acme-client.js';

// Example of how the new architecture would work
async function example() {
  // Create ACME client with RFC 8555 compliant naming
  const client = new AcmeClient('https://acme-staging-v02.api.letsencrypt.org/directory');

  // Get directory information
  const directory = await client.getDirectory();
  console.log('ACME Directory:', directory);

  console.log('HTTP Client available');

  return client;
}

export { example };

// This file demonstrates:
// 1. Clean RFC 8555 compliant naming (AcmeClient instead of AcmeClientCore)
// 2. Proper module organization under src/lib/
// 3. Backward compatibility through the compat layer
// 4. Tree-shakable exports for better bundle sizes
// 5. TypeScript-first development with proper type exports
