#!/usr/bin/env node

import { testAccountManager } from '../__tests__/utils/account-manager.js';

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'list': {
      const accounts = await testAccountManager.listAccounts();
      console.log('📋 Test Accounts:');
      if (accounts.length === 0) {
        console.log('   No accounts found');
      } else {
        for (const accountId of accounts) {
          const account = await testAccountManager.loadAccount(accountId);
          console.log(
            `   ${accountId} (${account?.email || 'unknown'}) - ${account?.createdAt || 'unknown'}`,
          );
        }
      }
      break;
    }

    case 'create':
      if (!arg) {
        console.error('❌ Usage: npm run accounts create <account-id>');
        process.exit(1);
      }
      try {
        const keys = await testAccountManager.getOrCreateAccountKeys(arg);
        console.log(`✅ Account ${arg} created/loaded successfully`);
        console.log(`   Public key: ${keys.publicKey.substring(0, 50)}...`);
      } catch (error) {
        console.error(`❌ Failed to create account ${arg}:`, error);
        process.exit(1);
      }
      break;

    case 'delete':
      if (!arg) {
        console.error('❌ Usage: npm run accounts delete <account-id>');
        process.exit(1);
      }
      await testAccountManager.deleteAccount(arg);
      console.log(`✅ Account ${arg} deleted`);
      break;

    case 'cleanup': {
      const hours = arg ? parseInt(arg) : 168; // 7 days default
      console.log(`🧹 Cleaning up accounts older than ${hours} hours...`);
      await testAccountManager.cleanupOldAccounts(hours);
      break;
    }

    case 'prepare-stress': {
      console.log('🚀 Preparing accounts for stress tests...');

      // Prepare accounts for different stress tests
      const stressTests = [
        { name: 'light-stress', count: 2 },
        { name: 'quick-stress', count: 1 },
        { name: 'demo-stress', count: 3 },
        { name: 'heavy-stress', count: 5 },
        { name: 'deadlock-detection', count: 3 },
      ];

      for (const test of stressTests) {
        console.log(`   Preparing ${test.count} accounts for ${test.name}...`);
        const keys = await testAccountManager.getMultipleAccountKeys(test.name, test.count);
        console.log(`   ✅ ${test.name}: ${keys.length} accounts ready`);
      }

      console.log('🎉 All stress test accounts prepared!');
      break;
    }

    default:
      console.log('🔧 Test Account Manager');
      console.log('');
      console.log('Usage:');
      console.log('  npm run accounts list                    - List all test accounts');
      console.log('  npm run accounts create <account-id>     - Create/load account');
      console.log('  npm run accounts delete <account-id>     - Delete account');
      console.log(
        '  npm run accounts cleanup [hours]        - Delete old accounts (default: 168h)',
      );
      console.log('  npm run accounts prepare-stress         - Prepare all stress test accounts');
      console.log('');
      console.log('Examples:');
      console.log('  npm run accounts create my-test-account');
      console.log('  npm run accounts cleanup 24');
      console.log('  npm run accounts prepare-stress');
      break;
  }
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
