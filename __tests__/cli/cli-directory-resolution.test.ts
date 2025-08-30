import { jest } from '@jest/globals';

// Mock prompts for directory selection
const stagingUrl = 'https://acme-staging-v02.api.letsencrypt.org/directory';
// (prod URL unused in these tests)

jest.unstable_mockModule('@inquirer/prompts', () => ({
  select: jest.fn(async () => stagingUrl),
  input: jest.fn(async () => 'https://custom.example/directory'),
  confirm: jest.fn(async () => false),
}));

// Minimal mocks to avoid executing heavy logic
jest.unstable_mockModule('../../src/cli/commands/cert.js', () => ({
  handleCertCommand: jest.fn(async () => {}),
}));

const { runCli } = await import('../../src/cli/program.js');
const certModule = await import('../../src/cli/commands/cert.js');

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

describe('Directory resolution precedence', () => {
  test(
    'staging flag overrides prompts',
    withTestEnv(async () => {
      await runCli(['cert', '--domain', 'ex.com', '--email', 'a@b.c', '--staging']);
      const passed = (certModule.handleCertCommand as jest.Mock).mock.calls[0][0] as any;
      expect(passed.staging).toBe(true);
      expect(passed.production).toBeUndefined();
    }),
  );

  test(
    'production flag sets production',
    withTestEnv(async () => {
      (certModule.handleCertCommand as jest.Mock).mockClear();
      await runCli(['cert', '--domain', 'ex.com', '--email', 'a@b.c', '--production']);
      const passed = (certModule.handleCertCommand as jest.Mock).mock.calls[0][0] as any;
      expect(passed.production).toBe(true);
    }),
  );

  test(
    'custom directory flag passes through',
    withTestEnv(async () => {
      (certModule.handleCertCommand as jest.Mock).mockClear();
      const custom = 'https://api.example/directory';
      await runCli(['cert', '--domain', 'ex.com', '--email', 'a@b.c', '--directory', custom]);
      const passed = (certModule.handleCertCommand as jest.Mock).mock.calls[0][0] as any;
      expect(passed.directory).toBe(custom);
    }),
  );
});
