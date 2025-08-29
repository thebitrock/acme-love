<div align="center">

# 🔐 ACME Love

**Modern, strongly‑typed ACME (RFC 8555) toolkit for Node.js 20+**

Powerful CLI tool + TypeScript library for Let's Encrypt and other ACME Certificate Authorities

[![NPM Version](https://img.shields.io/npm/v/acme-love.svg)](https://www.npmjs.com/package/acme-love)
[![NPM License](https://img.shields.io/npm/l/acme-love.svg)](https://github.com/thebitrock/acme-love/blob/main/LICENSE)
[![Tests](https://img.shields.io/badge/tests-42%20passing-brightgreen.svg)](https://github.com/thebitrock/acme-love)
[![Coverage](https://img.shields.io/badge/coverage-94%25%20CSR%20%7C%2069%25%20NonceManager-green.svg)](https://github.com/thebitrock/acme-love)

</div>

## 📋 Table of Contents

<!-- TOC-START -->

Main

- [📋 Table of Contents](#table-of-contents)
- [✨ Key Features](#key-features)
- [🚀 Quick Start](#quick-start)
  - [CLI Installation & Usage](#cli-installation-usage)
  - [🎮 Interactive Mode (Easiest Way)](#interactive-mode-easiest-way)
  - [📋 Command Line Mode](#command-line-mode)
  - [🎯 Challenge Types](#challenge-types)
  - [🔐 Cryptographic Algorithms](#cryptographic-algorithms)
  - [🛠️ Development & Local Usage](#development-local-usage)
  - [📖 CLI Commands Reference](#cli-commands-reference)
- [📚 Library Usage](#library-usage)
  - [Installation](#installation)
  - [Modern ACME Client](#modern-acme-client)
  - [External Account Binding (EAB) Support](#external-account-binding-eab-support)
  - [Supported Cryptographic Algorithms](#supported-cryptographic-algorithms)
  - [Working with Existing Accounts](#working-with-existing-accounts)
  - [Advanced Features](#advanced-features)
- [⚡ Nonce Management](#nonce-management)
  - [Global Configuration](#global-configuration)
  - [Per-Account Overrides](#per-account-overrides)
  - [Configuration Options](#configuration-options)
  - [Performance Scenarios](#performance-scenarios)
  - [Debug Logging](#debug-logging)
  - [Custom Nonce Manager Logging](#custom-nonce-manager-logging)
- [🔍 Advanced Validators & Utilities](#advanced-validators-utilities)
  - [DNS Validation Functions](#dns-validation-functions)
  - [HTTP Validation Functions](#http-validation-functions)
  - [CLI Configuration Details](#cli-configuration-details)
- [🔧 CSR Generation](#csr-generation)
  - [Supported Cryptographic Algorithms](#supported-cryptographic-algorithms)
- [🏢 Supported ACME Providers](#supported-acme-providers)
- [🔧 Client Initialization](#client-initialization)
  - [Method 1: Using Provider Presets (Recommended)](#method-1-using-provider-presets-recommended)
  - [Method 2: Using String URLs](#method-2-using-string-urls)
  - [Benefits of Provider Presets](#benefits-of-provider-presets)
- [🎨 CLI Features Showcase](#cli-features-showcase)
  - [Beautiful Interactive Prompts](#beautiful-interactive-prompts)
  - [Smart Error Handling](#smart-error-handling)
  - [Automatic Validation](#automatic-validation)
- [📖 Documentation](#documentation)
- [🔧 Troubleshooting](#troubleshooting)
  - [Common Issues](#common-issues)
- [⚡ Requirements](#requirements)
- [🚀 Performance & Stress Testing](#performance-stress-testing)
  - [🔢 Consolidated Metrics (Latest Run)](#consolidated-metrics-latest-run)
  - [🧪 Interpretation](#interpretation)
  - [⚙️ Key Optimizations](#key-optimizations)
  - [🔍 Example High-Load Configuration](#example-high-load-configuration)
  - [📈 Detailed Reports](#detailed-reports)
  - [🏃 Running the Tests](#running-the-tests)
- [🚨 ~~Known Issues~~ ✅ Resolved Issues](#known-issues-resolved-issues)
  - [~~Concurrent Account Creation Deadlock~~ ✅ **RESOLVED**](#concurrent-account-creation-deadlock-resolved)
- [🧪 Test Coverage](#test-coverage)
  - [🔑 Test Account Management](#test-account-management)
- [📄 License](#license)
- [🤝 Contributing](#contributing)

<!-- TOC-END -->

## ✨ Key Features

| Feature                         | Description                                                           |
| ------------------------------- | --------------------------------------------------------------------- |
| 🖥️ **Powerful CLI**             | Interactive & non-interactive modes with polished prompts             |
| 🌐 **Multi-Environment**        | Staging, production & custom directory endpoints                      |
| 🔒 **Challenge Support**        | DNS-01 (wildcard-friendly) & HTTP-01 with built-in validation helpers |
| 🔐 **Crypto Algorithms**        | ECDSA P-256 / P-384 / P-521 and RSA 2048 / 3072 / 4096                |
| 🔑 **External Account Binding** | EAB support (ZeroSSL, Google Trust Services, etc.)                    |
| 🛠️ **Resilient Error Handling** | RFC 8555 problem+json mapping, retry & maintenance detection          |
| ⚡ **Optimized Core**           | Nonce pooling, FS read minimization, undici HTTP client               |
| 🏢 **Multiple CAs**             | Presets: Let's Encrypt, Buypass, Google, ZeroSSL + custom URLs        |
| 📦 **Typed API**                | Strong TypeScript types for orders, accounts, directory metadata      |
| 🔍 **Diagnostics**              | Namespaced debug logging; stress & performance reports                |
| 🧪 **Tested**                   | Unit + stress tests; concurrency & rate limit scenarios               |
| 🔧 **Developer Friendly**       | CSR helpers, validation utilities, composable modules                 |

## 🚀 Quick Start

### CLI Installation & Usage

```bash
# Global installation (recommended)
npm install -g acme-love
acme-love --help

# Or use without installation
npx acme-love interactive --staging
```

### 🎮 Interactive Mode (Easiest Way)

```bash
# Start interactive mode with environment selection
acme-love interactive

# Or with pre-selected environment
acme-love interactive --staging    # For testing
acme-love interactive --production # For real certificates
```

### 📋 Command Line Mode

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

### 🎯 Challenge Types

**DNS-01 Challenge** (Recommended)

```bash
acme-love cert --challenge dns-01 --domain acme-love.com --email user@acme-love.com --staging
```

- ✅ Works with wildcard certificates (`*.acme-love.com`)
- ✅ No need for public web server
- 🔧 Requires DNS provider access

**HTTP-01 Challenge**

```bash
acme-love cert --challenge http-01 --domain acme-love.com --email user@acme-love.com --staging
```

- ✅ Simple validation via HTTP file
- ✅ Automatic validation with built-in checker
- 🔧 Requires domain to point to your web server

### 🔐 Cryptographic Algorithms

The CLI uses **P-256 ECDSA** by default for both account and certificate keys, providing an excellent balance of security and performance. This algorithm is:

- ✅ **Fast**: Quicker than RSA for signing operations
- ✅ **Secure**: 256-bit elliptic curve equivalent to 3072-bit RSA
- ✅ **Compatible**: Widely supported by browsers and servers
- ✅ **Compact**: Smaller key sizes and certificate files

For programmatic usage via the library, you can choose from multiple algorithms including different ECDSA curves (P-256, P-384, P-521) and RSA key sizes (2048, 3072, 4096 bits). See the [Supported Cryptographic Algorithms](#supported-cryptographic-algorithms) section for details.

### 🛠️ Development & Local Usage

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

See [CLI-USAGE.md](./docs/CLI-USAGE.md) for detailed development setup.

### 📖 CLI Commands Reference

| Command              | Purpose                        | Algorithm Options                    | EAB Options                                |
| -------------------- | ------------------------------ | ------------------------------------ | ------------------------------------------ |
| `cert`               | Obtain SSL certificate         | `--account-algo`, `--cert-algo`      | `--eab-kid`, `--eab-hmac-key`              |
| `create-account-key` | Generate ACME account key      | `--algo`                             | -                                          |
| `status`             | Check certificate status       | -                                    | -                                          |
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
# AcmeClientCore(provider.zerossl.production) or AcmeClientCore(provider.google.production)
```

## 📚 Library Usage

[🔝 Back to Top](#table-of-contents)

### Installation

```bash
npm install acme-love
```

### Modern ACME Client

```ts
import {
  AcmeClientCore,
  AcmeAccountSession,
  provider,
  createAcmeCsr,
  generateKeyPair,
} from 'acme-love';

// 1. Create client core with nonce pooling - using provider preset (recommended)
const core = new AcmeClientCore(provider.letsencrypt.staging, {
  nonce: { maxPool: 64 },
});

// Alternative: Create client core with string URL
// const core = new AcmeClientCore(provider.letsencrypt.staging.directoryUrl, {
//   nonce: { maxPool: 64 },
// });

// 2. Generate account keys (ES256 recommended)
const algo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
const keyPair = await generateKeyPair(algo);
const accountKeys = {
  privateKey: keyPair.privateKey,
  publicKey: keyPair.publicKey,
};

// 3. Create account session
const acct = new AcmeAccountSession(core, accountKeys);

// 4. Register account
await acct.ensureRegistered({
  contact: ['mailto:admin@acme-love.com'],
  termsOfServiceAgreed: true,
});

// 5. Create order and solve challenges
const order = await acct.newOrder(['acme-love.com']);

// DNS-01 challenge
const ready = await acct.solveDns01(order, {
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
const finalized = await acct.finalize(ready, derBase64Url);
const valid = await acct.waitOrder(finalized.url, ['valid']);
const certificate = await acct.downloadCertificate(valid);

console.log('Certificate obtained!', certificate);
```

### External Account Binding (EAB) Support

For Certificate Authorities that require External Account Binding (like ZeroSSL, Google Trust Services), provide EAB credentials during account registration:

```ts
import { AcmeClientCore, AcmeAccountSession, generateKeyPair } from 'acme-love';

// Create client for CA that requires EAB - using provider preset (recommended)
const core = new AcmeClientCore(provider.zerossl.production);

// Alternative: Create client with string URL
// const core = new AcmeClientCore('https://acme.zerossl.com/v2/DV90');

// Generate account keys
const keyPair = await generateKeyPair({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });
const accountKeys = {
  privateKey: keyPair.privateKey!,
  publicKey: keyPair.publicKey!,
};

// Create account session
const acct = new AcmeAccountSession(core, accountKeys);

// Register account with EAB
const eab = {
  kid: 'your-key-identifier-from-ca', // Provided by your CA
  hmacKey: 'your-base64url-hmac-key-from-ca', // Provided by your CA
};

const kid = await acct.ensureRegistered(
  {
    contact: ['mailto:admin@acme-love.com'],
    termsOfServiceAgreed: true,
  },
  eab,
);

// Continue with normal certificate issuance...
const order = await acct.newOrder(['acme-love.com']);
// ... rest of the flow
```

**EAB-enabled Certificate Authorities:**

- **ZeroSSL**: Requires EAB for new account registration
- **Google Trust Services**: Requires EAB for all accounts
- **Buypass**: Optional EAB for enhanced validation
- **Custom/Enterprise CAs**: Many require EAB for access control

**Getting EAB Credentials:**

1. Register with your chosen CA's website
2. Navigate to ACME/API settings in your account dashboard
3. Generate or retrieve your EAB Key ID and HMAC Key
4. Use these credentials in your ACME client configuration

**CLI Usage with EAB:**

```bash
# ZeroSSL example
acme-love cert \
  --domain acme-love.com \
  --email admin@acme-love.com \
  --directory https://acme.zerossl.com/v2/DV90 \
  --eab-kid "your-zerossl-key-id" \
  --eab-hmac-key "your-zerossl-hmac-key"

# Google Trust Services example
acme-love cert \
  --domain acme-love.com \
  --email admin@acme-love.com \
  --directory https://dv.acme-v02.api.pki.goog/directory \
  --eab-kid "your-google-key-id" \
  --eab-hmac-key "your-google-hmac-key"
```

📖 **Detailed EAB documentation**: [docs/EAB.md](./docs/EAB.md)

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

**TypeScript Types**: The library exports `EcAlgo`, `RsaAlgo`, and `CsrAlgo` types for type-safe algorithm specification:

```ts
import type { CsrAlgo, EcAlgo, RsaAlgo } from 'acme-love';

// Type-safe algorithm definitions
const ecAlgo: EcAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
const rsaAlgo: RsaAlgo = { kind: 'rsa', modulusLength: 2048, hash: 'SHA-256' };
const algo: CsrAlgo = ecAlgo; // Union type of EcAlgo | RsaAlgo
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

### Working with Existing Accounts

When you already have a registered ACME account, you can reuse it by providing the `kid` (Key ID) to avoid creating duplicate registrations:

```ts
// First time: Register new account and save the kid
const acct = new AcmeAccountSession(core, accountKeys);
const kid = await acct.ensureRegistered({
  contact: ['mailto:admin@acme-love.com'],
  termsOfServiceAgreed: true,
});

// Save account info for future use
const accountInfo = {
  kid,
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

// Create session with existing kid
const acct = new AcmeAccountSession(core, accountKeys, {
  kid: savedAccount.kid, // Use existing account
});

// No need to call ensureRegistered() - account already exists
const order = await acct.newOrder(['acme-love.com']);
```

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
  await acct.newOrder(['acme-love.com']);
} catch (error) {
  // Server maintenance detection
  if (error instanceof ServerMaintenanceError) {
    console.log('🔧 Service is under maintenance');
    console.log('📊 Check https://letsencrypt.status.io/');
    console.log('⏳ Please try again later when the service is restored.');
    return;
  }

  // Rate limiting with automatic retry information
  if (error instanceof RateLimitedError) {
    const retrySeconds = error.getRetryAfterSeconds();
    console.log(`⏱️ Rate limited. Retry in ${retrySeconds} seconds`);
    console.log(`📝 Details: ${error.detail}`);

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
    console.log('🔄 Invalid nonce - this should be handled automatically');
    // The NonceManager typically retries these automatically
  }

  // Account-related errors
  if (error instanceof AccountDoesNotExistError) {
    console.log('👤 Account does not exist - need to register first');
  }

  // Order state errors
  if (error instanceof OrderNotReadyError) {
    console.log('📋 Order not ready for finalization - complete challenges first');
  }

  // EAB requirement
  if (error instanceof ExternalAccountRequiredError) {
    console.log('🔑 This CA requires External Account Binding (EAB)');
    console.log('💡 Use --eab-kid and --eab-hmac-key options');
  }

  // Rate limiter errors (from internal rate limiting system)
  if (error instanceof RateLimitError) {
    console.log(`🚦 Internal rate limit: ${error.message}`);
    console.log(`📊 Attempts: ${error.rateLimitInfo.attempts}`);
    console.log(`⏳ Retry in ${error.rateLimitInfo.retryDelaySeconds}s`);
  }

  // Generic ACME error with details
  if (error instanceof AcmeError) {
    console.log(`❌ ACME Error: ${error.detail}`);
    console.log(`🔍 Type: ${error.type}`);
    console.log(`📊 Status: ${error.status}`);

    // Handle subproblems for compound errors
    if (error.subproblems?.length) {
      console.log('📋 Subproblems:');
      error.subproblems.forEach((sub, i) => {
        console.log(`  ${i + 1}. ${sub.detail} (${sub.type})`);
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
      console.log('⏳ Temporary issue - will retry automatically');
      break;
    case 'reconfigure':
      console.log('⚙️ Configuration issue - please check your settings');
      break;
    case 'fatal':
      console.log('❌ Fatal error - manual intervention required');
      break;
  }
}
```

#### JSON Serialization

All ACME errors support JSON serialization for logging and debugging:

```ts
try {
  await acct.newOrder(['acme-love.com']);
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

## ⚡ Nonce Management

[🔝 Back to Top](#-table-of-contents)

ACME Love includes a sophisticated **NonceManager** that optimizes nonce handling for high-performance certificate operations. Nonces are automatically pooled, prefetched, and recycled to minimize network round-trips.

### Global Configuration

Set default nonce behavior for all accounts:

```ts
const core = new AcmeClientCore(provider.letsencrypt.production, {
  nonce: {
    maxPool: 64, // Cache up to 64 nonces
    prefetchLowWater: 12, // Start prefetch when < 12 remain
    prefetchHighWater: 40, // Fill up to 40 nonces
    maxAgeMs: 5 * 60_000, // Expire after 5 minutes
    // Note: Logging is handled by unified debug system (DEBUG=acme-love:nonce)
  },
});
```

### Per-Account Overrides

Fine-tune nonce behavior for specific accounts:

```ts
const acct = new AcmeAccountSession(core, accountKeys, {
  nonceOverrides: {
    maxPool: 128, // Higher throughput for this account
    prefetchLowWater: 20,
    prefetchHighWater: 80,
    // Note: Logging is handled by unified debug system (DEBUG=acme-love:nonce)
  },
});
```

### Configuration Options

| Option              | Default | Description                                        |
| ------------------- | ------- | -------------------------------------------------- |
| `maxPool`           | 32      | Maximum cached nonces per namespace                |
| `prefetchLowWater`  | 0       | Start prefetch when pool below this (0 = disabled) |
| `prefetchHighWater` | 0       | Target fill level for prefetch                     |
| `maxAgeMs`          | 300000  | Discard nonces older than 5 minutes                |

**Note**: Logging is now handled by the unified debug system. Use `DEBUG=acme-love:nonce` to enable nonce manager debug output.

### Performance Scenarios

```ts
// Low traffic / sequential operations
{ prefetchLowWater: 0 }  // Disable prefetch

// Moderate parallelism (5-10 concurrent operations)
{ prefetchLowWater: 4, prefetchHighWater: 12, maxPool: 32 }

// High burst / parallel workloads
{ prefetchLowWater: 16, prefetchHighWater: 48, maxPool: 128 }
```

The NonceManager automatically handles `badNonce` retries, harvests nonces from response headers, and isolates nonce pools per CA/account combination.

### Debug Logging

ACME Love uses the [`debug`](https://www.npmjs.com/package/debug) module for structured logging. Debug output is automatically disabled in production unless explicitly enabled:

```bash
# Enable all ACME Love debug output
DEBUG=acme-love:* node your-app.js

# Enable only nonce manager debug
DEBUG=acme-love:nonce node your-app.js

# Enable multiple specific components
DEBUG=acme-love:nonce,acme-love:http node your-app.js

# Available debug namespaces:
# acme-love:nonce    - Nonce management operations
# acme-love:http     - HTTP requests and responses
# acme-love:challenge - Challenge solving process
# acme-love:client   - Core client operations
# acme-love:validator - Validation functions
```

```ts
// Programmatic debug control
import { enableDebug, disableDebug, isDebugEnabled } from 'acme-love';

// Enable debug programmatically (useful for development)
enableDebug();

// Disable debug programmatically (useful for production)
disableDebug();

// Check if debug is enabled
if (isDebugEnabled()) {
  console.log('Debug logging is active');
}
```

### Custom Nonce Manager Logging

In previous versions, NonceManager accepted a custom `log` function for debugging. This has been replaced with the unified debug system. If you need custom logging behavior for nonce operations, you can intercept the debug output:

```ts
// Previous approach (deprecated):
// const client = new AcmeClientCore(url, {
//   nonce: {
//     log: (...args) => logger.info('[nonce]', ...args)
//   }
// });

// New unified approach:
import debug from 'debug';

// Override the nonce debug function for custom formatting
const originalNonceDebug = debug('acme-love:nonce');
debug.enabled = () => true; // Force enable for custom handler

// Custom nonce logging with your preferred logger
const customNonceLogger = (...args: any[]) => {
  logger.info('[nonce]', ...args); // Your custom logger
  originalNonceDebug(...args); // Still call original if needed
};

// Replace the debug function globally
debug('acme-love:nonce').log = customNonceLogger;
```

📖 **Detailed documentation**: [docs/NONCE-MANAGER.md](./docs/NONCE-MANAGER.md)

## 🔍 Advanced Validators & Utilities

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
  console.log('✅ DNS challenge validated');
} else {
  console.log('❌ DNS validation failed:', result.error);
}

// Standard DNS validation with fallback to public resolvers
const quickResult = await resolveAndValidateAcmeTxt(
  '_acme-challenge.acme-love.com',
  'expected-challenge-value',
);
```

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

### CLI Configuration Details

When using the CLI, ACME Love automatically handles file organization and configuration:

```bash
# Default directory structure created by CLI
./certificates/
├── acme-love.com/
│   ├── cert.pem          # Certificate chain
│   ├── cert-key.json     # Certificate private key (JWK format)
│   ├── cert.csr.pem      # Certificate signing request
│   └── order.json        # ACME order details
└── account-key.json      # ACME account keys (JWK format)
```

**CLI Configuration Defaults:**

- **Output directory**: `./certificates/`
- **Account key path**: `./certificates/account-key.json`
- **Nonce pool size**: 64 (optimized for CLI operations)
- **Key algorithm**: ECDSA P-256 (ES256)
- **File format**: JWK for keys, PEM for certificates

## 🔧 CSR Generation

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

### Supported Cryptographic Algorithms

ACME Love supports modern cryptographic algorithms via WebCrypto API:

```ts
import { generateKeyPair, type CsrAlgo } from 'acme-love';

// ECDSA with P-256 curve (Recommended - smaller keys, faster)
const ecAlgo: CsrAlgo = {
  kind: 'ec',
  namedCurve: 'P-256',
  hash: 'SHA-256',
};

// ECDSA with P-384 curve (Higher security)
const ec384Algo: CsrAlgo = {
  kind: 'ec',
  namedCurve: 'P-384',
  hash: 'SHA-384',
};

// RSA 2048-bit (Widely compatible, larger keys)
const rsaAlgo: CsrAlgo = {
  kind: 'rsa',
  modulusLength: 2048,
  hash: 'SHA-256',
};

// RSA 4096-bit (Maximum security, slower)
const rsa4096Algo: CsrAlgo = {
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

## 🏢 Supported ACME Providers

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
| Let's Encrypt         | ❌ No        | Free, automatic registration            |
| Buypass               | ⚠️ Optional  | Enhanced validation with EAB            |
| Google Trust Services | ✅ Required  | Commercial service, register for access |
| ZeroSSL               | ✅ Required  | Free tier available, EAB mandatory      |

Use `--eab-kid` and `--eab-hmac-key` CLI options or the `eab` parameter in `ensureRegistered()` for providers that require External Account Binding.

## 🔧 Client Initialization

ACME Love supports two convenient ways to initialize the `AcmeClientCore`:

### Method 1: Using Provider Presets (Recommended)

```ts
import { AcmeClientCore, provider } from 'acme-love';

// Using predefined provider entries (recommended)
const client = new AcmeClientCore(provider.letsencrypt.staging);
const client2 = new AcmeClientCore(provider.google.production);
const client3 = new AcmeClientCore(provider.zerossl.production);

// With configuration options
const client4 = new AcmeClientCore(provider.letsencrypt.production, {
  nonce: { maxPool: 64 },
});
```

### Method 2: Using String URLs

```ts
import { AcmeClientCore } from 'acme-love';

// Using string URLs directly
const client = new AcmeClientCore('https://acme-staging-v02.api.letsencrypt.org/directory');
const client2 = new AcmeClientCore('https://dv.acme-v02.api.pki.goog/directory');

// Custom ACME directory
const client3 = new AcmeClientCore('https://my-custom-ca.com/acme/directory');
```

### Benefits of Provider Presets

✅ **Type Safety**: Full TypeScript support with autocomplete
✅ **Validation**: Pre-validated directory URLs
✅ **Convenience**: No need to remember complex URLs
✅ **Consistency**: Standardized configuration across projects
✅ **Updates**: Automatic URL updates with library updates

**Recommendation**: Use provider presets for standard CAs (Let's Encrypt, Google, etc.) and string URLs for custom or enterprise ACME directories.

## 🎨 CLI Features Showcase

### Beautiful Interactive Prompts

- 🎮 Full interactive mode with guided setup
- 🌈 Colorful, emoji-rich interface using `@inquirer/prompts`
- 🔧 Environment selection (staging/production/custom)
- 📝 Challenge type selection (DNS-01/HTTP-01)

### Smart Error Handling

- 🔧 Maintenance detection with helpful messages
- 📊 Links to service status pages
- 💡 User-friendly error explanations
- 🚨 Proper exit codes

### Automatic Validation

- 🔍 DNS record verification with authoritative lookups
- 🌐 HTTP challenge validation with `undici`
- ⏳ Retry logic with progress indicators
- ✅ Success confirmation

## 📖 Documentation

- [CLI Usage Guide](./docs/CLI-USAGE.md) - Development setup and usage examples
- [API Documentation](./docs/) - Library API reference
- [Examples](./examples/) - Code examples and use cases

## 🔧 Troubleshooting

### Common Issues

**WebCrypto API Errors**

```bash
# Error: crypto.subtle is undefined
# Solution: Ensure Node.js ≥ 20 and secure context (HTTPS/localhost)
```

**JWK Import/Export Issues**

```ts
// ❌ Wrong algorithm specification
await crypto.subtle.importKey('jwk', jwkData, { name: 'ECDSA' }, false, ['sign']);

// ✅ Correct algorithm with namedCurve
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
await new Promise(resolve => setTimeout(resolve, 30000));  // Wait 30s
```

**File Permission Errors**

```bash
# Ensure write permissions for certificate output directory
chmod 755 ./certificates/
```

## ⚡ Requirements

- **Node.js ≥ 20** (WebCrypto, modern URL, base64url support)
- **TypeScript ≥ 5** (for development)

## 🚀 Performance & Stress Testing

[🔝 Back to Top](#table-of-contents)

ACME Love undergoes regular stress tests (Let's Encrypt staging) across multiple load tiers. Below are the latest consolidated results pulled from the stress report artifacts (Quick / Standard / Heavy). They demonstrate scalability, nonce‑pool efficiency, and stability as order volume increases.

### 🔢 Consolidated Metrics (Latest Run)

| Test Tier | Accounts × Orders | Total Orders | Total Time | Avg Response | P50 / P95 / P99 | Requests | Req/s | Orders/s | Success Rate | New-Nonce | Nonce Efficiency | Requests Saved |
| --------- | ----------------- | -----------: | ---------: | -----------: | --------------: | -------: | ----: | -------: | -----------: | --------: | ---------------: | -------------: |
| Quick     | 2 × 20            |           40 |      7.17s |        276ms | 206 / 615 / 630 |       86 |  12.0 |     5.58 |         100% |         6 |              93% |             80 |
| Standard  | 4 × 50            |          200 |     16.00s |        274ms | 208 / 586 / 675 |      412 |  25.8 |    12.50 |         100% |        12 |              97% |            400 |
| Heavy     | 4 × 200           |          800 |     59.40s |        263ms | 205 / 454 / 618 |     1612 |  27.1 |    13.47 |         100% |        12 |              99% |           1600 |

All tiers achieved 100% success; Heavy maintains sub‑270ms average latency with strong tail behavior (p99 < 620ms).

### 🧪 Interpretation

- **Consistent Success**: All profiled tiers (40 → 800 orders) completed with 100% success rate.
- **Stable Latency Under Scale**: Average response time improves slightly as concurrency grows (connection reuse); Heavy run avg 263ms with p95 454ms / p99 618ms.
- **Throughput Scaling**: Requests/sec rises from 12 (Quick) to 27 (Heavy) while maintaining similar mean latency, indicating efficient batching & pool reuse.
- **Nonce Pool Efficiency**: Heavy test required only 12 new-nonce requests for 1612 total (99% efficiency), saving 1600 round trips; Standard at 97%, Quick at 93%.
- **Tail Behavior**: p95 stays < 620ms across tiers; narrow spread shows absence of pathological slow requests.
- **Resource Headroom**: Minimal increase in tail latency moving from 200 to 800 orders suggests current nonce + batching strategy scales further.

### ⚙️ Key Optimizations

- Rate limiting + exponential backoff (automatic HTTP 503 / Retry-After handling)
- High‑efficiency nonce pool (dynamic refill + minimal new-nonce calls)
- Request coalescing & HTTP connection reuse
- Structured debug logging (HTTP + nonce) via DEBUG env

### 🔍 Example High-Load Configuration

```typescript
const core = new AcmeClientCore(directoryUrl, {
  nonce: {
    maxPool: 64,
    prefetchLowWater: 8,
    prefetchHighWater: 32,
  },
  // Optional: tune timeouts / retry strategies as needed
});
```

### 📈 Detailed Reports

Comprehensive performance & reliability artifacts (human‑readable Markdown + machine‑readable JSON):

Primary stress tiers:

- Quick: [Markdown](./docs/reports/QUICK-STRESS-TEST-RESULTS.md) · [JSON](./docs/reports/QUICK-STRESS-TEST-RESULTS.json)
- Standard: [Markdown](./docs/reports/STANDARD-STRESS-TEST-RESULTS.md) · [JSON](./docs/reports/STANDARD-STRESS-TEST-RESULTS.json)
- Heavy: [Markdown](./docs/reports/HEAVY-STRESS-TEST-RESULTS.md) · [JSON](./docs/reports/HEAVY-STRESS-TEST-RESULTS.json)

Supporting analyses:

- Rate Limiting Summary: [RATE-LIMITING-SUMMARY.md](./docs/reports/RATE-LIMITING-SUMMARY.md)
- Deadlock Resolution: [DEADLOCK-FIX-REPORT.md](./docs/reports/DEADLOCK-FIX-REPORT.md)
- Account Management: [ACCOUNT-MANAGEMENT-SUMMARY.md](./docs/reports/ACCOUNT-MANAGEMENT-SUMMARY.md)
- Test Suite Overview: [TEST-SUITE-REPORT.md](./docs/reports/TEST-SUITE-REPORT.md)
- Style Guide & Automation: [STYLE-GUIDE-REPORT.md](./docs/reports/STYLE-GUIDE-REPORT.md)

Each stress test report includes: latency distribution (P50/P75/P90/P95/P99), throughput, nonce efficiency, savings, threshold matrix, environment metadata (git commit, Node version), and raw config for reproducibility.

### 🏃 Running the Tests

Current test scripts (see `package.json`):

```bash
# Core (fast) test suites
npm test                    # Unit + integration (excludes stress & rate-limiting)
npm run test:unit           # Unit tests only (skips e2e & stress)
npm run test:e2e            # End-to-end tests (Let's Encrypt staging)
npm run test:e2e:ci         # E2E for CI (requires ACME_E2E_ENABLED=1)

# Focused component tests
npm run test:nonce-manager  # Nonce manager focused tests (in-band)
npm run test:rate-limiting  # Rate limiting behavior & backoff
npm run test:deadlock       # Deadlock detection / concurrency safety

# Stress tiers (instrumented performance runs)
npm run test:quick          # Quick tier (2 × 20 orders) ~7s
npm run test:standard       # Standard tier (4 × 50 orders) ~16s
npm run test:heavy          # Heavy tier (4 × 200 orders) ~60s

# Full suite
npm run test:all            # EVERYTHING (includes stress) – slower
```

## 🚨 ~~Known Issues~~ ✅ Resolved Issues

### ~~Concurrent Account Creation Deadlock~~ ✅ **RESOLVED**

**Previous Issue**: Deadlock detected in concurrent ACME account creation operations.

**✅ Resolution**:

- Implemented comprehensive rate limiting system with HTTP 503 detection
- Added exponential backoff with Retry-After header support
- Optimized nonce pool management with 98% efficiency
- Unified debug logging system with printf-style formatting
- **Latest test results**: 4 accounts × 200 orders = 800 operations completed successfully in 59 seconds

**Current Status**:

- ✅ **100% success rate** in heavy stress testing
- ✅ **Zero rate limit violations** with automatic backoff
- ✅ **Production-ready** performance (25+ req/s sustained)
- ✅ **Enterprise-scale** validation (400 concurrent operations)
- ✅ **10x Performance Improvement**: Tests complete in 30-35s vs 5-10 minutes

## 🧪 Test Coverage

[🔝 Back to Top](#table-of-contents)

ACME Love maintains comprehensive test coverage to ensure reliability and quality:

**Test Statistics**

- ✅ **42 Tests** across 5 test suites
- ✅ **100% Passing** test rate
- 📊 **Core Components Coverage:**
  - `csr.ts`: **94.11%** (cryptographic operations)
  - `nonce-manager.ts`: **69.46%** (pooling & concurrent access)
  - `acme-directory.ts`: **83.33%** (directory operations)
  - `acme-client-core.ts`: **68.75%** (core client functionality)

**Test Types**

- 🔬 **Unit Tests**: Mock-based testing of individual components
- 🌐 **Integration Tests**: Real requests to Let's Encrypt staging
- ⚡ **Async Behavior Tests**: Concurrent operations and memory leak prevention
- 🔄 **E2E Tests**: Full workflow testing with staging environment
- 🚀 **Stress Tests**: High-volume production scenario validation (run separately)

```bash
# Run standard test suite (fast, excludes stress tests)
npm test

# Run with coverage report
npm run test:coverage

# Run all tests including stress tests (takes several minutes)
npm run test:all

# Run specific test types
npm run test:unit       # Unit tests only
npm run test:e2e        # Integration tests with Let's Encrypt staging

# Stress test commands (run individually, requires staging access)
npm run test:quick        # Quick tier
npm run test:standard     # Standard tier
npm run test:heavy        # Heavy tier
npm run test:deadlock     # Deadlock detection
npm run test:rate-limiting # Rate limiting behavior
```

**Note**: Stress tests are excluded from the default `npm test` command to keep CI/CD pipelines fast. They should be run manually or in dedicated test environments.

📋 **Detailed testing guide**: [TESTING.md](./docs/TESTING.md)

### 🔑 Test Account Management

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

- ✅ Avoid Let's Encrypt's 50 registrations per IP per 3 hours limit
- ✅ Faster test execution (reuse existing accounts)
- ✅ Isolated accounts per test type
- ✅ Automatic git ignore protection

📋 **Detailed account management guide**: [TEST-ACCOUNT-MANAGEMENT.md](./docs/reports/TEST-ACCOUNT-MANAGEMENT.md)

## 📄 License

ISC License - see [LICENSE](./LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

---

<div align="center">

**Made with ❤️ for the Node.js community**

[🔝 Back to Top](#-table-of-contents) | [Report Issues](https://github.com/thebitrock/acme-love/issues) | [Request Features](https://github.com/thebitrock/acme-love/discussions)

</div>
