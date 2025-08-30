import type { webcrypto } from 'crypto';

export interface ACMEAccount {
  privateKey: webcrypto.CryptoKey | Uint8Array; // raw bytes fallback
  publicKey: webcrypto.CryptoKey | Uint8Array; // raw bytes fallback
  keyId?: string;
}

export interface CreateAccount {
  contact?: string[];
  termsOfServiceAgreed?: boolean;
}
