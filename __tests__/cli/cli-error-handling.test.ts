import { jest } from '@jest/globals';

// Mock cert command to throw
jest.unstable_mockModule('../../src/cli/commands/cert.js', () => ({
  handleCertCommand: jest.fn(async () => {
    throw new Error('boom failure');
  }),
}));

const { runCli } = await import('../../src/cli/program.js');

describe('CLI error handling', () => {
  test('prints error message when command throws', async () => {
    process.env.ACME_CLI_TEST = '1';
    try {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await runCli(['cert', '--domain', 'ex.com', '--email', 'a@b.c', '--staging']);
      const joined = errSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(joined.toLowerCase()).toContain('error:');
      errSpy.mockRestore();
    } finally {
      delete process.env.ACME_CLI_TEST;
    }
  });
});
