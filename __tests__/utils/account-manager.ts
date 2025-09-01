import * as fs from 'fs/promises';
import * as path from 'path';
import { exportPKCS8, exportSPKI, importPKCS8, importSPKI } from 'jose';
import { generateKeyPair } from '../../src/lib/crypto/csr.js';
import { AcmeClient } from '../../src/lib/core/acme-client.js';
import { AcmeAccount } from '../../src/lib/core/acme-account.js';

export interface TestAccount {
  id: string;
  email: string;
  kid?: string; // Account URL from ACME server
  keyPair: {
    privateKeyPem: string;
    publicKeyPem: string;
  };
  createdAt: string;
}

export interface AccountKeys {
  privateKey: any;
  publicKey: any;
}

export class TestAccountManager {
  private accountsDir: string;

  constructor() {
    this.accountsDir = path.join(process.cwd(), 'stress-test-accounts');
  }

  async ensureAccountsDir(): Promise<void> {
    try {
      await fs.access(this.accountsDir);
    } catch {
      await fs.mkdir(this.accountsDir, { recursive: true });
    }
  }

  async saveAccount(account: TestAccount): Promise<void> {
    await this.ensureAccountsDir();
    const filePath = path.join(this.accountsDir, `${account.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(account, null, 2));
  }

  async loadAccount(id: string): Promise<TestAccount | null> {
    try {
      const filePath = path.join(this.accountsDir, `${id}.json`);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async getOrCreateAccountKeys(id: string, email?: string): Promise<AccountKeys> {
    // Try to load existing account
    const existing = await this.loadAccount(id);
    if (existing) {
      console.log(`📋 Using existing test account keys: ${id}`);
      const privateKey = await importPKCS8(existing.keyPair.privateKeyPem, 'ES256');
      const publicKey = await importSPKI(existing.keyPair.publicKeyPem, 'ES256');
      return { privateKey, publicKey };
    }

    console.log(`🔧 Creating new test account keys: ${id}`);

    // Generate new key pair
    const keyPair = await generateKeyPair({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });
    const privateKeyPem = await exportPKCS8(keyPair.privateKey!);
    const publicKeyPem = await exportSPKI(keyPair.publicKey);

    const accountEmail = email || `stress-test-${id}-${Date.now()}@acme-love.com`;

    const account: TestAccount = {
      id,
      email: accountEmail,
      keyPair: {
        privateKeyPem,
        publicKeyPem,
      },
      createdAt: new Date().toISOString(),
    };

    await this.saveAccount(account);
    console.log(`✅ Created and saved test account keys: ${id} (${accountEmail})`);

    return {
      privateKey: keyPair.privateKey!,
      publicKey: keyPair.publicKey,
    };
  }

  async listAccounts(): Promise<string[]> {
    try {
      await this.ensureAccountsDir();
      const files = await fs.readdir(this.accountsDir);
      return files
        .filter((file) => file.endsWith('.json'))
        .map((file) => path.basename(file, '.json'));
    } catch {
      return [];
    }
  }

  async deleteAccount(id: string): Promise<void> {
    try {
      const filePath = path.join(this.accountsDir, `${id}.json`);
      await fs.unlink(filePath);
      console.log(`🗑️ Deleted test account: ${id}`);
    } catch {
      // Account doesn't exist, which is fine
    }
  }

  async cleanupOldAccounts(maxAgeHours: number = 168): Promise<void> {
    const accounts = await this.listAccounts();
    const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;

    for (const accountId of accounts) {
      const account = await this.loadAccount(accountId);
      if (account) {
        const createdTime = new Date(account.createdAt).getTime();
        if (createdTime < cutoffTime) {
          await this.deleteAccount(accountId);
          console.log(`🧹 Cleaned up old test account: ${accountId}`);
        }
      }
    }
  }

  /** Get crypto keys for multiple accounts for stress testing */
  async getMultipleAccountKeys(baseId: string, count: number): Promise<AccountKeys[]> {
    const keys: AccountKeys[] = [];
    for (let i = 0; i < count; i++) {
      const accountId = `${baseId}-${i + 1}`;
      const accountKeys = await this.getOrCreateAccountKeys(accountId);
      keys.push(accountKeys);
    }
    return keys;
  }

  /** Create or load a complete ACME account with registration */
  async getOrCreateAccountSession(
    id: string,
    directoryUrl: string,
    email?: string,
    options?: any,
  ): Promise<AcmeAccount> {
    // Try to load existing account
    const existing = await this.loadAccount(id);
    let accountKeys: AccountKeys;
    let kid: string | undefined;

    if (existing) {
      console.log(
        `📋 Using existing test account: ${id} (kid: ${existing.kid || 'not registered'})`,
      );
      const privateKey = await importPKCS8(existing.keyPair.privateKeyPem, 'ES256');
      const publicKey = await importSPKI(existing.keyPair.publicKeyPem, 'ES256');
      accountKeys = { privateKey, publicKey };
      kid = existing.kid;
    } else {
      console.log(`🔧 Creating new test account: ${id}`);

      // Generate new key pair
      const keyPair = await generateKeyPair({ kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' });
      const privateKeyPem = await exportPKCS8(keyPair.privateKey!);
      const publicKeyPem = await exportSPKI(keyPair.publicKey);

      accountKeys = {
        privateKey: keyPair.privateKey!,
        publicKey: keyPair.publicKey,
      };

      const accountEmail = email || `stress-test-${id}-${Date.now()}@acme-love.com`;

      // Save basic account info (without kid yet)
      const account: TestAccount = {
        id,
        email: accountEmail,
        keyPair: {
          privateKeyPem,
          publicKeyPem,
        },
        createdAt: new Date().toISOString(),
      };

      await this.saveAccount(account);
    }

    // Create ACME session
    const client = new AcmeClient(directoryUrl, options);

    // Initialize directory first (required for NonceManager in new API)
    await client.getDirectory();

    const sessionOptions = kid ? { kid } : {};
    const account = new AcmeAccount(client, accountKeys, sessionOptions);

    // Ensure account is registered and get/save kid
    try {
      const registrationResult = await account.register({
        contact: [`mailto:${existing?.email || `stress-test-${id}-${Date.now()}@acme-love.com`}`],
        termsOfServiceAgreed: true,
      });
      const registrationKid = registrationResult.accountUrl;

      // If this is a new registration or we didn't have kid before, save it
      if (!existing?.kid && registrationKid) {
        const updatedAccount: TestAccount = {
          ...(existing || {
            id,
            email: `stress-test-${id}-${Date.now()}@acme-love.com`,
            keyPair: {
              privateKeyPem: await exportPKCS8(accountKeys.privateKey as any),
              publicKeyPem: await exportSPKI(accountKeys.publicKey as any),
            },
            createdAt: new Date().toISOString(),
          }),
          kid: registrationKid,
        };
        await this.saveAccount(updatedAccount);
        console.log(`✅ Account ${id} registered with kid: ${registrationKid}`);
      } else {
        console.log(`✅ Account ${id} verified/reused (kid: ${kid || registrationKid})`);
      }
    } catch (error) {
      console.error(`❌ Failed to register account ${id}:`, error);
      throw error;
    }

    return account;
  }
}

// Global instance
export const testAccountManager = new TestAccountManager();
