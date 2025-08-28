---
name: 🐛 Bug Report
about: Create a report to help us improve acme-love
title: '[BUG] '
labels: ['bug', 'needs-triage']
assignees: ['thebitrock']
---

## 🐛 Bug Description

A clear and concise description of what the bug is.

## 🔄 Steps to Reproduce

Steps to reproduce the behavior:

1. Run command '...'
2. With options '...'
3. See error

## ✅ Expected Behavior

A clear and concise description of what you expected to happen.

## ❌ Actual Behavior

A clear and concise description of what actually happened.

## 🖥️ Environment

- **acme-love version**: [e.g. 1.5.0]
- **Node.js version**: [e.g. 20.18.1]
- **npm version**: [e.g. 10.0.0]
- **Operating System**: [e.g. Ubuntu 22.04, macOS 14, Windows 11]
- **Architecture**: [e.g. x64, arm64]

## 📋 Command Used

```bash
# Paste the exact command that caused the issue
acme-love cert --domain example.com --email test@example.com --staging
```

## 📄 Error Output

```
# Paste the full error message and stack trace
Error: Something went wrong...
```

## 📝 Debug Logs

If possible, run with debug logging and paste the output:

```bash
DEBUG=acme-love:* your-command-here
```

## 📎 Additional Context

Add any other context about the problem here:

- Configuration files used
- Network environment (firewall, proxy, etc.)
- DNS setup
- Previous commands that worked/didn't work

## 🔍 Possible Solution

If you have ideas on how to fix this, please share them here.

## ✅ Checklist

- [ ] I have searched existing issues to ensure this is not a duplicate
- [ ] I have included all required environment information
- [ ] I have provided steps to reproduce the issue
- [ ] I have included error messages and logs
- [ ] I have tested with the latest version of acme-love
