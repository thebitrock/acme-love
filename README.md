<div align="center">

# acme-love

ACME v2 client (RFC 8555) for Let's Encrypt
TypeScript-first · Node.js · CLI

[![NPM Version](https://img.shields.io/npm/v/acme-love.svg)](https://www.npmjs.com/package/acme-love)
[![NPM License](https://img.shields.io/npm/l/acme-love.svg)](https://github.com/thebitrock/acme-love/blob/main/LICENSE)
[![Tests](https://img.shields.io/badge/tests-42%20passing-brightgreen.svg)](https://github.com/thebitrock/acme-love)
[![Coverage](https://img.shields.io/badge/coverage-94%25%20CSR%20%7C%2069%25%20NonceManager-green.svg)](https://github.com/thebitrock/acme-love)

</div>

A Node.js / TypeScript ACME client for certificate automation with Let's Encrypt and other ACME-compliant CAs. Supports DNS-01 and HTTP-01 validation, wildcard domains, and External Account Binding (EAB).

<a id="table-of-contents"></a>

## Table of Contents

<!-- TOC-START -->

- [Key Features](#key-features)
- [Quick Start](#quick-start)
  - [CLI Installation & Usage](#cli-installation-usage)
  - [Interactive Mode](#interactive-mode-easiest-way)
  - [Command Line Mode](#command-line-mode)
  - [Challenge Types](#challenge-types)
  - [Cryptographic Algorithms](#cryptographic-algorithms)
  - [Development & Local Usage](#development-local-usage)
  - [CLI Commands Reference](#cli-commands-reference)
- [Library Usage](#library-usage)
  - [Installation](#installation)
  - [Modern ACME Client](#modern-acme-client)
  - [External Account Binding (EAB)](#external-account-binding-eab-support)
  - [Supported Cryptographic Algorithms](#supported-cryptographic-algorithms)
  - [Working with Existing Accounts](#working-with-existing-accounts)
  - [Advanced Features](#advanced-features)
- [Nonce Management](#nonce-management)
  - [Debug Logging](#debug-logging)
- [Advanced Validators & Utilities](#advanced-validators-utilities)
- [CSR Generation](#csr-generation)
- [Supported ACME Providers](#supported-acme-providers)
- [Client Initialization](#client-initialization)
- [CLI Features Showcase](#cli-features-showcase)
- [Documentation](#documentation)
- [Ecosystem](#ecosystem)
- [ACME Client for TypeScript](#acme-client-for-typescript)
- [Let's Encrypt ACME CLI](#lets-encrypt-acme-cli)
- [RFC 8555 Compliance](#rfc-8555-compliance)
- [Comparison with Other ACME Clients](#comparison-with-other-acme-clients)
- [Troubleshooting](#troubleshooting)
- [Requirements](#requirements)
- [Performance & Stress Testing](#performance-stress-testing)
- [Test Coverage](#test-coverage)
- [License](#license)
- [Contributing](#contributing)

<!-- TOC-END -->

<a id="key-features"></a>

## Key Features

| Feature                      | Description                                                           |
| ---------------------------- | --------------------------------------------------------------------- |
| **Powerful CLI**             | Interactive & non-interactive modes with polished prompts             |
| **Multi-Environment**        | Staging, production & custom directory endpoints                      |
| **Challenge Support**        | DNS-01 (wildcard-friendly) & HTTP-01 with built-in validation helpers |
| **Crypto Algorithms**        | ECDSA P-256 / P-384 / P-521 and RSA 2048 / 3072 / 4096                |
| **External Account Binding** | EAB support (ZeroSSL, Google Trust Services, etc.)                    |
| **Resilient Error Handling** | RFC 8555 problem+json mapping, retry & maintenance detection          |
| **Optimized Core**           | Nonce pooling, FS read minimization, undici HTTP client               |
| **Multiple CAs**             | Presets: Let's Encrypt, Buypass, Google, ZeroSSL + custom URLs        |
| **Typed API**                | Strong TypeScript types for orders, accounts, directory metadata      |
| **Diagnostics**              | Namespaced debug logging; stress & performance reports                |
| **Tested**                   | Unit + stress tests; concurrency & rate limit scenarios               |
| **Developer Friendly**       | CSR helpers, validation utilities, composable modules                 |

<a id="quick-start"></a>

## Quick Start

<a id="cli-installation-usage"></a>

### CLI Installation & Usage

> **Full CLI Documentation**: See [CLI.md](./docs/CLI.md) for complete usage guide, examples, and advanced features.

```bash
# Global installation (recommended)
npm install -g acme-love
acme-love --help

# Or use without installation
npx acme-love interactive --staging
```

<a id="interactive-mode-easiest-way"></a>

### Interactive Mode (Easiest Way)

```bash
# Start interactive mode with environment selection
acme-love interactive

# Or with pre-selected environment
acme-love interactive --staging # For testing
acme-love interactive --production # For real certificates
```

<a id="command-line-mode"></a>

### Command Line Mode

```bash
# Get a staging certificate (recommended first)
acme-love cert \
 --domain test.acme-love.com \
 --email admin@acme-love.com \
 --staging \
 --challenge dns-01

# Get a production certificate with custom algorithms
acme-love cert \
 --domain acme-love.com \
 --email admin@acme-love.com \
 --production \
 --challenge http-01 \
 --account-algo ec-p256 \
 --cert-algo rsa-4096

# Create an account key with specific algorithm
acme-love create-account-key \
 --algo ec-p384 \
 --output ./my-account-key.json

# Use External Account Binding for commercial CAs
acme-love cert \
 --domain acme-love.com \
 --email admin@acme-love.com \
 --directory https://acme.zerossl.com/v2/DV90 \
 --eab-kid "your-key-identifier" \
 --eab-hmac-key "your-base64url-hmac-key"
```

<a id="challenge-types"></a>

### Challenge Types

**DNS-01 Challenge** (Recommended)

```bash
acme-love cert --challenge dns-01 --domain acme-love.com --email user@acme-love.com --staging
```

- Works with wildcard certificates (`*.acme-love.com`)
- No need for public web server
- Requires DNS provider access

**HTTP-01 Challenge**

```bash
acme-love cert --challenge http-01 --domain acme-love.com --email user@acme-love.com --staging
```

- Simple validation via HTTP file
- Automatic validation with built-in checker
- Requires domain to point to your web server

<a id="cryptographic-algorithms"></a>

### Cryptographic Algorithms

The CLI uses **P-256 ECDSA** by default for both account and certificate keys, providing an excellent balance of security and performance. This algorithm is:

- **Fast**: Quicker than RSA for signing operations
- **Secure**: 256-bit elliptic curve equivalent to 3072-bit RSA
- **Compatible**: Widely supported by browsers and servers
- **Compact**: Smaller key sizes and certificate files

For programmatic usage via the library, you can choose from multiple algorithms including different ECDSA curves (P-256, P-384, P-521) and RSA key sizes (2048, 3072, 4096 bits). See the [Supported Cryptographic Algorithms](#supported-cryptographic-algorithms) section for details.

<a id="development-local-usage"></a>

### Development & Local Usage

If you're developing or testing locally, you have multiple convenient options:

```bash
# Development wrapper (auto-builds when needed)
./acme-love --help

# NPM scripts
npm run cli:help
npm run cli:staging
npm run cli:production

# Make commands
make help
make interactive
make staging
```

See [CLI.md](./docs/CLI.md) for complete CLI documentation and usage examples.

<a id="cli-commands-reference"></a>

### CLI Commands Reference

| Command              | Purpose                        | Algorithm Options                    | EAB Options                                |
| -------------------- | ------------------------------ | ------------------------------------ | ------------------------------------------ |
| `cert`               | Obtain SSL certificate         | `--account-algo`, `--cert-algo`      | `--eab-kid`, `--eab-hmac-key`              |
| `create-account-key` | Generate ACME account key      | `--algo`                             | -                                          |
| `interactive`        | Interactive certificate wizard | Full interactive algorithm selection | Prompts for EAB when custom directory used |

**Algorithm Values**: `ec-p256` (default), `ec-p384`, `ec-p521`, `rsa-2048`, `rsa-3072`, `rsa-4096`

**EAB Options**: `--eab-kid <identifier>`, `--eab-hmac-key <base64url-key>` for commercial CAs

**Examples**:

```bash
# Generate P-384 ECDSA account key
acme-love create-account-key --algo ec-p384 --output ./my-account.json

# Mixed algorithms: P-256 account, RSA-4096 certificate
acme-love cert --account-algo ec-p256 --cert-algo rsa-4096 --domain acme-love.com

# Interactive mode with full algorithm selection
acme-love interactive --staging

# Commercial CA with External Account Binding
acme-love cert \
 --domain acme-love.com \
 --directory https://acme.zerossl.com/v2/DV90 \
 --eab-kid "your-eab-key-id" \
 --eab-hmac-key "your-eab-hmac-key"

# Note: For known CAs, you can also use predefined providers in the library:
# AcmeClient(provider.zerossl.production) or AcmeClient(provider.google.production)
```

<a id="library-usage"></a>

## Library Usage

[Back to Top](#table-of-contents)

<a id="installation"></a>

### Installation

```bash
npm install acme-love
```

<a id="modern-acme-client"></a>

### Modern ACME Client

```ts
import { AcmeClient, AcmeAccount, provider, generateKeyPair, createAcmeCsr } from 'acme-love';

// 1. Create ACME client - using provider preset (recommended)
const client = new AcmeClient(provider.letsencrypt.staging, {
  nonce: { maxPool: 64 },
});

// Alternative: Create client with string URL
// const client = new AcmeClient(provider.letsencrypt.staging.directoryUrl, {
// nonce: { maxPool: 64 },
// });

// 2. Generate account keys (P-256 ECDSA recommended)
const algo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
const keyPair = await generateKeyPair(algo);
const accountKeys = {
  privateKey: keyPair.privateKey,
  publicKey: keyPair.publicKey,
};

// 3. Create account
const account = new AcmeAccount(client, accountKeys);

// 4. Register account
const registration = await account.register({
  contact: 'admin@acme-love.com', // string or array
  termsOfServiceAgreed: true,
});

// 5. Create order and solve challenges
const order = await account.createOrder(['acme-love.com']);

// DNS-01 challenge
const ready = await account.solveDns01(order, {
  setDns: async (preparation) => {
    console.log(`Create TXT record: ${preparation.target} = ${preparation.value}`);
    // Set DNS record via your DNS provider API
    await waitForUserConfirmation();
  },
  waitFor: async (preparation) => {
    // Validate DNS propagation
    console.log('Validating DNS...');
  },
});

// 6. Generate CSR and finalize
const { derBase64Url, keys: csrKeys } = await createAcmeCsr(['acme-love.com'], algo);
const finalized = await account.finalize(ready, derBase64Url);
const valid = await account.waitOrder(finalized, ['valid']);
const certificate = await account.downloadCertificate(valid);

console.log('Certificate obtained!', certificate);
```

<a id="external-account-binding-eab-support"></a>

### External Account Binding (EAB) Support

For Certificate Authorities that require EAB (ZeroSSL, Google Trust Services), provide credentials during account creation:

```ts
const account = new AcmeAccount(client, accountKeys, {
  externalAccountBinding: {
    kid: 'your-key-identifier-from-ca',
    hmacKey: 'your-base64url-hmac-key-from-ca',
  },
});
```

**EAB-enabled CAs:** ZeroSSL (required), Google Trust Services (required), Buypass (optional).

For complete EAB setup including CLI usage and credential acquisition, see [docs/EAB.md](./docs/EAB.md).

<a id="supported-cryptographic-algorithms"></a>

### Supported Cryptographic Algorithms

ACME Love supports multiple cryptographic algorithms for both account keys and certificate keys:

#### ECDSA (Elliptic Curve Digital Signature Algorithm)

- **P-256** (recommended) - Fast, secure, widely supported
- **P-384** - Higher security, larger keys
- **P-521** - Maximum security, largest keys

```ts
// P-256 (recommended for most cases)
const p256Algo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };

// P-384 for enhanced security
const p384Algo = { kind: 'ec', namedCurve: 'P-384', hash: 'SHA-384' };

// P-521 for maximum security
const p521Algo = { kind: 'ec', namedCurve: 'P-521', hash: 'SHA-512' };
```

#### RSA (Rivest-Shamir-Adleman)

- **2048-bit** - Minimum supported, fast
- **3072-bit** - Enhanced security
- **4096-bit** - Maximum security, slower

```ts
// RSA 2048-bit (minimum)
const rsa2048Algo = { kind: 'rsa', modulusLength: 2048, hash: 'SHA-256' };

// RSA 3072-bit (enhanced security)
const rsa3072Algo = { kind: 'rsa', modulusLength: 3072, hash: 'SHA-256' };

// RSA 4096-bit (maximum security)
const rsa4096Algo = { kind: 'rsa', modulusLength: 4096, hash: 'SHA-384' };
```

#### Algorithm Selection Guidelines

- **P-256 ECDSA**: Default choice, excellent performance/security balance
- **P-384/P-521 ECDSA**: For compliance requirements or enhanced security
- **RSA 2048**: Legacy compatibility, larger certificate size
- **RSA 3072/4096**: High-security environments, significantly slower

**Important**: You can use different algorithms for account keys and certificate keys independently. Account keys are used for ACME protocol authentication, while certificate keys are embedded in the final TLS certificate.

**TypeScript Types**: The library exports `AcmeEcAlgorithm`, `AcmeRsaAlgorithm`, and their union `AcmeCertificateAlgorithm` for type-safe algorithm specification:

```ts
import type { AcmeEcAlgorithm, AcmeRsaAlgorithm, AcmeCertificateAlgorithm } from 'acme-love';

// Type-safe algorithm definitions
const ecAlgo: AcmeEcAlgorithm = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
const rsaAlgo: AcmeRsaAlgorithm = { kind: 'rsa', modulusLength: 2048, hash: 'SHA-256' };
const algo: AcmeCertificateAlgorithm = ecAlgo; // Union type
```

#### Example: Different Algorithms for Account and Certificate

```ts
import { generateKeyPair, createAcmeCsr } from 'acme-love';

// Use P-256 for account keys (fast ACME protocol operations)
const accountAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
const accountKeys = await generateKeyPair(accountAlgo);

// Use P-384 for certificate keys (enhanced security in final certificate)
const certAlgo = { kind: 'ec', namedCurve: 'P-384', hash: 'SHA-384' };
const { derBase64Url, keys: certKeys } = await createAcmeCsr(['acme-love.com'], certAlgo);

// Or mix ECDSA and RSA
const accountAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' }; // Fast ECDSA for account
const certAlgo = { kind: 'rsa', modulusLength: 4096, hash: 'SHA-256' }; // RSA for certificate compatibility
```

<a id="working-with-existing-accounts"></a>

### Working with Existing Accounts

When you already have a registered ACME account, you can reuse it by providing the `kid` (Key ID) to avoid creating duplicate registrations:

```ts
// First time: Register new account and save the registration details
const account = new AcmeAccount(client, accountKeys);
const registration = await account.register({
  contact: 'admin@acme-love.com',
  termsOfServiceAgreed: true,
});

// Save the account URL (kid) for future use
const accountUrl = registration.accountUrl;

// Save account information for reuse
const accountInfo = {
  accountUrl, // This is the kid
  privateKey: await crypto.subtle.exportKey('jwk', accountKeys.privateKey),
  publicKey: await crypto.subtle.exportKey('jwk', accountKeys.publicKey),
};
await fs.writeFile('account.json', JSON.stringify(accountInfo, null, 2));
```

```ts
// Later: Load existing account with kid
const savedAccount = JSON.parse(await fs.readFile('account.json', 'utf8'));
const accountKeys = {
  privateKey: await crypto.subtle.importKey(
    'jwk',
    savedAccount.privateKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  ),
  publicKey: await crypto.subtle.importKey(
    'jwk',
    savedAccount.publicKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  ),
};

// Create account with existing account URL (kid)
const account = new AcmeAccount(client, accountKeys, {
  kid: savedAccount.accountUrl, // Use existing account URL
});

// No need to call register() - account already exists
const order = await account.createOrder(['acme-love.com']);
```

<a id="advanced-features"></a>

### Advanced Features

**Comprehensive Error Handling**

ACME Love provides detailed error types for precise error handling in your applications. All ACME-specific errors extend the base `AcmeError` class and follow RFC 8555 error specifications.

#### ACME Protocol Errors

```ts
import {
  AcmeError,
  ServerMaintenanceError,
  RateLimitedError,
  BadNonceError,
  AccountDoesNotExistError,
  OrderNotReadyError,
  ExternalAccountRequiredError,
  RateLimitError, // From rate limiter
} from 'acme-love';

try {
  await account.createOrder(['acme-love.com']);
} catch (error) {
  // Server maintenance detection
  if (error instanceof ServerMaintenanceError) {
    console.log(' Service is under maintenance');
    console.log(' Check https://letsencrypt.status.io/');
    console.log(' Please try again later when the service is restored.');
    return;
  }

  // Rate limiting with automatic retry information
  if (error instanceof RateLimitedError) {
    const retrySeconds = error.getRetryAfterSeconds();
    console.log(` Rate limited. Retry in ${retrySeconds} seconds`);
    console.log(` Details: ${error.detail}`);

    // Wait and retry automatically
    if (retrySeconds && retrySeconds < 300) {
      // Max 5 minutes
      await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
      // Retry the operation...
    }
    return;
  }

  // Nonce issues (automatically handled by nonce manager)
  if (error instanceof BadNonceError) {
    console.log(' Invalid nonce - this should be handled automatically');
    // The NonceManager typically retries these automatically
  }

  // Account-related errors
  if (error instanceof AccountDoesNotExistError) {
    console.log(' Account does not exist - need to register first');
  }

  // Order state errors
  if (error instanceof OrderNotReadyError) {
    console.log(' Order not ready for finalization - complete challenges first');
  }

  // EAB requirement
  if (error instanceof ExternalAccountRequiredError) {
    console.log(' This CA requires External Account Binding (EAB)');
    console.log(' Use --eab-hmac-key option or provide EAB credentials');
  }

  // Rate limiter errors (from internal rate limiting system)
  if (error instanceof RateLimitError) {
    console.log(` Internal rate limit: ${error.message}`);
    console.log(` Attempts: ${error.rateLimitInfo.attempts}`);
    console.log(` Retry in ${error.rateLimitInfo.retryDelaySeconds}s`);
  }

  // Generic ACME error with details
  if (error instanceof AcmeError) {
    console.log(` ACME Error: ${error.detail}`);
    console.log(` Type: ${error.type}`);
    console.log(` Status: ${error.status}`);

    // Handle subproblems for compound errors
    if (error.subproblems?.length) {
      console.log(' Subproblems:');
      error.subproblems.forEach((sub, i) => {
        console.log(` ${i + 1}. ${sub.detail} (${sub.type})`);
      });
    }
  }
}
```

#### Complete Error Types Reference

**Account & Registration Errors:**

- `AccountDoesNotExistError` - Account doesn't exist, need to register
- `ExternalAccountRequiredError` - CA requires EAB for registration
- `InvalidContactError` - Invalid contact information (email format, etc.)
- `UnsupportedContactError` - Unsupported contact protocol scheme

**Authentication & Authorization Errors:**

- `BadNonceError` - Invalid anti-replay nonce (auto-retried by NonceManager)
- `BadPublicKeyError` - Unsupported public key algorithm
- `BadSignatureAlgorithmError` - Unsupported signature algorithm
- `UnauthorizedError` - Insufficient authorization for requested action
- `UserActionRequiredError` - Manual action required (visit instance URL)

**Certificate & CSR Errors:**

- `BadCSRError` - Invalid Certificate Signing Request
- `BadRevocationReasonError` - Invalid revocation reason provided
- `AlreadyRevokedError` - Certificate already revoked
- `OrderNotReadyError` - Order not ready for finalization
- `RejectedIdentifierError` - Server won't issue for this identifier

**Validation Errors:**

- `CAAError` - CAA DNS records forbid certificate issuance
- `ConnectionError` - Can't connect to validation target
- `DNSError` - DNS resolution problems during validation
- `IncorrectResponseError` - Challenge response doesn't match requirements
- `TLSError` - TLS issues during validation
- `UnsupportedIdentifierError` - Unsupported identifier type

**Server & Network Errors:**

- `ServerInternalError` - Internal server error (500)
- `ServerMaintenanceError` - Service under maintenance (503)
- `RateLimitedError` - ACME rate limit exceeded with retry info
- `MalformedError` - Malformed request message
- `CompoundError` - Multiple errors (check subproblems array)

**Rate Limiting Errors:**

- `RateLimitError` - Internal rate limiter exceeded retry attempts

#### Error Handling Patterns

**Pattern 1: Graceful Degradation**

```ts
async function createCertificateWithFallback(domain: string) {
  try {
    return await createCertificate(domain);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      // Wait and retry once
      const retrySeconds = error.getRetryAfterSeconds();
      if (retrySeconds && retrySeconds < 3600) {
        // Max 1 hour
        await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
        return await createCertificate(domain);
      }
    }

    if (error instanceof ServerMaintenanceError) {
      // Try staging environment as fallback
      return await createCertificateStaging(domain);
    }

    throw error; // Re-throw unhandled errors
  }
}
```

**Pattern 2: Retry with Exponential Backoff**

```ts
async function robustCertificateCreation(domain: string, maxRetries = 3) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await createCertificate(domain);
    } catch (error) {
      attempt++;

      if (error instanceof BadNonceError && attempt < maxRetries) {
        // Exponential backoff for nonce errors
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (error instanceof RateLimitedError) {
        const retrySeconds = error.getRetryAfterSeconds();
        if (retrySeconds && retrySeconds < 1800) {
          // Max 30 minutes
          await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
          continue;
        }
      }

      // Don't retry these errors
      if (
        error instanceof ExternalAccountRequiredError ||
        error instanceof BadCSRError ||
        error instanceof RejectedIdentifierError
      ) {
        throw error;
      }

      if (attempt >= maxRetries) throw error;
    }
  }
}
```

**Pattern 3: Error Categorization**

```ts
function categorizeError(error: unknown): 'retry' | 'reconfigure' | 'fatal' {
  if (
    error instanceof RateLimitedError ||
    error instanceof BadNonceError ||
    error instanceof ServerMaintenanceError ||
    error instanceof ConnectionError
  ) {
    return 'retry';
  }

  if (
    error instanceof ExternalAccountRequiredError ||
    error instanceof BadCSRError ||
    error instanceof InvalidContactError ||
    error instanceof UnsupportedContactError
  ) {
    return 'reconfigure';
  }

  return 'fatal';
}

async function handleCertificateError(error: unknown) {
  const category = categorizeError(error);

  switch (category) {
    case 'retry':
      console.log(' Temporary issue - will retry automatically');
      break;
    case 'reconfigure':
      console.log(' Configuration issue - please check your settings');
      break;
    case 'fatal':
      console.log(' Fatal error - manual intervention required');
      break;
  }
}
```

#### JSON Serialization

All ACME errors support JSON serialization for logging and debugging:

```ts
try {
  await acct.createOrder(['acme-love.com']);
} catch (error) {
  if (error instanceof AcmeError) {
    // Structured error logging
    const errorData = error.toJSON();
    console.log('ACME Error Details:', JSON.stringify(errorData, null, 2));

    // Send to monitoring system
    await sendToMonitoring({
      event: 'acme_error',
      error: errorData,
      timestamp: new Date().toISOString(),
    });
  }
}
```

**HTTP-01 Challenge with Validation**

```ts
const ready = await acct.solveHttp01(order, {
  setHttp: async (preparation) => {
    // Serve challenge at: preparation.target
    // Content: preparation.value
    console.log(`Serve ${preparation.value} at ${preparation.target}`);
  },
  waitFor: async (preparation) => {
    // Built-in HTTP validator
    const { validateHttp01ChallengeByUrl } = await import('acme-love/validator');
    const result = await validateHttp01ChallengeByUrl(preparation.target, preparation.value);
    if (!result.ok) throw new Error('HTTP validation failed');
  },
});
```

**Custom Cryptographic Algorithms**

```ts
import { generateKeyPair, createAcmeCsr } from 'acme-love';

// High-security setup: P-521 for account, RSA-4096 for certificate
const accountAlgo = { kind: 'ec', namedCurve: 'P-521', hash: 'SHA-512' };
const certAlgo = { kind: 'rsa', modulusLength: 4096, hash: 'SHA-384' };

const accountKeys = await generateKeyPair(accountAlgo);
const { derBase64Url, keys: certKeys } = await createAcmeCsr(['acme-love.com'], certAlgo);

// Performance-optimized setup: P-256 for both
const fastAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
const accountKeys = await generateKeyPair(fastAlgo);
const { derBase64Url } = await createAcmeCsr(['acme-love.com'], fastAlgo);
```

**Debug Logging for Library Usage**

```ts
import { enableDebug, debugNonce, debugHttp } from 'acme-love';

// Enable debug for development
enableDebug();

// Use specific debug loggers in your code
debugNonce('Custom nonce debug message');
debugHttp('HTTP operation debug info');
```

<a id="nonce-management"></a>

## Nonce Management

[Back to Top](#table-of-contents)

ACME Love includes a **NonceManager** that optimizes nonce handling for high-performance certificate operations. Nonces are automatically pooled, prefetched, and recycled to minimize network round-trips.

```ts
const client = new AcmeClient(provider.letsencrypt.production, {
  nonce: {
    maxPool: 64,
    prefetchLowWater: 12,
    prefetchHighWater: 40,
    maxAgeMs: 5 * 60_000,
  },
});
```

| Option              | Default | Description                                        |
| ------------------- | ------- | -------------------------------------------------- |
| `maxPool`           | 32      | Maximum cached nonces per namespace                |
| `prefetchLowWater`  | 0       | Start prefetch when pool below this (0 = disabled) |
| `prefetchHighWater` | 0       | Target fill level for prefetch                     |
| `maxAgeMs`          | 300000  | Discard nonces older than 5 minutes                |

For performance scenarios, per-account overrides, and advanced configuration see [docs/NONCE-MANAGER.md](./docs/NONCE-MANAGER.md).

<a id="debug-logging"></a>

### Debug Logging

```bash
# Enable all ACME Love debug output
DEBUG=acme-love:* node your-app.js

# Available namespaces: acme-love:nonce, acme-love:http, acme-love:challenge, acme-love:client, acme-love:validator
```

<a id="advanced-validators-utilities"></a>

## Advanced Validators & Utilities

<a id="dns-validation-functions"></a>

### DNS Validation Functions

For advanced DNS-01 challenge handling, ACME Love provides powerful DNS validation utilities:

```ts
import {
  resolveAndValidateAcmeTxtAuthoritative,
  resolveAndValidateAcmeTxt,
  resolveNsToIPs,
  findZoneWithNs,
} from 'acme-love/validator';

// Authoritative DNS validation (queries actual NS servers)
const result = await resolveAndValidateAcmeTxtAuthoritative(
  '_acme-challenge.acme-love.com',
  'expected-challenge-value',
);

if (result.ok) {
  console.log(' DNS challenge validated');
} else {
  console.log(' DNS validation failed:', result.error);
}

// Standard DNS validation with fallback to public resolvers
const quickResult = await resolveAndValidateAcmeTxt(
  '_acme-challenge.acme-love.com',
  'expected-challenge-value',
);
```

<a id="http-validation-functions"></a>

### HTTP Validation Functions

```ts
import { validateHttp01ChallengeByUrl, validateHttp01Challenge } from 'acme-love/validator';

// Direct URL validation
const result = await validateHttp01ChallengeByUrl(
  'http://acme-love.com/.well-known/acme-challenge/token123',
  'expected-key-authorization',
);

// Domain + token validation
const result2 = await validateHttp01Challenge(
  'acme-love.com',
  'token123',
  'expected-key-authorization',
);
```

<a id="cli-configuration-details"></a>

### CLI Configuration Details

When using the CLI, ACME Love automatically handles file organization and configuration:

```bash
# Default directory structure created by CLI
./certificates/
 acme-love.com/
 cert.pem # Certificate chain
 cert-key.json # Certificate private key (JWK format)
 cert.csr.pem # Certificate signing request
 order.json # ACME order details
 account-key.json # ACME account keys (JWK format)
```

**CLI Configuration Defaults:**

- **Output directory**: `./certificates/`
- **Account key path**: `./certificates/account-key.json`
- **Nonce pool size**: 64 (optimized for CLI operations)
- **Key algorithm**: ECDSA P-256 (ES256)
- **File format**: JWK for keys, PEM for certificates

<a id="csr-generation"></a>

## CSR Generation

The `createAcmeCsr` helper generates everything needed for certificate finalization:

```ts
import { createAcmeCsr } from 'acme-love';

const { pem, derBase64Url, keys } = await createAcmeCsr(
  ['acme-love.com', 'www.acme-love.com'], // domains (first = CN)
  { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' },
);

// pem: PEM-encoded CSR for storage
// derBase64Url: base64url DER for ACME finalize
// keys: Certificate private/public key pair
```

<a id="supported-cryptographic-algorithms-1"></a>

### Supported Cryptographic Algorithms

ACME Love supports modern cryptographic algorithms via WebCrypto API:

```ts
import { generateKeyPair, type AcmeCertificateAlgorithm } from 'acme-love';

// ECDSA with P-256 curve (Recommended - smaller keys, faster)
const ecAlgo: AcmeCertificateAlgorithm = {
  kind: 'ec',
  namedCurve: 'P-256',
  hash: 'SHA-256',
};

// ECDSA with P-384 curve (Higher security)
const ec384Algo: AcmeCertificateAlgorithm = {
  kind: 'ec',
  namedCurve: 'P-384',
  hash: 'SHA-384',
};

// RSA 2048-bit (Widely compatible, larger keys)
const rsaAlgo: AcmeCertificateAlgorithm = {
  kind: 'rsa',
  modulusLength: 2048,
  hash: 'SHA-256',
};

// RSA 4096-bit (Maximum security, slower)
const rsa4096Algo: AcmeCertificateAlgorithm = {
  kind: 'rsa',
  modulusLength: 4096,
  hash: 'SHA-256',
};

// Generate key pair with chosen algorithm
const keyPair = await generateKeyPair(ecAlgo);
```

**Algorithm Recommendations:**

- **ECDSA P-256**: Best balance of security, performance, and compatibility
- **ECDSA P-384**: For applications requiring higher security
- **RSA 2048**: For maximum compatibility with older systems
- **RSA 4096**: For maximum security (slower operations)

**Key Storage Formats:**

- **JWK** (JSON Web Key): Used for account keys and internal storage
- **PEM**: Standard format for certificate keys and CSRs
- **DER**: Binary format for ACME protocol communication

<a id="supported-acme-providers"></a>

## Supported ACME Providers

Built-in directory presets for major Certificate Authorities:

```ts
import { provider } from 'acme-love';

// Let's Encrypt (No EAB required)
provider.letsencrypt.staging.directoryUrl;
provider.letsencrypt.production.directoryUrl;

// Buypass (EAB optional)
provider.buypass.staging.directoryUrl;
provider.buypass.production.directoryUrl;

// Google Trust Services (EAB required)
provider.google.staging.directoryUrl;
provider.google.production.directoryUrl;

// ZeroSSL (EAB required for new accounts)
provider.zerossl.production.directoryUrl;
```

**EAB Requirements by Provider:**

| Provider              | EAB Required | Notes                                   |
| --------------------- | ------------ | --------------------------------------- |
| Let's Encrypt         | No           | Free, automatic registration            |
| Buypass               | Optional     | Enhanced validation with EAB            |
| Google Trust Services | Required     | Commercial service, register for access |
| ZeroSSL               | Required     | Free tier available, EAB mandatory      |

Use `--eab-kid` and `--eab-hmac-key` CLI options or the `eab` parameter in `ensureRegistered()` for providers that require External Account Binding.

<a id="client-initialization"></a>

## Client Initialization

ACME Love supports two convenient ways to initialize the `AcmeClient`:

<a id="method-1-using-provider-presets-recommended"></a>

### Method 1: Using Provider Presets (Recommended)

```ts
import { AcmeClient, provider } from 'acme-love';

// Using predefined provider entries (recommended)
const client = new AcmeClient(provider.letsencrypt.staging);
const client2 = new AcmeClient(provider.google.production);
const client3 = new AcmeClient(provider.zerossl.production);

// With configuration options
const client4 = new AcmeClient(provider.letsencrypt.production, {
  nonce: { maxPool: 64 },
});
```

<a id="method-2-using-string-urls"></a>

### Method 2: Using String URLs

```ts
import { AcmeClient } from 'acme-love';

// Using string URLs directly
const client = new AcmeClient('https://acme-staging-v02.api.letsencrypt.org/directory');
const client2 = new AcmeClient('https://dv.acme-v02.api.pki.goog/directory');

// Custom ACME directory
const client3 = new AcmeClient('https://my-custom-ca.com/acme/directory');
```

<a id="benefits-of-provider-presets"></a>

### Benefits of Provider Presets

**Type Safety**: Full TypeScript support with autocomplete
**Validation**: Pre-validated directory URLs
**Convenience**: No need to remember complex URLs
**Consistency**: Standardized configuration across projects
**Updates**: Automatic URL updates with library updates

**Recommendation**: Use provider presets for standard CAs (Let's Encrypt, Google, etc.) and string URLs for custom or enterprise ACME directories.

<a id="cli-features-showcase"></a>

## CLI Features Showcase

<a id="beautiful-interactive-prompts"></a>

### Beautiful Interactive Prompts

- Full interactive mode with guided setup
- Colorful, emoji-rich interface using `@inquirer/prompts`
- Environment selection (staging/production/custom)
- Challenge type selection (DNS-01/HTTP-01)

<a id="smart-error-handling"></a>

### Smart Error Handling

- Maintenance detection with helpful messages
- Links to service status pages
- User-friendly error explanations
- Proper exit codes

<a id="automatic-validation"></a>

### Automatic Validation

- DNS record verification with authoritative lookups
- HTTP challenge validation with `undici`
- Retry logic with progress indicators
- Success confirmation

<a id="documentation"></a>

## Documentation

- [CLI Documentation](./docs/CLI.md) - Complete CLI usage guide and examples
- [API Documentation](./docs/) - Library API reference
- [Examples](./examples/) - Code examples and use cases

<a id="ecosystem"></a>

## Ecosystem

Official companion packages for automated DNS-01 challenge solving:

| Package | Description |
| --- | --- |
| [acme-love-cloudflare](https://www.npmjs.com/package/acme-love-cloudflare) | Cloudflare DNS-01 solver — create and clean up TXT records via Cloudflare API |
| [acme-love-route53](https://www.npmjs.com/package/acme-love-route53) | AWS Route 53 DNS-01 solver — automate TXT records via AWS SDK |

```typescript
import { createCloudflareDns01Solver } from 'acme-love-cloudflare';
// or
import { createRoute53Dns01Solver } from 'acme-love-route53';

const solver = createCloudflareDns01Solver({ apiToken: process.env.CF_API_TOKEN! });
const ready = await account.solveDns01(order, solver);
```

<a id="acme-client-for-typescript"></a>

## ACME Client for TypeScript

acme-love is a TypeScript-first ACME client built with full type safety in mind. Every API surface — from account registration to certificate finalization — is fully typed, giving you autocomplete and compile-time checks out of the box. The library exports granular types such as `AcmeEcAlgorithm`, `AcmeRsaAlgorithm`, `AcmeCertificateAlgorithm`, and all RFC 8555 response shapes, so you can integrate ACME certificate automation into any TypeScript project with confidence.

<a id="lets-encrypt-acme-cli"></a>

## Let's Encrypt ACME CLI

The `acme-love` CLI lets you obtain Let's Encrypt certificates from the terminal in a single command. Run `npx acme-love interactive --staging` for a guided wizard, or use `acme-love cert` for non-interactive automation in CI/CD pipelines. The CLI supports DNS-01 and HTTP-01 challenges, wildcard domains, custom CAs, and External Account Binding — everything you need to automate Let's Encrypt certificate issuance without writing code.

<a id="rfc-8555-compliance"></a>

## RFC 8555 Compliance

acme-love implements the ACME protocol as defined in [RFC 8555](https://www.rfc-editor.org/rfc/rfc8555). This includes the full order lifecycle (newAccount, newOrder, authorization, challenge, finalize, certificate download), JWS-signed requests with nonce replay protection, `problem+json` error handling, and Retry-After / rate-limit awareness. The library also supports RFC 8555 External Account Binding (EAB) for commercial CAs like ZeroSSL and Google Trust Services.

<a id="comparison-with-other-acme-clients"></a>

## Comparison with Other ACME Clients

| Feature          | **acme-love**                           | **acme-client** | **greenlock** | **certbot**   |
| ---------------- | --------------------------------------- | --------------- | ------------- | ------------- |
| Language         | TypeScript / Node.js                    | Node.js         | Node.js       | Python        |
| TypeScript types | Built-in                                | Community       | No            | N/A           |
| CLI included     | Yes                                     | No              | Yes           | Yes           |
| DNS-01 / HTTP-01 | Both                                    | Both            | Both          | Both          |
| Wildcard support | Yes                                     | Yes             | Yes           | Yes           |
| EAB support      | Yes                                     | Limited         | No            | Yes           |
| Nonce pooling    | Yes                                     | No              | No            | No            |
| ESM native       | Yes                                     | Yes             | No            | N/A           |
| Multiple CAs     | Let's Encrypt, ZeroSSL, Google, Buypass | Let's Encrypt   | Let's Encrypt | Let's Encrypt |

acme-love focuses on a modern, typed developer experience with built-in CLI, nonce pooling for high-throughput scenarios, and first-class support for multiple ACME-compliant Certificate Authorities. If you are migrating from `acme-client`, `greenlock`, or `certbot`, the programmatic API and CLI cover the same core workflows with additional TypeScript safety and multi-CA support.

<a id="troubleshooting"></a>

## Troubleshooting

<a id="common-issues"></a>

### Common Issues

**WebCrypto API Errors**

```bash
# Error: crypto.subtle is undefined
# Solution: Ensure Node.js ≥ 20 and secure context (HTTPS/localhost)
```

**JWK Import/Export Issues**

```ts
// Wrong algorithm specification
await crypto.subtle.importKey('jwk', jwkData, { name: 'ECDSA' }, false, ['sign']);

// Correct algorithm with namedCurve
await crypto.subtle.importKey('jwk', jwkData, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
  'sign',
]);
```

**Debug Logging Control**

```bash
# Production: Debug disabled by default (no DEBUG environment variable)
node your-app.js

# Development: Enable specific debug output
DEBUG=acme-love:nonce node your-app.js

# Troubleshooting: Enable all debug output
DEBUG=acme-love:* node your-app.js
```

```ts
// Programmatic control for tests or specific environments
import { disableDebug } from 'acme-love';

// Ensure clean logs in production
if (process.env.NODE_ENV === 'production') {
  disableDebug();
}
```

**DNS Challenge Validation Timeout**

```bash
# If DNS propagation is slow, increase timeout in your waitFor function
await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s
```

**File Permission Errors**

```bash
# Ensure write permissions for certificate output directory
chmod 755 ./certificates/
```

<a id="requirements"></a>

## Requirements

- **Node.js ≥ 20** (WebCrypto, modern URL, base64url support)
- **TypeScript ≥ 5** (for development)

<a id="performance-stress-testing"></a>

## Performance & Stress Testing

[Back to Top](#table-of-contents)

ACME Love undergoes regular stress tests (Let's Encrypt staging) across multiple load tiers. Below are the latest consolidated results pulled from the stress report artifacts (Quick / Standard / Heavy). They demonstrate scalability, nonce‑pool efficiency, and stability as order volume increases.

<a id="consolidated-metrics-latest-run"></a>

### Consolidated Metrics (Latest Run)

| Tier         | Accounts | Orders/Acc | Total Orders | Total Time | Avg Resp | P50 | P95  | P99  | Requests | Req/s | Orders/s | Success | New-Nonce | Nonce Eff. | Saved Req. |
| ------------ | -------- | ---------- | ------------ | ---------- | -------- | --- | ---- | ---- | -------- | ----- | -------- | ------- | --------- | ---------- | ---------- |
| **Quick**    | 2        | 20         | 40           | 6.16s      | 346ms    | 239 | 741  | 821  | 93       | 15.1  | 6.50     | 100%    | 13        | 86%        | 80         |
| **Standard** | 4        | 50         | 200          | 10.95s     | 451ms    | 250 | 1283 | 1630 | 450      | 41.1  | 18.27    | 100%    | 50        | 89%        | 400        |
| **Heavy**    | 4        | 200        | 800          | 32.79s     | 494ms    | 246 | 1338 | 1554 | 1652     | 50.4  | 24.40    | 100%    | 52        | 97%        | 1600       |

All tiers achieved 100% success. Heavy test maintains <500ms average latency and high nonce pool efficiency (97%).

<a id="interpretation"></a>

### Interpretation

- **100% Success Rate**: All test scenarios (Quick, Standard, Heavy) completed without errors.
- **Stable Performance**: Average response time is <500ms even under heavy load (Heavy: 494ms, Standard: 451ms, Quick: 346ms).
- **Scalability**: Requests/sec and Orders/sec increase with load, latency does not degrade.
- **Nonce Efficiency**: Savings on new-nonce requests up to 97% (Heavy), significantly reducing load on the CA.
- **No Errors**: Error Rate = 0% in all tests.
- **Good tail latency**: p99 latency <1600ms even in Heavy tier, no abnormally slow requests.
- **Resource margin**: The system handles increased load without loss of stability or efficiency.

<a id="key-optimizations"></a>

### Key Optimizations

- Rate limiting + exponential backoff (automatic HTTP 503 / Retry-After handling)
- High‑efficiency nonce pool (dynamic refill + minimal new-nonce calls)
- Request coalescing & HTTP connection reuse
- Structured debug logging (HTTP + nonce) via DEBUG env

<a id="example-high-load-configuration"></a>

### Example High-Load Configuration

```typescript
const client = new AcmeClient(directoryUrl, {
  nonce: {
    maxPool: 64,
    prefetchLowWater: 8,
    prefetchHighWater: 32,
  },
  // Optional: tune timeouts / retry strategies as needed
});
```

<a id="detailed-reports"></a>

### Detailed Reports

Comprehensive performance & reliability artifacts (human‑readable Markdown + machine‑readable JSON):

Primary stress tiers:

- Quick: [Markdown](./docs/reports/QUICK-STRESS-TEST-RESULTS.md) · [JSON](./docs/reports/QUICK-STRESS-TEST-RESULTS.json)
- Standard: [Markdown](./docs/reports/STANDARD-STRESS-TEST-RESULTS.md) · [JSON](./docs/reports/STANDARD-STRESS-TEST-RESULTS.json)
- Heavy: [Markdown](./docs/reports/HEAVY-STRESS-TEST-RESULTS.md) · [JSON](./docs/reports/HEAVY-STRESS-TEST-RESULTS.json)

Each stress test report includes: latency distribution (P50/P75/P90/P95/P99), throughput, nonce efficiency, savings, threshold matrix, environment metadata (git commit, Node version), and raw config for reproducibility.

<a id="running-the-tests"></a>

### Running the Tests

**Test Types**

- **Unit Tests**: Mock-based testing of individual components
- **Integration Tests**: Real requests to Let's Encrypt staging
- **Async Behavior Tests**: Concurrent operations and memory leak prevention
- **E2E Tests**: Full workflow testing with staging environment
- **Stress Tests**: High-volume production scenario validation (run separately)

```bash

# Run standard test suite (fast, excludes stress tests)
npm test

# Run specific test types
npm run test:unit # Unit tests only (skips e2e & stress)
npm run test:e2e # End-to-end tests (Let's Encrypt staging)
npm run test:e2e:ci # E2E for CI (requires ACME_E2E_ENABLED=1)

# Run with coverage report
npm run test:coverage

# Focused component tests
npm run test:nonce-manager # Nonce manager focused tests (in-band)
npm run test:rate-limiting # Rate limiting behavior & backoff
npm run test:deadlock # Deadlock detection / concurrency safety

# Stress tiers (instrumented performance runs)
npm run test:quick # Quick tier (2 × 20 orders) ~7s
npm run test:standard # Standard tier (4 × 50 orders) ~16s
npm run test:heavy # Heavy tier (4 × 200 orders) ~60s

npm run test:deadlock # Deadlock detection
# Full suite
npm run test:all # EVERYTHING (includes stress) – slower
```

** Resolution**:

- Implemented comprehensive rate limiting system with HTTP 503 detection
- Added exponential backoff with Retry-After header support
- Optimized nonce pool management with 98% efficiency
- Unified debug logging system with printf-style formatting
- **Latest test results**: 4 accounts × 200 orders = 800 operations completed successfully in 32 seconds

**Current Status**:

- **100% success rate** in heavy stress testing
- **Zero rate limit violations** with automatic backoff
- **Production-ready** performance (25+ req/s sustained)
- **Enterprise-scale** validation (400 concurrent operations)
- **10x Performance Improvement**: Tests complete in 30-35s vs 5-10 minutes

<a id="test-coverage"></a>

## Test Coverage

[Back to Top](#table-of-contents)

ACME Love maintains comprehensive test coverage to ensure reliability and quality:

**Test Statistics**

- **60 Tests** across 18 test suites
- **100% Passing** test rate
- **Core Components Coverage:**
- `csr.ts`: **94.11%** (cryptographic operations)
- `nonce-manager.ts`: **68.03%** (pooling & concurrent access)
- `acme-directory.ts`: **83.33%** (directory operations)
- `acme-client-core.ts`: **93.75%** (core client functionality)

**Note**: Stress tests are excluded from the default `npm test` command to keep CI/CD pipelines fast. They should be run manually or in dedicated test environments.

<a id="test-account-management"></a>

### Test Account Management

ACME Love includes a sophisticated test account management system to avoid Let's Encrypt rate limits during development and testing:

```bash
# Prepare accounts for all stress tests (run once)
npm run accounts prepare-stress

# List all test accounts
npm run accounts list

# Create specific account
npm run accounts create my-test-account

# Clean up old accounts (older than 24 hours)
npm run accounts cleanup 24
```

**Benefits**:

- Avoid Let's Encrypt's 50 registrations per IP per 3 hours limit
- Faster test execution (reuse existing accounts)
- Isolated accounts per test type
- Automatic git ignore protection

  **Detailed account management guide**: [TEST-ACCOUNT-MANAGEMENT.md](./docs/reports/TEST-ACCOUNT-MANAGEMENT.md)

<a id="license"></a>

## License

MIT License - see [LICENSE](./LICENSE) file for details.

<a id="contributing"></a>

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

---

[Back to Top](#table-of-contents) | [Report Issues](https://github.com/thebitrock/acme-love/issues) | [Request Features](https://github.com/thebitrock/acme-love/discussions)
