# 🔐 ACME Love - Modern ACME Client & CLI

[![NPM Version](https://img.shields**For HTTP-01 challenge (simpler setup):\*\*

````typescript
// Use HTTP-01 instead of DNS-01
const ready = await acct.solveHttp01(order, {
  setHttp: async (preparation) => {
    console.log(`Serve file at: ${preparation.target}`);
    console.log(`Content: ${preparation.value}`);
    // Place file on your web server
  },
  waitFor: async (preparation) => {
    // Optional: validate the challenge before ACME server checks
    console.log('Validating HTTP challenge...');
  },
});
```cme-love.svg)](https://www.npmjs.com/package/acme-love)
[![NPM Downloads](https://img.shields.io/npm/dm/acme-love.svg)](https://www.npmjs.com/package/acme-love)
[![License](https://img.shields.io/npm/l/acme-love.svg)](https://github.com/thebitrock/acme-love/blob/main/LICENSE)
[![Node.js Version](https://img.shields.io/node/v/acme-love.svg)](https://nodejs.org/)

**Modern, strongly‑typed ACME (RFC 8555) toolkit for Node.js 20+**

Powerful CLI tool + TypeScript library for Let's Encrypt and other ACME Certificate Authorities

## 🚀 Quick Start

### Global Installation
```bash
npm install -g acme-love
acme-love interactive --staging
````

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
import {
  AcmeClientCore,
  AcmeAccountSession,
  provider,
  createAcmeCsr,
  generateKeyPair,
} from 'acme-love';

// 1. Create client with Let's Encrypt staging
const core = new AcmeClientCore(provider.letsencrypt.staging, {
  nonce: { maxPool: 64 },
});

// 2. Generate account keys (ECDSA P-256 recommended)
const algo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' } as const;
const keyPair = await generateKeyPair(algo);
const accountKeys = {
  privateKey: keyPair.privateKey,
  publicKey: keyPair.publicKey,
};

// 3. Create account session and register
const acct = new AcmeAccountSession(core, accountKeys);
await acct.ensureRegistered({
  contact: ['mailto:admin@example.com'],
  termsOfServiceAgreed: true,
});

// 4. Request certificate
const order = await acct.newOrder(['example.com']);
const ready = await acct.solveDns01(order, {
  setDns: async (preparation) => {
    console.log(`Set TXT record: ${preparation.target} = ${preparation.value}`);
    // Implement DNS record creation via your DNS provider
  },
});

// 5. Generate CSR and finalize
const { derBase64Url } = await createAcmeCsr(['example.com'], algo);
const finalized = await acct.finalize(ready, derBase64Url);
const valid = await acct.waitOrder(finalized.url, ['valid']);
const certificate = await acct.downloadCertificate(valid);
```

**For HTTP-01 challenge (simpler setup):**

```typescript
// Use HTTP-01 instead of DNS-01
const ready = await acct.solveHttp01(order, {
  setHttpChallenge: async (preparation) => {
    console.log(`Serve file at: ${preparation.url}`);
    console.log(`Content: ${preparation.content}`);
    // Place file on your web server
  },
});
```

## ✨ Key Features

| Feature                 | Description                                     |
| ----------------------- | ----------------------------------------------- |
| 🖥️ **Interactive CLI**  | Beautiful prompts with staging/production modes |
| 🌐 **Multi-Provider**   | Let's Encrypt, ZeroSSL, Google Trust, Buypass   |
| 🔒 **All Challenges**   | DNS-01, HTTP-01 with automatic validation       |
| 🌟 **Wildcard Support** | `*.example.com` certificates via DNS-01         |
| 🔑 **EAB Support**      | External Account Binding for commercial CAs     |
| 🔐 **Modern Crypto**    | ECDSA (P-256/384/521) & RSA (2048/3072/4096)    |
| ⚡ **Performance**      | Nonce pooling, concurrent operations            |
| 🛡️ **Type Safety**      | Full TypeScript support with strict typing      |

## 🏢 Supported Providers

- **Let's Encrypt** - Free certificates with rate limiting
- **ZeroSSL** - Commercial CA with EAB support
- **Google Trust Services** - Enterprise-grade certificates
- **Buypass** - European certificate authority
- **Custom ACME** - Any RFC 8555 compliant provider

## 📋 CLI Commands

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

## 🔧 Algorithm Support

**Default: ECDSA P-256** (fast, secure, compact)

- **ECDSA**: P-256, P-384, P-521
- **RSA**: 2048, 3072, 4096 bits

## 🌍 Cross-Platform

- **OS**: Linux, macOS, Windows
- **Architecture**: x64, ARM64
- **Node.js**: 20.18.1+

## 📚 Documentation

- [📖 Full Documentation](https://github.com/thebitrock/acme-love#readme)
- [🚀 CLI Usage Guide](https://github.com/thebitrock/acme-love/blob/main/docs/CLI.md)
- [🔧 API Reference](https://github.com/thebitrock/acme-love/blob/main/docs/)
- [🤝 Contributing](https://github.com/thebitrock/acme-love/blob/main/CONTRIBUTING.md)

## 🔐 Security

- Industry-standard cryptography (WebCrypto API)
- Secure account key management
- Rate limiting and nonce pooling
- Regular security audits

Report security issues: [Security Policy](https://github.com/thebitrock/acme-love/blob/main/SECURITY.md)

## 📄 License

MIT License - see [LICENSE](https://github.com/thebitrock/acme-love/blob/main/LICENSE)

---

**Made with ❤️ by [Roman Pohorilchuk](https://github.com/thebitrock)**

[⭐ Star us on GitHub](https://github.com/thebitrock/acme-love) | [💬 Join Discussions](https://github.com/thebitrock/acme-love/discussions) | [🐛 Report Issues](https://github.com/thebitrock/acme-love/issues)
