/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // === Layer boundary rules ===
    {
      name: 'no-lib-imports-cli',
      comment: 'Library code must not depend on CLI code',
      severity: 'error',
      from: { path: '^src/lib/' },
      to: { path: '^src/cli/' },
    },
    {
      name: 'no-transport-imports-core',
      comment: 'Transport layer must not depend on core ACME logic',
      severity: 'error',
      from: { path: '^src/lib/transport/' },
      to: { path: '^src/lib/core/' },
    },
    {
      name: 'no-managers-imports-core',
      comment: 'Managers must not depend on core ACME logic',
      severity: 'error',
      from: { path: '^src/lib/managers/' },
      to: { path: '^src/lib/core/' },
    },
    {
      name: 'no-challenges-imports-cli',
      comment: 'Challenge validators must not depend on CLI',
      severity: 'error',
      from: { path: '^src/lib/challenges/' },
      to: { path: '^src/cli/' },
    },
    {
      name: 'no-types-imports-runtime',
      comment: 'Type definitions must not import runtime modules',
      severity: 'error',
      from: { path: '^src/lib/types/' },
      to: {
        path: '^src/lib/(core|transport|managers|challenges)/',
      },
    },
    {
      name: 'no-errors-imports-runtime',
      comment: 'Error definitions must not import from core/transport/managers',
      severity: 'error',
      from: { path: '^src/lib/errors/' },
      to: {
        path: '^src/lib/(core|transport|managers|challenges)/',
      },
    },

    // === General hygiene ===
    {
      name: 'no-circular',
      comment: 'No circular dependencies allowed',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Modules should be reachable from an entry point',
      severity: 'warn',
      from: {
        path: '^src/',
        pathNot: [
          '\\.d\\.ts$',
          '(compat-test|demo|example)\\.ts$', // excluded helper files
        ],
        orphan: true,
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types', 'typings'],
      extensions: ['.ts', '.js', '.json'],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
