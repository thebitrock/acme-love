#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import readline from 'readline';

// Console colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

const log = (msg, color = 'blue') => console.log(`${colors[color]}[INFO]${colors.reset} ${msg}`);
const success = (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`);
const warning = (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`);
const error = (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`);

// Function to execute commands
const run = (command, silent = false) => {
  try {
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
    });
    return silent ? result.trim() : true;
  } catch (err) {
    if (silent) return null;
    throw err;
  }
};

// Function for user input
const ask = (question) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

// Check git status
const checkGitStatus = () => {
  const status = run('git status --porcelain', true);
  if (status) {
    error('You have uncommitted changes!');
    console.log(run('git status --short', true));
    return false;
  }
  return true;
};

// Check current branch
const checkBranch = () => {
  const branch = run('git branch --show-current', true);
  return branch === 'main' || branch === 'master';
};

// Check npm authentication
const checkNpmAuth = () => {
  const user = run('npm whoami', true);
  if (!user) {
    error('You are not authenticated with npm! Run: npm login');
    return false;
  }
  log(`Authenticated as: ${user}`);
  return true;
};

// Get current version
const getCurrentVersion = () => {
  const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
  return pkg.version;
};

// Main function
const main = async () => {
  console.log('🚀 Automated ACME Love package publishing');
  console.log('==========================================');

  const publishType = process.argv[2];

  if (!publishType) {
    console.log('Usage: node scripts/publish.mjs <patch|minor|major|beta|alpha|dry>');
    console.log('');
    console.log('Options:');
    console.log('  patch  - Patch version (1.0.0 -> 1.0.1)');
    console.log('  minor  - Minor version (1.0.0 -> 1.1.0)');
    console.log('  major  - Major version (1.0.0 -> 2.0.0)');
    console.log('  beta   - Beta version (1.0.0 -> 1.0.1-beta.0)');
    console.log('  alpha  - Alpha version (1.0.0 -> 1.0.1-alpha.0)');
    console.log('  dry    - Dry run only (no publishing)');
    process.exit(1);
  }

  try {
    // Dry run
    if (publishType === 'dry') {
      log('Dry run mode');
      if (!checkGitStatus()) {
        const answer = await ask('Continue? (y/N): ');
        if (answer.toLowerCase() !== 'y') process.exit(1);
      }

      log('Running code formatting check...');
      run('npm run format:check');
      success('Code formatting is correct');

      log('Running linting check...');
      run('npm run lint:check');
      success('Linting passed');

      log('Running tests...');
      run('npm test');
      success('Tests passed');

      log('Building project...');
      run('npm run clean');
      run('npm run build:prod');
      success('Build completed');

      log('Package size:');
      run('npm pack --dry-run');

      success('Dry run completed successfully');
      return;
    } // Checks
    if (!checkNpmAuth()) process.exit(1);

    if (!checkGitStatus()) {
      const answer = await ask('Continue? (y/N): ');
      if (answer.toLowerCase() !== 'y') process.exit(1);
    }

    if (!checkBranch()) {
      warning('You are not on main/master branch');
      const answer = await ask('Continue? (y/N): ');
      if (answer.toLowerCase() !== 'y') process.exit(1);
    }

    // Tests and build
    log('Running code formatting check...');
    run('npm run format:check');
    success('Code formatting is correct');

    log('Running linting check...');
    run('npm run lint:check');
    success('Linting passed');

    log('Running tests...');
    run('npm test');
    success('Tests passed');

    log('Building project...');
    run('npm run clean');
    run('npm run build:prod');
    success('Build completed');

    log('Package size:');
    run('npm pack --dry-run');

    // Confirmation
    const currentVersion = getCurrentVersion();
    log(`Current version: ${currentVersion}`);
    const confirm = await ask(`Continue with publishing (${publishType})? (y/N): `);
    if (confirm.toLowerCase() !== 'y') {
      log('Publishing cancelled');
      return;
    }

    // Publishing
    switch (publishType) {
      case 'patch':
      case 'minor':
      case 'major':
        log(`Updating version (${publishType})...`);
        run(`npm version ${publishType}`);
        log('Publishing...');
        run('npm publish');
        break;

      case 'beta':
        log('Updating version (beta)...');
        run('npm version prerelease --preid=beta');
        log('Publishing with beta tag...');
        run('npm publish --tag beta');
        break;

      case 'alpha':
        log('Updating version (alpha)...');
        run('npm version prerelease --preid=alpha');
        log('Publishing with alpha tag...');
        run('npm publish --tag alpha');
        break;

      default:
        error(`Unknown publish type: ${publishType}`);
        process.exit(1);
    }

    log('Pushing changes to git...');
    run('git push && git push --tags');

    const newVersion = getCurrentVersion();
    console.log('');
    success(`🎉 Package acme-love@${newVersion} published successfully!`);
    console.log('📦 https://www.npmjs.com/package/acme-love');
  } catch (err) {
    error(`Error: ${err.message}`);
    process.exit(1);
  }
};

main();
