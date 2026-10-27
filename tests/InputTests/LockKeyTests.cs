using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Threading;

internal static partial class Program
{
    // Exercise the native codec and hook handler using memory-only events.
    // Do not install hooks, send OS input, pump messages or change toggle state.
    private static int RunLockKeyTests(string assemblyPath)
    {
        const BindingFlags members = BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
        object? engine = null;
        try {
            var assembly = Assembly.LoadFrom(Path.GetFullPath(assemblyPath));
            var codec = assembly.GetType("AppDock.InputHost.ShortcutCodec", true)!;
            var parse = codec.GetMethod("Parse", members)!;
            var format = codec.GetMethod("Format", members)!;
            var keys = new[] { (0x13u, "Pause"), (0x14u, "CapsLock"), (0x91u, "ScrollLock"),
                (0xF0u, "Alphanumeric"), (0x15u, "KanaMode"), (0x1Cu, "Convert"), (0x1Du, "NonConvert") };
            var checks = 0;
            void Check(bool condition, string title) {
                if (!condition) throw new Exception(title);
                checks++; Console.WriteLine("PASS " + title);
            }
            foreach (var (key, name) in keys) {
                for (var modifiers = 0; modifiers < 16; modifiers++) {
                    var shortcut = ((modifiers & 1) != 0 ? "Ctrl+" : "") + ((modifiers & 2) != 0 ? "Alt+" : "") +
                        ((modifiers & 4) != 0 ? "Shift+" : "") + ((modifiers & 8) != 0 ? "Win+" : "") + name;
                    var chord = parse.Invoke(null, [shortcut, nint.Zero])!;
                    Check((uint)chord.GetType().GetProperty("Key")!.GetValue(chord)! == key &&
                        (int)chord.GetType().GetProperty("Modifiers")!.GetValue(chord)! == modifiers &&
                        (string?)format.Invoke(null, [key, modifiers, nint.Zero]) == shortcut,
                        shortcut + " native codec round trip");
                }
            }
            if (new[] { 0x10, 0x11, 0x12, 0x5B, 0x5C }.Any(key => (GetAsyncKeyState(key) & 0x8000) != 0))
                throw new Exception("Release modifier keys before running the memory-only fixture.");
            var type = assembly.GetType("AppDock.InputHost.InputCaptureEngine", true)!;
            var notices = new List<(string Method, JsonElement Payload)>();
            engine = Activator.CreateInstance(type, members, null,
                [Dispatcher.CurrentDispatcher, null, new Func<string, object, bool>((method, payload) => {
                    notices.Add((method, JsonSerializer.SerializeToElement(payload))); return true;
                })], null)!;
            ((DispatcherTimer)type.GetField("timer", members)!.GetValue(engine)!).Stop();
            void Set(string field, object? value) => type.GetField(field, members)!.SetValue(engine, value);
            object Decode(string name, object value) {
                var target = assembly.GetType("AppDock.InputHost." + (name.EndsWith("[]") ? name[..^2] : name), true)!;
                if (name.EndsWith("[]")) target = target.MakeArrayType();
                return JsonSerializer.Deserialize(JsonSerializer.Serialize(value), target,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            }
            Set("configuration", Decode("CaptureConfiguration", new {
                gestures = new { }, shortcuts = Array.Empty<object>(), shortcutRevision = 7,
                hostProcessId = 0, context = "lock-key-fixture",
            }));
            var owned = (Dictionary<uint, bool>)type.GetField("owned", members)!.GetValue(engine)!;
            var pressed = (HashSet<uint>)type.GetField("pressed", members)!.GetValue(engine)!;
            var pending = type.GetField("pendingPresses", members)!.GetValue(engine)!;
            void ClearPending() => pending.GetType().GetMethod("Clear")!.Invoke(pending, null);
            var keyboard = type.GetMethod("Keyboard", members)!;
            nint Feed(uint key, bool up = false, uint scan = 0, uint flags = 0) {
                var pointer = Marshal.AllocHGlobal(Marshal.SizeOf<GestureTestKeyData>());
                try {
                    Marshal.StructureToPtr(new GestureTestKeyData { Key = key, Scan = scan, Flags = flags | (up ? 0x80u : 0u) }, pointer, false);
                    return (nint)keyboard.Invoke(engine, [0, up ? 0x101u : 0x100u, pointer])!;
                } finally { Marshal.FreeHGlobal(pointer); }
            }
            foreach (var (key, name) in keys) {
                var pulse = key is 0x13 or 0x15 or 0xF0;
                foreach (var block in new[] { true, false }) {
                    owned.Clear(); pressed.Clear(); notices.Clear(); ClearPending();
                    Set("inputs", Decode("ShortcutInput[]", new[] { new { shortcut = name, blockOriginalInput = block } }));
                    var statuses = (Array)type.GetMethod("Compile", members)!.Invoke(engine, null)!;
                    Check((bool)statuses.GetValue(0)!.GetType().GetProperty("Registered")!.GetValue(statuses.GetValue(0))!, name + " compiles");
                    Set("accepting", true);
                    var result = Feed(key);
                    Check((!block || result == 1) && notices.Count(n => n.Method == "shortcuts.pressed") == 1 &&
                        notices.Single(n => n.Method == "shortcuts.pressed").Payload.GetProperty("Blocked").GetBoolean() == block &&
                        (pulse ? !owned.ContainsKey(key) && !pressed.Contains(key) :
                            owned.GetValueOrDefault(key) == block && owned.ContainsKey(key)), name + " dispatches with block=" + block);
                    Feed(key);
                    Check(notices.Count == (pulse ? 2 : 1), name + (pulse ? " next down-only pulse dispatches" : " held repeat does not dispatch again"));
                    Set("accepting", false);
                    var released = Feed(key, true);
                    Check((pulse || !block || released == 1) && !owned.ContainsKey(key) && !pressed.Contains(key), name + " release completes while capture is suspended");
                    Feed(key);
                    Check(notices.Count == (pulse ? 2 : 1), name + " synchronization defers immediate dispatch");
                    Feed(key, true);
                }
                notices.Clear(); pressed.Clear(); ClearPending();
                Set("recording", Decode("RecordingInput", new { token = "lock-record", window = GetForegroundWindow().ToString(), allowWin = false }));
                Check(Feed(key) == 1 && (pulse ? !owned.ContainsKey(key) && !pressed.Contains(key) : owned.GetValueOrDefault(key)), name + " recording captures down");
                var recorded = notices.Single(n => n.Method == "shortcuts.recorded").Payload;
                Check(recorded.GetProperty("key").GetString() == name && recorded.GetProperty("token").GetString() == "lock-record", name + " recording keeps canonical key and token");
                Feed(key); Feed(key, true);
                Check(notices.Count == (pulse ? 2 : 1) && notices.All(n => n.Method == "shortcuts.recorded") && !owned.ContainsKey(key),
                    name + (pulse ? " records independent pulses without executing" : " recording consumes repeat and paired release without executing"));
                Set("recording", null);
            }
            owned.Clear(); pressed.Clear(); notices.Clear(); ClearPending();
            Set("inputs", Decode("ShortcutInput[]", new[] { new { shortcut = "Alphanumeric", blockOriginalInput = true } }));
            type.GetMethod("Compile", members)!.Invoke(engine, null);
            Set("accepting", true);
            Feed(0xF0, scan: 0x3A);
            Feed(0xF2, up: true, scan: 0x3A);
            Feed(0xF0, scan: 0x3A);
            Check(notices.Count(n => n.Method == "shortcuts.pressed") == 2,
                "Alphanumeric down-only presses both dispatch after an unmatched IME release");
            Feed(0xF0, scan: 0x3A);
            Check(notices.Count(n => n.Method == "shortcuts.pressed") == 3 && !owned.ContainsKey(0xF0) && !pressed.Contains(0xF0),
                "consecutive Alphanumeric pulses without any release remain usable");
            Feed(0xF0, up: true, scan: 0x70);
            Check(notices.Count(n => n.Method == "shortcuts.pressed") == 3 && !owned.ContainsKey(0xF0),
                "optional IME Alphanumeric release does not execute a command");
            pressed.Add(0xF0);
            Feed(0xF0, scan: 0x3A);
            Check(notices.Count(n => n.Method == "shortcuts.pressed") == 4 && !pressed.Contains(0xF0),
                "IME mode state does not suppress a new Alphanumeric pulse");
            owned.Clear(); pressed.Clear(); notices.Clear(); ClearPending();
            Set("inputs", Decode("ShortcutInput[]", new[] { new { shortcut = "KanaMode", blockOriginalInput = true } }));
            type.GetMethod("Compile", members)!.Invoke(engine, null);
            Set("accepting", true);
            var captureKey = codec.GetMethod("CaptureKey", members)!;
            foreach (var raw in new uint[] { 0xF0, 0xF1, 0xF2, 0xF5, 0xF6 }) {
                Check((uint)captureKey.Invoke(null, [raw, 0x70u, 0u])! == 0x15,
                    $"KanaMode position maps IME code {raw:X2}");
                Check((uint)captureKey.Invoke(null, [raw, 0x3Au, 0u])! == raw &&
                    (uint)captureKey.Invoke(null, [raw, 0x70u, 1u])! == raw,
                    $"IME code {raw:X2} outside the KanaMode position is unchanged");
            }
            // These transitions can release the old mode immediately before the new down.
            var kanaEvents = new[] { (0xF0u, true), (0xF2u, false), (0xF2u, false),
                (0xF2u, true), (0xF1u, false), (0xF1u, false),
                (0xF5u, true), (0xF6u, false), (0xF6u, true), (0xF5u, false) };
            var kanaDowns = 0;
            foreach (var (key, up) in kanaEvents) {
                var result = Feed(key, up, scan: 0x70);
                if (!up) kanaDowns++;
                Check((up || result == 1) && notices.Count(n => n.Method == "shortcuts.pressed") == kanaDowns &&
                    notices.Where(n => n.Method == "shortcuts.pressed").All(n =>
                        n.Payload.GetProperty("Shortcuts").EnumerateArray().Single().GetString() == "KanaMode") &&
                    !pressed.Contains(0x15) && !owned.ContainsKey(0x15),
                    $"KanaMode transition {key:X2}/{up} keeps one dispatch per down without a latch");
            }
            Feed(0xF0, scan: 0x3A);
            Feed(0x41, scan: 0x70);
            Feed(0xF2, scan: 0x70, flags: 1);
            Check(notices.Count(n => n.Method == "shortcuts.pressed") == kanaDowns,
                "Alphanumeric, remapped ordinary keys and extended scans do not execute KanaMode");
            foreach (var (raw, scan, canonical, name, modifiers, shortcut) in new[] {
                (0x03u, 0x46u, 0x91u, "ScrollLock", 1, "Ctrl+ScrollLock"),
                (0xF7u, 0x7Bu, 0x1Du, "NonConvert", 3, "Ctrl+Alt+NonConvert") }) {
                Check((uint)captureKey.Invoke(null, [raw, scan, 0u])! == canonical &&
                    (uint)captureKey.Invoke(null, [raw, scan, 0x80u])! == canonical,
                    name + " physical position maps derived down and up");
                Check((uint)captureKey.Invoke(null, [raw, 0u, 0u])! == raw &&
                    (uint)captureKey.Invoke(null, [raw, scan, 1u])! == raw &&
                    (uint)captureKey.Invoke(null, [0x41u, scan, 0u])! == 0x41,
                    name + " mapping excludes other positions, extended keys and ordinary remaps");
                Check((string?)format.Invoke(null, [canonical, modifiers, nint.Zero]) == shortcut,
                    name + " derived code retains shortcut modifiers");
                foreach (var block in new[] { true, false }) {
                    owned.Clear(); pressed.Clear(); notices.Clear(); ClearPending();
                    Set("inputs", Decode("ShortcutInput[]", new[] { new { shortcut = name, blockOriginalInput = block } }));
                    type.GetMethod("Compile", members)!.Invoke(engine, null);
                    var captured = Feed(raw, scan: scan);
                    Check((!block || captured == 1) && notices.Count(n => n.Method == "shortcuts.pressed") == 1 &&
                        notices.Single(n => n.Method == "shortcuts.pressed").Payload.GetProperty("Shortcuts").EnumerateArray().Single().GetString() == name &&
                        owned.GetValueOrDefault(canonical) == block && !owned.ContainsKey(raw),
                        name + " derived down dispatches canonical key with block=" + block);
                    Feed(raw, scan: scan);
                    Check(notices.Count(n => n.Method == "shortcuts.pressed") == 1,
                        name + " derived repeat stays suppressed");
                    var released = Feed(raw, true, scan: scan);
                    Check((!block || released == 1) && !owned.ContainsKey(canonical) && !pressed.Contains(canonical),
                        name + " derived up clears canonical ownership");
                    Feed(raw, scan: scan); Feed(raw, true, scan: scan);
                    Check(notices.Count(n => n.Method == "shortcuts.pressed") == 2,
                        name + " derived next press remains usable");
                }
                owned.Clear(); pressed.Clear(); notices.Clear(); ClearPending();
                Set("recording", Decode("RecordingInput", new { token = "derived-record", window = GetForegroundWindow().ToString(), allowWin = false }));
                Check(Feed(raw, scan: scan) == 1 && notices.Single(n => n.Method == "shortcuts.recorded").Payload.GetProperty("key").GetString() == name,
                    name + " derived code records the canonical key");
                Feed(raw, true, scan: scan);
                Check(!owned.ContainsKey(canonical) && !pressed.Contains(canonical),
                    name + " recorded derived release leaves no latch");
                Set("recording", null);
            }
            Check(notices.All(n => n.Method != "input.error") &&
                (nint)type.GetField("keyboardHook", members)!.GetValue(engine)! == 0 &&
                (nint)type.GetField("mouseHook", members)!.GetValue(engine)! == 0,
                "no OS hooks were installed");
            Console.WriteLine($"Lock-key native checks: {checks}");
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error);
            return 1;
        } finally { (engine as IDisposable)?.Dispose(); }
    }
}
