using System;
using System.Runtime.InteropServices;

// Only send allowed palette keys while the isolated host and its captured editor still own focus.
public static class PaletteResizeFixture
{
    [StructLayout(LayoutKind.Sequential)] struct Info { public uint Size, Flags; public IntPtr Active, Focus, Capture, Menu, Move, Caret; public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread, ref Info info);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    public static long Guard(long handle, uint expectedPid)
    {
        var window = new IntPtr(handle);
        uint pid; var thread = GetWindowThreadProcessId(window, out pid);
        var info = new Info { Size = (uint)Marshal.SizeOf(typeof(Info)) };
        if (GetForegroundWindow() != window || pid != expectedPid || !GetGUIThreadInfo(thread, ref info) || info.Focus == IntPtr.Zero)
            throw new Exception("Isolated palette editor lost focus");
        return info.Focus.ToInt64();
    }
    public static long Activate(long handle, uint expectedPid)
    {
        var window = new IntPtr(handle); uint pid;
        var target = GetWindowThreadProcessId(window, out pid);
        if (pid != expectedPid) throw new Exception("Unexpected activation target");
        var current = GetCurrentThreadId(); var foreground = GetWindowThreadProcessId(GetForegroundWindow(), out pid);
        // GetGUIThreadInfo initializes the caller's user32 message state before attaching.
        var info = new Info { Size = (uint)Marshal.SizeOf(typeof(Info)) }; GetGUIThreadInfo(current, ref info);
        var a = foreground != 0 && foreground != current && AttachThreadInput(current, foreground, true);
        var b = target != current && target != foreground && AttachThreadInput(current, target, true);
        try { SetForegroundWindow(window); }
        finally { if (b) AttachThreadInput(current, target, false); if (a) AttachThreadInput(current, foreground, false); }
        return Guard(handle, expectedPid);
    }
    public static long Press(long handle, uint pid, long focus, byte key)
    {
        if (!(key == 13 || key == 27 || (key >= 33 && key <= 40) || (key >= 48 && key <= 57)))
            throw new Exception("Key outside palette fixture allowlist");
        if (Guard(handle, pid) != focus) throw new Exception("Editor changed before key input");
        try { keybd_event(key, 0, 0, UIntPtr.Zero); }
        finally { keybd_event(key, 0, 2, UIntPtr.Zero); }
        return Guard(handle, pid);
    }
}
