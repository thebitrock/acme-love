# 🚀 ACME Love - RFC 8555 Compliant Architecture

[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![RFC 8555](https://img.shields.io/badge/RFC%208555-Compliant-green.svg)](https://tools.ietf.org/html/rfc8555)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-brightgreen.svg)](https://nodejs.org/)
[![Tree Shaking](https://img.shields.io/badge/Tree%20Shaking-Ready-orange.svg)](https://webpack.js.org/guides/tree-shaking/)

Modern TypeScript ACME client library with RFC 8555 compliant architecture and excellent developer experience.

## ✨ New Architecture Benefits

- 🎯 **RFC 8555 Compliant**: Clean naming that matches the ACME standard
- 📦 **Tree-Shakable**: Import only what you need for optimal bundle sizes
- 🔷 **TypeScript First**: Excellent type safety and IDE support
- 🏗️ **Modular Design**: Domain-based structure for better maintainability
- ⚡ **Performance**: Advanced nonce pooling and rate limiting
- 🔄 **Backward Compatible**: Smooth migration path from legacy APIs

## 🏗️ Architecture Overview

```
src/lib/                    # RFC 8555 Compliant Architecture
├── core/                   # Core ACME functionality
│   ├── acme-client.ts     # Main ACME client (RFC 8555 Section 7.1)
│   └── acme-account.ts    # Account management (RFC 8555 Section 7.3)
├── managers/              # State management
│   ├── nonce-manager.ts   # Anti-replay nonce pool
│   └── rate-limiter.ts    # API rate limiting
├── transport/             # HTTP transport layer
│   └── http-client.ts     # ACME HTTP client
├── errors/                # RFC 7807 Problem Details
│   ├── codes.ts           # ACME error codes
│   ├── errors.ts          # Error classes
│   └── factory.ts         # Error factory
├── types/                 # TypeScript definitions
│   ├── directory.ts       # ACME directory types
│   ├── account.ts         # Account types
│   └── order.ts           # Order/Challenge types
└── utils/                 # Utilities and helpers
```

## 🚀 Quick Start

### Modern RFC 8555 API

```typescript
import { AcmeClient, AcmeAccount } from 'acme-love';

// Create ACME client with clean RFC 8555 naming
const client = new AcmeClient('https://acme-v02.api.letsencrypt.org/directory');

// Get ACME directory
const directory = await client.getDirectory();

// Account management
const account = new AcmeAccount(client, keys);
await account.register({ contact: 'admin@example.com', termsOfServiceAgreed: true });

// Certificate workflow
const order = await account.createOrder(['example.com']);
```

### Tree-Shakable Imports

```typescript
// Import only what you need
import { AcmeClient } from 'acme-love/lib/core';
import { NonceManager } from 'acme-love/lib/managers';
import { createErrorFromProblem } from 'acme-love/lib/errors';

// Optimal bundle size!
```

### Legacy Compatibility

```typescript
// Your existing code continues to work
import { AcmeClientCore, AcmeAccountSession } from 'acme-love';

const client = new AcmeClientCore(directoryUrl);
// ↑ Still works! But consider migrating to AcmeClient
```

## 📋 Migration Guide

### Current Progress: 35% Complete

**✅ Completed:**

- RFC 8555 compliant naming (`AcmeClient`, `AcmeAccount`)
- Modular architecture with tree-shaking
- TypeScript-first approach
- Backward compatibility layer
- Comprehensive documentation

**🔄 In Progress:**

- Type conflict resolution
- Complete challenge system migration
- Crypto module organization

### Quick Migration Commands

```bash
# Check migration status
./scripts/migrate.sh status

# Validate RFC 8555 compliance
./scripts/migrate.sh validate

# Continue with next phase
./scripts/migrate.sh phase3
```

## 📊 RFC 8555 Compliance

| Component   | Before               | After           | RFC Section |
| ----------- | -------------------- | --------------- | ----------- |
| Main Client | `AcmeClientCore`     | `AcmeClient`    | 7.1         |
| Account     | `AcmeAccountSession` | `AcmeAccount`   | 7.3         |
| Directory   | `ACMEDirectory`      | `AcmeDirectory` | 7.1.1       |
| Orders      | `ACMEOrder`          | `AcmeOrder`     | 7.4         |
| Challenges  | `ACMEChallenge`      | `AcmeChallenge` | 8.0         |

## 🔧 Advanced Features

### Nonce Pool Management

```typescript
const client = new AcmeClient(directoryUrl, {
  nonce: {
    maxPool: 20, // Pool size
    prefetchLowWater: 5, // Prefetch trigger
    maxAgeMs: 120_000, // Nonce lifetime
  },
});
```

### Rate Limiting

```typescript
const rateLimiter = new RateLimiter({
  maxRetries: 3,
  baseDelayMs: 1000,
  respectRetryAfter: true,
});
```

### Error Handling

```typescript
import { ACME_ERROR, createErrorFromProblem } from 'acme-love/lib/errors';

try {
  await account.register();
} catch (error) {
  if (error.type === ACME_ERROR.rateLimited) {
    // Handle rate limiting
  }
}
```

## 📈 Performance Benefits

- **Nonce Pooling**: Pre-fetch nonces for reduced latency
- **Rate Limiting**: Intelligent backoff and retry strategies
- **Tree Shaking**: Only bundle what you use
- **TypeScript**: Compile-time optimizations

## 🎯 TypeScript Excellence

```typescript
// Full type safety throughout
import type {
  AcmeClient,
  AcmeClientOptions,
  AcmeDirectory,
  AcmeOrder,
  AcmeChallenge,
} from 'acme-love';

// Excellent IntelliSense support
const options: AcmeClientOptions = {
  nonce: {
    /* fully typed */
  },
};
```

## 🛠️ Development

### Project Structure

- `src/lib/` - New RFC 8555 compliant architecture
- `src/acme/` - Legacy code (being phased out)
- `docs/` - Comprehensive documentation
- `scripts/` - Migration and automation tools

## 📚 Documentation

Legacy migration documents have been removed after completion. Current docs focus only on the stable API.

## 🤝 Contributing

The new architecture makes contributing easier:

1. **Clear Structure**: Domain-based organization
2. **Type Safety**: Full TypeScript coverage
3. **Modular**: Test and develop components in isolation
4. **Standards Compliant**: RFC 8555 naming and patterns

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Ready for production use with modern TypeScript patterns and RFC 8555 compliance!** 🚀
