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
  // Closely emulate GitHub's slugger (github-slugger) behavior
  // 1. Strip heading marks, trim
  let text = original.replace(/^#+\s*/, '').trim();
  // 2. Remove backtick wrappers but keep inner text
  text = text.replace(/`([^`]+)`/g, '$1');
  // 3. Remove leading emoji (common pattern) but leave inline emoji elsewhere (GitHub drops them too; simplification)
  text = text.replace(/^[\p{Emoji_Presentation}\p{Emoji}\p{Extended_Pictographic}]+\s*/u, '');
  // 4. Lowercase
  text = text.toLowerCase();
  // 5. Remove HTML tags if any
  let prevText;
  do {
    prevText = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== prevText);
  // 6. Remove punctuation (match github-slugger punctuation class) but keep spaces & hyphens
  text = text.replace(/[\u2000-\u206F\u2E00-\u2E7F'"!#\$%&()*+,./:;<=>?@\[\\\]^`{|}~]/g, '');
  // 7. Replace remaining whitespace with hyphens (do NOT collapse multiple hyphens; GitHub keeps them)
  // Replace any run of whitespace with a single hyphen (GitHub behavior)
  text = text.replace(/\s+/g, '-');
  // 8. Remove any characters not alphanum or hyphen (defensive)
  text = text.replace(/[^a-z0-9-]/g, '');
  // 9. Trim leading/trailing hyphens
  text = text.replace(/^-+/, '').replace(/-+$/, '');
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
  // Track duplicate slugs to emulate GitHub's "-1", "-2" suffix behavior
  const slugCounts = new Map();
  const headingSlugs = []; // collect for validation phase
  const headingSlugPairs = []; // {slug, line}
  for (const { level, line } of items) {
    const text = line.replace(/^###?\s+/, '');
    const base = githubSlug(line);
    let slug = base;
    if (slugCounts.has(base)) {
      const n = slugCounts.get(base);
      slug = `${base}-${n}`; // append existing count as suffix
      slugCounts.set(base, n + 1); // increment for further duplicates
    } else {
      slugCounts.set(base, 1); // first occurrence stored as 1
    }
    headingSlugs.push(slug);
    headingSlugPairs.push({ slug, line });
    // Remove leading emoji from link text for cleaner TOC
    let linkText = text
      .replace(/^[\p{Emoji_Presentation}\p{Emoji}\p{Extended_Pictographic}]+\s*/u, '')
      .trim();
    // Remove stray variation selectors or zero-width chars at start
    linkText = linkText.replace(/^[\ufe0f\u200d\u200c]+/, '');
    if (level === 2) {
      out.push(`- [${linkText}](#${slug})`);
    } else if (level === 3) {
      out.push(`  - [${linkText}](#${slug})`);
    }
  }
  return { toc: out.join('\n'), headingSlugs, headingSlugPairs };
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
const { toc, headingSlugs, headingSlugPairs } = buildTOC(lines);

// Validate and auto-fix outdated internal anchor links (e.g. single vs double hyphen)
const slugSet = new Set(headingSlugs);
// Map normalized (collapse multi-hyphen) -> first real slug
const normalizedMap = new Map();
for (const s of headingSlugs) {
  const norm = s.replace(/-+/g, '-');
  if (!normalizedMap.has(norm)) normalizedMap.set(norm, s);
}

let contentForAnchors = readme;
// Allow optional accidental leading hyphen (legacy) in captured anchors
const anchorRegex = /\(#(-?[a-z0-9][a-z0-9-]*)\)/g;
const missing = new Set();
let match;
while ((match = anchorRegex.exec(readme))) {
  const full = match[0];
  const anchor = match[1];
  const canonical = anchor.startsWith('-') ? anchor.slice(1) : anchor; // strip leading hyphen if present
  if (anchor.startsWith('-') && slugSet.has(canonical)) {
    const pattern = new RegExp(`\\(#${anchor}\\)`, 'g');
    contentForAnchors = contentForAnchors.replace(pattern, `(#${canonical})`);
    continue;
  }
  if (!slugSet.has(anchor)) {
    const norm = anchor.replace(/-+/g, '-');
    const candidate = normalizedMap.get(norm);
    if (candidate && candidate !== anchor) {
      // Replace only this occurrence
      const pattern = new RegExp(`\\(#${anchor}\\)`, 'g');
      contentForAnchors = contentForAnchors.replace(pattern, `(#${candidate})`);
    } else if (anchor.startsWith('-')) {
      const trimmed = anchor.replace(/^-+/, '');
      if (slugSet.has(trimmed)) {
        const pattern = new RegExp(`\\(#${anchor}\\)`, 'g');
        contentForAnchors = contentForAnchors.replace(pattern, `(#${trimmed})`);
      } else if (normalizedMap.has(trimmed.replace(/-+/g, '-'))) {
        const cand2 = normalizedMap.get(trimmed.replace(/-+/g, '-'));
        const pattern = new RegExp(`\\(#${anchor}\\)`, 'g');
        contentForAnchors = contentForAnchors.replace(pattern, `(#${cand2})`);
      } else {
        missing.add(anchor);
      }
    } else {
      missing.add(anchor);
    }
  }
}

const newContent = `${before}${START}\n\n${toc}\n\n${END}${afterPart}`;

// Inject explicit anchors before headings to ensure consistent navigation across renderers (npm, VSCode, etc.)
let finalContent = newContent;
const injected = new Set();
finalContent = finalContent
  .split(/\r?\n/)
  .map((l) => {
    if ((/^##\s+/.test(l) || /^###\s+/.test(l)) && !/^##\s+Table of Contents/i.test(l)) {
      // compute slug again with duplicate handling sequence preserved by iterating headingSlugPairs
      if (!injected.size) {
        // build queue
      }
    }
    return l;
  })
  .join('\n');
// More deterministic injection: rebuild by walking lines and matching original lines to slug list sequentially
{
  const linesArr = finalContent.split(/\r?\n/);
  const pairs = [...headingSlugPairs];
  let idx = 0;
  for (let i = 0; i < linesArr.length && idx < pairs.length; i++) {
    const line = linesArr[i];
    if (line === pairs[idx].line) {
      const slug = pairs[idx].slug;
      // If anchor already present just skip
      if (i > 0) {
        const prev = linesArr[i - 1];
        const prev2 = i > 1 ? linesArr[i - 2] : '';
        const directAnchor = prev.match(/^<a id="([a-z0-9-]+)"><\/a>$/);
        const anchorWithBlank = prev === '' && prev2.match(/^<a id="([a-z0-9-]+)"><\/a>$/);
        if (
          (directAnchor && directAnchor[1] === slug) ||
          (anchorWithBlank && anchorWithBlank[1] === slug)
        ) {
          // Anchor already present (with or without blank line) -> ensure exactly one blank line
          if (directAnchor) {
            // Insert a blank line after anchor if missing
            linesArr.splice(i, 0, '');
            i++; // move index past inserted blank line
          } else if (anchorWithBlank) {
            // Already anchor + blank line, nothing to do
          }
        } else {
          linesArr[i] = `<a id="${slug}"></a>\n\n${line}`;
        }
      } else {
        linesArr[i] = `<a id="${slug}"></a>\n\n${line}`;
      }
      idx++;
    }
  }
  finalContent = linesArr.join('\n');
}
// Collapse any accidentally duplicated consecutive identical anchors
finalContent = finalContent.replace(/(<a id="([a-z0-9-]+)"><\/a>\n)(<a id="\2"><\/a>\n)+/g, '$1');
// Normalize: ensure exactly one blank line between anchor and heading
finalContent = finalContent.replace(/(<a id="([a-z0-9-]+)"><\/a>)\n+(##+\s)/g, '$1\n\n$3');
if (contentForAnchors !== readme) {
  // Reapply TOC into possibly modified anchor content (replace original readme region)
  finalContent = contentForAnchors.replace(
    /([\s\S]*?)${START}[\s\S]*?${END}([\s\S]*)/,
    `$1${START}\n\n${toc}\n\n${END}$2`,
  );
}

if (finalContent !== readme) {
  writeFileSync(readmePath, finalContent);
  if (missing.size) {
    console.warn('TOC updated with warnings. Unresolved anchors:', [...missing].join(', '));
  } else {
    console.log('TOC and internal anchors updated.');
  }
} else {
  console.log('TOC already up to date.');
}
