import { describe, it, expect } from '@jest/globals';
import { buildUserAgent, getPackageInfo } from '../../src/lib/utils/user-agent.js';

describe('getPackageInfo', () => {
  it('returns name, version, homepage', () => {
    const info = getPackageInfo();
    expect(info.name).toBe('acme-love');
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.homepage).toContain('github.com');
  });

  it('is cached on repeated calls', () => {
    const a = getPackageInfo();
    const b = getPackageInfo();
    expect(a).toBe(b);
  });
});

describe('buildUserAgent', () => {
  it('includes package name and version', () => {
    const ua = buildUserAgent();
    expect(ua).toMatch(/^acme-love\/\d+\.\d+\.\d+/);
  });

  it('includes Node version', () => {
    const ua = buildUserAgent();
    expect(ua).toContain('Node/');
  });

  it('includes homepage URL', () => {
    const ua = buildUserAgent();
    expect(ua).toContain('+https://');
  });
});
