import { Crypto, CryptoKey } from '@peculiar/webcrypto';
import {
  cryptoProvider,
  Pkcs10CertificateRequestGenerator,
  SubjectAlternativeNameExtension,
  type Pkcs10CertificateRequestCreateParamsName,
} from '@peculiar/x509';

// Use Node's global WebCrypto if available, otherwise fall back to @peculiar/webcrypto
const provider: Crypto =
  globalThis.crypto && 'subtle' in globalThis.crypto ? (globalThis.crypto as Crypto) : new Crypto();

// Bind WebCrypto provider for @peculiar/x509
cryptoProvider.set(provider);

// ---------- Types ----------
export type EcAlgo = {
  kind: 'ec';
  /** P-256 is a good default for ACME */
  namedCurve: 'P-256' | 'P-384' | 'P-521';
  /** Hash must be compatible with the curve; SHA-256 is typical for P-256 */
  hash: 'SHA-256' | 'SHA-384' | 'SHA-512';
};

export type RsaAlgo = {
  kind: 'rsa';
  /** 2048 is the minimum; 3072/4096 if you prefer */
  modulusLength: 2048 | 3072 | 4096;
  /** RSASSA-PKCS1-v1_5 + SHA-256 is typical for ACME */
  hash: 'SHA-256' | 'SHA-384' | 'SHA-512';
};

export type CsrAlgo = EcAlgo | RsaAlgo;

/**
 * Minimal CryptoKeyPair type for environments that don't include the DOM lib.
 * Matches the standard WebCrypto shape: a publicKey and an optional privateKey.
 */
export interface CryptoKeyPair {
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
  keys: CryptoKeyPair;
}

export async function generateKeyPair(algo: CsrAlgo): Promise<CryptoKeyPair> {
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
  algo: CsrAlgo,
  commonName: string = dnsNames[0],
  keys?: CryptoKeyPair,
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
