/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],

  // Transform configuration for ESM + TypeScript
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true
    }]
  },

  // Module name mapping for TypeScript imports
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],

  // Transform ignore patterns - don't transform node_modules except jose
  transformIgnorePatterns: [
    'node_modules/(?!(jose))'
  ],

  // Extensions to treat as ESM
  extensionsToTreatAsEsm: ['.ts'],

  // Test timeout for E2E tests
  testTimeout: 60000,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true
};
