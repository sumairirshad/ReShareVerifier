# Tisoro Share API (.NET 10)

Backend for the Verify Your Share page. Currently implements **real OAuth** for LinkedIn, Facebook,
Instagram, TikTok and X, plus **real LinkedIn publishing** (`POST /api/shares/linkedin/publish` reshares
Tisoro's post via the Posts API, spec §4.2). The handle shown on each card comes from the user's own
account. The remaining publish/verify endpoints (X, Facebook, Instagram, TikTok) return `501` until
the next step.

## Run

```bash
cd api/Tisoro.Share.Api && dotnet run      # https://localhost:5001
cd web && npm start                        # https://127.0.0.1:4200 (proxies /api and /hubs to :5001)
```

Open https://127.0.0.1:4200/ceremonies/demo/verify-share. (`npm run start:demo` = old in-browser fake.)

## 1. Register this redirect URI in each developer app

| Platform | Where | Redirect URI |
|---|---|---|
| LinkedIn | developer.linkedin.com → app → Auth → *Authorized redirect URLs* | `https://127.0.0.1:4200/api/oauth/linkedin/callback` |
| Facebook | developers.facebook.com → app → Facebook Login → Settings → *Valid OAuth Redirect URIs* | `https://127.0.0.1:4200/api/oauth/facebook/callback` |
| Instagram | same Meta app → Instagram → API setup with Instagram login → *Business login settings* | `https://127.0.0.1:4200/api/oauth/instagram/callback` |
| TikTok | developers.tiktok.com → app → Login Kit → *Redirect URI* | `https://127.0.0.1:4200/api/oauth/tiktok/callback` |
| X | developer.x.com → app → User authentication settings (OAuth 2.0, *Web App / confidential client*) → *Callback URI* | `https://127.0.0.1:4200/api/oauth/x/callback` |

Products/scopes to enable per app are listed in `appsettings.json` → `OAuth:*:Scopes`. For LinkedIn,
`w_member_social` requires the **Share on LinkedIn** (or Community Management API) product — add it under
your app's *Products* tab, not just *Sign In with LinkedIn using OpenID Connect* — or the authorize request
is rejected with "Scope ... is not authorized for your application".

Some providers (TikTok in particular, sometimes Instagram) refuse `localhost` redirect URIs. If so, expose
the SPA through an HTTPS tunnel (e.g. ngrok), register `https://<tunnel-host>/api/oauth/<platform>/callback`,
and set `OAuth:PublicBaseUrl` to `https://<tunnel-host>`.

## 2. Add the keys with user secrets (never commit them, never paste them in chat)

```bash
cd api/Tisoro.Share.Api
dotnet user-secrets set "OAuth:LinkedIn:ClientId"      "..."
dotnet user-secrets set "OAuth:LinkedIn:ClientSecret"  "..."
dotnet user-secrets set "OAuth:Facebook:ClientId"      "<Meta App ID>"
dotnet user-secrets set "OAuth:Facebook:ClientSecret"  "<Meta App Secret>"
dotnet user-secrets set "OAuth:Instagram:ClientId"     "<Instagram App ID>"      # differs from the Meta App ID
dotnet user-secrets set "OAuth:Instagram:ClientSecret" "<Instagram App Secret>"
dotnet user-secrets set "OAuth:TikTok:ClientId"        "<Client Key>"
dotnet user-secrets set "OAuth:TikTok:ClientSecret"    "<Client Secret>"
dotnet user-secrets set "OAuth:X:ClientId"             "<OAuth 2.0 Client ID>"   # not the API key / bearer token
dotnet user-secrets set "OAuth:X:ClientSecret"         "<OAuth 2.0 Client Secret>"
```

On startup the API logs `OAuth configured for: ...`. Unconfigured platforms show
"*X sign-in isn't set up yet*" on their card instead of opening a popup.

## Before production approval

Meta (`user_posts`, Instagram publishing) and TikTok (`video.publish`) only work for accounts added as
testers/developers on the app until App Review / audit is approved. LinkedIn and X work for anyone.

## How it works

1. `GET /api/oauth/{platform}/start` → random `state` (+ PKCE for X) bound to the browser's session cookie → `{ authorizeUrl }`.
2. SPA opens that URL in a popup; the user signs in on the real platform.
3. `GET /api/oauth/{platform}/callback` → state checked (one-time) → code exchanged with the client secret →
   profile read (username/name) → token encrypted with Data Protection → redirect to SPA `/oauth/callback?handle=...`.
4. `GET /api/ceremonies/{id}/shares` reports `connected` + `handle`, so a reload keeps the account connected.
5. `POST /api/shares/linkedin/publish` uses the stored token to call the Posts API with
   `reshareContext.parent = {ceremony's LinkedIn post URN}` and the confirmed caption as `commentary`.
   The created post's URN comes back in the `x-restli-id` response header; on success the submission is
   marked `Verified` with a `https://www.linkedin.com/feed/update/{urn}/` link. A 401 here means the stored
   token expired — the SPA sends the user back to Connect.

Tokens and share progress are in memory for now (lost on restart); SQL Server tables from spec §6 come next.
