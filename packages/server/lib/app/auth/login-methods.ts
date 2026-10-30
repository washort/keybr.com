import { Env } from "@keybr/config";
import { type LoginMethods, type OAuthProvider } from "@keybr/pages-shared";

/**
 * The sign-in methods enabled by the environment.
 *
 * This mirrors the conditions in `AuthModule`, which registers the matching
 * adapters, so the account page offers exactly the buttons that will work.
 */
export function getLoginMethods(): LoginMethods {
  const oauth: OAuthProvider[] = [];
  if (Env.getString("AUTH_GOOGLE_CLIENT_ID", "") !== "") {
    oauth.push({ id: "google", name: "Google" });
  }
  if (Env.getString("AUTH_MICROSOFT_CLIENT_ID", "") !== "") {
    oauth.push({ id: "microsoft", name: "Microsoft" });
  }
  if (Env.getString("AUTH_FACEBOOK_CLIENT_ID", "") !== "") {
    oauth.push({ id: "facebook", name: "Facebook" });
  }
  const issuer = Env.getString("AUTH_OIDC_ISSUER", "");
  const clientId = Env.getString("AUTH_OIDC_CLIENT_ID", "");
  if (issuer !== "" && clientId !== "") {
    oauth.push({
      id: Env.getString("AUTH_OIDC_ID", "oidc"),
      name: Env.getString("AUTH_OIDC_NAME", "Single sign-on"),
    });
  }
  return {
    email: Env.getString("AUTH_EMAIL_LOGIN", "true") !== "false",
    oauth,
  };
}
