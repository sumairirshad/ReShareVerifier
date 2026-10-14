# Tisoro Share API (.NET 10)

Backend for Tisoro screen 09, "Share Your Ceremony And Get Featured" (design:
`\\10.10.8.200\Documentation\Tisoro\social-media-sharing\social-media-share-flow.html`).

## Run

```bash
cd api/Tisoro.Share.Api && dotnet run      # https://localhost:5001
cd web && npm start                        # https://127.0.0.1:4200 (proxies /api and /hubs to :5001)
```

Open **https://127.0.0.1:4200** (not localhost: X rejects localhost callback URLs, and the sign-in cookie
must match). `npm run start:demo` runs the page against an in-browser fake instead.

On startup the API logs what's switched on, e.g.
`Sign-in configured for: X` and `X repost check: off · Instagram mention webhook: off · Admin view: off`.

## How each platform is shared and confirmed

| Platform | Ways to share | Confirmed by | Needs (in `.env`) |
|---|---|---|---|
| LinkedIn | Repost through Tisoro | ✅ Post ID from LinkedIn's Posts API | `LINKEDIN_CLIENT_ID/SECRET` |
| X | Repost through Tisoro | ✅ Post ID from X's API (quote post) | `X_CLIENT_ID/SECRET` (scope `tweet.write`; X bills per post) |
| X | Repost on X yourself | ✅ Username found in the reposts/quotes of Tisoro's post | `X_BEARER_TOKEN` |
| Instagram | Story with @tisoroglobal mention | ✅ Instagram's `story_mention` webhook to Tisoro's account | `INSTAGRAM_APP_SECRET`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, `INSTAGRAM_TISORO_ACCESS_TOKEN` |
| Facebook | Post to your company Page | ✅ Post ID from the Pages API | `FACEBOOK_APP_ID/SECRET` |
| Facebook | Share on your personal profile | 🟡 Partner taps "Yes, I shared" | — |
| TikTok | Post to your TikTok | ✅ TikTok publish status | `TIKTOK_CLIENT_KEY/SECRET`, `TIKTOK_VIDEO_URL` |
| TikTok | Repost in the TikTok app | 🟡 Partner taps "Yes, I reposted" | — |

Which ways are offered per platform is `Share:Ceremony:Platforms:<platform>:Paths` in `appsettings.json`
(e.g. drop `"api"` from TikTok until TikTok's audit passes).

## Keys

Copy `.env.example` to `.env` (git-ignored) and fill in what you have. **Never put keys in `appsettings.json`** —
it's committed. Restart the API after changing `.env`.

### Redirect URIs to register (sign-in)

| Platform | Where | Redirect URI |
|---|---|---|
| LinkedIn | app → Auth → Authorized redirect URLs | `https://127.0.0.1:4200/api/oauth/linkedin/callback` |
| X | app → User authentication settings (Web App, OAuth 2.0, Read and write) → Callback URI | `https://127.0.0.1:4200/api/oauth/x/callback` |
| Facebook | app → Facebook Login for Business → Settings → Valid OAuth Redirect URIs | `https://127.0.0.1:4200/api/oauth/facebook/callback` |
| TikTok | app → Login Kit → Redirect URI | `https://<public-host>/api/oauth/tiktok/callback` (TikTok refuses localhost; use a tunnel and set `OAUTH_PUBLIC_BASE_URL`) |

### Instagram Story mentions (webhook)

Partners don't sign in to Instagram. Tisoro's own Instagram professional account receives a webhook when
someone mentions @tisoroglobal in a Story:

1. Meta app → Instagram → API setup with Instagram login → generate a token for Tisoro's account with
   `instagram_business_basic` + `instagram_business_manage_messages` → `INSTAGRAM_TISORO_ACCESS_TOKEN`.
2. Webhooks → callback URL `https://<public-host>/api/webhooks/instagram`, verify token = `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`,
   subscribe to `messages`. Must be a public HTTPS URL (a tunnel works for testing).
3. `instagram_business_manage_messages` needs Meta App Review before it works for accounts outside the app's roles.

Every webhook is checked against `X-Hub-Signature-256` with `INSTAGRAM_APP_SECRET`.

### Approvals

- **Meta**: App Review + Business Verification for `pages_manage_posts`, `pages_read_engagement`, `instagram_business_manage_messages`.
  Until then only app admins/developers/testers can use them.
- **TikTok**: audit for Direct Post; before it, posts can only be private ("Only me"). The video URL's domain must be verified in the app.
- **X**: the free tier can't read reposts/quotes; `X_BEARER_TOKEN` needs a paid (pay-per-use or Basic) plan.

## Endpoints

| Method | Route | |
|---|---|---|
| GET | `/api/ceremonies/{id}/share-config` | Tisoro's posts, formats, captions, ways to share |
| GET | `/api/ceremonies/{id}/shares` | This partner's status per platform |
| GET | `/api/oauth/{platform}/start` · `/callback` | Sign-in (linkedin, x, facebook, tiktok) |
| POST | `/api/shares/linkedin/publish` · `/x/publish` | Post through Tisoro `{ ceremonyId, caption }` |
| POST | `/api/shares/x/check` | Find the partner's own repost `{ ceremonyId, username }` |
| POST | `/api/shares/instagram/expect` | Start waiting for the Story mention `{ ceremonyId, username }` |
| GET / POST | `/api/shares/facebook/pages` · `/facebook/publish` | List Pages · post `{ ceremonyId, pageId, caption }` |
| GET / POST | `/api/shares/tiktok/creator-info` · `/tiktok/publish` | Privacy options · post `{ ceremonyId, caption, privacyLevel }` |
| POST | `/api/shares/{facebook\|tiktok}/self-confirm` | Partner confirms `{ ceremonyId, postUrl? }` |
| GET / POST | `/api/webhooks/instagram` | Meta verification · story mentions |
| GET | `/api/admin/ceremonies/{id}/shares` | Admin view (header `X-Admin-Key` = `ADMIN_KEY`) |
| — | SignalR `/hubs/share` | `JoinCeremony(id)`; pushes `shareStatusChanged { ceremonyId, submission }` |

Share actions are rate-limited to 20/minute per browser. Tokens and share state are in memory for now
(lost on restart); the SQL Server tables from the spec come next.
