using System;
using System.Runtime.InteropServices;
using System.Threading;

// Read only test-owned metadata. Restore an initially empty clipboard only while still owned.
public static class PaletteTestClipboard
{
    [DllImport("user32.dll")] static extern bool OpenClipboard(IntPtr owner);
    [DllImport("user32.dll")] static extern bool CloseClipboard();
    [DllImport("user32.dll")] static extern bool EmptyClipboard();
    [DllImport("user32.dll")] static extern int CountClipboardFormats();
    [DllImport("user32.dll")] static extern IntPtr GetClipboardOwner();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern uint RegisterClipboardFormat(string name);
    [DllImport("user32.dll")] static extern bool IsClipboardFormatAvailable(uint id);
    [DllImport("user32.dll")] static extern IntPtr GetClipboardData(uint format);
    [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr h);
    [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr h);
    public static uint OwnerPid() { uint pid; GetWindowThreadProcessId(GetClipboardOwner(), out pid); return pid; }
    static bool CanInclude(string format)
    {
        IntPtr data = GetClipboardData(RegisterClipboardFormat(format));
        IntPtr ptr = GlobalLock(data);
        if (ptr == IntPtr.Zero) throw new Exception("Missing clipboard option");
        try { return Marshal.ReadInt32(ptr) != 0; } finally { GlobalUnlock(data); }
    }
    public static string Check(int inputHost, string action)
    {
        int start = Environment.TickCount;
        while (!OpenClipboard(IntPtr.Zero)) {
            if (unchecked(Environment.TickCount - start) > 1000) throw new Exception("Clipboard busy");
            Thread.Sleep(10);
        }
        try {
            if (CountClipboardFormats() == 0) return "empty";
            uint pid;
            GetWindowThreadProcessId(GetClipboardOwner(), out pid);
            if (pid != inputHost || pid == 0) return "other";
            if (action == "clear") return EmptyClipboard() ? "cleared" : "busy";
            if (!IsClipboardFormatAvailable(13) || CanInclude("CanUploadToCloudClipboard")) return "unexpected";
            bool history = CanInclude("CanIncludeInClipboardHistory");
            bool exclude = IsClipboardFormatAvailable(RegisterClipboardFormat("ExcludeClipboardContentFromMonitorProcessing"));
            return history == exclude ? "unexpected" : history ? "included" : "excluded";
        } finally { CloseClipboard(); }
    }
}
