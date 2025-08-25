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

## Usage

### Basic commands

#### 1. Help

```bash
acme-love --help
acme-love <command> --help
```

#### 2. Create account key

```bash
# Create account key in account-key.json file
acme-love create-account-key

# Specify file path
acme-love create-account-key -o ./my-account.json
```

#### 3. Obtain certificate

```bash
# Interactive mode (recommended for beginners)
acme-love cert

# With command line parameters
acme-love cert -d example.com -e admin@example.com --staging

# Production mode (careful! there are rate limits)
acme-love cert -d example.com -e admin@example.com --production

# Custom ACME directory
acme-love cert -d example.com -e admin@example.com --directory https://acme.example.com/directory
```

#### 4. Interactive mode

```bash
acme-love interactive
# or short form
acme-love i
```

#### 5. Check certificate status

```bash
# Check local certificate
acme-love status -c ./certificates/example.com.crt

# Check domain (in development)
acme-love status -d example.com
```

### Parameters for cert command

| Parameter               | Description                         | Example                               |
| ----------------------- | ----------------------------------- | ------------------------------------- |
| `-d, --domain <domain>` | Domain name for certificate         | `-d example.com`                      |
| `-e, --email <email>`   | Email for ACME account registration | `-e admin@example.com`                |
| `--staging`             | Use Let's Encrypt staging           | `--staging`                           |
| `--production`          | Use Let's Encrypt production        | `--production`                        |
| `--directory <url>`     | Custom ACME directory               | `--directory https://acme.ca.com/dir` |
| `-o, --output <path>`   | Output directory for certificates   | `-o ./certs`                          |
| `--account-key <path>`  | Path to account key                 | `--account-key ./account.json`        |
| `--force`               | Force certificate renewal           | `--force`                             |

## Usage examples

### Get test certificate

```bash
# 1. Create account key
acme-love create-account-key -o ./staging-account.json

# 2. Get test certificate
acme-love cert \
  -d test.example.com \
  -e admin@example.com \
  --staging \
  --account-key ./staging-account.json \
  -o ./certificates
```

### Get production certificate

**⚠️ Warning:** Let's Encrypt has rate limits on production. Always test with staging first!

```bash
# 1. Create production account key
acme-love create-account-key -o ./production-account.json

# 2. Get production certificate
acme-love cert \
  -d example.com \
  -e admin@example.com \
  --production \
  --account-key ./production-account.json \
  -o ./certificates
```

### Working with other CAs

```bash
# Buypass
acme-love cert \
  -d example.com \
  -e admin@example.com \
  --directory https://api.buypass.com/acme/directory

# Google Trust Services
acme-love cert \
  -d example.com \
  -e admin@example.com \
  --directory https://dv.acme-v02.api.pki.goog/directory

# ZeroSSL
acme-love cert \
  -d example.com \
  -e admin@example.com \
  --directory https://acme.zerossl.com/v2/DV90
```

## Certificate obtaining process

1. **Create/load account**: CLI will create a new ACME account or load existing one
2. **Create order**: Create certificate order for specified domain
3. **DNS Challenge**: CLI will show DNS TXT record to add
4. **Confirmation**: After adding DNS record, confirm to continue
5. **Verification**: ACME server will verify DNS record
6. **Generate CSR**: CLI will create Certificate Signing Request
7. **Get certificate**: CA will issue the certificate
8. **Save**: Certificate, key and CSR are saved to specified directory

## File structure

After successful certificate obtaining, these files are created:

```
certificates/
├── example.com.crt    # SSL certificate
├── example.com.key    # Private key
├── example.com.csr    # Certificate Signing Request
└── account-key.json   # ACME account key (if created automatically)
```

## DNS Challenge

CLI supports only DNS-01 challenge for maximum compatibility and security:

1. CLI will show DNS record to add:

   ```
   Record Type: TXT
   Record Name: _acme-challenge.example.com
   Record Value: AbCdEf123456...
   ```

2. Add this record to your domain's DNS

3. Wait for propagation (usually 5-15 minutes)

4. Check propagation:

   ```bash
   nslookup -type=TXT _acme-challenge.example.com
   ```

5. Confirm in CLI that record is added

## Automation

### Script for automatic renewal

```bash
#!/bin/bash
# renew-cert.sh

DOMAIN="example.com"
EMAIL="admin@example.com"
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

### CI/CD integration

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
          DOMAIN: example.com
          EMAIL: admin@example.com
          ACCOUNT_KEY: ${{ secrets.ACME_ACCOUNT_KEY }}
```

## Debugging

### Enable verbose output

```bash
export DEBUG=acme-love:*
acme-love cert -d example.com -e admin@example.com --staging
```

### Check DNS record

```bash
# Linux/macOS
nslookup -type=TXT _acme-challenge.example.com

# Windows
nslookup -type=TXT _acme-challenge.example.com

# Online tools
# https://toolbox.googleapps.com/apps/dig/
# https://www.whatsmydns.net/
```

### Common errors

1. **DNS record not found**: Check that DNS record is added correctly and propagated
2. **Rate limits**: Let's Encrypt has limits - use staging for testing
3. **Invalid account**: Account key is corrupted - create new one
4. **Domain validation failed**: Make sure domain points to your server

## Supported CAs

| CA            | Staging URL                                              | Production URL                                   |
| ------------- | -------------------------------------------------------- | ------------------------------------------------ |
| Let's Encrypt | `https://acme-staging-v02.api.letsencrypt.org/directory` | `https://acme-v02.api.letsencrypt.org/directory` |
| Buypass       | `https://api.test4.buypass.no/acme/directory`            | `https://api.buypass.com/acme/directory`         |
| Google Trust  | `https://dv.acme-v02.test-api.pki.goog/directory`        | `https://dv.acme-v02.api.pki.goog/directory`     |
| ZeroSSL       | -                                                        | `https://acme.zerossl.com/v2/DV90`               |

## Security

- Store account keys in secure location
- Don't transfer private keys through unsecured channels
- Regularly update certificates
- Use staging for testing
- Backup account keys

## License

ISC License - see LICENSE file in repository.
