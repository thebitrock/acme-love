# External Account Binding (EAB) Support

This library supports External Account Binding as specified in [RFC 8555 Section 7.3.4](https://datatracker.ietf.org/doc/html/rfc8555#section-7.3.4). EAB is required by some Certificate Authorities for account registration.

## CLI Usage

When using a CA that requires EAB (like some commercial CAs), provide the EAB parameters:

```bash
# Using EAB with cert command
acme-love cert \
  --domain example.com \
  --eab-hmac-key "your-base64url-encoded-hmac-key"

# With both kid and hmac key (optional, kid can be auto-detected)
acme-love cert \
  --domain example.com \
  --eab-kid "your-key-identifier" \
  --eab-hmac-key "your-base64url-encoded-hmac-key"
```

## Programmatic Usage

### Modern API (Recommended)

```typescript
import { AcmeClient, AcmeAccount, generateKeyPair, provider } from 'acme-love';

// Generate account key pair
const accountKeys = await generateKeyPair({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });

// Create client and account with EAB
const client = new AcmeClient(provider.zerossl.production);
const account = new AcmeAccount(
  client,
  {
    privateKey: accountKeys.privateKey,
    publicKey: accountKeys.publicKey,
  },
  {
    externalAccountBinding: {
      kid: 'your-key-identifier',
      hmacKey: 'your-base64url-encoded-hmac-key',
    },
  },
);

// Register account (EAB is handled automatically)
const registration = await account.register({
  contact: 'admin@example.com',
  termsOfServiceAgreed: true,
});

console.log('Account registered with kid:', registration.accountUrl);
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
