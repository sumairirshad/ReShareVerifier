# Verify Your Share — One-Page App Specification

**Product:** Tisoro Network — Ceremony Share Verification
**Stack:** Angular (frontend) · .NET API · SQL Server · SignalR
**Status:** Draft v1

---

## 1. Purpose

After a company's ceremony video is published on Tisoro's official social accounts, the company shares it on its own accounts. This page lets them share to each platform and verifies each share automatically. Once a share is verified, Tisoro records the ceremony on the company's Tisoro Network profile.

Users may share on any subset of platforms and skip the rest.

### Tisoro official accounts

| Platform | Account |
|---|---|
| X | `@Tisoro_Global` |
| LinkedIn | `linkedin.com/company/tisoro-global` |
| Facebook | `facebook.com/officialtisoroglobal` |
| Instagram | `@tisoroglobal` |
| TikTok | `@tisoro.global` |

---

## 2. Platform Behaviour Summary

| Platform | Share action | Caption | Verification | Handle field |
|---|---|---|---|---|
| X | Quote-post intent of Tisoro's post | Prefilled | Handle → check user's recent posts for a quote of Tisoro's post | Yes |
| LinkedIn | User logs in → app reshares Tisoro's post via API | Prefilled, editable | Automatic (post ID returned) | No |
| Facebook | Opens sharer with Tisoro's post URL | **Copy caption** button (prefill not allowed) | User logs in → check `/me/posts` | No |
| Instagram | User logs in → app publishes video as a Reel | Prefilled, editable | Automatic (media ID returned) | No |
| TikTok | User logs in → app publishes video | Prefilled, editable | Automatic (post ID returned) | No |

---

## 3. Page Layout

### 3.1 Header
- Title: **Verify Your Share**
- Progress: `2 of 5 shared` (counts verified platforms)

### 3.2 Instructions
> Tap **Share** for each platform you use.
> LinkedIn, Instagram and TikTok are verified automatically.
> For X, enter your handle and tap **Verify**.
> For Facebook, paste the copied caption into your post, then tap **Verify with Facebook**.
> Posts must be **Public**. You don't have to use every platform — skip any you don't use.

### 3.3 Caption preview
- One editable caption per platform (X limited to 280 characters, including the quoted URL allowance).
- Default captions come from the ceremony configuration.

### 3.4 Platform cards (2-column grid on desktop, 1 column on mobile)

**X card**
- `Share on X` button
- Handle input `@yourhandle` + `Verify` button (enabled after Share is clicked)
- Status chip

**LinkedIn card**
- `Share on LinkedIn` button → OAuth → caption confirm modal → post
- Status chip

**Facebook card**
- `Copy caption` button (shows "Copied" toast)
- `Share on Facebook` button (also copies the caption automatically as a safeguard)
- `Verify with Facebook` button
- Status chip

**Instagram card**
- `Share on Instagram` button → OAuth → caption confirm modal → publish
- Status chip
- Fallback link (shown on personal-account error): "Switch to a free Creator account, or upload a screenshot"

**TikTok card**
- `Share on TikTok` button → OAuth → caption confirm modal → publish
- Status chip
- Hidden or shown as "Coming soon" until the TikTok audit is approved

### 3.5 Status chips

| State | Label | Colour |
|---|---|---|
| NotStarted | Not shared | Grey |
| Pending | Checking… / Posting… | Amber |
| Verified | ✓ Verified | Green |
| Failed | Not found — retry | Red |
| ManualReview | Under review | Blue |

Statuses update live via SignalR; no page refresh needed.

---

## 4. Flows

### 4.1 X
1. User clicks **Share on X** → open
   `https://x.com/intent/post?text={caption}&url={tisoroTweetUrl}`
2. User posts the quote on X.
3. User enters handle and clicks **Verify** → `POST /api/shares/x/verify`.
4. Backend:
   - `GET /2/users/by/username/{handle}` → user ID
   - `GET /2/users/{id}/tweets?start_time={shareClickedAt}&tweet.fields=referenced_tweets`
   - Verified if any post has `referenced_tweets.type = quoted` with `id = tisoroPostId`.
5. If not found: retry every 2 minutes for up to 30 minutes, then mark Failed.

### 4.2 LinkedIn
1. User clicks **Share on LinkedIn** → OAuth (OpenID Connect + `w_member_social`).
2. Caption confirm modal (editable).
3. Backend creates the post via Posts API with `reshareContext.parent = tisoroPostUrn` and the caption as commentary, visibility `PUBLIC`.
4. Post URN returned → mark Verified.

### 4.3 Facebook
1. User clicks **Copy caption** (or Share, which also copies).
2. **Share on Facebook** opens
   `https://www.facebook.com/sharer/sharer.php?u={tisoroFbPostUrl}`
3. User pastes the caption and posts publicly.
4. User clicks **Verify with Facebook** → Facebook Login with `user_posts`.
5. Backend calls
   `GET /me/posts?fields=id,message,permalink_url,parent_id,privacy,attachments{target,url}&since={shareClickedAt}`
6. Verified if a post references Tisoro's post (`parent_id` or attachment URL) **and** `privacy.value = EVERYONE`.
   Optional: also check `message` contains the caption.
7. Retry for up to 10 minutes using the stored short-lived token, then mark Failed.

### 4.4 Instagram
1. User clicks **Share on Instagram** → Instagram Login (`instagram_business_basic`, `instagram_business_content_publish`).
2. If the account is not Business/Creator → show fallback.
3. Caption confirm modal.
4. Backend:
   - `POST /{ig-user-id}/media` with `media_type=REELS`, `video_url={hostedVideoUrl}`, `caption`
   - Poll container `status_code` until `FINISHED`
   - `POST /{ig-user-id}/media_publish` with `creation_id`
5. Media ID returned → mark Verified.

### 4.5 TikTok
1. User clicks **Share on TikTok** → Login Kit (`user.info.basic`, `video.publish`).
2. Caption confirm modal.
3. Backend: `POST /v2/post/publish/video/init/` with `source=PULL_FROM_URL`, `video_url`, `title={caption}`, `privacy_level=PUBLIC_TO_EVERYONE`.
4. Poll `/v2/post/publish/status/fetch/` until `PUBLISH_COMPLETE`.
5. Post ID returned → mark Verified.

### 4.6 Screenshot fallback (Instagram personal accounts, approval gaps)
1. User uploads a screenshot showing their profile and the shared post.
2. Backend runs an AI vision check (handle match, video match against reference thumbnail).
3. Store the image hash and reject duplicates.
4. Confidence ≥ 0.85 → Verified; otherwise → ManualReview (admin queue).

---

## 5. Backend API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/ceremonies/{ceremonyId}/share-config` | Tisoro post URLs/IDs, captions, video URL, enabled platforms |
| GET | `/api/ceremonies/{ceremonyId}/shares` | Current status per platform for this company |
| POST | `/api/shares/{platform}/clicked` | Records share click time (start of verification window) |
| POST | `/api/shares/x/verify` | Body: `{ ceremonyId, handle }` |
| GET | `/api/oauth/{platform}/start?ceremonyId=` | Starts OAuth (linkedin, facebook, instagram, tiktok) |
| GET | `/api/oauth/{platform}/callback` | OAuth callback; stores token encrypted, short-lived |
| POST | `/api/shares/linkedin/publish` | Body: `{ ceremonyId, caption }` |
| POST | `/api/shares/instagram/publish` | Body: `{ ceremonyId, caption }` |
| POST | `/api/shares/tiktok/publish` | Body: `{ ceremonyId, caption }` |
| POST | `/api/shares/facebook/verify` | Runs `/me/posts` check |
| POST | `/api/shares/{platform}/screenshot` | Multipart upload for fallback |
| — | SignalR `/hubs/share` | Event `shareStatusChanged { platform, status, postUrl }` |

### Background jobs
- **X verifier:** re-checks Pending X shares every 2 min, up to 30 min.
- **Instagram container poller:** polls container status until publishable.
- **TikTok publish poller:** polls publish status until complete or failed.
- **Facebook verifier:** retries for up to 10 min while the token is valid.
- **Token cleanup:** deletes OAuth tokens after verification or expiry.

---

## 6. Data Model (SQL Server)

**CeremonySocialPost** — Tisoro's original posts per ceremony

| Column | Type |
|---|---|
| Id | int PK |
| CeremonyId | int FK |
| Platform | varchar(20) |
| PostId | varchar(100) |
| PostUrl | nvarchar(500) |
| DefaultCaption | nvarchar(3000) |
| VideoUrl | nvarchar(500) |
| IsEnabled | bit |

**ShareSubmission** — one row per company per platform per ceremony

| Column | Type |
|---|---|
| Id | int PK |
| CeremonyId | int FK |
| CompanyId | int FK |
| UserId | int FK |
| Platform | varchar(20) |
| Method | varchar(20) — Handle / OAuthCheck / ApiPost / Screenshot |
| Handle | nvarchar(100) null |
| PlatformUserId | varchar(100) null |
| SharedPostId | varchar(100) null |
| SharedPostUrl | nvarchar(500) null |
| CaptionUsed | nvarchar(3000) null |
| Status | varchar(20) |
| FailureReason | nvarchar(500) null |
| Attempts | int |
| ShareClickedAt | datetime2 null |
| VerifiedAt | datetime2 null |
| ScreenshotHash | char(64) null |

Unique index: `(CeremonyId, CompanyId, Platform)`.

**OAuthToken** — encrypted, deleted after use

| Column | Type |
|---|---|
| Id | int PK |
| SubmissionId | int FK |
| Platform | varchar(20) |
| AccessTokenEncrypted | varbinary(max) |
| ExpiresAt | datetime2 |

---

## 7. Developer Apps & Approvals

| Platform | App | Permissions / products | Approval | Cost |
|---|---|---|---|---|
| X | X Developer Console | App bearer token (read) | None | Pay-per-use credits |
| LinkedIn | LinkedIn Developers (linked to Tisoro page) | Sign In with LinkedIn (OIDC), Share on LinkedIn | Self-serve | Free |
| Facebook + Instagram | Meta for Developers (one app) | Facebook Login `user_posts`; Instagram Login `instagram_business_basic`, `instagram_business_content_publish` | App Review + Business Verification | Free |
| TikTok | TikTok for Developers | Login Kit, Content Posting API (`video.publish`), verified video domain | Audit required for public posts | Free |
| AI vision (fallback) | Anthropic API | — | None | Per call |

---

## 8. Configuration (appsettings / Key Vault)

```json
{
  "Share": {
    "VideoBaseUrl": "https://cdn.tisoroglobal.com/ceremonies/",
    "XVerifyWindowMinutes": 30,
    "FacebookVerifyWindowMinutes": 10,
    "ScreenshotAutoApproveConfidence": 0.85
  },
  "X": { "BearerToken": "" },
  "LinkedIn": { "ClientId": "", "ClientSecret": "", "RedirectUri": "" },
  "Meta": { "AppId": "", "AppSecret": "", "RedirectUri": "" },
  "TikTok": { "ClientKey": "", "ClientSecret": "", "RedirectUri": "" },
  "Anthropic": { "ApiKey": "" }
}
```

All secrets stored in Key Vault / user secrets, never in source control.

---

## 9. Security & Compliance

- OAuth `state` parameter bound to the user session and ceremony (CSRF protection).
- Tokens encrypted at rest and deleted once verification completes.
- Request only the scopes listed above.
- Verify webhook/request signatures where applicable.
- Rate-limit verify endpoints per user.
- Privacy policy and terms updated to describe what is accessed on each platform (required for Meta and TikTok review).
- Captions never auto-posted without the user confirming in the caption modal.

---

## 10. Open Items

- [ ] Collect live URLs/IDs of the ceremony video on all five Tisoro accounts.
- [ ] Host ceremony videos on a public HTTPS URL on a verified Tisoro domain (needed for Instagram and TikTok).
- [ ] Submit Meta App Review (`user_posts`, Instagram publishing) and Business Verification.
- [ ] Submit TikTok audit.
- [ ] Buy X pay-per-use credits.
- [ ] Confirm LinkedIn reshare via API with commentary works for member accounts in testing.
- [ ] Final default captions per platform.
- [ ] Decide whether TikTok is hidden or "Coming soon" until audit approval.
