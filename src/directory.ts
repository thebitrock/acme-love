// ACME Directory configuration for various certificate authorities

/**
 * ACME directory entry for a specific environment
 */
export interface AcmeDirectoryEntry {
  /** The ACME directory URL for this environment */
  directoryUrl: string;
  /** Human-readable name for this directory */
  name: string;
  /** Environment type: staging or production */
  environment: 'staging' | 'production';
}

/**
 * ACME provider configuration containing multiple environments
 */
export interface AcmeProvider {
  /** Staging environment configuration */
  staging?: AcmeDirectoryEntry;
  /** Production environment configuration */
  production?: AcmeDirectoryEntry;
}

/**
 * Complete ACME directory configuration containing all providers
 */
export interface AcmeDirectoryConfig {
  /** Buypass certificate authority */
  buypass: Required<Pick<AcmeProvider, 'staging' | 'production'>>;
  /** Google Trust Services certificate authority */
  google: Required<Pick<AcmeProvider, 'staging' | 'production'>>;
  /** Let's Encrypt certificate authority */
  letsencrypt: Required<Pick<AcmeProvider, 'staging' | 'production'>>;
  /** ZeroSSL certificate authority (production only) */
  zerossl: Required<Pick<AcmeProvider, 'production'>>;
}

/**
 * Pre-configured ACME providers for major certificate authorities.
 *
 * @example
 * ```typescript
 * import { provider } from 'acme-love';
 *
 * // Use Let's Encrypt staging
 * const stagingUrl = provider.letsencrypt.staging.directoryUrl;
 *
 * // Use Google Trust Services production
 * const prodUrl = provider.google.production.directoryUrl;
 * ```
 */
export const directory: AcmeDirectoryConfig = {
  buypass: {
    staging: {
      directoryUrl: 'https://api.test4.buypass.no/acme/directory',
      name: 'Buypass Staging',
      environment: 'staging' as const,
    },
    production: {
      directoryUrl: 'https://api.buypass.com/acme/directory',
      name: 'Buypass Production',
      environment: 'production' as const,
    },
  },
  google: {
    staging: {
      directoryUrl: 'https://dv.acme-v02.test-api.pki.goog/directory',
      name: 'Google Trust Services Staging',
      environment: 'staging' as const,
    },
    production: {
      directoryUrl: 'https://dv.acme-v02.api.pki.goog/directory',
      name: 'Google Trust Services Production',
      environment: 'production' as const,
    },
  },
  letsencrypt: {
    staging: {
      directoryUrl: 'https://acme-staging-v02.api.letsencrypt.org/directory',
      name: "Let's Encrypt Staging",
      environment: 'staging' as const,
    },
    production: {
      directoryUrl: 'https://acme-v02.api.letsencrypt.org/directory',
      name: "Let's Encrypt Production",
      environment: 'production' as const,
    },
  },
  zerossl: {
    production: {
      directoryUrl: 'https://acme.zerossl.com/v2/DV90',
      name: 'ZeroSSL Production',
      environment: 'production' as const,
    },
  },
};

// Main export with semantic name
export const provider: AcmeDirectoryConfig = directory;

// Legacy exports for backwards compatibility
export const directories: AcmeDirectoryConfig = directory;
export const letsencrypt: Required<Pick<AcmeProvider, 'staging' | 'production'>> =
  directory.letsencrypt;
