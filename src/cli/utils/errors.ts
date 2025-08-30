import { ServerMaintenanceError } from '../../index.js';
import chalk from 'chalk';

/** Central error handler for CLI commands with ACME maintenance heuristics. */
export function handleError(error: unknown): void {
  if (error instanceof ServerMaintenanceError) {
    console.error('\n' + chalk.yellow('Service Maintenance'));
    console.error('The ACME server is currently under maintenance.');
    console.error('Check status: https://letsencrypt.status.io/');
    console.error('Try again later.');
    console.error(chalk.gray(error.detail));
  } else if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('maintenance') || message.includes('http 503')) {
      console.error('\n' + chalk.yellow('Service Maintenance (heuristic)'));
      console.error(error.message);
    } else {
      console.error(chalk.red('Error:'), error.message);
    }
  } else {
    console.error('Unknown error:', error);
  }
}
