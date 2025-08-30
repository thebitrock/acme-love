#!/usr/bin/env node

// Thin orchestrator: real logic in ./cli/commands & ./cli/utils
/**
 * CLI entrypoint registering subcommands. Keep lean; substantive logic resides in modular command files.
 */
import { createCli } from './cli/program.js';
import { handleError } from './cli/utils/errors.js';

// Build program (test friendly)
const program = createCli();

function exitUnlessTest(code: number) {
  if (process.env.ACME_CLI_TEST) return; // let tests continue
  process.exit(code);
}

process.on('unhandledRejection', (err) => {
  handleError(err);
  exitUnlessTest(1);
});
process.on('uncaughtException', (err) => {
  handleError(err);
  exitUnlessTest(1);
});

program.parse();
