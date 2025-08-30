import chalk from 'chalk';
import ora from 'ora';
import type { Ora } from 'ora';

export interface SpinnerHandle {
  start(text: string): SpinnerHandle;
  succeed(text?: string): SpinnerHandle;
  fail(text?: string): SpinnerHandle;
  info(text?: string): SpinnerHandle;
  warn(text?: string): SpinnerHandle;
  stop(): void;
}

/**
 * Simple wrapper around ora providing chainable API and consistent colors.
 */
export function createSpinner(): SpinnerHandle {
  let spinner: Ora | undefined;

  function ensure(text: string) {
    if (!spinner) spinner = ora(text).start();
    else spinner.text = text;
  }

  return {
    start(text: string) {
      ensure(text);
      return this;
    },
    succeed(text?: string) {
      spinner?.succeed(text && chalk.green(text));
      return this;
    },
    fail(text?: string) {
      spinner?.fail(text && chalk.red(text));
      return this;
    },
    info(text?: string) {
      spinner?.info(text && chalk.cyan(text));
      return this;
    },
    warn(text?: string) {
      spinner?.warn(text && chalk.yellow(text));
      return this;
    },
    stop() {
      spinner?.stop();
    },
  };
}

export const symbols = {
  success: chalk.green('✔'),
  fail: chalk.red('✖'),
  warn: chalk.yellow('⚠'),
  info: chalk.cyan('ℹ'),
};

export function heading(title: string) {
  console.log('\n' + chalk.bold.blue(title));
}

export function kv(label: string, value: string) {
  console.log('  ' + chalk.gray(label + ':') + ' ' + chalk.white(value));
}

/** Lightweight render helpers to avoid scattered console.log formatting */
export const render = {
  line(msg = '') {
    console.log(msg);
  },
  success(msg: string) {
    console.log(symbols.success + ' ' + chalk.green(msg));
  },
  info(msg: string) {
    console.log(symbols.info + ' ' + chalk.cyan(msg));
  },
  dim(msg: string) {
    console.log(symbols.info + ' ' + chalk.gray(msg));
  },
  warn(msg: string) {
    console.log(symbols.warn + ' ' + chalk.yellow(msg));
  },
  error(msg: string) {
    console.log(symbols.fail + ' ' + chalk.red(msg));
  },
  list(values: string[]) {
    values.forEach((v) => console.log('  - ' + chalk.white(v)));
  },
};
