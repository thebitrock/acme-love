/**
 * RFC 8555 ACME Challenge Validators
 *
 * Challenge validation modules for ACME protocol compliance.
 * Supports both DNS-01 and HTTP-01 challenge types as specified in RFC 8555.
 */

// DNS-01 Challenge Validation (RFC 8555 Section 8.4)
export {
  normalizeTxtFragments,
  isValidAcmeChallengeToken,
  canDecodeTo32Bytes,
  validateAcmeTxtSet,
  resolveAndValidateAcmeTxtAuthoritative,
  resolveAndValidateAcmeTxt,
  findZoneWithNs,
  resolveNsToIPs,
  type AcmeDnsValidationResult,
  type AuthoritativeOptions,
} from './dns-txt-validator.js';

// HTTP-01 Challenge Validation (RFC 8555 Section 8.3)
export {
  validateHttp01Challenge,
  validateHttp01ChallengeByUrl,
  type AcmeHttpValidationResult,
  type AcmeHttpValidationOptions,
} from './http-validator.js';
