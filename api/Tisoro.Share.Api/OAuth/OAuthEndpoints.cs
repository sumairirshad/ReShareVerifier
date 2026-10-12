using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;
using Tisoro.Share.Api.Shares;

namespace Tisoro.Share.Api.OAuth;

public static class OAuthEndpoints
{
    public static void MapOAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/oauth/{platform}");

        // Returns the provider URL for the SPA to open in its popup. `state` is bound to this session.
        group.MapGet("/start", (string platform, string ceremonyId, HttpContext http,
            IEnumerable<IOAuthProvider> providers, OAuthStateStore states, IOptions<OAuthOptions> options) =>
        {
            var provider = providers.FirstOrDefault(p => p.Platform == platform);
            if (provider is null) return Results.NotFound();
            if (!provider.Options.IsConfigured)
                return Results.Problem(statusCode: 503, title: "Not configured",
                    detail: $"{provider.DisplayName} sign-in isn't set up yet — its client ID and secret are missing on the server.");

            string? verifier = null, challenge = null;
            if (provider.UsesPkce)
            {
                verifier = Session.Base64Url(RandomNumberGenerator.GetBytes(32));
                challenge = Session.Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
            }
            var state = states.Create(http.Id(), platform, ceremonyId, verifier);
            var authorizeUrl = provider.BuildAuthorizeUrl(state, options.Value.RedirectUri(platform), challenge);
            return Results.Ok(new { authorizeUrl });
        });

        // Provider redirects here. Exchange the code, read the profile, store the token, bounce to the SPA.
        group.MapGet("/callback", async (string platform, string? code, string? state, string? error,
            string? error_description, HttpContext http, IEnumerable<IOAuthProvider> providers, OAuthStateStore states,
            ConnectionStore connections, IOptions<OAuthOptions> options, ILoggerFactory loggers, CancellationToken ct) =>
        {
            var log = loggers.CreateLogger("OAuth");
            IResult ToSpa(Dictionary<string, string?> query) =>
                Results.Redirect(QueryHelpers.AddQueryString(options.Value.SpaCallbackUrl, query.Where(kv => kv.Value is not null)!));
            IResult Fail(string err, string description) =>
                ToSpa(new() { ["platform"] = platform, ["status"] = "error", ["error"] = err, ["error_description"] = description });

            var pending = state is null ? null : states.Consume(state);
            if (pending is null || pending.Platform != platform || pending.SessionId != http.Id())
                return Fail("invalid_state", "Sign-in expired or was started in another browser. Please try again.");

            if (!string.IsNullOrEmpty(error) || string.IsNullOrEmpty(code))
                return Fail(error ?? "access_denied", error_description ?? "Sign-in was cancelled.");

            var provider = providers.First(p => p.Platform == platform);
            try
            {
                var redirectUri = options.Value.RedirectUri(platform);
                var token = await provider.ExchangeCodeAsync(code, redirectUri, pending.CodeVerifier, ct);
                var profile = await provider.GetProfileAsync(token, ct);

                if (profile.IsPersonalInstagram)
                    return Fail("personal_account", "Instagram only allows posting from Business or Creator accounts.");

                connections.Save(http.Id(), platform, token, profile);
                log.LogInformation("{Platform} connected for session as {Handle}", platform, profile.Handle);
                return ToSpa(new() { ["platform"] = platform, ["status"] = "success", ["handle"] = profile.Handle });
            }
            catch (OAuthProviderException ex)
            {
                return Fail(ex.Error, ex.Message);
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or KeyNotFoundException or InvalidOperationException)
            {
                log.LogError(ex, "{Platform} OAuth callback failed", platform);
                return Fail("provider_error", $"Couldn't finish signing in to {provider.DisplayName}. Please try again.");
            }
        });
    }
}
