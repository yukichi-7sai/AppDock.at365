using System.Runtime.InteropServices;

namespace AppDock.InputHost;

// Lives on the input dispatcher's STA. Only the matching session can use the captured target.
internal sealed class InputPaletteTarget
{
    private readonly nint window, focus;
    internal readonly string Session;
    internal readonly uint Since = unchecked((uint)Environment.TickCount);
    internal readonly GesturePoint Anchor;
    internal readonly Dictionary<uint, string> HeldArrows = [];
    internal nint Popup;
    internal nint Editor => focus;
    internal string WindowId => window.ToInt64().ToString();
    internal readonly System.Text.StringBuilder Body = new();
    private volatile bool cancelled;
    internal void Cancel() => cancelled = true;
    private InputPaletteTarget(string session, nint window, nint focus, GesturePoint anchor)
        => (Session, this.window, this.focus, Anchor) = (session, window, focus, anchor);
    internal bool MatchesWindow(nint current) => current == window;
    internal bool IsCurrent() => !cancelled && GetForegroundWindow() == window && Info(window, out var info) && info.Focus == focus;
    internal bool PointerInside(GesturePoint point) => Popup != 0 && GetAncestor(WindowFromPoint(point), 2) == Popup;
    internal static InputPaletteTarget? Capture(string session, string expected)
    {
        var target = GetForegroundWindow();
        if (target == 0 || (expected != "0" && expected != target.ToInt64().ToString()) ||
            !Info(target, out var info) || info.Focus == 0) return null;
        var anchor = new GesturePoint(info.Rect.Left, info.Rect.Bottom);
        if (info.Caret == 0 || !ClientToScreen(info.Caret, ref anchor))
            if (!GetCursorPos(out anchor)) return null;
        return new(session, target, info.Focus, anchor);
    }
    private static bool Info(nint window, out GuiInfo info)
    {
        info = new GuiInfo { Size = (uint)Marshal.SizeOf<GuiInfo>() };
        var thread = GetWindowThreadProcessId(window, out _);
        return thread != 0 && GetGUIThreadInfo(thread, ref info);
    }
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct GuiInfo { public uint Size, Flags; public nint Active, Focus, Capture, Menu, Move, Caret; public Rect Rect; }
    [DllImport("user32.dll")] private static extern bool GetGUIThreadInfo(uint thread, ref GuiInfo info);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint process);
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern nint WindowFromPoint(GesturePoint point);
    [DllImport("user32.dll")] private static extern nint GetAncestor(nint window, uint flag);
    [DllImport("user32.dll")] private static extern bool ClientToScreen(nint window, ref GesturePoint point);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out GesturePoint point);
}
