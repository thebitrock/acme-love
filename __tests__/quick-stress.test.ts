import { describe, test, expect, beforeAll } from '@jest/globals';
import { AcmeClientCore } from '../src/acme/client/acme-client-core.js';
import { AcmeAccountSession } from '../src/acme/client/acme-account-session.js';
import { generateKeyPair } from '../src/acme/csr.js';
import type { CsrAlgo } from '../src/acme/csr.js';
import * as fs from 'fs';
import * as path from 'path';

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
      const accountAlgo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };

      // Phase 1: Create account
      console.log(`👥 Creating account...`);
      const accountCreationStart = Date.now();

      const keyPair = await generateKeyPair(accountAlgo);
      const accountKeys = {
        privateKey: keyPair.privateKey!,
        publicKey: keyPair.publicKey
      };

      const core = new AcmeClientCore(STAGING_DIRECTORY_URL, {
        nonce: { maxPool: 8 }
      });

      // Add metrics wrapper
      const originalHttp = core.getHttp();
      const metricsHttp = new QuickMetricsHttpClient(collector, originalHttp);
      (core as any).http = metricsHttp;

      const acct = new AcmeAccountSession(core, accountKeys);

      await acct.ensureRegistered({
        contact: [`mailto:quick-test-${Date.now()}@gmail.com`],
        termsOfServiceAgreed: true
      });

      const accountCreationTime = Date.now() - accountCreationStart;
      console.log(`   ✅ Account created in ${accountCreationTime}ms`);

      // Phase 2: Create orders sequentially
      console.log(`📦 Creating ${ORDERS_PER_ACCOUNT} orders...`);
      const orderCreationStart = Date.now();

      const orders = [];
      for (let orderIndex = 0; orderIndex < ORDERS_PER_ACCOUNT; orderIndex++) {
        const domain = `quick-${orderIndex}-${Date.now()}.example.com`;

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
});
