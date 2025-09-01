import { confirm, select } from '@inquirer/prompts';
import type { AcmeCertificateAlgorithm } from '../../index.js';

/**
 * Prompt the user to select a cryptographic algorithm.
 * @param purpose Whether the key is for the ACME account or the end certificate.
 */
export async function selectAlgorithm(
  purpose: 'account' | 'certificate',
): Promise<AcmeCertificateAlgorithm> {
  const purposeText = purpose === 'account' ? 'account keys' : 'certificate keys';
  const algoType = await select({
    message: `Select cryptographic algorithm for ${purposeText}:`,
    choices: [
      { name: 'ECDSA P-256 (recommended)', value: 'ec-p256' },
      { name: 'ECDSA P-384', value: 'ec-p384' },
      { name: 'ECDSA P-521', value: 'ec-p521' },
      { name: 'RSA 2048 (legacy minimum)', value: 'rsa-2048' },
      { name: 'RSA 3072', value: 'rsa-3072' },
      { name: 'RSA 4096', value: 'rsa-4096' },
    ],
  });
  return parseAlgorithm(algoType);
}

/**
 * Optionally ask the user to configure separate algorithms for account & certificate.
 * Returns defaults when advanced mode is declined.
 */
export async function selectAdvancedOptions(): Promise<{
  accountAlgo: AcmeCertificateAlgorithm;
  certAlgo: AcmeCertificateAlgorithm;
  separateAlgos: boolean;
}> {
  const useAdvanced = await confirm({
    message: 'Configure cryptographic algorithms? (default: P-256 ECDSA for both)',
    default: false,
  });
  if (!useAdvanced) {
    const defaultAlgo: AcmeCertificateAlgorithm = {
      kind: 'ec',
      namedCurve: 'P-256',
      hash: 'SHA-256',
    };
    return { accountAlgo: defaultAlgo, certAlgo: defaultAlgo, separateAlgos: false };
  }
  const separateAlgos = await confirm({
    message: 'Use different algorithms for account and certificate keys?',
    default: false,
  });
  if (separateAlgos) {
    const accountAlgo = await selectAlgorithm('account');
    const certAlgo = await selectAlgorithm('certificate');
    return { accountAlgo, certAlgo, separateAlgos: true };
  } else {
    const algo = await selectAlgorithm('account');
    return { accountAlgo: algo, certAlgo: algo, separateAlgos: false };
  }
}

/** Parse a short algorithm code (e.g. ec-p256) into a CSR algorithm descriptor. */
export function parseAlgorithm(algoStr: string): AcmeCertificateAlgorithm {
  switch (algoStr) {
    case 'ec-p256':
      return { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
    case 'ec-p384':
      return { kind: 'ec', namedCurve: 'P-384', hash: 'SHA-384' };
    case 'ec-p521':
      return { kind: 'ec', namedCurve: 'P-521', hash: 'SHA-512' };
    case 'rsa-2048':
      return { kind: 'rsa', modulusLength: 2048, hash: 'SHA-256' };
    case 'rsa-3072':
      return { kind: 'rsa', modulusLength: 3072, hash: 'SHA-256' };
    case 'rsa-4096':
      return { kind: 'rsa', modulusLength: 4096, hash: 'SHA-384' };
    default:
      throw new Error(`Unknown algorithm: ${algoStr}`);
  }
}
