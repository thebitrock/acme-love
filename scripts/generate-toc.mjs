#!/usr/bin/env node
/*
 * generate-toc.mjs
 * Auto-generates the README Table of Contents between
 * markers: <!-- TOC-START --> and <!-- TOC-END -->
 *
 * Rules:
 *  - Include H2 (##) and H3 (###) headings only
 *  - Preserve leading emoji in link text but strip from slug anchor
 *  - Use GitHub slug algorithm approximation (lowercase, remove emoji, trim, replace spaces with '-', remove non-alphanum except '-')
 *  - Indent H3 under its parent H2 by two spaces
 *  - Stable ordering = document order
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(root, '..');
const readmePath = path.join(repoRoot, 'README.md');

const START = '<!-- TOC-START -->';
const END = '<!-- TOC-END -->';

function githubSlug(original) {
  // Remove markdown links/backticks, keep text
  let text = original.replace(/`([^`]+)`/g, '$1');
  // Strip leading heading hashes and whitespace
  text = text.replace(/^#+\s*/, '');
  // Remove emoji (rough: emoji + optional space)
  text = text.replace(/^[\p{Emoji_Presentation}\p{Emoji}\p{Extended_Pictographic}]+\s*/u, '');
  // Lowercase
  text = text.toLowerCase();
  // Replace parentheses & slashes with space
  text = text.replace(/[()\/]/g, ' ');
  // Remove anything that's not alphanum, space, hyphen
  text = text.replace(/[^a-z0-9\-\s]/g, '');
  // Collapse whitespace to single hyphen
  text = text.trim().replace(/\s+/g, '-');
  return text;
}

function buildTOC(lines) {
  const items = [];
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (/^##\s+Table of Contents/i.test(line)) continue; // skip TOC header itself
      items.push({ level: 2, line });
    } else if (/^###\s+/.test(line)) {
      items.push({ level: 3, line });
    }
  }
  const out = [];
  out.push('Main');
  for (const { level, line } of items) {
    const text = line.replace(/^###?\s+/, '');
    const slug = githubSlug(line);
    const linkText = text.trim();
    if (level === 2) {
      out.push(`  - [${linkText}](#${slug})`);
    } else if (level === 3) {
      out.push(`    - [${linkText}](#${slug})`);
    }
  }
  return out.join('\n');
}

const readme = readFileSync(readmePath, 'utf8');

if (!readme.includes(START) || !readme.includes(END)) {
  console.error('README missing TOC markers. Please add:\n' + START + '\n' + END);
  process.exit(1);
}

const before = readme.split(START)[0];
const afterPart = readme.split(END)[1];
const middle = readme.substring(readme.indexOf(START) + START.length, readme.indexOf(END));

// Build new TOC ignoring existing content
const lines = readme.split(/\r?\n/);
const toc = buildTOC(lines);
const newContent = `${before}${START}\n\n${toc}\n\n${END}${afterPart}`;

if (newContent !== readme) {
  writeFileSync(readmePath, newContent);
  console.log('TOC updated.');
} else {
  console.log('TOC already up to date.');
}
