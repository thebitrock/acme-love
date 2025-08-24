import type { CryptoKey } from 'jose';

export interface ACMEAccount {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  keyId?: string;
}

export interface CreateAccount {
  contact?: string[];
  termsOfServiceAgreed?: boolean;
}
