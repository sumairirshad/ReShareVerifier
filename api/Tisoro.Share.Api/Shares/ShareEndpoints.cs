using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using Tisoro.Share.Api.OAuth;

namespace Tisoro.Share.Api.Shares;

public static class Platforms
{
    public static readonly string[] All = ["linkedin", "instagram", "x", "tiktok", "facebook"];
}

/// <summary>Per-session share progress. In-memory for now; becomes the ShareSubmission table (spec §6).</summary>
public sealed class SubmissionStore
{
    private readonly ConcurrentDictionary<(string Session, string Ceremony, string Platform), Submission> items = new();

    public Submission Get(string sid, string ceremonyId, string platform) =>
        items.GetValueOrDefault((sid, ceremonyId, platform)) ?? new Submission();

    public Submission Update(string sid, string ceremonyId, string platform, Func<Submission, Submission> change) =>
        items.AddOrUpdate((sid, ceremonyId, platform), _ => change(new Submission()), (_, s) => change(s));
}

public sealed record Submission(
    string Status = "NotStarted",
    DateTimeOffset? ShareClickedAt = null,
    string? SharedPostUrl = null,
    string? FailureReason = null);

public sealed record SubmissionDto(
    string Platform, string Status, bool Connected, string? Handle,
    string? SharedPostUrl, string? FailureReason, DateTimeOffset? ShareClickedAt);

public sealed record CeremonyRequest(string CeremonyId);

public sealed class ShareHub : Hub
{
    public static string Group(string sid, string ceremonyId) => $"{sid}:{ceremonyId}";

    public Task JoinCeremony(string ceremonyId) =>
        Groups.AddToGroupAsync(Context.ConnectionId, Group(Context.GetHttpContext()!.Id(), ceremonyId));
}

public static class ShareEndpoints
{
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
                ceremonyTitle = ceremony["Title"] ?? "",
                platforms = Platforms.All.Select(p =>
                {
                    var s = ceremony.GetSection($"Platforms:{p}");
                    return new
                    {
                        platform = p,
                        availability = s["Availability"] ?? "hidden",
                        postId = s["PostId"] ?? "",
                        postUrl = s["PostUrl"] ?? "",
                        defaultCaption = s["Caption"] ?? defaultCaption,
                    };
                }),
            });
        });

        app.MapGet("/api/ceremonies/{ceremonyId}/shares", (string ceremonyId, HttpContext http,
            SubmissionStore submissions, ConnectionStore connections) =>
            Results.Ok(Platforms.All.Select(p => ToDto(http.Id(), ceremonyId, p, submissions, connections))));

        app.MapPost("/api/shares/{platform}/clicked", (string platform, CeremonyRequest body, HttpContext http,
            SubmissionStore submissions, ConnectionStore connections) =>
        {
            if (!Platforms.All.Contains(platform)) return Results.NotFound();
            submissions.Update(http.Id(), body.CeremonyId, platform, s => s with { ShareClickedAt = DateTimeOffset.UtcNow });
            return Results.Ok(ToDto(http.Id(), body.CeremonyId, platform, submissions, connections));
        });

        // Next step: real verification/publishing on top of the stored tokens.
        IResult NotYet(HttpContext _) => Results.Problem(statusCode: 501, title: "Not implemented",
            detail: "Sign-in works; posting and verification are the next step and aren't switched on yet.");
        app.MapPost("/api/shares/x/verify", NotYet);
        app.MapPost("/api/shares/facebook/verify", NotYet);
        app.MapPost("/api/shares/{platform}/publish", NotYet);
        app.MapPost("/api/shares/{platform}/screenshot", NotYet).DisableAntiforgery();

        app.MapHub<ShareHub>("/hubs/share");
    }

    private static SubmissionDto ToDto(string sid, string ceremonyId, string platform, SubmissionStore submissions, ConnectionStore connections)
    {
        var s = submissions.Get(sid, ceremonyId, platform);
        var c = connections.Get(sid, platform);
        return new SubmissionDto(platform, s.Status, c is not null, c?.Handle, s.SharedPostUrl, s.FailureReason, s.ShareClickedAt);
    }
}
