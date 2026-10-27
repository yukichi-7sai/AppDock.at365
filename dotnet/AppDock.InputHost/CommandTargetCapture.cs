using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace AppDock.InputHost;

/// <summary>Facts captured with the key press; unavailable process facts stay unknown.</summary>
internal static class CommandTargetCapture
{
    internal static CommandTargetContext Capture(nint window)
    {
        if (window == 0) return new("0");
        var name = new StringBuilder(256);
        var length = GetClassName(window, name, name.Capacity);
        string? process = null;
        GetWindowThreadProcessId(window, out var pid);
        if (pid != 0) {
            try { using var item = Process.GetProcessById((int)pid); process = item.ProcessName; }
            catch (Exception error) when (error is ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception) { }
        }
        return new(window.ToInt64().ToString(), process, length > 0 ? name.ToString() : null, GestureTarget.IsDesktop(window));
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(nint window, StringBuilder name, int size);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint pid);
}
