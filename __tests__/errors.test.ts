import {
  AcmeError,
  BadNonceError,
  UnauthorizedError,
  ServerInternalError,
  createErrorFromProblem,
} from '../src/errors.js';

describe('ACME Errors', () => {
  describe('AcmeError base class', () => {
    it('should create a base error with correct properties', () => {
      const error = new AcmeError('Test ACME error', 400);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AcmeError);
      expect(error.message).toBe('Test ACME error');
      expect(error.status).toBe(400);
      expect(error.type).toBe('urn:ietf:params:acme:error:serverInternal');
      expect(error.detail).toBe('Test ACME error');
    });

    it('should serialize to JSON correctly', () => {
      const error = new AcmeError('Test ACME error', 400);
      const json = error.toJSON();

      // Status is not included in toJSON according to implementation
      expect(json).toEqual({
        type: 'urn:ietf:params:acme:error:serverInternal',
        detail: 'Test ACME error',
      });
    });
  });

  describe('Specific error classes', () => {
    it('should create a BadNonceError correctly', () => {
      const error = new BadNonceError('Invalid nonce');

      expect(error).toBeInstanceOf(AcmeError);
      expect(error).toBeInstanceOf(BadNonceError);
      expect(error.message).toBe('Invalid nonce');
      expect(error.type).toBe('urn:ietf:params:acme:error:badNonce');
      expect(error.status).toBe(400);
    });

    it('should create an UnauthorizedError correctly', () => {
      const error = new UnauthorizedError('Not authorized');

      expect(error).toBeInstanceOf(AcmeError);
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toBe('Not authorized');
      expect(error.type).toBe('urn:ietf:params:acme:error:unauthorized');
      expect(error.status).toBe(401);
    });

    it('should create a ServerInternalError correctly', () => {
      const error = new ServerInternalError('Internal server error');

      expect(error).toBeInstanceOf(AcmeError);
      expect(error).toBeInstanceOf(ServerInternalError);
      expect(error.message).toBe('Internal server error');
      expect(error.type).toBe('urn:ietf:params:acme:error:serverInternal');
      expect(error.status).toBe(500);
    });
  });

  describe('createErrorFromProblem factory', () => {
    it('should create the correct error type from problem details', () => {
      const problem = {
        type: 'urn:ietf:params:acme:error:badNonce',
        detail: 'The provided nonce was invalid',
        status: 400,
      };

      const error = createErrorFromProblem(problem);

      expect(error).toBeInstanceOf(BadNonceError);
      expect(error.message).toBe('The provided nonce was invalid');
      expect(error.status).toBe(400);
    });

    it('should fall back to AcmeError for unknown types', () => {
      const problem = {
        type: 'urn:ietf:params:acme:error:unknownType',
        detail: 'Some unknown error',
        status: 400,
      };

      const error = createErrorFromProblem(problem);

      expect(error).toBeInstanceOf(AcmeError);
      expect(error.message).toBe('Some unknown error');
      expect(error.status).toBe(400);
      expect(error.type).toBe('urn:ietf:params:acme:error:unknownType');
    });

    it('should handle missing details', () => {
      const problem = {
        type: 'urn:ietf:params:acme:error:badNonce',
      };

      const error = createErrorFromProblem(problem);

      expect(error).toBeInstanceOf(BadNonceError);
      expect(error.message).toBe('Unknown error');
      expect(error.detail).toBe('Unknown error');
    });
  });
});
