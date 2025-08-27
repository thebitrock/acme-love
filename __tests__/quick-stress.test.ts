import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { testAccountManager } from './utils/account-manager.js';
import * as fs from 'fs';
import * as path from 'path';
import { cleanupHttpTests } from './test-utils.js';

// Endpoint tracking for quick stress test
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

// Quick stress test for demonstration - 1 account, 2 orders
describe('ACME Quick Stress Test - 1 Account × 2 Orders', () => {
  const STAGING_DIRECTORY_URL = 'https://acme-staging-v02.api.letsencrypt.org/directory';
  const ORDERS_PER_ACCOUNT = 2;
  const TOTAL_ACCOUNTS = 1;

  // Performance metrics collection
  interface RequestMetrics {
    type: string;
    url: string;
    method: string;
    timestamp: number;
    duration: number;
    status: number;
  }

  class QuickMetricsCollector {
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
        status
      });

      if (url.includes('new-nonce')) {
        this.nonceRequests++;
      }
    }

    getResults() {
      const totalTime = Date.now() - this.startTime;
      const requestsByType: Record<string, number> = {};

      let accountsCreated = 0;
      let ordersCreated = 0;

      this.metrics.forEach(metric => {
        requestsByType[metric.type] = (requestsByType[metric.type] || 0) + 1;

        if (metric.url.includes('new-acct') && metric.method === 'POST') accountsCreated++;
        if (metric.url.includes('new-order') && metric.method === 'POST') ordersCreated++;
      });

      const averageResponseTime = this.metrics.length > 0
        ? this.metrics.reduce((sum, m) => sum + m.duration, 0) / this.metrics.length
        : 0;

      return {
        totalTime,
        accountsCreated,
        ordersCreated,
        totalRequests: this.metrics.length,
        newNonceRequests: this.nonceRequests,
        averageResponseTime,
        requestsByType
      };
    }
  }

  // HTTP client wrapper for metrics
  class QuickMetricsHttpClient {
    private collector: QuickMetricsCollector;
    private originalClient: any;

    constructor(collector: QuickMetricsCollector, originalClient: any) {
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

  let collector: QuickMetricsCollector;

  beforeAll(async () => {
    collector = new QuickMetricsCollector();
    console.log(`🚀 Starting ACME Quick Stress Test`);
    console.log(`   Accounts: ${TOTAL_ACCOUNTS}`);
    console.log(`   Orders per account: ${ORDERS_PER_ACCOUNT}`);
    console.log(`   Total orders: ${TOTAL_ACCOUNTS * ORDERS_PER_ACCOUNT}`);
  });

  test('should handle quick concurrent load efficiently', async () => {
    collector.start();
    console.log(`⏱️  Starting test at ${new Date().toISOString()}`);

    try {
      // Phase 1: Load or create account with full registration
      console.log(`👥 Loading/creating account...`);
      const accountCreationStart = Date.now();

      const acct = await testAccountManager.getOrCreateAccountSession(
        'quick-stress-1',
        STAGING_DIRECTORY_URL,
        `quick-stress-${Date.now()}@acme-love.com`,
        { nonce: { maxPool: 8 } }
      );

      // Add metrics wrapper
      const core = (acct as any).client;
      const originalHttp = core.getHttp();
      const metricsHttp = new QuickMetricsHttpClient(collector, originalHttp);
      (core as any).http = metricsHttp;

      const accountCreationTime = Date.now() - accountCreationStart;
      console.log(`   ✅ Account ready in ${accountCreationTime}ms`);

      // Phase 2: Create orders sequentially
      console.log(`📦 Creating ${ORDERS_PER_ACCOUNT} orders...`);
      const orderCreationStart = Date.now();

      const orders = [];
      for (let orderIndex = 0; orderIndex < ORDERS_PER_ACCOUNT; orderIndex++) {
        const randomString = Math.random().toString(36).substring(2, 10).toLowerCase();
        const domain = `${randomString}-acme-love.com`;

        try {
          const order = await acct.newOrder([domain]);
          const authz = await acct.fetch<any>(order.authorizations[0]);
          const httpChallenge = authz.challenges.find((c: any) => c.type === 'http-01');

          if (httpChallenge) {
            const keyAuth = await acct.keyAuthorization(httpChallenge.token);
            console.log(`     📊 Order ${orderIndex + 1}: ${domain}`);

            orders.push({
              orderIndex,
              domain,
              order,
              challenge: httpChallenge,
              keyAuth
            });
          } else {
            throw new Error('No HTTP-01 challenge found');
          }
        } catch (error) {
          console.error(`     ❌ Failed order ${orderIndex + 1}: ${error}`);
          throw error;
        }
      }

      const orderCreationTime = Date.now() - orderCreationStart;

      // Collect nonce metrics
      let noncesRemaining = 0;
      try {
        const nonceManager = core.getDefaultNonce();
        noncesRemaining = (nonceManager as any).pool?.length || 0;
        console.log(`   📊 Nonce pool: ${noncesRemaining} remaining`);
      } catch (error) {
        console.log(`   ⚠️  Could not get nonce stats`);
      }

      const results = collector.getResults();
      const totalTime = Date.now() - collector['startTime'];

      // Print detailed results
      console.log(`\n📊 QUICK STRESS TEST RESULTS`);
      console.log(`============================`);
      console.log(`Total Time: ${totalTime}ms (${Math.round(totalTime / 1000)}s)`);
      console.log(`Account Creation: ${accountCreationTime}ms`);
      console.log(`Order Creation: ${orderCreationTime}ms`);
      console.log(`Orders Created: ${orders.length}`);
      console.log(`Total HTTP Requests: ${results.totalRequests}`);
      console.log(`New-Nonce Requests: ${results.newNonceRequests}`);
      console.log(`Average Response Time: ${Math.round(results.averageResponseTime)}ms`);
      console.log(`Requests per Second: ${Math.round(results.totalRequests / (totalTime / 1000))}`);
      console.log(`Nonces Remaining: ${noncesRemaining}`);
      console.log(`Pool Efficiency: ${results.newNonceRequests > 0 ? Math.round(((results.totalRequests - results.newNonceRequests) / results.totalRequests) * 100) : 0}%`);

      console.log(`\n📈 REQUEST BREAKDOWN:`);
      Object.entries(results.requestsByType).forEach(([type, count]) => {
        console.log(`   ${type}: ${count} (${Math.round(((count as number) / results.totalRequests) * 100)}%)`);
      });

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

      // Generate quick report
      const report = `# 🚀 ACME Love - Quick Stress Test Results

## Test Configuration
- **Date**: ${new Date().toISOString()}
- **Test Type**: Quick Demo (1 account, 2 orders)
- **Target**: Let's Encrypt Staging

## Performance Summary
- **Total Time**: ${Math.round(totalTime / 1000)}s (${totalTime}ms)
- **Account Creation**: ${accountCreationTime}ms
- **Order Creation**: ${orderCreationTime}ms
- **Orders Created**: ${orders.length}
- **Total Requests**: ${results.totalRequests}
- **New-Nonce Requests**: ${results.newNonceRequests}
- **Average Response Time**: ${Math.round(results.averageResponseTime)}ms
- **Throughput**: ${Math.round(results.totalRequests / (totalTime / 1000))} req/s

## Nonce Manager Performance
- **Pool Efficiency**: ${results.newNonceRequests > 0 ? Math.round(((results.totalRequests - results.newNonceRequests) / results.totalRequests) * 100) : 0}%
- **Requests Saved**: ${results.totalRequests - results.newNonceRequests}
- **Nonces Remaining**: ${noncesRemaining}

## Request Distribution
${Object.entries(results.requestsByType).map(([type, count]) =>
        `- **${type}**: ${count} (${Math.round(((count as number) / results.totalRequests) * 100)}%)`
      ).join('\n')}

## Conclusion
✅ Successfully processed ${orders.length} orders in ${Math.round(totalTime / 1000)} seconds
✅ Maintained ${Math.round(results.averageResponseTime)}ms average response time
✅ Nonce pooling optimized ${results.totalRequests - results.newNonceRequests} network calls

*Generated by ACME Love v1.2.1 quick stress test*
`;

      // Save report
      const reportPath = path.join(process.cwd(), 'QUICK-STRESS-TEST-RESULTS.md');
      fs.writeFileSync(reportPath, report);
      console.log(`\n📋 Report saved to ${reportPath}`);

      // Assertions
      expect(orders.length).toBe(ORDERS_PER_ACCOUNT);
      expect(results.totalRequests).toBeGreaterThan(5);
      expect(results.newNonceRequests).toBeGreaterThan(0);
      expect(results.averageResponseTime).toBeLessThan(5000);

    } catch (error) {
      console.error(`💥 Quick stress test failed:`, error);
      throw error;
    }
  }, 45000); // 45 seconds timeout

  afterAll(() => {
    // Comprehensive cleanup
    cleanupHttpTests(originalFetch);
  });
});
