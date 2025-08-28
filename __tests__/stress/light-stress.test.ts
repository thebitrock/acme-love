import { describe, test, expect, beforeAll } from '@jest/globals';
import { testAccountManager } from '../utils/account-manager.js';
import * as fs from 'fs';
import * as path from 'path';

// Endpoint tracking for light stress test
const endpointStats = new Map<string, number>();

function extractEndpoint(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname;

    // Let's Encrypt specific endpoints
    if (path.includes('/acme/new-nonce')) return "Let's Encrypt: new-nonce";
    if (path.includes('/acme/new-acct')) return "Let's Encrypt: new-account";
    if (path.includes('/acme/new-order')) return "Let's Encrypt: new-order";
    if (path.includes('/acme/authz/')) return "Let's Encrypt: authorization";
    if (path.includes('/acme/order/')) return "Let's Encrypt: order";
    if (path.includes('/acme/chall/')) return "Let's Encrypt: challenge";
    if (path.includes('/acme/cert/')) return "Let's Encrypt: certificate";
    if (path.includes('/directory')) return "Let's Encrypt: directory";

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
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  trackEndpoint(url);
  return originalFetch(input, init);
};

// Lightweight stress test for quick demonstration
describe('ACME Lightweight Stress Test - 2 Accounts × 3 Orders', () => {
  const STAGING_DIRECTORY_URL = 'https://acme-staging-v02.api.letsencrypt.org/directory';
  const ORDERS_PER_ACCOUNT = 3;
  const TOTAL_ACCOUNTS = 2;

  // Performance metrics collection
  interface RequestMetrics {
    type: string;
    url: string;
    method: string;
    timestamp: number;
    duration: number;
    status: number;
  }

  class LightMetricsCollector {
    private metrics: RequestMetrics[] = [];
    private startTime: number = 0;
    private nonceRequests: number = 0;

    start() {
      this.startTime = Date.now();
      this.metrics = [];
      this.nonceRequests = 0;
    }

    addRequest(type: string, url: string, method: string, duration: number, status: number) {
      this.metrics.push({
        type,
        url,
        method,
        timestamp: Date.now() - this.startTime,
        duration,
        status,
      });

      if (url.includes('new-nonce')) {
        this.nonceRequests++;
      }
    }

    getResults() {
      const totalTime = Date.now() - this.startTime;
      const requestsByType: Record<string, number> = {};
      const requestsByEndpoint: Record<string, number> = {};

      let accountsCreated = 0;
      let ordersCreated = 0;

      this.metrics.forEach((metric) => {
        requestsByType[metric.type] = (requestsByType[metric.type] || 0) + 1;

        const endpoint = this.extractEndpoint(metric.url);
        requestsByEndpoint[endpoint] = (requestsByEndpoint[endpoint] || 0) + 1;

        if (metric.url.includes('new-acct') && metric.method === 'POST') accountsCreated++;
        if (metric.url.includes('new-order') && metric.method === 'POST') ordersCreated++;
      });

      const averageResponseTime =
        this.metrics.length > 0
          ? this.metrics.reduce((sum, m) => sum + m.duration, 0) / this.metrics.length
          : 0;

      return {
        totalTime,
        accountsCreated,
        ordersCreated,
        totalRequests: this.metrics.length,
        newNonceRequests: this.nonceRequests,
        averageResponseTime,
        requestsByType,
        requestsByEndpoint,
        metrics: this.metrics,
      };
    }

    private extractEndpoint(url: string): string {
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        return pathParts[pathParts.length - 1] || 'unknown';
      } catch {
        return 'unknown';
      }
    }
  }

  // HTTP client wrapper for metrics
  class LightMetricsHttpClient {
    private collector: LightMetricsCollector;
    private originalClient: any;

    constructor(collector: LightMetricsCollector, originalClient: any) {
      this.collector = collector;
      this.originalClient = originalClient;
    }

    async get(url: string, headers: Record<string, string> = {}): Promise<any> {
      const start = Date.now();
      trackEndpoint(url); // Track endpoint for detailed statistics
      try {
        const result = await this.originalClient.get(url, headers);
        const duration = Date.now() - start;
        this.collector.addRequest('GET', url, 'GET', duration, result.status);
        return result;
      } catch (error: any) {
        const duration = Date.now() - start;
        this.collector.addRequest('GET', url, 'GET', duration, error.status || 500);
        throw error;
      }
    }

    async post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<any> {
      const start = Date.now();
      trackEndpoint(url); // Track endpoint for detailed statistics
      try {
        const result = await this.originalClient.post(url, body, headers);
        const duration = Date.now() - start;
        this.collector.addRequest('POST', url, 'POST', duration, result.status);
        return result;
      } catch (error: any) {
        const duration = Date.now() - start;
        this.collector.addRequest('POST', url, 'POST', duration, error.status || 500);
        throw error;
      }
    }

    async head(url: string, headers: Record<string, string> = {}): Promise<any> {
      const start = Date.now();
      trackEndpoint(url); // Track endpoint for detailed statistics
      try {
        const result = await this.originalClient.head(url, headers);
        const duration = Date.now() - start;
        this.collector.addRequest('HEAD', url, 'HEAD', duration, result.status);
        return result;
      } catch (error: any) {
        const duration = Date.now() - start;
        this.collector.addRequest('HEAD', url, 'HEAD', duration, error.status || 500);
        throw error;
      }
    }
  }

  let collector: LightMetricsCollector;

  beforeAll(async () => {
    if (process.env.CI && !process.env.ACME_LIGHT_STRESS_ENABLED) {
      console.log('⚠️  Skipping light stress test in CI environment');
      console.log('   Set ACME_LIGHT_STRESS_ENABLED=1 to run light stress test in CI');
      return;
    }

    collector = new LightMetricsCollector();
    console.log(`🚀 Starting ACME Lightweight Stress Test`);
    console.log(`   Accounts: ${TOTAL_ACCOUNTS}`);
    console.log(`   Orders per account: ${ORDERS_PER_ACCOUNT}`);
    console.log(`   Total orders: ${TOTAL_ACCOUNTS * ORDERS_PER_ACCOUNT}`);
  });

  test('should handle lightweight concurrent load efficiently', async () => {
    if (process.env.CI && !process.env.ACME_LIGHT_STRESS_ENABLED) {
      return;
    }

    collector.start();
    console.log(`⏱️  Starting test at ${new Date().toISOString()}`);

    try {
      // Phase 1: Load or create accounts
      console.log(`👥 Loading/creating ${TOTAL_ACCOUNTS} accounts...`);
      const accountCreationStart = Date.now();

      const accountPromises = Array.from({ length: TOTAL_ACCOUNTS }, async (_, accountIndex) => {
        // Get or create persistent account session (with registration)
        const acct = await testAccountManager.getOrCreateAccountSession(
          `light-stress-${accountIndex + 1}`,
          STAGING_DIRECTORY_URL,
          `light-test-${accountIndex}-${Date.now()}@acme-love.com`,
          { nonce: { maxPool: 16 } },
        );

        // Add metrics wrapper to the existing core
        const core = (acct as any).client;
        const originalHttp = core.getHttp();
        const metricsHttp = new LightMetricsHttpClient(collector, originalHttp);
        (core as any).http = metricsHttp;

        console.log(`   ✅ Account ${accountIndex + 1}/${TOTAL_ACCOUNTS} ready`);
        return { accountIndex, acct, core };
      });

      const accounts = await Promise.all(accountPromises);
      const accountCreationTime = Date.now() - accountCreationStart;
      console.log(`   🎯 All ${TOTAL_ACCOUNTS} accounts created in ${accountCreationTime}ms`);

      // Phase 2: Create orders
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
              console.log(
                `     📊 Account ${accountIndex + 1}, Order ${orderIndex + 1}: ${domain}`,
              );

              return {
                accountIndex,
                orderIndex,
                domain,
                order,
                challenge: httpChallenge,
                keyAuth,
              };
            }

            throw new Error('No HTTP-01 challenge found');
          } catch (error) {
            console.error(
              `     ❌ Failed order ${orderIndex + 1} for account ${accountIndex + 1}: ${error}`,
            );
            throw error;
          }
        });
      });

      const allOrders = await Promise.all(allOrderPromises);
      const orderCreationTime = Date.now() - orderCreationStart;

      // Collect nonce metrics
      let totalNoncesRemaining = 0;
      accounts.forEach(({ accountIndex, core }) => {
        try {
          const nonceManager = core.getDefaultNonce();
          const poolSize = (nonceManager as any).pool?.length || 0;
          totalNoncesRemaining += poolSize;
          console.log(`   📊 Account ${accountIndex + 1} nonce pool: ${poolSize} remaining`);
        } catch (error) {
          console.log(`   ⚠️  Could not get nonce stats for account ${accountIndex + 1}`);
        }
      });

      const results = collector.getResults();
      const totalTime = Date.now() - collector['startTime'];

      // Print detailed results
      console.log(`\n📊 LIGHTWEIGHT STRESS TEST RESULTS`);
      console.log(`====================================`);
      console.log(`Total Time: ${totalTime}ms (${Math.round(totalTime / 1000)}s)`);
      console.log(`Account Creation: ${accountCreationTime}ms`);
      console.log(`Order Creation: ${orderCreationTime}ms`);
      console.log(`Accounts Created: ${TOTAL_ACCOUNTS}`);
      console.log(`Orders Created: ${allOrders.length}`);
      console.log(`Total HTTP Requests: ${results.totalRequests}`);
      console.log(`New-Nonce Requests: ${results.newNonceRequests}`);
      console.log(`Average Response Time: ${Math.round(results.averageResponseTime)}ms`);
      console.log(`Requests per Second: ${Math.round(results.totalRequests / (totalTime / 1000))}`);
      console.log(`Nonces Remaining in Pools: ${totalNoncesRemaining}`);

      console.log(`\n📈 REQUEST BREAKDOWN:`);
      Object.entries(results.requestsByType).forEach(([type, count]) => {
        console.log(
          `   ${type}: ${count} (${Math.round(((count as number) / results.totalRequests) * 100)}%)`,
        );
      });

      console.log(`\n🔗 ENDPOINT BREAKDOWN:`);
      Object.entries(results.requestsByEndpoint).forEach(([endpoint, count]) => {
        console.log(`   ${endpoint}: ${count}`);
      });

      // Detailed endpoint statistics
      console.log(`\n🌐 DETAILED ENDPOINT STATISTICS`);
      console.log(`==============================`);
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
      const letsEncryptStats = sortedStats.filter(([endpoint]) =>
        endpoint.startsWith("Let's Encrypt"),
      );
      let letsEncryptTotal = 0;
      for (const [endpoint, count] of letsEncryptStats) {
        console.log(`${endpoint}: ${count} requests`);
        letsEncryptTotal += count;
      }
      console.log(
        `Let's Encrypt Total: ${letsEncryptTotal} requests (${((letsEncryptTotal / totalRequests) * 100).toFixed(1)}% of all requests)`,
      );

      // Cleanup
      global.fetch = originalFetch;

      // Generate summary report
      const report = `# 🚀 ACME Love - Lightweight Stress Test Results

## Test Configuration
- **Date**: ${new Date().toISOString()}
- **Accounts**: ${TOTAL_ACCOUNTS}
- **Orders per Account**: ${ORDERS_PER_ACCOUNT}
- **Total Orders**: ${allOrders.length}
- **Target**: Let's Encrypt Staging

## Performance Summary
- **Total Time**: ${Math.round(totalTime / 1000)}s (${totalTime}ms)
- **Account Creation**: ${accountCreationTime}ms
- **Order Creation**: ${orderCreationTime}ms
- **Total Requests**: ${results.totalRequests}
- **New-Nonce Requests**: ${results.newNonceRequests}
- **Average Response Time**: ${Math.round(results.averageResponseTime)}ms
- **Throughput**: ${Math.round(results.totalRequests / (totalTime / 1000))} req/s

## Nonce Manager Metrics
- **Nonces Remaining**: ${totalNoncesRemaining}
- **Network Optimization**: ${results.totalRequests - results.newNonceRequests} requests saved from pooling
- **Pool Efficiency**: ${results.newNonceRequests > 0 ? Math.round(((results.totalRequests - results.newNonceRequests) / results.totalRequests) * 100) : 0}%

## Request Distribution
${Object.entries(results.requestsByType)
  .map(
    ([type, count]) =>
      `- **${type}**: ${count} (${Math.round(((count as number) / results.totalRequests) * 100)}%)`,
  )
  .join('\n')}

## Conclusion
✅ Successfully processed ${allOrders.length} orders across ${TOTAL_ACCOUNTS} accounts
✅ Maintained ${Math.round(results.averageResponseTime)}ms average response time
✅ Achieved ${Math.round(results.totalRequests / (totalTime / 1000))} requests/second throughput
✅ Nonce pooling saved ${results.totalRequests - results.newNonceRequests} network requests

*Generated by ACME Love v1.2.1 lightweight stress test*
`;

      // Save report
      const reportPath = path.join(process.cwd(), 'docs/reports/LIGHT-STRESS-TEST-RESULTS.md');
      fs.writeFileSync(reportPath, report);
      console.log(`\n📋 Report saved to ${reportPath}`);

      // Assertions
      expect(allOrders.length).toBe(TOTAL_ACCOUNTS * ORDERS_PER_ACCOUNT);
      expect(results.totalRequests).toBeGreaterThan(0);
      expect(results.newNonceRequests).toBeGreaterThan(0);
      expect(results.averageResponseTime).toBeLessThan(3000);
    } catch (error) {
      console.error(`💥 Light stress test failed:`, error);
      throw error;
    }
  }, 60000); // 1 minute timeout
});
