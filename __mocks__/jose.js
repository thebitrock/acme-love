// Mock for jose library to handle ESM import issues in Jest (CommonJS format)

// Mock for FlattenedSign constructor
const FlattenedSign = jest.fn().mockImplementation(() => ({
  setProtectedHeader: jest.fn().mockReturnThis(),
  sign: jest.fn().mockResolvedValue({
    protected: 'mock-protected-header',
    payload: 'mock-payload',
    signature: 'mock-signature'
  })
}));

// Mock for SignJWT constructor
const SignJWT = jest.fn().mockImplementation(() => ({
  setProtectedHeader: jest.fn().mockReturnThis(),
  setIssuedAt: jest.fn().mockReturnThis(),
  setExpirationTime: jest.fn().mockReturnThis(),
  sign: jest.fn().mockResolvedValue('mocked.jwt.token')
}));

// Mock for various functions
const importJWK = jest.fn().mockResolvedValue({
  alg: 'ES256',
  crv: 'P-256',
  kty: 'EC',
  x: 'mock-x-value',
  y: 'mock-y-value'
});

const exportJWK = jest.fn().mockResolvedValue({
  alg: 'ES256',
  crv: 'P-256',
  kty: 'EC',
  x: 'mock-x-value',
  y: 'mock-y-value'
});

const calculateJwkThumbprint = jest.fn().mockResolvedValue('mock-thumbprint-hash');

const generateKeyPair = jest.fn().mockResolvedValue({
  privateKey: {
    export: jest.fn().mockReturnValue('mock-private-key')
  },
  publicKey: {
    export: jest.fn().mockReturnValue('mock-public-key')
  }
});

const base64url = {
  encode: jest.fn().mockImplementation((input) =>
    Buffer.from(input).toString('base64url')
  ),
  decode: jest.fn().mockImplementation((input) =>
    Buffer.from(input, 'base64url')
  )
};

module.exports = {
  FlattenedSign,
  SignJWT,
  importJWK,
  exportJWK,
  calculateJwkThumbprint,
  generateKeyPair,
  base64url
};
