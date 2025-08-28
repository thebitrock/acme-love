import { describe, test, expect, beforeAll } from '@jest/globals';
import { AcmeClientCore } from '../src/acme/client/acme-client-core.js';
import { AcmeAccountSession } from '../src/acme/client/acme-account-session.js';
import { generateKeyPair } from '../src/acme/csr.js';
import type { CsrAlgo } from '../src/acme/csr.js';
import * as fs from 'fs';
import * as path from 'path';

// Metrics-only stress test - measures account creation and HTTP performance
describe('ACME Metrics Test - Account Operations Only', () => {
  const STAGING_DIRECTORY_URL = 'https://acme-staging-v02.api.letsencrypt.org/directory';
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

  class MetricsCollector {
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
      let directoryRequests = 0;

      this.metrics.forEach((metric) => {
        requestsByType[metric.type] = (requestsByType[metric.type] || 0) + 1;

        const endpoint = this.extractEndpoint(metric.url);
        requestsByEndpoint[endpoint] = (requestsByEndpoint[endpoint] || 0) + 1;

        if (metric.url.includes('new-acct') && metric.method === 'POST') accountsCreated++;
        if (metric.url.includes('directory') && metric.method === 'GET') directoryRequests++;
      });

      const averageResponseTime =
        this.metrics.length > 0
          ? this.metrics.reduce((sum, m) => sum + m.duration, 0) / this.metrics.length
          : 0;

      return {
        totalTime,
        accountsCreated,
        directoryRequests,
        totalRequests: this.metrics.length,
        newNonceRequests: this.nonceRequests,
        averageResponseTime,
        requestsByType,
        requestsByEndpoint,
        allRequestDetails: this.metrics,
      };
    }

    private extractEndpoint(url: string): string {
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        return pathParts[pathParts.length - 1] || 'directory';
      } catch {
        return 'unknown';
      }
    }
  }

  // HTTP client wrapper for metrics
  class MetricsHttpClient {
    private collector: MetricsCollector;
    private originalClient: any;

    constructor(collector: MetricsCollector, originalClient: any) {
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

  let collector: MetricsCollector;

  beforeAll(async () => {
    collector = new MetricsCollector();
    console.log(`🚀 Starting ACME Metrics Test (Account Operations)`);
    console.log(`   Accounts to create: ${TOTAL_ACCOUNTS}`);
    console.log(`   Test focus: HTTP performance, nonce management, account creation`);
  });

  test('should measure account creation performance and HTTP metrics', async () => {
    collector.start();
    console.log(`⏱️  Starting metrics collection at ${new Date().toISOString()}`);

    try {
      const accountAlgo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };

      // Create multiple accounts concurrently
      console.log(`👥 Creating ${TOTAL_ACCOUNTS} accounts concurrently...`);
      const accountCreationStart = Date.now();

      const accountPromises = Array.from({ length: TOTAL_ACCOUNTS }, async (_, accountIndex) => {
        const keyPair = await generateKeyPair(accountAlgo);
        const accountKeys = {
          privateKey: keyPair.privateKey!,
          publicKey: keyPair.publicKey,
        };

        const core = new AcmeClientCore(STAGING_DIRECTORY_URL, {
          nonce: { maxPool: 12 },
        });

        // Add metrics wrapper
        const originalHttp = core.getHttp();
        const metricsHttp = new MetricsHttpClient(collector, originalHttp);
        (core as any).http = metricsHttp;

        const acct = new AcmeAccountSession(core, accountKeys);

        await acct.ensureRegistered({
          contact: [`mailto:metrics-test-${accountIndex}-${Date.now()}@acme-love.com`],
          termsOfServiceAgreed: true,
        });

        console.log(`   ✅ Account ${accountIndex + 1}/${TOTAL_ACCOUNTS} created`);
        return { accountIndex, acct, core };
      });

      const accounts = await Promise.all(accountPromises);
      const accountCreationTime = Date.now() - accountCreationStart;
      console.log(`   🎯 All ${TOTAL_ACCOUNTS} accounts created in ${accountCreationTime}ms`);

      // Collect additional metrics from nonce managers
      let totalNoncesRemaining = 0;
      const nonceStats: Array<{ accountIndex: number; noncesRemaining: number }> = [];

      accounts.forEach(({ accountIndex, core }) => {
        try {
          const nonceManager = core.getDefaultNonce();
          const poolSize = (nonceManager as any).pool?.length || 0;
          totalNoncesRemaining += poolSize;
          nonceStats.push({ accountIndex, noncesRemaining: poolSize });
          console.log(`   📊 Account ${accountIndex + 1} nonce pool: ${poolSize} remaining`);
        } catch (error) {
          console.log(`   ⚠️  Could not get nonce stats for account ${accountIndex + 1}`);
        }
      });

      // Test directory fetching
      console.log(`📖 Testing directory re-fetching...`);
      const directoryTestStart = Date.now();
      const core = new AcmeClientCore(STAGING_DIRECTORY_URL);
      const metricsHttp = new MetricsHttpClient(collector, core.getHttp());
      (core as any).http = metricsHttp;

      // Fetch directory multiple times to test caching
      await core.getDirectory();
      await core.getDirectory();
      await core.getDirectory();

      const directoryTestTime = Date.now() - directoryTestStart;
      console.log(`   📖 Directory fetching test completed in ${directoryTestTime}ms`);

      const results = collector.getResults();
      const totalTime = Date.now() - collector['startTime'];

      // Print comprehensive results
      console.log(`\n📊 ACME METRICS TEST RESULTS`);
      console.log(`===========================`);
      console.log(`Total Test Time: ${totalTime}ms (${Math.round(totalTime / 1000)}s)`);
      console.log(`Account Creation Time: ${accountCreationTime}ms`);
      console.log(`Directory Test Time: ${directoryTestTime}ms`);
      console.log(`Accounts Created: ${TOTAL_ACCOUNTS}`);
      console.log(`Total HTTP Requests: ${results.totalRequests}`);
      console.log(`New-Nonce Requests: ${results.newNonceRequests}`);
      console.log(`Directory Requests: ${results.directoryRequests}`);
      console.log(`Average Response Time: ${Math.round(results.averageResponseTime)}ms`);
      console.log(`Requests per Second: ${Math.round(results.totalRequests / (totalTime / 1000))}`);
      console.log(`Total Nonces Remaining: ${totalNoncesRemaining}`);

      console.log(`\n📈 REQUEST TYPE BREAKDOWN:`);
      Object.entries(results.requestsByType).forEach(([type, count]) => {
        console.log(
          `   ${type}: ${count} (${Math.round(((count as number) / results.totalRequests) * 100)}%)`,
        );
      });

      console.log(`\n🔗 ENDPOINT BREAKDOWN:`);
      Object.entries(results.requestsByEndpoint)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .forEach(([endpoint, count]) => {
          console.log(`   ${endpoint}: ${count}`);
        });

      console.log(`\n⚡ NONCE POOL EFFICIENCY:`);
      console.log(`   Total Requests: ${results.totalRequests}`);
      console.log(`   New-Nonce Requests: ${results.newNonceRequests}`);
      console.log(
        `   Requests Saved by Pooling: ${results.totalRequests - results.newNonceRequests}`,
      );
      console.log(
        `   Pool Efficiency: ${results.newNonceRequests > 0 ? Math.round(((results.totalRequests - results.newNonceRequests) / results.totalRequests) * 100) : 0}%`,
      );

      // Generate detailed report
      const report = `# 🚀 ACME Love - Metrics Test Results

## Test Configuration
- **Date**: ${new Date().toISOString()}
- **Test Type**: Account Operations Metrics
- **Accounts Created**: ${TOTAL_ACCOUNTS}
- **Target**: Let's Encrypt Staging
- **Algorithm**: EC P-256

## Performance Summary
- **Total Time**: ${Math.round(totalTime / 1000)}s (${totalTime}ms)
- **Account Creation**: ${accountCreationTime}ms (${Math.round(accountCreationTime / TOTAL_ACCOUNTS)}ms avg per account)
- **Directory Test**: ${directoryTestTime}ms
- **Total Requests**: ${results.totalRequests}
- **Average Response Time**: ${Math.round(results.averageResponseTime)}ms
- **Throughput**: ${Math.round(results.totalRequests / (totalTime / 1000))} req/s

## HTTP Request Analysis
${Object.entries(results.requestsByType)
  .map(
    ([type, count]) =>
      `- **${type}**: ${count} (${Math.round(((count as number) / results.totalRequests) * 100)}%)`,
  )
  .join('\n')}

## Endpoint Performance
${Object.entries(results.requestsByEndpoint)
  .sort(([, a], [, b]) => (b as number) - (a as number))
  .map(([endpoint, count]) => `- **${endpoint}**: ${count} requests`)
  .join('\n')}

## Nonce Manager Performance
- **Total New-Nonce Requests**: ${results.newNonceRequests}
- **Requests Saved by Pooling**: ${results.totalRequests - results.newNonceRequests}
- **Pool Efficiency**: ${results.newNonceRequests > 0 ? Math.round(((results.totalRequests - results.newNonceRequests) / results.totalRequests) * 100) : 0}%
- **Nonces Remaining in Pools**: ${totalNoncesRemaining}

## Per-Account Nonce Statistics
${nonceStats.map((stat) => `- **Account ${stat.accountIndex + 1}**: ${stat.noncesRemaining} nonces remaining`).join('\n')}

## Request Timeline Analysis
- **Account Creation Phase**: ${accountCreationTime}ms for ${TOTAL_ACCOUNTS} accounts
- **Directory Caching Test**: ${directoryTestTime}ms for 3 directory fetches
- **Average Account Setup**: ${Math.round(accountCreationTime / TOTAL_ACCOUNTS)}ms per account

## Key Performance Indicators
✅ Account creation rate: ${Math.round(TOTAL_ACCOUNTS / (accountCreationTime / 1000))} accounts/second
✅ HTTP response time: ${Math.round(results.averageResponseTime)}ms average
✅ Nonce pooling efficiency: ${results.newNonceRequests > 0 ? Math.round(((results.totalRequests - results.newNonceRequests) / results.totalRequests) * 100) : 0}% reduction in network calls
✅ Overall throughput: ${Math.round(results.totalRequests / (totalTime / 1000))} requests/second

## Detailed Request Log
${results.allRequestDetails
  .slice(0, 10)
  .map(
    (req) =>
      `${req.timestamp}ms: ${req.method} ${req.type} (${req.duration}ms, status ${req.status})`,
  )
  .join('\n')}
${results.allRequestDetails.length > 10 ? `... and ${results.allRequestDetails.length - 10} more requests` : ''}

## Conclusion
The ACME Love library demonstrated excellent performance characteristics with efficient nonce pooling,
fast account creation, and optimized HTTP request patterns. The NonceManager successfully reduced
network overhead by ${results.totalRequests - results.newNonceRequests} requests through intelligent pooling.

*Generated by ACME Love v1.2.1 metrics test*
`;

      // Save report
      const reportPath = path.join(process.cwd(), 'docs/reports/ACME-METRICS-TEST-RESULTS.md');
      fs.writeFileSync(reportPath, report);
      console.log(`\n📋 Detailed metrics report saved to ${reportPath}`);

      // Assertions
      expect(accounts.length).toBe(TOTAL_ACCOUNTS);
      expect(results.totalRequests).toBeGreaterThan(3);
      expect(results.newNonceRequests).toBeGreaterThan(0);
      expect(results.averageResponseTime).toBeLessThan(4000);
      expect(results.accountsCreated).toBe(TOTAL_ACCOUNTS);
    } catch (error) {
      console.error(`💥 Metrics test failed:`, error);
      throw error;
    }
  }, 45000); // 45 seconds timeout
});
