using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace AppDock.InputHost;

// Allocate data before clearing the clipboard. Set privacy formats before publishing any text.
internal sealed class ClipboardText : IDisposable
{
    private readonly List<(uint Format, nint Memory)> parts = [];
    internal ClipboardText(string text, bool history)
    {
        try
        {
            Add(RegisterClipboardFormat("CanIncludeInClipboardHistory"), BitConverter.GetBytes(history ? 1u : 0u));
            Add(RegisterClipboardFormat("CanUploadToCloudClipboard"), BitConverter.GetBytes(0u));
            if (!history) Add(RegisterClipboardFormat("ExcludeClipboardContentFromMonitorProcessing"), BitConverter.GetBytes(1u));
            Add(13, Encoding.Unicode.GetBytes(text + "\0")); // CF_UNICODETEXT
        }
        catch { Dispose(); throw; }
    }
    private void Add(uint format, byte[] bytes)
    {
        if (format == 0) throw new Win32Exception();
        var memory = GlobalAlloc(0x42, (nuint)bytes.Length);
        if (memory == 0) throw new OutOfMemoryException();
        parts.Add((format, memory));
        var p = GlobalLock(memory);
        if (p == 0) throw new Win32Exception();
        try { Marshal.Copy(bytes, 0, p, bytes.Length); } finally { GlobalUnlock(memory); }
    }
    internal void Write()
    {
        if (!EmptyClipboard()) throw new Win32Exception();
        for (int i = 0; i < parts.Count; i++)
        {
            var part = parts[i];
            if (SetClipboardData(part.Format, part.Memory) == 0) throw new Win32Exception();
            parts[i] = (part.Format, 0); // Windows now owns this handle.
        }
    }
    public void Dispose()
    {
        foreach (var part in parts) if (part.Memory != 0) GlobalFree(part.Memory);
        parts.Clear();
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern uint RegisterClipboardFormat(string name);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool EmptyClipboard();
    [DllImport("user32.dll", SetLastError = true)] private static extern nint SetClipboardData(uint format, nint memory);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern nint GlobalAlloc(uint flags, nuint size);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern nint GlobalLock(nint h);
    [DllImport("kernel32.dll")] private static extern bool GlobalUnlock(nint h);
    [DllImport("kernel32.dll")] private static extern nint GlobalFree(nint h);
}
