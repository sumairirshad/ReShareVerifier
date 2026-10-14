using System.Net.Http.Headers;
using System.Text.Json;

namespace Tisoro.Share.Api.Shares;

/// <summary>
/// Finds a partner's repost or quote of Tisoro's X post using Tisoro's own app token (no user sign-in).
/// Protected accounts never appear in these lists.
/// </summary>
public sealed class XRepostLookup(HttpClient http, IConfiguration config, ILogger<XRepostLookup> logger)
{
    private const int MaxPages = 5; // 500 reposts + 500 quotes is plenty within the 24h feature window

    public bool IsConfigured => !string.IsNullOrWhiteSpace(config["X:BearerToken"]);

    /// <returns>"repost" or "quote" when found, otherwise null.</returns>
    public async Task<string?> FindAsync(string tisoroPostId, string username, CancellationToken ct)
    {
        if (await ContainsUserAsync($"https://api.x.com/2/tweets/{tisoroPostId}/retweeted_by?max_results=100&user.fields=username", "data", username, ct))
            return "repost";
        if (await ContainsUserAsync($"https://api.x.com/2/tweets/{tisoroPostId}/quote_tweets?max_results=100&expansions=author_id&user.fields=username", "includes.users", username, ct))
            return "quote";
        return null;
    }

    private async Task<bool> ContainsUserAsync(string url, string usersPath, string username, CancellationToken ct)
    {
        string? next = null;
        for (var page = 0; page < MaxPages; page++)
        {
            var req = new HttpRequestMessage(HttpMethod.Get, next is null ? url : $"{url}&pagination_token={Uri.EscapeDataString(next)}");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config["X:BearerToken"]);
            using var res = await http.SendAsync(req, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogWarning("X lookup {Path} failed: {Status} {Body}", req.RequestUri!.AbsolutePath, (int)res.StatusCode, body);
                throw new HttpRequestException($"X lookup failed ({(int)res.StatusCode}).");
            }

            var json = JsonDocument.Parse(body).RootElement;
            var users = usersPath.Split('.').Aggregate((JsonElement?)json, (e, key) => e is { } el && el.TryGetProperty(key, out var v) ? v : null);
            if (users is { ValueKind: JsonValueKind.Array } list &&
                list.EnumerateArray().Any(u => string.Equals(u.GetProperty("username").GetString(), username, StringComparison.OrdinalIgnoreCase)))
                return true;

            next = json.TryGetProperty("meta", out var meta) && meta.TryGetProperty("next_token", out var t) ? t.GetString() : null;
            if (next is null) return false;
        }
        return false;
    }
}
