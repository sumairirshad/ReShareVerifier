using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Tisoro.Share.Api.OAuth;

/// <summary>Sign In with LinkedIn (OpenID Connect) + Share on LinkedIn.</summary>
public sealed class LinkedInProvider(HttpClient http, IOptions<OAuthOptions> options, ILogger<LinkedInProvider> logger)
    : OAuthProviderBase(http, logger)
{
    public override string Platform => "linkedin";
    public override string DisplayName => "LinkedIn";
    public override ProviderOptions Options => options.Value.LinkedIn;

    public override string BuildAuthorizeUrl(string state, string redirectUri, string? codeChallenge) =>
        Url("https://www.linkedin.com/oauth/v2/authorization", new Dictionary<string, string?>
        {
            ["response_type"] = "code",
            ["client_id"] = Options.ClientId,
            ["redirect_uri"] = redirectUri,
            ["state"] = state,
            ["scope"] = Options.Scopes,
        });

    public override async Task<TokenResult> ExchangeCodeAsync(string code, string redirectUri, string? codeVerifier, CancellationToken ct)
    {
        var json = await PostFormAsync("https://www.linkedin.com/oauth/v2/accessToken", new()
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = redirectUri,
            ["client_id"] = Options.ClientId,
            ["client_secret"] = Options.ClientSecret,
        }, ct);
        return new TokenResult(Required(Str(json, "access_token"), "access_token"), ExpiresIn(json, TimeSpan.FromDays(60)));
    }

    public override async Task<ProviderProfile> GetProfileAsync(TokenResult token, CancellationToken ct)
    {
        // OIDC userinfo has no public vanity handle, so show the member's name.
        var me = await GetJsonAsync("https://api.linkedin.com/v2/userinfo", ct, token.AccessToken);
        return new ProviderProfile(Required(Str(me, "sub"), "sub"), Str(me, "name") ?? "LinkedIn member");
    }

    /// <summary>
    /// Reshares Tisoro's post with the user's commentary via the Posts API.
    /// <paramref name="authorUrn"/> is "urn:li:person:{sub}"; <paramref name="parentUrn"/> is Tisoro's post URN.
    /// Returns the created post's URN (from the `x-restli-id` response header; the API returns no body).
    /// </summary>
    public async Task<string> PublishReshareAsync(string accessToken, string authorUrn, string parentUrn, string commentary, CancellationToken ct)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "https://api.linkedin.com/rest/posts")
        {
            Content = JsonContent.Create(new
            {
                author = authorUrn,
                commentary,
                visibility = "PUBLIC",
                distribution = new { feedDistribution = "MAIN_FEED" },
                lifecycleState = "PUBLISHED",
                reshareContext = new { parent = parentUrn },
            }),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        // LinkedIn accepts any version within the trailing 12 months; last month is always safely in range.
        req.Headers.Add("LinkedIn-Version", DateTime.UtcNow.AddMonths(-1).ToString("yyyyMM"));
        req.Headers.Add("X-Restli-Protocol-Version", "2.0.0");

        using var res = await Http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode)
        {
            var body = await res.Content.ReadAsStringAsync(ct);
            Logger.LogWarning("LinkedIn publish failed: {Status} {Body}", (int)res.StatusCode, body);
            throw new OAuthProviderException("provider_error", $"LinkedIn rejected the post ({(int)res.StatusCode}).");
        }
        return res.Headers.TryGetValues("x-restli-id", out var ids) && ids.FirstOrDefault() is { Length: > 0 } id
            ? id
            : throw new OAuthProviderException("provider_error", "LinkedIn did not return a post ID.");
    }
}

/// <summary>Facebook Login for Pages: list the Pages a user manages and post to one of them.</summary>
public sealed class FacebookProvider(HttpClient http, IOptions<OAuthOptions> options, ILogger<FacebookProvider> logger)
    : OAuthProviderBase(http, logger)
{
    private const string Graph = "https://graph.facebook.com/v23.0";

    public override string Platform => "facebook";
    public override string DisplayName => "Facebook";
    public override ProviderOptions Options => options.Value.Facebook;

    public override string BuildAuthorizeUrl(string state, string redirectUri, string? codeChallenge) =>
        Url("https://www.facebook.com/v23.0/dialog/oauth", new Dictionary<string, string?>
        {
            ["client_id"] = Options.ClientId,
            ["redirect_uri"] = redirectUri,
            ["state"] = state,
            ["scope"] = Options.Scopes,
            ["response_type"] = "code",
        });

    public override async Task<TokenResult> ExchangeCodeAsync(string code, string redirectUri, string? codeVerifier, CancellationToken ct)
    {
        var json = await GetJsonAsync(Url($"{Graph}/oauth/access_token", new Dictionary<string, string?>
        {
            ["client_id"] = Options.ClientId,
            ["client_secret"] = Options.ClientSecret,
            ["redirect_uri"] = redirectUri,
            ["code"] = code,
        }), ct);
        return new TokenResult(Required(Str(json, "access_token"), "access_token"), ExpiresIn(json, TimeSpan.FromHours(1)));
    }

    public override async Task<ProviderProfile> GetProfileAsync(TokenResult token, CancellationToken ct)
    {
        var me = await GetJsonAsync(Url($"{Graph}/me", new Dictionary<string, string?>
        {
            ["fields"] = "id,name",
            ["access_token"] = token.AccessToken,
            ["appsecret_proof"] = AppSecretProof(token.AccessToken),
        }), ct);
        return new ProviderProfile(Required(Str(me, "id"), "id"), Str(me, "name") ?? "Facebook user");
    }

    /// <summary>Pages the user manages. Each comes with its own Page access token, which never leaves the server.</summary>
    public async Task<IReadOnlyList<FacebookPage>> GetPagesAsync(string userToken, CancellationToken ct)
    {
        var json = await GetJsonAsync(Url($"{Graph}/me/accounts", new Dictionary<string, string?>
        {
            ["fields"] = "id,name,fan_count,access_token,tasks",
            ["limit"] = "100",
            ["access_token"] = userToken,
            ["appsecret_proof"] = AppSecretProof(userToken),
        }), ct);
        if (!json.TryGetProperty("data", out var data)) return [];
        return data.EnumerateArray().Select(p => new FacebookPage(
            Required(Str(p, "id"), "id"),
            Str(p, "name") ?? "Page",
            p.TryGetProperty("fan_count", out var f) && f.TryGetInt64(out var n) ? n : 0,
            Required(Str(p, "access_token"), "access_token"),
            // Posting needs the CREATE_CONTENT task on the Page.
            p.TryGetProperty("tasks", out var tasks) && tasks.EnumerateArray().Any(t => t.GetString() == "CREATE_CONTENT"))).ToList();
    }

    /// <summary>Posts Tisoro's ceremony post as a link with the partner's caption. Returns the post ID ("{pageId}_{postId}").</summary>
    public async Task<string> PostToPageAsync(string pageToken, string pageId, string link, string message, CancellationToken ct)
    {
        var json = await PostFormAsync($"{Graph}/{pageId}/feed", new()
        {
            ["link"] = link,
            ["message"] = message,
            ["access_token"] = pageToken,
            ["appsecret_proof"] = AppSecretProof(pageToken),
        }, ct);
        return Required(Str(json, "id"), "id");
    }

    /// <summary>Required when "Require App Secret" is on in the Meta app; harmless otherwise.</summary>
    public string AppSecretProof(string accessToken) =>
        Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(Options.ClientSecret), Encoding.UTF8.GetBytes(accessToken)));
}

public sealed record FacebookPage(string Id, string Name, long Followers, string AccessToken, bool CanPost);

/// <summary>TikTok Login Kit (v2) + Content Posting API (Direct Post).</summary>
public sealed class TikTokProvider(HttpClient http, IOptions<OAuthOptions> options, ILogger<TikTokProvider> logger)
    : OAuthProviderBase(http, logger)
{
    private const string Api = "https://open.tiktokapis.com/v2";

    public override string Platform => "tiktok";
    public override string DisplayName => "TikTok";
    public override ProviderOptions Options => options.Value.TikTok;

    public override string BuildAuthorizeUrl(string state, string redirectUri, string? codeChallenge) =>
        Url("https://www.tiktok.com/v2/auth/authorize/", new Dictionary<string, string?>
        {
            ["client_key"] = Options.ClientId,
            ["scope"] = Options.Scopes,
            ["response_type"] = "code",
            ["redirect_uri"] = redirectUri,
            ["state"] = state,
        });

    public override async Task<TokenResult> ExchangeCodeAsync(string code, string redirectUri, string? codeVerifier, CancellationToken ct)
    {
        var json = await PostFormAsync($"{Api}/oauth/token/", new()
        {
            ["client_key"] = Options.ClientId,
            ["client_secret"] = Options.ClientSecret,
            ["code"] = code,
            ["grant_type"] = "authorization_code",
            ["redirect_uri"] = redirectUri,
        }, ct);
        if (Str(json, "error") is { Length: > 0 } error)
            throw new OAuthProviderException(error, Str(json, "error_description") ?? "TikTok sign-in failed.");
        return new TokenResult(Required(Str(json, "access_token"), "access_token"), ExpiresIn(json, TimeSpan.FromHours(24)), Str(json, "open_id"));
    }

    public override async Task<ProviderProfile> GetProfileAsync(TokenResult token, CancellationToken ct)
    {
        // `username` needs the user.info.profile scope; fall back to display_name without it.
        var fields = Options.Scopes.Contains("user.info.profile") ? "open_id,display_name,username" : "open_id,display_name";
        var user = Data(await GetJsonAsync($"{Api}/user/info/?fields={fields}", ct, token.AccessToken)).GetProperty("user");
        return new ProviderProfile(Required(Str(user, "open_id"), "open_id"), Str(user, "username") ?? Str(user, "display_name") ?? "TikTok user");
    }

    /// <summary>TikTok requires showing the creator's allowed privacy levels before every post.</summary>
    public async Task<TikTokCreatorInfo> QueryCreatorInfoAsync(string token, CancellationToken ct)
    {
        var d = Data(await PostJsonAsync($"{Api}/post/publish/creator_info/query/", new { }, ct, token));
        var options = d.TryGetProperty("privacy_level_options", out var o) ? o.EnumerateArray().Select(x => x.GetString()!).ToList() : [];
        return new TikTokCreatorInfo(Str(d, "creator_nickname") ?? Str(d, "creator_username") ?? "", options);
    }

    /// <summary>Starts a Direct Post that TikTok pulls from <paramref name="videoUrl"/> (domain must be verified in the app). Returns the publish ID.</summary>
    public async Task<string> InitVideoPublishAsync(string token, string caption, string privacyLevel, string videoUrl, CancellationToken ct)
    {
        var d = Data(await PostJsonAsync($"{Api}/post/publish/video/init/", new
        {
            post_info = new { title = caption, privacy_level = privacyLevel },
            source_info = new { source = "PULL_FROM_URL", video_url = videoUrl },
        }, ct, token));
        return Required(Str(d, "publish_id"), "publish_id");
    }

    /// <summary>Status is PROCESSING_DOWNLOAD, PROCESSING_UPLOAD, PUBLISH_COMPLETE or FAILED.</summary>
    public async Task<TikTokPublishStatus> FetchPublishStatusAsync(string token, string publishId, CancellationToken ct)
    {
        var d = Data(await PostJsonAsync($"{Api}/post/publish/status/fetch/", new { publish_id = publishId }, ct, token));
        // TikTok's field name really is misspelled ("publicaly").
        var postId = d.TryGetProperty("publicaly_available_post_id", out var ids) && ids.ValueKind == JsonValueKind.Array && ids.GetArrayLength() > 0
            ? ids[0].GetRawText()
            : null;
        return new TikTokPublishStatus(Str(d, "status") ?? "", Str(d, "fail_reason"), postId);
    }

    /// <summary>TikTok returns 200 with an error envelope; anything but "ok" is a failure.</summary>
    private static JsonElement Data(JsonElement json)
    {
        if (json.TryGetProperty("error", out var err) && Str(err, "code") is { } code && code != "ok")
            throw new OAuthProviderException(code, Str(err, "message") is { Length: > 0 } m ? $"TikTok: {m}" : $"TikTok rejected the request ({code}).");
        return json.GetProperty("data");
    }
}

public sealed record TikTokCreatorInfo(string Nickname, IReadOnlyList<string> PrivacyOptions);
public sealed record TikTokPublishStatus(string Status, string? FailReason, string? PostId);

/// <summary>X OAuth 2.0 Authorization Code with PKCE (confidential client), and posting as the user.</summary>
public sealed class XProvider(HttpClient http, IOptions<OAuthOptions> options, ILogger<XProvider> logger)
    : OAuthProviderBase(http, logger)
{
    public override string Platform => "x";
    public override string DisplayName => "X";
    public override ProviderOptions Options => options.Value.X;
    public override bool UsesPkce => true;

    public override string BuildAuthorizeUrl(string state, string redirectUri, string? codeChallenge) =>
        Url("https://x.com/i/oauth2/authorize", new Dictionary<string, string?>
        {
            ["response_type"] = "code",
            ["client_id"] = Options.ClientId,
            ["redirect_uri"] = redirectUri,
            ["scope"] = Options.Scopes,
            ["state"] = state,
            ["code_challenge"] = codeChallenge,
            ["code_challenge_method"] = "S256",
        });

    public override async Task<TokenResult> ExchangeCodeAsync(string code, string redirectUri, string? codeVerifier, CancellationToken ct)
    {
        var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{Uri.EscapeDataString(Options.ClientId)}:{Uri.EscapeDataString(Options.ClientSecret)}"));
        var json = await PostFormAsync("https://api.x.com/2/oauth2/token", new()
        {
            ["code"] = code,
            ["grant_type"] = "authorization_code",
            ["redirect_uri"] = redirectUri,
            ["code_verifier"] = codeVerifier!,
            ["client_id"] = Options.ClientId,
        }, ct, new AuthenticationHeaderValue("Basic", basic));
        return new TokenResult(Required(Str(json, "access_token"), "access_token"), ExpiresIn(json, TimeSpan.FromHours(2)));
    }

    public override async Task<ProviderProfile> GetProfileAsync(TokenResult token, CancellationToken ct)
    {
        var json = await GetJsonAsync("https://api.x.com/2/users/me", ct, token.AccessToken);
        var data = json.GetProperty("data");
        return new ProviderProfile(Required(Str(data, "id"), "id"), Required(Str(data, "username"), "username"));
    }

    /// <summary>Quote-posts Tisoro's post as the connected user (needs tweet.write). Returns the new post ID.</summary>
    public async Task<string> PostQuoteAsync(string accessToken, string text, string quoteTweetId, CancellationToken ct)
    {
        var json = await PostJsonAsync("https://api.x.com/2/tweets", new { text, quote_tweet_id = quoteTweetId }, ct, accessToken);
        return Required(Str(json.GetProperty("data"), "id"), "id");
    }
}
