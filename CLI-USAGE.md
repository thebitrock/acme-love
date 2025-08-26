# 🚀 ACME-Love CLI - Quick Start Guide

## Development Usage

Instead of typing `node dist/src/cli.js` every time, you now have several convenient options:

### 🎯 Option 1: Direct wrapper script (Recommended)

```bash
./acme-love --help
./acme-love interactive
./acme-love interactive --staging
./acme-love cert -d example.com -e user@example.com
```

### 📦 Option 2: NPM Scripts

```bash
npm run cli:help         # Show help
npm run cli:interactive  # Interactive mode
npm run cli:staging      # Interactive with staging
npm run cli:production   # Interactive with production
npm run cli:cert         # Cert command help
```

### 🔨 Option 3: Make commands

```bash
make help        # Show all make targets
make cli         # Show CLI help
make interactive # Interactive mode
make staging     # Staging mode
make production  # Production mode
make cert        # Cert command
```

### 🌐 Option 4: Global installation (Optional)

```bash
# For global access anywhere
sudo npm link
acme-love --help

# Unlink when done
sudo npm unlink
```

## Quick Examples

### Get a staging certificate interactively:

```bash
./acme-love interactive --staging
# or
make staging
```

### Get a production certificate with parameters:

```bash
./acme-love cert --production -d mysite.com -e admin@mysite.com
```

### Create account key:

```bash
./acme-love create-account-key -o ./my-account.json
```

## Development Workflow

1. Make changes to TypeScript code
2. Run: `./acme-love --help` (automatically builds)
3. Or use: `make interactive` for quick testing

The wrapper script automatically rebuilds when needed! 🎉
