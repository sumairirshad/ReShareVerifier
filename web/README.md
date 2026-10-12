# Verify Your Share — Angular frontend

Implements `../verify-your-share-spec.md`.

```bash
npm install
npm start          # http://localhost:4200 → /ceremonies/demo/verify-share (mock backend)
npm run build
```

`environment.development.ts` has `useMockApi: true`, so the page runs with no backend: HTTP, OAuth popups and
SignalR are faked in `src/app/core/mock/` (a "Demo mode" banner says so; nothing is really posted).
The demo sign-in popup lets you pick the handle; an X handle containing `fail` simulates a failed check,
and Instagram handle `personal` simulates a non-Creator account.

## Flow per card

1. **Connect** — OAuth popup for every platform; the handle is filled in from the provider profile.
   (X also accepts a typed handle as a fallback.)
2. **Share** — X: quote-post intent. Facebook: copy caption + sharer. LinkedIn/Instagram/TikTok: caption
   confirm dialog, then the API posts.
3. **Submit** — X and Facebook only; the others verify themselves when the API posts.
Set it to `false` to hit the .NET API through `proxy.conf.json` (`https://localhost:5001`).

## Route

`/ceremonies/:ceremonyId/verify-share` — the host app links here.

## Backend contract notes (differences from spec §5)

- **X now has OAuth too** (Connect step): `/api/oauth/x/start` with OAuth 2.0 + PKCE, scopes `users.read tweet.read`.
  Only the profile handle/ID is needed; `POST /api/shares/x/verify` still receives `{ ceremonyId, handle }`.
- `ShareSubmission.connected: boolean` — true while a usable token is stored, so a reload keeps step 1 done.
  Publish/verify return **401** when the token has expired; the card goes back to Connect.

- **`GET /api/oauth/{platform}/start?ceremonyId=`** returns JSON `{ "authorizeUrl": "..." }` instead of redirecting.
  The SPA calls it with HttpClient (so the auth interceptor applies and `state` binds to the user), then
  points a popup at the URL.
- **`GET /api/oauth/{platform}/callback`** stores the token, then redirects to the SPA's `/oauth/callback` with
  `?platform=&status=success|error&handle=&error=&error_description=`. Never put tokens in that URL.
  Instagram personal accounts: `status=error&error=personal_account` (shows the Creator/screenshot fallback).
- Share/verify/publish/screenshot endpoints return a `ShareSubmission` (`src/app/core/share.models.ts`).
- `share-config` returns `availability: enabled | comingSoon | hidden` per platform (TikTok until audit).
- SignalR hub `/hubs/share`: client invokes `JoinCeremony(ceremonyId)`; server sends
  `shareStatusChanged { ceremonyId, platform, status, postUrl, handle, failureReason }`.
- Errors: ProblemDetails `detail` is shown to the user; 429 shows a rate-limit message.
