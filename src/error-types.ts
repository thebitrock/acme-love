/**
 * ACME Error Types as defined in RFC 8555
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-6.7
 */

/**
 * Base ACME Error URN prefix
 */
export const ACME_ERROR_PREFIX = 'urn:ietf:params:acme:error:';

/**
 * The request specified an account that does not exist
 */
export const ACME_ERROR_ACCOUNT_DOES_NOT_EXIST = `${ACME_ERROR_PREFIX}accountDoesNotExist`;

/**
 * The request specified a certificate to be revoked that has already been revoked
 */
export const ACME_ERROR_ALREADY_REVOKED = `${ACME_ERROR_PREFIX}alreadyRevoked`;

/**
 * The CSR is unacceptable (e.g., due to a short key)
 */
export const ACME_ERROR_BAD_CSR = `${ACME_ERROR_PREFIX}badCSR`;

/**
 * The client sent an unacceptable anti-replay nonce
 */
export const ACME_ERROR_BAD_NONCE = `${ACME_ERROR_PREFIX}badNonce`;

/**
 * The JWS was signed by a public key the server does not support
 */
export const ACME_ERROR_BAD_PUBLIC_KEY = `${ACME_ERROR_PREFIX}badPublicKey`;

/**
 * The revocation reason provided is not allowed by the server
 */
export const ACME_ERROR_BAD_REVOCATION_REASON = `${ACME_ERROR_PREFIX}badRevocationReason`;

/**
 * The JWS was signed with an algorithm the server does not support
 */
export const ACME_ERROR_BAD_SIGNATURE_ALGORITHM = `${ACME_ERROR_PREFIX}badSignatureAlgorithm`;

/**
 * Certification Authority Authorization (CAA) records forbid the CA from issuing a certificate
 */
export const ACME_ERROR_CAA = `${ACME_ERROR_PREFIX}caa`;

/**
 * Specific error conditions are indicated in the "subproblems" array
 */
export const ACME_ERROR_COMPOUND = `${ACME_ERROR_PREFIX}compound`;

/**
 * The server could not connect to validation target
 */
export const ACME_ERROR_CONNECTION = `${ACME_ERROR_PREFIX}connection`;

/**
 * There was a problem with a DNS query during identifier validation
 */
export const ACME_ERROR_DNS = `${ACME_ERROR_PREFIX}dns`;

/**
 * The request must include a value for the "externalAccountBinding" field
 */
export const ACME_ERROR_EXTERNAL_ACCOUNT_REQUIRED = `${ACME_ERROR_PREFIX}externalAccountRequired`;

/**
 * Response received didn't match the challenge's requirements
 */
export const ACME_ERROR_INCORRECT_RESPONSE = `${ACME_ERROR_PREFIX}incorrectResponse`;

/**
 * A contact URL for an account was invalid
 */
export const ACME_ERROR_INVALID_CONTACT = `${ACME_ERROR_PREFIX}invalidContact`;

/**
 * The request message was malformed
 */
export const ACME_ERROR_MALFORMED = `${ACME_ERROR_PREFIX}malformed`;

/**
 * The request attempted to finalize an order that is not ready to be finalized
 */
export const ACME_ERROR_ORDER_NOT_READY = `${ACME_ERROR_PREFIX}orderNotReady`;

/**
 * The request exceeds a rate limit
 */
export const ACME_ERROR_RATE_LIMITED = `${ACME_ERROR_PREFIX}rateLimited`;

/**
 * The server will not issue certificates for the identifier
 */
export const ACME_ERROR_REJECTED_IDENTIFIER = `${ACME_ERROR_PREFIX}rejectedIdentifier`;

/**
 * The server experienced an internal error
 */
export const ACME_ERROR_SERVER_INTERNAL = `${ACME_ERROR_PREFIX}serverInternal`;

/**
 * The server received a TLS error during validation
 */
export const ACME_ERROR_TLS = `${ACME_ERROR_PREFIX}tls`;

/**
 * The client lacks sufficient authorization
 */
export const ACME_ERROR_UNAUTHORIZED = `${ACME_ERROR_PREFIX}unauthorized`;

/**
 * A contact URL for an account used an unsupported protocol scheme
 */
export const ACME_ERROR_UNSUPPORTED_CONTACT = `${ACME_ERROR_PREFIX}unsupportedContact`;

/**
 * An identifier is of an unsupported type
 */
export const ACME_ERROR_UNSUPPORTED_IDENTIFIER = `${ACME_ERROR_PREFIX}unsupportedIdentifier`;

/**
 * Visit the "instance" URL and take actions specified there
 */
export const ACME_ERROR_USER_ACTION_REQUIRED = `${ACME_ERROR_PREFIX}userActionRequired`;
