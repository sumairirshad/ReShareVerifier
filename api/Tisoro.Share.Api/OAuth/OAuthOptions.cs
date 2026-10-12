namespace Tisoro.Share.Api.OAuth;

public sealed class OAuthOptions
{
    /// <summary>
    /// Origin the browser sees (the SPA, which proxies /api). Redirect URIs registered with each
    /// provider are {PublicBaseUrl}/api/oauth/{platform}/callback.
    /// </summary>
    public string PublicBaseUrl { get; set; } = "https://127.0.0.1:4200";

    public ProviderOptions LinkedIn { get; set; } = new();
    public ProviderOptions Facebook { get; set; } = new();
    public ProviderOptions Instagram { get; set; } = new();
    /// <summary>TikTok calls the client ID a "client key".</summary>
    public ProviderOptions TikTok { get; set; } = new();
    public ProviderOptions X { get; set; } = new();

    public string RedirectUri(string platform) => $"{PublicBaseUrl.TrimEnd('/')}/api/oauth/{platform}/callback";
    public string SpaCallbackUrl => $"{PublicBaseUrl.TrimEnd('/')}/oauth/callback";
}

public sealed class ProviderOptions
{
    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    public string Scopes { get; set; } = "";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret);
}
