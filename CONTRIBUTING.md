# Contributing to ACME Love 🔐

Thank you for your interest in contributing to acme-love! We welcome contributions from the community.

## 🚀 Quick Start

1. **Fork the repository**
2. **Clone your fork**: `git clone https://github.com/thebitrock/acme-love.git`
3. **Install dependencies**: `npm install`
4. **Run tests**: `npm test`
5. **Make your changes**
6. **Submit a pull request**

## 📋 Development Setup

### Prerequisites

- **Node.js** 20.18.1 or higher
- **npm** 10.0.0 or higher
- **Git**

### Installation

```bash
git clone https://github.com/thebitrock/acme-love.git
cd acme-love
npm install
```

### Development Commands

```bash
# Build the project
npm run build

# Run tests
npm test                    # Unit tests
npm run test:e2e           # E2E tests (requires setup)
npm run test:coverage     # Coverage report

# Code quality
npm run lint              # Check code style
npm run format           # Format code

# CLI development
npm run cli:help         # Test CLI
npm run cli:staging      # Interactive staging mode
```

## 🧪 Testing

We have comprehensive test coverage:

- **Unit tests**: Core functionality
- **Integration tests**: ACME protocol compliance
- **E2E tests**: Real certificate issuance (staging)
- **Stress tests**: Performance and reliability

### Running Tests

```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit
npm run test:e2e
npm run test:stress

# Run with coverage
npm run test:coverage
```

## 📝 Code Style

We use:

- **ESLint** for code linting
- **Prettier** for code formatting
- **TypeScript** for type safety

### Before submitting:

```bash
npm run lint:check      # Check for issues
npm run format:check    # Check formatting
npm run test           # Ensure tests pass
```

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Environment details**:
   - Node.js version
   - npm version
   - Operating system
   - acme-love version

2. **Reproduction steps**:
   - Minimal code example
   - Command that fails
   - Expected vs actual behavior

3. **Error details**:
   - Full error message
   - Stack trace (if available)
   - Debug logs (`DEBUG=acme-love:* your-command`)

## ✨ Feature Requests

For new features, please:

1. **Check existing issues** to avoid duplicates
2. **Explain the use case** and why it's needed
3. **Provide examples** of how it would work
4. **Consider backwards compatibility**

## 🔧 Pull Requests

### Guidelines

1. **One feature per PR** - Keep changes focused
2. **Write tests** - All new code should be tested
3. **Update documentation** - Keep docs in sync
4. **Follow code style** - Use our linting/formatting rules
5. **Write clear commit messages** - Use conventional commits

### PR Checklist

- [ ] Tests pass (`npm test`)
- [ ] Code is linted (`npm run lint:check`)
- [ ] Code is formatted (`npm run format:check`)
- [ ] Documentation is updated
- [ ] CHANGELOG.md is updated (for significant changes)
- [ ] PR description explains the change

### Commit Message Format

We use [Conventional Commits](https://conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Examples:

```
feat(cli): add support for wildcard certificates
fix(nonce): resolve race condition in nonce manager
docs(readme): update installation instructions
test(e2e): add tests for EAB functionality
```

## 📚 Documentation

Help us improve documentation by:

- Fixing typos and grammar
- Adding examples
- Improving clarity
- Translating to other languages

Documentation files:

- `README.md` - Main documentation
- `docs/` - Detailed guides
- Code comments - Inline documentation

## 🏗️ Architecture

### Project Structure

```
src/
├── cli.ts              # CLI entry point
├── index.ts            # Library entry point
├── types.ts            # TypeScript definitions
├── acme/               # ACME protocol implementation
├── utils/              # Utility functions
└── ...

__tests__/              # Test files
docs/                   # Documentation
```

### Key Components

- **ACME Client**: Core protocol implementation
- **Nonce Manager**: Handles ACME nonce pooling
- **CLI**: Command-line interface
- **CSR Generator**: Certificate signing request creation
- **Validators**: Challenge validation helpers

## 🎯 Areas for Contribution

We especially welcome contributions in:

1. **New ACME providers** - Support for additional CAs
2. **Challenge types** - New validation methods
3. **CLI improvements** - Better user experience
4. **Documentation** - Examples, guides, translations
5. **Testing** - More comprehensive test coverage
6. **Performance** - Optimizations and benchmarks

## 🤝 Community

- **Security Email**: roman@pohorilchuk.com for security issues
- **General Issues**: https://github.com/thebitrock/acme-love/issues
- **Discussions**: General questions and ideas
- **Email**: roman@pohorilchuk.com for direct contact
- **Maintainer**: Roman Pohorilchuk (@thebitrock)

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙏 Recognition

Contributors are recognized in:

- GitHub contributors list
- CHANGELOG.md (for significant contributions)
- Special thanks in releases

---

Happy coding! 🚀
