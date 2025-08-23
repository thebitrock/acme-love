import { AcmeError } from '../src/errors.js';

describe('ACME Error Simple Tests', () => {
  it('should create an error with proper properties', () => {
    const error = new AcmeError('Test error', 400);

    expect(error.message).toBe('Test error');
    expect(error.detail).toBe('Test error');
    expect(error.status).toBe(400);
    expect(error.type).toBe('urn:ietf:params:acme:error:serverInternal');
  });
});
