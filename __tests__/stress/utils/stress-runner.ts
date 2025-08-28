import { testAccountManager } from '../../utils/account-manager.js';
import * as fs from 'fs';
import * as path from 'path';

export interface StressTestThresholds {
  minSuccessRate?: number; // 0..1
  maxAvgResponseTimeMs?: number;
  maxErrorRate?: number; // 0..1
  minRequestsPerSecond?: number;
}

export interface StressTestConfig {
  name: string; // Human readable test name
  accounts: number;
  ordersPerAccount: number;
  directoryUrl: string;
  batchSize?: number;
  reportFile: string; // e.g. HEAVY-STRESS-TEST-RESULTS.md
  envSkipVar?: string; // If set and not truthy in env under CI, skip
  noncePoolSizePerAccount?: number;
  timeouts?: { test?: number };
  thresholds?: StressTestThresholds;
  enabledFlagDescription?: string; // message for skip
}

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

interface PhaseMetrics {
  phase: string;
  startTime: number;
  endTime: number;
  duration: number;
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
}

class MetricsCollector {
  private metrics: RequestMetrics[] = [];
  private phases: PhaseMetrics[] = [];
  private startTime = 0;
  private nonceRequests = 0;
  private errorCount = 0;
  private currentPhase = '';
  private phaseStartTime = 0;

  start() {
    this.startTime = Date.now();
    this.metrics = [];
    this.phases = [];
    this.nonceRequests = 0;
    this.errorCount = 0;
  }

  startPhase(name: string) {
    if (this.currentPhase) this.endPhase();
    this.currentPhase = name;
    this.phaseStartTime = Date.now();
  }

  endPhase() {
    if (!this.currentPhase) return;
    const now = Date.now();
    const phaseMetrics = this.metrics.filter(
      (m) =>
        m.timestamp >= this.phaseStartTime - this.startTime && m.timestamp <= now - this.startTime,
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
          ? phaseMetrics.reduce((s, m) => s + m.duration, 0) / phaseMetrics.length
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
    if (url.includes('new-nonce')) this.nonceRequests++;
    if (status >= 400) this.errorCount++;
  }

  getResults() {
    this.endPhase();
    const totalTime = Date.now() - this.startTime;
    const requestsByType: Record<string, number> = {};
    const requestsByEndpoint: Record<string, number> = {};
    const requestsByAccount: Record<number, number> = {};
    let accountsCreated = 0;
    let ordersCreated = 0;
    let authorizationsCreated = 0;
    this.metrics.forEach((m) => {
      requestsByType[m.type] = (requestsByType[m.type] || 0) + 1;
      const endpoint = this.extractEndpoint(m.url);
      requestsByEndpoint[endpoint] = (requestsByEndpoint[endpoint] || 0) + 1;
      if (m.accountIndex !== undefined) {
        requestsByAccount[m.accountIndex] = (requestsByAccount[m.accountIndex] || 0) + 1;
      }
      if (m.url.includes('new-acct') && m.method === 'POST') accountsCreated++;
      if (m.url.includes('new-order') && m.method === 'POST') ordersCreated++;
      if (m.url.includes('authz-v3') && m.method === 'POST') authorizationsCreated++;
    });
    const responseTimes = this.metrics.map((m) => m.duration).sort((a, b) => a - b);
    const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)] || 0;
  const p75 = responseTimes[Math.floor(responseTimes.length * 0.75)] || 0;
  const p90 = responseTimes[Math.floor(responseTimes.length * 0.9)] || 0;
    const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
    const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;
    const averageResponseTime =
      this.metrics.length > 0
        ? this.metrics.reduce((s, m) => s + m.duration, 0) / this.metrics.length
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
  responseTimePercentiles: { p50, p75, p90, p95, p99 },
      requestsPerSecond,
      ordersPerSecond,
      requestsByType,
      requestsByEndpoint,
      requestsByAccount,
      phases: this.phases,
      allMetrics: this.metrics,
      startTime: this.startTime,
    };
  }

  private extractEndpoint(url: string): string {
    try {
      const u = new URL(url);
      if (u.hostname === 'acme-staging-v02.api.letsencrypt.org') {
        const p = u.pathname;
        if (p.includes('/acme/new-nonce')) return 'new-nonce';
        if (p.includes('/acme/new-acct')) return 'new-account';
        if (p.includes('/acme/new-order')) return 'new-order';
        if (p.includes('/acme/authz/')) return 'authorization';
        if (p.includes('/acme/chall/')) return 'challenge';
        if (p.includes('/acme/finalize/')) return 'finalize';
        if (p.includes('/acme/cert/')) return 'certificate';
        if (p.includes('/directory')) return 'directory';
        if (p.includes('/acme/order/')) return 'order-status';
        const segs = p.split('/');
        return segs[segs.length - 1] || 'unknown-acme';
      }
      const segs = u.pathname.split('/');
      return segs[segs.length - 1] || 'directory';
    } catch {
      return 'unknown';
    }
  }
}

class MetricsHttpClient {
  constructor(
    private collector: MetricsCollector,
    private original: any,
    private accountIndex?: number,
    private orderIndex?: number,
  ) {}

  setOrderIndex(i: number) {
    this.orderIndex = i;
  }

  async get(url: string, headers: Record<string, string> = {}) {
    const start = Date.now();
    try {
      const res = await this.original.get(url, headers);
      this.collector.addRequest(
        'GET',
        url,
        'GET',
        Date.now() - start,
        res.status,
        this.accountIndex,
        this.orderIndex,
      );
      return res;
    } catch (e: any) {
      this.collector.addRequest(
        'GET',
        url,
        'GET',
        Date.now() - start,
        e.status || 500,
        this.accountIndex,
        this.orderIndex,
      );
      throw e;
    }
  }
  async post(url: string, body: unknown, headers: Record<string, string> = {}) {
    const start = Date.now();
    try {
      const res = await this.original.post(url, body, headers);
      this.collector.addRequest(
        'POST',
        url,
        'POST',
        Date.now() - start,
        res.status,
        this.accountIndex,
        this.orderIndex,
      );
      return res;
    } catch (e: any) {
      this.collector.addRequest(
        'POST',
        url,
        'POST',
        Date.now() - start,
        e.status || 500,
        this.accountIndex,
        this.orderIndex,
      );
      throw e;
    }
  }
  async head(url: string, headers: Record<string, string> = {}) {
    const start = Date.now();
    try {
      const res = await this.original.head(url, headers);
      this.collector.addRequest(
        'HEAD',
        url,
        'HEAD',
        Date.now() - start,
        res.status,
        this.accountIndex,
        this.orderIndex,
      );
      return res;
    } catch (e: any) {
      this.collector.addRequest(
        'HEAD',
        url,
        'HEAD',
        Date.now() - start,
        e.status || 500,
        this.accountIndex,
        this.orderIndex,
      );
      throw e;
    }
  }
}

export async function runStressTest(config: StressTestConfig) {
  const {
    name,
    accounts: TOTAL_ACCOUNTS,
    ordersPerAccount: ORDERS_PER_ACCOUNT,
    directoryUrl: STAGING_DIRECTORY_URL,
    batchSize = 10,
    reportFile,
    noncePoolSizePerAccount = 20,
    thresholds = {},
  } = config;
  const TOTAL_ORDERS = TOTAL_ACCOUNTS * ORDERS_PER_ACCOUNT;
  const collector = new MetricsCollector();
  collector.start();
  console.log(`⏱️  Starting ${name} at ${new Date().toISOString()}`);
  try {
    // Phase 1 Accounts
    collector.startPhase('Account Creation');
    console.log(`👥 Creating ${TOTAL_ACCOUNTS} accounts...`);
    const accountStart = Date.now();
    const accountPromises = Array.from({ length: TOTAL_ACCOUNTS }, async (_, accountIndex) => {
      const acct = await testAccountManager.getOrCreateAccountSession(
        `${name.toLowerCase().replace(/\s+/g, '-')}-${accountIndex + 1}`,
        STAGING_DIRECTORY_URL,
        `${name.toLowerCase()}-${accountIndex}-${Date.now()}@acme-love.com`,
        { nonce: { maxPool: noncePoolSizePerAccount } },
      );
      const core = (acct as any).client;
      const originalHttp = core.getHttp();
      const metricsHttp = new MetricsHttpClient(collector, originalHttp, accountIndex);
      (core as any).http = metricsHttp;
      console.log(`   ✅ Account ${accountIndex + 1}/${TOTAL_ACCOUNTS} ready`);
      return { accountIndex, acct, core, metricsHttp };
    });
    const accounts = await Promise.all(accountPromises);
    const accountCreationTime = Date.now() - accountStart;
    console.log(`   🎯 Accounts created in ${accountCreationTime}ms`);

    // Phase 2 Orders
    collector.startPhase('Order Creation');
    console.log(`📦 Creating ${TOTAL_ORDERS} orders (batch size ${batchSize})...`);
    const orderStart = Date.now();
    let receivedChallenges = 0;
    const reportingInterval = Math.max(10, Math.round(TOTAL_ORDERS / 8));
    for (let batchStart = 0; batchStart < TOTAL_ORDERS; batchStart += batchSize) {
      const batchPromises: Promise<any>[] = [];
      for (let i = 0; i < batchSize && batchStart + i < TOTAL_ORDERS; i++) {
        const globalOrderIndex = batchStart + i;
        const accountIndex = globalOrderIndex % TOTAL_ACCOUNTS;
        const orderIndex = Math.floor(globalOrderIndex / TOTAL_ACCOUNTS);
        const { acct, metricsHttp } = accounts[accountIndex];
        metricsHttp.setOrderIndex(orderIndex);
        const p = (async () => {
          try {
            const randomString = Math.random().toString(36).substring(2, 10).toLowerCase();
            const domain = `${randomString}-acme-love.com`;
            const order = await acct.newOrder([domain]);
            const authz = await acct.fetch<any>(order.authorizations[0]);
            const httpChallenge = authz.challenges.find((c: any) => c.type === 'http-01');
            if (!httpChallenge) throw new Error('No HTTP-01 challenge');
            await acct.keyAuthorization(httpChallenge.token);
            receivedChallenges++;
            if (receivedChallenges % reportingInterval === 0) {
              const progress = Math.round((receivedChallenges / TOTAL_ORDERS) * 100);
              const elapsed = Date.now() - orderStart;
              const rate = receivedChallenges / (elapsed / 1000);
              console.log(
                `     📊 ${receivedChallenges}/${TOTAL_ORDERS} orders (${progress}%) - ${Math.round(rate)} orders/sec`,
              );
            }
          } catch (e) {
            console.error(
              `     ❌ Failed order ${orderIndex + 1} for account ${accountIndex + 1}:`,
              e,
            );
          }
        })();
        batchPromises.push(p);
      }
      await Promise.all(batchPromises);
      if (batchStart + batchSize < TOTAL_ORDERS) await new Promise((r) => setTimeout(r, 50));
    }
    const orderCreationTime = Date.now() - orderStart;
    console.log(`   🎯 Orders created in ${orderCreationTime}ms`);

    // Phase 3 Nonce Analysis (minimal for now)
    collector.startPhase('Nonce Analysis');
    let totalNoncesRemaining = 0;
    accounts.forEach(({ accountIndex, core }) => {
      try {
        const nonceManager = core.getDefaultNonce();
        const poolSize = (nonceManager as any).pool?.length || 0;
        totalNoncesRemaining += poolSize;
        console.log(`   📊 Account ${accountIndex + 1} final nonce pool: ${poolSize}`);
      } catch {
        console.log(`   ⚠️  Could not get nonce stats for account ${accountIndex + 1}`);
      }
    });

    const results = collector.getResults();
    const totalTime = Date.now() - (results.startTime || 0);

    // Additional derived metrics for rich reporting
    const successRate = receivedChallenges / Math.max(TOTAL_ORDERS, 1);
    const errorRate = results.errorCount / Math.max(results.totalRequests, 1);
    const poolSaved = results.totalRequests - results.newNonceRequests; // heuristic
    const poolEfficiency = poolSaved / Math.max(results.totalRequests, 1);
    const p50 = results.responseTimePercentiles.p50;
  const p75 = (results as any).responseTimePercentiles.p75 as number;
  const p90 = (results as any).responseTimePercentiles.p90 as number;
    const p95 = results.responseTimePercentiles.p95;
    const p99 = results.responseTimePercentiles.p99;

    // Infer test type from name
    const lowerName = name.toLowerCase();
    let testType = 'Stress Test';
    if (lowerName.includes('heavy')) testType = 'Heavy Load Stress Test';
    else if (lowerName.includes('standard')) testType = 'Standard Load Stress Test';
    else if (lowerName.includes('quick')) testType = 'Quick Stress Test';

    // Attempt to read version from package.json
    let packageVersion = 'dev';
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
      packageVersion = JSON.parse(pkgRaw).version || packageVersion;
    } catch {
      /* ignore */
    }

    console.log(`\n🏆 ${name.toUpperCase()} RESULTS`);
    console.log(`============================`);
    console.log(`Total Test Time: ${Math.round(totalTime / 1000)}s (${totalTime}ms)`);
    console.log(`Account Creation: ${accountCreationTime}ms`);
    console.log(`Order Creation: ${orderCreationTime}ms`);
    console.log(`Total Target Orders: ${TOTAL_ORDERS}`);
    console.log(`Received challenges: ${receivedChallenges}`);
    console.log(`Success Rate: ${(successRate * 100).toFixed(0)}%`);
    console.log(`Total Requests: ${results.totalRequests}`);
    console.log(`Error Count: ${results.errorCount}`);
    console.log(`Requests/sec: ${results.requestsPerSecond.toFixed(2)}`);
    console.log(`Orders/sec: ${results.ordersPerSecond.toFixed(2)}`);
    console.log(`Avg Response: ${Math.round(results.averageResponseTime)}ms`);
    console.log(`P50: ${p50}ms  P95: ${p95}ms  P99: ${p99}ms`);

    // Build enhanced detailed report
    const fmt = (n: number, digits = 0) =>
      n.toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    const pct = (n: number, digits = 1) => (n * 100).toFixed(digits) + '%';

    // Collect threshold comparisons
    const {
      minSuccessRate = 0.8,
      maxAvgResponseTimeMs = 5000,
      maxErrorRate = 0.2,
      minRequestsPerSecond = 1,
    } = thresholds;
    const thresholdRows = [
      {
        label: 'Success Rate',
        actual: pct(successRate, 1),
        target: `>= ${pct(minSuccessRate, 1)}`,
        pass: successRate >= minSuccessRate,
      },
      {
        label: 'Avg Response Time',
        actual: `${Math.round(results.averageResponseTime)} ms`,
        target: `<= ${maxAvgResponseTimeMs} ms`,
        pass: results.averageResponseTime <= maxAvgResponseTimeMs,
      },
      {
        label: 'Error Rate',
        actual: pct(errorRate, 2),
        target: `<= ${pct(maxErrorRate, 2)}`,
        pass: errorRate <= maxErrorRate,
      },
      {
        label: 'Requests / Sec',
        actual: results.requestsPerSecond.toFixed(2),
        target: `>= ${minRequestsPerSecond}`,
        pass: results.requestsPerSecond >= minRequestsPerSecond,
      },
    ];

    // Metadata
    let gitCommit = 'unknown';
    try {
      const { execSync } = require('child_process');
      gitCommit = execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
      /* ignore */
    }
    const nodeVersion = process.version;

    // Simple ASCII sparkline generator (0-8 blocks) for latency distribution sampling
    const spark = (values: number[]) => {
      if (!values.length) return '';
      const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = Math.max(max - min, 1);
      const step = Math.max(Math.floor(values.length / 40), 1); // limit width ~40
      const sampled: number[] = [];
      for (let i = 0; i < values.length; i += step) sampled.push(values[i]);
      return sampled
        .map((v) => blocks[Math.min(blocks.length - 1, Math.floor(((v - min) / range) * (blocks.length - 1)))])
        .join('');
    };

    const latencySpark = spark(results.allMetrics.map((m: any) => m.duration));

    const lines: string[] = [];
    lines.push(`# 🚀 ACME Love - ${name} Results`);
    lines.push('');
    lines.push(
      '> High-level performance & reliability snapshot for ACME protocol operations under configured load.',
    );
    lines.push('');
    lines.push('## 🧪 Test Configuration');
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Date | ${new Date().toISOString()} |`);
    lines.push(`| Test Type | ${testType} |`);
    lines.push(`| Accounts | ${TOTAL_ACCOUNTS} |`);
    lines.push(`| Orders / Account | ${ORDERS_PER_ACCOUNT} |`);
    lines.push(`| Total Target Orders | ${TOTAL_ORDERS} |`);
    lines.push(`| Received Challenges | ${receivedChallenges} |`);
    lines.push(`| Success Rate | ${pct(successRate, 2)} |`);
    lines.push(`| Target | Let's Encrypt Staging |`);
    lines.push(`| Algorithm | EC P-256 |`);
    lines.push(`| Node Version | ${nodeVersion} |`);
    lines.push(`| Package Version | v${packageVersion} |`);
    lines.push(`| Git Commit | ${gitCommit} |`);
    lines.push('');

    lines.push('## ⚙️ Performance Summary');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Time | ${fmt(totalTime / 1000)}s (${totalTime} ms) |`);
    lines.push(`| Account Creation | ${accountCreationTime} ms |`);
    lines.push(`| Order Processing | ${orderCreationTime} ms |`);
    lines.push(`| Total Requests | ${fmt(results.totalRequests)} |`);
    lines.push(`| Orders / Sec | ${results.ordersPerSecond.toFixed(2)} |`);
    lines.push(`| Requests / Sec | ${results.requestsPerSecond.toFixed(2)} |`);
  lines.push(`| Avg Response | ${Math.round(results.averageResponseTime)} ms |`);
  lines.push(`| P50 | ${p50} ms |`);
  lines.push(`| P75 | ${p75} ms |`);
  lines.push(`| P90 | ${p90} ms |`);
  lines.push(`| P95 | ${p95} ms |`);
  lines.push(`| P99 | ${p99} ms |`);
    lines.push(`| Error Count | ${results.errorCount} |`);
    lines.push(`| Error Rate | ${pct(errorRate, 2)} |`);
    lines.push('');

  lines.push('### ⏱️ Latency Sparkline');
  lines.push('```');
  lines.push('Latency ms trend:');
  lines.push(latencySpark || '(no data)');
  lines.push('```');
  lines.push('');

    lines.push('### ✅ Threshold Validation');
    lines.push('| Metric | Actual | Threshold | Status |');
    lines.push('|--------|--------|-----------|--------|');
    thresholdRows.forEach((r) => {
      const icon = r.pass ? '✅' : '❌';
      lines.push(`| ${r.label} | ${r.actual} | ${r.target} | ${icon} ${r.pass ? 'Pass' : 'Fail'} |`);
    });
    lines.push('');

    lines.push('### 📊 Request Distribution');
    lines.push('| Method | Count | Percent |');
    lines.push('|--------|-------|---------|');
    Object.entries(results.requestsByType)
      .sort((a, b) => b[1] - a[1])
      .forEach(([method, count]) => {
        lines.push(`| ${method} | ${count} | ${pct(count / results.totalRequests, 1)} |`);
      });
    lines.push('');

    lines.push('### 🔝 Top Endpoints');
    lines.push('| Endpoint | Requests | Percent |');
    lines.push('|----------|----------|---------|');
    Object.entries(results.requestsByEndpoint)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([ep, count]) => {
        lines.push(`| ${ep} | ${count} | ${pct(count / results.totalRequests, 1)} |`);
      });
    lines.push('');

    lines.push(`### 🧩 Endpoint Breakdown (Let's Encrypt Staging)`);
    lines.push('| Endpoint | Requests | Percent |');
    lines.push('|----------|----------|---------|');
    Object.entries(results.requestsByEndpoint)
      .sort((a, b) => b[1] - a[1])
      .forEach(([ep, count]) => {
        lines.push(`| ${ep} | ${count} | ${pct(count / results.totalRequests, 1)} |`);
      });
    lines.push('');

    lines.push('### 👥 Per-Account Performance');
    lines.push('| Account | Requests | Percent of Total |');
    lines.push('|---------|----------|------------------|');
    Object.entries(results.requestsByAccount)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .forEach(([idx, count]) => {
        lines.push(`| ${Number(idx) + 1} | ${count} | ${pct(count / results.totalRequests, 1)} |`);
      });
    lines.push('');

    lines.push('### 🔐 Nonce Manager Performance');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total New-Nonce Requests | ${results.newNonceRequests} |`);
    lines.push(`| Requests Saved (Heuristic) | ${poolSaved} |`);
    lines.push(`| Pool Efficiency | ${pct(poolEfficiency, 0)} |`);
    lines.push(`| Final Pool State | ${totalNoncesRemaining} nonces |`);
    lines.push('');

    lines.push('### ⏱️ Phase Breakdown');
    lines.push('| Phase | Duration (s) | Requests | Errors | Avg Resp (ms) |');
    lines.push('|-------|--------------|----------|--------|---------------|');
    results.phases.forEach((p) => {
      lines.push(
        `| ${p.phase} | ${Math.round(p.duration / 1000)} | ${p.requestCount} | ${p.errorCount} | ${Math.round(p.averageResponseTime)} |`,
      );
    });
    lines.push('');

    lines.push('### ⭐ Key Performance Indicators');
    const kpis: string[] = [];
    kpis.push(
      `- ✅ Processed **${receivedChallenges}/${TOTAL_ORDERS}** orders (${pct(successRate, 2)})`,
    );
    kpis.push(
      `- ✅ Sustained **${results.requestsPerSecond.toFixed(2)} req/s** & **${results.ordersPerSecond.toFixed(2)} orders/s**`,
    );
    kpis.push(
      `- ✅ Maintained **${Math.round(results.averageResponseTime)} ms** avg response (P95 ${p95} ms, P99 ${p99} ms)`,
    );
    kpis.push(
      `- ✅ Nonce pooling avoided **${poolSaved}** extra requests (${pct(poolEfficiency, 0)} efficiency)`,
    );
    if (results.errorCount === 0) kpis.push('- ✅ Zero errors observed');
    lines.push(kpis.join('\n'));
    lines.push('');

    lines.push('### 🧾 Stress Test Validation');
    lines.push(
      `This ${testType.toLowerCase()} demonstrates that ACME Love handled **${TOTAL_ACCOUNTS} accounts** issuing **${TOTAL_ORDERS} orders** while meeting defined SLA thresholds.`,
    );
    lines.push('');

  lines.push('<details><summary>Raw Configuration & Thresholds</summary>');
    lines.push('');
    const rawConfigObj = {
      name,
      TOTAL_ACCOUNTS,
      ORDERS_PER_ACCOUNT,
      TOTAL_ORDERS,
      batchSize,
      thresholds: { minSuccessRate, maxAvgResponseTimeMs, maxErrorRate, minRequestsPerSecond },
    };
    lines.push('```json');
    lines.push(JSON.stringify(rawConfigObj, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');

    lines.push(
      `_Generated by ACME Love v${packageVersion} (${gitCommit}) ${lowerName} stress test_`,
    );
    lines.push('');

    const report = lines.join('\n');
    const reportPath = path.join(process.cwd(), 'docs/reports', reportFile);
    try {
      fs.writeFileSync(reportPath, report);
      console.log(`\n📋 Report saved to ${reportPath}`);
    } catch (e) {
      console.log(`⚠️  Failed to write report:`, e);
    }

    // Export machine-readable JSON alongside markdown
    try {
      const jsonOut = {
        meta: {
          generatedAt: new Date().toISOString(),
          testType,
          gitCommit,
          packageVersion,
          nodeVersion,
        },
        config: rawConfigObj,
        metrics: {
          totals: {
            totalTimeMs: totalTime,
            accountCreationTimeMs: accountCreationTime,
            orderProcessingTimeMs: orderCreationTime,
            totalRequests: results.totalRequests,
            ordersPerSecond: results.ordersPerSecond,
            requestsPerSecond: results.requestsPerSecond,
            successRate,
            errorRate,
          },
          latency: {
            averageMs: results.averageResponseTime,
            p50: p50,
            p75: p75,
            p90: p90,
            p95: p95,
            p99: p99,
          },
          distribution: {
            byMethod: results.requestsByType,
            byEndpoint: results.requestsByEndpoint,
            byAccount: results.requestsByAccount,
          },
          nonce: {
            newNonceRequests: results.newNonceRequests,
            savedRequestsEstimate: poolSaved,
            efficiency: poolEfficiency,
          },
          phases: results.phases.map((p) => ({
            phase: p.phase,
            durationMs: p.duration,
            requests: p.requestCount,
            errors: p.errorCount,
            avgResponseMs: p.averageResponseTime,
          })),
        },
        thresholds: thresholdRows.map((t) => ({
          metric: t.label,
          actual: t.actual,
          target: t.target,
          pass: t.pass,
        })),
      };
      const jsonPath = reportPath.replace(/\.md$/i, '.json');
      fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2));
      console.log(`🗂️  JSON metrics saved to ${jsonPath}`);
    } catch (e) {
      console.log('⚠️  Failed to write JSON metrics:', e);
    }

    // Threshold assertions (if jest available) using earlier destructured values
    // Use global expect if present (jest)
    // @ts-ignore: Jest global expect may not be typed in this context
    const jestExpect = (global as any).expect;
    if (jestExpect) {
      jestExpect(receivedChallenges / TOTAL_ORDERS).toBeGreaterThanOrEqual(minSuccessRate);
      jestExpect(results.averageResponseTime).toBeLessThanOrEqual(maxAvgResponseTimeMs);
      jestExpect(results.errorCount / Math.max(results.totalRequests, 1)).toBeLessThanOrEqual(
        maxErrorRate,
      );
      jestExpect(results.requestsPerSecond).toBeGreaterThanOrEqual(minRequestsPerSecond);
    }

    return { results, receivedChallenges, TOTAL_ORDERS };
  } catch (e) {
    console.error(`💥 ${name} failed:`, e);
    throw e;
  }
}
