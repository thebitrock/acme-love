/**
 * Example: Modern ACME Status Handling with Type Safety
 *
 * This example demonstrates how to use the new typed status constants
 * for safer ACME protocol implementation.
 */

import {
  ORDER_STATUS,
  AUTHORIZATION_STATUS,
  CHALLENGE_TYPE,
  type AcmeOrderStatus,
  type AcmeAuthorizationStatus,
  type AcmeChallengeType,
  isAcmeOrderStatus,
  isValidOrderStatusTransition,
  isValidAuthorizationStatusTransition,
} from '../src/lib/types/status.js';

/**
 * Example 1: Type-safe status comparison
 */
function handleOrderStatus(status: AcmeOrderStatus): string {
  // TypeScript ensures we handle all possible statuses
  switch (status) {
    case ORDER_STATUS.PENDING:
      return 'Order is waiting for authorizations';
    case ORDER_STATUS.READY:
      return 'Order is ready for finalization';
    case ORDER_STATUS.PROCESSING:
      return 'Order is being processed';
    case ORDER_STATUS.VALID:
      return 'Order is valid, certificate available';
    case ORDER_STATUS.INVALID:
      return 'Order failed';
    default: {
      // TypeScript ensures exhaustive checking
      const exhaustiveCheck: never = status;
      throw new Error(`Unexpected status: ${exhaustiveCheck}`);
    }
  }
}

/**
 * Example 2: Runtime validation with type guards
 */
function validateApiResponse(data: { status: string }): boolean {
  if (!isAcmeOrderStatus(data.status)) {
    console.error(`Invalid order status: ${data.status}`);
    return false;
  }

  // Now TypeScript knows data.status is AcmeOrderStatus
  console.log(handleOrderStatus(data.status));
  return true;
}

/**
 * Example 3: Status transition validation
 */
function updateOrderStatus(currentStatus: AcmeOrderStatus, newStatus: AcmeOrderStatus): boolean {
  if (!isValidOrderStatusTransition(currentStatus, newStatus)) {
    console.error(`Invalid transition from ${currentStatus} to ${newStatus}`);
    return false;
  }

  console.log(`Status updated: ${currentStatus} → ${newStatus}`);
  return true;
}

/**
 * Example 4: Challenge type handling
 */
function setupChallenge(type: AcmeChallengeType): string {
  switch (type) {
    case CHALLENGE_TYPE.HTTP_01:
      return 'Set up HTTP challenge file';
    case CHALLENGE_TYPE.DNS_01:
      return 'Create DNS TXT record';
    case CHALLENGE_TYPE.TLS_ALPN_01:
      return 'Configure TLS-ALPN extension';
    default:
      return type satisfies never;
  }
}

/**
 * Example 5: Authorization status workflow
 */
async function processAuthorization(initialStatus: AcmeAuthorizationStatus): Promise<void> {
  let currentStatus = initialStatus;

  console.log(`Starting with status: ${currentStatus}`);

  if (currentStatus === AUTHORIZATION_STATUS.PENDING) {
    // Simulate challenge completion
    const newStatus = AUTHORIZATION_STATUS.VALID;

    if (isValidAuthorizationStatusTransition(currentStatus, newStatus)) {
      currentStatus = newStatus;
      console.log(`Authorization validated: ${currentStatus}`);
    }
  }

  if (currentStatus === AUTHORIZATION_STATUS.VALID) {
    console.log('✅ Authorization is ready for certificate issuance');
  }
}

/**
 * Example 6: Comprehensive order processing
 */
class TypedOrderProcessor {
  private orderStatus: AcmeOrderStatus = ORDER_STATUS.PENDING;

  async processOrder(): Promise<void> {
    console.log('🚀 Starting order processing...');

    // Step 1: Validate authorizations
    if (this.orderStatus === ORDER_STATUS.PENDING) {
      await this.validateAuthorizations();
      this.updateStatus(ORDER_STATUS.READY);
    }

    // Step 2: Finalize order
    if (this.orderStatus === ORDER_STATUS.READY) {
      await this.finalizeOrder();
      this.updateStatus(ORDER_STATUS.PROCESSING);
    }

    // Step 3: Complete processing
    if (this.orderStatus === ORDER_STATUS.PROCESSING) {
      await this.completeProcessing();
      this.updateStatus(ORDER_STATUS.VALID);
    }

    console.log('✅ Order processing completed successfully');
  }

  private updateStatus(newStatus: AcmeOrderStatus): void {
    if (isValidOrderStatusTransition(this.orderStatus, newStatus)) {
      console.log(`📝 Order status: ${this.orderStatus} → ${newStatus}`);
      this.orderStatus = newStatus;
    } else {
      throw new Error(`Invalid order transition: ${this.orderStatus} → ${newStatus}`);
    }
  }

  private async validateAuthorizations(): Promise<void> {
    console.log('🔍 Validating authorizations...');
    // Simulate authorization validation
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private async finalizeOrder(): Promise<void> {
    console.log('📋 Finalizing order...');
    // Simulate order finalization
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private async completeProcessing(): Promise<void> {
    console.log('⚙️ Processing order...');
    // Simulate certificate generation
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// Example usage
async function runExamples(): Promise<void> {
  console.log('=== ACME Typed Status Examples ===\n');

  // Example 1: Type-safe status handling
  console.log('Example 1: Status handling');
  console.log(handleOrderStatus(ORDER_STATUS.READY));
  console.log();

  // Example 2: Runtime validation
  console.log('Example 2: Runtime validation');
  validateApiResponse({ status: 'ready' });
  validateApiResponse({ status: 'invalid-status' });
  console.log();

  // Example 3: Transition validation
  console.log('Example 3: Status transitions');
  updateOrderStatus(ORDER_STATUS.PENDING, ORDER_STATUS.READY); // ✅ Valid
  updateOrderStatus(ORDER_STATUS.VALID, ORDER_STATUS.PENDING); // ❌ Invalid
  console.log();

  // Example 4: Challenge types
  console.log('Example 4: Challenge setup');
  console.log(setupChallenge(CHALLENGE_TYPE.DNS_01));
  console.log();

  // Example 5: Authorization workflow
  console.log('Example 5: Authorization workflow');
  await processAuthorization(AUTHORIZATION_STATUS.PENDING);
  console.log();

  // Example 6: Complete order processing
  console.log('Example 6: Order processing');
  const processor = new TypedOrderProcessor();
  await processor.processOrder();
}

// Export for potential usage
export {
  handleOrderStatus,
  validateApiResponse,
  updateOrderStatus,
  setupChallenge,
  processAuthorization,
  TypedOrderProcessor,
  runExamples,
};
