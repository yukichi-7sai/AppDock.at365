using System.Text.Json;
using AppDock.SDK;
namespace AppDock.Tests;
public sealed class PageProbe : IAppDockExtension, IPageActionHandler
{
    private IExtensionContext? context;
    public Task ActivateAsync(IExtensionContext services, CancellationToken token)
    {
        context = services;
        services.Commands.Register(services.ExtensionId + ".open", "ページ検証を開く", ct => services.Pages.OpenAsync("main", ct));
        services.Commands.Register(services.ExtensionId + ".details", "説明へ戻る", ct => services.Ui.OpenDetailsAsync(ct));
        return Task.CompletedTask;
    }
    public async Task<JsonElement?> HandlePageActionAsync(string actionId, JsonElement input, string pageId, CancellationToken token)
    {
        if (pageId != "main") throw new ArgumentException("Unknown page");
        switch (actionId) {
            case "echo": return input.Clone();
            case "null": return null;
            case "fail": throw new InvalidOperationException("Expected page failure");
            case "large": return JsonSerializer.SerializeToElement(new string('x', 600000));
            case "wait": await context!.Log.InfoAsync("PAGE_WAIT_STARTED", token); await Task.Delay(30000, token); return null;
            case "pages":
                var before = await context!.Pages.ListAsync(token);
                var result = await context.Pages.ReplaceAsync([new RuntimePageDefinition("dynamic", "Dynamic", "index.html") { Context = JsonSerializer.SerializeToElement(new { document = "one" }) }], before.Revision, token);
                await context.Pages.HideAsync("dynamic", token);
                await context.Pages.DisposeAsync("dynamic", token);
                return JsonSerializer.SerializeToElement(new { revision = result.Revision });
            case "images":
                var root = await context!.Ui.GetImageDirectoryAsync(token);
                var file = Path.Combine(root, "page-probe.png");
                await File.WriteAllBytesAsync(file, Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="), token);
                var images = await context.Pages.RegisterImagesAsync("main", [new PageImageFile("probe", file)], token);
                await context.Pages.NotifyChangedAsync("main", token);
                return JsonSerializer.SerializeToElement(images, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            case "release":
                await context!.Pages.ReleaseImagesAsync("main", [input.GetProperty("imageId").GetString()!], token);
                return null;
            default: throw new ArgumentException("Unknown action");
        }
    }
}
