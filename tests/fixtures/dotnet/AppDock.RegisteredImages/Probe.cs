using System.Security.Cryptography;
using System.Text.Json;
using AppDock.SDK;

namespace AppDock.RegisteredImages;

public sealed class Probe : IAppDockExtension
{
    public async Task ActivateAsync(IExtensionContext context, CancellationToken token)
    {
        var source = context.Settings.Get("source", "");
        var marker = context.Settings.Get("marker", "");
        var bytes = await File.ReadAllBytesAsync(source, token);
        var image = await context.RegisteredImages.ImportAsync(bytes, "dotnet-original.png", token);
        await context.RegisteredImages.ImportAsync(bytes, "unselected.png", token);
        await context.Settings.SetAsync("image", image, token);
        var file = await context.RegisteredImages.CopyToCacheAsync(image, cancellationToken: token);
        var copied = await File.ReadAllBytesAsync(file, token);
        var rejected = false;
        try { await context.RegisteredImages.CopyToCacheAsync(new RegisteredImageRef("unselected.png"), cancellationToken: token); }
        catch { rejected = true; }
        await File.WriteAllTextAsync(marker, JsonSerializer.Serialize(new { file, sha256 = Convert.ToHexString(SHA256.HashData(copied)), rejected }), token);
    }
}
