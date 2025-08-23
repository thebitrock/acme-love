#!/usr/bin/env node

// Test ACME error handling
import {
  AcmeError,
  BadNonceError,
  UnauthorizedError,
  ServerInternalError,
  UserActionRequiredError,
  RateLimitedError,
  createErrorFromProblem
} from './src/errors.js';

console.log('🧪 Testing ACME Error Classes...\n');

// Create and display different types of errors
function testErrorClass(ErrorClass: any, message: string, ...args: any[]) {
  try {
    throw new ErrorClass(message, ...args);
  } catch (error: any) {
    console.log(`📋 ${ErrorClass.name}:`);
    console.log(`- Message: ${error.message}`);
    console.log(`- Type: ${error.type}`);
    console.log(`- Status: ${error.status}`);
    console.log(`- JSON: ${JSON.stringify(error.toJSON())}`);
    console.log();
  }
}

// Test basic error classes
testErrorClass(AcmeError, 'Generic ACME Error', 400);
testErrorClass(BadNonceError, 'Invalid nonce provided');
testErrorClass(UnauthorizedError, 'Not authorized to access resource');
testErrorClass(ServerInternalError, 'Internal server error occurred');
testErrorClass(UserActionRequiredError, 'Please accept Terms of Service');
testErrorClass(RateLimitedError, 'You have exceeded the rate limit');

// Test error factory function
console.log('📋 Testing createErrorFromProblem factory:');

interface Problem {
  type: string;
  detail: string;
  status: number;
}

const problems: Problem[] = [
  { type: 'urn:ietf:params:acme:error:badNonce', detail: 'Nonce is invalid', status: 400 },
  { type: 'urn:ietf:params:acme:error:unauthorized', detail: 'Account does not exist', status: 401 },
  { type: 'urn:ietf:params:acme:error:rateLimited', detail: 'Too many requests', status: 429 },
  { type: 'urn:ietf:params:acme:error:unknownErrorType', detail: 'Unknown error', status: 400 }
];

problems.forEach(problem => {
  const error = createErrorFromProblem(problem);
  console.log(`\n- Problem type: ${problem.type}`);
  console.log(`  Created: ${error.constructor.name}`);
  console.log(`  Message: ${error.message}`);
  console.log(`  Status: ${error.status}`);
});

console.log('\n🎉 ACME Error classes are working correctly!');
