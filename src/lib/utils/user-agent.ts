import { readFileSync } from 'fs';

export interface PackageInfo {
  name: string;
  version: string;
  homepage: string;
}

let cachedPkg: PackageInfo | null = null;

/**
 * Load and cache package.json metadata (best-effort).
 * Tries several relative paths because this file can be imported from deep subpaths.
 */
export function getPackageInfo(): PackageInfo {
  if (cachedPkg) return cachedPkg;

  const defaults: PackageInfo = {
    name: 'acme-love',
    version: '0.0.0-dev',
    homepage: 'https://github.com/thebitrock/acme-love',
  };

  const candidates = [
    '../../../package.json', // from src/lib/
    '../../../../package.json', // from src/lib/utils/
    '../../package.json',
    '../package.json',
    './package.json',
  ];

  for (const rel of candidates) {
    try {
      // Use require.resolve so Node's resolution applies (works in CJS interop under ts-jest ESM)
      const resolved = require.resolve(rel, { paths: [__dirname] });
      const raw = JSON.parse(readFileSync(resolved, 'utf-8')) as {
        name?: string;
        version?: string;
        homepage?: string;
      };
      cachedPkg = {
        name: raw.name || defaults.name,
        version: raw.version || defaults.version,
        homepage: raw.homepage || defaults.homepage,
      };
      return cachedPkg;
    } catch {
      // try next
    }
  }

  cachedPkg = defaults;
  return cachedPkg;
}

/** Build a standardized User-Agent string for outbound ACME HTTP calls */
export function buildUserAgent(): string {
  const { name, version, homepage } = getPackageInfo();
  return `${name}/${version} (+${homepage}; Node/${process.version.replace(/^v/, '')})`;
}
