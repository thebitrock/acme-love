<div align="center">

# 🔐 ACME Love

**Modern, strongly‑typed ACME (RFC 8555) toolkit for Node.js 20+**

Powerful CLI tool + TypeScript library for Let's Encrypt and other ACME Certificate Authorities

[![NPM Version](https://img.shields.io/npm/v/acme-love.svg)](https://www.npmjs.com/package/acme-love)
[![NPM License](https://img.shields.io/npm/l/acme-love.svg)](https://github.com/thebitrock/acme-love/blob/main/LICENSE)

</div>

## ✨ Key Features

| Feature                     | Description                                                 |
| --------------------------- | ----------------------------------------------------------- |
| 🖥️ **Powerful CLI**         | Interactive & command-line modes with beautiful prompts     |
| 🌐 **Multi-Environment**    | Staging, Production, and Custom ACME directories            |
| 🔒 **Challenge Support**    | DNS-01 and HTTP-01 with automatic validation                |
| 🛠️ **Smart Error Handling** | Maintenance detection, user-friendly error messages         |
| ⚡ **Modern Architecture**  | ESM + TypeScript 5, WebCrypto, nonce pooling                |
| 🏢 **Multiple CAs**         | Let's Encrypt, Buypass, Google, ZeroSSL presets             |
| 🔧 **Developer Friendly**   | Multiple CLI access methods, auto-build, comprehensive docs |

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
  --domain test.example.com \
  --email admin@example.com \
  --staging \
  --challenge dns-01

# Get a production certificate
acme-love cert \
  --domain example.com \
  --email admin@example.com \
  --production \
  --challenge http-01
```

### 🎯 Challenge Types

**DNS-01 Challenge** (Recommended)

```bash
acme-love cert --challenge dns-01 --domain example.com --email user@example.com --staging
```

- ✅ Works with wildcard certificates (`*.example.com`)
- ✅ No need for public web server
- 🔧 Requires DNS provider access

**HTTP-01 Challenge**

```bash
acme-love cert --challenge http-01 --domain example.com --email user@example.com --staging
```

- ✅ Simple validation via HTTP file
- ✅ Automatic validation with built-in checker
- 🔧 Requires domain to point to your web server

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

See [CLI-USAGE.md](./CLI-USAGE.md) for detailed development setup.

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
  contact: ['mailto:admin@example.com'],
  termsOfServiceAgreed: true,
});

// 5. Create order and solve challenges
const order = await acct.newOrder(['example.com']);

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
const { derBase64Url, keys: csrKeys } = await createAcmeCsr(['example.com'], algo);
const finalized = await acct.finalize(ready, derBase64Url);
const valid = await acct.waitOrder(finalized.url, ['valid']);
const certificate = await acct.downloadCertificate(valid);

console.log('Certificate obtained!', certificate);
```

### Advanced Features

**Error Handling with Maintenance Detection**

```ts
import { ServerMaintenanceError } from 'acme-love';

try {
  await acct.newOrder(['example.com']);
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
    log: console.debug, // Optional logging
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
    log: (...args) => logger.info('[nonce]', ...args),
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
| `log`               | noop    | Optional logger function for diagnostics           |

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

📖 **Detailed documentation**: [docs/nonce-manager.md](./docs/nonce-manager.md)

## 🔧 CSR Generation

The `createAcmeCsr` helper generates everything needed for certificate finalization:

```ts
import { createAcmeCsr } from 'acme-love';

const { pem, derBase64Url, keys } = await createAcmeCsr(
  ['example.com', 'www.example.com'], // domains (first = CN)
  { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' },
);

// pem: PEM-encoded CSR for storage
// derBase64Url: base64url DER for ACME finalize
// keys: Certificate private/public key pair
```

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

## ⚡ Requirements

- **Node.js ≥ 20** (WebCrypto, modern URL, base64url support)
- **TypeScript ≥ 5** (for development)

## 📄 License

ISC License - see [LICENSE](./LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

---

<div align="center">

**Made with ❤️ for the Node.js community**

[Report Issues](https://github.com/thebitrock/acme-love/issues) | [Request Features](https://github.com/thebitrock/acme-love/discussions)
