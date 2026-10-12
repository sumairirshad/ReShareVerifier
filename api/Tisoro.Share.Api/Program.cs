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

builder.Services.AddSingleton<OAuthStateStore>();
builder.Services.AddSingleton<ConnectionStore>();
builder.Services.AddSingleton<SubmissionStore>();

builder.Services.AddHttpClient<LinkedInProvider>();
builder.Services.AddHttpClient<FacebookProvider>();
builder.Services.AddHttpClient<InstagramProvider>();
builder.Services.AddHttpClient<TikTokProvider>();
builder.Services.AddHttpClient<XProvider>();
builder.Services.AddTransient<IOAuthProvider>(sp => sp.GetRequiredService<LinkedInProvider>());
builder.Services.AddTransient<IOAuthProvider>(sp => sp.GetRequiredService<FacebookProvider>());
builder.Services.AddTransient<IOAuthProvider>(sp => sp.GetRequiredService<InstagramProvider>());
builder.Services.AddTransient<IOAuthProvider>(sp => sp.GetRequiredService<TikTokProvider>());
builder.Services.AddTransient<IOAuthProvider>(sp => sp.GetRequiredService<XProvider>());

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseShareSession();

app.MapOAuthEndpoints();
app.MapShareEndpoints();

app.Logger.LogInformation("OAuth configured for: {Platforms}",
    string.Join(", ", app.Services.GetServices<IOAuthProvider>().Where(p => p.Options.IsConfigured).Select(p => p.DisplayName)) is { Length: > 0 } list
        ? list
        : "none — add client IDs/secrets with `dotnet user-secrets`");

app.Run();
