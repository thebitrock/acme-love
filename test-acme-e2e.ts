import { ACMEClient } from './src/acme-client.js';
import { directory } from './src/index.js';
import { generateKeyPairSync } from 'crypto';

async function runE2ETest() {
  console.log('🧪 Running ACME E2E Test...\n');

  try {
    // Create ACME client for Let's Encrypt staging
    const client = new ACMEClient(directory.letsencrypt.staging.directoryUrl);

    // Initialize client with nonce
    console.log('📋 1. Initializing ACME client...');
    await client.getNonce();

    // Get directory info using the public method
    const dir = client.getDirectoryInfo();
    console.log('✅ Directory endpoints:', dir);

    // Get nonce
    console.log('\n🔑 2. Getting nonce...');
    const nonce: string = await client.getNonce();
    console.log('✅ Nonce received:', nonce.substring(0, 20) + '...');

    // Generate tokens
    console.log('\n🎲 3. Testing token generation...');
    const token1 = ACMEClient.generateToken();
    const token2 = ACMEClient.generateToken();
    console.log('✅ Tokens generated:', token1.substring(0, 20) + '...', token2.substring(0, 20) + '...');
    console.log('✅ Tokens different:', token1 !== token2);

    // Directory config
    console.log('\n🔍 4. Testing directory configuration...');
    console.log('✅ Available providers:', Object.keys(directory));

    // Generate key pair and set account
    console.log('\n🔐 5. Generating test key pair...');
    const keyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    client.setAccount({ privateKey: keyPair.privateKey, publicKey: keyPair.publicKey });
    console.log('✅ Key pair generated and set.');

    // Try to create account
    console.log('\n👤 6. Creating ACME account...');
    try {
      const account = await client.createAccount(['mailto:test@example.com'], true);
      console.log('✅ Account created:', account);
    } catch (error: any) {
      if (error.message.includes('409')) {
        console.log('ℹ️ Account already exists, continuing.');
      } else {
        throw error;
      }
    }

    // Create order
    console.log('\n📦 7. Creating order for domain...');
    const order = await client.createOrder([{ type: 'dns', value: 'test.example.com' }]);
    console.log('✅ Order created:', order);

    // Get authorization
    console.log('\n🔎 8. Getting authorization...');
    const authz = await client.getAuthorization(order.authorizations[0]);
    console.log('✅ Authorization:', authz);

    // Generate key authorization
    console.log('\n🔑 9. Generating key authorization...');
    const keyAuth = await client.generateKeyAuthorization(authz.challenges[0].token);
    console.log('✅ Key authorization:', keyAuth);

    // Summary
    console.log('\n🎉 E2E Test completed successfully!');
    console.log('📊 Summary:');
    console.log('   ✅ Directory discovery: PASS');
    console.log('   ✅ Nonce retrieval: PASS');
    console.log('   ✅ Token generation: PASS');
    console.log('   ✅ Directory configuration: PASS');
    console.log('   ✅ Account creation: PASS');
    console.log('   ✅ Order creation: PASS');
    console.log('   ✅ Authorization retrieval: PASS');
    console.log('   ✅ Key authorization: PASS');
  } catch (error: any) {
    console.error('❌ E2E Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

runE2ETest();
