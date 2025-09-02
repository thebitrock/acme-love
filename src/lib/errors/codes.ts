/**
 * ACME Error Codes (RFC 8555)
 *
 * This module defines error type URNs as specified in RFC 8555 Section 6.7.
 * All ACME error types use the URN namespace "urn:ietf:params:acme:error:"
 * followed by the specific error type identifier.
 *
 * These error codes are returned by ACME servers in problem documents (RFC 7807)
 * to indicate specific error conditions during certificate management operations.
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.7 | RFC 8555 Section 6.7 - Errors}
 * @see {@link https://datatracker.ietf.org/doc/html/rfc7807 | RFC 7807 - Problem Documents}
 */

/**
 * URN prefix for all ACME error types as defined in RFC 8555
 */
const prefix = 'urn:ietf:params:acme:error:';

/**
 * ACME Error Type Constants
 *
 * Each error type corresponds to a specific error condition defined in RFC 8555.
 * These URNs are used in the "type" field of problem documents returned by ACME servers.
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.7 | RFC 8555 Section 6.7 - Error Types}
 */
export const ACME_ERROR = {
  /**
   * The request specified an account that does not exist
   *
   * This error occurs when a client attempts to perform an operation
   * on an account that the server does not recognize.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.7 | RFC 8555 Section 6.7}
   */
  accountDoesNotExist: `${prefix}accountDoesNotExist`,

  /**
   * The request specified a certificate to be revoked that has already been revoked
   *
   * This error occurs when a client attempts to revoke a certificate
   * that has already been revoked by the same or another entity.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.7 | RFC 8555 Section 6.7}
   */
  alreadyRevoked: `${prefix}alreadyRevoked`,

  /**
   * The CSR is unacceptable (e.g., due to a short key)
   *
   * This error occurs when the Certificate Signing Request submitted
   * by the client does not meet the server's requirements, such as
   * insufficient key length or unsupported algorithms.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.7 | RFC 8555 Section 6.7}
   */
  badCSR: `${prefix}badCSR`,

  /**
   * The client sent an unacceptable anti-replay nonce
   *
   * This error occurs when the nonce provided in the JWS header
   * is invalid, expired, or has already been used. Clients should
   * retry with a fresh nonce from the Replay-Nonce header.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.5 | RFC 8555 Section 6.5 - Replay Protection}
   */
  badNonce: `${prefix}badNonce`,

  /**
   * The JWS was signed by a public key the server does not support
   *
   * This error occurs when the public key used to sign the JWS
   * is not supported by the server (e.g., RSA key too short,
   * unsupported curve for ECDSA, or compromised key).
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.2 | RFC 8555 Section 6.2 - Request Authentication}
   */
  badPublicKey: `${prefix}badPublicKey`,

  /**
   * The revocation reason provided is not allowed by the server
   *
   * This error occurs when a client attempts to revoke a certificate
   * with a reason code that the server does not allow clients to use.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-7.6 | RFC 8555 Section 7.6 - Certificate Revocation}
   */
  badRevocationReason: `${prefix}badRevocationReason`,

  /**
   * The JWS was signed with an algorithm the server does not support
   *
   * This error occurs when the signature algorithm specified in the
   * JWS header is not supported by the server. The response should
   * include an "algorithms" field listing supported algorithms.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.2 | RFC 8555 Section 6.2 - Request Authentication}
   */
  badSignatureAlgorithm: `${prefix}badSignatureAlgorithm`,

  /**
   * Certification Authority Authorization (CAA) records forbid the CA from issuing a certificate
   *
   * This error occurs when DNS CAA records for the requested domain
   * explicitly forbid the CA from issuing certificates for that domain.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc6844 | RFC 6844 - CAA Resource Record}
   */
  caa: `${prefix}caa`,

  /**
   * Specific error conditions are indicated in the "subproblems" array
   *
   * This error type is used when multiple specific errors occurred.
   * The actual error details are provided in the "subproblems" field
   * of the problem document.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.7.1 | RFC 8555 Section 6.7.1 - Subproblems}
   */
  compound: `${prefix}compound`,

  /**
   * The server could not connect to validation target
   *
   * This error occurs during identifier validation when the server
   * cannot establish a connection to the target server (e.g., for
   * HTTP-01 or TLS-ALPN-01 challenges).
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-8 | RFC 8555 Section 8 - Identifier Validation Challenges}
   */
  connection: `${prefix}connection`,

  /**
   * There was a problem with a DNS query during identifier validation
   *
   * This error occurs when the server encounters DNS-related issues
   * during identifier validation, such as DNS resolution failures
   * or invalid DNS responses.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-8.4 | RFC 8555 Section 8.4 - DNS Challenge}
   */
  dns: `${prefix}dns`,

  /**
   * The request must include a value for the "externalAccountBinding" field
   *
   * This error occurs when the server requires external account binding
   * but the newAccount request does not include the required field.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-7.3.4 | RFC 8555 Section 7.3.4 - External Account Binding}
   */
  externalAccountRequired: `${prefix}externalAccountRequired`,

  /**
   * Response received didn't match the challenge's requirements
   *
   * This error occurs during challenge validation when the response
   * received from the client does not meet the challenge requirements
   * (e.g., incorrect key authorization, wrong file content).
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-8 | RFC 8555 Section 8 - Identifier Validation Challenges}
   */
  incorrectResponse: `${prefix}incorrectResponse`,

  /**
   * A contact URL for an account was invalid
   *
   * This error occurs when the contact information provided in an
   * account object contains invalid URLs or unsupported schemes.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-7.3 | RFC 8555 Section 7.3 - Account Management}
   */
  invalidContact: `${prefix}invalidContact`,

  /**
   * The request message was malformed
   *
   * This error occurs when the request does not conform to ACME
   * protocol requirements, such as invalid JSON structure or
   * missing required fields.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6 | RFC 8555 Section 6 - Message Transport}
   */
  malformed: `${prefix}malformed`,

  /**
   * The request attempted to finalize an order that is not ready to be finalized
   *
   * This error occurs when a client attempts to finalize an order
   * before all required authorizations are in the "valid" state.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-7.4 | RFC 8555 Section 7.4 - Applying for Certificate Issuance}
   */
  orderNotReady: `${prefix}orderNotReady`,

  /**
   * The request exceeds a rate limit
   *
   * This error occurs when the client has exceeded the server's
   * rate limits. The response may include a Retry-After header
   * indicating when the client may retry.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.6 | RFC 8555 Section 6.6 - Rate Limits}
   */
  rateLimited: `${prefix}rateLimited`,

  /**
   * The server will not issue certificates for the identifier
   *
   * This error occurs when the server's policy prohibits issuing
   * certificates for the requested identifier (e.g., high-value
   * domains, blacklisted domains).
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.7 | RFC 8555 Section 6.7}
   */
  rejectedIdentifier: `${prefix}rejectedIdentifier`,

  /**
   * The server experienced an internal error
   *
   * This error occurs when the server encounters an unexpected
   * internal error that prevents it from processing the request.
   * Clients should retry the request later.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.7 | RFC 8555 Section 6.7}
   */
  serverInternal: `${prefix}serverInternal`,

  /**
   * The server received a TLS error during validation
   *
   * This error occurs during identifier validation when the server
   * encounters TLS-related issues, such as certificate validation
   * failures or TLS handshake errors.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-8 | RFC 8555 Section 8 - Identifier Validation Challenges}
   */
  tls: `${prefix}tls`,

  /**
   * The client lacks sufficient authorization
   *
   * This error occurs when the client attempts to perform an operation
   * for which it does not have sufficient authorization, such as
   * accessing resources belonging to another account.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.2 | RFC 8555 Section 6.2 - Request Authentication}
   */
  unauthorized: `${prefix}unauthorized`,

  /**
   * A contact URL for an account used an unsupported protocol scheme
   *
   * This error occurs when the contact information contains URLs
   * with protocol schemes not supported by the server (e.g., only
   * "mailto" may be supported).
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-7.3 | RFC 8555 Section 7.3 - Account Management}
   */
  unsupportedContact: `${prefix}unsupportedContact`,

  /**
   * An identifier is of an unsupported type
   *
   * This error occurs when the client requests a certificate for
   * an identifier type that the server does not support (e.g.,
   * requesting an IP identifier when only DNS is supported).
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-9.7.7 | RFC 8555 Section 9.7.7 - Identifier Types}
   */
  unsupportedIdentifier: `${prefix}unsupportedIdentifier`,

  /**
   * Visit the "instance" URL and take actions specified there
   *
   * This error occurs when the server requires the client to visit
   * a specific URL (provided in the "instance" field) to complete
   * some manual action, such as agreeing to updated terms of service.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-7.3.3 | RFC 8555 Section 7.3.3 - Changes of Terms of Service}
   */
  userActionRequired: `${prefix}userActionRequired`,
} as const;

/**
 * Union type of all ACME error type URNs
 *
 * This type represents all possible ACME error types as defined in RFC 8555.
 * It can be used for type-safe error handling and validation.
 *
 * @example
 * ```typescript
 * function handleAcmeError(errorType: AcmeErrorType) {
 *   switch (errorType) {
 *     case ACME_ERROR.badNonce:
 *       // Handle bad nonce - retry with fresh nonce
 *       break;
 *     case ACME_ERROR.rateLimited:
 *       // Handle rate limit - wait and retry
 *       break;
 *     default:
 *       // Handle other errors
 *   }
 * }
 * ```
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc8555#section-6.7 | RFC 8555 Section 6.7 - Errors}
 */
export type AcmeErrorType = (typeof ACME_ERROR)[keyof typeof ACME_ERROR];
