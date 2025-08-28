import { describe, test } from '@jest/globals';
import { runStressTest } from './utils/stress-runner.js';

// Standard stress test: 4 accounts × 50 orders = 200 orders total
describe('ACME Standard Stress Test - 4 Accounts × 50 Orders', () => {
  const config = {
    name: 'Standard Stress Test',
    accounts: 4,
    ordersPerAccount: 50,
    directoryUrl: 'https://acme-staging-v02.api.letsencrypt.org/directory',
    batchSize: 10,
    reportFile: 'STANDARD-STRESS-TEST-RESULTS.md',
    envSkipVar: 'ACME_LIGHT_STRESS_ENABLED',
    noncePoolSizePerAccount: 15,
    thresholds: {
      minSuccessRate: 0.75,
      maxAvgResponseTimeMs: 5000,
      maxErrorRate: 0.2,
      minRequestsPerSecond: 1,
    },
  } as const;

  test('should handle standard concurrent load', async () => {
    if (process.env.CI && !process.env.ACME_LIGHT_STRESS_ENABLED) return; // optional skip
    await runStressTest(config);
  }, 300000);
});
