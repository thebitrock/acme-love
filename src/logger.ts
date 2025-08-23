import debug from 'debug';

// debug.enable('acme-love');
let logger: unknown;
const debugLogger = debug('acme-love');

export function setLogger(fn: unknown): void {
  logger = fn;
}

export function logWarn(message: string, ...args: unknown[]): void {
  const warnMessage = `WARN: ${message}`;

  if (typeof logger === 'function') {
    logger(warnMessage);
  }

  debugLogger(warnMessage, ...args);
}
