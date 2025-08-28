# External Account Binding (EAB) Support

This library supports External Account Binding as specified in [RFC 8555 Section 7.3.4](https://datatracker.ietf.org/doc/html/rfc8555#section-7.3.4). EAB is required by some Certificate Authorities for account registration.

## CLI Usage

When using a CA that requires EAB (like some commercial CAs), provide the EAB parameters:

```bash
# Using EAB with cert command
acme-love cert \
  --domain example.com \
  --email admin@example.com \
  --directory https://ca.example.com/acme/directory \
  --eab-kid "your-key-identifier" \
  --eab-hmac-key "your-base64url-encoded-hmac-key"
```

## Programmatic Usage

```typescript
import { AcmeClientCore, AcmeAccountSession, generateKeyPair } from 'acme-love';

// Generate account key pair
const accountKeys = await generateKeyPair({
  kind: 'ec',
  namedCurve: 'P-256',
  hash: 'SHA-256'
});

// Create client and session
const client = new AcmeClientCore('https://ca.example.com/acme/directory');
const session = new AcmeAccountSession(client, {
  privateKey: accountKeys.privateKey!,
  publicKey: accountKeys.publicKey!
});

// Register account with EAB
const eab = {
  kid: 'your-key-identifier',
  hmacKey: 'your-base64url-encoded-hmac-key'
};

const kid = await session.ensureRegistered({
  contact: ['mailto:admin@example.com'],
  termsOfServiceAgreed: true
}, eab);

console.log('Account registered with kid:', kid);
```

## EAB Parameters

- **kid**: Key identifier provided by your CA
- **hmacKey**: HMAC key (base64url encoded) provided by your CA

These credentials are typically provided by your CA when you purchase or request access to their ACME service.

## Supported CAs with EAB

- ZeroSSL (requires EAB for new accounts)
- Google Trust Services (requires EAB)
- Some commercial CAs
- Private ACME deployments with EAB enabled

Check your CA's documentation for specific EAB requirements and how to obtain the credentials.
