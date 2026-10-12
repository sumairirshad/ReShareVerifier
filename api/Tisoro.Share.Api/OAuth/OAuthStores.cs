using System.Collections.Concurrent;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Caching.Memory;

namespace Tisoro.Share.Api.OAuth;

/// <summary>Pending authorization requests, keyed by the random `state` sent to the provider.</summary>
public sealed class OAuthStateStore(IMemoryCache cache)
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);

    public string Create(string sessionId, string platform, string ceremonyId, string? codeVerifier)
    {
        var state = Session.Base64Url(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
        cache.Set(Key(state), new PendingAuth(sessionId, platform, ceremonyId, codeVerifier), Lifetime);
        return state;
    }

    /// <summary>One-time use: removed on read so a state can't be replayed.</summary>
    public PendingAuth? Consume(string state)
    {
        if (!cache.TryGetValue(Key(state), out PendingAuth? pending)) return null;
        cache.Remove(Key(state));
        return pending;
    }

    private static string Key(string state) => $"oauth-state:{state}";
}

public sealed record PendingAuth(string SessionId, string Platform, string CeremonyId, string? CodeVerifier);

/// <summary>
/// Connected accounts, access tokens encrypted at rest with Data Protection.
/// In-memory for now; becomes the OAuthToken table (spec §6) when SQL Server is wired in.
/// </summary>
public sealed class ConnectionStore(IDataProtectionProvider dataProtection)
{
    private readonly IDataProtector protector = dataProtection.CreateProtector("Tisoro.Share.OAuthToken");
    private readonly ConcurrentDictionary<(string Session, string Platform), Connection> connections = new();

    public void Save(string sessionId, string platform, TokenResult token, ProviderProfile profile) =>
        connections[(sessionId, platform)] = new Connection(
            protector.Protect(token.AccessToken), token.ExpiresAt, profile.PlatformUserId, profile.Handle);

    public Connection? Get(string sessionId, string platform) =>
        connections.TryGetValue((sessionId, platform), out var c) && c.ExpiresAt > DateTimeOffset.UtcNow ? c : null;

    public string? GetAccessToken(string sessionId, string platform) =>
        Get(sessionId, platform) is { } c ? protector.Unprotect(c.EncryptedAccessToken) : null;

    public void Remove(string sessionId, string platform) => connections.TryRemove((sessionId, platform), out _);
}

public sealed record Connection(string EncryptedAccessToken, DateTimeOffset ExpiresAt, string PlatformUserId, string Handle);
