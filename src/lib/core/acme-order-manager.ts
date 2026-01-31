/**
 * ACME Order Manager
 *
 * Handles the certificate order lifecycle: creation, finalization,
 * status polling, and certificate download per RFC 8555 Section 7.4.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.4
 */

import { ORDER_POLL_MAX_ATTEMPTS, ORDER_POLL_INTERVAL_MS } from '../constants/defaults.js';
import type { AcmeOrder, AcmeOrderStatus } from '../types/order.js';
import { createErrorFromProblem } from '../errors/factory.js';
import { OrderError } from '../errors/acme-operation-errors.js';
import type { AcmeRequestSigner } from './acme-request-signer.js';

/**
 * ACME Order Manager
 *
 * Manages the full order lifecycle from creation through certificate download.
 */
export class AcmeOrderManager {
  constructor(private readonly signer: AcmeRequestSigner) {}

  /**
   * Create new certificate order
   *
   * @param identifiers - Array of domain names for the certificate
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.4
   */
  async createOrder(identifiers: string[]): Promise<AcmeOrder> {
    const directory = await this.signer.getDirectory();

    const payload = {
      identifiers: identifiers.map((domain) => ({
        type: 'dns',
        value: domain,
      })),
    };

    const response = await this.signer.signedPost(directory.newOrder, payload);

    if (response.statusCode !== 201) {
      throw createErrorFromProblem(response.body);
    }

    const order = response.body as AcmeOrder;
    order.url = response.headers.location as string;

    return order;
  }

  /**
   * Finalize order with CSR (base64url DER)
   *
   * @param order - Order object with finalize URL (must be in "ready" status)
   * @param csrDerBase64Url - Certificate Signing Request in base64url-encoded DER format
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.4
   */
  async finalize(order: AcmeOrder, csrDerBase64Url: string): Promise<AcmeOrder> {
    if (!order.finalize) {
      throw OrderError.noFinalizeUrl();
    }

    const payload = { csr: csrDerBase64Url };
    const response = await this.signer.signedPost(order.finalize, payload);

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    const finalizedOrder = response.body as AcmeOrder;
    if (order.url) {
      finalizedOrder.url = order.url;
    }
    return finalizedOrder;
  }

  /**
   * Wait for order to reach target status(es)
   *
   * @param order - Order object to monitor (must have URL)
   * @param targetStatuses - Array of acceptable final statuses to wait for
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.1.6
   */
  async waitOrder(order: AcmeOrder, targetStatuses: AcmeOrderStatus[]): Promise<AcmeOrder> {
    let currentOrder = order;
    let attempts = 0;
    const maxAttempts = ORDER_POLL_MAX_ATTEMPTS;

    while (!targetStatuses.includes(currentOrder.status) && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, ORDER_POLL_INTERVAL_MS));

      const response = await this.signer.signedPost(currentOrder.url || '', null);
      if (response.statusCode !== 200) {
        throw createErrorFromProblem(response.body);
      }

      currentOrder = response.body as AcmeOrder;
      attempts++;
    }

    if (!targetStatuses.includes(currentOrder.status)) {
      throw OrderError.timeout(targetStatuses, currentOrder.status, maxAttempts);
    }

    return currentOrder;
  }

  /**
   * Download certificate from finalized order
   *
   * @param order - Finalized order with certificate URL (status must be "valid")
   * @see https://datatracker.ietf.org/doc/html/rfc8555#section-7.4.2
   */
  async downloadCertificate(order: AcmeOrder): Promise<string> {
    if (!order.certificate) {
      throw OrderError.noCertificateUrl();
    }

    const response = await this.signer.signedPost(order.certificate, null);

    if (response.statusCode !== 200) {
      throw createErrorFromProblem(response.body);
    }

    return response.body as string;
  }
}
