# ACME Love - RFC 8555 Compliant Architecture

Modern TypeScript ACME client library with RFC 8555 compliant architecture.

## Architecture

```
src/lib/
├── core/                          # Core ACME protocol implementation
│   ├── acme-client.ts             # Main client: directory discovery, nonce init (Section 7.1)
│   ├── acme-account.ts            # Account facade: registration, orders, challenges (Section 7.3)
│   ├── acme-order-manager.ts      # Order lifecycle: create, finalize, poll, download (Section 7.4)
│   ├── acme-challenge-solver.ts   # DNS-01 and HTTP-01 challenge solving (Section 8)
│   └── acme-request-signer.ts     # JWS signing, nonce management, EAB (Section 6.2)
├── managers/                      # State management
│   ├── nonce-manager.ts           # Anti-replay nonce pool with prefetching
│   └── rate-limiter.ts            # Rate limit detection, backoff, retry
├── transport/                     # HTTP transport layer
│   ├── http-client.ts             # HTTPS-enforced undici client with size limits
│   ├── middleware.ts              # Request/response pipeline (logging, UA, rate-limit)
│   ├── retry.ts                   # Exponential backoff with crypto-safe jitter
│   ├── acme-transport.ts          # ACME-specific transport utilities
│   └── index.ts                   # Transport barrel export
├── crypto/                        # Cryptographic operations
│   ├── csr.ts                     # CSR generation (ECDSA P-256/384/521, RSA 2048/3072/4096)
│   ├── signer.ts                  # JWS signing via jose
│   └── index.ts                   # Crypto barrel export
├── challenges/                    # Challenge validators
│   ├── dns-txt-validator.ts       # DNS-01 TXT record validation with authoritative NS
│   ├── http-validator.ts          # HTTP-01 challenge validation with SSRF protection
│   └── index.ts                   # Challenges barrel export
├── errors/                        # RFC 7807 Problem Details
│   ├── acme-server-errors.ts      # Typed error classes for ACME server errors
│   ├── acme-operation-errors.ts   # Client-side operation errors
│   ├── codes.ts                   # ACME error code constants
│   └── factory.ts                 # Error factory from problem+json responses
├── types/                         # TypeScript definitions
│   ├── directory.ts               # AcmeDirectory, AcmeDirectoryMeta
│   ├── order.ts                   # AcmeOrder, AcmeChallenge, AcmeAuthorization
│   ├── account.ts                 # Account-related types
│   └── status.ts                  # Status enums (order, authorization, challenge)
├── constants/                     # Configuration defaults
│   ├── defaults.ts                # Timeouts, pool sizes, retry settings
│   └── status.ts                  # ACME status constants
├── utils/                         # Utilities
│   ├── debug.ts                   # Namespaced debug logging (acme-love:*)
│   ├── user-agent.ts              # User-Agent string builder
│   └── index.ts                   # Utils barrel export
└── index.ts                       # Library barrel export
```

## RFC 8555 Naming

| Class                 | RFC Section | Purpose                                           |
| --------------------- | ----------- | ------------------------------------------------- |
| `AcmeClient`          | 7.1         | Directory discovery, nonce manager initialization |
| `AcmeAccount`         | 7.3         | Account registration, order/challenge facade      |
| `AcmeOrderManager`    | 7.4         | Order creation, finalization, polling             |
| `AcmeChallengeSolver` | 8           | DNS-01 and HTTP-01 challenge solving              |
| `AcmeRequestSigner`   | 6.2         | JWS-authenticated POST requests                   |

## Usage

```typescript
import { AcmeClient, AcmeAccount, generateKeyPair, createAcmeCsr } from 'acme-love';

const client = new AcmeClient('https://acme-v02.api.letsencrypt.org/directory');
const keys = await generateKeyPair({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });

const account = new AcmeAccount(client, keys);
await account.register({ contact: ['mailto:admin@example.com'], termsOfServiceAgreed: true });

const order = await account.createOrder(['example.com']);
```

## Secondary Entry Point

The `directory` subpath export provides pre-configured ACME provider URLs:

```typescript
import { provider } from 'acme-love/directory';

const url = provider.letsencrypt.staging.directoryUrl;
```
