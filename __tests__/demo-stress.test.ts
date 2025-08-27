import { describe, test, expect, beforeAll } from '@jest/globals';
import { AcmeClientCore } from '../src/acme/client/acme-client-core.js';
import { AcmeAccountSession } from '../src/acme/client/acme-account-session.js';
import { generateKeyPair } from '../src/acme/csr.js';
import type { CsrAlgo } from '../src/acme/csr.js';

// Endpoint tracking for demo stress test
const endpointStats = new Map<string, number>();

function extractEndpoint(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname;
    
    // Let's Encrypt specific endpoints
    if (path.includes('/acme/new-nonce')) return 'Let\'s Encrypt: new-nonce';
    if (path.includes('/acme/new-acct')) return 'Let\'s Encrypt: new-account';
    if (path.includes('/acme/new-order')) return 'Let\'s Encrypt: new-order';
    if (path.includes('/acme/authz/')) return 'Let\'s Encrypt: authorization';
    if (path.includes('/acme/order/')) return 'Let\'s Encrypt: order';
    if (path.includes('/acme/chall/')) return 'Let\'s Encrypt: challenge';
    if (path.includes('/acme/cert/')) return 'Let\'s Encrypt: certificate';
    if (path.includes('/directory')) return 'Let\'s Encrypt: directory';
    
    // Fallback to generic path
    return `Generic: ${path}`;
  } catch (error) {
    return `Invalid URL: ${url}`;
  }
}

function trackEndpoint(url: string): void {
  const endpoint = extractEndpoint(url);
  endpointStats.set(endpoint, (endpointStats.get(endpoint) || 0) + 1);
}

// Monkey patch for tracking
const originalFetch = global.fetch;
global.fetch = async (input: any, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  trackEndpoint(url);
  return originalFetch(input, init);
};

// Mini stress test for demonstration (2 accounts × 5 orders each)
describe('ACME Mini Stress Test - Demo', () => {
  const STAGING_DIRECTORY_URL = 'https://acme-staging-v02.api.letsencrypt.org/directory';
  const ORDERS_PER_ACCOUNT = 5;
  const TOTAL_ACCOUNTS = 2;
  
  beforeAll(async () => {
    // Skip in CI unless explicitly enabled
    if (process.env.CI && !process.env.ACME_DEMO_STRESS_ENABLED) {
      console.log('⚠️  Skipping demo stress test in CI environment');
      console.log('   Set ACME_DEMO_STRESS_ENABLED=1 to run demo stress test in CI');
      return;
    }

    console.log(`🚀 Starting ACME Demo Stress Test`);
    console.log(`   Accounts: ${TOTAL_ACCOUNTS}`);
    console.log(`   Orders per account: ${ORDERS_PER_ACCOUNT}`);
    console.log(`   Total orders: ${TOTAL_ACCOUNTS * ORDERS_PER_ACCOUNT}`);
  });

  test('should demonstrate concurrent account and order creation', async () => {
    if (process.env.CI && !process.env.ACME_DEMO_STRESS_ENABLED) {
      return;
    }

    const startTime = Date.now();
    console.log(`⏱️  Starting demo at ${new Date().toISOString()}`);

    try {
      // Create algorithm for account keys
      const accountAlgo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };

      // Phase 1: Create accounts concurrently
      console.log(`👥 Creating ${TOTAL_ACCOUNTS} accounts...`);
      const accountCreationStart = Date.now();

      const accountPromises = Array.from({ length: TOTAL_ACCOUNTS }, async (_, accountIndex) => {
        const keyPair = await generateKeyPair(accountAlgo);
        const accountKeys = {
          privateKey: keyPair.privateKey!,
          publicKey: keyPair.publicKey
        };

        const core = new AcmeClientCore(STAGING_DIRECTORY_URL, {
          nonce: { maxPool: 32 }
        });

        const acct = new AcmeAccountSession(core, accountKeys);

        await acct.ensureRegistered({
          contact: [`mailto:demo-stress-test-${accountIndex}-${Date.now()}@gmail.com`],
          termsOfServiceAgreed: true
        });

        console.log(`   ✅ Account ${accountIndex + 1}/${TOTAL_ACCOUNTS} created`);
        return { accountIndex, acct };
      });

      const accounts = await Promise.all(accountPromises);
      const accountCreationTime = Date.now() - accountCreationStart;
      console.log(`   🎯 All ${TOTAL_ACCOUNTS} accounts created in ${accountCreationTime}ms`);

      // Phase 2: Create orders concurrently
      console.log(`📦 Creating ${ORDERS_PER_ACCOUNT} orders per account...`);
      const orderCreationStart = Date.now();

      const allOrderPromises = accounts.flatMap(({ accountIndex, acct }) => {
        return Array.from({ length: ORDERS_PER_ACCOUNT }, async (_, orderIndex) => {
          const randomString = Math.random().toString(36).substring(2, 10).toLowerCase();
          const domain = `${randomString}-acme-love.com`;

          try {
            const order = await acct.newOrder([domain]);
            const authz = await acct.fetch<any>(order.authorizations[0]);
            const httpChallenge = authz.challenges.find((c: any) => c.type === 'http-01');
            
            if (httpChallenge) {
              const keyAuth = await acct.keyAuthorization(httpChallenge.token);
              console.log(`     📊 Account ${accountIndex + 1}, Order ${orderIndex + 1}: ${domain} (HTTP-01)`);
              return {
                accountIndex,
                orderIndex,
                domain,
                order,
                challenge: httpChallenge,
                keyAuth
              };
            }
            
            throw new Error('No HTTP-01 challenge found');
          } catch (error) {
            console.error(`     ❌ Failed order ${orderIndex + 1} for account ${accountIndex + 1}: ${error}`);
            throw error;
          }
        });
      });

      const allOrders = await Promise.all(allOrderPromises);
      const orderCreationTime = Date.now() - orderCreationStart;
      const totalTime = Date.now() - startTime;

      console.log(`   🎯 All ${allOrders.length} orders created in ${orderCreationTime}ms`);
      console.log(`\n📊 DEMO SUMMARY`);
      console.log(`===============`);
      console.log(`Total Time: ${totalTime}ms`);
      console.log(`Accounts Created: ${TOTAL_ACCOUNTS} in ${accountCreationTime}ms`);
      console.log(`Orders Created: ${allOrders.length} in ${orderCreationTime}ms`);
      console.log(`Average Time per Account: ${Math.round(accountCreationTime / TOTAL_ACCOUNTS)}ms`);
      console.log(`Average Time per Order: ${Math.round(orderCreationTime / allOrders.length)}ms`);

      // Endpoint statistics
      console.log(`\n🌐 ENDPOINT STATISTICS`);
      console.log(`=====================`);
      const sortedStats = Array.from(endpointStats.entries()).sort((a, b) => b[1] - a[1]);
      let totalRequests = 0;
      for (const [endpoint, count] of sortedStats) {
        console.log(`${endpoint}: ${count} requests`);
        totalRequests += count;
      }
      console.log(`Total HTTP Requests: ${totalRequests}`);

      // Let's Encrypt specific breakdown
      console.log(`\n🔒 Let's Encrypt Staging API Breakdown`);
      console.log(`======================================`);
      const letsEncryptStats = sortedStats.filter(([endpoint]) => endpoint.startsWith('Let\'s Encrypt'));
      let letsEncryptTotal = 0;
      for (const [endpoint, count] of letsEncryptStats) {
        console.log(`${endpoint}: ${count} requests`);
        letsEncryptTotal += count;
      }
      console.log(`Let's Encrypt Total: ${letsEncryptTotal} requests (${((letsEncryptTotal / totalRequests) * 100).toFixed(1)}% of all requests)`);

      // Cleanup
      global.fetch = originalFetch;

      // Assertions
      expect(allOrders.length).toBe(TOTAL_ACCOUNTS * ORDERS_PER_ACCOUNT);
      expect(totalTime).toBeLessThan(60000); // Less than 1 minute
      
    } catch (error) {
      console.error(`💥 Demo failed:`, error);
      throw error;
    }
  }, 120000); // 2 minute timeout
});
