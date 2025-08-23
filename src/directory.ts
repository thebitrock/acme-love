// ACME Directory configuration for various certificate authorities
export const directory = {
  buypass: {
    staging: {
      directoryUrl: 'https://api.test4.buypass.no/acme/directory',
      name: 'Buypass Staging',
      environment: 'staging',
    },
    production: {
      directoryUrl: 'https://api.buypass.com/acme/directory',
      name: 'Buypass Production',
      environment: 'production',
    },
  },
  google: {
    staging: {
      directoryUrl: 'https://dv.acme-v02.test-api.pki.goog/directory',
      name: 'Google Trust Services Staging',
      environment: 'staging',
    },
    production: {
      directoryUrl: 'https://dv.acme-v02.api.pki.goog/directory',
      name: 'Google Trust Services Production',
      environment: 'production',
    },
  },
  letsencrypt: {
    staging: {
      directoryUrl: 'https://acme-staging-v02.api.letsencrypt.org/directory',
      name: "Let's Encrypt Staging",
      environment: 'staging',
    },
    production: {
      directoryUrl: 'https://acme-v02.api.letsencrypt.org/directory',
      name: "Let's Encrypt Production",
      environment: 'production',
    },
  },
  zerossl: {
    production: {
      directoryUrl: 'https://acme.zerossl.com/v2/DV90',
      name: 'ZeroSSL Production',
      environment: 'production',
    },
  },
};

// Legacy export for backwards compatibility
export const letsencrypt = directory.letsencrypt;
