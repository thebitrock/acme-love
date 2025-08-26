// import { AcmeClientCore } from '../src/acme/acme-client-core.js';
import { confirm } from '@inquirer/prompts';
import { AcmeAccountSession, AcmeClientCore, createAcmeCsr, directory, generateKeyPair, resolveAndValidateAcmeTxtAuthoritative, type CsrAlgo } from './src/index.js';


const core = new AcmeClientCore(directory.letsencrypt.staging.directoryUrl, {
  nonce: { maxPool: 64 },
});

const commonName = 'kpi-kharkov.click';

const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
const accountKeys = await generateKeyPair(algo);

if (!accountKeys.privateKey || !accountKeys.publicKey) throw new Error('Key generation failed');

const acct = new AcmeAccountSession(core, {
  privateKey: accountKeys.privateKey,
  publicKey: accountKeys.publicKey,
}, {
  // kid: maybeLoadedKid, // if you have it from before
  nonceOverrides: {
    maxPool: 64,
    // prefetchLowWater / prefetchHighWater / log can be set here
  },
});

await acct.ensureRegistered({ contact: ['mailto:roman@pohorilchuk.com'], termsOfServiceAgreed: true });
const order = await acct.newOrder([commonName]);
const ready = await acct.solveDns01(order, {
  waitFor: async (fqdn: string, expected: string) => {
    console.log(fqdn, expected);
    const maxAttempts = 24;          // total attempts
    const delayMs = 5_000;          // 10s between attempts (total ~2 minutes)
    let dnsVerified = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`🔎 Verifying DNS record (attempt ${attempt}/${maxAttempts})...`);
      try {
        const result = await resolveAndValidateAcmeTxtAuthoritative(fqdn, expected);
        if (result.ok) {
          console.log('✅ DNS record verified successfully');
          dnsVerified = true;
          break;
        } else {
          console.log('❌ DNS record not verified yet:', result.reasons ? result.reasons.join('; ') : 'Unknown reasons');
        }
      } catch (e) {
        console.log('⚠️  DNS verification error:', e instanceof Error ? e.message : e);
      }

      if (attempt < maxAttempts) {
        console.log(`⏳ Waiting ${delayMs / 1000}s before next attempt...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    if (!dnsVerified) {
      throw new Error('DNS record could not be verified after multiple attempts. Aborting.');
    }
    console.log(`DNS record found: ${fqdn} -> ${expected}`);
  },
  setDns: async (fqdn: string, value: string) => {
    console.log(`Please create DNS TXT record: ${fqdn} -> ${value}`);
    const proceed = await confirm({
      message: 'Have you added the DNS record and confirmed it has propagated?',
      default: false
    });

    if (!proceed) {
      console.log('❌ Certificate issuance cancelled');
      return;
    }
  }
});

const { derBase64Url } = await createAcmeCsr([commonName], { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });
const finalized = await acct.finalize(ready, derBase64Url);
const valid = await acct.waitOrder(finalized.url, ['valid']);
const pem = await acct.downloadCertificate(valid);

console.log('Certificate PEM:\n', pem);
