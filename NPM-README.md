# ACME Love - Modern ACME Client and CLI

[![NPM Version](https://img.shields.io/npm/v/acme-love.svg)](https://www.npmjs.com/package/acme-love)
[![NPM Downloads](https://img.shields.io/npm/dm/acme-love.svg)](https://www.npmjs.com/package/acme-love)
[![License](https://img.shields.io/npm/l/acme-love.svg)](https://github.com/thebitrock/acme-love/blob/main/LICENSE)
[![CI Status](https://github.com/thebitrock/acme-love/workflows/CI%20&%20Release/badge.svg)](https://github.com/thebitrock/acme-love/actions)
[![GitHub Stars](https://img.shields.io/github/stars/thebitrock/acme-love?style=social)](https://github.com/thebitrock/acme-love)
[![Bundle Size](https://img.shields.io/bundlephobia/min/acme-love)](https://bundlephobia.com/package/acme-love)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js Version](https://img.shields.io/node/v/acme-love.svg)](https://nodejs.org/)
[![Provenance](https://img.shields.io/badge/provenance-enabled-brightgreen)](https://www.npmjs.com/package/acme-love)

**Modern, strongly-typed ACME (RFC 8555) toolkit for Node.js 20+**

Powerful CLI tool and TypeScript library for Let's Encrypt and other ACME Certificate Authorities.

## Quick Start

### Global Installation

```bash
npm install -g acme-love
acme-love interactive --staging
```

### One-time Usage

```bash
npx acme-love cert \
  --domain example.com \
  --email admin@example.com \
  --staging \
  --challenge dns-01
```

### Library Usage

```bash
npm install acme-love
```

```typescript
import { AcmeClient, AcmeAccount, provider, generateKeyPair, createAcmeCsr } from 'acme-love';

// 1. Create client with Let's Encrypt staging
const client = new AcmeClient(provider.letsencrypt.staging, {
  nonce: { maxPool: 64 },
});

// 2. Generate account keys (ECDSA P-256 recommended)
const algo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' } as const;
const keyPair = await generateKeyPair(algo);
const accountKeys = {
  privateKey: keyPair.privateKey,
  publicKey: keyPair.publicKey,
};

// 3. Create account and register
const account = new AcmeAccount(client, accountKeys);
await account.register({
  contact: 'admin@example.com',
  termsOfServiceAgreed: true,
});

// 4. Request certificate via DNS-01 challenge
const order = await account.createOrder(['example.com']);
const ready = await account.solveDns01(order, {
  setDns: async (preparation) => {
    console.log(`Set TXT record: ${preparation.target} = ${preparation.value}`);
    // Implement DNS record creation via your DNS provider
  },
});

// 5. Generate CSR and finalize
const { derBase64Url } = await createAcmeCsr(['example.com'], algo);
const finalized = await account.finalize(ready, derBase64Url);
const valid = await account.waitOrder(finalized, ['valid']);
const certificate = await account.downloadCertificate(valid);
```

**For HTTP-01 challenge (simpler setup):**

```typescript
const ready = await account.solveHttp01(order, {
  setHttp: async (preparation) => {
    console.log(`Serve file at: ${preparation.target}`);
    console.log(`Content: ${preparation.value}`);
    // Place file on your web server
  },
});
```

## Key Features

| Feature              | Description                                       |
| -------------------- | ------------------------------------------------- |
| **Interactive CLI**  | Interactive prompts with staging/production modes |
| **Multi-Provider**   | Let's Encrypt, ZeroSSL, Google Trust, Buypass     |
| **All Challenges**   | DNS-01, HTTP-01 with automatic validation         |
| **Wildcard Support** | `*.example.com` certificates via DNS-01           |
| **EAB Support**      | External Account Binding for commercial CAs       |
| **Modern Crypto**    | ECDSA (P-256/384/521) and RSA (2048/3072/4096)    |
| **Performance**      | Nonce pooling, concurrent operations              |
| **Type Safety**      | Full TypeScript support with strict typing        |

## Package Size

- **Packed size**: 91.6 kB (gzipped for npm registry)
- **Unpacked size**: 407.4 kB
- **Dependencies**: 7 runtime dependencies
- **Tree-shakeable**: Yes (ESM with `sideEffects: false`)
- **TypeScript types**: Included (no @types package needed)

## Supported Providers

- **Let's Encrypt** - Free certificates with rate limiting
- **ZeroSSL** - Commercial CA with EAB support
- **Google Trust Services** - Enterprise-grade certificates
- **Buypass** - European certificate authority
- **Custom ACME** - Any RFC 8555 compliant provider

## CLI Commands

```bash
# Interactive mode (recommended for beginners)
acme-love interactive

# Direct certificate issuance
acme-love cert --domain example.com --email admin@example.com --staging

# Account key generation
acme-love create-account-key --algo ec-p256

# Certificate status check
acme-love status --cert-path ./cert.pem
```

## Algorithm Support

**Default: ECDSA P-256** (fast, secure, compact)

- **ECDSA**: P-256, P-384, P-521
- **RSA**: 2048, 3072, 4096 bits

## Cross-Platform

- **OS**: Linux, macOS, Windows
- **Architecture**: x64, ARM64
- **Node.js**: 20.18.1+

## Documentation

- [Full Documentation](https://github.com/thebitrock/acme-love#readme)
- [CLI Usage Guide](https://github.com/thebitrock/acme-love/blob/main/docs/CLI.md)
- [API Reference](https://github.com/thebitrock/acme-love/blob/main/docs/)
- [Contributing](https://github.com/thebitrock/acme-love/blob/main/CONTRIBUTING.md)

## Security

- Industry-standard cryptography (WebCrypto API)
- Secure account key management
- Rate limiting and nonce pooling

Report security issues: [Security Policy](https://github.com/thebitrock/acme-love/blob/main/SECURITY.md)

## License

MIT License - see [LICENSE](https://github.com/thebitrock/acme-love/blob/main/LICENSE)

---

Maintained by [Roman Pohorilchuk](https://github.com/thebitrock)

[GitHub](https://github.com/thebitrock/acme-love) | [Discussions](https://github.com/thebitrock/acme-love/discussions) | [Issues](https://github.com/thebitrock/acme-love/issues)
