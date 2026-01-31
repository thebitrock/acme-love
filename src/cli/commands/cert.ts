import { confirm, input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  AcmeClient,
  AcmeAccount,
  createAcmeCsr,
  generateKeyPair,
  resolveAndValidateAcmeTxtAuthoritative,
  type AcmeCertificateAlgorithm,
  type AccountKeys,
  type AcmeOrder,
} from '../../index.js';
import { createSpinner, heading, kv, symbols, render } from '../logger.js';
import { parseAlgorithm, selectAdvancedOptions } from '../utils/algorithms.js';
import { resolveDirectoryUrl } from '../utils/directories.js';

/** Flags and options accepted by the certificate issuance command. */
export interface CertCommandOptions {
  domain?: string;
  email?: string;
  staging?: boolean;
  production?: boolean;
  directory?: string;
  output?: string;
  accountKey?: string;
  challenge?: string;
  accountAlgo?: string;
  certAlgo?: string;
  eabKid?: string;
  eabHmacKey?: string;
  force?: boolean;
}

/** Execute full certificate issuance flow for a single domain. */
export async function handleCertCommand(options: CertCommandOptions) {
  const domain = options.domain || (await input({ message: 'Domain name for certificate:' }));
  const email = options.email || (await input({ message: 'Contact email for ACME account:' }));

  let challengeType = options.challenge;
  if (!challengeType) {
    challengeType = await select({
      message: 'Select challenge type:',
      choices: [
        { name: 'DNS-01 (wildcard support)', value: 'dns-01' },
        { name: 'HTTP-01 (simple web server)', value: 'http-01' },
      ],
    });
  }

  // Algorithms
  let accountAlgo: AcmeCertificateAlgorithm,
    certAlgo: AcmeCertificateAlgorithm,
    separateAlgos: boolean;
  if (options.accountAlgo || options.certAlgo) {
    accountAlgo = parseAlgorithm(options.accountAlgo || 'ec-p256');
    certAlgo = parseAlgorithm(options.certAlgo || 'ec-p256');
    separateAlgos = options.accountAlgo !== options.certAlgo;
  } else {
    const algoConfig = await selectAdvancedOptions();
    accountAlgo = algoConfig.accountAlgo;
    certAlgo = algoConfig.certAlgo;
    separateAlgos = algoConfig.separateAlgos;
  }

  const directoryUrl = await resolveDirectoryUrl(options);
  const outputDir = options.output || './certificates';
  const accountKeyPath = options.accountKey || join(outputDir, 'account-key.json');
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(dirname(accountKeyPath), { recursive: true });

  heading('Configuration');
  kv('Domain', domain);
  kv('Email', email);
  kv('Challenge', challengeType);
  if (separateAlgos) {
    kv(
      'Account Algo',
      accountAlgo.kind === 'ec'
        ? `ECDSA ${accountAlgo.namedCurve}`
        : `RSA ${accountAlgo.modulusLength}`,
    );
    kv(
      'Cert Algo',
      certAlgo.kind === 'ec' ? `ECDSA ${certAlgo.namedCurve}` : `RSA ${certAlgo.modulusLength}`,
    );
  } else {
    kv(
      'Algorithm',
      accountAlgo.kind === 'ec'
        ? `ECDSA ${accountAlgo.namedCurve}`
        : `RSA ${accountAlgo.modulusLength}`,
    );
  }
  kv('Directory', directoryUrl);
  kv('Output Dir', outputDir);
  kv('Account Key', accountKeyPath);

  const client = new AcmeClient(directoryUrl, { nonce: { maxPool: 64 } });
  let accountKeys: AccountKeys;
  let kid: string | undefined;

  if (existsSync(accountKeyPath)) {
    console.log(symbols.info + ' Using existing account key');
    const accountData = JSON.parse(readFileSync(accountKeyPath, 'utf-8'));
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      accountData.privateKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign'],
    );
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      accountData.publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );
    accountKeys = { privateKey, publicKey };
    kid = accountData.kid;
  } else {
    console.log(symbols.info + ' Creating new ACME account...');
    const keyPair = await generateKeyPair(accountAlgo);
    if (!keyPair.privateKey || !keyPair.publicKey) throw new Error('Key generation failed');
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    accountKeys = { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey };
    writeFileSync(
      accountKeyPath,
      JSON.stringify({ privateKey: privateKeyJwk, publicKey: publicKeyJwk }, null, 2),
    );
  }

  const acct = new AcmeAccount(client, accountKeys, {
    ...(kid && { kid }),
    nonce: { maxPool: 64 },
    ...(options.eabKid &&
      options.eabHmacKey && {
        externalAccountBinding: {
          kid: options.eabKid,
          hmacKey: options.eabHmacKey,
        },
      }),
  });

  // Handle External Account Binding if needed
  if (options.eabKid && options.eabHmacKey) {
    console.log(symbols.info + ' Using External Account Binding');
  }
  // Register account if needed
  if (!kid) {
    const registered = await acct.register({
      contact: [`mailto:${email}`],
      termsOfServiceAgreed: true,
    });
    kid = registered.accountUrl;
    console.log(symbols.success + ' Account registered');
  } else {
    console.log(symbols.success + ' Account ready');
  }

  const spinOrder = createSpinner().start('Creating certificate order...');
  const order = await acct.createOrder([domain]);
  spinOrder.succeed('Order created');

  const ready = await solveChallenge(acct, order, challengeType as string);

  const spinCsr = createSpinner().start('Generating CSR');
  const { derBase64Url, keys: csrKeys } = await createAcmeCsr([domain], certAlgo);
  spinCsr.succeed('CSR generated');

  const spinFinalize = createSpinner().start('Finalizing order');
  const finalized = await acct.finalize(ready, derBase64Url);
  spinFinalize.succeed('Order finalized');

  const spinWait = createSpinner().start('Waiting for certificate issuance');
  const valid = await acct.waitOrder(finalized, ['valid']);
  spinWait.succeed('Certificate valid');

  const spinDownload = createSpinner().start('Downloading certificate');
  const certificate = await acct.downloadCertificate(valid);
  spinDownload.succeed('Certificate downloaded');

  if (!csrKeys.privateKey) throw new Error('Private key missing');
  const privateKeyDer = await crypto.subtle.exportKey('pkcs8', csrKeys.privateKey);
  const privateKeyPem = Buffer.from(privateKeyDer)
    .toString('base64')
    .match(/.{1,64}/g)
    ?.join('\n');
  if (!privateKeyPem) throw new Error('Failed to export key');
  const privateKeyPemString = `-----BEGIN PRIVATE KEY-----\n${privateKeyPem}\n-----END PRIVATE KEY-----`;

  // Save account KID if we just registered
  if (!options.accountKey && kid) {
    const accountData = JSON.parse(readFileSync(accountKeyPath, 'utf-8'));
    accountData.kid = kid;
    writeFileSync(accountKeyPath, JSON.stringify(accountData, null, 2));
  }

  const certPath = join(outputDir, `${domain}.crt`);
  const keyPath = join(outputDir, `${domain}.key`);
  writeFileSync(certPath, certificate);
  writeFileSync(keyPath, privateKeyPemString);

  heading('Success');
  kv('Certificate', certPath);
  kv('Private Key', keyPath);
}

/** Select appropriate challenge solver function. */
async function solveChallenge(
  acct: AcmeAccount,
  order: AcmeOrder,
  challengeType: string,
): Promise<AcmeOrder> {
  if (challengeType === 'dns-01') return solveDns01(acct, order);
  if (challengeType === 'http-01') return solveHttp01(acct, order);
  throw new Error(`Unsupported challenge type: ${challengeType}`);
}

/** Manual DNS-01 challenge solving with polling for TXT record propagation. */
async function solveDns01(acct: AcmeAccount, order: AcmeOrder): Promise<AcmeOrder> {
  const spin = createSpinner().start('Solving DNS-01 challenge');
  let settled = false; // tracks whether callbacks handled spinner success/fail
  const ready = await (async () => {
    try {
      return await acct.solveDns01(order, {
        waitFor: async (prep) => {
          heading('DNS TXT Record');
          kv('Name', prep.target);
          kv('Value (expected)', prep.value);
          const maxAttempts = 24;
          const delayMs = 5_000;
          const started = Date.now();
          let ok = false;
          let firstMetaPrinted = false;
          let lastValues: string[] = [];
          let lastReasons: string[] | undefined;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const attemptLabel = `Attempt ${attempt}/${maxAttempts}`;
            const elapsed = ((Date.now() - started) / 1000).toFixed(1);
            spin.start(`Verifying DNS (${attemptLabel}, ${elapsed}s elapsed)`);
            try {
              const result = await resolveAndValidateAcmeTxtAuthoritative(prep.target, prep.value);
              lastValues = result.allValues;
              lastReasons = result.reasons;
              // Print zone / NS info once (even if failing)
              if (!firstMetaPrinted) {
                heading('Authoritative DNS');
                if (result.zone) kv('Zone', result.zone);
                if (result.nsHosts?.length) kv('NS Hosts', result.nsHosts.join(', '));
                if (result.nsIPs?.length) kv('NS IPs', result.nsIPs.join(', '));
                firstMetaPrinted = true;
              }
              if (result.ok) {
                const totalElapsed = ((Date.now() - started) / 1000).toFixed(1);
                spin.succeed(`DNS record verified in ${totalElapsed}s`);
                ok = true;
                settled = true;
                break;
              }

              // Not yet OK — show reasons (if any) succinctly
              if (result.reasons?.length) {
                result.reasons.slice(0, 3).forEach((r) => render.warn(r));
                if (result.reasons.length > 3) {
                  render.dim(
                    `(+${result.reasons.length - 3} more reason(s) suppressed this attempt)`,
                  );
                }
              } else {
                render.dim('TXT not propagated yet');
              }
            } catch (e) {
              render.error('Lookup error: ' + (e instanceof Error ? e.message : String(e)));
            }

            if (attempt < maxAttempts) {
              await new Promise((res) => setTimeout(res, delayMs));
            }
          }

          if (!ok) {
            spin.fail('DNS verification failed');
            settled = true;
            // Provide diagnostics: elapsed time, last observed TXT values, reasons
            const elapsedTotal = ((Date.now() - started) / 1000).toFixed(1);
            heading('Diagnostics');
            kv('Elapsed', `${elapsedTotal}s`);
            if (lastValues.length) {
              kv('Observed TXT count', String(lastValues.length));
              render.line('  Values:');
              lastValues.slice(0, 10).forEach((v) => render.line('    - ' + chalk.white(v)));
              if (lastValues.length > 10) {
                render.dim(`(+) ${lastValues.length - 10} more suppressed`);
              }
            } else {
              render.dim('No TXT values observed');
            }
            if (lastReasons?.length) {
              render.line('  Reasons (last attempt):');
              lastReasons.slice(0, 10).forEach((r) => render.line('    - ' + chalk.yellow(r)));
              if (lastReasons.length > 10) {
                render.dim(`(+) ${lastReasons.length - 10} more reasons suppressed`);
              }
            }
            throw new Error('DNS record not verified');
          }
        },
        setDns: async (prep) => {
          heading('Add DNS TXT Record');
          kv('Name', prep.target);
          kv('Value', prep.value);
          // Stop spinner so the prompt is visible
          try {
            spin.stop();
          } catch {
            // ignore spinner stop errors
          }
          process.stdout.write('\n');
          const proceed = await (async () => {
            // Fallback for non-interactive environments (e.g. CI or piped execution)
            if (!process.stdin.isTTY || !process.stdout.isTTY) {
              console.log(
                'Non-interactive terminal: auto-answering NO for propagation confirmation.',
              );
              return false;
            }
            return confirm({
              message: chalk.bold('Record added & propagated?'),
              default: true,
            });
          })();
          if (!proceed) {
            console.log('User indicated record not ready yet. Aborting.');
            throw new Error('Cancelled by user');
          }
        },
      });
    } catch (e) {
      if (!settled) spin.fail('DNS-01 challenge failed');
      throw e;
    }
  })();
  if (!settled) {
    // Challenge likely already valid (cached auth) — settle spinner
    spin.succeed('DNS-01 challenge already valid');
  }
  return ready;
}

/** Manual HTTP-01 challenge solving with repeated HTTP validation attempts. */
async function solveHttp01(acct: AcmeAccount, order: AcmeOrder): Promise<AcmeOrder> {
  const spin = createSpinner().start('Solving HTTP-01 challenge');
  const ready = await acct.solveHttp01(order, {
    setHttp: async (prep) => {
      console.log('\nHTTP Challenge:');
      console.log(`  URL: ${prep.target}`);
      console.log(`  Content: ${prep.value}`);
      const proceed = await confirm({ message: 'HTTP challenge file deployed?', default: false });
      if (!proceed) throw new Error('Cancelled by user');
    },
    waitFor: async (prep) => {
      const { validateHttp01ChallengeByUrl } =
        await import('../../lib/challenges/http-validator.js');
      const maxAttempts = 12;
      const delayMs = 5000;
      let ok = false;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`Checking HTTP (${attempt}/${maxAttempts})...`);
        try {
          const result = await validateHttp01ChallengeByUrl(prep.target, prep.value, {
            timeoutMs: 4000,
            followRedirects: true,
          });
          if (result.ok) {
            spin.succeed('HTTP challenge verified');
            ok = true;
            break;
          } else console.log('Not yet: ', result.reasons?.join('; '));
        } catch (e) {
          console.log('Error verifying HTTP:', e instanceof Error ? e.message : e);
        }
        if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delayMs));
      }
      if (!ok) {
        spin.fail('HTTP verification failed');
        throw new Error('HTTP challenge not verified');
      }
    },
  });
  return ready;
}
