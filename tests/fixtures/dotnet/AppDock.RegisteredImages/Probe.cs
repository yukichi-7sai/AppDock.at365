using System.Security.Cryptography;
using System.Text.Json;
using AppDock.SDK;

namespace AppDock.RegisteredImages;

public sealed class Probe : IAppDockExtension
{
    public async Task ActivateAsync(IExtensionContext context, CancellationToken token)
    {
        var marker = context.Settings.Get("marker", "");
        var importAvailable = typeof(IRegisteredImageService).GetMethod("ImportAsync") is not null;
        if (importAvailable) throw new InvalidOperationException("Image import must not be exposed.");
        var image = context.Settings.Get<RegisteredImageRef?>("image", null)
            ?? throw new InvalidOperationException("Missing assigned image.");
        await context.Settings.SetAsync("image", image, token);
        var file = await context.RegisteredImages.CopyToCacheAsync(image, cancellationToken: token);
        var copied = await File.ReadAllBytesAsync(file, token);
        var rejected = false;
        try { await context.RegisteredImages.CopyToCacheAsync(new RegisteredImageRef("unselected.png"), cancellationToken: token); }
        catch { rejected = true; }
        await File.WriteAllTextAsync(marker, JsonSerializer.Serialize(new { file, sha256 = Convert.ToHexString(SHA256.HashData(copied)), rejected, importAvailable }), token);
    }
}
