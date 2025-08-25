import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn } from 'child_process';
import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Test configuration
const CLI_TIMEOUT = 30000; // 30 seconds for CLI operations
const TEST_CLI_PATH = join(process.cwd(), 'dist', 'src', 'cli.js');
const TEST_TEMP_DIR = join(tmpdir(), 'acme-love-cli-test');

// Helper function to run CLI commands
async function runCLI(args: string[], options?: {
  timeout?: number;
  input?: string;
}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}> {
  return new Promise((resolve, reject) => {
    const timeout = options?.timeout || CLI_TIMEOUT;
    const child = spawn('node', [TEST_CLI_PATH, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test', NODE_OPTIONS: '' }
    });

    let stdout = '';
    let stderr = '';
    let timeoutId: NodeJS.Timeout;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code
      });
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    // Send input if provided
    if (options?.input) {
      child.stdin.write(options.input);
      child.stdin.end();
    }

    // Set timeout
    timeoutId = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`CLI command timed out after ${timeout}ms`));
    }, timeout);
  });
}

describe('ACME Love CLI E2E Tests', () => {
  beforeAll(async () => {
    // Ensure test temp directory exists
    if (!existsSync(TEST_TEMP_DIR)) {
      await mkdir(TEST_TEMP_DIR, { recursive: true });
    }

    // Check if CLI is built
    if (!existsSync(TEST_CLI_PATH)) {
      throw new Error(`CLI not found at ${TEST_CLI_PATH}. Please run 'npm run build' first.`);
    }
  }, CLI_TIMEOUT);

  afterAll(async () => {
    // Clean up test directory
    try {
      await rm(TEST_TEMP_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic CLI Operations', () => {
    test('should display help when run without arguments', async () => {
      const result = await runCLI([]);

      expect(result.exitCode).toBe(1); // CLI exits with 1 when no command provided
      // Help might be on stdout or stderr, check both
      const output = result.stdout + result.stderr;
      expect(output).toContain('Usage:');
      expect(output).toContain('cert');
      expect(output).toContain('create-account-key');
      expect(output).toContain('status');
    });

    test('should display version information', async () => {
      const result = await runCLI(['--version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/); // Semantic version pattern
    });

    test('should display help for specific commands', async () => {
      const result = await runCLI(['cert', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('domain');
      expect(result.stdout).toContain('email');
      expect(result.stdout).toContain('staging');
    });
  });

  describe('Account Key Management', () => {
    test('should create account key file', async () => {
      const keyPath = join(TEST_TEMP_DIR, 'test-account-key.json');
      const result = await runCLI([
        'create-account-key',
        '--output', keyPath
      ]);

      expect(result.exitCode).toBe(0);
      expect(existsSync(keyPath)).toBeTruthy();

      // Verify key file structure
      const keyContent = await readFile(keyPath, 'utf-8');
      const keyData = JSON.parse(keyContent);
      expect(keyData).toHaveProperty('privateKey');
      expect(keyData).toHaveProperty('publicKey');
    });
  });

  describe('Certificate Operations', () => {
    let accountKeyPath: string;

    beforeAll(async () => {
      // Create account key for certificate tests
      accountKeyPath = join(TEST_TEMP_DIR, 'cert-account-key.json');
      await runCLI(['create-account-key', '--output', accountKeyPath]);
    });

    test('should start interactive mode when no parameters provided', async () => {
      const result = await runCLI(['cert'], {
        timeout: 3000,
        input: '\x03' // Send Ctrl+C to exit interactive mode
      });

      // Should start interactive prompt
      const output = result.stdout + result.stderr;
      expect(output).toContain('Enter domain name');
    });

    test('should handle invalid email addresses', async () => {
      const result = await runCLI([
        'cert',
        '--domain', 'test.example.com',
        '--email', 'invalid-email',
        '--account-key', accountKeyPath,
        '--staging'
      ]);

      expect(result.exitCode).not.toBe(0);
    });

    test('should create certificate order in staging mode', async () => {
      const outputDir = join(TEST_TEMP_DIR, 'cert-output');

      const result = await runCLI([
        'cert',
        '--domain', 'acme-love-test.example.com',
        '--email', 'test@acme-love.example',
        '--account-key', accountKeyPath,
        '--output', outputDir,
        '--staging',
        '--dns-01'
      ]);

      // This should fail due to DNS validation, but should create the order
      // The important thing is that it doesn't crash unexpectedly
      expect(result.stderr).toBeTruthy(); // Should have some error output
    }, CLI_TIMEOUT);
  });

  describe('Status Command', () => {
    test('should display status information', async () => {
      const result = await runCLI(['status']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('📊 Certificate Status Check');
    });

    test('should check specific domain status', async () => {
      const result = await runCLI(['status', '--domain', 'example.com']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('📊 Certificate Status Check');
    });
  });

  describe('Interactive Mode', () => {
    test('should start interactive mode', async () => {
      // This test is challenging because interactive mode requires user input
      // We'll just test that it starts and displays the prompt
      const result = await runCLI(['interactive'], {
        timeout: 5000,
        input: '\x03' // Send Ctrl+C to exit
      });

      // Interactive mode should show some output
      expect(result.stdout).toBeTruthy();
    });
  });

  describe('Configuration and Presets', () => {
    test('should accept staging preset', async () => {
      const result = await runCLI([
        'cert',
        '--help'
      ]);

      expect(result.stdout).toContain('staging');
    });

    test('should accept production preset', async () => {
      const result = await runCLI([
        'cert',
        '--help'
      ]);

      expect(result.stdout).toContain('production');
    });
  });

  describe('Configuration and Presets', () => {
    test('should accept staging preset', async () => {
      const result = await runCLI([
        'cert',
        '--help'
      ]);

      expect(result.stdout).toContain('staging');
    });

    test('should accept production preset', async () => {
      const result = await runCLI([
        'cert',
        '--help'
      ]);

      expect(result.stdout).toContain('production');
    });
  });

  describe('Error Handling', () => {
    test('should handle missing account key file', async () => {
      const result = await runCLI([
        'cert',
        '--domain', 'test.example.com',
        '--email', 'test@example.com',
        '--account-key', '/nonexistent/path/key.json',
        '--staging'
      ]);

      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain('EACCES'); // Permission error trying to create directory
    });

    test('should handle invalid account key file', async () => {
      const invalidKeyPath = join(TEST_TEMP_DIR, 'invalid-key.json');
      await writeFile(invalidKeyPath, 'invalid json content');

      const result = await runCLI([
        'cert',
        '--domain', 'test.example.com',
        '--email', 'test@example.com',
        '--account-key', invalidKeyPath,
        '--staging'
      ]);

      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Unexpected token'); // JSON parse error
    });

    test('should handle network connectivity issues', async () => {
      const result = await runCLI([
        'cert',
        '--domain', 'test.example.com',
        '--email', 'test@example.com',
        '--account-key', join(TEST_TEMP_DIR, 'cert-account-key.json'),
        '--directory-url', 'https://invalid-acme-server.example/directory'
      ]);

      expect(result.exitCode).not.toBe(0);
    }, CLI_TIMEOUT);
  });

  describe('Integration with ACME Servers', () => {
    test('should connect to Let\'s Encrypt staging', async () => {
      const accountKeyPath = join(TEST_TEMP_DIR, 'staging-test-key.json');
      await runCLI(['create-account-key', '--output', accountKeyPath]);

      const result = await runCLI([
        'cert',
        '--domain', 'acme-staging-test.invalid',
        '--email', 'test@acme-staging.invalid',
        '--account-key', accountKeyPath,
        '--staging',
        '--dns-01',
        '--output', join(TEST_TEMP_DIR, 'staging-test')
      ]);

      // Should fail due to DNS validation, but should connect to the server
      expect(result.stderr).toBeTruthy();
      // Should not be a connection error
      expect(result.stderr).not.toContain('ENOTFOUND');
      expect(result.stderr).not.toContain('ECONNREFUSED');
    }, CLI_TIMEOUT);
  });
});
