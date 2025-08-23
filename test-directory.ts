#!/usr/bin/env node

// Test the new directory configuration
import { directory } from './src/index.js';

console.log('🧪 Testing ACME directory configuration...\n');

// Test all providers
console.log('📋 Available ACME providers:');
console.log('- Buypass:', Object.keys(directory.directory.buypass));
console.log('- Google:', Object.keys(directory.directory.google));
console.log('- Let\'s Encrypt:', Object.keys(directory.directory.letsencrypt));
console.log('- ZeroSSL:', Object.keys(directory.directory.zerossl));

console.log('\n🔗 Directory URLs:');
console.log('Let\'s Encrypt Production:', directory.directory.letsencrypt.production.directoryUrl);
console.log('Google Staging:', directory.directory.google.staging.directoryUrl);
console.log('Buypass Production:', directory.directory.buypass.production.directoryUrl);
console.log('ZeroSSL Production:', directory.directory.zerossl.production.directoryUrl);

console.log('\n✅ All directory configurations loaded successfully!');
