using System.Threading.Channels;
using System.Windows.Threading;

namespace AppDock.InputHost;

internal sealed class InputCaptureThread : IDisposable
{
    private readonly Thread thread;
    private readonly GestureDisplay display;
    private readonly Channel<(string Method, object Payload)> notices =
        Channel.CreateBounded<(string, object)>(new BoundedChannelOptions(64) { FullMode = BoundedChannelFullMode.Wait, SingleReader = true });
    private readonly TaskCompletionSource<(Dispatcher Dispatcher, InputCaptureEngine Engine)> ready =
        new(TaskCreationOptions.RunContinuationsAsynchronously);
    private bool disposed;
    private readonly System.Collections.Concurrent.ConcurrentDictionary<long, (ShortcutPressNotice Press, long At)> presses = new();
    internal InputCaptureThread(Dispatcher displayDispatcher)
    {
        display = new GestureDisplay(displayDispatcher);
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
    internal Task<bool> ActivateAsync(long pressId, string window) => Task.Run(() => {
        if (disposed || !presses.TryRemove(pressId, out var entry) || Environment.TickCount64 - entry.At > 1500 ||
            !long.TryParse(window, out var target) || !long.TryParse(entry.Press.Window, out var source)) return false;
        return ForegroundPermission.Activate(new nint(target), new nint(source), entry.Press.HostProcessId);
    });
    internal Task<bool> ActivateProcessAsync(long pressId, uint process) => Task.Run(async () => {
        if (disposed || process == 0 || process == uint.MaxValue || !presses.TryRemove(pressId, out var entry) ||
            !long.TryParse(entry.Press.Window, out var source)) return false;
        var descendants = new HashSet<uint> { process };
        while (!disposed && Environment.TickCount64 - entry.At <= 1500) {
            ForegroundPermission.AddDescendants(descendants);
            var window = ForegroundPermission.ProcessWindow(descendants, out var owner);
            if (window != 0) return ForegroundPermission.Activate(window, new nint(source), owner);
            await Task.Delay(20);
        }
        return false;
    });
    internal async Task<ShortcutStatus[]> ConfigureAsync(CaptureConfiguration configuration)
    {
        if (configuration.Gestures.Enabled && configuration.Gestures.Rows.Length > 0) await display.InitializeAsync();
        var state = await ready.Task;
        return await state.Dispatcher.InvokeAsync(() => state.Engine.Configure(configuration));
    }
    internal async Task ConfigureGesturesAsync(Configuration configuration)
    {
        if (configuration.Enabled && configuration.Rows.Length > 0) await display.InitializeAsync();
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
        disposed = true; notices.Writer.TryComplete();
        if (ready.Task.IsCompletedSuccessfully) {
            var state = ready.Task.Result;
            if (!state.Dispatcher.HasShutdownStarted) state.Dispatcher.Invoke(() => {
                state.Engine.Dispose(); state.Dispatcher.BeginInvokeShutdown(DispatcherPriority.Send);
            });
        }
        if (Thread.CurrentThread != thread) thread.Join(2000);
    }
}
