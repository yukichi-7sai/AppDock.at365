using System.Windows.Threading;

namespace AppDock.InputHost;

internal sealed class GestureDisplay(Dispatcher dispatcher)
{
    private GestureIndicator? window;
    internal bool IsVisible { get; private set; }
    internal async Task InitializeAsync() => await dispatcher.InvokeAsync(() => window ??= new GestureIndicator());
    internal void Hide() { IsVisible = false; Post(() => window?.Hide()); }
    internal void Display(GesturePoint origin, string process, GestureDirection direction, string caption, double opacity)
    {
        IsVisible = true;
        Post(() => window?.Display(origin, process, direction, caption, opacity));
    }
    internal void Close() { IsVisible = false; Post(() => window?.Close()); }
    private void Post(Action work) { if (!dispatcher.HasShutdownStarted) dispatcher.BeginInvoke(work); }
}
