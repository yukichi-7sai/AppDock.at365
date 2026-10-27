using System.Runtime.InteropServices;

namespace AppDock.InputHost;

internal static class ForegroundPermission
{
    // Only an explicit show command for a recent captured press may use this worker.
    // Never attach the timed hook thread or change the foreground for input commands.
    internal static bool Activate(nint window, nint source, uint process)
    {
        var targetThread = GetWindowThreadProcessId(window, out var owner);
        if (process == 0 || owner != process || !IsWindowVisible(window)) return false;
        var before = GetForegroundWindow();
        if (before == window) return true;
        if (before != source) return false;
        if (SetForegroundWindow(window)) return true;
        PeekMessage(out _, 0, 0, 0, 0);
        var current = GetCurrentThreadId();
        var foreground = GetWindowThreadProcessId(before, out _);
        if (foreground == 0 || foreground == current || !AttachThreadInput(current, foreground, true)) return false;
        var targetAttached = targetThread != current && targetThread != foreground && AttachThreadInput(current, targetThread, true);
        try {
            if (GetForegroundWindow() != source) return false;
            BringWindowToTop(window);
            return GetForegroundWindow() == window || SetForegroundWindow(window);
        }
        finally {
            if (targetAttached) AttachThreadInput(current, targetThread, false);
            AttachThreadInput(current, foreground, false);
        }
    }
    [StructLayout(LayoutKind.Sequential)] private struct Message { public nint Window; public uint Id; public nuint WParam; public nint LParam; public uint Time; public int X,Y; public uint Private; }
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint window);
    [DllImport("user32.dll")] private static extern bool BringWindowToTop(nint window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint window);
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint process);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint source, uint target, bool attach);
    [DllImport("user32.dll")] private static extern bool PeekMessage(out Message message, nint window, uint min, uint max, uint flags);
}
