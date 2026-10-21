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
    internal void Display(GesturePoint origin, string process, string gesture, string caption, double opacity)
    {
        Opacity = opacity;
        _textProcessName.Text = process;
        _textBlockGesture.Text = gesture;
        _textBlockCaption.Text = caption;
        // Measure while hidden, then position the HWND before its first visible frame.
        var content = (FrameworkElement)Content;
        content.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        var size = content.DesiredSize;
        content.Arrange(new Rect(new Point(), size));
        UpdateLayout();
        var scale = Math.Max(96, GetDpiForWindow(handle)) / 96d;
        var width = (int)Math.Ceiling(size.Width * scale);
        var height = (int)Math.Ceiling(size.Height * scale);
        SetWindowPos(handle, new nint(-1), origin.X - width / 2, origin.Y - height / 2,
            width, height, 0x0010);
        if (!IsVisible) Show();
    }
    [DllImport("user32.dll")] private static extern int GetWindowLong(nint window, int index);
    [DllImport("user32.dll")] private static extern int SetWindowLong(nint window, int index, int value);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(nint window);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(nint window, nint after, int x, int y, int w, int h, uint flags);
}
