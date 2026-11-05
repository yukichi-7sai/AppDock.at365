using AppDock.SDK;
using System.Text.Json;
namespace AppDock.Extensions.TtsProbe;
public sealed class TtsProbe : IAppDockExtension
{
    public Task ActivateAsync(IExtensionContext context, CancellationToken cancellationToken)
    {
        context.Commands.Register(context.ExtensionId + ".speak", "TTS probe", async token => {
            object result;
            try {
                await context.AppDock.CallAsync("tts.connections.list", cancellationToken: token);
                var accepted = await context.AppDock.CallAsync("tts.speak", new { text = "SDK音声テスト。", connectionId = "default", instructions = ".NETのニュアンス", requestId = Guid.NewGuid().ToString() }, token);
                var id = accepted.GetProperty("jobId").GetString();
                var job = await context.AppDock.CallAsync("tts.jobs.get", new { jobId = id }, token);
                result = new { ok = true, jobId = id, state = job.GetProperty("state").GetString() };
            } catch (AppDockApiException error) { result = new { code = error.Code }; }
            await context.Log.InfoAsync("tts-probe:" + JsonSerializer.Serialize(result), token);
        });
        return Task.CompletedTask;
    }
}
