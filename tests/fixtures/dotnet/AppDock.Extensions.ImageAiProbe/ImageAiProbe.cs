using AppDock.SDK;
using System.Text.Json;
namespace AppDock.Extensions.ImageAiProbe;
public sealed class ImageAiProbe : IAppDockExtension
{
    public Task ActivateAsync(IExtensionContext context, CancellationToken cancellationToken)
    {
        context.Commands.Register(context.ExtensionId + ".probe", "Image API probe", async token => {
            var rejected = new List<object>();
            foreach (var method in new[] {
                "ai.image.generate", "ai.image.results.read"
            }) {
                var code = "ALLOWED";
                try { await context.AppDock.CallAsync(method, new {}, token); }
                catch (AppDockApiException error) { code = error.Code; }
                rejected.Add(new { method, code });
            }
            var list = await context.AppDock.CallAsync("ai.image.connections.list", new {}, token);
            var jobs = new List<object>();
            foreach (var method in new[] { "ai.image.jobs.get", "ai.image.jobs.cancel" }) {
                var code = "ALLOWED";
                try { await context.AppDock.CallAsync(method, new { jobId = "missing" }, token); }
                catch (AppDockApiException error) { code = error.Code; }
                jobs.Add(new { method, code });
            }
            await context.Log.InfoAsync("image-api-probe:" + JsonSerializer.Serialize(new {
                rejected, connections = list.GetProperty("connections").GetArrayLength(), jobs
            }), token);
        });
        return Task.CompletedTask;
    }
}
