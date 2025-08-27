<div align="center">

# 🔐 ACME Love

**Modern, strongly‑typed ACME (RFC 8555) toolkit for Node.js 20+**

Powerful CLI tool + TypeScript library for Let's Encrypt and other ACME Certificate Authorities

[![NPM Version](https://img.shields.io/npm/v/acme-love.svg)](https://www.npmjs.com/package/acme-love)
[![NPM License](https://img.shields.io/npm/l/acme-love.svg)](https://github.com/thebitrock/acme-love/blob/main/LICENSE)
[![Tests](https://img.shields.io/badge/tests-42%20passing-brightgreen.svg)](https://github.com/thebitrock/acme-love)
[![Coverage](https://img.shields.io/badge/coverage-94%25%20CSR%20%7C%2069%25%20NonceManager-green.svg)](https://github.com/thebitrock/acme-love)

</div>

## ✨ Key Features

| Feature                      | Description                                                 |
| ---------------------------- | ----------------------------------------------------------- |
| 🖥️ **Powerful CLI**          | Interactive & command-line modes with beautiful prompts     |
| 🌐 **Multi-Environment**     | Staging, Production, and Custom ACME directories            |
| 🔒 **Challenge Support**     | DNS-01 and HTTP-01 with automatic validation                |
| � **Crypto Algorithms**      | ECDSA (P-256/P-384/P-521) and RSA (2048/3072/4096) support  |
| �🛠️ **Smart Error Handling** | Maintenance detection, user-friendly error messages         |
| ⚡ **Modern Architecture**   | ESM + TypeScript 5, WebCrypto, nonce pooling                |
| 🏢 **Multiple CAs**          | Let's Encrypt, Buypass, Google, ZeroSSL presets             |
| 🔧 **Developer Friendly**    | Multiple CLI access methods, auto-build, comprehensive docs |

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

### � Cryptographic Algorithms

The CLI uses **P-256 ECDSA** by default for both account and certificate keys, providing an excellent balance of security and performance. This algorithm is:

- ✅ **Fast**: Quicker than RSA for signing operations
- ✅ **Secure**: 256-bit elliptic curve equivalent to 3072-bit RSA
- ✅ **Compatible**: Widely supported by browsers and servers
- ✅ **Compact**: Smaller key sizes and certificate files

For programmatic usage via the library, you can choose from multiple algorithms including different ECDSA curves (P-256, P-384, P-521) and RSA key sizes (2048, 3072, 4096 bits). See the [Supported Cryptographic Algorithms](#supported-cryptographic-algorithms) section for details.

### �🛠️ Development & Local Usage

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

See [CLI-USAGE.md](./CLI-USAGE.md) for detailed development setup.

### 📖 CLI Commands Reference

| Command              | Purpose                        | Algorithm Options                    |
| -------------------- | ------------------------------ | ------------------------------------ |
| `cert`               | Obtain SSL certificate         | `--account-algo`, `--cert-algo`      |
| `create-account-key` | Generate ACME account key      | `--algo`                             |
| `status`             | Check certificate status       | -                                    |
| `interactive`        | Interactive certificate wizard | Full interactive algorithm selection |

**Algorithm Values**: `ec-p256` (default), `ec-p384`, `ec-p521`, `rsa-2048`, `rsa-3072`, `rsa-4096`

**Examples**:

```bash
# Generate P-384 ECDSA account key
acme-love create-account-key --algo ec-p384 --output ./my-account.json

# Mixed algorithms: P-256 account, RSA-4096 certificate
acme-love cert --account-algo ec-p256 --cert-algo rsa-4096 --domain acme-love.com

# Interactive mode with full algorithm selection
acme-love interactive --staging
```

## 📚 Library Usage

### Installation

```bash
npm install acme-love
```

### Modern ACME Client

```ts
import {
  AcmeClientCore,
  AcmeAccountSession,
  directory,
  createAcmeCsr,
  generateKeyPair,
} from 'acme-love';

// 1. Create client core with nonce pooling
const core = new AcmeClientCore(directory.letsencrypt.staging.directoryUrl, {
  nonce: { maxPool: 64 },
});

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

**Error Handling with Maintenance Detection**

```ts
import { ServerMaintenanceError } from 'acme-love';

try {
  await acct.newOrder(['acme-love.com']);
} catch (error) {
  if (error instanceof ServerMaintenanceError) {
    console.log('🔧 Service is under maintenance');
    console.log('Check https://letsencrypt.status.io/');
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

ACME Love includes a sophisticated **NonceManager** that optimizes nonce handling for high-performance certificate operations. Nonces are automatically pooled, prefetched, and recycled to minimize network round-trips.

### Global Configuration

Set default nonce behavior for all accounts:

```ts
const core = new AcmeClientCore(directory.letsencrypt.production.directoryUrl, {
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

📖 **Detailed documentation**: [docs/nonce-manager.md](./docs/nonce-manager.md)

## � Advanced Validators & Utilities

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

## �🔧 CSR Generation

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
import { directory } from 'acme-love';

// Let's Encrypt
directory.letsencrypt.staging.directoryUrl;
directory.letsencrypt.production.directoryUrl;

// Buypass
directory.buypass.staging.directoryUrl;
directory.buypass.production.directoryUrl;

// Google Trust Services
directory.google.staging.directoryUrl;
directory.google.production.directoryUrl;

// ZeroSSL
directory.zerossl.production.directoryUrl;
```

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

- [CLI Usage Guide](./CLI-USAGE.md) - Development setup and usage examples
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

ACME Love has been extensively tested under high-load scenarios to ensure production-grade performance:

### Stress Test Results

Our comprehensive stress testing validates the library's capability to handle enterprise-scale certificate management:

| Metric                    | Performance                          |
| ------------------------- | ------------------------------------ |
| **Heavy Load Test**       | 4 accounts × 100 orders = 400 orders |
| **Total Time**            | 33 seconds                           |
| **Success Rate**          | 100% (0 errors)                      |
| **Request Rate**          | 25+ requests/second sustained        |
| **Order Throughput**      | 12+ orders/second                    |
| **Average Response**      | <350ms per request                   |
| **P99 Response Time**     | <700ms                               |
| **Nonce Pool Efficiency** | 98% (saves 95%+ network requests)    |

### Real-World Scenarios Tested

✅ **4 concurrent ACME accounts** registration and management
✅ **400 certificate orders** (100 per account) processed efficiently
✅ **Zero rate limit violations** with automatic 503 detection and backoff
✅ **Production load simulation** with Let's Encrypt staging environment
✅ **98% nonce pool efficiency** saving 95%+ network requests
✅ **Sub-second response times** with consistent performance

### Optimization Features

- **Rate Limiting System**: Automatic HTTP 503 detection with exponential backoff
- **Nonce Pool Management**: 98% efficiency, 64-nonce pool prevents excessive API calls
- **Connection Reuse**: HTTP/2 connection pooling for optimal network usage
- **Request Coalescing**: Eliminates duplicate directory requests
- **Production-Grade Performance**: 25+ req/s sustained, 400 orders in 33 seconds
- **Debug Logging**: Unified debug system with printf-style formatting

```typescript
// Optimized configuration for high-volume scenarios
const core = new AcmeClientCore(directoryUrl, {
  nonce: {
    maxPool: 64, // Handle burst traffic
    prefetchLowWater: 8,
    prefetchHighWater: 32,
  },
});

// With rate limiting enabled by default
// Automatic 503 detection and exponential backoff
// 98% nonce pool efficiency in production loads
```

📊 **Full stress test results**: [STRESS-TEST-RESULTS.md](./STRESS-TEST-RESULTS.md)

### Running Performance Tests

We've created a comprehensive suite of performance tests to validate different scenarios:

```bash
# Quick metrics test (1 account creation + HTTP metrics)
npm run test:metrics        # ~3 seconds, validates core performance

# Quick stress test (1 account × 2 orders)
npm run test:quick         # ~30 seconds, basic validation testing

# Light stress test (2 accounts × 3 orders each)
npm run test:light         # ~30 seconds, basic load testing

# Demo test (2 accounts × 5 orders each)
npm run test:demo          # ~30 seconds, demonstration scenario

# Standard stress test (6 accounts × 10 orders each)
npm run test:stress        # ~30 seconds, production scenario testing

# Heavy stress test (4 accounts × 100 orders each) 🔥
npm run test:heavy         # ~35 seconds, enterprise load testing
```

**Test Results Summary** (Latest performance testing):

- ⚡ **400 Orders Processed**: 33 seconds total time
- 🌐 **HTTP Performance**: Sub-350ms average, <700ms P99 response time
- 🔄 **Nonce Pool Efficiency**: 98% network request reduction
- 📊 **Zero Rate Limit Hits**: Perfect rate limiting with exponential backoff
- 🎯 **Production Ready**: 25+ req/s sustained, 12+ orders/sec throughput

**Heavy Stress Test** (4 accounts × 100 orders = 400 orders):

- 🎯 **Enterprise Scale**: Production-grade performance validation
- 📊 **Advanced Metrics**: Fast sub-second response times
- 🔍 **Rate Limiting**: Zero 503 errors with automatic backoff
- ⚡ **Nonce Efficiency**: 98% pool efficiency
- 🚀 **Throughput**: 25+ req/s, 12+ orders/sec sustained performance

**Performance Improvements** (vs. earlier versions):

- 🔥 **10x Faster**: Tests now complete in 30-35 seconds vs 5-10 minutes
- 🚀 **Better Efficiency**: 98% nonce pooling vs basic pooling
- 🎯 **Zero Failures**: 100% success rate in enterprise load testing
- 📈 **Consistent Performance**: All stress tests complete under 35 seconds

📋 **Latest test report**: [HEAVY-STRESS-TEST-RESULTS.md](./HEAVY-STRESS-TEST-RESULTS.md)

## 🚨 ~~Known Issues~~ ✅ Resolved Issues

### ~~Concurrent Account Creation Deadlock~~ ✅ **RESOLVED**

**Previous Issue**: Deadlock detected in concurrent ACME account creation operations.

**✅ Resolution**:

- Implemented comprehensive rate limiting system with HTTP 503 detection
- Added exponential backoff with Retry-After header support
- Optimized nonce pool management with 98% efficiency
- Unified debug logging system with printf-style formatting
- **Latest test results**: 4 accounts × 100 orders = 400 operations completed successfully in 33 seconds

**Current Status**:

- ✅ **100% success rate** in heavy stress testing
- ✅ **Zero rate limit violations** with automatic backoff
- ✅ **Production-ready** performance (25+ req/s sustained)
- ✅ **Enterprise-scale** validation (400 concurrent operations)
- ✅ **10x Performance Improvement**: Tests complete in 30-35s vs 5-10 minutes

## 🧪 Test Coverage

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
npm run test:quick      # Quick stress test (30s)
npm run test:light      # Light stress test (30s)
npm run test:demo       # Demo stress test (30s)
npm run test:stress     # Standard stress test (2 min)
npm run test:heavy      # Heavy stress test (10 min)
npm run test:deadlock   # Deadlock detection test (2 min)

# Stress test groups
npm run test:stress:fast  # Run quick + light + demo tests
npm run test:stress:all   # Run all stress tests (takes ~15 minutes)
```

**Note**: Stress tests are excluded from the default `npm test` command to keep CI/CD pipelines fast. They should be run manually or in dedicated test environments.

📋 **Detailed testing guide**: [TESTING.md](./TESTING.md)

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

📋 **Detailed account management guide**: [TEST-ACCOUNT-MANAGEMENT.md](./TEST-ACCOUNT-MANAGEMENT.md)

## 📄 License

ISC License - see [LICENSE](./LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

---

<div align="center">

**Made with ❤️ for the Node.js community**

[Report Issues](https://github.com/thebitrock/acme-love/issues) | [Request Features](https://github.com/thebitrock/acme-love/discussions)

</div>
