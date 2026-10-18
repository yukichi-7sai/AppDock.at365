using System.Text.Json;
using AppDock.SDK;
using AppDock.Runtime;

namespace AppDock.CustomCommands;

public sealed class Probe : IAppDockExtension
{
    public async Task ActivateAsync(IExtensionContext context, CancellationToken token)
    {
        await context.CustomCommands.RegisterAsync(context.ExtensionId + ".echo", async (config, ct) =>
        {
            if (config.TryGetProperty("delay", out var delay)) await Task.Delay(delay.GetInt32(), ct);
            var info = await context.AppDock.CallAsync("system.getInfo", new { }, ct);
            return JsonSerializer.SerializeToElement(new { message = config.GetProperty("message").GetString(), source = CommandExecution.Current?.Source, apiVersion = info.GetProperty("apiVersion").GetInt32() });
        }, token);
    }
}
public static class Program
{
    public static async Task Main()
    {
        var output = Console.Out;
        Console.SetOut(Console.Error);
        await AppletSession.RunAsync(new Probe(), Console.In, output);
    }
}
