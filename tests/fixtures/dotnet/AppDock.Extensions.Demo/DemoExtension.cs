using AppDock.SDK;
namespace AppDock.Extensions.Demo;

public sealed class DemoExtension : IAppDockExtension
{
    private IDisposable? schedule;
    private IExtensionContext? context;
    private int refreshCount;
    public async Task ActivateAsync(IExtensionContext context, CancellationToken cancellationToken)
    {
        this.context = context;
        context.Commands.Register("appdock.dotnet-demo.refresh", ".NET拡張の状態を更新", RefreshAsync);
        context.Commands.Register("appdock.dotnet-demo.notify", ".NETからテスト通知", token => context.Notifications.ShowAsync("AppDock · .NET", "C#拡張からホストの通知APIを呼び出しました。", token));
        context.Commands.Register("appdock.dotnet-demo.verify-storage", ".NETの保存APIを確認", async token =>
        {
            await context.Storage.SetAsync("check", "dotnet-ok", token);
            var value = await context.Storage.GetAsync<string>("check", token);
            await context.Storage.SetAsync("check", "dotnet-shared", StorageScope.Shared, token);
            var shared = await context.Storage.GetAsync<string>("check", StorageScope.Shared, token);
            var device = await context.Storage.GetAsync<string>("check", StorageScope.Device, token);
            // Keep calls with a default cancellation token source-compatible.
            var compatible = await context.Storage.GetAsync<string>("check", default);
            await context.Secrets.SetAsync("check", "dotnet-test-secret", token);
            var secret = await context.Secrets.GetAsync("check", token);
            await context.Secrets.DeleteAsync("check", token);
            if (value != "dotnet-ok" || device != value || compatible != value || shared != "dotnet-shared" || secret != "dotnet-test-secret") throw new InvalidOperationException("Storage / Secrets round trip failed.");
            await context.Log.InfoAsync(".NET Storage / Secrets API の往復を確認しました。", token);
        });
        context.Tray.Add("状態を更新", "appdock.dotnet-demo.refresh");
        schedule = context.Scheduler.Every(TimeSpan.FromSeconds(1), TickAsync);
        await RefreshAsync(cancellationToken);
        await context.Log.InfoAsync(".NET拡張がホストに接続しました。", cancellationToken);
    }
    private DateTimeOffset nextRefresh = DateTimeOffset.UtcNow;
    private async Task TickAsync(CancellationToken token)
    {
        if (DateTimeOffset.UtcNow < nextRefresh) return;
        nextRefresh = DateTimeOffset.UtcNow.AddSeconds(Math.Clamp(context!.Settings.Get("intervalSeconds", 30), 5, 3600));
        await RefreshAsync(token);
    }
    private Task RefreshAsync(CancellationToken token) => context!.Ui.ShowPanelAsync(new Panel(
        "C# is docked.", "既存の.NETロジックを載せるための、最初の接続。",
        [new("Runtime", System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription),
         new("Process", Environment.ProcessId.ToString()),
         new("Refresh", Interlocked.Increment(ref refreshCount).ToString()),
         new("Last updated", DateTime.Now.ToString("HH:mm:ss"))],
        [new("状態を更新", "appdock.dotnet-demo.refresh"), new("通知を試す", "appdock.dotnet-demo.notify")]), token);
    public Task DeactivateAsync(CancellationToken cancellationToken) { schedule?.Dispose(); return Task.CompletedTask; }
}
