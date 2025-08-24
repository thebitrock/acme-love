// dns-txt-authoritative-validator.ts
import { resolveTxt, resolveNs, resolve4, resolve6, Resolver } from 'dns/promises';

export interface ValidationResult {
  ok: boolean;
  /** Matched (or simply valid) value from TXT */
  matched?: string;
  /** All normalized values (concatenated TXT fragments) */
  allValues: string[];
  /** Reasons if ok === false */
  reasons?: string[];
}

/** Concatenate TXT record fragments (as returned by dns.resolveTxt) */
export function normalizeTxtFragments(fragments: ReadonlyArray<string>): string {
  // DNS TXT can come as ["part1","part2"] — they need to be joined
  return fragments.join('');
}

/** Quick syntax test for base64url without padding, length 43 */
export function isBase64UrlNoPad43(s: string): boolean {
  // 32 bytes SHA-256 -> 43 characters base64url without '='
  return /^[A-Za-z0-9_-]{43}$/.test(s);
}

/** Soft check for decodability and length of 32 bytes after base64url */
export function canDecodeTo32Bytes(base64urlNoPad: string): boolean {
  let t = base64urlNoPad.replace(/-/g, '+').replace(/_/g, '/');
  // add padding to multiple of 4
  while (t.length % 4 !== 0) t += '=';
  try {
    const buf = Buffer.from(t, 'base64');
    return buf.length === 32;
  } catch {
    return false;
  }
}

/**
 * Validate an array of TXT records, as from dns.resolveTxt(name)
 * If expected is provided, success is considered when at least one value matches.
 */
export function validateAcmeTxtSet(
  records: ReadonlyArray<ReadonlyArray<string>>,
  expected?: string,
): ValidationResult {
  const allValues = records.map(normalizeTxtFragments);

  const reasons: string[] = [];
  let matched: string | undefined;

  for (const val of allValues) {
    // shape
    if (!isBase64UrlNoPad43(val)) {
      reasons.push(`'${val}' doesn't look like base64url(sha256) without padding, length 43`);
      continue;
    }
    // decodability
    if (!canDecodeTo32Bytes(val)) {
      reasons.push(`'${val}' doesn't decode to 32 bytes`);
      continue;
    }
    // exact match if expected provided
    if (expected && val !== expected) {
      reasons.push(`'${val}' doesn't match the expected value`);
      continue;
    }

    matched = val;
    return { ok: true, matched, allValues };
  }

  if (!expected) {
    const candidate = allValues.find((v) => isBase64UrlNoPad43(v) && canDecodeTo32Bytes(v));
    if (candidate) {
      return { ok: true, matched: candidate, allValues };
    }
  }

  return { ok: false, allValues, reasons };
}

/** Return the zone name that actually has NS records (walk labels to the right) */
export async function findZoneWithNs(fqdn: string): Promise<string | null> {
  // Ensure no trailing dot normalization issues
  const name = fqdn.replace(/\.$/, '');
  const parts = name.split('.');
  for (let i = 0; i < parts.length; i++) {
    const candidate = parts.slice(i).join('.');
    try {
      const ns = await resolveNs(candidate);
      if (ns && ns.length > 0) return candidate;
    } catch {
      // keep walking up
    }
  }
  return null;
}

/** Resolve NS hostnames to a list of unique IPs (A and AAAA) */
export async function resolveNsToIPs(nsHosts: string[]): Promise<string[]> {
  const ips = new Set<string>();
  await Promise.all(
    nsHosts.map(async (ns) => {
      try {
        const [v4, v6] = await Promise.allSettled([resolve4(ns), resolve6(ns)]);
        if (v4.status === 'fulfilled') v4.value.forEach((ip) => ips.add(ip));
        if (v6.status === 'fulfilled') v6.value.forEach((ip) => ips.add(ip));
      } catch {
        // ignore per-host errors
      }
    }),
  );
  return Array.from(ips);
}

export interface AuthoritativeOptions {
  followCname?: boolean; // follow CNAME chain for _acme-challenge (one hop is typical)
  timeoutMs?: number; // per DNS query timeout
}

/** Resolve TXT via a specific Resolver bound to given name servers (IPs) */
async function resolveTxtWithResolver(
  resolver: Resolver,
  name: string,
): Promise<string[][]> {
  return resolver.resolveTxt(name);
}

/** Try following one CNAME hop using the same resolver */
async function maybeFollowCname(
  resolver: Resolver,
  name: string,
  enabled: boolean | undefined,
): Promise<string[][]> {
  if (!enabled) {
    return resolveTxtWithResolver(resolver, name);
  }
  try {
    // Node's dns/promises doesn't expose CNAME + target in one call,
    // so we attempt TXT first; if ENODATA or NXDOMAIN, try CNAME via system resolver,
    // then re-query TXT at the target using the authoritative resolver.
    const txt = await resolveTxtWithResolver(resolver, name);
    if (txt.length > 0) return txt;
  } catch {
    // continue to try CNAME
  }

  // Fallback: check CNAME via system resolver (acceptable for target discovery)
  try {
    const { Resolver: SysResolver } = await import('dns').then((m) => ({ Resolver: (m as any).Resolver }));
    const sys = new SysResolver();
    const cname = await (sys as any).resolveCname?.(name);
    const target = Array.isArray(cname) && cname.length > 0 ? cname[0] : null;
    if (target) {
      return resolveTxtWithResolver(resolver, target.replace(/\.$/, ''));
    }
  } catch {
    // ignore
  }
  // If we got here, just try TXT once more (will throw on failure)
  return resolveTxtWithResolver(resolver, name);
}

/**
 * Resolves and validates _acme-challenge.<domain> at authoritative name servers.
 * @param domain example.org (without _acme-challenge.)
 * @param expected optional — exact expected TXT value (43 characters base64url)
 * @param opts authoritative resolver options
 */
export async function resolveAndValidateAcmeTxtAuthoritative(
  domain: string,
  expected?: string,
  opts: AuthoritativeOptions = {},
): Promise<ValidationResult> {
  const name = `_acme-challenge.${domain}`.replace(/\.$/, '');
  const zone = (await findZoneWithNs(name)) || (await findZoneWithNs(domain));

  if (!zone) {
    return {
      ok: false,
      allValues: [],
      reasons: [`Failed to find zone with NS for ${name}`],
    };
  }

  let nsHosts: string[] = [];
  try {
    nsHosts = await resolveNs(zone);
  } catch (e) {
    return {
      ok: false,
      allValues: [],
      reasons: [`Failed to resolve NS for ${zone}: ${String(e)}`],
    };
  }

  const nsIPs = await resolveNsToIPs(nsHosts);
  if (nsIPs.length === 0) {
    return {
      ok: false,
      allValues: [],
      reasons: [`No IPs for NS of ${zone} (hosts: ${nsHosts.join(', ')})`],
    };
  }

  // Create a dedicated resolver pinned to authoritative IPs
  const resolver = new Resolver();
  console.log('Using authoritative DNS servers:', nsIPs);
  resolver.setServers(nsIPs);

  // Optional per-query timeout
  const runWithTimeout = <T>(p: Promise<T>): Promise<T> => {
    const { timeoutMs = 4000 } = opts;
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`DNS query timeout after ${timeoutMs} ms`)), timeoutMs);
      p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  };

  let records: string[][] = [];
  try {
    records = await runWithTimeout(maybeFollowCname(resolver, name, opts.followCname ?? true));
  } catch (e) {
    return {
      ok: false,
      allValues: [],
      reasons: [`Failed to resolve TXT at authoritative servers for ${name}: ${String(e)}`],
    };
  }

  return validateAcmeTxtSet(records, expected);
}

/**
 * Convenience: system resolver (non-authoritative). Kept for parity/testing.
 */
export async function resolveAndValidateAcmeTxt(
  domain: string,
  expected?: string,
): Promise<ValidationResult> {
  const name = `_acme-challenge.${domain}`.replace(/\.$/, '');
  try {
    const records = await resolveTxt(name);
    return validateAcmeTxtSet(records, expected);
  } catch (e) {
    return { ok: false, allValues: [], reasons: [`Failed to resolve TXT for ${name}: ${String(e)}`] };
  }
}
