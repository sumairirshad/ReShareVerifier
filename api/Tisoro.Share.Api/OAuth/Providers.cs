using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
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
    /// Reshares Tisoro's post with the user's commentary via the Posts API (spec §4.2).
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
            logger.LogWarning("LinkedIn publish failed: {Status} {Body}", (int)res.StatusCode, body);
            throw new OAuthProviderException("provider_error", $"LinkedIn rejected the post ({(int)res.StatusCode}).");
        }
        return res.Headers.TryGetValues("x-restli-id", out var ids) && ids.FirstOrDefault() is { Length: > 0 } id
            ? id
            : throw new OAuthProviderException("provider_error", "LinkedIn did not return a post ID.");
    }
}

/// <summary>Facebook Login with user_posts (read-only; used to verify the user's own share).</summary>
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

    /// <summary>Required when "Require App Secret" is on in the Meta app; harmless otherwise.</summary>
    public string AppSecretProof(string accessToken) =>
        Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(Options.ClientSecret), Encoding.UTF8.GetBytes(accessToken)));
}

/// <summary>Instagram API with Instagram Login (Business/Creator accounts only).</summary>
public sealed class InstagramProvider(HttpClient http, IOptions<OAuthOptions> options, ILogger<InstagramProvider> logger)
    : OAuthProviderBase(http, logger)
{
    public override string Platform => "instagram";
    public override string DisplayName => "Instagram";
    public override ProviderOptions Options => options.Value.Instagram;

    public override string BuildAuthorizeUrl(string state, string redirectUri, string? codeChallenge) =>
        Url("https://www.instagram.com/oauth/authorize", new Dictionary<string, string?>
        {
            ["client_id"] = Options.ClientId,
            ["redirect_uri"] = redirectUri,
            ["response_type"] = "code",
            ["scope"] = Options.Scopes,
            ["state"] = state,
        });

    public override async Task<TokenResult> ExchangeCodeAsync(string code, string redirectUri, string? codeVerifier, CancellationToken ct)
    {
        var json = await PostFormAsync("https://api.instagram.com/oauth/access_token", new()
        {
            ["client_id"] = Options.ClientId,
            ["client_secret"] = Options.ClientSecret,
            ["grant_type"] = "authorization_code",
            ["redirect_uri"] = redirectUri,
            ["code"] = code,
        }, ct);
        // Response is either flat or wrapped in data[0] depending on API version.
        var body = json.TryGetProperty("data", out var data) && data.ValueKind == System.Text.Json.JsonValueKind.Array && data.GetArrayLength() > 0
            ? data[0]
            : json;
        return new TokenResult(Required(Str(body, "access_token"), "access_token"), DateTimeOffset.UtcNow.AddHours(1), Str(body, "user_id"));
    }

    public override async Task<ProviderProfile> GetProfileAsync(TokenResult token, CancellationToken ct)
    {
        var me = await GetJsonAsync(Url("https://graph.instagram.com/v23.0/me", new Dictionary<string, string?>
        {
            ["fields"] = "user_id,username,account_type",
            ["access_token"] = token.AccessToken,
        }), ct);
        var accountType = Str(me, "account_type");
        return new ProviderProfile(
            Str(me, "user_id") ?? Required(token.PlatformUserId, "user_id"),
            Required(Str(me, "username"), "username"),
            IsPersonalInstagram: string.Equals(accountType, "PERSONAL", StringComparison.OrdinalIgnoreCase));
    }
}

/// <summary>TikTok Login Kit (v2) + Content Posting API.</summary>
public sealed class TikTokProvider(HttpClient http, IOptions<OAuthOptions> options, ILogger<TikTokProvider> logger)
    : OAuthProviderBase(http, logger)
{
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
        var json = await PostFormAsync("https://open.tiktokapis.com/v2/oauth/token/", new()
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
        var json = await GetJsonAsync($"https://open.tiktokapis.com/v2/user/info/?fields={fields}", ct, token.AccessToken);
        var user = json.GetProperty("data").GetProperty("user");
        return new ProviderProfile(Required(Str(user, "open_id"), "open_id"), Str(user, "username") ?? Str(user, "display_name") ?? "TikTok user");
    }
}

/// <summary>X OAuth 2.0 Authorization Code with PKCE (confidential client).</summary>
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
}
