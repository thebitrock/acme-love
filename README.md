# ACME Love - Modern TypeScript Node.js Project

A modern TypeScript project for Node.js 22+ with ES modules support and ACME client implementation.

## 🚀 Features

- **TypeScript 5.x** with strict typing
- **Node.js 22+** with modern capabilities support
- **ES Modules** instead of CommonJS
- **Strict TypeScript configuration** for better code quality
- **Hot reload** with nodemon and tsx for development
- **Source maps** for debugging
- **Graceful shutdown** handling
- **Modern tooling** with tsx for fast TypeScript execution
- **CLI and Library support** - can be used as both
- **Automatic formatting** with Prettier on save
- **Code linting** with ESLint
- **ACME Client** - RFC 8555 compliant certificate management
- **Multiple CA support** - Let's Encrypt, Buypass, Google, ZeroSSL

## 📋 Requirements

- Node.js 22.0.0 or higher
- npm 10.0.0 or higher

## 🛠️ Installation

### As a Development Project

```bash
# Clone the repository
git clone <repository-url>
cd acme-love

# Install dependencies
npm install
```

### As an NPM Package

```bash
# Install globally for CLI usage
npm install -g acme-love

# Install locally as a dependency
npm install acme-love
```

## 🏃‍♂️ Usage

### Development

```bash
# Run in development mode with hot reload
npm run dev
```

### Production

```bash
# Build the project
npm run build

# Run the built application
npm start
```

### CLI Usage

```bash
# Run as CLI command
acme-love

# Or with npx
npx acme-love
```

### Library Usage

```typescript
import {
  Application,
  createApp,
  getVersion,
  ACMEClient,
  directory,
} from 'acme-love';

// Create an application instance
const app = new Application({
  name: 'My App',
  port: 8080,
});

// Start the application
await app.start();

// Or use utility functions
const app2 = createApp({ port: 3000 });
const version = getVersion();

// Use directory module
console.log(directory.letsencrypt.staging.directoryUrl);

// Use ACME client
const client = new ACMEClient(directory.letsencrypt.staging.directoryUrl);
const dir = await client.getDirectory();
console.log('ACME endpoints:', dir);
```

### ACME Certificate Management

```typescript
import { ACMEClient, directory } from 'acme-love';

// Create ACME client for Let's Encrypt staging
const client = new ACMEClient(directory.letsencrypt.staging.directoryUrl);

// Get directory and nonce
await client.getDirectory();
const nonce = await client.getNonce();

// Create account (requires private key)
client.setAccount({
  privateKey: '-----BEGIN PRIVATE KEY-----...',
  publicKey: '-----BEGIN PUBLIC KEY-----...',
});

// Create order for domain
const order = await client.createOrder([{ type: 'dns', value: 'example.com' }]);

// Get authorization and complete challenges
const authz = await client.getAuthorization(order.authorizations[0]);
const challenge = authz.challenges.find(c => c.type === 'http-01');

// Complete challenge and finalize order
await client.completeChallenge(challenge, keyAuthorization);
const finalOrder = await client.finalizeOrder(order.finalize, csrBuffer);

// Download certificate
const certificate = await client.downloadCertificate(finalOrder.certificate!);
```

### Code Quality

```bash
# Format code with Prettier
npm run format

# Check formatting
npm run format:check

# Lint code with ESLint
npm run lint

# Check linting
npm run lint:check

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run e2e tests
npm run test:e2e
```

### Other Commands

```bash
# Clean dist folder
npm run clean

# Build with pre-clean
npm run build

# Prepare for publishing
npm run prepublishOnly
```

## 📁 Project Structure

```
acme-love/
├── src/                    # TypeScript source code
│   ├── index.ts           # Main application file
│   ├── directory.ts       # Directory utilities
│   └── acme-client.ts     # ACME client implementation
├── dist/                   # Compiled JavaScript (auto-generated)
├── .vscode/               # VS Code settings
├── package.json           # Project configuration and dependencies
├── tsconfig.json          # TypeScript configuration
├── eslint.config.js       # ESLint configuration
├── .prettierrc            # Prettier configuration
├── nodemon.json           # Nodemon configuration
├── .npmignore             # NPM ignore rules
└── README.md              # Documentation
```

## ⚙️ Configuration

### Environment Variables

- `NODE_ENV` - environment (development/production/test)
- `PORT` - application port (default: 3000)

### TypeScript

The project uses strict TypeScript configuration with:

- ES2022 target
- NodeNext modules
- Strict typing
- Source maps
- Declaration files

### Development Tools

- **tsx** - Fast TypeScript execution without compilation
- **nodemon** - Automatic restart on file changes
- **TypeScript** - Static type checking and compilation
- **Prettier** - Code formatting
- **ESLint** - Code linting and quality checks
- **undici** - Modern HTTP client for ACME requests

### VS Code Setup

The project includes VS Code configuration for:

- Automatic formatting on save
- ESLint integration
- TypeScript support
- Recommended extensions

## 🔧 Development

### Adding New Dependencies

```bash
# Production dependencies
npm install package-name

# Development dependencies
npm install --save-dev package-name
```

### Code Structure

- Use ES modules (`import`/`export`)
- Follow TypeScript best practices
- Add types for all functions and variables
- Use interfaces to describe data structures
- Code is automatically formatted on save

### ACME Implementation

The ACME client implements [RFC 8555](https://datatracker.ietf.org/doc/html/rfc8555) with:

- JWS (JSON Web Signature) authentication
- Nonce management
- Directory discovery
- Account creation and management
- Order creation and finalization
- Challenge completion
- Certificate download and revocation

### Publishing to NPM

```bash
# Login to npm
npm login

# Publish the package
npm publish

# Publish with specific tag
npm publish --tag beta
```

## 📝 License

ISC

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

Created with ❤️ for modern TypeScript and Node.js development
