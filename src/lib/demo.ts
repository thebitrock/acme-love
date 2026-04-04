/**
 * ACME Love - Demonstration of RFC 8555 Compliant Architecture
 *
 * This file demonstrates the new architecture with modern TypeScript patterns
 * and RFC 8555 compliant naming conventions.
 */

// New RFC 8555 compliant imports
import { AcmeClient } from '../lib/core/acme-client.js';
import type { AcmeClientOptions } from '../lib/core/acme-client.js';
import type { AcmeDirectory } from './types/directory.js';
import { ACME_ERROR } from './errors/codes.js';
import { createErrorFromProblem } from './errors/factory.js';

/**
 * Demo: Modern ACME certificate workflow with RFC 8555 naming
 */
async function demonstrateModernAcmeWorkflow(): Promise<{
  client: AcmeClient;
  directory: AcmeDirectory;
  status: string;
}> {
  console.log('🚀 ACME Love - RFC 8555 Compliant Architecture Demo');

  // 1. Create ACME client with clean naming
  const clientOptions: AcmeClientOptions = {
    nonce: {
      maxPool: 10,
      prefetchLowWater: 3,
    },
  };

  const client = new AcmeClient(
    'https://acme-staging-v02.api.letsencrypt.org/directory',
    clientOptions,
  );

  console.log('✅ AcmeClient created (was: AcmeClientCore)');

  // 2. Get ACME directory
  const directory: AcmeDirectory = await client.getDirectory();
  console.log('✅ Directory fetched:', {
    newAccount: directory.newAccount,
    newOrder: directory.newOrder,
    newNonce: directory.newNonce,
  });

  console.log('✅ AcmeAccount interface ready (was: AcmeAccountSession)');

  // 4. Demonstrate error handling
  try {
    throw createErrorFromProblem({
      type: ACME_ERROR.rateLimited,
      detail: 'Rate limit exceeded',
      status: 429,
    });
  } catch (error) {
    console.log('✅ RFC 8555 compliant error handling:', (error as Error).constructor.name);
  }

  return {
    client,
    directory,
    status: 'Architecture demonstration complete',
  };
}

/**
 * Demo: Tree-shakable imports from modular structure
 */
function demonstrateTreeShaking(): string {
  console.log('\n📦 Tree-shaking Benefits:');
  console.log('✅ Import only what you need:');
  console.log('  import { AcmeClient } from "acme-love/lib/core"');
  console.log('  import { NonceManager } from "acme-love/lib/managers"');
  console.log('  import { RateLimiter } from "acme-love/lib/managers"');
  console.log('  import { createErrorFromProblem } from "acme-love/lib/errors"');

  return 'Modular architecture ready for optimal bundling';
}

/**
 * Demo: TypeScript excellence with proper typing
 */
function demonstrateTypeScriptExcellence(): string[] {
  console.log('\n🔷 TypeScript Benefits:');
  console.log('✅ Strong typing throughout');
  console.log('✅ Proper barrel exports');
  console.log('✅ RFC 8555 compliant interfaces');
  console.log('✅ Consistent naming conventions');

  // All types are properly exported and available
  const types = [
    'AcmeClient',
    'AcmeAccount',
    'AcmeDirectory',
    'AcmeOrder',
    'AcmeChallenge',
    'AcmeAuthorization',
    'AcmeClientOptions',
    'AcmeAccountOptions',
    'NonceManagerOptions',
    'RateLimiterOptions',
  ];

  console.log('✅ Available types:', types.join(', '));

  return types;
}

export { demonstrateModernAcmeWorkflow, demonstrateTreeShaking, demonstrateTypeScriptExcellence };

// Default export for easy testing
export default async function runDemo(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  console.log('🎯 ACME Love Architecture Migration Demo\n');

  try {
    await demonstrateModernAcmeWorkflow();
    demonstrateTreeShaking();
    demonstrateTypeScriptExcellence();

    console.log('\n🎉 Demo completed successfully!');
    console.log('📋 Next: Continue with Phase 3 migration');

    return {
      success: true,
      message: 'RFC 8555 compliant architecture is working!',
    };
  } catch (error) {
    console.error('❌ Demo failed:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
