namespace Tisoro.Share.Api;

/// <summary>
/// Loads a local <c>.env</c> file (KEY=VALUE per line) into configuration. Friendly names like
/// LINKEDIN_CLIENT_ID map to OAuth:LinkedIn:ClientId; any other key is passed through, with "__" as ":".
/// </summary>
public static class DotEnv
{
    private static readonly Dictionary<string, string> Aliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["OAUTH_PUBLIC_BASE_URL"] = "OAuth:PublicBaseUrl",
        ["LINKEDIN_CLIENT_ID"] = "OAuth:LinkedIn:ClientId",
        ["LINKEDIN_CLIENT_SECRET"] = "OAuth:LinkedIn:ClientSecret",
        ["FACEBOOK_APP_ID"] = "OAuth:Facebook:ClientId",
        ["FACEBOOK_APP_SECRET"] = "OAuth:Facebook:ClientSecret",
        ["INSTAGRAM_APP_ID"] = "OAuth:Instagram:ClientId",
        ["INSTAGRAM_APP_SECRET"] = "OAuth:Instagram:ClientSecret",
        ["TIKTOK_CLIENT_KEY"] = "OAuth:TikTok:ClientId",
        ["TIKTOK_CLIENT_SECRET"] = "OAuth:TikTok:ClientSecret",
        ["X_CLIENT_ID"] = "OAuth:X:ClientId",
        ["X_CLIENT_SECRET"] = "OAuth:X:ClientSecret",
    };

    public static IConfigurationBuilder AddDotEnv(this IConfigurationBuilder config, string path)
    {
        if (!File.Exists(path)) return config;

        var values = new Dictionary<string, string?>();
        foreach (var raw in File.ReadAllLines(path))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            var eq = line.IndexOf('=');
            if (eq <= 0) continue;

            var key = line[..eq].Trim();
            var value = line[(eq + 1)..].Trim();
            if (value.Length >= 2 && (value[0] == '"' || value[0] == '\'') && value[^1] == value[0]) value = value[1..^1];
            if (value.Length == 0) continue; // blank = not set, keep appsettings default

            values[Aliases.GetValueOrDefault(key) ?? key.Replace("__", ":")] = value;
        }
        return config.AddInMemoryCollection(values);
    }
}
