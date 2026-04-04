# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`acme-love` is an RFC 8555 ACME v2 client library and CLI for Node.js/TypeScript. It automates TLS certificate issuance with Let's Encrypt, ZeroSSL, Buypass, Google Trust Services, and custom ACME CAs. Supports DNS-01, HTTP-01 challenges, wildcard domains, and External Account Binding (EAB).

## Commands

```bash
npm run build           # Dev build (includes tests in tsconfig)
npm run build:prod      # Production build (src/ only, no sourcemaps)
npm test                # Unit tests (excludes stress, rate-limiting, e2e)
npm run test:unit       # Unit tests only (__tests__/unit/)
npm run test:e2e        # E2E tests (needs ACME_E2E_ENABLED=1 for CI)
npm run test:coverage   # Unit tests with coverage report
npm run lint:check      # ESLint check
npm run format:check    # Prettier check
npm run lint:format     # Fix both lint and format
npm run cli             # Build + run CLI
npm run dev             # Nodemon watch mode (tsx)
```

Run a single test file:

```bash
cross-env NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/unit/some-file.test.ts
```

All Jest invocations require `NODE_OPTIONS=--experimental-vm-modules` (ESM support). Tests run with `--runInBand` by default.

## Architecture

Two entry points:

- **`src/index.ts`** - Library entry. Re-exports everything from `src/lib/` and `src/directory.ts`.
- **`src/cli.ts`** - CLI entry. Thin orchestrator delegating to `src/cli/program.ts` and `src/cli/commands/`.

### `src/lib/` - Core Library Layers

| Layer           | Path                                                                                                               | Purpose                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **core/**       | `acme-client.ts`, `acme-account.ts`, `acme-order-manager.ts`, `acme-challenge-solver.ts`, `acme-request-signer.ts` | ACME protocol implementation. `AcmeClient` is the main entry: discovers directory, manages nonces. `AcmeAccount` handles registration/auth. `AcmeOrderManager` drives the order lifecycle. |
| **transport/**  | `http-client.ts`, `middleware.ts`, `retry.ts`                                                                      | HTTP layer using `undici`. Middleware pipeline (timing, logging, rate-limit, user-agent). Retry with exponential backoff.                                                                  |
| **managers/**   | `nonce-manager.ts`, `rate-limiter.ts`                                                                              | Nonce pooling (RFC 8555 Section 6.5 anti-replay). Rate limiter with configurable windows.                                                                                                  |
| **crypto/**     | `csr.ts`, `signer.ts`, `index.ts`                                                                                  | Key generation (ECDSA P-256/384/521, RSA 2048/3072/4096), CSR creation, JWS signing via `jose` + `@peculiar/x509`.                                                                         |
| **challenges/** | `dns-txt-validator.ts`, `http-validator.ts`                                                                        | DNS-01 TXT record validation, HTTP-01 challenge validation.                                                                                                                                |
| **errors/**     | `acme-server-errors.ts`, `acme-operation-errors.ts`, `factory.ts`, `codes.ts`                                      | Typed error hierarchy mapping RFC 8555 problem+json to specific error classes. `createErrorFromProblem()` factory.                                                                         |
| **types/**      | `directory.ts`, `order.ts`, `account.ts`, `status.ts`                                                              | TypeScript interfaces for ACME protocol objects.                                                                                                                                           |
| **constants/**  | `defaults.ts`, `status.ts`                                                                                         | Default config values and ACME status enums.                                                                                                                                               |

### `src/directory.ts`

Pre-configured ACME provider URLs (Let's Encrypt, Buypass, Google, ZeroSSL) exported as `provider` / `directory`.

### `src/cli/`

CLI built with `commander`. `program.ts` registers subcommands from `commands/`. Interactive prompts use `@inquirer/prompts`.

## Key Conventions

- **Pure ESM** (`"type": "module"` in package.json). All internal imports use `.js` extensions.
- **Strict TypeScript** - `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` are all enabled.
- **Two tsconfigs**: `tsconfig.json` (dev, includes `__tests__/` and `examples/`), `tsconfig.prod.json` (extends base, `rootDir: ./src`, no sourcemaps).
- **Conventional Commits** required (`feat(scope):`, `fix(scope):`, etc.). Semantic-release automates versioning and npm publish via `ci-release.yml`.
- **Prettier**: single quotes, trailing commas, 100 char line width, LF endings.
- **Debug logging**: namespaced under `acme-love:*` (enable with `DEBUG=acme-love:*`).

## Architecture Rules

These rules are enforced automatically via `npm run lint:arch` (dependency-cruiser) and ESLint.

### Layer Dependency Rules (enforced by dependency-cruiser)

```
cli/ ──→ lib/core/ ──→ lib/transport/
              │              │
              ├──→ lib/managers/
              │
              ├──→ lib/crypto/
              │
              └──→ lib/challenges/

lib/types/, lib/errors/, lib/utils/, lib/constants/ ← shared, no upward deps
```

**Forbidden imports:**

- `lib/` must NOT import from `cli/` — library code cannot depend on CLI
- `transport/` must NOT import from `core/` — HTTP layer cannot depend on ACME protocol
- `managers/` must NOT import from `core/` — infrastructure cannot depend on ACME protocol
- `types/` and `errors/` must NOT import from runtime modules (core, transport, managers, challenges)
- No circular dependencies allowed

Run `npm run lint:arch` to validate. This runs in CI via prepublishOnly.

### ESLint Strict Rules (src/lib/ only)

- `@typescript-eslint/no-explicit-any`: **error** — no `any` in library code
- `@typescript-eslint/no-non-null-assertion`: **error** — no `!` assertions
- `@typescript-eslint/explicit-function-return-type`: **error** — all exported functions must have return types
- `@typescript-eslint/explicit-member-accessibility`: **error** — all class members must have `public`/`private`/`protected`

Test files (`__tests__/`) are exempt from these rules.

### Branded Types

Use branded types from `src/lib/types/branded.ts` for semantically distinct string values:

| Type              | Use for                       | Example                                          |
| ----------------- | ----------------------------- | ------------------------------------------------ |
| `AccountUrl`      | Account kid URLs              | `https://acme.test/acct/123`                     |
| `Nonce`           | Replay-nonce values           | Anti-replay tokens                               |
| `Base64UrlString` | Base64url-encoded data        | CSR DER, JWK thumbprints                         |
| `PemString`       | PEM-encoded certificates/keys | `-----BEGIN CERTIFICATE-----`                    |
| `ChallengeToken`  | ACME challenge tokens         | RFC 8555 §8.1 tokens                             |
| `DirectoryUrl`    | ACME directory URLs           | `https://acme-v02.api.letsencrypt.org/directory` |

Use `asAccountUrl()`, `asNonce()`, etc. at trust boundaries (after validation, after parsing server responses). Never cast raw strings directly — use the helper functions.
