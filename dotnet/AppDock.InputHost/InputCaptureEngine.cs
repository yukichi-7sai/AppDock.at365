using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Threading;

namespace AppDock.InputHost;

internal sealed record RecordingInput(string Token, string Window, bool AllowWin = true);
internal sealed record CaptureConfiguration(Configuration Gestures, ShortcutInput[] Shortcuts,
    int ShortcutRevision, uint HostProcessId, string Context, RecordingInput? Recording = null,
    bool ShortcutsActive = true, string? DialogWindow = null, string[]? DialogShortcuts = null,
    bool AssistancePaused = false);
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
    private readonly WinEventCallback environmentCallback;
    private readonly DispatcherTimer timer;
    private readonly HashSet<uint> pressed = [];
    // Left/right Alt downs can precede Windows' Alt context. Use that evidence for the
    // first chord only: a release missed by this hook must not modify later plain keys.
    private int pendingAltSides;
    private readonly Dictionary<uint, bool> owned = [];
    private readonly Queue<ShortcutPressNotice> pendingPresses = [];
    private readonly Dictionary<ShortcutChord, List<ShortcutInput>> chords = [];
    private HashSet<ShortcutChord> dialogChords = [];
    private ShortcutInput[] inputs = [];
    private ShortcutInput[]? lookupInputs;
    private ShortcutLookup lookup = new([]);
    private CaptureConfiguration? configuration;
    private Dictionary<string, HashSet<string>> processPool = new(StringComparer.Ordinal);
    private RecordingInput? recording;
    private nint keyboardHook, mouseHook, layout, preparedLayout, foregroundHook, desktopHook;
    private bool disposed, accepting, monitoring, refreshQueued, layoutRefreshPending;
    private string? lostRecording, endedRecording;
    private uint recordingSince;
    private int? gestureRevision;
    private long pressId;
    private nint? foregroundWindow;
    private InputPaletteTarget? palette;
    // Committing a row releases the picker, not its original focus/foreground guard.
    private readonly Dictionary<string, InputPaletteTarget> confirmedPastes = new();
    internal InputPaletteTarget? ConfirmedTarget(string id) => confirmedPastes.GetValueOrDefault(id);
    internal InputPaletteTarget? OpenTarget(string id) => palette?.Session == id ? palette : null;
    private void ForgetSelection(InputPaletteTarget target, bool notifyHost = true)
    {
        target.Cancel();
        confirmedPastes.Remove(target.Session);
        if (notifyHost) notify("palette.key", new { session = target.Session, key = "cancel" });
    }
    private void ConfirmPalette()
    {
        var selection = palette!;
        confirmedPastes.Add(selection.Session, selection);
        palette = null;
        QueueRefresh();
    }
    internal object? PaletteRequest(string method, System.Text.Json.JsonElement p)
    {
        var id = p.GetProperty("session").GetString()!;
        if (method == "palette.capture") {
            DropPalette();
            palette = InputPaletteTarget.Capture(id, p.GetProperty("window").GetString()!);
            if (palette != null) {
                try { Reconcile(); UpdateTimer(); } catch { DropPalette(); throw; }
            }
            return palette == null ? null : new { x = palette.Anchor.X, y = palette.Anchor.Y, window = palette.WindowId };
        }
        if (confirmedPastes.TryGetValue(id, out var selection)) {
            if (method == "palette.close" || !selection.IsCurrent()) {
                ForgetSelection(selection, method != "palette.close");
                QueueRefresh();
                return false;
            }
            if (method == "palette.confirm") return true;
            if (method == "palette.append") { selection.Body.Append(p.GetProperty("text").GetString()); return true; }
            return false;
        }
        if (palette == null || palette.Session != id) return false;
        if (method == "palette.close") { DropPalette(); return true; }
        if (!palette.IsCurrent()) { DropPalette(); return false; }
        switch (method) {
            case "palette.show":
                palette.Popup = new nint(long.Parse(p.GetProperty("popup").GetString()!));
                try { Reconcile(); UpdateTimer(); } catch { DropPalette(); throw; }
                return true;
            case "palette.confirm":
                if (palette.Popup == 0) return false;
                ConfirmPalette();
                return true;
            default: throw new ArgumentException("Unknown palette operation.");
        }
    }
    private void DropPalette()
    {
        if (palette == null) return;
        var session = palette.Session;
        palette = null;
        notify("palette.key", new { session, key = "cancel" });
        QueueRefresh();
    }
    internal GestureEngine Gestures { get; }
    internal InputCaptureEngine(Dispatcher dispatcher, GestureIndicatorNotifications display, Func<string, object, bool> notify)
    {
        this.dispatcher = dispatcher; this.notify = notify;
        keyboardCallback = Keyboard; mouseCallback = Mouse;
        environmentCallback = EnvironmentChanged;
        Gestures = new GestureEngine(dispatcher, display);
        Gestures.HooksChanged = QueueRefresh;
        timer = new DispatcherTimer(DispatcherPriority.Background, dispatcher) { Interval = TimeSpan.FromSeconds(1) };
        timer.Tick += (_, _) => Refresh();
    }
    internal void StartMonitoring()
    {
        if (disposed || monitoring) return;
        monitoring = true;
        // Out-of-context callbacks run on this dispatcher's message loop; keep the delegate alive.
        foregroundHook = SetWinEventHook(3, 3, 0, environmentCallback, 0, 0, 0);
        desktopHook = SetWinEventHook(0x20, 0x20, 0, environmentCallback, 0, 0, 0);
        if (foregroundHook == 0 || desktopHook == 0)
            notify("input.error", new { message = "入力対象の変更通知を登録できません。1秒間隔の補助確認を使用します。" });
        Refresh();
    }
    private void EnvironmentChanged(nint hook, uint kind, nint window, int objectId, int child, uint thread, uint time)
    {
        if (disposed) return;
        // A release on another input desktop may never have reached this hook.
        if (kind == 0x20) { pendingAltSides = 0; pressed.Remove(0xA4); pressed.Remove(0xA5); }
        if (palette != null && unchecked((int)(time - palette.Since)) >= 0 &&
            (kind == 0x20 || kind == 3 && !palette.MatchesWindow(window))) DropPalette();
        if (confirmedPastes.Count != 0) {
            foreach (var pending in confirmedPastes.Values.Where(p => unchecked((int)(time - p.Since)) >= 0 &&
                         (kind == 0x20 || kind == 3 && !p.MatchesWindow(window))).ToArray())
                ForgetSelection(pending);
        }
        // Preserve a brief focus loss even when several events coalesce before the next refresh.
        if (recording != null && unchecked((int)(time - recordingSince)) >= 0 &&
            (kind == 0x20 || kind == 3 && recording.Window != window.ToInt64().ToString()))
            lostRecording = recording.Token;
        QueueRefresh();
    }
    private void QueueRefresh()
    {
        if (disposed || refreshQueued || dispatcher.HasShutdownStarted) return;
        refreshQueued = true;
        dispatcher.BeginInvoke(DispatcherPriority.Input, new Action(() => {
            refreshQueued = false;
            Refresh();
        }));
    }
    private void UpdateTimer()
    {
        var active = inputs.Length > 0 || recording != null || palette != null || confirmedPastes.Count != 0 || Gestures.NeedsKeyboard || Gestures.NeedsMouse;
        // Other processes do not send WM_INPUTLANGCHANGE to us. Only symbol bindings need this fallback.
        timer.IsEnabled = !disposed && monitoring && configuration?.AssistancePaused != true && ((inputs.Length > 0 && lookup.HasSymbols) ||
            (active && (foregroundHook == 0 || desktopHook == 0)));
    }
    internal ShortcutStatus[] Configure(CaptureConfiguration next)
    {
        var resumed = configuration?.AssistancePaused == true && !next.AssistancePaused;
        accepting = false;
        if (configuration?.ShortcutRevision != next.ShortcutRevision ||
            configuration?.Gestures.SettingsKey != next.Gestures.SettingsKey)
            processPool = new(StringComparer.Ordinal);
        var nextRecording = next.Recording?.Token == endedRecording ? null : next.Recording;
        if (configuration?.ShortcutRevision != next.ShortcutRevision || nextRecording != null || next.Shortcuts.Length == 0)
            pendingPresses.Clear();
        configuration = next;
        inputs = next.Shortcuts;
        if (recording?.Token != nextRecording?.Token) recordingSince = unchecked((uint)Environment.TickCount64);
        recording = nextRecording;
        foreach (var input in inputs) {
            CommandConditions.Prepare(input.Environment, processPool);
            foreach (var condition in input.Conditions ?? []) {
                CommandConditions.Prepare(condition.When, processPool);
                CommandConditions.Prepare(condition.StackConditions, processPool);
            }
        }
        if (gestureRevision != next.Gestures.Revision) {
            Gestures.Configure(next.Gestures, processPool);
            gestureRevision = next.Gestures.Revision;
        }
        var statuses = Compile();
        if (!next.ShortcutsActive) preparedLayout = layout;
        try {
            Reconcile();
            accepting = next.ShortcutsActive && (!lookup.HasSymbols || preparedLayout == layout);
            if (next.ShortcutsActive && !accepting)
                notify("shortcuts.applied", new { revision = next.ShortcutRevision, statuses });
            FlushPendingPresses();
        } catch (Exception error) {
            inputs = []; chords.Clear(); pendingPresses.Clear(); recording = null;
            Gestures.Configure(next.Gestures with { Enabled = false });
            gestureRevision = null;
            statuses = next.Shortcuts.Select(row => new ShortcutStatus(row.Shortcut, false, [],
                EffectiveBlockOriginalInput: row.BlockOriginalInput,
                Error: "入力フックを適用できません。権限とほかの入力ソフトを確認してください。")).ToArray();
            notify("input.error", new { message = "入力フックを適用できません。", code = error is Win32Exception win ? win.NativeErrorCode : 0 });
        }
        if (resumed) Refresh();
        else UpdateTimer();
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
        layoutRefreshPending = false;
        if (!ReferenceEquals(lookupInputs, inputs)) {
            lookup = new ShortcutLookup(inputs);
            lookupInputs = inputs;
        }
        lookup.Prepare(layout);
        dialogChords = (configuration?.DialogShortcuts ?? []).Select(key => ShortcutCodec.Parse(key, layout)).ToHashSet();
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
    private void Refresh()
    {
        if (disposed) return;
        try {
            var foreground = GetForegroundWindow();
            if (palette != null && !palette.IsCurrent()) DropPalette();
            if (confirmedPastes.Count != 0)
                foreach (var pending in confirmedPastes.Values.Where(p => !p.IsCurrent()).ToArray())
                    ForgetSelection(pending);
            if (foregroundWindow != foreground) {
                if (notify("capture.foreground", new { window = foreground.ToInt64().ToString() }))
                    foregroundWindow = foreground;
            }
            if (recording != null && (lostRecording == recording.Token || foreground.ToInt64().ToString() != recording.Window)) EndRecording();
            lostRecording = null;
            if (inputs.Length > 0 && lookup.HasSymbols && (layoutRefreshPending || layout != ForegroundLayout())) {
                accepting = false;
                var statuses = Compile();
                notify("shortcuts.applied", new { revision = configuration?.ShortcutRevision, statuses });
            }
            Reconcile();
            FlushPendingPresses();
        } catch {
            accepting = false; inputs = []; chords.Clear(); pendingPresses.Clear(); EndRecording();
            if (configuration != null) {
                Gestures.Configure(configuration.Gestures with { Enabled = false });
                gestureRevision = null;
                var statuses = configuration.Shortcuts.Select(row => new ShortcutStatus(row.Shortcut, false, [],
                    EffectiveBlockOriginalInput: row.BlockOriginalInput, Error: "入力フックを適用できません。設定を保存するか再試行してください。")).ToArray();
                notify("shortcuts.applied", new { revision = configuration.ShortcutRevision, statuses });
            }
            notify("input.error", new { message = "入力フックを適用できません。設定を保存するか再試行してください。" });
        }
        UpdateTimer();
    }
    private void Reconcile()
    {
        if (disposed) return;
        var needKeyboard = chords.Count > 0 || (inputs.Length > 0 && lookup.HasSymbols) || recording != null || owned.Count > 0 || Gestures.NeedsKeyboard;
        needKeyboard |= palette != null || confirmedPastes.Count != 0;
        var needMouse = recording != null || Gestures.NeedsMouse || palette != null || confirmedPastes.Count != 0;
        if (needKeyboard && keyboardHook == 0) {
            pressed.Clear();
            pendingAltSides = 0;
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
    private int Modifiers(uint current, bool up, uint flags, bool observedAlt)
    {
        // This callback precedes the OS asynchronous state update for the current key.
        bool Held(uint key) => key == current ? !up : (GetAsyncKeyState((int)key) & 0x8000) != 0;
        bool HeldAlt(uint key) => Held(key) || (recording != null && owned.ContainsKey(key) && pressed.Contains(key));
        return (Held(0xA2) || Held(0xA3) || Held(0x11) ? 1 : 0) |
            ((flags & 0x20) != 0 || observedAlt || HeldAlt(0xA4) || HeldAlt(0xA5) || Held(0x12) ? 2 : 0) |
            (Held(0xA0) || Held(0xA1) || Held(0x10) ? 4 : 0) |
            (Held(0x5B) || Held(0x5C) ? 8 : 0);
    }
    private nint Keyboard(int code, uint message, nint pointer)
    {
        if (code < 0 || disposed) return CallNextHookEx(keyboardHook, code, message, pointer);
        var data = Marshal.PtrToStructure<KeyData>(pointer);
        if (data.Extra == GestureEngine.InputMarker) return CallNextHookEx(keyboardHook, code, message, pointer);
        data.Key = ShortcutCodec.CaptureKey(data.Key, data.Scan, data.Flags);
        if (data.Key == 0x12) data.Key = (data.Flags & 1) == 0 ? 0xA4u : 0xA5u;
        var up = message is 0x101 or 0x105;
        var pulse = ShortcutCodec.IsPulse(data.Key);
        var repeat = !up && !pulse && !pressed.Add(data.Key);
        if (up || pulse) pressed.Remove(data.Key);
        int altSide = data.Key switch { 0xA4 => 1, 0xA5 => 2, _ => 0 };
        if (up) pendingAltSides &= ~altSide;
        else if (!repeat) pendingAltSides |= altSide;
        bool auxiliary = ShortcutCodec.IsModifier(data.Key) ||
            ((data.Flags & 0x10) != 0 && data.Key is 0xE8 or 0xFF); // injected menu masks
        bool observedAlt = pendingAltSides != 0;
        if (!up && !auxiliary) pendingAltSides = 0;
        bool? blockDecision = null;
        try {
            if (owned.TryGetValue(data.Key, out var blocked)) {
                if (up) { owned.Remove(data.Key); if (owned.Count == 0) QueueRefresh(); }
                return blocked ? 1 : CallNextHookEx(keyboardHook, code, message, pointer);
            }
            // LLKHF_ALTDOWN describes this event, including when the asynchronous Alt state is not visible.
            var modifiers = Modifiers(data.Key, up, data.Flags, observedAlt);
            if (!up && !auxiliary && (modifiers & 2) == 0) {
                // The hook can also have missed the up used for repeat detection.
                pressed.Remove(0xA4); pressed.Remove(0xA5);
            }
            if (palette != null && !up && !repeat && !auxiliary) {
                var key = data.Key switch { 38 => "up", 40 => "down", 13 => "choose", 27 => "cancel", _ => null };
                if (key != null && modifiers == 0 && palette.IsCurrent()) {
                    owned[data.Key] = true;
                    if (key == "cancel") DropPalette();
                    else {
                        var session = palette.Session;
                        if (key == "choose") ConfirmPalette();
                        notify("palette.key", new { session, key });
                    }
                    return 1;
                }
                DropPalette();
            }
            var chord = new ShortcutChord(data.Key, modifiers);
            IEnumerable<ShortcutInput> connected = chords.GetValueOrDefault(chord) ?? [];
            if (!up && !repeat && inputs.Length > 0 && lookup.HasSymbols) {
                var currentLayout = ForegroundLayout();
                if (layout != currentLayout) {
                    accepting = false;
                    layoutRefreshPending = true;
                    connected = lookup.Match(chord, currentLayout);
                    QueueRefresh();
                }
            }
            var touchpad = connected.Any(ActiveTouchpad);
            var capturedWindow = GetForegroundWindow();
            if (recording != null && (lostRecording == recording.Token || capturedWindow.ToInt64().ToString() != recording.Window))
                EndRecording();
            if (recording != null && !touchpad) {
                if (data.Key == 27 || (data.Key == 9 && (modifiers & ~4) == 0)) EndRecording();
                else if (!up && !repeat && data.Key is 0xA4 or 0xA5) {
                    // Keep the menu from taking focus before the recorder sees the rest of the chord.
                    owned[data.Key] = true;
                    return 1;
                }
                else if (!up && !repeat && !ShortcutCodec.Protected(chord) && (recording.AllowWin || (modifiers & 8) == 0)) {
                    var key = ShortcutCodec.Format(data.Key, modifiers, ForegroundLayout());
                    if (key != null && notify("shortcuts.recorded", new { token = recording.Token, key })) {
                        if (!pulse) owned[data.Key] = true;
                        blockDecision = true;
                        MaskBlockedModifier(modifiers);
                        return 1;
                    }
                }
                return CallNextHookEx(keyboardHook, code, message, pointer);
            }
            if (DialogOwns(chord, capturedWindow))
                return CallNextHookEx(keyboardHook, code, message, pointer);
            if (Gestures.Keyboard(code, message, pointer) != 0) {
                // A right-button gesture owns its captured modifier until release.
                if (altSide != 0) { pendingAltSides &= ~altSide; pressed.Remove(data.Key); }
                return 1;
            }
            if (up || repeat || configuration == null || !connected.Any())
                return CallNextHookEx(keyboardHook, code, message, pointer);
            // A click can immediately re-arm the same field. Until the host acknowledges the end,
            // leave that window's input alone, but handle the first key in another app right here.
            if (!touchpad && configuration.Recording is { } recorder && recorder.Window == capturedWindow.ToInt64().ToString())
                return CallNextHookEx(keyboardHook, code, message, pointer);
            var rows = connected.Where(row => row.Owner == null || (row.Owner.StartsWith("touchpad:", StringComparison.Ordinal) && TouchpadInputLease.Accepts(row.TouchpadGeneration))).ToList();
            if (rows.Count == 0) return CallNextHookEx(keyboardHook, code, message, pointer);
            var target = rows.Any(row => row.Owner != null || row.Conditions is {Length:>0}) ? CommandTargetCapture.Capture(capturedWindow) : null;
            // A local binding sharing this key still dispatches through the native owner, without blocking ordinary input.
            GetWindowThreadProcessId(capturedWindow, out var foregroundProcess);
            var local = capturedWindow != 0 && foregroundProcess == configuration.HostProcessId;
            var context = new CommandContext(CommandConditions.HostContextForWindow(configuration.Context, capturedWindow.ToInt64().ToString()), target);
            var matched = rows.Select(row => new {
                Row = row,
                Conditions = row.Conditions?.Where(c => CommandConditions.Matches(c.When, context, environment: row.Environment) && CommandConditions.MatchesStack(c.StackConditions, context, row.Environment)).ToArray()
            }).Where(item => item.Conditions == null || item.Conditions.Length > 0 || local).ToArray();
            if (matched.Length == 0) return CallNextHookEx(keyboardHook, code, message, pointer);
            var block = matched.Any(item => item.Conditions == null ? item.Row.BlockOriginalInput : item.Conditions.Any(c => c.BlockOriginalInput));
            blockDecision = block;
            // Own both halves before notification or synchronization can fail.
            if (!pulse) owned[data.Key] = block;
            if (block) MaskBlockedModifier(modifiers);
            var window = capturedWindow.ToInt64().ToString();
            var press = new ShortcutPressNotice(configuration.ShortcutRevision, ++pressId,
                matched.Select(item => item.Row.Shortcut).Distinct().ToArray(), block, window, configuration.Context,
                configuration.HostProcessId, target);
            // A passed-through key may already reach a local handler before ownership is acknowledged.
            // A blocked key cannot reach it, so retain that press until synchronization completes.
            if (accepting || block) pendingPresses.Enqueue(press);
            FlushPendingPresses();
            return block ? 1 : CallNextHookEx(keyboardHook, code, message, pointer);
        } catch {
            try { notify("input.error", new { message = "入力の通知に失敗しました。確定済みの元入力ブロックは維持します。" }); } catch { }
            return blockDecision == true ? 1 : CallNextHookEx(keyboardHook, code, message, pointer);
        }
    }
    private void FlushPendingPresses()
    {
        while (accepting && pendingPresses.TryPeek(out var press)) {
            if (configuration == null ||
                (recording != null && !inputs.Any(input => press.Shortcuts.Contains(input.Shortcut) && ActiveTouchpad(input))) ||
                press.Revision != configuration.ShortcutRevision) {
                pendingPresses.Dequeue(); continue;
            }
            try {
                if (!notify("shortcuts.pressed", press)) break;
            } catch {
                // Delivery is unknown after an exception; never replay it automatically.
                pendingPresses.Dequeue(); throw;
            }
            pendingPresses.Dequeue();
        }
    }
    private static bool ActiveTouchpad(ShortcutInput input) =>
        input.Owner?.StartsWith("touchpad:", StringComparison.Ordinal) == true && TouchpadInputLease.Accepts(input.TouchpadGeneration);
    private bool DialogOwns(ShortcutChord chord, nint window)
    {
        if (!dialogChords.Contains(chord) || configuration == null) return false;
        if (configuration.DialogWindow == window.ToInt64().ToString()) return true;
        GetWindowThreadProcessId(window, out var owner);
        if (owner != configuration.HostProcessId) return false;
        var name = new StringBuilder(64);
        return GetClassName(window, name, name.Capacity) > 0 && name.ToString() == "#32770";
    }
    private nint Mouse(int code, uint message, nint pointer)
    {
        if (code < 0 || disposed) return CallNextHookEx(mouseHook, code, message, pointer);
        var data = Marshal.PtrToStructure<MouseData>(pointer);
        if (message is (0x201 or 0x204 or 0x207 or 0x20B) && palette?.PointerInside(data.Point) != true) {
            if (confirmedPastes.Count != 0 && !confirmedPastes.Values.Any(p => p.PointerInside(data.Point))) {
                foreach (var item in confirmedPastes.Values.ToArray()) ForgetSelection(item);
                QueueRefresh();
            }
            if (palette != null) DropPalette();
        }
        if (data.Extra == GestureEngine.InputMarker) return CallNextHookEx(mouseHook, code, message, pointer);
        if (recording != null && message is 0x201 or 0x204 or 0x207 or 0x20B) EndRecording();
        return Gestures.Mouse(code, message, pointer) != 0 ? 1 : CallNextHookEx(mouseHook, code, message, pointer);
    }
    private void EndRecording()
    {
        var previous = recording;
        recording = null;
        if (previous != null) {
            endedRecording = previous.Token;
            QueueRefresh();
            notify("shortcuts.recordEnded", new { token = previous.Token });
        }
    }
    private bool RecordingOwnsAlt => owned.ContainsKey(0xA4) || owned.ContainsKey(0xA5);
    private void MaskBlockedModifier(int modifiers)
    {
        if (RecordingOwnsAlt) modifiers &= ~2;
        if ((modifiers & (2 | 8)) == 0) return;
        var events = new[] {
            new Input { Type = 1, Data = new InputUnion { Keyboard = new KeyInput { Key = 0xFF, Extra = GestureEngine.InputMarker } } },
            new Input { Type = 1, Data = new InputUnion { Keyboard = new KeyInput { Key = 0xFF, Flags = 2, Extra = GestureEngine.InputMarker } } }
        };
        var sent = SendInput(2, events, Marshal.SizeOf<Input>());
        if (sent == 1) SendInput(1, [events[1]], Marshal.SizeOf<Input>());
        if (sent != 2) notify("input.error", new { message = "修飾キーの単独動作を抑止できませんでした。元キーのブロックは維持します。" });
    }
    public void Dispose()
    {
        if (disposed) return;
        disposed = true; accepting = false; timer.Stop(); recording = null;
        foreach (var item in confirmedPastes.Values) item.Cancel();
        confirmedPastes.Clear();
        if (foregroundHook != 0) UnhookWinEvent(foregroundHook);
        if (desktopHook != 0) UnhookWinEvent(desktopHook);
        foregroundHook = desktopHook = 0;
        if (keyboardHook != 0) UnhookWindowsHookEx(keyboardHook);
        if (mouseHook != 0) UnhookWindowsHookEx(mouseHook);
        keyboardHook = mouseHook = 0; owned.Clear(); pressed.Clear(); pendingPresses.Clear();
        Gestures.Dispose();
    }
    private delegate nint HookCallback(int code, uint message, nint data);
    private delegate void WinEventCallback(nint hook, uint kind, nint window, int objectId, int child, uint thread, uint time);
    [DllImport("user32.dll")] private static extern nint SetWinEventHook(uint first, uint last, nint module, WinEventCallback callback, uint process, uint thread, uint flags);
    [DllImport("user32.dll")] private static extern bool UnhookWinEvent(nint hook);
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
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(nint window, StringBuilder name, int capacity);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint process);
    [DllImport("user32.dll")] private static extern nint GetKeyboardLayout(uint thread);
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, Input[] inputs, int size);
}
