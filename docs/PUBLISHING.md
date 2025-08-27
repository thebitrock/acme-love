# ACME Love - Publishing to NPM

## Preparation for publishing

### 1. Check build

```bash
npm run build
```

### 2. Check tests

```bash
npm test
```

### 3. Check CLI

```bash
# Test locally
npx . --help
npx . create-account-key --help
```

### 4. Update version

```bash
# Patch version (1.0.3 -> 1.0.4)
npm version patch

# Minor version (1.0.3 -> 1.1.0)
npm version minor

# Major version (1.0.3 -> 2.0.0)
npm version major
```

### 5. Publish

```bash
# First make sure you're logged in to npm
npm whoami

# If not logged in
npm login

# Publish
npm publish

# For first publication with scoped package
npm publish --access public
```

## After publishing

### Check installation

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

## Usage after publishing

### Global installation

```bash
npm install -g acme-love
acme-love cert -d acme-love.com -e admin@acme-love.com --staging
```

### Local installation

```bash
npm install acme-love
npx acme-love cert -d acme-love.com -e admin@acme-love.com --staging
```

### In project as dependency

```bash
npm install acme-love
```

```js
import { ACMEClient, directory } from 'acme-love';

const client = new ACMEClient(directory.letsencrypt.staging.directoryUrl);
// ... use API
```

## Package structure after build

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

## Important fields in package.json

```json
{
  "name": "acme-love",
  "version": "1.0.3",
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
  "files": ["dist", "README.md", "docs"]
}
```

## Pre-publishing checklist

- [ ] Code builds without errors (`npm run build`)
- [ ] Tests pass (`npm test`)
- [ ] CLI works locally (`npx . --help`)
- [ ] README.md updated
- [ ] Version updated (`npm version`)
- [ ] Git changes committed and pushed
- [ ] Logged in to npm (`npm whoami`)

## NPM management commands

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

## Publishing automation

### GitHub Actions

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

### Create release

```bash
# Update version and create tag
npm version patch

# Push tag
git push origin v1.0.4

# GitHub Actions will automatically publish the package
```
