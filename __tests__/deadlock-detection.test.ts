import { describe, test, expect, beforeAll } from '@jest/globals';
import { AcmeClientCore } from '../src/acme/client/acme-client-core.js';
import { AcmeAccountSession } from '../src/acme/client/acme-account-session.js';
import { NonceManager } from '../src/acme/client/nonce-manager.js';
import { generateKeyPair } from '../src/acme/csr.js';
import type { CsrAlgo } from '../src/acme/csr.js';

// Deadlock detection test
describe('ACME Deadlock Detection Test', () => {
  const STAGING_DIRECTORY_URL = 'https://acme-staging-v02.api.letsencrypt.org/directory';
  
  interface DeadlockMetrics {
    operationId: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    status: 'pending' | 'completed' | 'timeout' | 'error';
    operation: string;
    accountIndex?: number | undefined;
  }

  class DeadlockDetector {
    private operations: Map<string, DeadlockMetrics> = new Map();
    private timeoutThreshold = 30000; // 30 seconds timeout
    private checkInterval: NodeJS.Timeout | null = null;

    start() {
      this.operations.clear();
      this.checkInterval = setInterval(() => {
        this.checkForDeadlocks();
      }, 5000); // Check every 5 seconds
    }

    stop() {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
    }

    trackOperation(operationId: string, operation: string, accountIndex?: number): void {
      this.operations.set(operationId, {
        operationId,
        startTime: Date.now(),
        status: 'pending',
        operation,
        accountIndex
      });
    }

    completeOperation(operationId: string, status: 'completed' | 'error' = 'completed'): void {
      const op = this.operations.get(operationId);
      if (op) {
        op.endTime = Date.now();
        op.duration = op.endTime - op.startTime;
        op.status = status;
      }
    }

    private checkForDeadlocks(): void {
      const now = Date.now();
      let deadlockDetected = false;

      for (const [, op] of this.operations.entries()) {
        if (op.status === 'pending' && (now - op.startTime) > this.timeoutThreshold) {
          console.warn(`🚨 POTENTIAL DEADLOCK DETECTED:`);
          console.warn(`   Operation: ${op.operation}`);
          console.warn(`   Operation ID: ${op.operationId}`);
          console.warn(`   Account: ${op.accountIndex ?? 'N/A'}`);
          console.warn(`   Duration: ${now - op.startTime}ms`);
          
          op.status = 'timeout';
          deadlockDetected = true;
        }
      }

      if (deadlockDetected) {
        this.printActiveOperations();
      }
    }

    printActiveOperations(): void {
      console.log(`\n📊 ACTIVE OPERATIONS SNAPSHOT:`);
      for (const [, op] of this.operations.entries()) {
        if (op.status === 'pending') {
          const duration = Date.now() - op.startTime;
          console.log(`   ${op.operation} (Account ${op.accountIndex ?? 'N/A'}): ${duration}ms`);
        }
      }
    }

    getStats() {
      const stats = {
        total: this.operations.size,
        pending: 0,
        completed: 0,
        timeout: 0,
        error: 0,
        longestDuration: 0,
        averageDuration: 0
      };

      let totalDuration = 0;
      let completedCount = 0;

      for (const op of this.operations.values()) {
        stats[op.status]++;
        
        if (op.duration) {
          totalDuration += op.duration;
          completedCount++;
          stats.longestDuration = Math.max(stats.longestDuration, op.duration);
        }
      }

      stats.averageDuration = completedCount > 0 ? totalDuration / completedCount : 0;
      return stats;
    }
  }

  // Enhanced HTTP client with deadlock tracking
  class DeadlockTrackingHttpClient {
    private detector: DeadlockDetector;
    private originalClient: any;
    private accountIndex?: number | undefined;

    constructor(detector: DeadlockDetector, originalClient: any, accountIndex?: number) {
      this.detector = detector;
      this.originalClient = originalClient;
      this.accountIndex = accountIndex;
    }

    async get(url: string, headers: Record<string, string> = {}): Promise<any> {
      const operationId = `GET-${Date.now()}-${Math.random()}`;
      this.detector.trackOperation(operationId, `GET ${this.getUrlType(url)}`, this.accountIndex);
      
      try {
        const result = await this.originalClient.get(url, headers);
        this.detector.completeOperation(operationId, 'completed');
        return result;
      } catch (error) {
        this.detector.completeOperation(operationId, 'error');
        throw error;
      }
    }

    async post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<any> {
      const operationId = `POST-${Date.now()}-${Math.random()}`;
      this.detector.trackOperation(operationId, `POST ${this.getUrlType(url)}`, this.accountIndex);
      
      try {
        const result = await this.originalClient.post(url, body, headers);
        this.detector.completeOperation(operationId, 'completed');
        return result;
      } catch (error) {
        this.detector.completeOperation(operationId, 'error');
        throw error;
      }
    }

    async head(url: string, headers: Record<string, string> = {}): Promise<any> {
      const operationId = `HEAD-${Date.now()}-${Math.random()}`;
      this.detector.trackOperation(operationId, `HEAD ${this.getUrlType(url)}`, this.accountIndex);
      
      try {
        const result = await this.originalClient.head(url, headers);
        this.detector.completeOperation(operationId, 'completed');
        return result;
      } catch (error) {
        this.detector.completeOperation(operationId, 'error');
        throw error;
      }
    }

    private getUrlType(url: string): string {
      if (url.includes('directory')) return 'directory';
      if (url.includes('new-nonce')) return 'new-nonce';
      if (url.includes('new-acct')) return 'new-account';
      if (url.includes('new-order')) return 'new-order';
      if (url.includes('authz-v3')) return 'authorization';
      if (url.includes('chall-v3')) return 'challenge';
      return 'unknown';
    }
  }

  let detector: DeadlockDetector;

  beforeAll(async () => {
    detector = new DeadlockDetector();
    console.log(`🔍 Starting ACME Deadlock Detection Test`);
    console.log(`   This test will create concurrent operations and monitor for deadlocks`);
  });

  test('should detect deadlocks in concurrent ACME operations', async () => {
    detector.start();
    console.log(`🕵️ Starting deadlock detection monitoring...`);

    try {
      const accountAlgo: CsrAlgo = { kind: 'ec', namedCurve: 'P-256', hash: 'SHA-256' };

      // Test 1: Concurrent account creation
      console.log(`\n🧪 Test 1: Concurrent Account Creation`);
      const concurrentAccounts = 3;
      
      const accountPromises = Array.from({ length: concurrentAccounts }, async (_, accountIndex) => {
        const operationId = `account-creation-${accountIndex}`;
        detector.trackOperation(operationId, 'Account Creation', accountIndex);

        try {
          const keyPair = await generateKeyPair(accountAlgo);
          const accountKeys = {
            privateKey: keyPair.privateKey!,
            publicKey: keyPair.publicKey
          };

          const core = new AcmeClientCore(STAGING_DIRECTORY_URL, {
            nonce: { maxPool: 5 } // Smaller pool to increase contention
          });

          // Add deadlock tracking
          const originalHttp = core.getHttp();
          const trackingHttp = new DeadlockTrackingHttpClient(detector, originalHttp, accountIndex);
          (core as any).http = trackingHttp;

          const acct = new AcmeAccountSession(core, accountKeys);

          await acct.ensureRegistered({
            contact: [`mailto:deadlock-test-${accountIndex}-${Date.now()}@gmail.com`],
            termsOfServiceAgreed: true
          });

          detector.completeOperation(operationId, 'completed');
          console.log(`   ✅ Account ${accountIndex + 1} created successfully`);
          
          return { accountIndex, acct, core, trackingHttp };
        } catch (error) {
          detector.completeOperation(operationId, 'error');
          console.error(`   ❌ Account ${accountIndex + 1} failed: ${error}`);
          throw error;
        }
      });

      const accounts = await Promise.all(accountPromises);
      console.log(`   🎯 All ${concurrentAccounts} accounts created without deadlock`);

      // Test 2: Concurrent nonce requests
      console.log(`\n🧪 Test 2: Concurrent Nonce Pool Stress`);
      const nonceStressPromises = accounts.flatMap(({ core }, accountIndex) => {
        return Array.from({ length: 10 }, async (_, requestIndex) => {
          const operationId = `nonce-stress-${accountIndex}-${requestIndex}`;
          detector.trackOperation(operationId, 'Nonce Request', accountIndex);

          try {
            const nonceManager = core.getDefaultNonce();
            const namespace = NonceManager.makeNamespace(STAGING_DIRECTORY_URL);
            await nonceManager.take(namespace);
            detector.completeOperation(operationId, 'completed');
          } catch (error) {
            detector.completeOperation(operationId, 'error');
            throw error;
          }
        });
      });

      await Promise.all(nonceStressPromises);
      console.log(`   🎯 All nonce requests completed without deadlock`);

      // Test 3: Rapid-fire directory requests
      console.log(`\n🧪 Test 3: Rapid Directory Requests`);
      const directoryPromises = accounts.flatMap(({ core }, accountIndex) => {
        return Array.from({ length: 5 }, async (_, requestIndex) => {
          const operationId = `directory-${accountIndex}-${requestIndex}`;
          detector.trackOperation(operationId, 'Directory Request', accountIndex);

          try {
            await core.getDirectory();
            detector.completeOperation(operationId, 'completed');
          } catch (error) {
            detector.completeOperation(operationId, 'error');
            throw error;
          }
        });
      });

      await Promise.all(directoryPromises);
      console.log(`   🎯 All directory requests completed without deadlock`);

      // Test 4: Mixed concurrent operations
      console.log(`\n🧪 Test 4: Mixed Concurrent Operations`);
      const mixedPromises = accounts.flatMap(({ core }, accountIndex) => {
        return [
          // Nonce requests
          ...Array.from({ length: 3 }, async (_, i) => {
            const operationId = `mixed-nonce-${accountIndex}-${i}`;
            detector.trackOperation(operationId, 'Mixed Nonce', accountIndex);
            try {
              const namespace = NonceManager.makeNamespace(STAGING_DIRECTORY_URL);
              await core.getDefaultNonce().take(namespace);
              detector.completeOperation(operationId, 'completed');
            } catch (error) {
              detector.completeOperation(operationId, 'error');
              throw error;
            }
          }),
          // Directory requests
          ...Array.from({ length: 2 }, async (_, i) => {
            const operationId = `mixed-directory-${accountIndex}-${i}`;
            detector.trackOperation(operationId, 'Mixed Directory', accountIndex);
            try {
              await core.getDirectory();
              detector.completeOperation(operationId, 'completed');
            } catch (error) {
              detector.completeOperation(operationId, 'error');
              throw error;
            }
          })
        ];
      });

      await Promise.all(mixedPromises);
      console.log(`   🎯 All mixed operations completed without deadlock`);

      // Wait a bit more to catch any delayed deadlocks
      await new Promise(resolve => setTimeout(resolve, 2000));

      const stats = detector.getStats();
      detector.stop();

      console.log(`\n📊 DEADLOCK DETECTION RESULTS:`);
      console.log(`================================`);
      console.log(`Total Operations: ${stats.total}`);
      console.log(`Completed: ${stats.completed}`);
      console.log(`Pending: ${stats.pending}`);
      console.log(`Timeouts (Potential Deadlocks): ${stats.timeout}`);
      console.log(`Errors: ${stats.error}`);
      console.log(`Longest Operation: ${Math.round(stats.longestDuration)}ms`);
      console.log(`Average Duration: ${Math.round(stats.averageDuration)}ms`);

      if (stats.timeout > 0) {
        console.error(`🚨 DEADLOCK DETECTED: ${stats.timeout} operations timed out`);
        detector.printActiveOperations();
      } else {
        console.log(`✅ NO DEADLOCKS DETECTED`);
      }

      // Nonce pool analysis
      console.log(`\n🔍 NONCE POOL ANALYSIS:`);
      accounts.forEach(({ core }, accountIndex) => {
        try {
          const nonceManager = core.getDefaultNonce();
          const poolSize = (nonceManager as any).pool?.length || 0;
          console.log(`   Account ${accountIndex + 1}: ${poolSize} nonces in pool`);
        } catch (error) {
          console.log(`   Account ${accountIndex + 1}: Could not read nonce pool`);
        }
      });

      // Performance assertions
      expect(stats.timeout).toBe(0); // No deadlocks detected
      expect(stats.completed).toBeGreaterThan(0); // Some operations completed
      expect(stats.averageDuration).toBeLessThan(10000); // Average under 10 seconds
      expect(stats.longestDuration).toBeLessThan(30000); // No operation over 30 seconds

    } catch (error) {
      detector.stop();
      console.error(`💥 Deadlock detection test failed:`, error);
      
      const stats = detector.getStats();
      if (stats.timeout > 0) {
        console.error(`🚨 POTENTIAL DEADLOCK: ${stats.timeout} operations timed out during error`);
        detector.printActiveOperations();
      }
      
      throw error;
    }
  }, 120000); // 2 minutes timeout

  test('should detect nonce manager deadlocks', async () => {
    detector.start();
    console.log(`\n🧪 Specific Nonce Manager Deadlock Test`);

    try {
      const core = new AcmeClientCore(STAGING_DIRECTORY_URL, {
        nonce: { maxPool: 2 } // Very small pool to force contention
      });

      // Initialize directory first
      const initOpId = 'init-directory';
      detector.trackOperation(initOpId, 'Directory Initialization');
      await core.getDirectory();
      detector.completeOperation(initOpId, 'completed');

      const trackingHttp = new DeadlockTrackingHttpClient(detector, core.getHttp());
      (core as any).http = trackingHttp;

      // Hammer the nonce manager with many concurrent requests
      const noncePromises = Array.from({ length: 20 }, async (_, i) => {
        const operationId = `nonce-hammer-${i}`;
        detector.trackOperation(operationId, 'Nonce Hammer');

        try {
          const nonceManager = core.getDefaultNonce();
          const namespace = NonceManager.makeNamespace(STAGING_DIRECTORY_URL);
          const nonce = await nonceManager.take(namespace);
          
          // Simulate some work
          await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
          
          detector.completeOperation(operationId, 'completed');
          return nonce;
        } catch (error) {
          detector.completeOperation(operationId, 'error');
          throw error;
        }
      });

      const nonces = await Promise.all(noncePromises);
      console.log(`   ✅ All ${nonces.length} nonce requests completed`);

      const stats = detector.getStats();
      detector.stop();

      console.log(`📊 Nonce Manager Test Results:`);
      console.log(`   Completed: ${stats.completed}`);
      console.log(`   Timeouts: ${stats.timeout}`);
      console.log(`   Average Duration: ${Math.round(stats.averageDuration)}ms`);

      expect(stats.timeout).toBe(0);
      expect(nonces.length).toBe(20);

    } catch (error) {
      detector.stop();
      throw error;
    }
  }, 60000);
});
