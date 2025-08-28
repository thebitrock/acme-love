import { describe, test, beforeAll } from '@jest/globals';
import { runStressTest } from './utils/stress-runner.js';

// Heavy stress test: 4 accounts × 200 orders = 800 orders total
describe('ACME Heavy Stress Test - 4 Accounts × 200 Orders', () => {
  const config = {
    name: 'Heavy Stress Test',
    accounts: 4,
    ordersPerAccount: 200,
    directoryUrl: 'https://acme-staging-v02.api.letsencrypt.org/directory',
    batchSize: 10,
    reportFile: 'HEAVY-STRESS-TEST-RESULTS.md',
    envSkipVar: 'ACME_HEAVY_STRESS_ENABLED',
    noncePoolSizePerAccount: 20,
    thresholds: {
      minSuccessRate: 0.8,
      maxAvgResponseTimeMs: 5000,
      maxErrorRate: 0.1,
      minRequestsPerSecond: 1,
    },
  } as const;

  beforeAll(() => {
    if (process.env.CI && !process.env.ACME_HEAVY_STRESS_ENABLED) {
      console.log('⚠️  Skipping heavy stress test in CI environment');
      console.log('   Set ACME_HEAVY_STRESS_ENABLED=1 to run heavy stress test in CI');
    } else {
      console.log('🚀 Starting Heavy Stress Test');
    }
  });

  test('should handle heavy concurrent load', async () => {
    if (process.env.CI && !process.env.ACME_HEAVY_STRESS_ENABLED) return;
    await runStressTest(config);
  }, 600000);
});
