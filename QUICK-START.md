# 🚀 ACME Love - Quick Start Guide (New RFC 8555 API)

## Installation

```bash
npm install acme-love
```

## Basic Usage

### 1. Create ACME Client

```typescript
import { AcmeClient } from 'acme-love';

// Create client with RFC 8555 compliant naming
const client = new AcmeClient('https://acme-v02.api.letsencrypt.org/directory');

// Or with options
const client = new AcmeClient(directoryUrl, {
  nonce: {
    maxPool: 20, // Nonce pool size
    prefetchLowWater: 5, // Prefetch trigger
    maxAgeMs: 120_000, // Nonce lifetime
  },
  rateLimiter: {
    maxRetries: 3,
    baseDelayMs: 1000,
    respectRetryAfter: true,
  },
});
```

### 2. Account Management

```typescript
import { AcmeAccount, generateKeyPair } from 'acme-love';

// Generate account keys
const accountKeys = await generateKeyPair({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });

// Create account
const account = new AcmeAccount(client, accountKeys);

// Register account
const registration = await account.register(['admin@example.com'], true);

// Get account info
const accountInfo = await account.getAccount();
```

### 3. Certificate Workflow

```typescript
import { createAcmeCsr } from 'acme-love';

// Create order
const order = await account.createOrder(['example.com', 'www.example.com']);

// Solve DNS-01 challenge
const ready = await account.solveDns01(order, {
  setDns: async (preparation) => {
    console.log(`Set TXT record: ${preparation.target} = ${preparation.value}`);
    // Set up DNS record via your DNS provider
  },
  waitFor: async (preparation) => {
    console.log('Waiting for DNS propagation...');
    // Wait for DNS propagation
  },
});

// Generate CSR and finalize order
const csrResult = await createAcmeCsr(['example.com', 'www.example.com'], {
  kind: 'ec',
  namedCurve: 'P-256',
  hash: 'SHA-256',
});

const finalized = await account.finalize(ready, csrResult.derBase64Url);
const valid = await account.waitOrder(finalized, ['valid']);
const certificate = await account.downloadCertificate(valid);
```

## Tree-Shaking Imports

```typescript
// Import only what you need for optimal bundle size
import { AcmeClient } from 'acme-love/lib/core';
import { NonceManager } from 'acme-love/lib/managers';
import { createErrorFromProblem } from 'acme-love/lib/errors';
import type { AcmeDirectory, AcmeOrder } from 'acme-love/lib/types';
```

## Error Handling

```typescript
import { ACME_ERROR, AcmeError } from 'acme-love/lib/errors';

try {
  await account.register(['admin@example.com'], true);
} catch (error) {
  if (error instanceof AcmeError) {
    switch (error.type) {
      case ACME_ERROR.rateLimited:
        console.log('Rate limited, waiting...');
        break;
      case ACME_ERROR.badNonce:
        console.log('Bad nonce, retrying...');
        break;
      default:
        console.error('ACME error:', error.detail);
    }
  }
}
```

## Advanced Configuration

### Nonce Management

```typescript
const client = new AcmeClient(directoryUrl, {
  nonce: {
    maxPool: 30, // Larger pool for high concurrency
    prefetchLowWater: 10, // Prefetch when pool gets low
    maxAgeMs: 300_000, // 5-minute nonce lifetime
    initialFetchCount: 5, // Pre-populate pool
  },
});
```

### Rate Limiting

```typescript
const client = new AcmeClient(directoryUrl, {
  rateLimiter: {
    maxRetries: 5,
    baseDelayMs: 2000,
    maxDelayMs: 30_000,
    backoffFactor: 2,
    jitterPercent: 0.1,
    respectRetryAfter: true,
  },
});
```

### Debug Mode

```typescript
import { enableDebug } from 'acme-love/lib/utils';

// Enable debug logging
enableDebug(true);

// Custom logger
enableDebug(true, (level, message, data) => {
  console.log(`[${level}] ${message}`, data);
});
```

## Type Safety

```typescript
import type {
  AcmeClient,
  AcmeClientOptions,
  AcmeAccount,
  AcmeDirectory,
  AcmeOrder,
  AcmeChallenge,
  AcmeAuthorization,
} from 'acme-love';

// Full type safety throughout your code
const options: AcmeClientOptions = {
  nonce: {
    maxPool: 20,
    prefetchLowWater: 5,
  },
};

const client: AcmeClient = new AcmeClient(directoryUrl, options);
```

## Migration from Legacy API

### Before (Legacy)

```typescript
import { AcmeClientCore, AcmeAccountSession } from 'acme-love';

const client = new AcmeClientCore(directoryUrl);
const session = new AcmeAccountSession(client, privateKey);
```

### After (RFC 8555)

```typescript
import { AcmeClient, AcmeAccount } from 'acme-love';

const client = new AcmeClient(directoryUrl);
const account = new AcmeAccount(client, privateKey);
```

### Gradual Migration

```typescript
// Both APIs work simultaneously
import {
  AcmeClientCore, // Legacy (still works)
  AcmeClient, // New RFC 8555 (recommended)
} from 'acme-love';

// Migrate gradually
const legacyClient = new AcmeClientCore(directoryUrl);
const newClient = new AcmeClient(directoryUrl);
```

## Best Practices

1. **Use RFC 8555 API** for new projects
2. **Enable nonce pooling** for better performance
3. **Handle rate limiting** gracefully
4. **Use tree-shaking imports** for smaller bundles
5. **Enable TypeScript strict mode** for type safety
6. **Set up proper error handling** for production use

## Examples

See complete examples in:

- [`src/lib/example.ts`](src/lib/example.ts) - Basic usage
- [`src/lib/demo.ts`](src/lib/demo.ts) - Live demo
- [`docs/`](docs/) - Comprehensive guides

## Documentation

- [Architecture Overview](src/lib/README.md)
- [Migration Guide](docs/MIGRATION-PLAN.md)
- [RFC 8555 Naming](docs/RFC8555-NAMING.md)
- [API Reference](docs/)

---

**Happy coding with ACME Love! 🚀**
