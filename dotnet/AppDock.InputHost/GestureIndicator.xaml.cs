using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace AppDock.InputHost;

internal partial class GestureIndicator : Window
{
    private nint handle;
    internal GestureIndicator()
    {
        InitializeComponent();
        new WindowInteropHelper(this).EnsureHandle();
    }
    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        handle = new WindowInteropHelper(this).Handle;
        // Watch's transparent, topmost, non-activating overlay; also exclude Alt+Tab.
        SetWindowLong(handle, -20, GetWindowLong(handle, -20) | 0x20 | 0x08000000 | 0x80);
    }
    internal void Display(GesturePoint origin, string process, GestureDirection[] directions, string[] captions,
        double opacity, string style, string accent, bool dark, int captionRows = 0)
    {
        var classic = style == "classic";
        Opacity = classic ? opacity : 1;
        _classic.Visibility = classic ? Visibility.Visible : Visibility.Collapsed;
        _modern.Visibility = classic ? Visibility.Collapsed : Visibility.Visible;
        if (classic)
        {
            _modern.Content = null;
            _textProcessName.Text = process;
            _textBlockGesture.Text = string.Concat(directions.Select(direction => GestureConfiguration.Marks[(int)direction]));
            _textBlockCaption.Text = string.Join("\n", captions);
        }
        else _modern.Content = GestureIndicatorContent.Create(style, process, directions, captions, opacity, accent, dark, captionRows);
        // Measure while hidden, then position the HWND before its first visible frame.
        var content = (FrameworkElement)Content;
        // ContentPresenter may still be realizing the new style after a hidden-window reuse.
        // Complete that layout before sampling the size used for native placement.
        UpdateLayout();
        content.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        content.Arrange(new Rect(new Point(), content.DesiredSize));
        UpdateLayout();
        var size = content.DesiredSize;
        var destinationMonitor = MonitorFromPoint(origin, 2);
        // Resolve the destination DPI before placing a window reused from another monitor.
        var dpi = GetDpiForMonitor(destinationMonitor, 0, out var monitorDpi, out _) == 0
            ? monitorDpi : GetDpiForWindow(handle);
        var scale = Math.Max(96, dpi) / 96d;
        var width = (int)Math.Ceiling(size.Width * scale);
        var height = (int)Math.Ceiling(size.Height * scale);
        var left = origin.X - width / 2;
        var top = origin.Y - height / 2;
        var monitor = new MonitorInfo { Size = Marshal.SizeOf<MonitorInfo>() };
        if (GetMonitorInfo(destinationMonitor, ref monitor))
        {
            left = Math.Clamp(left, monitor.Bounds.Left, Math.Max(monitor.Bounds.Left, monitor.Bounds.Right - width));
            top = Math.Clamp(top, monitor.Bounds.Top, Math.Max(monitor.Bounds.Top, monitor.Bounds.Bottom - height));
        }
        SetWindowPos(handle, new nint(-1), left, top,
            width, height, 0x0010);
        if (!IsVisible) Show();
    }
    [DllImport("user32.dll")] private static extern int GetWindowLong(nint window, int index);
    [DllImport("user32.dll")] private static extern int SetWindowLong(nint window, int index, int value);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(nint window);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(nint window, nint after, int x, int y, int w, int h, uint flags);
    [StructLayout(LayoutKind.Sequential)] private struct MonitorRect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct MonitorInfo { public int Size; public MonitorRect Bounds, WorkArea; public uint Flags; }
    [DllImport("user32.dll")] private static extern nint MonitorFromPoint(GesturePoint point, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool GetMonitorInfo(nint monitor, ref MonitorInfo info);
    [DllImport("shcore.dll")] private static extern int GetDpiForMonitor(nint monitor, int kind, out uint x, out uint y);
}
