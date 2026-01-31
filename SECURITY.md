# Security Policy

## Supported Versions

We actively support the following versions of acme-love:

| Version | Supported          | Status              |
| ------- | ------------------ | ------------------- |
| 2.x.x   | :white_check_mark: | Current (latest)    |
| 1.7.x   | :white_check_mark: | Maintenance mode    |
| 1.6.x   | :white_check_mark: | Maintenance mode    |
| < 1.6   | :x:                | No longer supported |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please follow these steps:

### For Critical Security Issues

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please:

1. **Email us directly**: Send details to `roman@pohorilchuk.com`
2. **Include details**:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

3. **Response time**: We aim to respond within 24 hours
4. **Resolution time**: Critical issues will be patched within 7 days

### For Non-Critical Issues

For less critical security concerns, you can:

1. Create a private security advisory on GitHub
2. Email us at `roman@pohorilchuk.com`
3. Create a public issue (only for minor issues)

## Security Best Practices

When using acme-love:

### Account Key Security

- **Never commit account keys** to version control
- Store account keys securely (use environment variables or secure key management)
- Use different account keys for staging and production
- Rotate account keys periodically

### Network Security

- Always use HTTPS for ACME directory URLs
- Verify TLS certificates when making requests
- Use rate limiting to prevent abuse

### Validation Security

- Verify domain ownership before certificate issuance
- Use DNS-01 for wildcard certificates (more secure)
- Implement proper access controls for HTTP-01 validation

### Production Security

- Use staging environment for testing
- Monitor certificate expiration
- Implement automated renewal
- Use External Account Binding (EAB) for commercial CAs

## Cryptographic Standards

acme-love uses industry-standard cryptographic practices:

- **ECDSA**: P-256, P-384, P-521 curves (NIST approved)
- **RSA**: 2048, 3072, 4096 bit keys (NIST recommended)
- **Hashing**: SHA-256, SHA-384, SHA-512
- **TLS**: Modern TLS versions only
- **WebCrypto API**: Browser-standard cryptographic operations

## Dependencies Security

We regularly:

- Update dependencies to latest secure versions
- Run security audits (`npm audit`)
- Use automated dependency scanning
- Monitor security advisories

## Disclosure Policy

- We follow responsible disclosure practices
- Security fixes are prioritized and fast-tracked
- We provide clear communication about security updates
- We maintain a security changelog

## Contact

- **Security Email**: roman@pohorilchuk.com
- **General Issues**: https://github.com/thebitrock/acme-love/issues
- **Maintainer**: Roman Pohorilchuk (@thebitrock)

---

Thank you for helping keep acme-love secure!
