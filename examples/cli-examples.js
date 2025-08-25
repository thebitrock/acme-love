#!/usr/bin/env node

// ACME Love CLI usage examples

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, 'dist', 'src', 'cli.js');

function runCLI(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [cliPath, ...args], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`CLI exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

// Command examples
async function examples() {
  console.log('🔐 ACME Love CLI Examples\n');

  console.log('1. Show help:');
  console.log('   npx acme-love --help\n');

  console.log('2. Create account key:');
  console.log('   npx acme-love create-account-key -o ./my-account.json\n');

  console.log('3. Get certificate (interactive):');
  console.log('   npx acme-love cert\n');

  console.log('4. Get certificate with parameters:');
  console.log('   npx acme-love cert -d example.com -e admin@example.com --staging\n');

  console.log('5. Interactive mode:');
  console.log('   npx acme-love interactive\n');

  console.log('6. Check certificate status:');
  console.log('   npx acme-love status -c ./certificates/example.com.crt\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  examples().catch(console.error);
}

export { runCLI };
