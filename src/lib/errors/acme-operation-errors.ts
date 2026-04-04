/**
 * ACME client-side errors for library operations
 *
 * These error classes provide typed representation of various error states
 * that can occur during ACME client operations. Each error class contains contextual
 * information to facilitate debugging and error handling.
 *
 * Note: These are distinct from AcmeError which represents RFC 8555 server errors.
 */

/**
 * Base class for all ACME operation errors
 *
 * Distinguished from AcmeError which represents server-side RFC 8555 errors.
 */
export abstract class AcmeOperationError extends Error {
  public abstract readonly code: string;
  public abstract readonly type: string;

  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;

    // Support proper stack traces
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Errors related to domain authorization
 */
export class AuthorizationError extends AcmeOperationError {
  public readonly code = 'AUTHORIZATION_ERROR';
  public readonly type = 'authorization';

  public static invalid(domain: string, reason?: string): AuthorizationError {
    return new AuthorizationError(
      `Authorization for ${domain} is invalid and cannot be processed${reason ? `: ${reason}` : ''}`,
      { domain, status: 'invalid', reason },
    );
  }

  public static deactivated(domain: string): AuthorizationError {
    return new AuthorizationError(`Authorization for ${domain} has been deactivated`, {
      domain,
      status: 'deactivated',
    });
  }

  public static expired(domain: string): AuthorizationError {
    return new AuthorizationError(`Authorization for ${domain} has expired`, {
      domain,
      status: 'expired',
    });
  }

  public static revoked(domain: string): AuthorizationError {
    return new AuthorizationError(`Authorization for ${domain} has been revoked`, {
      domain,
      status: 'revoked',
    });
  }
}

/**
 * Errors related to challenges
 */
export class ChallengeError extends AcmeOperationError {
  public readonly code = 'CHALLENGE_ERROR';
  public readonly type = 'challenge';

  public static notFound(challengeType: string, domain: string): ChallengeError {
    return new ChallengeError(`Challenge type ${challengeType} not found for ${domain}`, {
      challengeType,
      domain,
    });
  }

  public static invalid(challengeType: string, domain: string, reason?: string): ChallengeError {
    return new ChallengeError(
      `Challenge ${challengeType} for ${domain} is invalid${reason ? `: ${reason}` : ''}`,
      { challengeType, domain, status: 'invalid', reason },
    );
  }

  public static invalidWithoutDetail(challengeType: string): ChallengeError {
    return new ChallengeError(`Challenge ${challengeType} is invalid without error detail`, {
      challengeType,
      status: 'invalid',
    });
  }

  public static invalidToken(token: string): ChallengeError {
    return new ChallengeError(
      `Challenge token contains invalid characters (expected base64url): "${token.slice(0, 40)}"`,
      { status: 'invalid_token' },
    );
  }
}

/**
 * Errors related to certificate orders
 */
export class OrderError extends AcmeOperationError {
  public readonly code = 'ORDER_ERROR';
  public readonly type = 'order';

  public static noFinalizeUrl(): OrderError {
    return new OrderError('Order does not have finalize URL', { missing: 'finalize' });
  }

  public static noCertificateUrl(): OrderError {
    return new OrderError('Order does not have certificate URL', { missing: 'certificate' });
  }

  public static timeout(
    targetStatuses: string[],
    currentStatus: string,
    attempts: number,
  ): OrderError {
    return new OrderError(
      `Order did not reach target status ${targetStatuses.join(', ')} after ${attempts} attempts. Current status: ${currentStatus}`,
      { targetStatuses, currentStatus, attempts },
    );
  }
}

/**
 * Errors related to account operations
 */
export class AccountError extends AcmeOperationError {
  public readonly code = 'ACCOUNT_ERROR';
  public readonly type = 'account';

  public static notRegistered(): AccountError {
    return new AccountError('Account not registered. Call register() first.', {
      action: 'register_required',
    });
  }

  public static noAccountUrl(): AccountError {
    return new AccountError('No account URL in registration response', {
      missing: 'location_header',
    });
  }
}

/**
 * Union type for all ACME operation errors
 */
export type AcmeOperationErrorType =
  | AuthorizationError
  | ChallengeError
  | OrderError
  | AccountError;

/**
 * Type guards for error type checking
 */
export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError;
}

export function isChallengeError(error: unknown): error is ChallengeError {
  return error instanceof ChallengeError;
}

export function isOrderError(error: unknown): error is OrderError {
  return error instanceof OrderError;
}

export function isAccountError(error: unknown): error is AccountError {
  return error instanceof AccountError;
}

export function isAcmeOperationError(error: unknown): error is AcmeOperationErrorType {
  return error instanceof AcmeOperationError;
}
