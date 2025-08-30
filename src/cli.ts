#!/usr/bin/env node

// Thin orchestrator: real logic in ./cli/commands & ./cli/utils
/**
 * CLI entrypoint registering subcommands. Keep lean; substantive logic resides in modular command files.
 */
import { program } from 'commander';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { handleError } from './cli/utils/errors.js';
import { handleCertCommand } from './cli/commands/cert.js';
import { handleCreateAccountKey } from './cli/commands/create-account-key.js';
import { handleInteractiveMode } from './cli/commands/interactive.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));

program.name('acme-love').description('CLI for ACME certificate management').version(pkg.version);

program
  .command('cert')
  .description('Obtain SSL certificate using ACME protocol')
  .option('-d, --domain <domain>', 'Domain name for certificate')
  .option('-e, --email <email>', 'Email for ACME account registration')
  .option('--staging', "Use Let's Encrypt staging environment")
  .option('--production', "Use Let's Encrypt production environment")
  .option('--directory <url>', 'Custom ACME directory URL')
  .option('-o, --output <path>', 'Output directory for certificates', './certificates')
  .option('--account-key <path>', 'Path to account private key')
  .option('--force', 'Force certificate renewal even if valid')
  .option('--challenge <type>', 'Challenge type: dns-01 or http-01', 'dns-01')
  .option('--account-algo <algo>', 'Account key algorithm', 'ec-p256')
  .option('--cert-algo <algo>', 'Certificate key algorithm', 'ec-p256')
  .option('--eab-kid <kid>', 'External Account Binding key identifier')
  .option('--eab-hmac-key <key>', 'External Account Binding HMAC key (base64url)')
  .action(async (opts) => {
    try {
      await handleCertCommand(opts);
    } catch (e) {
      handleError(e);
      process.exit(1);
    }
  });

program
  .command('create-account-key')
  .description('Create new ACME account private key')
  .option('-o, --output <path>', 'Output path for account key', './account-key.json')
  .option('--algo <algo>', 'Key algorithm', 'ec-p256')
  .action(async (opts) => {
    try {
      await handleCreateAccountKey(opts);
    } catch (e) {
      handleError(e);
      process.exit(1);
    }
  });

program
  .command('interactive')
  .alias('i')
  .description('Interactive mode for certificate management')
  .option('--staging', "Use Let's Encrypt staging environment")
  .option('--production', "Use Let's Encrypt production environment")
  .option('--directory <url>', 'Custom ACME directory URL')
  .action(async (opts) => {
    try {
      await handleInteractiveMode(opts);
    } catch (e) {
      handleError(e);
      process.exit(1);
    }
  });

process.on('unhandledRejection', (err) => {
  handleError(err);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  handleError(err);
  process.exit(1);
});

program.parse();
