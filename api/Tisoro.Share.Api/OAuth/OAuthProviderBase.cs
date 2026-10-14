using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace Tisoro.Share.Api.OAuth;

public abstract class OAuthProviderBase(HttpClient http, ILogger logger) : IOAuthProvider
{
    protected HttpClient Http { get; } = http;
    protected ILogger Logger { get; } = logger;

    public abstract string Platform { get; }
    public abstract string DisplayName { get; }
    public abstract ProviderOptions Options { get; }
    public virtual bool UsesPkce => false;

    public abstract string BuildAuthorizeUrl(string state, string redirectUri, string? codeChallenge);
    public abstract Task<TokenResult> ExchangeCodeAsync(string code, string redirectUri, string? codeVerifier, CancellationToken ct);
    public abstract Task<ProviderProfile> GetProfileAsync(TokenResult token, CancellationToken ct);

    protected static string Url(string baseUrl, IDictionary<string, string?> query) => QueryHelpers.AddQueryString(baseUrl, query);

    protected Task<JsonElement> PostFormAsync(string url, Dictionary<string, string> form, CancellationToken ct, AuthenticationHeaderValue? auth = null)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = new FormUrlEncodedContent(form) };
        req.Headers.Authorization = auth;
        return SendAsync(req, ct);
    }

    protected Task<JsonElement> PostJsonAsync(string url, object body, CancellationToken ct, string? bearer = null)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = System.Net.Http.Json.JsonContent.Create(body) };
        if (bearer is not null) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        return SendAsync(req, ct);
    }

    protected Task<JsonElement> GetJsonAsync(string url, CancellationToken ct, string? bearer = null)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, url);
        if (bearer is not null) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        return SendAsync(req, ct);
    }

    private async Task<JsonElement> SendAsync(HttpRequestMessage req, CancellationToken ct)
    {
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        using var res = await Http.SendAsync(req, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            // Never log tokens; provider error bodies don't contain them.
            Logger.LogWarning("{Provider} {Method} {Path} failed: {Status} {Body}",
                DisplayName, req.Method, req.RequestUri?.AbsolutePath, (int)res.StatusCode, body);
            throw new OAuthProviderException("provider_error", $"{DisplayName} rejected the request ({(int)res.StatusCode}).");
        }
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    protected static string? Str(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v)
            ? v.ValueKind == JsonValueKind.String ? v.GetString() : v.ValueKind == JsonValueKind.Number ? v.GetRawText() : null
            : null;

    protected static DateTimeOffset ExpiresIn(JsonElement e, TimeSpan fallback) =>
        e.TryGetProperty("expires_in", out var v) && v.TryGetInt64(out var secs) && secs > 0
            ? DateTimeOffset.UtcNow.AddSeconds(secs)
            : DateTimeOffset.UtcNow.Add(fallback);

    protected static string Required(string? value, string what) =>
        string.IsNullOrEmpty(value) ? throw new OAuthProviderException("provider_error", $"Missing {what} in provider response.") : value;
}
