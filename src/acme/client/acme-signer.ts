import { createHash } from 'crypto';
import { UnauthorizedError } from '../errors/errors.js';
import type { ACMEAccount } from '../types/account.js';
import {
  calculateJwkThumbprint,
  exportJWK,
  FlattenedSign,
  type FlattenedJWS,
  type JWK,
  type JWSHeaderParameters,
} from 'jose';

/** Minimal signer interface used by AcmeTransport/ACMEClient */
export interface AcmeSigner {
  getAccountKid(): string | undefined;
  setAccountKid(kid: string): void;

  /** Returns cached JWK of the account public key */
  getJwk(): Promise<JWK>;

  /** Signs JWS with the account private key */
  signJws(payload: Uint8Array, header: JWSHeaderParameters): Promise<FlattenedJWS>;

  /** RFC 8555 key authorization: token + '.' + base64url(thumbprint(JWK)) */
  generateKeyAuthorization(token: string): Promise<string>;

  /** DNS-01 TXT value: base64url( sha256( keyAuthorization ) ) */
  dns01Value(token: string): Promise<string>;

  /** TLS-ALPN-01 digest: raw sha256(keyAuthorization) 32 bytes */
  tlsAlpn01Digest(token: string): Promise<Buffer>;

  /** Returns the underlying mutable account object (for convenience) */
  getAccount(): ACMEAccount;
}

/** JOSE/WebCrypto-based signer for ACME account keys */
export class JoseAcmeSigner implements AcmeSigner {
  private jwkPromise: Promise<JWK> | null = null;

  constructor(private readonly account: ACMEAccount) {}

  getAccount(): ACMEAccount {
    return this.account;
  }

  getAccountKid(): string | undefined {
    return this.account.keyId;
  }

  setAccountKid(kid: string): void {
    this.account.keyId = kid;
  }

  async getJwk(): Promise<JWK> {
    if (this.jwkPromise) return this.jwkPromise;
    if (!this.account.publicKey) {
      throw new UnauthorizedError('Account key is not initialized');
    }
    this.jwkPromise = exportJWK(this.account.publicKey);
    return this.jwkPromise;
  }

  async signJws(payload: Uint8Array, header: JWSHeaderParameters): Promise<FlattenedJWS> {
    if (!this.account.privateKey) {
      throw new UnauthorizedError('Account private key is not initialized');
    }
    return new FlattenedSign(payload).setProtectedHeader(header).sign(this.account.privateKey);
  }

  async generateKeyAuthorization(token: string): Promise<string> {
    const jwk = await this.getJwk();
    const thumb = await calculateJwkThumbprint(jwk, 'sha256');
    return `${token}.${thumb}`;
  }

  async dns01Value(token: string): Promise<string> {
    const ka = await this.generateKeyAuthorization(token);
    return createHash('sha256').update(ka).digest('base64url');
  }

  async tlsAlpn01Digest(token: string): Promise<Buffer> {
    const ka = await this.generateKeyAuthorization(token);
    return createHash('sha256').update(ka).digest(); // 32 bytes
  }
}
