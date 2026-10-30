import { AbstractAdapter } from "../../adapter.ts";
import { type ResourceOwner } from "../../resource-owner.ts";
import { type ClientConfig } from "../../types.ts";
import {
  type OidcDiscovery,
  type OidcProfileResponse,
  type OidcProviderConfig,
} from "./types.ts";

const discoveryCache = new Map<string, Promise<OidcDiscovery>>();

async function discover(issuer: string): Promise<OidcDiscovery> {
  const cached = discoveryCache.get(issuer);
  if (cached) {
    return cached;
  }
  const promise = (async () => {
    const url = new URL(".well-known/openid-configuration", issuer.endsWith("/") ? issuer : issuer + "/");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OIDC discovery failed: ${response.status} ${response.statusText}`);
    }
    const json = (await response.json()) as Partial<OidcDiscovery>;
    if (!json.authorization_endpoint || !json.token_endpoint || !json.userinfo_endpoint) {
      throw new Error("OIDC discovery response missing required endpoints");
    }
    return {
      authorization_endpoint: json.authorization_endpoint,
      token_endpoint: json.token_endpoint,
      userinfo_endpoint: json.userinfo_endpoint,
    };
  })();
  discoveryCache.set(issuer, promise);
  // Remove from cache on failure so a later attempt can retry.
  promise.catch(() => {
    discoveryCache.delete(issuer);
  });
  return promise;
}

export class OidcAdapter extends AbstractAdapter {
  readonly usesPkce = true;

  private readonly providerId: string;
  private readonly issuer: string;
  private readonly explicitAuthorizationUri?: string;
  private readonly explicitTokenUri?: string;
  private readonly explicitUserinfoUri?: string;

  constructor(config: ClientConfig, oidc: OidcProviderConfig) {
    super(config, {
      authorizationUri: oidc.authorizationUri ?? "",
      tokenUri: oidc.tokenUri ?? "",
      profileUri: oidc.userinfoUri ?? "",
    });
    this.providerId = oidc.id;
    this.issuer = oidc.issuer;
    this.explicitAuthorizationUri = oidc.authorizationUri;
    this.explicitTokenUri = oidc.tokenUri;
    this.explicitUserinfoUri = oidc.userinfoUri;
  }

  protected override async resolveEndpoints(): Promise<void> {
    const needsDiscovery =
      !this.authorizationUri ||
      !this.tokenUri ||
      !this.profileUri;
    if (!needsDiscovery) {
      return;
    }
    const d = await discover(this.issuer);
    if (!this.authorizationUri) {
      this.authorizationUri = this.explicitAuthorizationUri ?? d.authorization_endpoint;
    }
    if (!this.tokenUri) {
      this.tokenUri = this.explicitTokenUri ?? d.token_endpoint;
    }
    if (!this.profileUri) {
      this.profileUri = this.explicitUserinfoUri ?? d.userinfo_endpoint;
    }
    // If explicit values were provided they were set in the constructor; ensure.
    if (!this.authorizationUri) this.authorizationUri = d.authorization_endpoint;
    if (!this.tokenUri) this.tokenUri = d.token_endpoint;
    if (!this.profileUri) this.profileUri = d.userinfo_endpoint;
  }

  protected override parseProfileResponse(
    response: OidcProfileResponse,
  ): ResourceOwner<OidcProfileResponse> {
    const { sub, email, email_verified, name, preferred_username, picture, profile } = response;
    return {
      raw: response,
      provider: this.providerId,
      id: sub,
      email: email_verified === false ? null : email || null,
      name: name || preferred_username || null,
      url: profile || null,
      imageUrl: picture || null,
    };
  }
}