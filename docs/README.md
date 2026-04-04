# ACME Love Documentation

Detailed guides for the ACME Love library. For a general overview see the [main README](../README.md).

## Guides

| Document                                   | Description                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| [CLI.md](CLI.md)                           | CLI commands reference — interactive mode, cert issuance, challenge types, algorithms |
| [EAB.md](EAB.md)                           | External Account Binding — CLI and programmatic usage for ZeroSSL, Google Trust, etc. |
| [NONCE-MANAGER.md](NONCE-MANAGER.md)       | Nonce pooling internals — architecture, tuning, API reference                         |
| [RATE-LIMIT-GUIDE.md](RATE-LIMIT-GUIDE.md) | Rate limiting — Let's Encrypt limits, configuration, monitoring, debugging            |

## Test Reports

Auto-generated reports in [reports/](reports/):

| Report                                                                     | Description                                 |
| -------------------------------------------------------------------------- | ------------------------------------------- |
| [QUICK-STRESS-TEST-RESULTS.md](reports/QUICK-STRESS-TEST-RESULTS.md)       | Quick stress test baseline                  |
| [STANDARD-STRESS-TEST-RESULTS.md](reports/STANDARD-STRESS-TEST-RESULTS.md) | Standard load test results                  |
| [HEAVY-STRESS-TEST-RESULTS.md](reports/HEAVY-STRESS-TEST-RESULTS.md)       | Heavy load test results                     |
| [RATE-LIMITING-SUMMARY.md](reports/RATE-LIMITING-SUMMARY.md)               | Rate limiting analysis                      |
| [DEADLOCK-FIX-REPORT.md](reports/DEADLOCK-FIX-REPORT.md)                   | NonceManager deadlock resolution (Aug 2025) |
| [ACCOUNT-MANAGEMENT-SUMMARY.md](reports/ACCOUNT-MANAGEMENT-SUMMARY.md)     | Account key persistence system              |

## Quick Links

- [Main README](../README.md) — project overview, quick start, full API reference
- [QUICK-START.md](../QUICK-START.md) — library API examples
- [CONTRIBUTING.md](../CONTRIBUTING.md) — development setup, testing, PR guidelines
- [CHANGELOG.md](../CHANGELOG.md) — version history
- [examples/](../examples/) — code examples
- [\_\_tests\_\_/](../__tests__/) — test files
