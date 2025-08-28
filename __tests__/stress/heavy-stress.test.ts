import { describe, test, expect, beforeAll } from '@jest/globals';
import { testAccountManager } from '../utils/account-manager.js';
import * as fs from 'fs';
import * as path from 'path';

// Heavy stress test: 4 accounts × 100 orders = 400 orders total
describe('ACME Heavy Stress Test - 4 Accounts × 100 Orders', () => {
  const STAGING_DIRECTORY_URL = 'https://acme-staging-v02.api.letsencrypt.org/directory';
  const ORDERS_PER_ACCOUNT = 200;
  const TOTAL_ACCOUNTS = 4;
  const TOTAL_ORDERS = TOTAL_ACCOUNTS * ORDERS_PER_ACCOUNT;

  // Advanced performance metrics
  interface RequestMetrics {
    type: string;
    url: string;
    method: string;
    timestamp: number;
    duration: number;
    status: number;
    accountIndex?: number | undefined;
    orderIndex?: number | undefined;
  }

  interface NoncePoolStats {
    accountIndex: number;
    initialPool: number;
    finalPool: number;
    peakPool: number;
    totalGenerated: number;
    totalConsumed: number;
  }

  interface PhaseMetrics {
    phase: string;
    startTime: number;
    endTime: number;
    duration: number;
    requestCount: number;
    errorCount: number;
    averageResponseTime: number;
  }

  class HeavyMetricsCollector {
    private metrics: RequestMetrics[] = [];
    private phases: PhaseMetrics[] = [];
    private startTime: number = 0;
    private nonceRequests: number = 0;
    private errorCount: number = 0;
    private currentPhase: string = '';
    private phaseStartTime: number = 0;

    start() {
      this.startTime = Date.now();
      this.metrics = [];
      this.phases = [];
      this.nonceRequests = 0;
      this.errorCount = 0;
    }

    startPhase(phaseName: string) {
      if (this.currentPhase) {
        this.endPhase();
      }
      this.currentPhase = phaseName;
      this.phaseStartTime = Date.now();
    }

    endPhase() {
      if (!this.currentPhase) return;

      const now = Date.now();
      const phaseMetrics = this.metrics.filter(
        (m) =>
          m.timestamp >= this.phaseStartTime - this.startTime &&
          m.timestamp <= now - this.startTime,
      );

      this.phases.push({
        phase: this.currentPhase,
        startTime: this.phaseStartTime,
        endTime: now,
        duration: now - this.phaseStartTime,
        requestCount: phaseMetrics.length,
        errorCount: phaseMetrics.filter((m) => m.status >= 400).length,
        averageResponseTime:
          phaseMetrics.length > 0
            ? phaseMetrics.reduce((sum, m) => sum + m.duration, 0) / phaseMetrics.length
            : 0,
      });

      this.currentPhase = '';
    }

    addRequest(
      type: string,
      url: string,
      method: string,
      duration: number,
      status: number,
      accountIndex?: number,
      orderIndex?: number,
    ) {
      this.metrics.push({
        type,
        url,
        method,
        timestamp: Date.now() - this.startTime,
        duration,
        status,
        accountIndex,
        orderIndex,
      });

      if (url.includes('new-nonce')) {
        this.nonceRequests++;
      }

      if (status >= 400) {
        this.errorCount++;
      }
    }

    getResults() {
      this.endPhase(); // End current phase if any

      const totalTime = Date.now() - this.startTime;
      const requestsByType: Record<string, number> = {};
      const requestsByEndpoint: Record<string, number> = {};
      const requestsByAccount: Record<number, number> = {};

      let accountsCreated = 0;
      let ordersCreated = 0;
      let authorizationsCreated = 0;

      this.metrics.forEach((metric) => {
        requestsByType[metric.type] = (requestsByType[metric.type] || 0) + 1;

        const endpoint = this.extractEndpoint(metric.url);
        requestsByEndpoint[endpoint] = (requestsByEndpoint[endpoint] || 0) + 1;

        if (metric.accountIndex !== undefined) {
          requestsByAccount[metric.accountIndex] =
            (requestsByAccount[metric.accountIndex] || 0) + 1;
        }

        if (metric.url.includes('new-acct') && metric.method === 'POST') accountsCreated++;
        if (metric.url.includes('new-order') && metric.method === 'POST') ordersCreated++;
        if (metric.url.includes('authz-v3') && metric.method === 'POST') authorizationsCreated++;
      });

      // Calculate response time percentiles
      const responseTimes = this.metrics.map((m) => m.duration).sort((a, b) => a - b);
      const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)] || 0;
      const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
      const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;

      const averageResponseTime =
        this.metrics.length > 0
          ? this.metrics.reduce((sum, m) => sum + m.duration, 0) / this.metrics.length
          : 0;

      const requestsPerSecond = this.metrics.length / (totalTime / 1000);
      const ordersPerSecond = ordersCreated / (totalTime / 1000);

      return {
        totalTime,
        accountsCreated,
        ordersCreated,
        authorizationsCreated,
        totalRequests: this.metrics.length,
        newNonceRequests: this.nonceRequests,
        errorCount: this.errorCount,
        averageResponseTime,
        responseTimePercentiles: { p50, p95, p99 },
        requestsPerSecond,
        ordersPerSecond,
        requestsByType,
        requestsByEndpoint,
        requestsByAccount,
        phases: this.phases,
        allMetrics: this.metrics,
      };
    }

    private extractEndpoint(url: string): string {
      try {
        const urlObj = new URL(url);

        // For Let's Encrypt staging URLs, extract meaningful endpoint names
        if (urlObj.hostname === 'acme-staging-v02.api.letsencrypt.org') {
          const path = urlObj.pathname;

          // Common ACME endpoints
          if (path.includes('/acme/new-nonce')) return 'new-nonce';
          if (path.includes('/acme/new-acct')) return 'new-account';
          if (path.includes('/acme/new-order')) return 'new-order';
          if (path.includes('/acme/authz/')) return 'authorization';
          if (path.includes('/acme/chall/')) return 'challenge';
          if (path.includes('/acme/finalize/')) return 'finalize';
          if (path.includes('/acme/cert/')) return 'certificate';
          if (path.includes('/directory')) return 'directory';

          // Order status URLs (with order ID)
          if (path.includes('/acme/order/')) return 'order-status';

          // Fallback to last path segment for other endpoints
          const pathParts = path.split('/');
          return pathParts[pathParts.length - 1] || 'unknown-acme';
        }

        // For other URLs, use the last path segment
        const pathParts = urlObj.pathname.split('/');
        return pathParts[pathParts.length - 1] || 'directory';
      } catch {
        return 'unknown';
      }
    }
  }

  // Enhanced HTTP client with per-account tracking
  class HeavyMetricsHttpClient {
    private collector: HeavyMetricsCollector;
    private originalClient: any;
    private accountIndex?: number | undefined;
    private orderIndex?: number | undefined;

    constructor(collector: HeavyMetricsCollector, originalClient: any, accountIndex?: number) {
      this.collector = collector;
      this.originalClient = originalClient;
      this.accountIndex = accountIndex;
    }

    setOrderIndex(orderIndex: number) {
      this.orderIndex = orderIndex;
    }

    async get(url: string, headers: Record<string, string> = {}): Promise<any> {
      const start = Date.now();
      try {
        const result = await this.originalClient.get(url, headers);
        const duration = Date.now() - start;
        this.collector.addRequest(
          'GET',
          url,
          'GET',
          duration,
          result.status,
          this.accountIndex,
          this.orderIndex,
        );
        return result;
      } catch (error: any) {
        const duration = Date.now() - start;
        this.collector.addRequest(
          'GET',
          url,
          'GET',
          duration,
          error.status || 500,
          this.accountIndex,
          this.orderIndex,
        );
        throw error;
      }
    }

    async post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<any> {
      const start = Date.now();
      try {
        const result = await this.originalClient.post(url, body, headers);
        const duration = Date.now() - start;
        this.collector.addRequest(
          'POST',
          url,
          'POST',
          duration,
          result.status,
          this.accountIndex,
          this.orderIndex,
        );
        return result;
      } catch (error: any) {
        const duration = Date.now() - start;
        this.collector.addRequest(
          'POST',
          url,
          'POST',
          duration,
          error.status || 500,
          this.accountIndex,
          this.orderIndex,
        );
        throw error;
      }
    }

    async head(url: string, headers: Record<string, string> = {}): Promise<any> {
      const start = Date.now();
      try {
        const result = await this.originalClient.head(url, headers);
        const duration = Date.now() - start;
        this.collector.addRequest(
          'HEAD',
          url,
          'HEAD',
          duration,
          result.status,
          this.accountIndex,
          this.orderIndex,
        );
        return result;
      } catch (error: any) {
        const duration = Date.now() - start;
        this.collector.addRequest(
          'HEAD',
          url,
          'HEAD',
          duration,
          error.status || 500,
          this.accountIndex,
          this.orderIndex,
        );
        throw error;
      }
    }
  }

  let collector: HeavyMetricsCollector;

  beforeAll(async () => {
    if (process.env.CI && !process.env.ACME_HEAVY_STRESS_ENABLED) {
      console.log('⚠️  Skipping heavy stress test in CI environment');
      console.log('   Set ACME_HEAVY_STRESS_ENABLED=1 to run heavy stress test in CI');
      return;
    }

    collector = new HeavyMetricsCollector();
    console.log(`🚀 Starting ACME Heavy Stress Test`);
    console.log(`   Accounts: ${TOTAL_ACCOUNTS}`);
    console.log(`   Orders per account: ${ORDERS_PER_ACCOUNT}`);
    console.log(`   Total orders: ${TOTAL_ORDERS}`);
    console.log(`   ⚠️  This test will take several minutes to complete`);
  });

  test('should handle heavy concurrent load with 400 orders efficiently', async () => {
    if (process.env.CI && !process.env.ACME_HEAVY_STRESS_ENABLED) {
      return;
    }

    collector.start();
    console.log(`⏱️  Starting heavy stress test at ${new Date().toISOString()}`);

    try {
      // Phase 1: Account Creation
      collector.startPhase('Account Creation');
      console.log(`👥 Creating ${TOTAL_ACCOUNTS} accounts...`);
      const accountCreationStart = Date.now();

      const accountPromises = Array.from({ length: TOTAL_ACCOUNTS }, async (_, accountIndex) => {
        // Get or create persistent account session (with registration)
        const acct = await testAccountManager.getOrCreateAccountSession(
          `heavy-stress-${accountIndex + 1}`,
          STAGING_DIRECTORY_URL,
          `heavy-stress-${accountIndex}-${Date.now()}@acme-love.com`,
          { nonce: { maxPool: 20 } }, // Larger pool for heavy load
        );

        // Add metrics wrapper to the existing core
        const core = (acct as any).client;
        const originalHttp = core.getHttp();
        const metricsHttp = new HeavyMetricsHttpClient(collector, originalHttp, accountIndex);
        (core as any).http = metricsHttp;

        console.log(`   ✅ Account ${accountIndex + 1}/${TOTAL_ACCOUNTS} created`);
        return { accountIndex, acct, core, metricsHttp };
      });

      const accounts = await Promise.all(accountPromises);
      const accountCreationTime = Date.now() - accountCreationStart;
      console.log(`   🎯 All ${TOTAL_ACCOUNTS} accounts created in ${accountCreationTime}ms`);

      // Phase 2: Order Creation (Batch Processing)
      collector.startPhase('Order Creation');
      console.log(`📦 Creating orders in batches of 10...`);
      const orderCreationStart = Date.now();

      let receivedChallenges = 0;
      const batchSize = 10;
      const reportingInterval = 50; // Report progress every 50 orders

      for (let batchStart = 0; batchStart < TOTAL_ORDERS; batchStart += batchSize) {
        const batchPromises = [];

        for (let i = 0; i < batchSize && batchStart + i < TOTAL_ORDERS; i++) {
          const globalOrderIndex = batchStart + i;
          const accountIndex = globalOrderIndex % TOTAL_ACCOUNTS;
          const orderIndex = Math.floor(globalOrderIndex / TOTAL_ACCOUNTS);

          const { acct, metricsHttp } = accounts[accountIndex];
          metricsHttp.setOrderIndex(orderIndex);

          const orderPromise = (async () => {
            try {
              const randomString = Math.random().toString(36).substring(2, 10).toLowerCase();
              const domain = `${randomString}-acme-love.com`;
              const order = await acct.newOrder([domain]);
              const authz = await acct.fetch<any>(order.authorizations[0]);
              const httpChallenge = authz.challenges.find((c: any) => c.type === 'http-01');

              if (httpChallenge) {
                const keyAuth = await acct.keyAuthorization(httpChallenge.token);
                receivedChallenges++;

                if (receivedChallenges % reportingInterval === 0) {
                  const progress = Math.round((receivedChallenges / TOTAL_ORDERS) * 100);
                  const elapsed = Date.now() - orderCreationStart;
                  const rate = receivedChallenges / (elapsed / 1000);
                  console.log(
                    `     📊 ${receivedChallenges}/${TOTAL_ORDERS} orders (${progress}%) - ${Math.round(rate)} orders/sec`,
                  );
                }

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
          })();

          batchPromises.push(orderPromise);
        }

        // Wait for current batch to complete before starting next batch
        try {
          await Promise.all(batchPromises);
        } catch (error) {
          console.error(`⚠️  Some orders in batch failed, continuing...`);
        }

        // Small delay between batches to prevent overwhelming the server
        if (batchStart + batchSize < TOTAL_ORDERS) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      const orderCreationTime = Date.now() - orderCreationStart;
      console.log(`   🎯 Order creation phase completed in ${orderCreationTime}ms`);

      // Phase 3: Nonce Pool Analysis
      collector.startPhase('Nonce Analysis');
      console.log(`📊 Analyzing nonce pool statistics...`);

      const nonceStats: NoncePoolStats[] = [];
      let totalNoncesRemaining = 0;

      accounts.forEach(({ accountIndex, core }) => {
        try {
          const nonceManager = core.getDefaultNonce();
          const poolSize = (nonceManager as any).pool?.length || 0;
          totalNoncesRemaining += poolSize;

          const stats: NoncePoolStats = {
            accountIndex,
            initialPool: 0, // Would need to track from beginning
            finalPool: poolSize,
            peakPool: 0, // Would need to track throughout
            totalGenerated: 0, // Would need enhanced tracking
            totalConsumed: 0, // Would need enhanced tracking
          };

          nonceStats.push(stats);
          console.log(`   📊 Account ${accountIndex + 1} final nonce pool: ${poolSize}`);
        } catch (error) {
          console.log(`   ⚠️  Could not get nonce stats for account ${accountIndex + 1}`);
        }
      });

      const results = collector.getResults();
      const totalTime = Date.now() - collector['startTime'];

      // Comprehensive Results Report
      console.log(`\n🏆 HEAVY STRESS TEST RESULTS`);
      console.log(`============================`);
      console.log(`Total Test Time: ${Math.round(totalTime / 1000)}s (${totalTime}ms)`);
      console.log(`Account Creation: ${accountCreationTime}ms`);
      console.log(`Order Creation: ${orderCreationTime}ms`);
      console.log(`Target Orders: ${TOTAL_ORDERS}`);
      console.log(`Received challenges: ${receivedChallenges}`);
      console.log(`Success Rate: ${Math.round((receivedChallenges / TOTAL_ORDERS) * 100)}%`);
      console.log(`Total HTTP Requests: ${results.totalRequests}`);
      console.log(`New-Nonce Requests: ${results.newNonceRequests}`);
      console.log(`Error Count: ${results.errorCount}`);
      console.log(`Error Rate: ${Math.round((results.errorCount / results.totalRequests) * 100)}%`);

      console.log(`\n⚡ PERFORMANCE METRICS:`);
      console.log(`Requests per Second: ${Math.round(results.requestsPerSecond)}`);
      console.log(`Orders per Second: ${Math.round(results.ordersPerSecond)}`);
      console.log(`Average Response Time: ${Math.round(results.averageResponseTime)}ms`);
      console.log(`Response Time P50: ${Math.round(results.responseTimePercentiles.p50)}ms`);
      console.log(`Response Time P95: ${Math.round(results.responseTimePercentiles.p95)}ms`);
      console.log(`Response Time P99: ${Math.round(results.responseTimePercentiles.p99)}ms`);

      console.log(`\n📈 REQUEST BREAKDOWN:`);
      Object.entries(results.requestsByType)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .forEach(([type, count]) => {
          console.log(
            `   ${type}: ${count} (${Math.round(((count as number) / results.totalRequests) * 100)}%)`,
          );
        });

      console.log(`\n🔗 TOP ENDPOINTS:`);
      Object.entries(results.requestsByEndpoint)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 10)
        .forEach(([endpoint, count]) => {
          console.log(`   ${endpoint}: ${count}`);
        });

      console.log(`\n🏢 LET'S ENCRYPT STAGING API:`);
      Object.entries(results.requestsByEndpoint)
        .filter(([endpoint]) =>
          [
            'new-nonce',
            'new-account',
            'new-order',
            'authorization',
            'challenge',
            'finalize',
            'certificate',
            'directory',
            'order-status',
          ].includes(endpoint),
        )
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .forEach(([endpoint, count]) => {
          const percentage = Math.round(((count as number) / results.totalRequests) * 100);
          console.log(`   ${endpoint}: ${count} (${percentage}%)`);
        });

      console.log(`\n📊 PER-ACCOUNT STATS:`);
      Object.entries(results.requestsByAccount).forEach(([accountIndex, count]) => {
        console.log(`   Account ${parseInt(accountIndex) + 1}: ${count} requests`);
      });

      console.log(`\n⚡ NONCE EFFICIENCY:`);
      console.log(`Total Requests: ${results.totalRequests}`);
      console.log(`New-Nonce Requests: ${results.newNonceRequests}`);
      console.log(`Saved Requests: ${results.totalRequests - results.newNonceRequests}`);
      console.log(
        `Pool Efficiency: ${results.newNonceRequests > 0 ? Math.round(((results.totalRequests - results.newNonceRequests) / results.totalRequests) * 100) : 0}%`,
      );
      console.log(`Total Nonces Remaining: ${totalNoncesRemaining}`);

      // Generate comprehensive report
      const report = `# 🚀 ACME Love - Heavy Stress Test Results

## Test Configuration
- **Date**: ${new Date().toISOString()}
- **Test Type**: Heavy Load Stress Test
- **Accounts**: ${TOTAL_ACCOUNTS}
- **Orders per Account**: ${ORDERS_PER_ACCOUNT}
- **Total Target Orders**: ${TOTAL_ORDERS}
- **Received challenges**: ${receivedChallenges}
- **Success Rate**: ${Math.round((receivedChallenges / TOTAL_ORDERS) * 100)}%
- **Target**: Let's Encrypt Staging
- **Algorithm**: EC P-256

## Performance Summary
- **Total Time**: ${Math.round(totalTime / 1000)}s (${totalTime}ms)
- **Account Creation**: ${accountCreationTime}ms
- **Order Processing**: ${orderCreationTime}ms
- **Total Requests**: ${results.totalRequests}
- **Error Count**: ${results.errorCount} (${Math.round((results.errorCount / results.totalRequests) * 100)}%)

## Throughput Metrics
- **Requests per Second**: ${Math.round(results.requestsPerSecond)} req/s
- **Orders per Second**: ${Math.round(results.ordersPerSecond)} orders/s
- **Average Response Time**: ${Math.round(results.averageResponseTime)}ms

## Response Time Analysis
- **P50 (Median)**: ${Math.round(results.responseTimePercentiles.p50)}ms
- **P95**: ${Math.round(results.responseTimePercentiles.p95)}ms
- **P99**: ${Math.round(results.responseTimePercentiles.p99)}ms

## Request Distribution
${Object.entries(results.requestsByType)
  .sort(([, a], [, b]) => (b as number) - (a as number))
  .map(
    ([type, count]) =>
      `- **${type}**: ${count} (${Math.round(((count as number) / results.totalRequests) * 100)}%)`,
  )
  .join('\n')}

## Top Endpoints
${Object.entries(results.requestsByEndpoint)
  .sort(([, a], [, b]) => (b as number) - (a as number))
  .slice(0, 10)
  .map(([endpoint, count]) => `- **${endpoint}**: ${count} requests`)
  .join('\n')}

## Let's Encrypt Staging API Breakdown
${Object.entries(results.requestsByEndpoint)
  .filter(([endpoint]) =>
    [
      'new-nonce',
      'new-account',
      'new-order',
      'authorization',
      'challenge',
      'finalize',
      'certificate',
      'directory',
      'order-status',
    ].includes(endpoint),
  )
  .sort(([, a], [, b]) => (b as number) - (a as number))
  .map(([endpoint, count]) => {
    const percentage = Math.round(((count as number) / results.totalRequests) * 100);
    return `- **${endpoint}**: ${count} requests (${percentage}%)`;
  })
  .join('\n')}

## Per-Account Performance
${Object.entries(results.requestsByAccount)
  .map(([accountIndex, count]) => `- **Account ${parseInt(accountIndex) + 1}**: ${count} requests`)
  .join('\n')}

## Nonce Manager Performance
- **Total New-Nonce Requests**: ${results.newNonceRequests}
- **Requests Saved by Pooling**: ${results.totalRequests - results.newNonceRequests}
- **Pool Efficiency**: ${results.newNonceRequests > 0 ? Math.round(((results.totalRequests - results.newNonceRequests) / results.totalRequests) * 100) : 0}%
- **Final Pool State**: ${totalNoncesRemaining} nonces remaining

## Phase Breakdown
${results.phases
  .map(
    (phase) =>
      `### ${phase.phase}
- **Duration**: ${Math.round(phase.duration / 1000)}s
- **Requests**: ${phase.requestCount}
- **Errors**: ${phase.errorCount}
- **Avg Response**: ${Math.round(phase.averageResponseTime)}ms`,
  )
  .join('\n\n')}

## Key Performance Indicators
✅ Successfully processed ${receivedChallenges} orders out of ${TOTAL_ORDERS} (${Math.round((receivedChallenges / TOTAL_ORDERS) * 100)}% success rate)
✅ Maintained ${Math.round(results.averageResponseTime)}ms average response time under heavy load
✅ Achieved ${Math.round(results.requestsPerSecond)} requests/second sustained throughput
✅ Nonce pooling saved ${results.totalRequests - results.newNonceRequests} network requests (${results.newNonceRequests > 0 ? Math.round(((results.totalRequests - results.newNonceRequests) / results.totalRequests) * 100) : 0}% efficiency)
✅ Error rate kept under ${Math.round((results.errorCount / results.totalRequests) * 100)}%

## Stress Test Validation
This heavy stress test validates that ACME Love can handle enterprise-scale certificate
management with hundreds of concurrent orders while maintaining performance and reliability.

*Generated by ACME Love v1.2.1 heavy stress test*
`;

      // Save comprehensive report
      const reportPath = path.join(process.cwd(), 'docs/reports/HEAVY-STRESS-TEST-RESULTS.md');
      fs.writeFileSync(reportPath, report);
      console.log(`\n📋 Comprehensive report saved to ${reportPath}`);

      // Performance assertions
      expect(receivedChallenges).toBeGreaterThan(TOTAL_ORDERS * 0.8); // At least 80% success rate
      expect(results.totalRequests).toBeGreaterThan(TOTAL_ORDERS * 2); // At least 2 requests per order
      expect(results.newNonceRequests).toBeGreaterThan(0);
      expect(results.averageResponseTime).toBeLessThan(5000); // Under 5 seconds average
      expect(results.errorCount / results.totalRequests).toBeLessThan(0.1); // Under 10% error rate
      expect(results.requestsPerSecond).toBeGreaterThan(1); // At least 1 request per second
    } catch (error) {
      console.error(`💥 Heavy stress test failed:`, error);
      throw error;
    }
  }, 600000); // 10 minutes timeout
});
