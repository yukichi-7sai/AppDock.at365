using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows.Threading;

namespace AppDock.InputHost;

internal sealed record RecordingInput(string Token, string Window, bool AllowWin = true);
internal sealed record CaptureConfiguration(Configuration Gestures, ShortcutInput[] Shortcuts,
    int ShortcutRevision, uint HostProcessId, string Context, RecordingInput? Recording = null,
    bool ShortcutsActive = true);
internal sealed record ShortcutPressNotice(int Revision, long PressId, string[] Shortcuts,
    bool Blocked, string Window, string Context,
    [property: System.Text.Json.Serialization.JsonIgnore] uint HostProcessId, CommandTargetContext? Target = null)
{
    [System.Text.Json.Serialization.JsonIgnore] public long CapturedAt { get; } = Environment.TickCount64;
}

// All recognition state and both hooks belong to this one input dispatcher.
internal sealed class InputCaptureEngine : IDisposable
{
    private readonly Dispatcher dispatcher;
    private readonly Func<string, object, bool> notify;
    private readonly HookCallback keyboardCallback, mouseCallback;
    private readonly DispatcherTimer timer;
    private readonly HashSet<uint> pressed = [];
    private readonly Dictionary<uint, bool> owned = [];
    private readonly Dictionary<ShortcutChord, List<ShortcutInput>> chords = [];
    private ShortcutInput[] inputs = [];
    private CaptureConfiguration? configuration;
    private RecordingInput? recording;
    private nint keyboardHook, mouseHook, layout, preparedLayout;
    private bool disposed, accepting;
    private long pressId;
    private nint? foregroundWindow;
    internal GestureEngine Gestures { get; }
    internal InputCaptureEngine(Dispatcher dispatcher, GestureIndicatorNotifications display, Func<string, object, bool> notify)
    {
        this.dispatcher = dispatcher; this.notify = notify;
        keyboardCallback = Keyboard; mouseCallback = Mouse;
        Gestures = new GestureEngine(dispatcher, display);
        Gestures.HooksChanged = () => dispatcher.BeginInvoke(new Action(Poll));
        timer = new DispatcherTimer(TimeSpan.FromMilliseconds(40), DispatcherPriority.Background,
            (_, _) => Poll(), dispatcher);
        timer.Start();
    }
    internal ShortcutStatus[] Configure(CaptureConfiguration next)
    {
        accepting = false;
        configuration = next;
        inputs = next.Shortcuts;
        recording = next.Recording;
        Gestures.Configure(next.Gestures);
        var statuses = Compile();
        if (!next.ShortcutsActive) preparedLayout = layout;
        try {
            Reconcile();
            accepting = next.ShortcutsActive && preparedLayout == layout;
            if (next.ShortcutsActive && preparedLayout != layout)
                notify("shortcuts.applied", new { revision = next.ShortcutRevision, statuses });
        } catch (Exception error) {
            inputs = []; chords.Clear(); recording = null;
            Gestures.Configure(next.Gestures with { Enabled = false });
            statuses = next.Shortcuts.Select(row => new ShortcutStatus(row.Shortcut, false, [],
                EffectiveBlockOriginalInput: row.BlockOriginalInput,
                Error: "入力フックを適用できません。権限とほかの入力ソフトを確認してください。")).ToArray();
            notify("input.error", new { message = "入力フックを適用できません。", code = error is Win32Exception win ? win.NativeErrorCode : 0 });
        }
        return statuses;
    }
    private nint ForegroundLayout()
    {
        var window = GetForegroundWindow();
        return GetKeyboardLayout(GetWindowThreadProcessId(window, out _));
    }
    private ShortcutStatus[] Compile()
    {
        layout = ForegroundLayout();
        chords.Clear();
        var statuses = inputs.Select(row => {
            try {
                var chord = ShortcutCodec.Parse(row.Shortcut, layout);
                if (!chords.TryGetValue(chord, out var group)) chords.Add(chord, group = []);
                group.Add(row);
                var alias = ShortcutCodec.Format(chord.Key, chord.Modifiers, layout);
                return new ShortcutStatus(row.Shortcut, true,
                    new[] { row.Shortcut, alias ?? row.Shortcut }.Distinct().ToArray(),
                    EffectiveBlockOriginalInput: row.BlockOriginalInput);
            } catch (ArgumentException error) {
                return new ShortcutStatus(row.Shortcut, false, [], EffectiveBlockOriginalInput: row.BlockOriginalInput, Error: error.Message);
            }
        }).ToArray();
        var blockers = new Dictionary<string, bool>();
        foreach (var group in chords.Values) {
            var block = group.Any(row => row.BlockOriginalInput);
            foreach (var row in group) blockers[row.Shortcut] = block;
        }
        return statuses.Select(status => blockers.TryGetValue(status.Shortcut, out var block)
            ? status with { EffectiveBlockOriginalInput = block } : status).ToArray();
    }
    private void Poll()
    {
        if (disposed) return;
        try {
            var foreground = GetForegroundWindow();
            if (foregroundWindow != foreground) {
                if (notify("capture.foreground", new { window = foreground.ToInt64().ToString() }))
                    foregroundWindow = foreground;
            }
            if (recording != null && GetForegroundWindow().ToInt64().ToString() != recording.Window) EndRecording();
            if (inputs.Length > 0 && layout != ForegroundLayout()) {
                accepting = false;
                var statuses = Compile();
                notify("shortcuts.applied", new { revision = configuration?.ShortcutRevision, statuses });
            }
            Reconcile();
        } catch {
            accepting = false; inputs = []; chords.Clear(); EndRecording();
            if (configuration != null) {
                Gestures.Configure(configuration.Gestures with { Enabled = false });
                var statuses = configuration.Shortcuts.Select(row => new ShortcutStatus(row.Shortcut, false, [],
                    EffectiveBlockOriginalInput: row.BlockOriginalInput, Error: "入力フックを適用できません。設定を保存するか再試行してください。")).ToArray();
                notify("shortcuts.applied", new { revision = configuration.ShortcutRevision, statuses });
            }
            notify("input.error", new { message = "入力フックを適用できません。設定を保存するか再試行してください。" });
        }
    }
    private void Reconcile()
    {
        if (disposed) return;
        var needKeyboard = chords.Count > 0 || recording != null || owned.Count > 0 || Gestures.NeedsKeyboard;
        var needMouse = recording != null || Gestures.NeedsMouse;
        if (needKeyboard && keyboardHook == 0) {
            pressed.Clear();
            for (uint key = 1; key < 256; key++)
                if (!ShortcutCodec.IsPulse(key) && (GetAsyncKeyState((int)key) & 0x8000) != 0) pressed.Add(key);
            keyboardHook = SetWindowsHookEx(13, keyboardCallback, GetModuleHandle(null), 0);
            if (keyboardHook == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        if (needMouse && mouseHook == 0) {
            mouseHook = SetWindowsHookEx(14, mouseCallback, GetModuleHandle(null), 0);
            if (mouseHook == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        if (!needKeyboard && keyboardHook != 0) { UnhookWindowsHookEx(keyboardHook); keyboardHook = 0; pressed.Clear(); }
        if (!needMouse && mouseHook != 0) { UnhookWindowsHookEx(mouseHook); mouseHook = 0; }
    }
    private int Modifiers(uint current, bool up)
    {
        // This callback precedes the OS asynchronous state update for the current key.
        bool Held(uint key) => key == current ? !up : (GetAsyncKeyState((int)key) & 0x8000) != 0;
        return (Held(0xA2) || Held(0xA3) || Held(0x11) ? 1 : 0) |
            (Held(0xA4) || Held(0xA5) || Held(0x12) ? 2 : 0) |
            (Held(0xA0) || Held(0xA1) || Held(0x10) ? 4 : 0) |
            (Held(0x5B) || Held(0x5C) ? 8 : 0);
    }
    private nint Keyboard(int code, uint message, nint pointer)
    {
        if (code < 0 || disposed) return CallNextHookEx(keyboardHook, code, message, pointer);
        var data = Marshal.PtrToStructure<KeyData>(pointer);
        if (data.Extra == GestureEngine.InputMarker) return CallNextHookEx(keyboardHook, code, message, pointer);
        data.Key = ShortcutCodec.CaptureKey(data.Key, data.Scan, data.Flags);
        var up = message is 0x101 or 0x105;
        var pulse = ShortcutCodec.IsPulse(data.Key);
        var repeat = !up && !pulse && !pressed.Add(data.Key);
        if (up || pulse) pressed.Remove(data.Key);
        try {
            if (owned.TryGetValue(data.Key, out var blocked)) {
                if (up) owned.Remove(data.Key);
                return blocked ? 1 : CallNextHookEx(keyboardHook, code, message, pointer);
            }
            var modifiers = Modifiers(data.Key, up);
            var chord = new ShortcutChord(data.Key, modifiers);
            if (recording != null) {
                if (GetForegroundWindow().ToInt64().ToString() != recording.Window) EndRecording();
                else if (data.Key == 27 || (data.Key == 9 && (modifiers & ~4) == 0)) EndRecording();
                else if (!up && !repeat && !ShortcutCodec.Protected(chord) && (recording.AllowWin || (modifiers & 8) == 0)) {
                    var key = ShortcutCodec.Format(data.Key, modifiers, ForegroundLayout());
                    if (key != null && MaskModifier(modifiers) &&
                        notify("shortcuts.recorded", new { token = recording.Token, key })) {
                        if (!pulse) owned[data.Key] = true;
                        return 1;
                    }
                }
                return CallNextHookEx(keyboardHook, code, message, pointer);
            }
            if (Gestures.Keyboard(code, message, pointer) != 0) return 1;
            if (!accepting || up || repeat || GetForegroundWindow() == 0 || configuration == null ||
                !chords.TryGetValue(chord, out var rows))
                return CallNextHookEx(keyboardHook, code, message, pointer);
            var capturedWindow = GetForegroundWindow();
            if (capturedWindow == 0) return CallNextHookEx(keyboardHook, code, message, pointer);
            rows = rows.Where(row => row.Owner == null || (row.Owner.StartsWith("touchpad:", StringComparison.Ordinal) && TouchpadInputLease.Accepts(row.TouchpadGeneration))).ToList();
            if (rows.Count == 0) return CallNextHookEx(keyboardHook, code, message, pointer);
            var target = rows.Any(row => row.Owner != null || row.Conditions is {Length:>0}) ? CommandTargetCapture.Capture(capturedWindow) : null;
            // A local binding sharing this key still dispatches through the native owner, without blocking ordinary input.
            GetWindowThreadProcessId(capturedWindow, out var foregroundProcess);
            var local = foregroundProcess == configuration.HostProcessId;
            var context = new CommandContext(new(), target);
            var matched = rows.Select(row => new {
                Row = row,
                Conditions = row.Conditions?.Where(c => CommandConditions.Matches(c.When, context, environment: row.Environment)).ToArray()
            }).Where(item => item.Conditions == null || item.Conditions.Length > 0 || local).ToArray();
            if (matched.Length == 0) return CallNextHookEx(keyboardHook, code, message, pointer);
            var block = matched.Any(item => item.Conditions == null ? item.Row.BlockOriginalInput : item.Conditions.Any(c => c.BlockOriginalInput));
            if (block && !MaskModifier(modifiers)) {
                notify("input.error", new { message = "修飾キーの単独動作を抑止できなかったため入力を通しました。" });
                return CallNextHookEx(keyboardHook, code, message, pointer);
            }
            var window = capturedWindow.ToInt64().ToString();
            if (!notify("shortcuts.pressed", new ShortcutPressNotice(configuration.ShortcutRevision, ++pressId,
                matched.Select(item => item.Row.Shortcut).Distinct().ToArray(), block, window, configuration.Context,
                configuration.HostProcessId, target))) return CallNextHookEx(keyboardHook, code, message, pointer);
            if (!pulse) owned[data.Key] = block;
            return block ? 1 : CallNextHookEx(keyboardHook, code, message, pointer);
        } catch {
            notify("input.error", new { message = "入力の検出に失敗したため新規入力を通しました。" });
            return CallNextHookEx(keyboardHook, code, message, pointer);
        }
    }
    private nint Mouse(int code, uint message, nint pointer)
    {
        if (code < 0 || disposed) return CallNextHookEx(mouseHook, code, message, pointer);
        var data = Marshal.PtrToStructure<MouseData>(pointer);
        if (data.Extra == GestureEngine.InputMarker) return CallNextHookEx(mouseHook, code, message, pointer);
        if (recording != null && message is 0x201 or 0x204 or 0x207 or 0x20B) EndRecording();
        return Gestures.Mouse(code, message, pointer) != 0 ? 1 : CallNextHookEx(mouseHook, code, message, pointer);
    }
    private void EndRecording()
    {
        var previous = recording;
        recording = null;
        if (previous != null) notify("shortcuts.recordEnded", new { token = previous.Token });
    }
    private static bool MaskModifier(int modifiers)
    {
        if ((modifiers & (2 | 8)) == 0) return true;
        var events = new[] {
            new Input { Type = 1, Data = new InputUnion { Keyboard = new KeyInput { Key = 0xFF, Extra = GestureEngine.InputMarker } } },
            new Input { Type = 1, Data = new InputUnion { Keyboard = new KeyInput { Key = 0xFF, Flags = 2, Extra = GestureEngine.InputMarker } } }
        };
        var sent = SendInput(2, events, Marshal.SizeOf<Input>());
        if (sent == 1) SendInput(1, [events[1]], Marshal.SizeOf<Input>());
        return sent == 2;
    }
    public void Dispose()
    {
        if (disposed) return;
        disposed = true; accepting = false; timer.Stop(); recording = null;
        if (keyboardHook != 0) UnhookWindowsHookEx(keyboardHook);
        if (mouseHook != 0) UnhookWindowsHookEx(mouseHook);
        keyboardHook = mouseHook = 0; owned.Clear(); pressed.Clear();
        Gestures.Dispose();
    }
    private delegate nint HookCallback(int code, uint message, nint data);
    [StructLayout(LayoutKind.Sequential)] private struct KeyData { public uint Key, Scan, Flags, Time; public nuint Extra; }
    [StructLayout(LayoutKind.Sequential)] private struct MouseData { public GesturePoint Point; public uint Data, Flags, Time; public nuint Extra; }
    [StructLayout(LayoutKind.Sequential)] private struct Input { public uint Type; public InputUnion Data; }
    [StructLayout(LayoutKind.Explicit)] private struct InputUnion { [FieldOffset(0)] public KeyInput Keyboard; [FieldOffset(0)] public MouseInput Mouse; }
    [StructLayout(LayoutKind.Sequential)] private struct KeyInput { public ushort Key, Scan; public uint Flags, Time; public nuint Extra; }
    [StructLayout(LayoutKind.Sequential)] private struct MouseInput { public int X, Y; public uint Data, Flags, Time; public nuint Extra; }
    [DllImport("user32.dll", SetLastError = true)] private static extern nint SetWindowsHookEx(int kind, HookCallback callback, nint module, uint thread);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(nint hook);
    [DllImport("user32.dll")] private static extern nint CallNextHookEx(nint hook, int code, uint message, nint data);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern nint GetModuleHandle(string? name);
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint process);
    [DllImport("user32.dll")] private static extern nint GetKeyboardLayout(uint thread);
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, Input[] inputs, int size);
}
