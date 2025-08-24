export interface ACMEDirectory {
  newNonce: string;
  newAccount: string;
  newOrder: string;
  newAuthz?: string;
  revokeCert: string;
  keyChange: string;
  meta?: {
    termsOfService?: string;
    website?: string;
    caaIdentities?: string[];
    externalAccountRequired?: boolean;
  };
}
