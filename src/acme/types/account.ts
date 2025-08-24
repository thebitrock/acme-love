import type { webcrypto } from 'crypto';

export interface ACMEAccount {
  privateKey: webcrypto.CryptoKey | Uint8Array<ArrayBufferLike>;
  publicKey: webcrypto.CryptoKey | Uint8Array<ArrayBufferLike>;
  keyId?: string;
}

export interface CreateAccount {
  contact?: string[];
  termsOfServiceAgreed?: boolean;
}
