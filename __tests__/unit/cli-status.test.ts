import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { existsSync } from 'fs';

jest.unstable_mockModule('fs', () => ({
  existsSync: jest.fn(),
}));

const { handleStatusCommand } = await import('../../src/cli/commands/status.js');
const fs = await import('fs');
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof existsSync>;

describe('handleStatusCommand', () => {
  let logSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockExistsSync.mockReset();
  });

  it('prints header', async () => {
    await handleStatusCommand({});
    expect(logSpy).toHaveBeenCalledWith('Certificate Status\n');
  });

  it('prints not found when cert file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    await handleStatusCommand({ cert: '/nonexistent.crt' });
    expect(logSpy).toHaveBeenCalledWith('Certificate file not found: /nonexistent.crt');
  });

  it('prints file path when cert exists', async () => {
    mockExistsSync.mockReturnValue(true);
    await handleStatusCommand({ cert: '/path/to/cert.crt' });
    expect(logSpy).toHaveBeenCalledWith('Certificate file: /path/to/cert.crt');
    expect(logSpy).toHaveBeenCalledWith('Parsing not implemented yet');
  });

  it('prints domain info', async () => {
    await handleStatusCommand({ domain: 'example.com' });
    expect(logSpy).toHaveBeenCalledWith('Domain: example.com');
    expect(logSpy).toHaveBeenCalledWith('Remote SSL check not implemented yet');
  });

  it('handles both cert and domain', async () => {
    mockExistsSync.mockReturnValue(true);
    await handleStatusCommand({ cert: '/cert.crt', domain: 'example.com' });
    expect(logSpy).toHaveBeenCalledWith('Certificate file: /cert.crt');
    expect(logSpy).toHaveBeenCalledWith('Domain: example.com');
  });
});
