using System.Threading.RateLimiting;
using Tisoro.Share.Api;
using Tisoro.Share.Api.OAuth;
using Tisoro.Share.Api.Shares;

var builder = WebApplication.CreateBuilder(args);
// Keys live in a git-ignored .env next to the project (see .env.example).
builder.Configuration.AddDotEnv(Path.Combine(builder.Environment.ContentRootPath, ".env"));

builder.Services.Configure<OAuthOptions>(builder.Configuration.GetSection("OAuth"));
builder.Services.AddMemoryCache();
builder.Services.AddDataProtection();
builder.Services.AddProblemDetails();
builder.Services.AddSignalR();

// Posting and checking cost API credits; cap them per browser session.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(ShareEndpoints.RateLimitPolicy, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Request.Cookies["tisoro_sid"] ?? http.Connection.RemoteIpAddress?.ToString() ?? "anon",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1) }));
});

builder.Services.AddSingleton<OAuthStateStore>();
builder.Services.AddSingleton<ConnectionStore>();
builder.Services.AddSingleton<SubmissionStore>();
builder.Services.AddSingleton<ShareNotifier>();

builder.Services.AddHttpClient<LinkedInProvider>();
builder.Services.AddHttpClient<FacebookProvider>();
builder.Services.AddHttpClient<TikTokProvider>();
builder.Services.AddHttpClient<XProvider>();
builder.Services.AddHttpClient<XRepostLookup>();
builder.Services.AddHttpClient<InstagramMentions>();
builder.Services.AddTransient<IOAuthProvider>(sp => sp.GetRequiredService<LinkedInProvider>());
builder.Services.AddTransient<IOAuthProvider>(sp => sp.GetRequiredService<FacebookProvider>());
builder.Services.AddTransient<IOAuthProvider>(sp => sp.GetRequiredService<TikTokProvider>());
builder.Services.AddTransient<IOAuthProvider>(sp => sp.GetRequiredService<XProvider>());

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseShareSession();
app.UseRateLimiter();

app.MapOAuthEndpoints();
app.MapShareEndpoints();
InstagramMentions.MapInstagramWebhook(app);

var cfg = app.Configuration;
app.Logger.LogInformation("Sign-in configured for: {Platforms}",
    string.Join(", ", app.Services.GetServices<IOAuthProvider>().Where(p => p.Options.IsConfigured).Select(p => p.DisplayName)) is { Length: > 0 } list
        ? list
        : "none — add keys to .env");
app.Logger.LogInformation("X repost check: {X} · Instagram mention webhook: {Ig} · Admin view: {Admin}",
    string.IsNullOrEmpty(cfg["X:BearerToken"]) ? "off" : "on",
    string.IsNullOrEmpty(cfg["Instagram:AppSecret"]) || string.IsNullOrEmpty(cfg["Instagram:TisoroAccessToken"]) ? "off" : "on",
    string.IsNullOrEmpty(cfg["Admin:Key"]) ? "off" : "on");

app.Run();
