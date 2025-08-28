# ACME Love - Automation and Optimization

## 📦 Package Size Optimization

**Achieved**: Size reduction from 131.8 kB to **41.9 kB** (-68%)

### Optimization Settings:

1. **Production Build** (`tsconfig.prod.json`):

   ```json
   {
     "extends": "./tsconfig.json",
     "compilerOptions": {
       "sourceMap": false,
       "declaration": true,
       "declarationMap": false
     }
   }
   ```

2. **Exclusions in `.npmignore`**:
   - Tests and stress tests
   - Development documentation
   - Source maps
   - Development configuration files

3. **File restrictions in `package.json`**:
   ```json
   "files": [
     "dist/",
     "README.md",
     "LICENSE"
   ]
   ```

## 🚀 Automated Publishing

Fully automated publishing scripts with comprehensive safety checks.

**📖 For detailed commands and usage see: [`PUBLISHING.md`](PUBLISHING.md)**

### Key Features:

**Security & Quality:**

- ✅ Git status verification
- ✅ Current branch check (main/master)
- ✅ npm authentication check
- ✅ Code formatting validation (Prettier)
- ✅ Linting checks (ESLint)
- ✅ Complete test suite execution

**Automation:**

- ✅ Clean and production build
- ✅ Automatic versioning
- ✅ Git commit and tag creation
- ✅ npm publishing
- ✅ Repository synchronization

## 🛠️ Code Quality Settings

### Prettier (formatting)

```bash
npm run format        # Fix formatting
npm run format:check  # Check formatting
```

### ESLint (linting)

```bash
npm run lint:check    # Check code
```

### `.prettierrc` Configuration:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false
}
```

## 📋 Release Process

**📖 For step-by-step guide see: [`PUBLISHING.md`](PUBLISHING.md)**

Quick overview:

1. **Preparation**: Ensure all changes are committed
2. **Testing**: `npm run release:dry`
3. **Publishing**: `npm run release:patch` (or minor/major)
4. **Automatic**: Code is formatted, tested, built and published

## 📂 Documentation Structure

```
docs/
├── README.md                    # Main documentation
├── PUBLISHING.md                # Publishing guide (automated + manual)
├── AUTOMATION-SUMMARY.md        # This file - technical overview
├── CHANGELOG.md                 # Change history
├── CLI.md                       # CLI documentation
├── TESTING.md                   # Testing
├── RATE-LIMIT-GUIDE.md          # Rate limits handling
└── reports/                     # Auto-generated reports
    ├── HEAVY-STRESS-TEST-RESULTS.md
    └── ...
```

## 🎯 Optimization Results

- **Package Size**: 131.8 kB → 41.9 kB (-68%)
- **Automation**: Fully automated release process
- **Quality**: Enforced code checks
- **Security**: Multiple pre-publish validations
- **Documentation**: Centralized in `docs/` folder

## 🔧 Technical Details

**Publishing Scripts:**

- `scripts/publish.sh` - Bash version
- `scripts/publish.mjs` - Node.js version
- `scripts/help.sh` - Command help

**npm scripts integration**: All commands available via `npm run`

**Cross-platform**: Node.js version works on all platforms
