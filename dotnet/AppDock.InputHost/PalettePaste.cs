using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Interop;
using System.Windows.Threading;

namespace AppDock.InputHost;

internal sealed class PalettePaste(Dispatcher dispatcher) : IDisposable
{
    private HwndSource? owner;
    private const uint MessageFlags = 0x23; // SMTO_BLOCK | ABORTIFHUNG | ERRORONEXIT
    private readonly record struct EditState(uint Start, uint End, long Length);
    internal readonly record struct ClipboardVersion(nint Owner, uint Sequence)
    {
        internal static ClipboardVersion Current() => new(GetClipboardOwner(), GetClipboardSequenceNumber());
        internal bool IsCurrent() => this == Current();
    }

    internal async Task<string> SubmitAsync(InputPaletteTarget target, bool history, string? item, CancellationToken lifetime)
    {
        var editor = target.Editor;
        var name = new StringBuilder(128);
        if (GetClassName(editor, name, name.Capacity) == 0 || !target.IsCurrent()) return "cancelled";
        var cls = name.ToString();
        bool rich = cls.StartsWith("RichEdit", StringComparison.OrdinalIgnoreCase);
        bool edit = rich || cls.Equals("Edit", StringComparison.OrdinalIgnoreCase);
        if (edit && (GetWindowLongPtr(editor, -16).ToInt64() & 0x800) != 0) return "cancelled";
        var handle = await dispatcher.InvokeAsync(() =>
        {
            owner ??= new HwndSource(new HwndSourceParameters("AppDock clipboard")
            {
                ParentWindow = new IntPtr(-3),
                WindowStyle = 0,
                Width = 0,
                Height = 0
            });
            return owner.Handle;
        });
        if (!edit && !await WaitForKeys(target, lifetime)) return target.IsCurrent() ? "modifiers" : "cancelled";
        string? text;
        ClipboardVersion version;
        if (item != null)
        {
            var restored = await PaletteHistory.RestoreAsync(item, target);
            if (restored.Status != "ok") return restored.Status;
            text = restored.Text;
            version = restored.Version;
        }
        else
        {
            text = Normalize(target.Body.ToString());
            if (text.Contains('\0')) throw new InvalidOperationException("クリップボードに格納できない文字が含まれています。");
            if (text.Length == 0) return "verified";
            using var data = new ClipboardText(text, history);
            var started = Environment.TickCount64;
            while (!OpenClipboard(handle))
            {
                if (!target.IsCurrent()) return "cancelled";
                if (Environment.TickCount64 - started >= 1000) throw new InvalidOperationException("クリップボードを使用できません。");
                await Task.Delay(10, lifetime);
            }
            try
            {
                if (!target.IsCurrent()) return "cancelled";
                data.Write();
            }
            finally { CloseClipboard(); }
            version = new(handle, GetClipboardSequenceNumber());
        }
        var since = Environment.TickCount64;
        // Another clipboard reader can temporarily hold the clipboard after publication.
        while (!OpenClipboard(handle))
        {
            if (!target.IsCurrent()) return "cancelled";
            if (Environment.TickCount64 - since >= 1000) return "unconfirmed";
            await Task.Delay(10, lifetime);
        }
        bool ours;
        try { ours = version.IsCurrent(); } finally { CloseClipboard(); }
        if (!ours || !target.IsCurrent()) return "cancelled";

        if (!edit)
        {
            if (!await WaitForKeys(target, lifetime)) return target.IsCurrent() ? "modifiers" : "cancelled";
            if (!target.IsCurrent() || !version.IsCurrent()) return "cancelled";
            InputSender.SubmitPasteShortcut();
            return "submitted"; // No generic acknowledgement from a foreign application.
        }

        var before = State(editor);
        if (!target.IsCurrent() || !version.IsCurrent()) return "cancelled";
        if (!before.HasValue) return "unconfirmed";
        if (SendMessageTimeout(editor, 0x0302, 0, 0, MessageFlags, 1000, out _) == 0) return "unconfirmed";
        if (text == null) return "submitted";
        if (item != null) text = Normalize(text);
        var compactLength = rich ? text.Replace("\r\n", "\r").Length : text.Length;
        var deadline = Environment.TickCount64 + 1000;
        do
        {
            if (!target.IsCurrent()) return "cancelled";
            var after = State(editor);
            if (!after.HasValue) break;
            var a = after.Value; var b = before.Value;
            var advance = (long)a.Start - b.Start;
            if (a.Start == a.End && (advance == compactLength || advance == text.Length) &&
                (b.Start != b.End || a.Length - b.Length == compactLength || a.Length - b.Length == text.Length))
                return "verified";
            if (Environment.TickCount64 >= deadline) break;
            await Task.Delay(10, lifetime);
        } while (true);
        return "unconfirmed"; // A timeout or a filtered/partial paste must never be replayed.
    }
    private static string Normalize(string text) => text.Replace("\r\n", "\n").Replace('\r', '\n').Replace("\n", "\r\n");
    private static async Task<bool> WaitForKeys(InputPaletteTarget target, CancellationToken lifetime)
    {
        var start = Environment.TickCount64;
        while (InputSender.PasteKeysHeld())
        {
            if (!target.IsCurrent() || Environment.TickCount64 - start >= 2000) return false;
            await Task.Delay(15, lifetime);
        }
        return true;
    }
    private static EditState? State(nint h)
    {
        if (GetSelection(h, 0xb0, out var start, out var end, MessageFlags, 250, out _) == 0 ||
            SendMessageTimeout(h, 0xe, 0, 0, MessageFlags, 250, out var length) == 0) return null;
        return new(start, end, (long)length);
    }
    public void Dispose() => owner?.Dispose();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(nint h, StringBuilder s, int size);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern nint GetWindowLongPtr(nint h, int index);
    [DllImport("user32.dll")] private static extern bool OpenClipboard(nint h);
    [DllImport("user32.dll")] private static extern bool CloseClipboard();
    [DllImport("user32.dll")] private static extern nint GetClipboardOwner();
    [DllImport("user32.dll")] private static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll", EntryPoint = "SendMessageTimeoutW")] private static extern nint GetSelection(nint h, uint msg, out uint start, out uint end, uint flags, uint timeout, out nuint result);
    [DllImport("user32.dll", EntryPoint = "SendMessageTimeoutW")] private static extern nint SendMessageTimeout(nint h, uint msg, nint w, nint l, uint flags, uint timeout, out nuint result);
}
