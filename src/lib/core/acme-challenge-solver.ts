/**
 * ACME Challenge Solver
 *
 * Handles authorization retrieval and challenge solving for DNS-01 and HTTP-01
 * validation methods per RFC 8555 Sections 7.5 and 8.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.5
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-8
 */

import type {
  AcmeOrder,
  AcmeAuthorization,
  AcmeChallenge,
  AcmeChallengeType,
} from '../types/order.js';
import {
  ORDER_STATUS,
  AUTHORIZATION_STATUS,
  CHALLENGE_STATUS,
  CHALLENGE_TYPE,
} from '../types/status.js';
import { createErrorFromProblem } from '../errors/factory.js';
import { debugChallenge } from '../utils/debug.js';
import { AuthorizationError, ChallengeError } from '../errors/acme-operation-errors.js';
import type { AcmeRequestSigner } from './acme-request-signer.js';
import type { AcmeOrderManager } from './acme-order-manager.js';

/** Challenge preparation data passed to user callbacks */
export interface ChallengePreparation {
  target: string;
  value: string;
  additional?: Record<string, unknown>;
}

/**
 * Check for challenge-level errors in an authorization response
 */
function throwIfChallengeErrors(authz: AcmeAuthorization): void {
  if (!authz.challenges) return;
  for (const challenge of authz.challenges) {
    if (challenge.error && challenge.status !== 'valid') {
      debugChallenge(
        'challenge error detected type=%s raw=%j',
        challenge.error.type,
        challenge.error,
      );
      const mapped = createErrorFromProblem(challenge.error);
      debugChallenge('mapped challenge error name=%s detail=%s', mapped.name, mapped.detail);
      throw mapped;
    }
    if (challenge.status === CHALLENGE_STATUS.INVALID) {
      throw ChallengeError.invalidWithoutDetail(challenge.type);
    }
  }
}

/**
 * ACME Challenge Solver
 *
 * Manages authorization retrieval and challenge solving for all supported
 * validation methods.
 */
export class AcmeChallengeSolver {
  /**
   * Pluggable authorization resolver. Defaults to direct signedPost.
   * The facade sets this to a late-bound reference so subclass overrides
   * of getAuthorization are respected in the internal solve loop.
   */
  resolveAuthorization: (authzUrl: string) => Promise<AcmeAuthorization>;

  constructor(
    private readonly signer: AcmeRequestSigner,
    private readonly orderManager: AcmeOrderManager,
  ) {
    this.resolveAuthorization = (url) => this.defaultGetAuthorization(url);
  }

  /**
   * Get authorization details for a domain
   *
   * @param authzUrl - URL of the authorization resource
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.5
   */
  async getAuthorization(authzUrl: string): Promise<AcmeAuthorization> {
    return this.resolveAuthorization(authzUrl);
  }

  private async defaultGetAuthorization(authzUrl: string): Promise<AcmeAuthorization> {
    const response = await this.signer.signedPost(authzUrl, null);

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    return response.body as AcmeAuthorization;
  }

  /**
   * Get challenge details
   *
   * @param challengeUrl - URL of the challenge resource
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.5.1
   */
  async getChallenge(challengeUrl: string): Promise<AcmeChallenge> {
    const response = await this.signer.signedPost(challengeUrl, null);

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    return response.body as AcmeChallenge;
  }

  /**
   * Accept and start challenge validation
   *
   * @param challengeUrl - URL of the challenge to accept
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.5.1
   */
  async acceptChallenge(challengeUrl: string): Promise<AcmeChallenge> {
    const response = await this.signer.signedPost(challengeUrl, {});

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    return response.body as AcmeChallenge;
  }

  /**
   * Solve DNS-01 challenge for all authorizations in an order
   *
   * @param order - Order object containing authorizations to validate
   * @param opts.setDns - Callback to provision DNS TXT records
   * @param opts.waitFor - Callback to wait for DNS propagation
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-8.4
   */
  async solveDns01(
    order: AcmeOrder,
    opts: {
      waitFor: (preparation: ChallengePreparation) => Promise<void>;
      setDns: (preparation: ChallengePreparation) => Promise<void>;
    },
  ): Promise<AcmeOrder> {
    return this.solveChallenge(order, {
      challengeType: CHALLENGE_TYPE.DNS_01,
      prepareChallenge: async (
        authorization: AcmeAuthorization,
        keyAuth: string,
        _challenge: AcmeChallenge,
      ) => {
        const { createHash } = await import('crypto');
        const txtValue = createHash('sha256').update(keyAuth).digest('base64url');
        const fqdn = `_acme-challenge.${authorization.identifier.value}`;
        return { target: fqdn, value: txtValue };
      },
      setChallenge: opts.setDns,
      waitFor: opts.waitFor,
    });
  }

  /**
   * Solve HTTP-01 challenge for all authorizations in an order
   *
   * @param order - Order object containing authorizations to validate
   * @param opts.setHttp - Callback to provision HTTP challenge files
   * @param opts.waitFor - Callback to wait for HTTP server setup
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-8.3
   */
  async solveHttp01(
    order: AcmeOrder,
    opts: {
      waitFor: (preparation: ChallengePreparation) => Promise<void>;
      setHttp: (preparation: ChallengePreparation) => Promise<void>;
    },
  ): Promise<AcmeOrder> {
    return this.solveChallenge(order, {
      challengeType: CHALLENGE_TYPE.HTTP_01,
      prepareChallenge: async (
        authorization: AcmeAuthorization,
        keyAuth: string,
        challenge: AcmeChallenge,
      ) => {
        const url = `http://${authorization.identifier.value}/.well-known/acme-challenge/${challenge.token}`;
        return { target: url, value: keyAuth, additional: { token: challenge.token } };
      },
      setChallenge: opts.setHttp,
      waitFor: opts.waitFor,
    });
  }

  /**
   * Generic challenge solving flow
   */
  private async solveChallenge(
    order: AcmeOrder,
    opts: {
      challengeType: AcmeChallengeType;
      prepareChallenge: (
        authorization: AcmeAuthorization,
        keyAuth: string,
        challenge: AcmeChallenge,
      ) => Promise<ChallengePreparation>;
      setChallenge: (preparation: ChallengePreparation) => Promise<void>;
      waitFor: (preparation: ChallengePreparation) => Promise<void>;
    },
  ): Promise<AcmeOrder> {
    for (const authzUrl of order.authorizations || []) {
      const authorization = await this.resolveAuthorization(authzUrl);

      throwIfChallengeErrors(authorization);

      if (authorization.status === AUTHORIZATION_STATUS.VALID) {
        continue;
      }
      if (authorization.status === AUTHORIZATION_STATUS.INVALID) {
        throw AuthorizationError.invalid(authorization.identifier.value);
      }
      if (authorization.status === AUTHORIZATION_STATUS.DEACTIVATED) {
        throw AuthorizationError.deactivated(authorization.identifier.value);
      }
      if (authorization.status === AUTHORIZATION_STATUS.EXPIRED) {
        throw AuthorizationError.expired(authorization.identifier.value);
      }
      if (authorization.status === AUTHORIZATION_STATUS.REVOKED) {
        throw AuthorizationError.revoked(authorization.identifier.value);
      }

      const challenge = authorization.challenges?.find((ch) => ch.type === opts.challengeType);
      if (!challenge) {
        throw ChallengeError.notFound(opts.challengeType, authorization.identifier.value);
      }

      if (challenge.status === CHALLENGE_STATUS.VALID) {
        continue;
      }
      if (challenge.status === CHALLENGE_STATUS.INVALID) {
        throw ChallengeError.invalid(opts.challengeType, authorization.identifier.value);
      }
      if (challenge.status === CHALLENGE_STATUS.PROCESSING) {
        continue;
      }

      const keyAuth = await this.signer.keyAuthorization(challenge.token);
      const preparation = await opts.prepareChallenge(authorization, keyAuth, challenge);

      await opts.setChallenge(preparation);
      await opts.waitFor(preparation);
      await this.completeChallenge(challenge);
    }

    return await this.orderManager.waitOrder(order, [ORDER_STATUS.READY, ORDER_STATUS.VALID]);
  }

  /**
   * Complete a specific challenge by notifying the ACME server
   */
  private async completeChallenge(challenge: AcmeChallenge): Promise<void> {
    if (challenge.status === CHALLENGE_STATUS.VALID) {
      return;
    }

    const response = await this.signer.signedPost(challenge.url, {});

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }
  }
}
