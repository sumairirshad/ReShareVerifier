using System.Security.Cryptography;

namespace Tisoro.Share.Api;

/// <summary>
/// Identifies the browser making share requests. Stand-in until this API sits behind the host app's
/// real user/company auth — swap <see cref="Id"/> for the authenticated user ID then.
/// </summary>
public static class Session
{
    private const string CookieName = "tisoro_sid";

    public static string Id(this HttpContext http) => (string)http.Items[CookieName]!;

    public static IApplicationBuilder UseShareSession(this IApplicationBuilder app) =>
        app.Use(async (http, next) =>
        {
            if (!http.Request.Cookies.TryGetValue(CookieName, out var sid) || sid.Length != 43)
            {
                sid = Base64Url(RandomNumberGenerator.GetBytes(32));
                http.Response.Cookies.Append(CookieName, sid, new CookieOptions
                {
                    HttpOnly = true,
                    Secure = true,
                    // Lax so the cookie is sent on the provider's top-level redirect back to our callback.
                    SameSite = SameSiteMode.Lax,
                    MaxAge = TimeSpan.FromDays(30),
                });
            }
            http.Items[CookieName] = sid;
            await next();
        });

    public static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
