using AppDock.SDK;
using System.Text.Json;
namespace AppDock.Extensions.AiProbe;
public sealed class AiProbe : IAppDockExtension
{
    public Task ActivateAsync(IExtensionContext context, CancellationToken cancellationToken)
    {
        context.Commands.Register(context.ExtensionId + ".generate", "AI probe", async token => {
            object result;
            try {
                await context.AppDock.CallAsync("ai.models.list", new { connectionId = "sdk" }, token);
                var accepted = await context.AppDock.CallAsync("ai.text.generate", new {
                    requestId = Guid.NewGuid().ToString(), connectionId = "sdk",
                    additionalPrompt = "用途別の架空指示", input = "架空の入力"
                }, token);
                var id = accepted.GetProperty("jobId").GetString();
                JsonElement job;
                do {
                    await Task.Delay(50, token);
                    job = await context.AppDock.CallAsync("ai.jobs.get", new { jobId = id }, token);
                } while (job.GetProperty("state").GetString() is "queued" or "running");
                result = new { ok = job.GetProperty("state").GetString() == "completed", jobId = id, state = job.GetProperty("state").GetString() };
            } catch (AppDockApiException error) { result = new { code = error.Code }; }
            await context.Log.InfoAsync("ai-probe:" + JsonSerializer.Serialize(result), token);
        });
        return Task.CompletedTask;
    }
}
