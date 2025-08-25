#!/usr/bin/env node

import { program } from 'commander';
import { select, input, confirm } from '@inquirer/prompts';
import { ACMEClient } from './acme/client/acme-client.js';
import { directory } from './directory.js';
import { createAcmeCsr, generateKeyPair } from './acme/csr.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ACMEAccount } from './acme/types/account.js';
import type { ACMEOrder, ACMEChallenge, ACMEAuthorization } from './acme/types/order.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load package.json version - go up 2 levels from dist/src/
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));

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
  .option('--staging', 'Use Let\'s Encrypt staging environment')
  .option('--production', 'Use Let\'s Encrypt production environment')
  .option('--directory <url>', 'Custom ACME directory URL')
  .option('-o, --output <path>', 'Output directory for certificates', './certificates')
  .option('--account-key <path>', 'Path to account private key')
  .option('--force', 'Force certificate renewal even if valid')
  .action(async (options: any) => {
    try {
      await handleCertCommand(options);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Command to create account key
program
  .command('create-account-key')
  .description('Create new ACME account private key')
  .option('-o, --output <path>', 'Output path for account key', './account-key.json')
  .action(async (options: any) => {
    try {
      await handleCreateAccountKey(options);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Command to check certificate status
program
  .command('status')
  .description('Check certificate status')
  .option('-d, --domain <domain>', 'Domain to check')
  .option('-c, --cert <path>', 'Path to certificate file')
  .action(async (options: any) => {
    try {
      await handleStatusCommand(options);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Interactive command
program
  .command('interactive')
  .alias('i')
  .description('Interactive mode for certificate management')
  .action(async () => {
    try {
      await handleInteractiveMode();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

async function handleCertCommand(options: any) {
  console.log('🔐 ACME-Love Certificate Manager\n');

  // Get parameters
  const domain = options.domain || await input({ message: 'Enter domain name:' });
  const email = options.email || await input({ message: 'Enter email for ACME account:' });

  let directoryUrl: string;
  if (options.staging) {
    directoryUrl = directory.letsencrypt.staging.directoryUrl;
  } else if (options.production) {
    directoryUrl = directory.letsencrypt.production.directoryUrl;
  } else if (options.directory) {
    directoryUrl = options.directory;
  } else {
    const envChoice = await select({
      message: 'Select ACME directory:',
      choices: [
        { name: 'Let\'s Encrypt Staging (recommended for testing)', value: 'staging' },
        { name: 'Let\'s Encrypt Production', value: 'production' },
        { name: 'Custom URL', value: 'custom' }
      ]
    });

    if (envChoice === 'staging') {
      directoryUrl = directory.letsencrypt.staging.directoryUrl;
    } else if (envChoice === 'production') {
      directoryUrl = directory.letsencrypt.production.directoryUrl;
    } else {
      directoryUrl = await input({ message: 'Enter custom ACME directory URL:' });
    }
  }

  const outputDir = options.output;
  const accountKeyPath = options.accountKey || join(outputDir, 'account-key.json');

  // Create directories
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(dirname(accountKeyPath), { recursive: true });

  console.log(`\n📋 Configuration:`);
  console.log(`   Domain: ${domain}`);
  console.log(`   Email: ${email}`);
  console.log(`   Directory: ${directoryUrl}`);
  console.log(`   Output: ${outputDir}`);
  console.log(`   Account Key: ${accountKeyPath}\n`);

  // Create ACME client
  const client = new ACMEClient(directoryUrl);

  // Load or create account
  let account: ACMEAccount;
  if (existsSync(accountKeyPath)) {
    console.log('🔑 Using existing account key');
    const accountData = JSON.parse(readFileSync(accountKeyPath, 'utf-8'));
    // Restore key from JWK
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      accountData.privateKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    );
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      accountData.publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    );
    account = { privateKey, publicKey, keyId: accountData.keyId };
  } else {
    console.log('🔑 Creating new ACME account...');
    // Generate new account key
    const keyPair = await generateKeyPair({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });

    // Export keys to JWK format for saving
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey!);
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

    account = {
      privateKey: keyPair.privateKey!,
      publicKey: keyPair.publicKey
    };

    const accountData = {
      privateKey: privateKeyJwk,
      publicKey: publicKeyJwk
    };

    writeFileSync(accountKeyPath, JSON.stringify(accountData, null, 2));
  }

  client.setAccount(account);

  // Register account if needed
  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [`mailto:${email}`]
  });

  console.log('✅ Account ready');

  // Create order
  console.log('📝 Creating certificate order...');
  const order = await client.createOrder([{ type: 'dns', value: domain }]);

  // Get authorizations
  console.log('🔍 Getting authorizations...');
  const authPromises = order.authorizations.map(url => client.fetchResource<ACMEAuthorization>(url));
  const authorizations = await Promise.all(authPromises);

  for (const authz of authorizations) {
    console.log(`\n🎯 Processing authorization for: ${authz.identifier.value}`);

    // Find DNS-01 challenge
    const dnsChallenge = authz.challenges.find((c: ACMEChallenge) => c.type === 'dns-01');
    if (!dnsChallenge) {
      throw new Error('DNS-01 challenge not found');
    }

    // Get DNS record value
    const dnsValue = await client.getChallengeKeyAuthorization(dnsChallenge);

    console.log(`\n📌 DNS Challenge Information:`);
    console.log(`   Record Type: TXT`);
    console.log(`   Record Name: _acme-challenge.${authz.identifier.value}`);
    console.log(`   Record Value: ${dnsValue}`);
    console.log(`\n⚠️  Please add this DNS TXT record and wait for propagation before continuing.`);

    const proceed = await confirm({
      message: 'Have you added the DNS record and confirmed it has propagated?',
      default: false
    });

    if (!proceed) {
      console.log('❌ Certificate issuance cancelled');
      return;
    }

    // Respond to challenge
    console.log('✅ Responding to challenge...');
    await client.completeChallenge(dnsChallenge);

    // Check status
    console.log('⏳ Waiting for challenge verification...');
    let verified = false;
    for (let i = 0; i < 30; i++) { // 30 attempts * 5 seconds = 2.5 minutes
      await new Promise(resolve => setTimeout(resolve, 5000));
      const updatedChallenge = await client.fetchResource<ACMEChallenge>(dnsChallenge.url);
      if (updatedChallenge.status === 'valid') {
        verified = true;
        break;
      }
      if (updatedChallenge.status === 'invalid') {
        throw new Error(`Challenge failed: ${updatedChallenge.error?.detail || 'Unknown error'}`);
      }
    }

    if (!verified) {
      throw new Error('Challenge verification timeout');
    }

    console.log('✅ Challenge verified');
  }

  // Create CSR
  console.log('📄 Generating Certificate Signing Request...');
  const csrResult = await createAcmeCsr(
    [domain],
    { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' },
    domain
  );

  // Finalize order
  console.log('🏁 Finalizing certificate order...');
  await client.finalizeOrder(order.finalize, csrResult.derBase64Url);

  // Wait for certificate to be ready
  console.log('⏳ Waiting for certificate...');
  let finalOrder: ACMEOrder;
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    finalOrder = await client.fetchResource<ACMEOrder>(order.url);
    if (finalOrder.status === 'valid' && finalOrder.certificate) {
      break;
    }
    if (finalOrder.status === 'invalid') {
      throw new Error('Order failed');
    }
  }

  if (!finalOrder!.certificate) {
    throw new Error('Certificate not ready after timeout');
  }

  // Download certificate
  console.log('📜 Downloading certificate...');
  const certificate = await client.downloadCertificate(finalOrder!.certificate);

  // Export certificate private key to PEM format
  const privateKeyPem = await crypto.subtle.exportKey('pkcs8', csrResult.keys.privateKey!);
  const privateKeyPemString = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(privateKeyPem).toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`;

  // Save files
  const certPath = join(outputDir, `${domain}.crt`);
  const keyPath = join(outputDir, `${domain}.key`);
  const csrPath = join(outputDir, `${domain}.csr`);

  writeFileSync(certPath, certificate);
  writeFileSync(keyPath, privateKeyPemString);
  writeFileSync(csrPath, csrResult.pem);

  console.log(`\n🎉 Certificate successfully obtained!`);
  console.log(`   Certificate: ${certPath}`);
  console.log(`   Private Key: ${keyPath}`);
  console.log(`   CSR: ${csrPath}`);
}

async function handleCreateAccountKey(options: any) {
  console.log('🔑 Creating ACME account key...\n');

  const outputPath = options.output;

  if (existsSync(outputPath)) {
    const overwrite = await confirm({
      message: `Account key already exists at ${outputPath}. Overwrite?`,
      default: false
    });

    if (!overwrite) {
      console.log('❌ Operation cancelled');
      return;
    }
  }

  // Create directory if needed
  mkdirSync(dirname(outputPath), { recursive: true });

  // Generate keys
  const keyPair = await generateKeyPair({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey!);
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

  const accountData = {
    privateKey: privateKeyJwk,
    publicKey: publicKeyJwk
  };

  writeFileSync(outputPath, JSON.stringify(accountData, null, 2));
  console.log(`✅ Account key created: ${outputPath}`);
}

async function handleStatusCommand(options: any) {
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

async function handleInteractiveMode() {
  console.log('🎮 ACME-Love Interactive Mode\n');

  const action = await select({
    message: 'What would you like to do?',
    choices: [
      { name: '📜 Obtain SSL Certificate', value: 'cert' },
      { name: '🔑 Create Account Key', value: 'account-key' },
      { name: '📊 Check Certificate Status', value: 'status' },
      { name: '❌ Exit', value: 'exit' }
    ]
  });

  switch (action) {
    case 'cert':
      await handleCertCommand({});
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
