export interface ACMEIdentifier {
  type: 'dns';
  value: string;
}

export interface ACMEError {
  type: string;
  detail: string;
  status: number;
}

export interface ACMEChallenge {
  type: 'http-01' | 'dns-01' | 'tls-alpn-01' | string;
  url: string;
  status: 'pending' | 'processing' | 'valid' | 'invalid';
  validated?: string;
  error?: ACMEError;
  token: string;
}

export interface ACMEAuthorization {
  identifier: ACMEIdentifier;
  status: 'pending' | 'valid' | 'invalid' | 'deactivated' | 'expired' | 'revoked';
  expires?: string;
  challenges: ACMEChallenge[];
  wildcard?: boolean;
}

export interface ACMEOrder {
  url: string;
  status: 'pending' | 'ready' | 'processing' | 'valid' | 'invalid';
  expires?: string;
  identifiers: ACMEIdentifier[];
  authorizations: string[];
  finalize: string;
  certificate?: string;
}
