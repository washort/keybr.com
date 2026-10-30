# OIDC login for self-hosted keybr (Authelia)

Status: proposal (2026-10-09)

## Goal

Let a self-hosted keybr deployment sign users in through a generic OpenID
Connect provider — concretely Authelia backed by LLDAP, as deployed in
`dotfiles/services/authelia_ldap.nix` — and let that deployment turn off the
login methods it cannot or does not want to offer (Google, Microsoft,
Facebook, e-mail magic links).

The changes below are written to be upstreamable: nothing is
Authelia-specific, and with no new configuration keybr behaves exactly as it
does today.

## Current state

- **Login methods.** E-mail magic links (`POST /auth/login/register-email`,
  `GET /login/{token}`) and OAuth via `@keybr/oauth`
  (`/auth/oauth-init/{adapter}`, `/auth/oauth-callback/{adapter}`), both in
  `packages/server/lib/app/auth/controller.ts`.
- **Providers are hardcoded.** `packages/server/lib/app/auth/module.ts`
  provides Google, Microsoft and Facebook `AdapterFactory`s unconditionally;
  `packages/page-account/lib/OAuthLoginForm.tsx` hardcodes the same three
  buttons. A deployment without credentials still shows them, and clicking one
  fails at `Env.getString("AUTH_*_CLIENT_ID")`.
- **The flow already fits OIDC.** `AbstractAdapter`
  (`packages/keybr-oauth/lib/adapter.ts`) does an authorization-code flow
  with a confidential client: redirect → token endpoint (`client_secret_post`)
  → userinfo endpoint with the bearer token. It sends no PKCE challenge and no
  nonce and does not validate an ID token; identity comes from userinfo over
  the back channel, which is sound for a confidential client over TLS.
- **Account linking is by e-mail only.** `User.ensure()`
  (`packages/keybr-database/lib/model.ts`) looks the user up by
  `ResourceOwner.email` and merges in a `UserExternalId` row for the
  provider. The provider's stable subject id is stored but never used for
  lookup, so an e-mail change at the provider creates a new keybr account.
- **Sessions cover multiplayer.** `loadUser()` resolves the user from the
  session cookie, and the game websocket controller
  (`packages/server/lib/app/game/controller.ts`) takes `publicUser` from the
  same state. Any login that sets `session.userId` authenticates `/_/game/`
  too; no separate work is needed there.
- **Config.** `@keybr/config` loads dotenv files with
  `process.loadEnvFile`, which does not override variables already in the
  process environment, so secrets can be injected by systemd
  (`EnvironmentFile`/credentials) and win over `/etc/keybr/env`.
- **Listen address.** `Service.listen()` takes no host and binds every
  interface (dotfiles-r1m works around this with a systemd IP filter).

## Proposed changes

### 1. Generic `OidcAdapter` in `@keybr/oauth`

New `packages/keybr-oauth/lib/adapter/oidc/` alongside the existing adapters.

- Constructed from a `ClientConfig` plus an `OidcProviderConfig`:
  `{ id, issuer, authorizationUri?, tokenUri?, userinfoUri? }`.
- Endpoints come from `${issuer}/.well-known/openid-configuration` when not
  given explicitly. Fetch lazily on first use and cache per process (each
  cluster worker fetches once); fail the login with a clear error if
  discovery fails, never at startup.
- `parseProfileResponse` maps standard claims:
  `sub` → `id`, `email` → `email`, `name ?? preferred_username` → `name`,
  `picture` → `imageUrl`, `profile` → `url`; `provider` is the configured
  `id`.
- If the claims contain `email_verified: false`, return `email: null` so the
  existing "require email" path refuses the login rather than linking an
  unverified address.
- Default scope `openid profile email`.

### 2. PKCE in `AbstractAdapter`

Add optional PKCE (S256) to the base class so every adapter can use it:

- `getAuthorizationUrl({ state, codeChallenge? })` adds `code_challenge` and
  `code_challenge_method=S256`.
- `getAccessToken({ code, codeVerifier? })` adds `code_verifier`.
- `Controller.oAuthInit` generates a verifier, stores it in the session next
  to `authState`; `oAuthCallback` pulls it. Enabled per adapter
  (`usesPkce`), on for `OidcAdapter`, off for the existing three so their
  behavior is unchanged.

This lets the IdP enforce PKCE (Authelia `require_pkce: true`).

### 3. Configuration-driven provider registration

`AuthModule` registers an `AdapterFactory` only when that provider is
configured:

| Provider  | Enabled when                                   |
| --------- | ---------------------------------------------- |
| google    | `AUTH_GOOGLE_CLIENT_ID` is set                 |
| microsoft | `AUTH_MICROSOFT_CLIENT_ID` is set              |
| facebook  | `AUTH_FACEBOOK_CLIENT_ID` is set               |
| oidc      | `AUTH_OIDC_ISSUER` and `AUTH_OIDC_CLIENT_ID` set |

OIDC variables:

```
AUTH_OIDC_ID=authelia            # path segment and provider name; default "oidc"
AUTH_OIDC_NAME=Greyface SSO      # button label
AUTH_OIDC_ISSUER=https://sso.example.org
AUTH_OIDC_CLIENT_ID=keybr
AUTH_OIDC_CLIENT_SECRET=...      # inject via the environment, not a world-readable file
AUTH_OIDC_SCOPE=openid profile email   # optional
AUTH_EMAIL_LOGIN=false           # hide/disable magic-link login; default true
```

Production keybr.com sets the Google/Microsoft/Facebook variables already, so
it is unaffected. A single OIDC provider is enough for now; the variable
naming leaves room for a numbered list later if needed.

`AUTH_EMAIL_LOGIN=false` makes `create-token` and `login` return 404.

### 4. Expose enabled login methods to the client

The account page must render only what the server enabled.

- Add `loginMethods: { email: boolean; oauth: { id, name, icon? }[] }` to the
  page data the server already embeds for SSR/hydration (the same channel that
  carries `publicUser`/settings through `@keybr/pages-shared`).
- `OAuthLoginForm` maps over `oauth` instead of its hardcoded array, with a
  generic icon (e.g. `mdiLogin`/`mdiShieldAccount`) for OIDC.
- The account page hides the e-mail form when `email` is false and hides the
  whole sign-in section only if both are empty.

### 5. Look up by external id before e-mail

Change `User.ensure()` to:

1. find `UserExternalId` by `(provider, externalId)`; if found, update that
   user (name, e-mail if changed and not taken);
2. otherwise fall back to the current find-by-e-mail merge.

This keeps existing accounts working (first OIDC login links by e-mail, e.g.
to the bootstrap account) and makes the IdP subject the stable key after
that. Needs a unique index on `user_external_id(provider, external_id)` if
one does not exist; check `packages/keybr-database/lib/schema.ts`.

### 6. Optional: listen host

Add `SERVER_HOST` (default unchanged: all interfaces) and pass it to
`listen()` for both the HTTP and the WS listener. This lets deployments
behind a reverse proxy bind to loopback, which fixes dotfiles-r1m at the
source and lets the systemd IP filter (which also blocks the outbound OIDC
back-channel) be dropped.

## Login flow (Authelia deployment)

```
browser ── GET /auth/oauth-init/authelia ──▶ keybr
        ◀─ 302 sso/api/oidc/authorization?…&state&code_challenge
browser ── LLDAP login (one_factor) ──▶ Authelia
        ◀─ 302 keybr/auth/oauth-callback/authelia?code&state
browser ── GET callback ──▶ keybr ── POST token (client_secret_post, code_verifier) ──▶ Authelia
                                  ── GET userinfo (Bearer) ──▶ Authelia
        ◀─ 302 /account + session cookie   (also authenticates /_/game/)
```

## Testing

- `keybr-oauth`: `OidcAdapter` claim mapping (full, minimal,
  `email_verified: false`), discovery parsing and caching, PKCE parameters in
  authorization URL and token request — following the existing
  `adapter/google/adapter.test.ts` pattern with `FakeResponse`.
- `server`: extend `auth/auth-oauth.test.ts` — PKCE verifier round-trips
  through the session; unknown/unconfigured providers 404; email login 404s
  when `AUTH_EMAIL_LOGIN=false`.
- `keybr-database`: `User.ensure()` finds by external id after an e-mail
  change; first login still links by e-mail.
- `page-account`: form renders only the enabled providers.

## Out of scope

- RP-initiated logout (ending the IdP session from keybr `/auth/logout`).
  Logging out of keybr leaves the Authelia session, so the next sign-in is
  silent. Acceptable for now.
- Requiring login for all use. keybr stays usable anonymously; restricting
  who can practice at all is a separate feature.
- Group-based authorization in keybr. If needed, restrict at the IdP
  (Authelia `authorization_policy` with a group subject).

## Deployment side

Tracked in the dotfiles repo under epic dotfiles-8ru (Authelia client, secret
handling, network egress, pin bump, registry update).
