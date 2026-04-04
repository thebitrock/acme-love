import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ServerMaintenanceError } from '../../src/index.js';
import { handleError } from '../../src/cli/utils/errors.js';

describe('handleError', () => {
  let errorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('handles ServerMaintenanceError with specific output', () => {
    const err = new ServerMaintenanceError('maintenance detail');
    handleError(err);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Service Maintenance'));
    expect(errorSpy).toHaveBeenCalledWith('The ACME server is currently under maintenance.');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('maintenance detail'));
  });

  it('handles generic Error with "maintenance" in message', () => {
    handleError(new Error('server in maintenance mode'));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Service Maintenance (heuristic)'),
    );
    expect(errorSpy).toHaveBeenCalledWith('server in maintenance mode');
  });

  it('handles generic Error with "http 503" in message', () => {
    handleError(new Error('HTTP 503 Service Unavailable'));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Service Maintenance (heuristic)'),
    );
  });

  it('handles regular Error with standard message', () => {
    handleError(new Error('something went wrong'));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error:'),
      'something went wrong',
    );
  });

  it('handles non-Error value', () => {
    handleError('string error');

    expect(errorSpy).toHaveBeenCalledWith('Unknown error:', 'string error');
  });

  it('handles null value', () => {
    handleError(null);

    expect(errorSpy).toHaveBeenCalledWith('Unknown error:', null);
  });
});
