/**
 * RFC 8555 ACME Cryptographic Module - CSR Generation
 *
 * Certificate Signing Request (CSR) generation for ACME protocol.
 * Features:
 * - ECDSA P-256, P-384, P-521 support
 * - RSA 2048, 3072, 4096 bit support
 * - Subject Alternative Names (SAN)
 * - WebCrypto API based
 * - Cross-platform compatibility
 */

import { Crypto, CryptoKey } from '@peculiar/webcrypto';
import {
  cryptoProvider,
  Pkcs10CertificateRequestGenerator,
  SubjectAlternativeNameExtension,
  type Pkcs10CertificateRequestCreateParamsName,
} from '@peculiar/x509';
import type { webcrypto } from 'crypto';

/**
 * ACME Account Cryptographic Keys (RFC 8555)
 * Interface for account private/public key management
 */
export interface AcmeAccountKeyPair {
  /** Account private key for signing */
  privateKey: webcrypto.CryptoKey | Uint8Array;
  /** Account public key for verification */
  publicKey: webcrypto.CryptoKey | Uint8Array;
  /** Optional key ID from ACME server */
  keyId?: string;
}

// Use Node's global WebCrypto if available, otherwise fall back to @peculiar/webcrypto
const provider: Crypto =
  globalThis.crypto && 'subtle' in globalThis.crypto ? (globalThis.crypto as Crypto) : new Crypto();

// Bind WebCrypto provider for @peculiar/x509
cryptoProvider.set(provider);

/**
 * ECDSA algorithm configuration for ACME certificates
 */
export type AcmeEcAlgorithm = {
  kind: 'ec';
  /** Elliptic curve name - P-256 recommended for most use cases */
  namedCurve: 'P-256' | 'P-384' | 'P-521';
  /** Hash algorithm - must be compatible with curve */
  hash: 'SHA-256' | 'SHA-384' | 'SHA-512';
};

/**
 * RSA algorithm configuration for ACME certificates
 */
export type AcmeRsaAlgorithm = {
  kind: 'rsa';
  /** RSA key length - 2048 minimum, 3072+ recommended */
  modulusLength: 2048 | 3072 | 4096;
  /** Hash algorithm for RSASSA-PKCS1-v1_5 */
  hash: 'SHA-256' | 'SHA-384' | 'SHA-512';
};

/**
 * Union type for all supported ACME certificate algorithms
 */
export type AcmeCertificateAlgorithm = AcmeEcAlgorithm | AcmeRsaAlgorithm;

/**
 * Crypto key pair interface for ACME operations
 */
export interface AcmeCryptoKeyPair {
  publicKey: CryptoKey;
  privateKey?: CryptoKey | undefined;
}

export interface CreateCsrResult {
  /** Raw DER bytes of CSR — pass this Buffer into your finalize() that base64url-encodes it */
  der: Buffer;
  /** PEM-encoded CSR, for logging/debugging */
  pem: string;
  /** Convenience: base64url-encoded DER, if you prefer to send string immediately */
  derBase64Url: string;
  /** The keyPair used (keep the private key safe; it matches the issued cert) */
  keys: AcmeCryptoKeyPair;
}

export async function generateKeyPair(algo: AcmeCertificateAlgorithm): Promise<AcmeCryptoKeyPair> {
  if (algo.kind === 'ec') {
    return provider.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: algo.namedCurve,
      },
      true,
      ['sign', 'verify'],
    );
  }

  // RSA
  return provider.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: algo.modulusLength,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: algo.hash,
    },
    true,
    ['sign', 'verify'],
  );
}

/**
 * Creates a CSR for ACME with SAN = all provided DNS names.
 * `commonName` defaults to the first DNS name.
 */
export async function createAcmeCsr(
  dnsNames: string[],
  algo: AcmeCertificateAlgorithm,
  commonName: string = dnsNames[0],
  keys?: AcmeCryptoKeyPair,
): Promise<CreateCsrResult> {
  if (!dnsNames?.length) {
    throw new Error('dnsNames must contain at least one DNS name');
  }

  // Reuse provided keys or generate new ones
  const keyPair = keys ?? (await generateKeyPair(algo));

  // ACME CSR usually has CN = first SAN entry
  const name: Pkcs10CertificateRequestCreateParamsName = `CN=${commonName}`;

  // SAN extension: pass "dns:example.org" strings (see SubjectAlternativeNameExtension API)
  const san = new SubjectAlternativeNameExtension(dnsNames.map((n) => ({ type: 'dns', value: n })));

  // Map our algo to signingAlgorithm for the CSR
  const signingAlgorithm =
    algo.kind === 'ec'
      ? ({ name: 'ECDSA', hash: algo.hash } as const)
      : ({ name: 'RSASSA-PKCS1-v1_5', hash: algo.hash } as const);

  // Create PKCS#10 CSR
  const csr = await Pkcs10CertificateRequestGenerator.create({
    name,
    keys: keyPair,
    signingAlgorithm,
    extensions: [san],
  });

  // Export formats
  const der = Buffer.from(csr.rawData); // DER bytes
  const pem = csr.toString('pem'); // PEM text
  const derBase64Url = der.toString('base64url'); // for ACME finalize

  return { der, pem, derBase64Url, keys: keyPair };
}
