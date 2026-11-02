using System.ComponentModel;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;
using System.Windows.Threading;

internal static partial class Program
{
    private const nuint OriginalKeyMarker = 0x765010, ReplayKeyMarker = 0x765011;
    private static void SendChainKey(ushort key, bool up = false, nuint marker = OriginalKeyMarker)
    {
        var input = new Input { Type = 1, Union = new() { Key = new() {
            Key = key, Extra = marker,
            Flags = (up ? 2u : 0) | (key is 0xA5 or 0x5B or 0x5C ? 1u : 0),
        } } };
        if (SendInput(1, [input], Marshal.SizeOf<Input>()) != 1)
            throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    private sealed class GrabModifier
    {
        internal ushort Key;
        internal bool Waiting;
        internal int Replays;
        internal bool Swallows(uint key, bool up) {
            if (key == Key && !up) { Waiting = true; return true; }
            if (!Waiting) return false;
            Waiting = false; Replays++;
            SendChainKey(Key, marker: ReplayKeyMarker);
            if (key == Key && Key is 0x5B or 0x5C) { SendChainKey(Key, true, ReplayKeyMarker); return true; }
            return false;
        }
    }
    // Start before the isolated GUI host. Only marked input from its guarded fixture is intercepted.
    private static int RunPaletteGrabHook()
    {
        var grab = new GrabModifier { Key = 0xA4 };
        MouseCallback callback = (code, message, pointer) => {
            if (code >= 0) {
                var data = Marshal.PtrToStructure<GestureTestKeyData>(pointer);
                if (data.Extra == OriginalKeyMarker) return grab.Swallows(data.Key, message is 0x101 or 0x105) ? 1 : 0;
                if (data.Extra == ReplayKeyMarker) return 0;
            }
            return CallNextHookEx(0, code, message, pointer);
        };
        var dispatcher = Dispatcher.CurrentDispatcher;
        var hook = SetWindowsHookEx(13, callback, GetModuleHandle(null), 0);
        if (hook == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
            Console.WriteLine("ready");
            _ = Task.Run(() => { Console.ReadLine(); dispatcher.BeginInvokeShutdown(DispatcherPriority.Send); });
            Dispatcher.Run();
            Console.WriteLine($"replays={grab.Replays}");
            return 0;
        } finally { UnhookWindowsHookEx(hook); GC.KeepAlive(callback); }
    }
    // Only fixture-tagged events enter the simulated grab hook and the real capture handler.
    // Other desktop input always chains untouched. Grab And Move ignores SendInput itself.
    private static int RunModifierHookChainTests(string assemblyPath, bool grabFirst, bool win)
    {
        const BindingFlags members = BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Public;
        using var window = new ModifierTestWindow { Text = "AppDock modifier hook fixture" };
        var initialWindow = GetForegroundWindow();
        var hooks = new List<(nint Handle, MouseCallback Callback)>();
        Dispatcher? grabDispatcher = null;
        Thread? grabThread = null;
        var modifier = new GrabModifier();
        bool modifierInUse = false;
        int peerDowns = 0, peerUps = 0;
        void Install(MouseCallback callback) {
            var hook = SetWindowsHookEx(13, callback, GetModuleHandle(null), 0);
            if (hook == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
            hooks.Add((hook, callback));
        }
        void InstallGrab(MouseCallback callback) {
            using var ready = new ManualResetEventSlim();
            int error = 0;
            grabThread = new Thread(() => {
                grabDispatcher = Dispatcher.CurrentDispatcher;
                var handle = SetWindowsHookEx(13, callback, GetModuleHandle(null), 0);
                if (handle == 0) error = Marshal.GetLastWin32Error();
                ready.Set();
                if (handle == 0) return;
                try { Dispatcher.Run(); }
                finally { UnhookWindowsHookEx(handle); GC.KeepAlive(callback); }
            }) { IsBackground = true };
            grabThread.SetApartmentState(ApartmentState.STA);
            grabThread.Start();
            var deadline = Environment.TickCount64 + 4000;
            while (!ready.IsSet && Environment.TickCount64 < deadline) { Application.DoEvents(); Thread.Sleep(2); }
            if (!ready.IsSet) throw new TimeoutException("Could not start the competing hook.");
            if (error != 0) throw new Win32Exception(error);
        }
        void Pump() { for (int i = 0; i < 12; i++) { Application.DoEvents(); Thread.Sleep(2); } }
        void Input(ushort key, bool up = false) {
            if (GetForegroundWindow() != window.Handle) throw new Exception("Fixture lost foreground.");
            // Keep both hook dispatchers pumping while a third thread supplies the original input.
            var sent = Task.Run(() => SendChainKey(key, up));
            var deadline = Environment.TickCount64 + 3000;
            while (!sent.IsCompleted && Environment.TickCount64 < deadline) { Application.DoEvents(); Thread.Sleep(2); }
            if (!sent.IsCompleted) throw new TimeoutException($"Fixture input {key:X2}/{up} did not complete.");
            sent.GetAwaiter().GetResult();
            Pump();
        }
        void Check(bool value, string label) {
            if (!value) throw new Exception(label + $" (peer down/up={peerDowns}/{peerUps}, replays={modifier.Replays}, receiver down/up={window.Downs}/{window.Ups}, menu={window.Menus})");
            Console.WriteLine("PASS " + label);
        }
        try {
            if (new[] { 0x10, 0x11, 0x12, 0x5B, 0x5C }.Any(k => (GetAsyncKeyState(k) & 0x8000) != 0))
                throw new Exception("Release the modifier keys before starting.");
            FocusTarget(window); Pump();
            var assembly = Assembly.LoadFrom(Path.GetFullPath(assemblyPath));
            var type = assembly.GetType("AppDock.InputHost.InputCaptureEngine", true)!;
            var notices = new List<string>();
            using var engine = (IDisposable)Activator.CreateInstance(type, members, null,
                [Dispatcher.CurrentDispatcher, null, new Func<string, object, bool>((method, payload) => {
                    if (method == "shortcuts.pressed") notices.Add(JsonSerializer.SerializeToElement(payload).GetProperty("Shortcuts")[0].GetString()!);
                    return true;
                })], null)!;
            void Set(string name, object value) => type.GetField(name, members)!.SetValue(engine, value);
            object Decode(string name, object value) => JsonSerializer.Deserialize(JsonSerializer.Serialize(value),
                assembly.GetType("AppDock.InputHost." + name, true)!, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            Set("configuration", Decode("CaptureConfiguration", new { gestures = new {}, shortcuts = Array.Empty<object>(),
                shortcutRevision = 1, hostProcessId = uint.MaxValue, context = "{}" }));
            Set("refreshQueued", true); // keep this snapshot; install only the tag-filtered hook below.
            var capture = type.GetMethod("Keyboard", members)!.CreateDelegate<MouseCallback>(engine);
            MouseCallback handler = (code, message, data) => code >= 0 && Marshal.PtrToStructure<GestureTestKeyData>(data).Extra is OriginalKeyMarker or ReplayKeyMarker
                ? capture(code, message, data) : CallNextHookEx(0, code, message, data);
            MouseCallback grab = (code, message, pointer) => {
                if (code < 0) return CallNextHookEx(0, code, message, pointer);
                var data = Marshal.PtrToStructure<GestureTestKeyData>(pointer);
                if (data.Extra != OriginalKeyMarker) return CallNextHookEx(0, code, message, pointer);
                bool up = message is 0x101 or 0x105;
                if (modifier.Swallows(data.Key, up)) return 1;
                if (data.Key == window.MainKey) { if (up) peerUps++; else peerDowns++; }
                return CallNextHookEx(0, code, message, pointer);
            };
            // A tagged event that passes both test hooks reaches the fixture window, bypassing live shortcuts.
            Install((code, msg, ptr) => code >= 0 && Marshal.PtrToStructure<GestureTestKeyData>(ptr).Extra is OriginalKeyMarker or ReplayKeyMarker
                ? 0 : CallNextHookEx(0, code, msg, ptr));
            if (grabFirst) { Install(handler); InstallGrab(grab); }
            else { InstallGrab(grab); Install(handler); }
            Console.WriteLine($"Registered both hook threads ({(grabFirst ? "grab" : "capture")} first).");
            foreach (ushort side in win ? new ushort[] { 0x5B, 0x5C } : new ushort[] { 0xA4, 0xA5 }) {
                modifier.Key = side;
                var prefix = win ? "Win+" : "Alt+";
                foreach (bool block in new[] { true, false }) {
                    // Win+C/V have shell actions; a leaking Win+F7/F9 can be counted in the receiver.
                    ushort first = window.MainKey = win ? (ushort)0x76 : (ushort)0x43;
                    ushort second = win ? (ushort)0x78 : (ushort)0x56;
                    string chord1 = prefix + (win ? "F7" : "C"), chord2 = prefix + (win ? "F9" : "V");
                    Set("inputs", Decode("ShortcutInput[]", new[] {
                        new { shortcut = chord1, blockOriginalInput = block },
                        new { shortcut = chord2, blockOriginalInput = block },
                        new { shortcut = "F8", blockOriginalInput = false },
                    }));
                    type.GetMethod("Compile", members)!.Invoke(engine, null);
                    Set("accepting", true);
                    var label = $"VK {side:X2}, block={block}";
                    notices.Clear(); peerDowns = peerUps = modifier.Replays = window.Downs = window.Ups = window.Menus = 0;
                    modifierInUse = true;
                    if (!win) {
                        Input(side); Input(side, true);
                        Check(modifier.Replays == 1 && window.Menus == 1 && (GetAsyncKeyState(side) & 0x8000) == 0,
                            label + " standalone Alt reaches the normal menu action once");
                        Input(side); Input(first); Input(first, true); Input(side, true);
                        Check(notices.SequenceEqual([chord1]), label + " Alt+C following a standalone Alt executes once");
                        Input(first); Input(first, true); Input(0x77); Input(0x77, true);
                        Check(notices.SequenceEqual([chord1, "F8"]) && window.Downs == (block ? 1 : 2) && (!block || window.Menus == 1),
                            label + " plain C after Alt tap and Alt+C reaches the receiver");
                        Input(side); Input(side, true); Input(first); Input(first, true); Input(first); Input(first, true);
                        Check(notices.SequenceEqual([chord1, "F8"]) && window.Downs == (block ? 3 : 4),
                            label + " plain C immediately after another standalone Alt passes");
                        notices.Clear(); peerDowns = peerUps = modifier.Replays = window.Downs = window.Ups = window.Menus = 0;
                    }
                    Input(side); Input(first); Input(first, true); Input(side, true);
                    Check(notices.SequenceEqual([chord1]) && window.Downs == (block ? 0 : 1),
                        label + " first chord executes once with the configured block");
                    Input(first); Input(first, true); Input(0x77); Input(0x77, true);
                    Check(notices.SequenceEqual([chord1, "F8"]) && window.Downs == (block ? 1 : 2) && (!block || window.Menus == 0),
                        label + " single gesture leaves plain input usable without Alt+Tab");
                    notices.Clear(); peerDowns = peerUps = modifier.Replays = window.Downs = window.Ups = 0;
                    Input(side); Input(first); Input(first); Input(first, true);
                    Input(second); Input(side, true); Input(second, true);
                    Check(notices.SequenceEqual([chord1, chord2]), label + " executes each held chord once");
                    Check(peerDowns == 2 && peerUps == 1 && modifier.Replays == 1 && !modifier.Waiting, label + " completes the downstream hold");
                    Check(window.Downs == (block ? 0 : 2) && window.Ups == (block ? 0 : 1), label + " delivers the configured pair to the window");
                    Check((GetAsyncKeyState(side) & 0x8000) == 0 && GetForegroundWindow() == window.Handle, label + " releases the modifier and retains foreground");
                    modifierInUse = false;
                    Input(first); Input(first, true); Input(0x77); Input(0x77, true);
                    Check(notices.SequenceEqual([chord1, chord2, "F8"]) && window.Downs == (block ? 1 : 3),
                        label + " plain main key and F8 work immediately after release");
                }
            }
            return 0;
        } catch (Exception e) { Console.Error.WriteLine(e); return 1; }
        finally {
            if (modifierInUse) {
                modifier.Waiting = false;
                SendChainKey(0xFF, marker: ReplayKeyMarker); SendChainKey(0xFF, true, ReplayKeyMarker); SendChainKey(modifier.Key, true, ReplayKeyMarker); Pump();
            }
            grabDispatcher?.BeginInvokeShutdown(DispatcherPriority.Send);
            grabThread?.Join(2000);
            for (int i = hooks.Count - 1; i >= 0; i--) UnhookWindowsHookEx(hooks[i].Handle);
            if (GetForegroundWindow() == window.Handle && initialWindow != 0) SetForegroundWindow(initialWindow);
        }
    }
    private sealed class ModifierTestWindow : Form
    {
        internal ushort MainKey;
        internal int Downs, Ups, Menus;
        protected override void WndProc(ref Message m) {
            // Count a leaked standalone Alt without entering the modal window menu in a failing run.
            if (m.Msg == 0x112 && (m.WParam.ToInt64() & 0xfff0) == 0xf100) { Menus++; return; }
            if (m.WParam == MainKey) {
                if (m.Msg is 0x100 or 0x104) Downs++;
                if (m.Msg is 0x101 or 0x105) Ups++;
            }
            base.WndProc(ref m);
        }
    }
}
