using System.Threading.Channels;
using System.Windows.Threading;

namespace AppDock.InputHost;

internal sealed class InputCaptureThread : IDisposable
{
    private readonly Thread thread;
    private readonly GestureIndicatorNotifications display;
    private readonly Channel<(string Method, object Payload)> notices =
        Channel.CreateUnbounded<(string, object)>(new UnboundedChannelOptions { SingleReader = true, AllowSynchronousContinuations = false });
    // Recognition notices retain every accepted press; only display state may be replaced.
    private readonly Channel<object> indicatorNotices = Channel.CreateBounded<object>(
        new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });
    private readonly TaskCompletionSource<(Dispatcher Dispatcher, InputCaptureEngine Engine)> ready =
        new(TaskCreationOptions.RunContinuationsAsynchronously);
    private bool disposed;
    private readonly System.Collections.Concurrent.ConcurrentDictionary<long, (ShortcutPressNotice Press, long At)> presses = new();
    internal InputCaptureThread()
    {
        display = new GestureIndicatorNotifications(payload => indicatorNotices.Writer.TryWrite(payload));
        thread = new Thread(() => {
            var dispatcher = Dispatcher.CurrentDispatcher;
            using var engine = new InputCaptureEngine(dispatcher, display,
                (method, payload) => !disposed && notices.Writer.TryWrite((method, payload)));
            ready.SetResult((dispatcher, engine));
            Dispatcher.Run();
        }) { IsBackground = true, Name = "AppDock input capture" };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
    }
    internal async Task PumpAsync(Func<string, object, Task> send, CancellationToken token)
    {
        async Task Indicators()
        {
            await foreach (var payload in indicatorNotices.Reader.ReadAllAsync(token))
                await send("gestures.indicator", payload);
        }
        async Task Inputs()
        {
          await foreach (var notice in notices.Reader.ReadAllAsync(token)) {
            if (notice.Payload is ShortcutPressNotice press) {
                var now = Environment.TickCount64;
                foreach (var entry in presses) if (now - entry.Value.At > 1500) presses.TryRemove(entry.Key, out _);
                if (presses.Count >= 64) presses.Clear();
                presses[press.PressId] = (press, press.CapturedAt);
            }
            await send(notice.Method, notice.Payload);
          }
        }
        await Task.WhenAll(Inputs(), Indicators());
    }
    internal Task<bool> ActivateAsync(long pressId, string window) => Task.Run(() => {
        if (disposed || !presses.TryRemove(pressId, out var entry) || Environment.TickCount64 - entry.At > 1500 ||
            !long.TryParse(window, out var target) || !long.TryParse(entry.Press.Window, out var source)) return false;
        return ForegroundPermission.Activate(new nint(target), new nint(source), entry.Press.HostProcessId);
    });
    internal async Task<bool> PrepareGestureActivationAsync(string session, string source, string window)
    {
        if (disposed || !long.TryParse(window,out var destination)) return false;
        var state = await ready.Task;
        return await state.Dispatcher.InvokeAsync(() => state.Engine.Gestures.ClaimActivation(session,source,new nint(destination)) != null);
    }
    internal async Task<bool> ActivateGestureAsync(string session, string source, string window)
    {
        if (disposed || !long.TryParse(window,out var destination)) return false;
        var state = await ready.Task;
        var permission = await state.Dispatcher.InvokeAsync(() => state.Engine.Gestures.ConsumeActivation(session,source,new nint(destination)));
        return permission is { } grant && await Task.Run(() =>
            ForegroundPermission.Activate(new nint(destination),grant.Source,grant.Process));
    }
    internal async Task<ShortcutStatus[]> ConfigureAsync(CaptureConfiguration configuration)
    {
        var state = await ready.Task;
        return await state.Dispatcher.InvokeAsync(() => state.Engine.Configure(configuration));
    }
    internal async Task ConfigureGesturesAsync(Configuration configuration)
    {
        var state = await ready.Task;
        await state.Dispatcher.InvokeAsync(() => state.Engine.Gestures.Configure(configuration));
    }
    internal async Task<bool> ValidAsync(string session, string window)
    {
        var state = await ready.Task;
        return await state.Dispatcher.InvokeAsync(() => state.Engine.Gestures.Valid(session, window));
    }
    internal async Task BindAsync(Func<object, Task<System.Text.Json.JsonElement>> invoke, Action<string> cancel,
        Func<object, Task<System.Text.Json.JsonElement>> prepare)
    {
        var state = await ready.Task;
        await state.Dispatcher.InvokeAsync(() => { state.Engine.Gestures.Invoke = invoke; state.Engine.Gestures.Cancel = cancel; state.Engine.Gestures.Prepare = prepare; });
    }
    public void Dispose()
    {
        if (disposed) return;
        disposed = true; notices.Writer.TryComplete(); indicatorNotices.Writer.TryComplete();
        if (ready.Task.IsCompletedSuccessfully) {
            var state = ready.Task.Result;
            if (!state.Dispatcher.HasShutdownStarted) state.Dispatcher.Invoke(() => {
                state.Engine.Dispose(); state.Dispatcher.BeginInvokeShutdown(DispatcherPriority.Send);
            });
        }
        if (Thread.CurrentThread != thread) thread.Join(2000);
    }
}
