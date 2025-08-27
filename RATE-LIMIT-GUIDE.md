# ACME Love - Rate Limit Management Guide

## Overview

ACME Love includes a comprehensive Let's Encrypt rate limit management system to prevent API limit violations and ensure stable production operation.

## Core Let's Encrypt Limits

### 1. General Request Limits (per IP address)
- `/acme/new-nonce`: 20 requests/sec, 10 sec block
- `/acme/new-order`: 300 requests/sec, 200 sec block  
- `/acme/*` (general): 250 requests/sec, 125 sec block

### 2. Account Registration Limits
- New registrations per IP: 10 per 3 hours

### 3. Certificate Issuance Limits
- New orders per account: 300 per 3 hours
- Authorization failures: 5 per hour per domain
- Duplicate certificates: 5 per domain set per 7 days

## Built-in Solutions

### 1. Automatic Rate Limit Management
```typescript
import { NonceManager, RateLimiter } from 'acme-love';

// Create rate limiter with production settings
const rateLimiter = new RateLimiter({
  maxRetries: 5,           // 5 retry attempts
  baseDelayMs: 2000,       // 2 seconds base delay
  maxDelayMs: 300000,      // 5 minutes maximum delay
  respectRetryAfter: true  // Respect Retry-After headers
});

// NonceManager with rate limiting
const nonceManager = new NonceManager({
  newNonceUrl: 'https://acme-v02.api.letsencrypt.org/acme/new-nonce',
  fetch: yourFetchFunction,
  rateLimiter,
  prefetchLowWater: 2,     // Minimum 2 nonces in pool
  prefetchHighWater: 5,    // Maximum 5 nonces in pool
  maxPool: 10              // Absolute pool maximum
});
```

### 2. Rate Limit Detection and Handling
```typescript
// Rate limiter automatically detects:
// - HTTP 503 responses with Retry-After header
// - Error messages containing "rate limit" or "too many"
// - Automatically retries with exponential backoff

try {
  const nonce = await nonceManager.take(namespace);
  // Use nonce...
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limit: ${error.rateLimitInfo.endpoint}`);
    console.log(`Retry after: ${new Date(error.rateLimitInfo.retryAfter)}`);
  }
}
```

### 3. Debug Logging
```bash
# Enable debug logs for all components
DEBUG="acme-love:*" node your-app.js

# Only for nonce manager
DEBUG="acme-love:nonce" node your-app.js

# Only for rate limiter
DEBUG="acme-love:ratelimit" node your-app.js
```

## Best Practices

### 1. Using Staging Environment
```typescript
// Always use staging for development and testing
const STAGING_DIRECTORY = 'https://acme-staging-v02.api.letsencrypt.org/directory';

// Staging has much higher limits:
// - 30,000 registrations per IP per 3 hours (vs 10 in prod)
// - 300,000 new orders per 3 hours (vs 300 in prod)
```

### 2. Domain Distribution
```typescript
// Avoid duplicate certificates by using different domains
const domains = [
  ['example1.com', 'www.example1.com'],
  ['example2.com', 'www.example2.com'],
  ['example3.com', 'www.example3.com']
];

// Each domain set can have up to 5 certificates per 7 days
```

### 3. Request Spacing
```typescript
// Add small delays between non-urgent requests
await delay(500); // 500ms between requests

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### 4. Rate Limit Monitoring
```typescript
// Check rate limit status
const status = rateLimiter.getRateLimitStatus('/acme/new-nonce');
if (status.isLimited) {
  console.log(`Rate limited until: ${new Date(status.retryAfter!)}`);
}

// Clear rate limit (for testing)
rateLimiter.clearRateLimit('/acme/new-nonce');
```

## Configuration for Different Environments

### Development/Testing
```typescript
const devRateLimiter = new RateLimiter({
  maxRetries: 2,
  baseDelayMs: 100,    // Fast for tests
  maxDelayMs: 5000,    // Short timeouts
  respectRetryAfter: true
});
```

### Production
```typescript
const prodRateLimiter = new RateLimiter({
  maxRetries: 5,
  baseDelayMs: 5000,   // Conservative delays
  maxDelayMs: 600000,  // 10 minutes maximum
  respectRetryAfter: true
});
```

### High-Volume Systems
```typescript
const highVolumeRateLimiter = new RateLimiter({
  maxRetries: 3,
  baseDelayMs: 10000,  // Long delays
  maxDelayMs: 1800000, // 30 minutes maximum
  respectRetryAfter: true
});
```

## Problem Diagnosis

### 1. Enable Debug Logs
```bash
DEBUG="acme-love:*" npm start
```

### 2. Metrics Monitoring
```typescript
// Nonce pool size
console.log('Pool size:', nonceManager.getPoolSize(namespace));

// Rate limit status
const limitStatus = rateLimiter.getRateLimitStatus('/acme/new-nonce');
console.log('Rate limit status:', limitStatus);
```

### 3. Common Errors
- **503 Service Unavailable**: Rate limit, will be automatically handled
- **"too many new registrations"**: Too many registrations from IP
- **"too many certificates for domain"**: Domain limit exceeded
- **"duplicate certificate"**: Duplicate certificate (5 per 7 days)

## Usage Examples

### Simple Nonce Retrieval
```typescript
const namespace = NonceManager.makeNamespace('https://acme-v02.api.letsencrypt.org');
const nonce = await nonceManager.take(namespace);
```

### Rate Limit Handling in Loop
```typescript
for (const domain of domains) {
  try {
    const nonce = await nonceManager.take(namespace);
    // Create certificate order...
    await delay(1000); // Pause between requests
  } catch (error) {
    if (error instanceof RateLimitError) {
      const waitTime = error.rateLimitInfo.retryAfter - Date.now();
      console.log(`Waiting ${waitTime}ms for rate limit...`);
      await delay(waitTime);
      // Retry iteration
    }
  }
}
```

### Parallel Processing with Limits
```typescript
const semaphore = new Semaphore(3); // Maximum 3 parallel requests

const promises = domains.map(async (domain) => {
  await semaphore.acquire();
  try {
    const nonce = await nonceManager.take(namespace);
    // Process domain...
  } finally {
    semaphore.release();
  }
});

await Promise.all(promises);
```

## Conclusion

The rate limit management system in ACME Love provides:
- ✅ Automatic rate limit detection and handling
- ✅ Intelligent retries with exponential backoff  
- ✅ Nonce pooling to reduce API load
- ✅ Detailed debug logging
- ✅ Configurable strategies for different environments
- ✅ Compatibility with Let's Encrypt production and staging

The library is production-ready for high-volume applications without risk of API limit violations.
