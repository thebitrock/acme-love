import { jest } from '@jest/globals';

// Mock command handlers BEFORE importing program factory (ESM)
jest.unstable_mockModule('../../src/cli/commands/cert.js', () => ({
  handleCertCommand: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../../src/cli/commands/create-account-key.js', () => ({
  handleCreateAccountKey: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../../src/cli/commands/interactive.js', () => ({
  handleInteractiveMode: jest.fn(async () => {}),
}));

// Import after mocks
const { runCli } = await import('../../src/cli/program.js');
const certModule = await import('../../src/cli/commands/cert.js');
const accountKeyModule = await import('../../src/cli/commands/create-account-key.js');

// Utility to run with test env
function withTestEnv(fn: () => Promise<void>) {
  return async () => {
    process.env.ACME_CLI_TEST = '1';
    try {
      await fn();
    } finally {
      delete process.env.ACME_CLI_TEST;
    }
  };
}

describe('acme-love CLI', () => {
  test(
    'registers core commands',
    withTestEnv(async () => {
      process.env.ACME_CLI_TEST = '1';
      await expect(runCli(['--help'])).resolves.toBeDefined();
      delete process.env.ACME_CLI_TEST;
    }),
  );

  test(
    'passes options to cert command and does not prompt',
    withTestEnv(async () => {
      const handleCert = certModule.handleCertCommand as jest.Mock;
      await runCli([
        'cert',
        '--domain',
        'example.com',
        '--email',
        'admin@example.com',
        '--staging',
        '--challenge',
        'http-01',
        '--account-algo',
        'ec-p256',
        '--cert-algo',
        'ec-p256',
        '--output',
        './tmp-certs',
        '--account-key',
        './tmp-certs/account.json',
      ]);
      expect(handleCert).toHaveBeenCalledTimes(1);
      const passed = handleCert.mock.calls[0][0];
      expect(passed).toMatchObject({
        domain: 'example.com',
        email: 'admin@example.com',
        staging: true,
        challenge: 'http-01',
        output: './tmp-certs',
        accountKey: './tmp-certs/account.json',
      });
    }),
  );

  test(
    'create-account-key command forwards options',
    withTestEnv(async () => {
      const handleCreate = accountKeyModule.handleCreateAccountKey as jest.Mock;
      await runCli(['create-account-key', '--output', './ak.json', '--algo', 'ec-p384']);
      expect(handleCreate).toHaveBeenCalledWith({ output: './ak.json', algo: 'ec-p384' });
    }),
  );
});
