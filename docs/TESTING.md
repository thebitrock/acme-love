# ACME Love Testing Guide

This document describes the testing structure and commands for ACME Love.

## Test Organization

Tests are organized into separate categories to optimize development workflow and CI/CD performance:

### 🔬 Core Tests (Fast)

Run with: `npm test`
Duration: ~1-2 minutes

- **Unit Tests**: Mock-based component testing
- **Integration Tests**: Basic API integration
- **Debug System Tests**: Logging and debug functionality
- **CSR Tests**: Certificate Signing Request generation
- **Rate Limiting Tests**: Rate limit detection and handling

### 🚀 Stress Tests (Separate)

Duration: 30 seconds - 10 minutes each

Individual stress tests can be run with:

```bash
# Quick tests (~30 seconds each)
npm run test:quick      # 1 account × 2 orders
npm run test:light      # 2 accounts × 3 orders
npm run test:demo       # 2 accounts × 5 orders

# Standard tests (~2 minutes each)
npm run test:stress     # 6 accounts × 10 orders
npm run test:metrics    # Performance metrics collection

# Heavy tests (~10+ minutes)
npm run test:heavy      # 4 accounts × 200 orders
npm run test:deadlock   # Deadlock detection analysis
```

### 🌐 E2E Tests

Run with: `npm run test:e2e`
Duration: ~2-5 minutes

Full workflow testing with Let's Encrypt staging environment.

## Test Groups

For convenience, stress tests can be run in groups:

```bash
# Run fast stress tests only (~2 minutes total)
npm run test:stress:fast

# Run all stress tests (~15 minutes total)
npm run test:stress:all

# Run everything including stress tests (~20 minutes total)
npm run test:all
```

## Environment Requirements

### Standard Tests

- No special requirements
- Uses mocked HTTP responses for most unit tests
- Some tests use Let's Encrypt staging (rate limited)

### Stress Tests

- Requires internet connection
- Uses Let's Encrypt staging environment
- Subject to Let's Encrypt rate limits:
  - 50 new registrations per IP per 3 hours
  - 300 new orders per account per 3 hours
  - Various other staging limits

## CI/CD Integration

### Fast CI Pipeline

```bash
npm test           # Core tests only (~1-2 minutes)
```

### Full Validation Pipeline

```bash
npm run test:all   # Everything including stress tests (~20 minutes)
```

### Stress Test Pipeline

```bash
npm run test:stress:fast  # Quick validation (~2 minutes)
# OR
npm run test:stress:all   # Full stress validation (~15 minutes)
```

## Development Workflow

### During Development

```bash
npm test                    # Quick feedback
npm run test:watch          # Continuous testing
```

### Before PR

```bash
npm run test:coverage       # Generate coverage report
npm run test:stress:fast    # Quick stress validation
```

### Before Release

```bash
npm run test:all           # Full test suite
```

## Debugging Failed Tests

### Rate Limit Issues

If stress tests fail due to rate limits:

1. Wait for rate limit window to reset (check error message)
2. Use different test data/domains
3. Run tests individually with delays between them

### Network Issues

If tests fail due to network connectivity:

1. Check internet connection to staging.api.letsencrypt.org
2. Verify DNS resolution
3. Run with DEBUG=acme-love:\* for detailed logs

### Memory/Performance Issues

If tests are slow or consume too much memory:

1. Run individual test suites instead of full suite
2. Check for open handles with `--detectOpenHandles`
3. Monitor memory usage during long-running tests

## Test Data

Stress tests use dynamically generated test data:

- Random 8-character subdomains under acme-love.com
- Unique account keys per test run
- Temporary certificate requests (not downloaded)

This avoids conflicts with Let's Encrypt's duplicate certificate limits.

## Contributing

When adding new tests:

1. **Unit tests**: Add to existing test files or create new ones
2. **Stress tests**: Follow the naming pattern `*-stress.test.ts`
3. **E2E tests**: Add to `__tests__/e2e/` directory

Stress tests will automatically be excluded from `npm test` but included in `npm run test:all`.
