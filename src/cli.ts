#!/usr/bin/env node

import { program } from 'commander';
import { select, input, confirm } from '@inquirer/prompts';
import {
  AcmeClientCore,
  AcmeAccountSession,
  directory,
  createAcmeCsr,
  generateKeyPair,
  resolveAndValidateAcmeTxtAuthoritative,
  ServerMaintenanceError,
  type CsrAlgo,
  type AccountKeys,
  type ACMEOrder,
} from './index.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Interface for CLI command options
interface CliOptions {
  domain?: string;
  output?: string;
  accountKey?: string;
  accountAlgo?: string;
  certAlgo?: string;
  eabKid?: string;
  eabHmacKey?: string;
  directory?: string;
  email?: string;
  interactive?: boolean;
  file?: string;
  json?: boolean;
  dryRun?: boolean;
  challenge?: string;
  staging?: boolean;
  production?: boolean;
  cert?: string;
  algo?: string;
}

interface CreateAccountOptions {
  accountAlgo?: string;
  output?: string;
  directory?: string;
  email?: string;
  eabKid?: string;
  eabHmacKey?: string;
  algo?: string;
}

interface StatusOptions {
  accountKey?: string;
  directory?: string;
  json?: boolean;
  cert?: string;
  domain?: string;
  staging?: boolean;
  production?: boolean;
}

// Helper functions for algorithm selection
async function selectAlgorithm(purpose: 'account' | 'certificate'): Promise<CsrAlgo> {
  const purposeText = purpose === 'account' ? 'account keys' : 'certificate keys';

  const algoType = await select({
    message: `Select cryptographic algorithm for ${purposeText}:`,
    choices: [
      { name: '🚀 ECDSA P-256 (recommended - fast, secure, widely supported)', value: 'ec-p256' },
      { name: '🔒 ECDSA P-384 (enhanced security, larger keys)', value: 'ec-p384' },
      { name: '🛡️ ECDSA P-521 (maximum security, largest keys)', value: 'ec-p521' },
      { name: '🔧 RSA 2048 (legacy compatibility, minimum size)', value: 'rsa-2048' },
      { name: '⚡ RSA 3072 (enhanced security, balanced performance)', value: 'rsa-3072' },
      { name: '🏰 RSA 4096 (maximum security, slower performance)', value: 'rsa-4096' },
    ],
  });

  switch (algoType) {
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
      return { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
  }
}

async function selectAdvancedOptions(): Promise<{
  accountAlgo: CsrAlgo;
  certAlgo: CsrAlgo;
  separateAlgos: boolean;
}> {
  const useAdvanced = await confirm({
    message: 'Configure cryptographic algorithms? (default: P-256 ECDSA for both)',
    default: false,
  });

  if (!useAdvanced) {
    const defaultAlgo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
    return {
      accountAlgo: defaultAlgo,
      certAlgo: defaultAlgo,
      separateAlgos: false,
    };
  }

  const separateAlgos = await confirm({
    message: 'Use different algorithms for account and certificate keys?',
    default: false,
  });

  if (separateAlgos) {
    console.log('\n📋 Account keys are used for ACME protocol authentication');
    const accountAlgo = await selectAlgorithm('account');

    console.log('\n📋 Certificate keys are embedded in the final TLS certificate');
    const certAlgo = await selectAlgorithm('certificate');

    return { accountAlgo, certAlgo, separateAlgos: true };
  } else {
    console.log('\n📋 Same algorithm will be used for both account and certificate keys');
    const algo = await selectAlgorithm('account');
    return { accountAlgo: algo, certAlgo: algo, separateAlgos: false };
  }
}

function parseAlgorithm(algoStr: string): CsrAlgo {
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
      throw new Error(
        `Unknown algorithm: ${algoStr}. Supported: ec-p256, ec-p384, ec-p521, rsa-2048, rsa-3072, rsa-4096`,
      );
  }
}

// Build directory choices from exported directory namespace (handles legacy namespace export shape)
function buildDirectoryChoices() {
  // The namespace export is: { directory: { provider: { env: {...} } }, letsencrypt: {...legacy...} }
  const root: Record<string, unknown> = Object.assign(
    {},
    (directory as Record<string, unknown>).directory ?? (directory as Record<string, unknown>),
  ); // Prefer nested 'directory' key if present
  const choices: { name: string; value: string }[] = [];
  for (const [providerKey, providerData] of Object.entries(root)) {
    if (!providerData || typeof providerData !== 'object') continue;
    for (const [envKey, info] of Object.entries(providerData as Record<string, unknown>)) {
      if (!info || typeof info !== 'object') continue;
      const infoObj = info as Record<string, unknown>;
      const url = infoObj.directoryUrl;
      if (typeof url !== 'string') continue; // skip non-env entries
      const displayName =
        typeof infoObj.name === 'string' ? infoObj.name : `${providerKey} ${envKey}`;
      choices.push({ name: `${displayName} (${providerKey}/${envKey})`, value: url });
    }
  }
  choices.sort((a, b) => a.name.localeCompare(b.name));
  return choices;
}

// Load package.json version - go up 2 levels from dist/src/
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));

/**
 * Enhanced error handler for ACME errors
 */
function handleError(error: unknown): void {
  if (error instanceof ServerMaintenanceError) {
    console.error('\n🔧 Service Maintenance');
    console.error('═══════════════════════');
    console.error('❌ The ACME server is currently under maintenance.');
    console.error('📊 Check service status at: https://letsencrypt.status.io/');
    console.error('⏳ Please try again later when the service is restored.');
    console.error(`\n💬 Server message: ${error.detail}`);
  } else if (error instanceof Error) {
    // Check if it's a maintenance-related error by message content
    const message = error.message.toLowerCase();
    if (
      message.includes('maintenance') ||
      message.includes('service is down') ||
      message.includes('letsencrypt.status.io') ||
      message.includes('http 503')
    ) {
      console.error('\n🔧 Service Maintenance');
      console.error('═══════════════════════');
      console.error('❌ The ACME server appears to be under maintenance.');
      console.error('📊 Check service status at: https://letsencrypt.status.io/');
      console.error('⏳ Please try again later when the service is restored.');
      console.error(`\n💬 Error details: ${error.message}`);
    } else {
      console.error('Error:', error.message);
    }
  } else {
    console.error('Error:', error);
  }
}

program
  .name('acme-love')
  .description('CLI for ACME certificate management')
  .version(packageJson.version);

// Command to obtain certificates
program
  .command('cert')
  .description('Obtain SSL certificate using ACME protocol')
  .option('-d, --domain <domain>', 'Domain name for certificate')
  .option('-e, --email <email>', 'Email for ACME account registration')
  .option('--staging', "Use Let's Encrypt staging environment")
  .option('--production', "Use Let's Encrypt production environment")
  .option('--directory <url>', 'Custom ACME directory URL')
  .option('-o, --output <path>', 'Output directory for certificates', './certificates')
  .option('--account-key <path>', 'Path to account private key')
  .option('--force', 'Force certificate renewal even if valid')
  .option('--challenge <type>', 'Challenge type: dns-01 or http-01', 'dns-01')
  .option(
    '--account-algo <algo>',
    'Account key algorithm: ec-p256, ec-p384, ec-p521, rsa-2048, rsa-3072, rsa-4096',
    'ec-p256',
  )
  .option(
    '--cert-algo <algo>',
    'Certificate key algorithm: ec-p256, ec-p384, ec-p521, rsa-2048, rsa-3072, rsa-4096',
    'ec-p256',
  )
  .option('--eab-kid <kid>', 'External Account Binding key identifier')
  .option('--eab-hmac-key <key>', 'External Account Binding HMAC key (base64url)')
  .action(async (options: CliOptions) => {
    try {
      await handleCertCommand(options);
    } catch (error) {
      handleError(error);
      process.exit(1);
    }
  });

// Command to create account key
program
  .command('create-account-key')
  .description('Create new ACME account private key')
  .option('-o, --output <path>', 'Output path for account key', './account-key.json')
  .option(
    '--algo <algo>',
    'Key algorithm: ec-p256, ec-p384, ec-p521, rsa-2048, rsa-3072, rsa-4096',
    'ec-p256',
  )
  .action(async (options: CreateAccountOptions) => {
    try {
      await handleCreateAccountKey(options);
    } catch (error) {
      handleError(error);
      process.exit(1);
    }
  });

// Command to check certificate status
program
  .command('status')
  .description('Check certificate status')
  .option('-d, --domain <domain>', 'Domain to check')
  .option('-c, --cert <path>', 'Path to certificate file')
  .action(async (options: StatusOptions) => {
    try {
      await handleStatusCommand(options);
    } catch (error) {
      handleError(error);
      process.exit(1);
    }
  });

// Interactive command
program
  .command('interactive')
  .alias('i')
  .description('Interactive mode for certificate management')
  .option('--staging', "Use Let's Encrypt staging environment")
  .option('--production', "Use Let's Encrypt production environment")
  .option('--directory <url>', 'Custom ACME directory URL')
  .action(async (options: CliOptions) => {
    try {
      await handleInteractiveMode(options);
    } catch (error) {
      handleError(error);
      process.exit(1);
    }
  });

async function handleCertCommand(options: CliOptions) {
  console.log('🔐 ACME-Love Certificate Manager\n');

  // Get parameters
  const domain = options.domain || (await input({ message: 'Enter domain name:' }));
  const email = options.email || (await input({ message: 'Enter email for ACME account:' }));

  // Get challenge type
  let challengeType: string;
  if (options.challenge && ['dns-01', 'http-01'].includes(options.challenge)) {
    challengeType = options.challenge;
  } else {
    challengeType = await select({
      message: 'Select challenge type:',
      choices: [
        { name: 'DNS-01 (recommended, works with wildcard certificates)', value: 'dns-01' },
        { name: 'HTTP-01 (requires domain to point to accessible web server)', value: 'http-01' },
      ],
    });
  }

  // Get cryptographic algorithms
  let accountAlgo: CsrAlgo, certAlgo: CsrAlgo, separateAlgos: boolean;

  if (options.accountAlgo || options.certAlgo) {
    // Use command line specified algorithms
    accountAlgo = parseAlgorithm(options.accountAlgo || 'ec-p256');
    certAlgo = parseAlgorithm(options.certAlgo || 'ec-p256');
    separateAlgos = options.accountAlgo !== options.certAlgo;
  } else {
    // Interactive algorithm selection
    const algoConfig = await selectAdvancedOptions();
    accountAlgo = algoConfig.accountAlgo;
    certAlgo = algoConfig.certAlgo;
    separateAlgos = algoConfig.separateAlgos;
  }

  let directoryUrl: string;
  if (options.staging) {
    directoryUrl = directory.letsencrypt.staging.directoryUrl;
  } else if (options.production) {
    directoryUrl = directory.letsencrypt.production.directoryUrl;
  } else if (options.directory) {
    directoryUrl = options.directory;
  } else {
    // Build dynamic choices from directory object
    const directoryChoices = buildDirectoryChoices();
    const envChoice = await select({
      message: 'Select ACME directory:',
      choices: [...directoryChoices, { name: '🔧 Custom ACME Directory URL', value: 'custom' }],
    });

    if (envChoice === 'custom') {
      directoryUrl = await input({ message: 'Enter custom ACME directory URL:' });
    } else {
      directoryUrl = envChoice; // selected is the URL
    }
  }

  const outputDir = options.output || './certificates';
  const accountKeyPath = options.accountKey || join(outputDir, 'account-key.json');

  // Create directories
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(dirname(accountKeyPath), { recursive: true });

  console.log(`\n📋 Configuration:`);
  console.log(`   Domain: ${domain}`);
  console.log(`   Email: ${email}`);
  console.log(`   Challenge Type: ${challengeType}`);
  if (separateAlgos) {
    console.log(
      `   Account Algorithm: ${accountAlgo.kind === 'ec' ? `ECDSA ${accountAlgo.namedCurve}` : `RSA ${accountAlgo.modulusLength}`}`,
    );
    console.log(
      `   Certificate Algorithm: ${certAlgo.kind === 'ec' ? `ECDSA ${certAlgo.namedCurve}` : `RSA ${certAlgo.modulusLength}`}`,
    );
  } else {
    console.log(
      `   Algorithm: ${accountAlgo.kind === 'ec' ? `ECDSA ${accountAlgo.namedCurve}` : `RSA ${accountAlgo.modulusLength}`}`,
    );
  }
  console.log(`   Directory: ${directoryUrl}`);
  console.log(`   Output: ${outputDir}`);
  console.log(`   Account Key: ${accountKeyPath}\n`);

  // Create ACME client core
  const core = new AcmeClientCore(directoryUrl, {
    nonce: { maxPool: 64 },
  });

  // Load or create account keys
  let accountKeys: AccountKeys;
  let kid: string | undefined;

  if (existsSync(accountKeyPath)) {
    console.log('🔑 Using existing account key');
    const accountData = JSON.parse(readFileSync(accountKeyPath, 'utf-8'));

    // Restore key from JWK
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
    console.log('🔑 Creating new ACME account...');
    // Generate new account key
    const keyPair = await generateKeyPair(accountAlgo);

    if (!keyPair.privateKey || !keyPair.publicKey) {
      throw new Error('Key generation failed');
    }

    accountKeys = {
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
    };

    // Export keys to JWK format for saving
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

    const accountData = {
      privateKey: privateKeyJwk,
      publicKey: publicKeyJwk,
    };

    writeFileSync(accountKeyPath, JSON.stringify(accountData, null, 2));
  }

  // Create account session
  const sessionOptions = {
    nonceOverrides: {
      maxPool: 64,
    },
    ...(kid && { kid }),
  };

  const acct = new AcmeAccountSession(core, accountKeys, sessionOptions);

  // Prepare EAB if provided
  let eab: { kid: string; hmacKey: string } | undefined = undefined;
  if (options.eabKid && options.eabHmacKey) {
    eab = { kid: options.eabKid, hmacKey: options.eabHmacKey };
    console.log('🔐 Using External Account Binding');
  }

  // Register account if needed
  const registeredKid = await acct.ensureRegistered(
    {
      contact: [`mailto:${email}`],
      termsOfServiceAgreed: true,
    },
    eab,
  );

  console.log('✅ Account ready');

  // Create order and solve challenge
  console.log('📝 Creating certificate order...');
  const order = await acct.newOrder([domain]);

  let ready: ACMEOrder;

  if (challengeType === 'dns-01') {
    console.log('🔍 Solving DNS-01 challenge...');
    ready = await acct.solveDns01(order, {
      waitFor: async (preparation) => {
        console.log(`\n📌 DNS Challenge Information:`);
        console.log(`   Record Type: TXT`);
        console.log(`   Record Name: ${preparation.target}`);
        console.log(`   Record Value: ${preparation.value}`);
        console.log(
          `\n⚠️  Please add this DNS TXT record and wait for propagation before continuing.`,
        );

        const maxAttempts = 24;
        const delayMs = 5_000;
        let dnsVerified = false;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          console.log(`🔎 Verifying DNS record (attempt ${attempt}/${maxAttempts})...`);
          try {
            const result = await resolveAndValidateAcmeTxtAuthoritative(
              preparation.target,
              preparation.value,
            );
            if (result.ok) {
              console.log('✅ DNS record verified successfully');
              dnsVerified = true;
              break;
            } else {
              console.log(
                '❌ DNS record not verified yet:',
                result.reasons ? result.reasons.join('; ') : 'Unknown reasons',
              );
            }
          } catch (e) {
            console.log('⚠️  DNS verification error:', e instanceof Error ? e.message : e);
          }

          if (attempt < maxAttempts) {
            console.log(`⏳ Waiting ${delayMs / 1000}s before next attempt...`);
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }

        if (!dnsVerified) {
          throw new Error('DNS record could not be verified after multiple attempts. Aborting.');
        }
        console.log(`✅ DNS record found: ${preparation.target} -> ${preparation.value}`);
      },
      setDns: async (preparation) => {
        console.log(`\n📌 DNS Challenge Information:`);
        console.log(`   Record Type: TXT`);
        console.log(`   Record Name: ${preparation.target}`);
        console.log(`   Record Value: ${preparation.value}`);
        console.log(
          `\n⚠️  Please add this DNS TXT record and wait for propagation before continuing.`,
        );

        const proceed = await confirm({
          message: 'Have you added the DNS record and confirmed it has propagated?',
          default: false,
        });

        if (!proceed) {
          console.log('❌ Certificate issuance cancelled');
          throw new Error('Certificate issuance cancelled by user');
        }
      },
    });
  } else if (challengeType === 'http-01') {
    console.log('🔍 Solving HTTP-01 challenge...');
    ready = await acct.solveHttp01(order, {
      setHttp: async (preparation) => {
        console.log(`\n📌 HTTP Challenge Information:`);
        console.log(`   Challenge URL: ${preparation.target}`);
        console.log(`   Expected Content: ${preparation.value}`);
        console.log(
          `\n⚠️  Please ensure your web server serves the challenge content at the URL above.`,
        );
        console.log(`   The content should be exactly: ${preparation.value}`);
        console.log(`   Make sure the URL is accessible via HTTP (not HTTPS) from the internet.`);

        const proceed = await confirm({
          message: "Have you set up the HTTP challenge file and confirmed it's accessible?",
          default: false,
        });

        if (!proceed) {
          console.log('❌ Certificate issuance cancelled');
          throw new Error('Certificate issuance cancelled by user');
        }
      },
      waitFor: async (preparation) => {
        console.log(`\n🔍 Verifying HTTP challenge at ${preparation.target}...`);

        // Import the HTTP validator
        const { validateHttp01ChallengeByUrl } = await import('./acme/validator/http-validator.js');

        const maxAttempts = 12;
        const delayMs = 5_000;
        let httpVerified = false;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          console.log(`🔎 Verifying HTTP challenge (attempt ${attempt}/${maxAttempts})...`);
          try {
            const result = await validateHttp01ChallengeByUrl(
              preparation.target,
              preparation.value,
              {
                timeoutMs: 4000,
                followRedirects: true,
              },
            );

            if (result.ok) {
              console.log('✅ HTTP challenge verified successfully');
              httpVerified = true;
              break;
            } else {
              console.log(
                '❌ HTTP challenge not verified yet:',
                result.reasons ? result.reasons.join('; ') : 'Unknown error',
              );
            }
          } catch (e) {
            console.log('⚠️  HTTP verification error:', e instanceof Error ? e.message : e);
          }

          if (attempt < maxAttempts) {
            console.log(`⏳ Waiting ${delayMs / 1000}s before next attempt...`);
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }

        if (!httpVerified) {
          throw new Error(
            'HTTP challenge could not be verified after multiple attempts. Aborting.',
          );
        }
        console.log(`✅ HTTP challenge verified: ${preparation.target} -> ${preparation.value}`);
      },
    });
  } else {
    throw new Error(`Unsupported challenge type: ${challengeType}`);
  }

  // Create CSR and finalize
  console.log('📄 Generating Certificate Signing Request...');
  const { derBase64Url, keys: csrKeys } = await createAcmeCsr([domain], certAlgo);

  console.log('🏁 Finalizing certificate order...');
  const finalized = await acct.finalize(ready, derBase64Url);

  console.log('⏳ Waiting for certificate...');
  const valid = await acct.waitOrder(finalized.url, ['valid']);

  console.log('📜 Downloading certificate...');
  const certificate = await acct.downloadCertificate(valid);

  // Export certificate private key to PEM format
  if (!csrKeys.privateKey) {
    throw new Error('Private key is missing from CSR keys');
  }
  const privateKeyPem = await crypto.subtle.exportKey('pkcs8', csrKeys.privateKey);

  const base64Parts = Buffer.from(privateKeyPem)
    .toString('base64')
    .match(/.{1,64}/g);
  if (!base64Parts) {
    throw new Error('Failed to format private key');
  }

  const privateKeyPemString = `-----BEGIN PRIVATE KEY-----\n${base64Parts.join('\n')}\n-----END PRIVATE KEY-----`;

  // Save kid if we got one during registration
  if (registeredKid && !kid) {
    const accountData = JSON.parse(readFileSync(accountKeyPath, 'utf-8'));
    accountData.kid = registeredKid;
    writeFileSync(accountKeyPath, JSON.stringify(accountData, null, 2));
  }

  // Save files
  const certPath = join(outputDir, `${domain}.crt`);
  const keyPath = join(outputDir, `${domain}.key`);

  writeFileSync(certPath, certificate);
  writeFileSync(keyPath, privateKeyPemString);

  console.log(`\n🎉 Certificate successfully obtained!`);
  console.log(`   Certificate: ${certPath}`);
  console.log(`   Private Key: ${keyPath}`);
}

async function handleCreateAccountKey(options: CreateAccountOptions) {
  console.log('🔑 Creating ACME account key...\n');

  const outputPath = options.output || './account-key.json';

  if (existsSync(outputPath)) {
    const overwrite = await confirm({
      message: `Account key already exists at ${outputPath}. Overwrite?`,
      default: false,
    });

    if (!overwrite) {
      console.log('❌ Operation cancelled');
      return;
    }
  }

  // Create directory if needed
  mkdirSync(dirname(outputPath), { recursive: true });

  // Select algorithm for account key
  let algo: CsrAlgo;
  if (options.algo) {
    algo = parseAlgorithm(options.algo);
  } else {
    console.log('📋 Account keys are used for ACME protocol authentication');
    algo = await selectAlgorithm('account');
  }

  console.log(
    `\n🔑 Generating ${algo.kind === 'ec' ? `ECDSA ${algo.namedCurve}` : `RSA ${algo.modulusLength}`} key pair...`,
  );
  const keyPair = await generateKeyPair(algo);

  if (!keyPair.privateKey || !keyPair.publicKey) {
    throw new Error('Key generation failed');
  }

  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

  const accountData = {
    privateKey: privateKeyJwk,
    publicKey: publicKeyJwk,
  };

  writeFileSync(outputPath, JSON.stringify(accountData, null, 2));
  console.log(`✅ Account key created: ${outputPath}`);
}

async function handleStatusCommand(options: StatusOptions) {
  console.log('📊 Certificate Status Check\n');

  if (options.cert) {
    // Check local certificate
    if (!existsSync(options.cert)) {
      console.log(`❌ Certificate file not found: ${options.cert}`);
      return;
    }

    console.log(`📄 Certificate file: ${options.cert}`);
    console.log('ℹ️  Certificate parsing not implemented yet');
  }

  if (options.domain) {
    console.log(`🌐 Checking domain: ${options.domain}`);
    console.log('ℹ️  Domain SSL check not implemented yet');
  }
}

async function handleInteractiveMode(options: CliOptions = {}) {
  console.log('🎮 ACME-Love Interactive Mode\n');

  // If no environment is specified, ask user to choose
  if (!options.staging && !options.production && !options.directory) {
    const directoryChoices = buildDirectoryChoices();
    const envChoice = await select({
      message: 'Select ACME directory:',
      choices: [...directoryChoices, { name: '🔧 Custom ACME Directory URL', value: 'custom' }],
    });

    if (envChoice === 'custom') {
      options.directory = await input({ message: 'Enter custom ACME directory URL:' });
    } else {
      options.directory = envChoice; // store selected URL directly
    }
  }

  // Display environment info
  if (options.staging) {
    console.log("🧪 Using Let's Encrypt Staging Environment");
  } else if (options.production) {
    console.log("🏭 Using Let's Encrypt Production Environment");
  } else if (options.directory) {
    // Try to resolve a friendly name
    let friendlyName: string | undefined;
    const root: Record<string, unknown> = Object.assign(
      {},
      (directory as Record<string, unknown>).directory ?? (directory as Record<string, unknown>),
    );
    outer: for (const providerData of Object.values(root)) {
      if (typeof providerData !== 'object' || !providerData) continue;
      for (const envData of Object.values(providerData as Record<string, unknown>)) {
        if (
          envData &&
          typeof envData === 'object' &&
          (envData as Record<string, unknown>).directoryUrl === options.directory
        ) {
          friendlyName = (envData as Record<string, unknown>).name as string | undefined;
          break outer;
        }
      }
    }
    if (friendlyName) {
      console.log(`🏦 Using Directory: ${friendlyName}`);
    } else {
      console.log(`🔧 Using Custom Directory: ${options.directory}`);
    }
  }

  const action = await select({
    message: 'What would you like to do?',
    choices: [
      { name: '📜 Obtain SSL Certificate', value: 'cert' },
      { name: '🔑 Create Account Key', value: 'account-key' },
      { name: '📊 Check Certificate Status', value: 'status' },
      { name: '❌ Exit', value: 'exit' },
    ],
  });

  switch (action) {
    case 'cert':
      await handleCertCommand(options);
      break;
    case 'account-key':
      await handleCreateAccountKey({});
      break;
    case 'status':
      await handleStatusCommand({});
      break;
    case 'exit':
      console.log('👋 Goodbye!');
      break;
  }
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Run the program
program.parse();
