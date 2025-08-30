import { describe, test } from '@jest/globals';
import { runStressTest } from './utils/stress-runner.js';

// Quick stress test: 2 accounts × 20 orders = 40 orders total
describe('ACME Quick Stress Test - 2 Accounts × 20 Orders', () => {
  const config = {
    name: 'Quick Stress Test',
    accounts: 2,
    ordersPerAccount: 20,
    directoryUrl: 'https://acme-staging-v02.api.letsencrypt.org/directory',
    batchSize: 40,
    reportFile: 'QUICK-STRESS-TEST-RESULTS.md',
    noncePoolSizePerAccount: 10,
    thresholds: {
      minSuccessRate: 0.7,
      maxAvgResponseTimeMs: 4000,
      maxErrorRate: 0.3,
      minRequestsPerSecond: 1,
    },
  } as const;

  test('should handle quick concurrent load', async () => {
    await runStressTest(config);
  }, 120000);
});
