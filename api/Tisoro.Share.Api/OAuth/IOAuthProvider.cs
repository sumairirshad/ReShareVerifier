namespace Tisoro.Share.Api.OAuth;

public interface IOAuthProvider
{
    /// <summary>Route segment and SPA platform key: linkedin, facebook, instagram, tiktok, x.</summary>
    string Platform { get; }
    string DisplayName { get; }
    ProviderOptions Options { get; }
    bool UsesPkce { get; }

    string BuildAuthorizeUrl(string state, string redirectUri, string? codeChallenge);
    Task<TokenResult> ExchangeCodeAsync(string code, string redirectUri, string? codeVerifier, CancellationToken ct);
    Task<ProviderProfile> GetProfileAsync(TokenResult token, CancellationToken ct);
}

public sealed record TokenResult(string AccessToken, DateTimeOffset ExpiresAt, string? PlatformUserId = null);

/// <param name="Handle">What the SPA shows in the handle field (username, or display name where the platform has none).</param>
/// <param name="IsPersonalInstagram">Instagram personal accounts can't be published to via the API.</param>
public sealed record ProviderProfile(string PlatformUserId, string Handle, bool IsPersonalInstagram = false);

public sealed class OAuthProviderException(string error, string message) : Exception(message)
{
    public string Error { get; } = error;
}
