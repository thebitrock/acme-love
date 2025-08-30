import { confirm } from '@inquirer/prompts';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { generateKeyPair } from '../../index.js';
import { parseAlgorithm, selectAlgorithm } from '../utils/algorithms.js';

/** Options accepted by the create-account-key command. */
export interface CreateAccountKeyOptions {
  output?: string;
  algo?: string;
}

/** Generate a new ACME account key pair and save as JSON (JWK). */
export async function handleCreateAccountKey(options: CreateAccountKeyOptions) {
  console.log('Creating ACME account key...');
  const outputPath = options.output || './account-key.json';
  if (existsSync(outputPath)) {
    const overwrite = await confirm({
      message: `Key exists at ${outputPath}. Overwrite?`,
      default: false,
    });
    if (!overwrite) {
      console.log('Cancelled');
      return;
    }
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  const algo = options.algo ? parseAlgorithm(options.algo) : await selectAlgorithm('account');
  const keyPair = await generateKeyPair(algo);
  if (!keyPair.privateKey || !keyPair.publicKey) throw new Error('Key generation failed');
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  writeFileSync(
    outputPath,
    JSON.stringify({ privateKey: privateKeyJwk, publicKey: publicKeyJwk }, null, 2),
  );
  console.log(`Account key created: ${outputPath}`);
}
