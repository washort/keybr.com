import { type Binder, inject, type Module, provides } from "@fastr/invert";
import { Env } from "@keybr/config";
import { NotFoundError } from "@fastr/errors";
import {
  type AbstractAdapter,
  FacebookAdapter,
  GoogleAdapter,
  MicrosoftAdapter,
  OidcAdapter,
} from "@keybr/oauth";

export abstract class AdapterFactory {
  abstract makeAdapter(redirectUri: string, canonicalUrl: string): AbstractAdapter;
}

export class AuthModule implements Module {
  configure(binder: Binder) {
    const issuer = Env.getString("AUTH_OIDC_ISSUER", "");
    const clientId = Env.getString("AUTH_OIDC_CLIENT_ID", "");
    if (issuer && clientId) {
      const id = Env.getString("AUTH_OIDC_ID", "oidc");
      const clientSecret = Env.getString("AUTH_OIDC_CLIENT_SECRET", "");
      const scope = Env.getString("AUTH_OIDC_SCOPE", "openid profile email");
      const authorizationUri = Env.getString("AUTH_OIDC_AUTHORIZATION_URI", "");
      const tokenUri = Env.getString("AUTH_OIDC_TOKEN_URI", "");
      const userinfoUri = Env.getString("AUTH_OIDC_USERINFO_URI", "");
      const factory = new (class OidcAdapterFactory extends AdapterFactory {
        makeAdapter(redirectUri: string, canonicalUrl: string): AbstractAdapter {
          return new OidcAdapter(
            {
              clientId,
              clientSecret,
              scope,
              redirectUri: String(new URL(redirectUri, canonicalUrl)),
            },
            {
              id,
              issuer,
              authorizationUri: authorizationUri || undefined,
              tokenUri: tokenUri || undefined,
              userinfoUri: userinfoUri || undefined,
            },
          );
        }
      })();
      binder.bind(AdapterFactory, id).toValue(factory);
    }
  }

  @provides({ id: AdapterFactory, name: "google", singleton: true })
  provideGoogleAdapter(
    @inject("canonicalUrl") canonicalUrl: string,
  ): AdapterFactory {
    const clientId = Env.getString("AUTH_GOOGLE_CLIENT_ID", "");
    const clientSecret = Env.getString("AUTH_GOOGLE_CLIENT_SECRET", "");
    const scope = ["email", "profile"].join(" ");
    return new (class GoogleAdapterFactory extends AdapterFactory {
      makeAdapter(redirectUri: string, canonicalUrl: string): AbstractAdapter {
        if (!clientId) {
          throw new NotFoundError();
        }
        return new GoogleAdapter({
          clientId,
          clientSecret,
          scope,
          redirectUri: String(new URL(redirectUri, canonicalUrl)),
        });
      }
    })();
  }

  @provides({ id: AdapterFactory, name: "microsoft", singleton: true })
  provideMicrosoftAdapter(
    @inject("canonicalUrl") canonicalUrl: string,
  ): AdapterFactory {
    const clientId = Env.getString("AUTH_MICROSOFT_CLIENT_ID", "");
    const clientSecret = Env.getString("AUTH_MICROSOFT_CLIENT_SECRET", "");
    const scope = ["https://graph.microsoft.com/User.Read"].join(" ");
    return new (class MicrosoftAdapterFactory extends AdapterFactory {
      makeAdapter(redirectUri: string, canonicalUrl: string): AbstractAdapter {
        if (!clientId) {
          throw new NotFoundError();
        }
        return new MicrosoftAdapter({
          clientId,
          clientSecret,
          scope,
          redirectUri: String(new URL(redirectUri, canonicalUrl)),
        });
      }
    })();
  }

  @provides({ id: AdapterFactory, name: "facebook", singleton: true })
  provideFacebookAdapter(
    @inject("canonicalUrl") canonicalUrl: string,
  ): AdapterFactory {
    const clientId = Env.getString("AUTH_FACEBOOK_CLIENT_ID", "");
    const clientSecret = Env.getString("AUTH_FACEBOOK_CLIENT_SECRET", "");
    const scope = ["email", "public_profile"].join(",");
    return new (class FacebookAdapterFactory extends AdapterFactory {
      makeAdapter(redirectUri: string, canonicalUrl: string): AbstractAdapter {
        if (!clientId) {
          throw new NotFoundError();
        }
        return new FacebookAdapter({
          clientId,
          clientSecret,
          scope,
          redirectUri: String(new URL(redirectUri, canonicalUrl)),
        });
      }
    })();
  }
}
