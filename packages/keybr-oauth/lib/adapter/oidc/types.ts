export type OidcProviderConfig = {
  readonly id: string;
  readonly issuer: string;
  readonly authorizationUri?: string;
  readonly tokenUri?: string;
  readonly userinfoUri?: string;
};

export type OidcDiscovery = {
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly userinfo_endpoint: string;
};

export type OidcProfileResponse = {
  readonly sub: string;
  readonly email?: string;
  readonly email_verified?: boolean;
  readonly name?: string;
  readonly preferred_username?: string;
  readonly picture?: string;
  readonly profile?: string;
};