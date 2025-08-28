# ACME Love - Publishing to NPM

## 🚀 Quick Start (Automated Publishing)

### Recommended Workflow

```bash
# Always start with a dry run to check everything
npm run release:dry

# If everything looks good, publish
npm run release:patch   # For bug fixes
npm run release:minor   # For new features
npm run release:major   # For breaking changes
```

### All Available Commands

```bash
# Automated Publishing (Recommended)
npm run release:dry     # Dry run (no publishing)
npm run release:patch   # 1.0.0 → 1.0.1
npm run release:minor   # 1.0.0 → 1.1.0
npm run release:major   # 1.0.0 → 2.0.0
npm run release:beta    # 1.0.0 → 1.0.1-beta.0
npm run release:alpha   # 1.0.0 → 1.0.1-alpha.0

# Manual Publishing (Alternative)
npm run publish:patch   # Manual patch version
npm run publish:minor   # Manual minor version
npm run publish:major   # Manual major version
npm run publish:beta    # Manual beta version
npm run publish:alpha   # Manual alpha version
npm run publish:dry     # Size check only
```

## ⚡ What the Automated Script Does

The automated publishing script (`scripts/publish.sh` and `scripts/publish.mjs`) performs comprehensive checks and automation:

### 1. Security Checks

- ✅ Verifies npm authentication (`npm whoami`)
- ✅ Checks git status (uncommitted changes)
- ✅ Validates current branch (main/master)

### 2. Code Quality

- ✅ Runs code formatting check (Prettier)
- ✅ Runs linting check (ESLint)
- ✅ Executes all tests

### 3. Build Process

- ✅ Cleans dist directory
- ✅ Builds production version (no source maps)
- ✅ Shows final package size

### 4. Publishing

- ✅ Updates version in package.json
- ✅ Creates git tag
- ✅ Publishes to npm
- ✅ Pushes changes to git repository

## 📋 Version Types Guide

| Command | Example Change        | When to Use                       |
| ------- | --------------------- | --------------------------------- |
| `patch` | 1.0.0 → 1.0.1         | Bug fixes, small corrections      |
| `minor` | 1.0.0 → 1.1.0         | New features, backward compatible |
| `major` | 1.0.0 → 2.0.0         | Breaking API changes              |
| `beta`  | 1.0.0 → 1.0.1-beta.0  | Test versions                     |
| `alpha` | 1.0.0 → 1.0.1-alpha.0 | Early test versions               |

## 📦 Package Optimization Results

Current package optimization achievements:

- **Size**: ~42 kB (compressed) vs 132 kB before optimization
- **Files**: ~51 vs 189 before optimization
- **Excluded**: tests, source maps, development documentation
- **Reduction**: 68% size reduction, 73% fewer files

## 🔧 Manual Publishing Process

If you prefer manual control or need to troubleshoot:

### 1. Pre-publishing Checks

```bash
# Check build
npm run build

# Run tests
npm test

# Test CLI locally
npx . --help
npx . create-account-key --help
```

### 2. Version Management

```bash
# Patch version (1.0.3 → 1.0.4)
npm version patch

# Minor version (1.0.3 → 1.1.0)
npm version minor

# Major version (1.0.3 → 2.0.0)
npm version major
```

### 3. Publishing

```bash
# Ensure npm authentication
npm whoami

# Login if needed
npm login

# Publish
npm publish

# For first publication with scoped package
npm publish --access public
```

## 🎯 Usage Examples

### Regular Development Workflow

```bash
# Made a bug fix
npm run release:patch

# Added new feature
npm run release:minor

# Changed API (breaking change)
npm run release:major
```

### Testing Releases

```bash
# Create test version
npm run release:beta

# Install beta version
npm install acme-love@beta

# Test the beta
npx acme-love --version
```

### Pre-publish Verification

```bash
# Always do a dry run first
npm run release:dry

# Review the output, then publish
npm run release:patch
```

## 🔧 Debugging & Troubleshooting

If something goes wrong:

### 1. Check Authorization

```bash
npm whoami
```

### 2. Verify Package Size

```bash
npm run publish:dry
```

### 3. Test Manually

```bash
npm test
npm run clean && npm run build:prod
```

### 4. Debug Scripts

Both bash and Node.js versions available:

- `scripts/publish.sh` - Bash version (main)
- `scripts/publish.mjs` - Node.js version (cross-platform)

## ✅ Requirements

- Git repository with clean status
- npm authentication (`npm login`)
- All tests passing
- Node.js 18+ and npm 8+

## 📋 Pre-publishing Checklist

- [ ] Code builds without errors (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] CLI works locally (`npx . --help`)
- [ ] README.md updated
- [ ] Git changes committed
- [ ] npm authentication verified (`npm whoami`)

## 🏗️ After Publishing

### Verify Installation

```bash
# Install from npm
npm install -g acme-love@latest

# Check functionality
acme-love --version
acme-love --help
```

### Test CLI

```bash
# Create test key
acme-love create-account-key -o test-account.json

# Check interactive mode
acme-love interactive
```

## 📚 Usage After Publishing

### Global Installation

```bash
npm install -g acme-love
acme-love cert -d acme-love.com -e admin@acme-love.com --staging
```

### Local Installation

```bash
npm install acme-love
npx acme-love cert -d acme-love.com -e admin@acme-love.com --staging
```

### As Project Dependency

```bash
npm install acme-love
```

```js
import { ACMEClient, provider } from 'acme-love';

const client = new ACMEClient(provider.letsencrypt.staging.directoryUrl);
// ... use API
```

## 🏭 GitHub Actions Automation

### Workflow Configuration

```yaml
# .github/workflows/publish.yml
name: Publish to NPM

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Test
        run: npm test

      - name: Publish
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Creating Releases

```bash
# Update version and create tag
npm version patch

# Push tag to trigger GitHub Actions
git push origin v1.0.4

# GitHub Actions will automatically publish
```

## 🛠️ NPM Management Commands

```bash
# View package information
npm info acme-love

# View all versions
npm view acme-love versions --json

# Unpublish version (only within 72 hours)
npm unpublish acme-love@1.0.3

# Mark version as deprecated
npm deprecate acme-love@1.0.3 "Use version 1.0.4 instead"
```

## 📁 Package Structure

```
acme-love/
├── package.json          # Package metadata
├── README.md             # Documentation
├── LICENSE               # License
├── dist/                 # Compiled code
│   └── src/
│       ├── cli.js        # CLI entry point
│       ├── index.js      # Library entry point
│       └── ...           # Other modules
└── docs/                 # Additional documentation
    └── CLI.md
```

## ⚙️ Important package.json Fields

```json
{
  "name": "acme-love",
  "version": "1.4.1",
  "type": "module",
  "main": "dist/src/index.js",
  "bin": {
    "acme-love": "dist/src/cli.js"
  },
  "exports": {
    ".": {
      "import": "./dist/src/index.js",
      "types": "./dist/src/index.d.ts"
    }
  },
  "files": ["dist", "README.md", "LICENSE"]
}
```
