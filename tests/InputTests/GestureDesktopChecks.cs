using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using AppDock.InputHost;

namespace AppDock.InputHost
{
    [StructLayout(LayoutKind.Sequential)] internal readonly record struct GesturePoint(int X, int Y);
}

internal static partial class Program
{
    private static nint FolderFixtureWindow(string folder)
    {
        object? application = null, collection = null;
        try {
            application = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application")!);
            collection = ((dynamic)application!).Windows();
            dynamic windows = collection;
            for (var index = 0; index < (int)windows.Count; index++) {
                object? item = null;
                try {
                    item = windows.Item(index);
                    var location = (string)((dynamic)item!).LocationURL;
                    if (Uri.TryCreate(location, UriKind.Absolute, out var uri) && uri.IsFile &&
                        string.Equals(Path.GetFullPath(uri.LocalPath).TrimEnd('\\'), folder.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase))
                        return new nint((long)((dynamic)item).HWND);
                } catch (COMException) { }
                finally { if (item != null && Marshal.IsComObject(item)) Marshal.ReleaseComObject(item); }
            }
        } finally {
            if (collection != null && Marshal.IsComObject(collection)) Marshal.ReleaseComObject(collection);
            if (application != null && Marshal.IsComObject(application)) Marshal.ReleaseComObject(application);
        }
        return 0;
    }
    private static async Task<(nint Window, string Folder)> OpenFolderFixture()
    {
        var folder = Path.GetFullPath(Path.Combine(".artifacts", "gesture-folder-input-" + Guid.NewGuid().ToString("N")));
        Directory.CreateDirectory(folder);
        using var launched = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", "/n,\"" + folder + "\"") { UseShellExecute = true });
        var deadline = Environment.TickCount64 + 8000;
        do {
            var window = FolderFixtureWindow(folder);
            if (window != 0) return (window, folder);
            await Task.Delay(50);
        } while (Environment.TickCount64 < deadline);
        throw new Exception("The isolated Explorer folder did not open: " + folder);
    }
    private static async Task CloseFolderFixture(nint window, string folder)
    {
        if (FolderFixtureWindow(folder) == window) PostFixtureMessage(window, 0x10, 0, 0);
        var deadline = Environment.TickCount64 + 3000;
        while (FolderFixtureWindow(folder) == window && Environment.TickCount64 < deadline) await Task.Delay(50);
        if (FolderFixtureWindow(folder) == window) throw new Exception("The isolated Explorer folder did not close.");
        Directory.Delete(folder);
    }
    private static System.Drawing.Point? DesktopPoint()
    {
        foreach (var screen in Screen.AllScreens)
            for (var y = screen.WorkingArea.Top + 80; y < screen.WorkingArea.Bottom - 80; y += 100)
                for (var x = screen.WorkingArea.Right - 100; x > screen.WorkingArea.Left + 180; x -= 100) {
                    var point = new GesturePoint(x, y);
                    if (GestureTarget.IsDesktop(GestureTarget.At(point)) &&
                        GestureTarget.IsDesktop(GestureTarget.At(new(x - 80, y)))) return new(x, y);
                }
        return null;
    }
    private static bool IsDesktopContextMenu()
    {
        var info = new DesktopGuiInfo { Size = (uint)Marshal.SizeOf<DesktopGuiInfo>() };
        return DesktopGuiThreadInfo(0, ref info) && (info.Flags & 0x1C) != 0 && GestureTarget.IsDesktop(info.MenuOwner);
    }
    private static async Task DismissDesktopContextMenu()
    {
        if (!IsDesktopContextMenu()) return;
        Key(0x1B); Key(0x1B, true);
        var deadline = Environment.TickCount64 + 1000;
        while (IsDesktopContextMenu() && Environment.TickCount64 < deadline) await Task.Delay(10);
        if (IsDesktopContextMenu()) throw new Exception("The desktop context menu did not close.");
    }
    private static string InputFocusDiagnostic()
    {
        var info = new DesktopGuiInfo { Size = (uint)Marshal.SizeOf<DesktopGuiInfo>() };
        var available = DesktopGuiThreadInfo(0, ref info);
        return $"foreground={GetForegroundWindow()}, gui={available}, flags={info.Flags}, menuOwner={info.MenuOwner}, capture={info.Capture}";
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct DesktopGuiInfo {
        public uint Size, Flags;
        public nint Active, Focus, Capture, MenuOwner, MoveSize, Caret;
        public Rect CaretRect;
    }
    [DllImport("user32.dll", EntryPoint = "GetGUIThreadInfo")]
    private static extern bool DesktopGuiThreadInfo(uint thread, ref DesktopGuiInfo info);
    [DllImport("user32.dll")] private static extern nint GetShellWindow();
    [DllImport("user32.dll", EntryPoint = "PostMessageW")] private static extern bool PostFixtureMessage(nint window, uint message, nuint wParam, nint lParam);
}
