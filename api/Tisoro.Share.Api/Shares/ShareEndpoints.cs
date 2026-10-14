using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Tisoro.Share.Api.OAuth;

namespace Tisoro.Share.Api.Shares;

public sealed record CaptionRequest(string CeremonyId, string Caption);
public sealed record UsernameRequest(string CeremonyId, string Username);
public sealed record FacebookPageRequest(string CeremonyId, string PageId, string Caption);
public sealed record TikTokPublishRequest(string CeremonyId, string Caption, string PrivacyLevel);
public sealed record SelfConfirmRequest(string CeremonyId, string? PostUrl);

public static partial class ShareEndpoints
{
    public const string RateLimitPolicy = "share-actions";

    public static void MapShareEndpoints(this IEndpointRouteBuilder app)
    {
        // Tisoro's own posts for the ceremony. Single ceremony from config until CeremonySocialPost exists.
        app.MapGet("/api/ceremonies/{ceremonyId}/share-config", (string ceremonyId, IConfiguration config) =>
        {
            var ceremony = config.GetSection("Share:Ceremony");
            var defaultCaption = ceremony["DefaultCaption"] ?? "";
            return Results.Ok(new
            {
                ceremonyId,
                title = ceremony["Title"] ?? "",
                companyName = ceremony["CompanyName"] ?? "",
                platforms = Platforms.All.Select(p =>
                {
                    var s = ceremony.GetSection($"Platforms:{p}");
                    return new
                    {
                        platform = p,
                        availability = s["Availability"] ?? "hidden",
                        paths = s.GetSection("Paths").Get<string[]>() ?? [],
                        format = s["Format"] ?? "",
                        postId = s["PostId"] ?? "",
                        postUrl = s["PostUrl"] ?? "",
                        caption = s["Caption"] ?? defaultCaption,
                    };
                }),
            });
        });

        app.MapGet("/api/ceremonies/{ceremonyId}/shares", (string ceremonyId, HttpContext http, ShareNotifier notifier) =>
            Results.Ok(Platforms.All.Select(p => notifier.Dto(http.Id(), ceremonyId, p))));

        var actions = app.MapGroup("/api/shares").RequireRateLimiting(RateLimitPolicy);

        // ── LinkedIn: repost through Tisoro ──────────────────────────────────────
        actions.MapPost("/linkedin/publish", (CaptionRequest body, HttpContext http, LinkedInProvider linkedIn,
            ConnectionStore connections, SubmissionStore submissions, ShareNotifier notifier, IConfiguration config, CancellationToken ct) =>
            Guarded("LinkedIn", async () =>
            {
                var sid = http.Id();
                if (Connected(connections, sid, "linkedin") is not { } auth) return NotConnected("LinkedIn");
                var (conn, token) = auth;
                if (Caption(body.Caption, 3000) is not { } caption) return BadCaption(3000);
                var parentUrn = Post(config, "linkedin").PostId;

                var urn = await linkedIn.PublishReshareAsync(token, $"urn:li:person:{conn.PlatformUserId}", parentUrn, caption, ct);
                submissions.Update(sid, body.CeremonyId, "linkedin", s => s with
                {
                    Status = ShareStatus.Verified, Path = "api", Method = Platforms.Method("linkedin", "api"),
                    Evidence = $"LinkedIn returned post ID {urn}", PostUrl = $"https://www.linkedin.com/feed/update/{urn}/", FailureReason = null,
                });
                return Results.Ok(notifier.Dto(sid, body.CeremonyId, "linkedin"));
            }));

        // ── X: quote-post through Tisoro, or find the partner's own repost ───────
        actions.MapPost("/x/publish", (CaptionRequest body, HttpContext http, XProvider x,
            ConnectionStore connections, SubmissionStore submissions, ShareNotifier notifier, IConfiguration config, CancellationToken ct) =>
            Guarded("X", async () =>
            {
                var sid = http.Id();
                if (Connected(connections, sid, "x") is not { } auth) return NotConnected("X");
                var (conn, token) = auth;
                if (Caption(body.Caption, 280) is not { } caption) return BadCaption(280);

                var id = await x.PostQuoteAsync(token, caption, Post(config, "x").PostId, ct);
                submissions.Update(sid, body.CeremonyId, "x", s => s with
                {
                    Status = ShareStatus.Verified, Path = "api", Method = Platforms.Method("x", "api"),
                    Evidence = $"X returned post ID {id}", PostUrl = $"https://x.com/{conn.Handle}/status/{id}", FailureReason = null,
                });
                return Results.Ok(notifier.Dto(sid, body.CeremonyId, "x"));
            }));

        actions.MapPost("/x/check", (UsernameRequest body, HttpContext http, XRepostLookup lookup,
            SubmissionStore submissions, ShareNotifier notifier, IConfiguration config, CancellationToken ct) =>
            Guarded("X", async () =>
            {
                var username = body.Username.Trim().TrimStart('@');
                if (!XUsername().IsMatch(username))
                    return Results.Problem(statusCode: 400, title: "Invalid username", detail: "Enter your X username, for example @harringtonwells.");
                if (!lookup.IsConfigured)
                    return Results.Problem(statusCode: 503, title: "Not configured", detail: "Checking X reposts isn't set up yet — the X bearer token is missing on the server.");

                var sid = http.Id();
                var kind = await lookup.FindAsync(Post(config, "x").PostId, username, ct);
                submissions.Update(sid, body.CeremonyId, "x", s => kind is null
                    ? s with { Username = username }
                    : s with
                    {
                        Status = ShareStatus.Verified, Path = "self", Username = username, Method = Platforms.Method("x", "self", kind),
                        Evidence = $"@{username} found in the {kind}s of Tisoro's post", PostUrl = null, FailureReason = null,
                    });
                return Results.Ok(new { found = kind is not null, submission = notifier.Dto(sid, body.CeremonyId, "x") });
            }));

        // ── Instagram: Story with @tisoroglobal mention, confirmed by webhook ────
        actions.MapPost("/instagram/expect", (UsernameRequest body, HttpContext http, SubmissionStore submissions, ShareNotifier notifier) =>
        {
            var username = body.Username.Trim().TrimStart('@').ToLowerInvariant();
            if (!InstagramUsername().IsMatch(username))
                return Results.Problem(statusCode: 400, title: "Invalid username", detail: "Enter your Instagram username, for example @harringtonwells.bank.");

            var sid = http.Id();
            var current = submissions.Get(sid, body.CeremonyId, "instagram");
            if (current.Status != ShareStatus.Verified)
                submissions.Update(sid, body.CeremonyId, "instagram", s => s with
                {
                    Status = ShareStatus.Waiting, Path = "story", Username = username, Method = Platforms.Method("instagram", "story"),
                    Evidence = "Waiting for the mention from Instagram", FailureReason = null,
                });
            return Results.Ok(notifier.Dto(sid, body.CeremonyId, "instagram"));
        });

        // ── Facebook: post to a company Page through Tisoro ──────────────────────
        actions.MapGet("/facebook/pages", (HttpContext http, FacebookProvider facebook, ConnectionStore connections, CancellationToken ct) =>
            Guarded("Facebook", async () =>
            {
                var sid = http.Id();
                if (Connected(connections, sid, "facebook") is not { } auth) return NotConnected("Facebook");
                var token = auth.Token;
                var pages = await facebook.GetPagesAsync(token, ct);
                foreach (var p in pages)
                {
                    connections.SaveSecret(sid, $"fb-page-token:{p.Id}", p.AccessToken);
                    connections.SaveSecret(sid, $"fb-page-name:{p.Id}", p.Name);
                }
                return Results.Ok(pages.Select(p => new { p.Id, p.Name, p.Followers, p.CanPost }));
            }));

        actions.MapPost("/facebook/publish", (FacebookPageRequest body, HttpContext http, FacebookProvider facebook,
            ConnectionStore connections, SubmissionStore submissions, ShareNotifier notifier, IConfiguration config, CancellationToken ct) =>
            Guarded("Facebook", async () =>
            {
                var sid = http.Id();
                if (Connected(connections, sid, "facebook") is null) return NotConnected("Facebook");
                if (connections.GetSecret(sid, $"fb-page-token:{body.PageId}") is not { } pageToken)
                    return Results.Problem(statusCode: 400, title: "Unknown Page", detail: "Choose your Page again.");
                if (Caption(body.Caption, 5000) is not { } caption) return BadCaption(5000);

                var pageName = connections.GetSecret(sid, $"fb-page-name:{body.PageId}") ?? "your Page";
                var id = await facebook.PostToPageAsync(pageToken, body.PageId, Post(config, "facebook").PostUrl, caption, ct);
                submissions.Update(sid, body.CeremonyId, "facebook", s => s with
                {
                    Status = ShareStatus.Verified, Path = "page", Method = Platforms.Method("facebook", "page"),
                    Evidence = $"Facebook returned post ID {id} on {pageName}", PostUrl = $"https://www.facebook.com/{id}", FailureReason = null,
                });
                return Results.Ok(notifier.Dto(sid, body.CeremonyId, "facebook"));
            }));

        // ── TikTok: post the video through Tisoro ────────────────────────────────
        actions.MapGet("/tiktok/creator-info", (HttpContext http, TikTokProvider tiktok, ConnectionStore connections, CancellationToken ct) =>
            Guarded("TikTok", async () =>
            {
                if (Connected(connections, http.Id(), "tiktok") is not { } auth) return NotConnected("TikTok");
                return Results.Ok(await tiktok.QueryCreatorInfoAsync(auth.Token, ct));
            }));

        actions.MapPost("/tiktok/publish", (TikTokPublishRequest body, HttpContext http, TikTokProvider tiktok,
            ConnectionStore connections, SubmissionStore submissions, ShareNotifier notifier, IConfiguration config,
            IHostApplicationLifetime lifetime, ILogger<TikTokProvider> log, CancellationToken ct) =>
            Guarded("TikTok", async () =>
            {
                var sid = http.Id();
                if (Connected(connections, sid, "tiktok") is not { } auth) return NotConnected("TikTok");
                var (conn, token) = auth;
                if (Caption(body.Caption, 2200) is not { } caption) return BadCaption(2200);
                if (config["Share:Ceremony:Platforms:tiktok:VideoUrl"] is not { Length: > 0 } videoUrl)
                    return Results.Problem(statusCode: 503, title: "Not configured", detail: "The ceremony video for TikTok isn't set up yet.");

                // TikTok requires the privacy level to be one the creator is currently allowed to use.
                var creator = await tiktok.QueryCreatorInfoAsync(token, ct);
                if (!creator.PrivacyOptions.Contains(body.PrivacyLevel))
                    return Results.Problem(statusCode: 400, title: "Invalid privacy level", detail: "Choose who can view the video.");

                var publishId = await tiktok.InitVideoPublishAsync(token, caption, body.PrivacyLevel, videoUrl, ct);
                submissions.Update(sid, body.CeremonyId, "tiktok", s => s with
                {
                    Status = ShareStatus.Waiting, Path = "api", Method = Platforms.Method("tiktok", "api"),
                    Evidence = "Uploading to TikTok", FailureReason = null,
                });
                _ = PollTikTokAsync(tiktok, token, publishId, conn.Handle, sid, body.CeremonyId, submissions, notifier, log, lifetime.ApplicationStopping);
                return Results.Ok(notifier.Dto(sid, body.CeremonyId, "tiktok"));
            }));

        // ── Facebook profile / TikTok app: the partner confirms it themselves ────
        actions.MapPost("/{platform}/self-confirm", (string platform, SelfConfirmRequest body, HttpContext http,
            SubmissionStore submissions, ShareNotifier notifier) =>
        {
            var path = platform switch { "facebook" => "profile", "tiktok" => "app", _ => null };
            if (path is null) return Results.NotFound();

            var postUrl = body.PostUrl?.Trim();
            if (!string.IsNullOrEmpty(postUrl) &&
                (postUrl.Length > 500 || !Uri.TryCreate(postUrl, UriKind.Absolute, out var u) || u.Scheme != Uri.UriSchemeHttps))
                return Results.Problem(statusCode: 400, title: "Invalid link", detail: "Paste the full https:// link to your post, or leave it empty.");

            var sid = http.Id();
            if (submissions.Get(sid, body.CeremonyId, platform).Status == ShareStatus.Verified)
                return Results.Ok(notifier.Dto(sid, body.CeremonyId, platform)); // never downgrade a verified share

            submissions.Update(sid, body.CeremonyId, platform, s => s with
            {
                Status = ShareStatus.SelfConfirmed, Path = path, Method = Platforms.Method(platform, path),
                Evidence = string.IsNullOrEmpty(postUrl)
                    ? platform == "tiktok" ? "TikTok doesn't report reposts" : "No post link added"
                    : $"Post link added: {postUrl}",
                PostUrl = string.IsNullOrEmpty(postUrl) ? null : postUrl, FailureReason = null,
            });
            return Results.Ok(notifier.Dto(sid, body.CeremonyId, platform));
        });

        // ── Tisoro admin: the ceremony's three stages ────────────────────────────
        app.MapGet("/api/admin/ceremonies/{ceremonyId}/shares", (string ceremonyId, HttpContext http, IConfiguration config,
            SubmissionStore submissions, ConnectionStore connections) =>
        {
            var key = config["Admin:Key"];
            if (string.IsNullOrEmpty(key)) return Results.NotFound(); // admin view switched off
            var given = http.Request.Headers["X-Admin-Key"].ToString();
            if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given), Encoding.UTF8.GetBytes(key)))
                return Results.Unauthorized();

            var partners = submissions.All()
                .Where(x => x.Ceremony == ceremonyId && x.Submission.Status != ShareStatus.NotStarted)
                .GroupBy(x => x.Session)
                .Select(g => new
                {
                    // Stand-in label until shares are tied to the host app's company accounts.
                    partner = $"Partner {g.Key[..6]}",
                    shares = g.Select(x => new
                    {
                        platform = x.Platform, x.Submission.Status, x.Submission.Path, x.Submission.Method,
                        x.Submission.Evidence, x.Submission.PostUrl, x.Submission.UpdatedAt,
                        handle = connections.Get(x.Session, x.Platform)?.Handle ?? x.Submission.Username,
                    }),
                });
            var official = Platforms.All.Select(p => new { platform = p, Post(config, p).PostUrl, format = config[$"Share:Ceremony:Platforms:{p}:Format"] });
            return Results.Ok(new { ceremonyId, companyName = config["Share:Ceremony:CompanyName"], official, partners });
        });

        app.MapHub<ShareHub>("/hubs/share");
    }

    private static async Task PollTikTokAsync(TikTokProvider tiktok, string token, string publishId, string handle, string sid,
        string ceremonyId, SubmissionStore submissions, ShareNotifier notifier, ILogger log, CancellationToken stopping)
    {
        try
        {
            for (var attempt = 0; attempt < 60; attempt++) // ~5 minutes
            {
                await Task.Delay(TimeSpan.FromSeconds(5), stopping);
                var status = await tiktok.FetchPublishStatusAsync(token, publishId, stopping);
                if (status.Status == "PUBLISH_COMPLETE")
                {
                    submissions.Update(sid, ceremonyId, "tiktok", s => s with
                    {
                        Status = ShareStatus.Verified,
                        Evidence = status.PostId is null ? "TikTok confirmed publish" : $"TikTok confirmed publish, video ID {status.PostId}",
                        PostUrl = status.PostId is null ? null : $"https://www.tiktok.com/@{handle}/video/{status.PostId}",
                    });
                    await notifier.PushAsync(sid, ceremonyId, "tiktok");
                    return;
                }
                if (status.Status == "FAILED")
                {
                    await FailTikTok($"TikTok couldn't publish the video ({status.FailReason ?? "unknown reason"}).");
                    return;
                }
            }
            await FailTikTok("TikTok is taking unusually long. Check your TikTok profile, then try again if it isn't there.");
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) when (ex is OAuthProviderException or HttpRequestException)
        {
            log.LogWarning(ex, "TikTok status polling failed for {PublishId}", publishId);
            await FailTikTok("We lost track of the TikTok upload. Check your TikTok profile, then try again if it isn't there.");
        }

        Task FailTikTok(string reason)
        {
            submissions.Update(sid, ceremonyId, "tiktok", s => s with { Status = ShareStatus.NotStarted, Evidence = null, FailureReason = reason });
            return notifier.PushAsync(sid, ceremonyId, "tiktok");
        }
    }

    /// <summary>Turns provider failures into a ProblemDetails the SPA shows verbatim.</summary>
    private static async Task<IResult> Guarded(string name, Func<Task<IResult>> action)
    {
        try { return await action(); }
        catch (OAuthProviderException ex) { return Results.Problem(statusCode: 502, title: $"{name} request failed", detail: ex.Message); }
        catch (HttpRequestException) { return Results.Problem(statusCode: 502, title: $"{name} unreachable", detail: $"Couldn't reach {name}. Please try again."); }
    }

    private static (Connection Connection, string Token)? Connected(ConnectionStore connections, string sid, string platform) =>
        connections.Get(sid, platform) is { } c && connections.GetAccessToken(sid, platform) is { } t ? (c, t) : null;

    private static IResult NotConnected(string name) =>
        Results.Problem(statusCode: 401, title: "Not connected", detail: $"Your {name} sign-in expired — connect again.");

    private static string? Caption(string? caption, int max) =>
        caption?.Trim() is { Length: > 0 } c && c.Length <= max ? c : null;

    private static IResult BadCaption(int max) =>
        Results.Problem(statusCode: 400, title: "Invalid caption", detail: $"Add a caption of up to {max} characters.");

    private static (string PostId, string PostUrl) Post(IConfiguration config, string platform) =>
        (config[$"Share:Ceremony:Platforms:{platform}:PostId"] ?? "", config[$"Share:Ceremony:Platforms:{platform}:PostUrl"] ?? "");

    [GeneratedRegex("^[A-Za-z0-9_]{1,15}$")] private static partial Regex XUsername();
    [GeneratedRegex("^[a-z0-9._]{1,30}$")] private static partial Regex InstagramUsername();
}
