#!/usr/bin/env node

/**
 * ACME Love - Modern TypeScript Node.js Application
 *
 * This is a starter template for a modern TypeScript application
 * running on Node.js 22+ with ES modules support.
 */

export interface AppConfig {
  name: string;
  version: string;
  environment: 'development' | 'production' | 'test';
  port: number;
}

export class Application {
  private config: AppConfig;

  constructor(config?: Partial<AppConfig>) {
    this.config = {
      name: 'ACME Love',
      version: '1.0.0',
      environment: (process.env.NODE_ENV as AppConfig['environment']) || 'development',
      port: parseInt(process.env.PORT || '3000', 10),
      ...config,
    };
  }

  public async start(): Promise<void> {
    try {
      console.log(`🚀 Starting ${this.config.name} v${this.config.version}`);
      console.log(`📦 Environment: ${this.config.environment}`);
      console.log(`🌐 Port: ${this.config.port}`);

      // Simulate some async initialization
      await this.initialize();

      console.log('✅ Application started successfully!');
      console.log('🎉 Welcome to your modern TypeScript Node.js application!');
    } catch (error) {
      console.error('❌ Failed to start application:', error);
      process.exit(1);
    }
  }

  private async initialize(): Promise<void> {
    // Simulate initialization delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Add your initialization logic here
    console.log('🔧 Initializing application components...');
  }

  public getConfig(): Readonly<AppConfig> {
    return Object.freeze({ ...this.config });
  }

  public setConfig(config: Partial<AppConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export directory module
export * as directory from './directory.js';

// Export ACME client
export { ACMEClient } from './acme/client/client.js';
export type {
  ACMEAccount,
  ACMEDirectory,
  ACMEOrder,
  ACMEChallenge,
  ACMEAuthorization,
} from './acme/client/client.js';

// Utility functions
export function createApp(config?: Partial<AppConfig>): Application {
  return new Application(config);
}

export function getVersion(): string {
  return '1.0.0';
}

// CLI execution (only when run directly)
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = new Application();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });

  // Start the application
  app.start().catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}
