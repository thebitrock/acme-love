#!/usr/bin/env node

// Test ACME client functionality
import { ACMEClient, directory } from './src/index.js';

async function testACME() {
  console.log('🧪 Testing ACME Client...\n');

  try {
    // Test with Let's Encrypt staging
    const client = new ACMEClient(directory.letsencrypt.staging.directoryUrl);

    console.log('📋 Initializing ACME client...');
    // Initialize client by getting a nonce
    await client.getNonce();

    // Get directory information using the public method
    const dir = client.getDirectoryInfo();
    console.log('✅ Directory endpoints:');
    if (dir) {
      console.log('- newNonce:', dir.newNonce);
      console.log('- newAccount:', dir.newAccount);
      console.log('- newOrder:', dir.newOrder);
      console.log('- revokeCert:', dir.revokeCert);
      console.log('- keyChange:', dir.keyChange);
    } else {
      console.log('❌ Directory information not available');
    }

    console.log('\n🔑 Getting nonce...');
    const nonce = await client.getNonce();
    console.log('✅ Nonce received:', nonce.substring(0, 20) + '...');

    console.log('\n🎉 ACME client is working correctly!');
  } catch (error: any) {
    console.error('❌ Error testing ACME client:', error.message);
  }
}

testACME();
