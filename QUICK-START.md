# ACME Love - Quick Start Guide

## Installation

```bash
npm install acme-love
```

## Basic Usage

### 1. Create ACME Client

```typescript
import { AcmeClient, provider } from 'acme-love';

// Using provider preset (recommended)
const client = new AcmeClient(provider.letsencrypt.staging);

// Or with a string URL and options
const client = new AcmeClient('https://acme-v02.api.letsencrypt.org/directory', {
  nonce: {
    maxPool: 20,
    prefetchLowWater: 5,
    maxAgeMs: 120_000,
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
const registration = await account.register({
  contact: 'admin@example.com',
  termsOfServiceAgreed: true,
});

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

## Error Handling

```typescript
import { AcmeError, RateLimitedError, BadNonceError, ACME_ERROR } from 'acme-love';

try {
  await account.register({
    contact: 'admin@example.com',
    termsOfServiceAgreed: true,
  });
} catch (error) {
  if (error instanceof RateLimitedError) {
    const retrySeconds = error.getRetryAfterSeconds();
    console.log(`Rate limited. Retry in ${retrySeconds} seconds`);
  } else if (error instanceof AcmeError) {
    console.error(`ACME error [${error.type}]: ${error.detail}`);
  }
}
```

## Advanced Configuration

### Nonce Management

```typescript
const client = new AcmeClient(provider.letsencrypt.production, {
  nonce: {
    maxPool: 30,
    prefetchLowWater: 10,
    prefetchHighWater: 20,
    maxAgeMs: 300_000,
  },
});
```

### Debug Mode

Enable debug logging via environment variable:

```bash
# Enable all ACME Love debug output
DEBUG=acme-love:* node your-app.js

# Enable specific components
DEBUG=acme-love:nonce,acme-love:http node your-app.js
```

## Type Safety

```typescript
import type {
  AcmeClientOptions,
  AcmeDirectory,
  AcmeOrder,
  AcmeChallenge,
  AcmeAuthorization,
  AcmeEcAlgorithm,
  AcmeRsaAlgorithm,
  AcmeCertificateAlgorithm,
} from 'acme-love';

// Full type safety throughout your code
const options: AcmeClientOptions = {
  nonce: {
    maxPool: 20,
    prefetchLowWater: 5,
  },
};

const client = new AcmeClient(provider.letsencrypt.staging, options);
```

## Best Practices

1. **Use provider presets** for standard CAs (Let's Encrypt, ZeroSSL, etc.)
2. **Enable nonce pooling** for better performance under load
3. **Handle rate limiting** gracefully using `RateLimitedError`
4. **Enable TypeScript strict mode** for full type safety
5. **Set up proper error handling** for production use
6. **Use debug logging** during development (`DEBUG=acme-love:*`)

## Documentation

- [Full README](./README.md) - Comprehensive documentation
- [CLI Guide](./docs/CLI.md) - CLI usage and examples
- [EAB Guide](./docs/EAB.md) - External Account Binding setup
- [Nonce Manager](./docs/NONCE-MANAGER.md) - Advanced nonce configuration
- [Rate Limiting](./docs/RATE-LIMIT-GUIDE.md) - Rate limiting details
