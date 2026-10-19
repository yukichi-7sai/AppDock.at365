using System.Runtime.InteropServices;

namespace AppDock.InputHost;

internal static class ForegroundPermission
{
    internal static void AddDescendants(HashSet<uint> processes)
    {
        var snapshot = CreateToolhelp32Snapshot(2, 0);
        if (snapshot == new nint(-1)) return;
        try {
            var entry = new ProcessEntry { Size = (uint)Marshal.SizeOf<ProcessEntry>() };
            var parents = new List<(uint Process, uint Parent)>();
            if (Process32First(snapshot, ref entry)) do {
                parents.Add((entry.Process, entry.Parent));
            } while (parents.Count < 8192 && Process32Next(snapshot, ref entry));
            for (var depth = 0; depth < 32; depth++) {
                var changed = false;
                foreach (var item in parents)
                    if (processes.Contains(item.Parent) && processes.Count < 8192) changed |= processes.Add(item.Process);
                if (!changed) break;
            }
        } finally { CloseHandle(snapshot); }
    }
    internal static nint ProcessWindow(HashSet<uint> processes, out uint ownerProcess)
    {
        nint result = 0;
        uint foundProcess = 0;
        EnumWindows((window, _) => {
            GetWindowThreadProcessId(window, out var owner);
            if (!processes.Contains(owner) || !IsWindowVisible(window) || GetWindow(window, 4) != 0) return true;
            result = window; foundProcess = owner; return false;
        }, 0);
        ownerProcess = foundProcess;
        return result;
    }
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
        try { return GetForegroundWindow() == source && SetForegroundWindow(window); }
        finally {
            if (targetAttached) AttachThreadInput(current, targetThread, false);
            AttachThreadInput(current, foreground, false);
        }
    }
    [StructLayout(LayoutKind.Sequential)] private struct Message { public nint Window; public uint Id; public nuint WParam; public nint LParam; public uint Time; public int X,Y; public uint Private; }
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint window);
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint process);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint source, uint target, bool attach);
    [DllImport("user32.dll")] private static extern bool PeekMessage(out Message message, nint window, uint min, uint max, uint flags);
    private delegate bool EnumWindow(nint window, nint data);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindow callback, nint data);
    [DllImport("user32.dll")] private static extern nint GetWindow(nint window, uint command);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] private struct ProcessEntry {
        public uint Size, Usage, Process; public nuint Heap; public uint Module, Threads, Parent; public int Priority; public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string Name;
    }
    [DllImport("kernel32.dll")] private static extern nint CreateToolhelp32Snapshot(uint flags,uint process);
    [DllImport("kernel32.dll",EntryPoint="Process32FirstW",CharSet=CharSet.Unicode)] private static extern bool Process32First(nint snapshot,ref ProcessEntry entry);
    [DllImport("kernel32.dll",EntryPoint="Process32NextW",CharSet=CharSet.Unicode)] private static extern bool Process32Next(nint snapshot,ref ProcessEntry entry);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(nint handle);
}
