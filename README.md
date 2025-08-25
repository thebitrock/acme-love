git clone <repository-url>

<div align="center">

# ACME Love

Lightweight, strongly‑typed **ACME (RFC 8555)** toolkit for Node.js 20+/TypeScript. Provides a high‑level `ACMEClient`, CA directory presets (Let's Encrypt / Buypass / Google / ZeroSSL), nonce pooling, CSR helpers and validation utilities.

</div>

## Key Features

| Feature                    | Notes                                                            |
| -------------------------- | ---------------------------------------------------------------- |
| ESM + TS 5                 | Native Node.js ESM, strict types                                 |
| Multiple CAs               | Built‑in directory catalog (staging & prod)                      |
| Robust nonce management    | Pooled, prefetch, retry on `badNonce`                            |
| Coalesced account creation | Prevent duplicate parallel `newAccount` calls                    |
| Order & challenge helpers  | http-01, dns-01 base utilities, tls-alpn-01 digest support (WIP) |
| CSR & key utilities        | Via WebCrypto/Jose + X.509 helpers                               |
| Pluggable logging          | Pass any logger or use `debug` / console                         |
| Test runner                | AVA for fast isolated ESM tests                                  |

## Install

```bash
npm install acme-love
```

Node.js >= 20 is required (WebCrypto, modern URL, base64url support).

## Quick Start

```ts
import { ACMEClient, directory } from 'acme-love';
import { generateKeyPair } from 'jose';

// 1. Key material (ES256 recommended)
const { privateKey, publicKey } = await generateKeyPair('ES256');

// 2. Instantiate client for Let's Encrypt staging
const client = new ACMEClient(directory.letsencrypt.staging.directoryUrl, {
  nonce: {
    // optional NonceManager tuning
    maxPool: 64,
    prefetchLowWater: 8,
    prefetchHighWater: 32,
  },
});

// 3. Register / set account
client.setAccount({ privateKey, publicKey });
await client.createAccount({ contact: ['mailto:admin@example.com'], termsOfServiceAgreed: true });

// 4. Create an order
const order = await client.createOrder([{ type: 'dns', value: 'example.com' }]);

// 5. Fetch keyAuthorization / DNS value
// (choose appropriate challenge type from authorization fetch; simplified here)
// const authz = await client.fetchResource(order.authorizations[0]);
// const challenge = authz.challenges.find(c => c.type === 'http-01');
// const keyAuth = await client.getChallengeKeyAuthorization(challenge);

// 6. Finalize & download certificate (after validating challenge & creating CSR)
// const csrDerB64Url = ...
// const finalized = await client.finalizeOrder(order.finalize, csrDerB64Url);
// const pemChain = await client.downloadCertificate(finalized.certificate!);
```

> NOTE: Challenge completion (http-01 / dns-01) requires you to provision the response resource (HTTP file or DNS TXT record) before calling `completeChallenge`. Helpers for DNS TXT validation are exported under `acme/validator`.

## CSR Generation (Finalize Order)

After challenges are valid and the order status becomes `ready`, you must submit a CSR. A helper `createAcmeCsr` generates:

- `pem`: PEM encoded PKCS#10 CSR you can store.
- `derBase64Url`: base64url DER form required by ACME `finalize`.

```ts
import { createAcmeCsr } from 'acme-love';

// Common Name + SANs. The first entry is treated as CN.
const { pem, derBase64Url, keys } = await createAcmeCsr(['example.com', 'www.example.com'], {
  kind: 'ec', // or 'rsa'
  namedCurve: 'P-256', // when kind === 'ec'
  hash: 'SHA-256', // CSR signature hash
});

// Persist your cert private key + CSR PEM if desired
// fs.writeFileSync('cert.csr.pem', pem);

// Finalize the order using the base64url DER
const finalized = await client.finalizeOrder(order.finalize, derBase64Url);

// Poll until order becomes valid, then download certificate
if (finalized.status === 'valid' && finalized.certificate) {
  const chainPem = await client.downloadCertificate(finalized.certificate);
  // fs.writeFileSync('cert.pem', chainPem);
}
```

If you already have a PEM CSR from elsewhere, strip the header/footer, base64‑decode to DER, then re‑encode using `Buffer.from(der).toString('base64url')` for `finalize`.

## DNS-01 Validation Example

During a dns-01 challenge you must publish a TXT record containing the key authorization digest. Use `resolveAndValidateAcmeTxtAuthoritative` to verify authoritative DNS before notifying the CA:

```ts
import { resolveAndValidateAcmeTxtAuthoritative } from 'acme-love';

// Assume you already picked the dns-01 challenge and built keyAuthorization:
// const challenge = authz.challenges.find(c => c.type === 'dns-01');
// const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

console.log(`Create TXT _acme-challenge.${domain} => ${keyAuthorization}`);
await waitForUser(); // your prompt / UI pause

while (true) {
  const result = await resolveAndValidateAcmeTxtAuthoritative(domain, keyAuthorization);
  if (result.ok) {
    console.log('DNS TXT validated (authoritative)');
    break;
  }
  console.warn('Still not propagated:', result.reasons);
  await new Promise((r) => setTimeout(r, 5000));
}

await client.completeChallenge(challenge);
```

Notes:

- Always query authoritative servers (helper already does) to avoid cached stale answers.
- Retry until TXT visible; propagation can take seconds to minutes depending on TTL.
- After `completeChallenge`, poll the order or authorization until it moves to `valid` or `invalid`.

## Directory Catalog

```ts
import { directory } from 'acme-love';
console.log(directory.letsencrypt.staging.directoryUrl);
console.log(directory.buypass.production.directoryUrl);
```

Each entry: `{ directoryUrl, name, environment }`.

## Nonce Management

The client internally uses a pooled nonce strategy (see [detailed docs](./docs/nonce-manager.md)). You can tune it when constructing the client:

```ts
const client = new ACMEClient(directory.letsencrypt.production.directoryUrl, {
  nonce: {
    maxPool: 80,
    prefetchLowWater: 10,
    prefetchHighWater: 50,
    maxAgeMs: 4 * 60_000,
    log: (...a) => console.info('[nonce]', ...a),
  },
});
```

Defaults (if you do not override):

| Option            | Default | Description                         |
| ----------------- | ------- | ----------------------------------- |
| maxPool           | 64      | Max cached nonces                   |
| prefetchLowWater  | 12      | Start prefetch when pool below this |
| prefetchHighWater | 40      | Target fill size                    |
| maxAgeMs          | 300000  | Discard stale nonces                |

## Public Exports

```ts
import {
  ACMEClient,
  directory,
  // Types
  ACMEAccount,
  ACMEOrder,
  ACMEChallenge,
  // Validators & CSR helpers
} from 'acme-love';
```

Types are re‑exported from `acme/types/*` for library consumers.

## Error Handling

Server "problem+json" documents are converted into typed errors where possible; otherwise a `ServerInternalError` is thrown. For nonce replay mismatches the internal retry logic consumes `badNonce` transparently when using client high-level methods.

## Testing

The project uses **AVA**.

```bash
npm test          # all tests
npm run test:e2e  # only e2e tests (*.e2e.test.ts)
```

## Scripts

```bash
npm run dev      # tsx + nodemon development
npm run build    # tsc build to dist/
npm start        # run built version
npm run clean    # remove dist
```

## Project Structure (simplified)

```
src/
  index.ts                # Public entry (re-exports)
  directory.ts            # CA directory catalog
  acme/
    client/
      acme-client.ts      # High-level orchestration
      acme-transport.ts   # Signed POST + nonce usage
      nonce-manager.ts    # Pooled nonce implementation
      acme-signer.ts      # JWS & key auth helpers
    types/                # Account / order / directory type defs
    validator/            # TXT / challenge validators
    csr.ts                # CSR creation helpers
docs/
  nonce-manager.md        # Detailed nonce manager documentation
```

## Security Notes

- Always use the staging environment first (Let's Encrypt staging) to avoid rate limits.
- Persist account key material securely; losing the private key prevents certificate revocation.
- Do not reuse nonces manually—let the client manage them.

## Roadmap / Ideas

- EAB (External Account Binding) support
- Full tls-alpn-01 automation helper
- PEM/DER CSR utilities expansion
- Pluggable storage layer for distributed nonce pools

## Contributing

PRs & issues welcome. Please open an issue to discuss large changes first.

## License

ISC

---

Built with a focus on correctness, clarity & low overhead.
