import { Command } from 'commander';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { handleError } from './utils/errors.js';
import { handleCertCommand } from './commands/cert.js';
import { handleCreateAccountKey } from './commands/create-account-key.js';
import { handleInteractiveMode } from './commands/interactive.js';

/** Build a Commander program instance for the acme-love CLI. */
export function createCli(): Command {
  const program = new Command();
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));

  program.name('acme-love').description('CLI for ACME certificate management').version(pkg.version);

  // In test mode override default exit (help, errors) to throw instead of process.exit
  if (process.env.ACME_CLI_TEST) {
    program.exitOverride();
  }

  // Helper deciding whether to exit (skip during tests)
  function exitOnError() {
    if (process.env.ACME_CLI_TEST) return; // allow tests to assert thrown errors
    process.exit(1);
  }

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
        await handleCertCommand({
          domain: opts.domain,
          email: opts.email,
          staging: opts.staging,
          production: opts.production,
          directory: opts.directory,
          output: opts.output,
          accountKey: opts.accountKey,
          force: opts.force,
          challenge: opts.challenge,
          accountAlgo: opts.accountAlgo,
          certAlgo: opts.certAlgo,
          eabKid: opts.eabKid,
          eabHmacKey: opts.eabHmacKey,
        });
      } catch (e) {
        handleError(e);
        exitOnError();
      }
    });

  program
    .command('create-account-key')
    .description('Create new ACME account private key')
    .option('-o, --output <path>', 'Output path for account key', './account-key.json')
    .option('--algo <algo>', 'Key algorithm', 'ec-p256')
    .action(async (opts) => {
      try {
        await handleCreateAccountKey({ output: opts.output, algo: opts.algo });
      } catch (e) {
        handleError(e);
        exitOnError();
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
        await handleInteractiveMode({
          staging: opts.staging,
          production: opts.production,
          directory: opts.directory,
        });
      } catch (e) {
        handleError(e);
        exitOnError();
      }
    });

  return program;
}

/** For tests: parse arguments and return the program (no automatic exit). */
export async function runCli(argv: string[]): Promise<Command> {
  const program = createCli();
  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (process.env.ACME_CLI_TEST && e?.code === 'commander.helpDisplayed') {
      // ignore help in tests
    } else if (process.env.ACME_CLI_TEST && e?.code === 'commander.version') {
      // ignore version output
    } else if (process.env.ACME_CLI_TEST && e?.code === 'commander.executeSubCommandAsync') {
      // allow async subcommand resolution
    } else if (process.env.ACME_CLI_TEST) {
      // rethrow other errors for assertion
      throw err;
    } else {
      throw err;
    }
  }
  return program;
}
