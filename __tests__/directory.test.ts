import { describe, test, expect } from '@jest/globals';
import { directory } from '../src/directory.js';

describe('Directory Configuration', () => {
  test("should have Let's Encrypt staging configuration", () => {
    expect(directory.letsencrypt.staging).toBeDefined();
    expect(directory.letsencrypt.staging.directoryUrl).toBe(
      'https://acme-staging-v02.api.letsencrypt.org/directory',
    );
    expect(directory.letsencrypt.staging.name).toBe("Let's Encrypt Staging");
    expect(directory.letsencrypt.staging.environment).toBe('staging');
  });

  test("should have Let's Encrypt production configuration", () => {
    expect(directory.letsencrypt.production).toBeDefined();
    expect(directory.letsencrypt.production.directoryUrl).toBe(
      'https://acme-v02.api.letsencrypt.org/directory',
    );
    expect(directory.letsencrypt.production.name).toBe("Let's Encrypt Production");
    expect(directory.letsencrypt.production.environment).toBe('production');
  });

  test('should have multiple ACME providers', () => {
    expect(directory.letsencrypt).toBeDefined();
    expect(directory.buypass).toBeDefined();
    expect(directory.zerossl).toBeDefined();
    expect(directory.google).toBeDefined();
  });
});
