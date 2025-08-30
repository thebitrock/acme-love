import { jest } from '@jest/globals';

// Mock prompts to simulate user choices
jest.unstable_mockModule('@inquirer/prompts', () => ({
  select: jest.fn(async (cfg: any) => {
    if (cfg.message.includes('Select ACME directory'))
      return 'https://acme-staging-v02.api.letsencrypt.org/directory';
    if (cfg.message.includes('Choose action')) return 'exit';
    return 'ec-p256';
  }),
  input: jest.fn(async () => 'user-input'),
  confirm: jest.fn(async () => false),
}));

// Mock handlers to verify flow
jest.unstable_mockModule('../../src/cli/commands/cert.js', () => ({
  handleCertCommand: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../../src/cli/commands/create-account-key.js', () => ({
  handleCreateAccountKey: jest.fn(async () => {}),
}));

const { runCli } = await import('../../src/cli/program.js');
const certModule = await import('../../src/cli/commands/cert.js');
const accountKeyModule = await import('../../src/cli/commands/create-account-key.js');

describe('Interactive mode', () => {
  test('exits cleanly when user selects exit', async () => {
    process.env.ACME_CLI_TEST = '1';
    try {
      await runCli(['interactive']);
      expect((certModule.handleCertCommand as jest.Mock).mock.calls.length).toBe(0);
      expect((accountKeyModule.handleCreateAccountKey as jest.Mock).mock.calls.length).toBe(0);
    } finally {
      delete process.env.ACME_CLI_TEST;
    }
  });
});
