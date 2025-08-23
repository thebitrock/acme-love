const prefix = 'urn:ietf:params:acme:error:';

export const ACME_ERROR = {
  accountDoesNotExist: `${prefix}accountDoesNotExist`,
  alreadyRevoked: `${prefix}alreadyRevoked`,
  badCSR: `${prefix}badCSR`,
  badNonce: `${prefix}badNonce`,
  badPublicKey: `${prefix}badPublicKey`,
  badRevocationReason: `${prefix}badRevocationReason`,
  badSignatureAlgorithm: `${prefix}badSignatureAlgorithm`,
  caa: `${prefix}caa`,
  compound: `${prefix}compound`,
  connection: `${prefix}connection`,
  dns: `${prefix}dns`,
  externalAccountRequired: `${prefix}externalAccountRequired`,
  incorrectResponse: `${prefix}incorrectResponse`,
  invalidContact: `${prefix}invalidContact`,
  malformed: `${prefix}malformed`,
  orderNotReady: `${prefix}orderNotReady`,
  rateLimited: `${prefix}rateLimited`,
  rejectedIdentifier: `${prefix}rejectedIdentifier`,
  serverInternal: `${prefix}serverInternal`,
  tls: `${prefix}tls`,
  unauthorized: `${prefix}unauthorized`,
  unsupportedContact: `${prefix}unsupportedContact`,
  unsupportedIdentifier: `${prefix}unsupportedIdentifier`,
  userActionRequired: `${prefix}userActionRequired`,
} as const;

export type AcmeErrorType = (typeof ACME_ERROR)[keyof typeof ACME_ERROR];
