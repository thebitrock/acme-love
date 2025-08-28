#!/usr/bin/env node

/**
 * SEO and Package Quality Checker for acme-love
 * Validates package.json and other files for optimal npm search ranking
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '../package.json');
const readmePath = path.join(__dirname, '../README.md');

function checkPackageJson() {
  console.log('🔍 Checking package.json SEO optimization...\n');

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const issues = [];
  const suggestions = [];

  // Check required fields
  const requiredFields = [
    'name',
    'version',
    'description',
    'keywords',
    'author',
    'license',
    'repository',
  ];
  requiredFields.forEach((field) => {
    if (!packageJson[field]) {
      issues.push(`❌ Missing required field: ${field}`);
    }
  });

  // Check description length (optimal: 60-160 characters)
  if (packageJson.description) {
    const descLength = packageJson.description.length;
    if (descLength < 60) {
      suggestions.push(
        `⚠️  Description is short (${descLength} chars). Consider adding more details for better SEO.`,
      );
    } else if (descLength > 200) {
      suggestions.push(
        `⚠️  Description is long (${descLength} chars). Consider shortening for better readability.`,
      );
    } else {
      console.log(`✅ Description length is optimal (${descLength} chars)`);
    }
  }

  // Check keywords
  if (packageJson.keywords) {
    const keywordCount = packageJson.keywords.length;
    if (keywordCount < 10) {
      suggestions.push(
        `⚠️  Consider adding more keywords (current: ${keywordCount}). Aim for 15-30 relevant keywords.`,
      );
    } else if (keywordCount > 50) {
      suggestions.push(`⚠️  Too many keywords (${keywordCount}). This might be seen as spam.`);
    } else {
      console.log(`✅ Keyword count is good (${keywordCount} keywords)`);
    }

    // Check for important keywords
    const importantKeywords = [
      'cli',
      'typescript',
      'node',
      'ssl',
      'certificate',
      'acme',
      'letsencrypt',
    ];
    const missingKeywords = importantKeywords.filter(
      (keyword) =>
        !packageJson.keywords.some((k) => k.toLowerCase().includes(keyword.toLowerCase())),
    );

    if (missingKeywords.length > 0) {
      suggestions.push(
        `⚠️  Consider adding these important keywords: ${missingKeywords.join(', ')}`,
      );
    }
  } else {
    issues.push('❌ No keywords defined');
  }

  // Check author format
  if (typeof packageJson.author === 'string') {
    suggestions.push('⚠️  Consider using object format for author with name, email, and url');
  }

  // Check engines
  if (!packageJson.engines) {
    suggestions.push('⚠️  Consider specifying supported Node.js versions in engines field');
  } else {
    console.log('✅ Engine requirements specified');
  }

  // Check for homepage
  if (!packageJson.homepage) {
    suggestions.push('⚠️  Consider adding homepage URL');
  } else {
    console.log('✅ Homepage URL present');
  }

  // Print results
  if (issues.length === 0) {
    console.log('✅ No critical issues found in package.json\n');
  } else {
    console.log('Issues found:');
    issues.forEach((issue) => console.log(issue));
    console.log('');
  }

  if (suggestions.length > 0) {
    console.log('Suggestions for improvement:');
    suggestions.forEach((suggestion) => console.log(suggestion));
    console.log('');
  }
}

function checkReadme() {
  console.log('📖 Checking README.md SEO optimization...\n');

  if (!fs.existsSync(readmePath)) {
    console.log('❌ README.md not found');
    return;
  }

  const readmeContent = fs.readFileSync(readmePath, 'utf8');
  const issues = [];
  const suggestions = [];

  // Check for badges
  if (!readmeContent.includes('![') && !readmeContent.includes('[![')) {
    suggestions.push('⚠️  Consider adding badges for npm version, downloads, license, etc.');
  } else {
    console.log('✅ Badges present in README');
  }

  // Check for Table of Contents
  if (
    !readmeContent.toLowerCase().includes('table of contents') &&
    !readmeContent.includes('## Contents') &&
    !readmeContent.includes('## Index')
  ) {
    suggestions.push('⚠️  Consider adding a Table of Contents for better navigation');
  } else {
    console.log('✅ Table of Contents found');
  }

  // Check for installation instructions
  if (
    !readmeContent.toLowerCase().includes('install') &&
    !readmeContent.toLowerCase().includes('npm i')
  ) {
    suggestions.push('⚠️  Consider adding clear installation instructions');
  } else {
    console.log('✅ Installation instructions present');
  }

  // Check for usage examples
  if (!readmeContent.includes('```') || !readmeContent.toLowerCase().includes('example')) {
    suggestions.push('⚠️  Consider adding code examples and usage instructions');
  } else {
    console.log('✅ Code examples present');
  }

  // Check README length
  const wordCount = readmeContent.split(/\s+/).length;
  if (wordCount < 500) {
    suggestions.push(
      `⚠️  README is quite short (${wordCount} words). Consider adding more details.`,
    );
  } else if (wordCount > 5000) {
    suggestions.push(
      `⚠️  README is very long (${wordCount} words). Consider breaking into separate documentation.`,
    );
  } else {
    console.log(`✅ README length is good (${wordCount} words)`);
  }

  // Print results
  if (issues.length === 0) {
    console.log('✅ No critical issues found in README.md\n');
  } else {
    console.log('Issues found:');
    issues.forEach((issue) => console.log(issue));
    console.log('');
  }

  if (suggestions.length > 0) {
    console.log('Suggestions for improvement:');
    suggestions.forEach((suggestion) => console.log(suggestion));
    console.log('');
  }
}

function checkFiles() {
  console.log('📁 Checking additional SEO files...\n');

  const seoFiles = [
    { file: 'LICENSE', description: 'License file' },
    { file: 'CHANGELOG.md', description: 'Changelog' },
    { file: 'CONTRIBUTING.md', description: 'Contributing guidelines' },
    { file: 'SECURITY.md', description: 'Security policy' },
    { file: '.npmignore', description: 'NPM ignore file' },
  ];

  seoFiles.forEach(({ file, description }) => {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${description} present (${file})`);
    } else {
      console.log(`⚠️  Consider adding ${description} (${file})`);
    }
  });
}

function generateSeoScore() {
  console.log('\n🏆 SEO Score Summary\n');

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  let score = 0;
  const maxScore = 95; // Reduced from 100 because we removed funding

  // Package.json completeness (40 points)
  if (packageJson.description && packageJson.description.length > 60) score += 8;
  if (packageJson.keywords && packageJson.keywords.length >= 15) score += 8;
  if (typeof packageJson.author === 'object') score += 4;
  if (packageJson.homepage) score += 4;
  if (packageJson.engines) score += 4;
  if (packageJson.repository) score += 4;
  if (packageJson.bugs) score += 4;
  if (packageJson.os && packageJson.cpu) score += 4;

  // Documentation (30 points)
  if (fs.existsSync(readmePath)) score += 10;
  if (fs.existsSync(path.join(__dirname, '../CHANGELOG.md'))) score += 5;
  if (fs.existsSync(path.join(__dirname, '../CONTRIBUTING.md'))) score += 5;
  if (fs.existsSync(path.join(__dirname, '../SECURITY.md'))) score += 5;
  if (fs.existsSync(path.join(__dirname, '../LICENSE'))) score += 5;

  // GitHub integration (15 points)
  if (fs.existsSync(path.join(__dirname, '../.github/workflows'))) score += 5;
  if (fs.existsSync(path.join(__dirname, '../.github/ISSUE_TEMPLATE'))) score += 5;
  if (fs.existsSync(path.join(__dirname, '../.github/pull_request_template.md'))) score += 5;

  // Package optimization (10 points)
  if (fs.existsSync(path.join(__dirname, '../.npmignore'))) score += 5;
  if (packageJson.files && packageJson.files.length > 0) score += 5;

  const percentage = Math.round((score / maxScore) * 100);

  console.log(`📊 Your SEO Score: ${score}/${maxScore} (${percentage}%)`);

  if (percentage >= 90) {
    console.log('🎉 Excellent! Your package is well-optimized for search engines.');
  } else if (percentage >= 75) {
    console.log('👍 Good job! Your package has solid SEO optimization.');
  } else if (percentage >= 60) {
    console.log('⚠️  Your package needs some SEO improvements.');
  } else {
    console.log('❌ Your package needs significant SEO optimization.');
  }
}

// Run all checks
console.log('🔍 ACME Love - SEO & Package Quality Checker\n');
console.log('='.repeat(50));

checkPackageJson();
checkReadme();
checkFiles();
generateSeoScore();

console.log(
  '\n📋 For more SEO tips, see: https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry',
);
console.log('🚀 Happy publishing!\n');
