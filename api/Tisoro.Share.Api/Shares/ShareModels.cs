using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using Tisoro.Share.Api.OAuth;

namespace Tisoro.Share.Api.Shares;

public static class Platforms
{
    public static readonly string[] All = ["linkedin", "instagram", "x", "facebook", "tiktok"];

    /// <summary>How each path was confirmed — shown to Tisoro's admin as the proof column heading.</summary>
    public static string Method(string platform, string path, string? detail = null) => (platform, path) switch
    {
        ("linkedin", "api") => "Posted by Tisoro through LinkedIn's API",
        ("x", "api") => "Posted by Tisoro through X's API",
        ("x", "self") => detail == "quote" ? "Found in the quotes of Tisoro's post" : "Found in the reposts of Tisoro's post",
        ("instagram", "story") => "Instagram told Tisoro about the mention",
        ("facebook", "page") => "Posted by Tisoro through Facebook's Pages API",
        ("facebook", "profile") => "Partner tapped “Yes, I shared”",
        ("tiktok", "api") => "Posted by Tisoro through TikTok's posting API",
        ("tiktok", "app") => "Partner tapped “Yes, I reposted”",
        _ => path,
    };
}

public static class ShareStatus
{
    public const string NotStarted = "NotStarted";
    /// <summary>Waiting on the platform: Instagram mention webhook, TikTok processing.</summary>
    public const string Waiting = "Waiting";
    /// <summary>The platform itself proved it: API response, repost list match, or mention webhook.</summary>
    public const string Verified = "Verified";
    /// <summary>The partner tapped to confirm; Facebook profiles and the TikTok app can't be checked.</summary>
    public const string SelfConfirmed = "SelfConfirmed";
}

public sealed record Submission(
    string Status = ShareStatus.NotStarted,
    string? Path = null,
    string? Method = null,
    string? Evidence = null,
    /// <summary>Username the partner typed (X self path, Instagram), used to match their share.</summary>
    string? Username = null,
    string? PostUrl = null,
    string? FailureReason = null,
    DateTimeOffset? UpdatedAt = null);

public sealed record SubmissionDto(
    string Platform, string Status, string? Path, bool Connected, string? Handle, string? Username,
    string? PostUrl, string? Method, string? Evidence, string? FailureReason, DateTimeOffset? UpdatedAt);

/// <summary>Per-session share progress. In-memory for now; becomes the ShareSubmission table (spec §6).</summary>
public sealed class SubmissionStore
{
    private readonly ConcurrentDictionary<(string Session, string Ceremony, string Platform), Submission> items = new();

    public Submission Get(string sid, string ceremonyId, string platform) =>
        items.GetValueOrDefault((sid, ceremonyId, platform)) ?? new Submission();

    public Submission Update(string sid, string ceremonyId, string platform, Func<Submission, Submission> change) =>
        items.AddOrUpdate((sid, ceremonyId, platform),
            _ => change(new Submission()) with { UpdatedAt = DateTimeOffset.UtcNow },
            (_, s) => change(s) with { UpdatedAt = DateTimeOffset.UtcNow });

    public IEnumerable<(string Session, string Ceremony, string Platform, Submission Submission)> All() =>
        items.Select(kv => (kv.Key.Session, kv.Key.Ceremony, kv.Key.Platform, kv.Value));
}

public sealed class ShareHub : Hub
{
    public static string Group(string sid, string ceremonyId) => $"{sid}:{ceremonyId}";

    public Task JoinCeremony(string ceremonyId) =>
        Groups.AddToGroupAsync(Context.ConnectionId, Group(Context.GetHttpContext()!.Id(), ceremonyId));
}

/// <summary>Builds DTOs and pushes changes that finish outside a request (webhooks, background polls).</summary>
public sealed class ShareNotifier(IHubContext<ShareHub> hub, SubmissionStore submissions, ConnectionStore connections)
{
    public SubmissionDto Dto(string sid, string ceremonyId, string platform)
    {
        var s = submissions.Get(sid, ceremonyId, platform);
        var c = connections.Get(sid, platform);
        return new SubmissionDto(platform, s.Status, s.Path, c is not null, c?.Handle, s.Username,
            s.PostUrl, s.Method, s.Evidence, s.FailureReason, s.UpdatedAt);
    }

    public Task PushAsync(string sid, string ceremonyId, string platform) =>
        hub.Clients.Group(ShareHub.Group(sid, ceremonyId))
            .SendAsync("shareStatusChanged", new { ceremonyId, submission = Dto(sid, ceremonyId, platform) });
}
