# ACME Love CLI

CLI tool for obtaining SSL certificates through the ACME protocol (Let's Encrypt and other CAs).

## Installation

### Install from npm

```bash
npm install -g acme-love
```

After installation, the `acme-love` command will be available globally.

### Local installation and usage

```bash
# Install in project
npm install acme-love

# Use through npx
npx acme-love --help
```

### Install from source code

```bash
git clone https://github.com/thebitrock/acme-love.git
cd acme-love
npm install
npm run build

# Global installation
npm link

# Now acme-love command is available globally
acme-love --help
```

## Quick Start

### Option 1: Interactive Mode (Recommended)

The easiest way to get started:

```bash
acme-love interactive
# or short form
acme-love i

# With pre-selected environment
acme-love interactive --staging # For testing
acme-love interactive --production # For real certificates
```

### Option 2: Direct Commands

```bash
# Get a staging certificate (recommended first)
acme-love cert -d acme-love.com -e admin@acme-love.com --staging

# Get a production certificate
acme-love cert -d acme-love.com -e admin@acme-love.com --production

# Create account key
acme-love create-account-key -o ./my-account.json
```

### Option 3: Development Usage

For development and testing, you have convenient wrapper options:

```bash
# Direct wrapper script (if developing from source)
./acme-love --help
./acme-love interactive --staging

# NPM Scripts
npm run cli:help # Show help
npm run cli:interactive # Interactive mode
npm run cli:staging # Interactive with staging
npm run cli:production # Interactive with production

# Make commands
make help # Show all make targets
make cli # Show CLI help
make interactive # Interactive mode
make staging # Staging mode
```

## Commands Reference

### 1. Help

```bash
acme-love --help
acme-love <command> --help
```

### 2. Create Account Key

```bash
# Create account key in account-key.json file
acme-love create-account-key

# Specify file path and algorithm
acme-love create-account-key -o ./my-account.json --algo ec-p384
```

**Options:**

- `-o, --output <path>` - Output path for account key (default: `./account-key.json`)
- `--algo <algo>` - Key algorithm: `ec-p256`, `ec-p384`, `ec-p521`, `rsa-2048`, `rsa-3072`, `rsa-4096` (default: `ec-p256`)

### 3. Certificate Command

```bash
# Interactive mode (recommended for beginners)
acme-love cert

# With command line parameters
acme-love cert -d acme-love.com -e admin@acme-love.com --staging

# Production mode (careful! there are rate limits)
acme-love cert -d acme-love.com -e admin@acme-love.com --production

# Custom ACME directory
acme-love cert -d acme-love.com -e admin@acme-love.com --directory https://acme.example.com/directory
```

**Options:**
| Parameter | Description | Example |
|-----------|-------------|---------|
| `-d, --domain <domain>` | Domain name for certificate | `-d acme-love.com` |
| `-e, --email <email>` | Email for ACME account registration | `-e admin@acme-love.com` |
| `--staging` | Use Let's Encrypt staging | `--staging` |
| `--production` | Use Let's Encrypt production | `--production` |
| `--directory <url>` | Custom ACME directory | `--directory https://acme.ca.com/dir` |
| `-o, --output <path>` | Output directory for certificates | `-o ./certs` |
| `--account-key <path>` | Path to account key | `--account-key ./account.json` |
| `--force` | Force certificate renewal | `--force` |
| `--challenge <type>` | Challenge type: `dns-01` or `http-01` | `--challenge dns-01` |
| `--account-algo <algo>` | Account key algorithm | `--account-algo ec-p256` |
| `--cert-algo <algo>` | Certificate key algorithm | `--cert-algo ec-p384` |
| `--eab-kid <kid>` | External Account Binding key identifier | `--eab-kid your-kid` |
| `--eab-hmac-key <key>` | External Account Binding HMAC key (base64url) | `--eab-hmac-key your-key` |

### 4. Interactive Mode

```bash
acme-love interactive
# or short form
acme-love i

# With environment pre-selection
acme-love interactive --staging
acme-love interactive --production
acme-love interactive --directory https://custom.acme.com/directory
```

## Challenge Types

### DNS-01 Challenge (Recommended)

```bash
acme-love cert --challenge dns-01 -d acme-love.com -e user@acme-love.com --staging
```

**Advantages:**

- Works with wildcard certificates (`*.acme-love.com`)
- No need for public web server
- More secure as no web server exposure required

**Requirements:**

- DNS provider access to add TXT records

**Process:**

1. CLI will show DNS TXT record to add:

```
Record Type: TXT
Record Name: _acme-challenge.acme-love.com
Record Value: AbCdEf123456...
```

2. Add this record to your domain's DNS
3. Wait for propagation (usually 5-15 minutes)
4. Confirm in CLI that record is added

### HTTP-01 Challenge

```bash
acme-love cert --challenge http-01 -d acme-love.com -e user@acme-love.com --staging
```

**Advantages:**

- Simple validation via HTTP file
- Automatic validation with built-in checker

**Requirements:**

- Domain must point to your web server
- Web server must serve files from `/.well-known/acme-challenge/`

## Cryptographic Algorithms

The CLI supports multiple cryptographic algorithms for both account and certificate keys:

### ECDSA (Elliptic Curve) - Recommended

- `ec-p256` - **Default**, fast and secure (equivalent to RSA 3072)
- `ec-p384` - Higher security (equivalent to RSA 7680)
- `ec-p521` - Maximum security (equivalent to RSA 15360)

### RSA

- `rsa-2048` - Minimum recommended RSA
- `rsa-3072` - Standard RSA
- `rsa-4096` - High security RSA

**Examples:**

```bash
# Use different algorithms for account and certificate
acme-love cert -d acme-love.com --account-algo ec-p384 --cert-algo rsa-4096

# Create account key with specific algorithm
acme-love create-account-key --algo ec-p521 -o high-security-account.json
```

## External Account Binding (EAB)

For commercial CAs that require EAB (like ZeroSSL, Google Trust Services):

```bash
acme-love cert \
 -d acme-love.com \
 -e admin@acme-love.com \
 --eab-kid "your-key-identifier" \
 --eab-hmac-key "your-base64url-hmac-key" \
 --directory https://acme.zerossl.com/v2/DV90
```

## Usage Examples

### Get Test Certificate

```bash
# 1. Create account key
acme-love create-account-key -o ./staging-account.json

# 2. Get test certificate
acme-love cert \
 -d test.acme-love.com \
 -e admin@acme-love.com \
 --staging \
 --account-key ./staging-account.json \
 -o ./certificates
```

### Get Production Certificate

** Warning:** Let's Encrypt has rate limits on production. Always test with staging first!

```bash
# 1. Create production account key
acme-love create-account-key -o ./production-account.json

# 2. Get production certificate
acme-love cert \
 -d acme-love.com \
 -e admin@acme-love.com \
 --production \
 --account-key ./production-account.json \
 -o ./certificates
```

### Working with Other CAs

```bash
# Buypass
acme-love cert \
 -d acme-love.com \
 -e admin@acme-love.com \
 --directory https://api.buypass.com/acme/directory

# Google Trust Services
acme-love cert \
 -d acme-love.com \
 -e admin@acme-love.com \
 --directory https://dv.acme-v02.api.pki.goog/directory

# ZeroSSL (requires EAB)
acme-love cert \
 -d acme-love.com \
 -e admin@acme-love.com \
 --directory https://acme.zerossl.com/v2/DV90 \
 --eab-kid "your-kid" \
 --eab-hmac-key "your-hmac-key"
```

## Certificate Obtaining Process

1. **Create/load account**: CLI will create a new ACME account or load existing one
2. **Create order**: Create certificate order for specified domain
3. **Challenge**: CLI will present the appropriate challenge (DNS or HTTP)
4. **Validation**: Complete the challenge as instructed
5. **Verification**: ACME server will verify the challenge
6. **Generate CSR**: CLI will create Certificate Signing Request
7. **Get certificate**: CA will issue the certificate
8. **Save**: Certificate, key and CSR are saved to specified directory

## File Structure

After successful certificate obtaining, these files are created:

```
certificates/
 acme-love.com.crt # SSL certificate
 acme-love.com.key # Private key
 acme-love.com.csr # Certificate Signing Request
 account-key.json # ACME account key (if created automatically)
```

## Validation Helpers

### Check DNS Record Propagation

```bash
# Linux/macOS
nslookup -type=TXT _acme-challenge.acme-love.com

# Alternative with dig
dig TXT _acme-challenge.acme-love.com

# Online tools
# https://toolbox.googleapps.com/apps/dig/
# https://www.whatsmydns.net/
```

### Check HTTP Challenge

```bash
# Test if HTTP challenge file is accessible
curl -I http://acme-love.com/.well-known/acme-challenge/test-file
```

## Automation

### Script for Automatic Renewal

```bash
#!/bin/bash
# renew-cert.sh

DOMAIN="acme-love.com"
EMAIL="admin@acme-love.com"
CERT_DIR="./certificates"
ACCOUNT_KEY="./account-key.json"

# Get/renew certificate
acme-love cert \
 -d "$DOMAIN" \
 -e "$EMAIL" \
 --production \
 --account-key "$ACCOUNT_KEY" \
 -o "$CERT_DIR" \
 --force

# Restart web server (example for nginx)
if [ $? -eq 0 ]; then
 sudo systemctl reload nginx
 echo "Certificate renewed and nginx reloaded"
else
 echo "Certificate renewal failed"
 exit 1
fi
```

### CI/CD Integration

```yaml
# .github/workflows/renew-cert.yml
name: Renew SSL Certificate

on:
 schedule:
 - cron: '0 0 1 * *' # Monthly
 workflow_dispatch:

jobs:
 renew:
 runs-on: ubuntu-latest
 steps:
 - uses: actions/checkout@v3

 - name: Setup Node.js
 uses: actions/setup-node@v3
 with:
 node-version: '20'

 - name: Install ACME Love
 run: npm install -g acme-love

 - name: Renew Certificate
 run: |
 echo "${{ secrets.ACCOUNT_KEY }}" > account-key.json
 acme-love cert \
 -d ${{ secrets.DOMAIN }} \
 -e ${{ secrets.EMAIL }} \
 --production \
 --account-key ./account-key.json
 env:
 # Add these secrets in GitHub
 DOMAIN: acme-love.com
 EMAIL: admin@acme-love.com
 ACCOUNT_KEY: ${{ secrets.ACME_ACCOUNT_KEY }}
```

## Debugging

### Enable Verbose Output

```bash
export DEBUG=acme-love:*
acme-love cert -d acme-love.com -e admin@acme-love.com --staging
```

### Common Issues and Solutions

1. **DNS record not found**

- Check that DNS record is added correctly and propagated
- Use online DNS checker tools
- Wait longer for propagation (up to 24 hours in some cases)

2. **Rate limits**

- Let's Encrypt has limits - use staging for testing
- Wait for rate limit reset (usually 1 hour for most limits)
- Consider using different CA if hitting limits frequently

3. **Invalid account**

- Account key is corrupted - create new one
- Check file permissions and format

4. **Domain validation failed**

- Make sure domain points to your server (for HTTP-01)
- Verify DNS record is correct (for DNS-01)
- Check firewall settings

5. **HTTP challenge file not accessible**

- Verify web server is running and accessible
- Check that `/.well-known/acme-challenge/` directory exists and is writable
- Verify no redirects from HTTP to HTTPS for challenge path

## Supported CAs

| CA            | Staging URL                                              | Production URL                                   |
| ------------- | -------------------------------------------------------- | ------------------------------------------------ |
| Let's Encrypt | `https://acme-staging-v02.api.letsencrypt.org/directory` | `https://acme-v02.api.letsencrypt.org/directory` |
| Buypass       | `https://api.test4.buypass.no/acme/directory`            | `https://api.buypass.com/acme/directory`         |
| Google Trust  | `https://dv.acme-v02.test-api.pki.goog/directory`        | `https://dv.acme-v02.api.pki.goog/directory`     |
| ZeroSSL       | -                                                        | `https://acme.zerossl.com/v2/DV90`               |

## Security Best Practices

- Store account keys in secure location with proper file permissions
- Don't transfer private keys through unsecured channels
- Regularly update certificates before expiration
- Always test with staging environment first
- Backup account keys securely
- Use strong algorithms (default `ec-p256` is recommended)
- Monitor certificate expiration dates

## Performance Tips

- Use ECDSA algorithms (faster than RSA)
- Keep account keys for reuse (faster than creating new accounts)
- Cache DNS records locally during propagation checks
- Use HTTP-01 for faster validation when possible
- Monitor rate limits to avoid delays

## License

MIT License - see LICENSE file in repository.
