using AppDock.SDK;
using System.Text.Json;
namespace AppDock.Extensions.ImageAiProbe;
public sealed class ImageAiProbe : IAppDockExtension
{
    public Task ActivateAsync(IExtensionContext context, CancellationToken cancellationToken)
    {
        context.Commands.Register(context.ExtensionId + ".generate", "Image API probe", async token => {
            object result;
            try {
                var list = await context.AppDock.CallAsync("ai.image.connections.list", new {}, token);
                var accepted = await context.AppDock.CallAsync("ai.image.generate", new {
                    requestId = Guid.NewGuid().ToString(), connectionId = "sdk"
                }, token);
                var id = accepted.GetProperty("jobId").GetString();
                JsonElement job;
                do {
                    await Task.Delay(30, token);
                    job = await context.AppDock.CallAsync("ai.image.jobs.get", new { jobId = id }, token);
                } while (job.GetProperty("state").GetString() is "queued" or "running");
                if (job.GetProperty("state").GetString() != "completed") throw new InvalidOperationException(job.ToString());
                var imageId = job.GetProperty("images")[0].GetProperty("id").GetString();
                var offset = 0;
                using var bytes = new MemoryStream();
                while (true) {
                    var part = await context.AppDock.CallAsync("ai.image.results.read", new { jobId = id, imageId, offset }, token);
                    bytes.Write(Convert.FromBase64String(part.GetProperty("data").GetString()!));
                    offset = part.GetProperty("nextOffset").GetInt32();
                    if (part.GetProperty("done").GetBoolean()) break;
                }
                result = new { ok = true, bytes = bytes.Length, connections = list.GetProperty("connections").GetArrayLength() };
            } catch (AppDockApiException error) { result = new { code = error.Code }; }
            await context.Log.InfoAsync("image-api-probe:" + JsonSerializer.Serialize(result), token);
        });
        return Task.CompletedTask;
    }
}
