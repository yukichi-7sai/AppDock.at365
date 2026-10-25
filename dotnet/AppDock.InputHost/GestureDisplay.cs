using System.Windows.Threading;

namespace AppDock.InputHost;

internal sealed class GestureDisplay(Dispatcher dispatcher)
{
    private GestureIndicator? window;
    internal bool IsVisible { get; private set; }
    internal async Task InitializeAsync() => await dispatcher.InvokeAsync(() => window ??= new GestureIndicator());
    internal void Hide() { IsVisible = false; Post(() => window?.Hide()); }
    internal void Display(GesturePoint origin, string process, GestureDirection[] directions, string[] captions,
        double opacity, string style, string accent, bool dark, int captionRows = 0)
    {
        IsVisible = true;
        Post(() => window?.Display(origin, process, directions, captions, opacity, style, accent, dark, captionRows));
    }
    internal void Close() { IsVisible = false; Post(() => window?.Close()); }
    private void Post(Action work) { if (!dispatcher.HasShutdownStarted) dispatcher.BeginInvoke(work); }
}
