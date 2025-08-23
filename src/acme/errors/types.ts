const prefix = 'urn:ietf:params:acme:error:';

export const ACME_ERROR = {
  accountDoesNotExist: 'urn:ietf:params:acme:error:accountDoesNotExist',
  alreadyRevoked: 'urn:ietf:params:acme:error:alreadyRevoked',
  badCSR: 'urn:ietf:params:acme:error:badCSR',
  badNonce: 'urn:ietf:params:acme:error:badNonce',
  badPublicKey: 'urn:ietf:params:acme:error:badPublicKey',
  badRevocationReason: 'urn:ietf:params:acme:error:badRevocationReason',
  badSignatureAlgorithm: 'urn:ietf:params:acme:error:badSignatureAlgorithm',
  caa: 'urn:ietf:params:acme:error:caa',
  compound: 'urn:ietf:params:acme:error:compound',
  connection: 'urn:ietf:params:acme:error:connection',
  dns: 'urn:ietf:params:acme:error:dns',
  externalAccountRequired: 'urn:ietf:params:acme:error:externalAccountRequired',
  incorrectResponse: 'urn:ietf:params:acme:error:incorrectResponse',
  invalidContact: 'urn:ietf:params:acme:error:invalidContact',
  malformed: 'urn:ietf:params:acme:error:malformed',
  orderNotReady: 'urn:ietf:params:acme:error:orderNotReady',
  rateLimited: 'urn:ietf:params:acme:error:rateLimited',
  rejectedIdentifier: 'urn:ietf:params:acme:error:rejectedIdentifier',
  serverInternal: 'urn:ietf:params:acme:error:serverInternal',
  tls: 'urn:ietf:params:acme:error:tls',
  unauthorized: 'urn:ietf:params:acme:error:unauthorized',
  unsupportedContact: 'urn:ietf:params:acme:error:unsupportedContact',
  unsupportedIdentifier: 'urn:ietf:params:acme:error:unsupportedIdentifier',
  userActionRequired: 'urn:ietf:params:acme:error:userActionRequired',
} as const;

export type AcmeErrorType = (typeof ACME_ERROR)[keyof typeof ACME_ERROR];
