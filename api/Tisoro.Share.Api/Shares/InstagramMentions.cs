using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Tisoro.Share.Api.Shares;

/// <summary>
/// Confirms Instagram Story shares: when an account mentions @tisoroglobal in a Story, Instagram sends a
/// `story_mention` message webhook to Tisoro's app. We resolve the sender's username with Tisoro's own token
/// and mark the matching partner's waiting share as Verified. Requires instagram_manage_messages on Tisoro's
/// Instagram account and a public HTTPS webhook URL (see api/README.md).
/// </summary>
public sealed class InstagramMentions(HttpClient http, IConfiguration config, ILogger<InstagramMentions> logger)
{
    public async Task<string?> UsernameOfAsync(string igsid, CancellationToken ct)
    {
        var token = config["Instagram:TisoroAccessToken"];
        if (string.IsNullOrEmpty(token)) return null;
        using var res = await http.GetAsync($"https://graph.instagram.com/v23.0/{Uri.EscapeDataString(igsid)}?fields=username&access_token={Uri.EscapeDataString(token)}", ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            logger.LogWarning("Instagram profile lookup for {Igsid} failed: {Status} {Body}", igsid, (int)res.StatusCode, body);
            return null;
        }
        return JsonDocument.Parse(body).RootElement.TryGetProperty("username", out var u) ? u.GetString() : null;
    }

    public static void MapInstagramWebhook(IEndpointRouteBuilder app)
    {
        // Meta's subscription handshake.
        app.MapGet("/api/webhooks/instagram", (HttpContext http, IConfiguration config) =>
        {
            var q = http.Request.Query;
            var expected = config["Instagram:WebhookVerifyToken"];
            return q["hub.mode"] == "subscribe" && !string.IsNullOrEmpty(expected) && q["hub.verify_token"] == expected
                ? Results.Text(q["hub.challenge"].ToString())
                : Results.StatusCode(403);
        });

        app.MapPost("/api/webhooks/instagram", async (HttpContext http, IConfiguration config, InstagramMentions mentions,
            SubmissionStore submissions, ShareNotifier notifier, ILogger<InstagramMentions> log, CancellationToken ct) =>
        {
            using var buffer = new MemoryStream();
            await http.Request.Body.CopyToAsync(buffer, ct);
            var raw = buffer.ToArray();

            // Only accept payloads signed with Tisoro's Instagram app secret.
            var secret = config["Instagram:AppSecret"];
            var signature = http.Request.Headers["X-Hub-Signature-256"].ToString();
            if (string.IsNullOrEmpty(secret) || !signature.StartsWith("sha256=", StringComparison.Ordinal)) return Results.StatusCode(403);
            var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), raw);
            byte[] given;
            try { given = Convert.FromHexString(signature["sha256=".Length..]); }
            catch (FormatException) { return Results.StatusCode(403); }
            if (!CryptographicOperations.FixedTimeEquals(expected, given)) return Results.StatusCode(403);

            foreach (var igsid in StoryMentionSenders(raw))
            {
                if (await mentions.UsernameOfAsync(igsid, ct) is not { } username) continue;
                var matches = submissions.All().Where(x => x.Platform == "instagram" && x.Submission.Status == ShareStatus.Waiting &&
                    string.Equals(x.Submission.Username, username, StringComparison.OrdinalIgnoreCase)).ToList();
                if (matches.Count == 0) log.LogInformation("Story mention from @{Username} matched no waiting share", username);

                foreach (var (sid, ceremonyId, platform, _) in matches)
                {
                    submissions.Update(sid, ceremonyId, platform, s => s with
                    {
                        Status = ShareStatus.Verified, Evidence = $"Instagram sent a Story mention from @{username}",
                    });
                    await notifier.PushAsync(sid, ceremonyId, platform);
                }
            }
            return Results.Ok(); // Always 200 once the signature checks out, or Meta retries and eventually disables the webhook.
        });
    }

    /// <summary>Sender IDs of `story_mention` messages in a webhook payload.</summary>
    private static IEnumerable<string> StoryMentionSenders(byte[] raw)
    {
        using var doc = JsonDocument.Parse(raw);
        var senders = new List<string>();
        if (!doc.RootElement.TryGetProperty("entry", out var entries)) return senders;
        foreach (var entry in entries.EnumerateArray())
        {
            if (!entry.TryGetProperty("messaging", out var messaging)) continue;
            foreach (var m in messaging.EnumerateArray())
            {
                var isMention = m.TryGetProperty("message", out var msg) && msg.TryGetProperty("attachments", out var atts) &&
                    atts.EnumerateArray().Any(a => a.TryGetProperty("type", out var t) && t.GetString() == "story_mention");
                if (isMention && m.TryGetProperty("sender", out var sender) && sender.TryGetProperty("id", out var id) && id.GetString() is { } s)
                    senders.Add(s);
            }
        }
        return senders;
    }
}
