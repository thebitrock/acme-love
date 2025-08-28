# Test Account Management System

## Overview

This system provides persistent test account management for ACME Love stress tests, avoiding Let's Encrypt rate limits by reusing account keys instead of creating new accounts for every test run.

## Features

✅ **Persistent Account Storage**

- Account keys saved to `stress-test-accounts/` directory
- Automatic .gitignore protection (accounts never committed)
- JSON format with metadata (email, creation date)

✅ **CLI Management Tool**

```bash
npm run accounts list                    # List all accounts
npm run accounts create <account-id>     # Create/load account
npm run accounts delete <account-id>     # Delete account
npm run accounts cleanup [hours]        # Delete old accounts
npm run accounts prepare-stress         # Prepare all stress test accounts
```

✅ **Integration with Stress Tests**

- Light stress: 2 accounts (`light-stress-1`, `light-stress-2`)
- Quick stress: 1 account (`quick-stress-1`)
- Demo stress: 3 accounts (`demo-stress-1,2,3`)
- Heavy stress: 5 accounts (`heavy-stress-1,2,3,4,5`)
- Deadlock detection: 3 accounts (`deadlock-detection-1,2,3`)

## Directory Structure

```
stress-test-accounts/          # Git ignored
├── light-stress-1.json       # Account keys + metadata
├── light-stress-2.json
├── quick-stress-1.json
├── demo-stress-1.json
├── demo-stress-2.json
├── demo-stress-3.json
├── heavy-stress-1.json
├── heavy-stress-2.json
├── heavy-stress-3.json
├── heavy-stress-4.json
├── heavy-stress-5.json
├── deadlock-detection-1.json
├── deadlock-detection-2.json
└── deadlock-detection-3.json
```

## Account JSON Format

```json
{
  "id": "light-stress-1",
  "email": "stress-test-light-stress-1-1756315133923@acme-love.com",
  "keyPair": {
    "privateKeyPem": "-----BEGIN PRIVATE KEY-----\n...",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n..."
  },
  "createdAt": "2025-08-27T17:18:53.923Z"
}
```

## Usage Examples

### Setup Accounts for All Tests

```bash
npm run accounts prepare-stress
```

### Manual Account Management

```bash
# Create a new test account
npm run accounts create my-test-account

# List all accounts
npm run accounts list

# Delete old accounts (older than 24 hours)
npm run accounts cleanup 24

# Delete specific account
npm run accounts delete my-test-account
```

### In Test Code

```typescript
import { testAccountManager } from './utils/account-manager.js';

// Get or create persistent account keys
const accountKeys = await testAccountManager.getOrCreateAccountKeys('my-test-account');

// Use with ACME client
const core = new AcmeClientCore(STAGING_DIRECTORY_URL);
const session = new AcmeAccountSession(core, accountKeys);
```

## Benefits

### Rate Limit Avoidance

- **Problem**: Let's Encrypt limits 50 new registrations per IP per 3 hours
- **Solution**: Reuse existing account keys, only register once per account
- **Result**: Can run stress tests repeatedly without hitting registration limits

### Performance Improvement

- **Before**: Generate new keys + register account for every test run
- **After**: Load existing keys, skip registration if account exists
- **Speedup**: ~2-3 seconds saved per account per test run

### Test Isolation

- Each stress test type has dedicated accounts
- No cross-contamination between test types
- Predictable account behavior

## Security Notes

### Git Ignore Protection

The `stress-test-accounts/` directory is automatically added to `.gitignore`:

```gitignore
# Test accounts and keys (should not be committed)
test-accounts/
stress-test-accounts/
```

### Account Cleanup

- Accounts are for testing only on Let's Encrypt staging
- Automatic cleanup available: `npm run accounts cleanup [hours]`
- Default cleanup: 7 days (168 hours)

## Implementation Details

### TestAccountManager Class

Located in `__tests__/utils/account-manager.ts`:

- `getOrCreateAccountKeys(id)` - Main method for getting account keys
- `saveAccount(account)` - Save account to disk
- `loadAccount(id)` - Load account from disk
- `listAccounts()` - List all saved accounts
- `deleteAccount(id)` - Delete specific account
- `cleanupOldAccounts(hours)` - Delete accounts older than specified hours
- `getMultipleAccountKeys(baseId, count)` - Bulk account creation

### CLI Tool

Located in `__tests__/utils/account-manager-cli.ts`:

Simple command-line interface for account management, compiled to JavaScript and executed via npm script.

## Rate Limit Recovery

If you hit rate limits despite using persistent accounts:

1. **Check account status**: `npm run accounts list`
2. **Clean old accounts**: `npm run accounts cleanup 24`
3. **Wait for rate limit reset**: Let's Encrypt staging resets every 3 hours
4. **Use different IP**: If available, test from different network
5. **Reduce test frequency**: Space out test runs

## Current Status

✅ **Implemented and Working**

- Account persistence system
- CLI management tool
- Integration with light-stress and quick-stress tests
- Git ignore protection

⏳ **Pending Integration**

- Update remaining stress tests (demo, heavy, deadlock-detection)
- Add account validation and health checks
- Implement account sharing between developers

🎯 **Future Enhancements**

- Account health monitoring
- Automatic rate limit detection and backoff
- Account pool rotation
- Integration with CI/CD systems

## Troubleshooting

### "Account keys not found"

```bash
# Create the account first
npm run accounts create <account-id>
```

### "Rate limited" errors

```bash
# Clean up old accounts and wait
npm run accounts cleanup 1
# Wait 3+ hours or use different IP
```

### "Permission denied" errors

```bash
# Ensure directory permissions
chmod -R 755 stress-test-accounts/
```

### "Module not found" errors

```bash
# Rebuild the project
npm run build
```
