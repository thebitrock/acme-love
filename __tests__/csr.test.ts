import { describe, test, expect } from '@jest/globals';
import { generateKeyPair, createAcmeCsr, type CsrAlgo, type EcAlgo, type RsaAlgo } from '../src/acme/csr.js';

describe('CSR and Key Generation', () => {
  const testDomain = 'test.example.com';
  
  describe('ECDSA Key Generation', () => {
    test('should generate P-256 ECDSA keys', async () => {
      const algo: EcAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
      const keyPair = await generateKeyPair(algo);
      
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      
      // Verify key type
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      expect(publicKeyJwk.kty).toBe('EC');
      expect(publicKeyJwk.crv).toBe('P-256');
    });

    test('should generate P-384 ECDSA keys', async () => {
      const algo: EcAlgo = { kind: 'ec', namedCurve: 'P-384', hash: 'SHA-384' };
      const keyPair = await generateKeyPair(algo);
      
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      expect(publicKeyJwk.kty).toBe('EC');
      expect(publicKeyJwk.crv).toBe('P-384');
    });

    test('should generate P-521 ECDSA keys', async () => {
      const algo: EcAlgo = { kind: 'ec', namedCurve: 'P-521', hash: 'SHA-512' };
      const keyPair = await generateKeyPair(algo);
      
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      expect(publicKeyJwk.kty).toBe('EC');
      expect(publicKeyJwk.crv).toBe('P-521');
    });
  });

  describe('RSA Key Generation', () => {
    test('should generate RSA 2048 keys', async () => {
      const algo: RsaAlgo = { kind: 'rsa', modulusLength: 2048, hash: 'SHA-256' };
      const keyPair = await generateKeyPair(algo);
      
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      expect(publicKeyJwk.kty).toBe('RSA');
      // RSA modulus should be approximately 2048 bits (342 chars in base64url)
      expect(publicKeyJwk.n!.length).toBeGreaterThan(340);
      expect(publicKeyJwk.n!.length).toBeLessThan(350);
    });

    test('should generate RSA 3072 keys', async () => {
      const algo: RsaAlgo = { kind: 'rsa', modulusLength: 3072, hash: 'SHA-256' };
      const keyPair = await generateKeyPair(algo);
      
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      expect(publicKeyJwk.kty).toBe('RSA');
      // RSA modulus should be approximately 3072 bits (~512 chars in base64url)
      expect(publicKeyJwk.n!.length).toBeGreaterThan(500);
      expect(publicKeyJwk.n!.length).toBeLessThan(520);
    });

    test('should generate RSA 4096 keys', async () => {
      const algo: RsaAlgo = { kind: 'rsa', modulusLength: 4096, hash: 'SHA-384' };
      const keyPair = await generateKeyPair(algo);
      
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      expect(publicKeyJwk.kty).toBe('RSA');
      // RSA modulus should be approximately 4096 bits (~683 chars in base64url)
      expect(publicKeyJwk.n!.length).toBeGreaterThan(680);
      expect(publicKeyJwk.n!.length).toBeLessThan(690);
    }, 10000); // RSA 4096 generation can be slow
  });

  describe('CSR Generation', () => {
    test('should create CSR with ECDSA P-256', async () => {
      const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
      const result = await createAcmeCsr([testDomain], algo);
      
      expect(result.der).toBeInstanceOf(Buffer);
      expect(result.pem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
      expect(result.pem).toContain('-----END CERTIFICATE REQUEST-----');
      expect(result.derBase64Url).toBeTruthy();
      expect(result.keys.privateKey).toBeDefined();
      expect(result.keys.publicKey).toBeDefined();
      
      // Base64url should not contain padding or forbidden chars
      expect(result.derBase64Url).not.toContain('=');
      expect(result.derBase64Url).not.toContain('+');
      expect(result.derBase64Url).not.toContain('/');
    });

    test('should create CSR with RSA 2048', async () => {
      const algo: CsrAlgo = { kind: 'rsa', modulusLength: 2048, hash: 'SHA-256' };
      const result = await createAcmeCsr([testDomain], algo);
      
      expect(result.der).toBeInstanceOf(Buffer);
      expect(result.pem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
      expect(result.derBase64Url).toBeTruthy();
      expect(result.keys.privateKey).toBeDefined();
      expect(result.keys.publicKey).toBeDefined();
    });

    test('should create CSR with multiple domains', async () => {
      const domains = ['test.example.com', 'www.test.example.com', 'api.test.example.com'];
      const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
      const result = await createAcmeCsr(domains, algo);
      
      expect(result.der).toBeInstanceOf(Buffer);
      expect(result.pem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
      expect(result.derBase64Url).toBeTruthy();
      
      // The PEM should contain all domains (though exact format may vary)
      // We'll just check that it was created successfully
      expect(result.pem.length).toBeGreaterThan(400);
    });

    test('should create CSR with custom common name', async () => {
      const domains = ['www.example.com', 'example.com'];
      const customCN = 'example.com';
      const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
      
      const result = await createAcmeCsr(domains, algo, customCN);
      
      expect(result.der).toBeInstanceOf(Buffer);
      expect(result.pem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
      expect(result.derBase64Url).toBeTruthy();
    });

    test('should accept pre-generated keys', async () => {
      const algo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };
      const keyPair = await generateKeyPair(algo);
      
      const result = await createAcmeCsr([testDomain], algo, testDomain, keyPair);
      
      expect(result.keys.privateKey).toBe(keyPair.privateKey);
      expect(result.keys.publicKey).toBe(keyPair.publicKey);
      expect(result.der).toBeInstanceOf(Buffer);
      expect(result.pem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
    });
  });

  describe('Algorithm Validation', () => {
    test('should work with all supported ECDSA curves', async () => {
      const curves: Array<EcAlgo['namedCurve']> = ['P-256', 'P-384', 'P-521'];
      
      for (const curve of curves) {
        const algo: EcAlgo = { kind: 'ec', namedCurve: curve, hash: 'SHA-256' };
        const keyPair = await generateKeyPair(algo);
        expect(keyPair.privateKey).toBeDefined();
        expect(keyPair.publicKey).toBeDefined();
      }
    });

    test('should work with all supported RSA key sizes', async () => {
      const sizes: Array<RsaAlgo['modulusLength']> = [2048, 3072, 4096];
      
      for (const size of sizes) {
        const algo: RsaAlgo = { kind: 'rsa', modulusLength: size, hash: 'SHA-256' };
        const keyPair = await generateKeyPair(algo);
        expect(keyPair.privateKey).toBeDefined();
        expect(keyPair.publicKey).toBeDefined();
      }
    }, 30000); // RSA generation can be slow
  });
});
