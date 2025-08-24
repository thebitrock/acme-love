export default {
  extensions: ['ts'],
  nodeArguments: ['--import=tsx'],
  files: ['**/__tests__/**/*.ts'],
  timeout: '30s',
  environmentVariables: {
    DEBUG: 'acme-love'
  }
};
