using System.Runtime.InteropServices;
using System.Text;

namespace AppDock.InputHost;

internal static class GestureTarget
{
    internal static nint At(GesturePoint point) => GetAncestor(WindowFromPoint(point), 2);
    internal static bool IsDesktop(nint window)
    {
        var shell = GetShellWindow();
        if (window == 0 || shell == 0) return false;
        GetWindowThreadProcessId(shell, out var shellProcess);
        GetWindowThreadProcessId(window, out var process);
        if (process != shellProcess) return false;
        var name = new StringBuilder(256);
        GetClassName(window, name, name.Capacity);
        // Both layouts are used by Explorer, including multiple monitors and hidden desktop icons.
        // Checking the Shell process excludes ordinary applications with a similarly named class.
        return window == shell || name.ToString() is "Progman" or "WorkerW";
    }
    internal static bool Matches(nint expected, nint actual) => expected != 0 && actual != 0 &&
        (expected == actual || IsDesktop(expected) && IsDesktop(actual));
    internal static bool TryActivate(nint window, nint source, CancellationToken token)
    {
        // Only called on a worker for the target captured by a live physical right-button press.
        // Never attach the low-level hook thread to another application's input queue.
        var requested = false;
        bool Valid() {
            var foreground = GetForegroundWindow();
            return !token.IsCancellationRequested && IsWindowVisible(window) &&
                (foreground == source || Matches(window, foreground) || requested && foreground == 0);
        }
        bool WaitForActivation() {
            var deadline = Environment.TickCount64 + 500;
            do {
                if (!Valid()) return false;
                if (Matches(window, GetForegroundWindow())) return true;
                Thread.Sleep(5);
            } while (Environment.TickCount64 < deadline);
            return false;
        }
        if (!Valid()) return false;
        if (Matches(window, GetForegroundWindow())) return true;
        var destination = IsDesktop(window) ? GetShellWindow() : window;
        if (destination == 0) return false;
        requested = true;
        var accepted = SetForegroundWindow(destination);
        // Windows may briefly return NULL while deactivating the previous window, notably Electron.
        if (accepted || GetForegroundWindow() == 0 || Matches(window, GetForegroundWindow())) return WaitForActivation();
        if (!Valid()) return false;
        PeekMessage(out _, 0, 0, 0, 0);
        var current = GetCurrentThreadId();
        var foreground = GetWindowThreadProcessId(source, out _);
        var target = GetWindowThreadProcessId(destination, out _);
        if (foreground == 0 || target == 0 || foreground == current ||
            !AttachThreadInput(current, foreground, true)) return false;
        var attachedTarget = target != current && target != foreground && AttachThreadInput(current, target, true);
        try {
            if (!Valid()) return false;
            SetForegroundWindow(destination);
            return WaitForActivation();
        } finally {
            if (attachedTarget) AttachThreadInput(current, target, false);
            AttachThreadInput(current, foreground, false);
        }
    }
    internal static GesturePoint MonitorCenter(GesturePoint origin)
    {
        var monitor = MonitorFromPoint(origin, 2);
        var info = new MonitorInfo { Size = (uint)Marshal.SizeOf<MonitorInfo>() };
        return monitor != 0 && GetMonitorInfo(monitor, ref info)
            ? new((info.Monitor.Left + info.Monitor.Right) / 2, (info.Monitor.Top + info.Monitor.Bottom) / 2)
            : origin;
    }
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct MonitorInfo { public uint Size; public Rect Monitor, Work; public uint Flags; }
    [StructLayout(LayoutKind.Sequential)] private struct Message { public nint Window; public uint Id; public nuint WParam; public nint LParam; public uint Time; public int X, Y; public uint Private; }
    [DllImport("user32.dll")] private static extern nint GetShellWindow();
    [DllImport("user32.dll")] private static extern nint GetAncestor(nint window, uint flags);
    [DllImport("user32.dll")] private static extern nint WindowFromPoint(GesturePoint point);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint process);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(nint window, StringBuilder name, int size);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint window);
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint window);
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint source, uint target, bool attach);
    [DllImport("user32.dll")] private static extern bool PeekMessage(out Message message, nint window, uint min, uint max, uint flags);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern nint MonitorFromPoint(GesturePoint point, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool GetMonitorInfo(nint monitor, ref MonitorInfo info);
}
