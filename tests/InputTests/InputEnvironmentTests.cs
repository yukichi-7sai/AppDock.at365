using System.Collections;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Threading;

internal static partial class Program
{
    // Memory-only keyboard events; the only real registration below is a WinEvent observer.
    // No OS key input, keyboard/mouse hooks or input-language changes are made.
    private static int RunInputEnvironmentTests(string assemblyPath)
    {
        const BindingFlags members = BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
        object? engine = null;
        var checks = 0;
        try {
            var assembly = Assembly.LoadFrom(Path.GetFullPath(assemblyPath));
            var type = assembly.GetType("AppDock.InputHost.InputCaptureEngine", true)!;
            var codec = assembly.GetType("AppDock.InputHost.ShortcutCodec", true)!;
            var notices = new List<(string Method, JsonElement Payload)>();
            engine = Activator.CreateInstance(type, members, null,
                [Dispatcher.CurrentDispatcher, null, new Func<string, object, bool>((method, payload) => {
                    notices.Add((method, JsonSerializer.SerializeToElement(payload))); return true;
                })], null)!;
            object Get(string name) => type.GetField(name, members)!.GetValue(engine)!;
            void Set(string name, object? value) => type.GetField(name, members)!.SetValue(engine, value);
            object? Invoke(string name, params object[] args) => type.GetMethod(name, members)!.Invoke(engine, args);
            object Decode(string name, object value) {
                var array = name.EndsWith("[]");
                var target = assembly.GetType("AppDock.InputHost." + (array ? name[..^2] : name), true)!;
                return JsonSerializer.Deserialize(JsonSerializer.Serialize(value), array ? target.MakeArrayType() : target,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            }
            void Check(bool condition, string label) {
                if (!condition) throw new Exception(label);
                checks++; Console.WriteLine("PASS " + label);
            }
            void Inputs(params object[] rows) { Set("inputs", Decode("ShortcutInput[]", rows)); Invoke("Compile"); }
            void RefreshWithoutInputHooks() {
                // Invalid sentinels prevent Reconcile from installing hooks in a memory-only fixture.
                Set("keyboardHook", new nint(-1)); Set("mouseHook", new nint(-1));
                try { Invoke("Refresh"); }
                finally { Set("keyboardHook", nint.Zero); Set("mouseHook", nint.Zero); }
            }
            var timer = (DispatcherTimer)Get("timer");
            Check(!timer.IsEnabled, "construction starts no periodic work or native observation");
            Invoke("StartMonitoring");
            var foregroundHook = (nint)Get("foregroundHook");
            var desktopHook = (nint)Get("desktopHook");
            Check(foregroundHook != 0 && desktopHook != 0, "foreground and desktop WinEvent notifications register on the input dispatcher");
            Check(!timer.IsEnabled && notices.Count(n => n.Method == "capture.foreground") == 1,
                "initial foreground snapshot runs once without an idle timer");
            Invoke("Refresh"); Invoke("StartMonitoring");
            Check(notices.Count(n => n.Method == "capture.foreground") == 1, "unchanged foreground and repeated start do not duplicate notifications");
            Inputs(new { shortcut = "ScrollLock" }); Invoke("UpdateTimer");
            Check(!timer.IsEnabled, "layout-independent shortcuts need no fallback timer");
            Set("foregroundHook", nint.Zero); Invoke("UpdateTimer");
            Check(timer.IsEnabled && timer.Interval == TimeSpan.FromSeconds(1), "failed foreground observation enables a one-second fallback only while input is needed");
            Set("foregroundHook", foregroundHook); Invoke("UpdateTimer");
            Inputs(new { shortcut = ";" }); Invoke("UpdateTimer");
            Check(timer.IsEnabled && timer.Interval == TimeSpan.FromSeconds(1), "symbol shortcuts use the slow layout fallback");
            Inputs(); Invoke("UpdateTimer");
            Check(!timer.IsEnabled, "removing the last input stops the fallback");
            Check((nint)Get("keyboardHook") == 0 && (nint)Get("mouseHook") == 0, "monitoring and compilation have installed no keyboard or mouse hooks");

            // Simulate focus-away/focus-back events before the coalesced refresh can run.
            var window = EnvironmentNative.GetForegroundWindow().ToInt64().ToString();
            Set("recording", Decode("RecordingInput", new { token = "brief-focus", window }));
            Set("recordingSince", 100u);
            Invoke("EnvironmentChanged", nint.Zero, 3u, new nint(-1), 0, 0, 0u, 99u);
            Check(type.GetField("lostRecording", members)!.GetValue(engine) == null,
                "delayed foreground event from before recording does not cancel the new recording");
            Invoke("EnvironmentChanged", nint.Zero, 3u, new nint(-1), 0, 0, 0u, 101u);
            Invoke("EnvironmentChanged", nint.Zero, 3u, EnvironmentNative.GetForegroundWindow(), 0, 0, 0u, 102u);
            Check((bool)Get("refreshQueued"), "foreground bursts coalesce to a pending dispatcher refresh");
            Invoke("Refresh");
            Check(type.GetField("recording", members)!.GetValue(engine) == null &&
                notices.Count(n => n.Method == "shortcuts.recordEnded" && n.Payload.GetProperty("token").GetString() == "brief-focus") == 1,
                "brief focus loss ends recording even if focus returns before refresh");
            Set("recording", Decode("RecordingInput", new { token = "wrapped-clock", window }));
            Set("recordingSince", uint.MaxValue - 2);
            Invoke("EnvironmentChanged", nint.Zero, 3u, new nint(-1), 0, 0, 0u, 1u);
            Invoke("Refresh");
            Check(notices.Count(n => n.Method == "shortcuts.recordEnded" && n.Payload.GetProperty("token").GetString() == "wrapped-clock") == 1,
                "recording cancellation remains ordered across the WinEvent timestamp wrap");
            Set("recording", Decode("RecordingInput", new { token = "desktop-cycle", window }));
            Set("recordingSince", 100u);
            Invoke("EnvironmentChanged", nint.Zero, 0x20u, nint.Zero, 0, 0, 0u, 101u);
            Invoke("EnvironmentChanged", nint.Zero, 0x20u, nint.Zero, 0, 0, 0u, 102u);
            RefreshWithoutInputHooks();
            Check(type.GetField("recording", members)!.GetValue(engine) == null &&
                notices.Count(n => n.Method == "shortcuts.recordEnded" && n.Payload.GetProperty("token").GetString() == "desktop-cycle") == 1,
                "desktop switch ends recording even if the same foreground window returns before refresh");

            // A layout changed before its WinEvent/fallback update. Exercise its first stroke directly.
            Set("configuration", Decode("CaptureConfiguration", new {
                gestures = new { }, shortcuts = Array.Empty<object>(), shortcutRevision = 17,
                hostProcessId = uint.MaxValue, context = "{}",
            }));
            var currentLayout = (nint)Invoke("ForegroundLayout")!;
            string? symbol = null; uint key = 0;
            foreach (var candidate in new[] { ";", ",", ".", "/", "\\", "[", "]", "'", "=", "-" }) {
                try {
                    var chord = codec.GetMethod("Parse", members)!.Invoke(null, [candidate, currentLayout])!;
                    if ((int)chord.GetType().GetProperty("Modifiers")!.GetValue(chord)! != 0) continue;
                    key = (uint)chord.GetType().GetProperty("Key")!.GetValue(chord)!;
                    symbol = candidate; break;
                } catch (TargetInvocationException error) when (error.InnerException is ArgumentException) { }
            }
            Check(symbol != null, "current layout provides an unmodified punctuation fixture");
            Inputs(new { shortcut = symbol, blockOriginalInput = true });
            var lookup = Get("lookup");
            ((IDictionary)lookup.GetType().GetField("layouts", members)!.GetValue(lookup)!).Clear();
            Set("layout", nint.Zero); Set("preparedLayout", nint.Zero); Set("accepting", true);
            var owned = (Dictionary<uint, bool>)Get("owned");
            nint Feed(bool up) {
                var pointer = Marshal.AllocHGlobal(Marshal.SizeOf<GestureTestKeyData>());
                try {
                    Marshal.StructureToPtr(new GestureTestKeyData { Key = key, Flags = up ? 0x80u : 0u }, pointer, false);
                    return (nint)Invoke("Keyboard", 0, up ? 0x101u : 0x100u, pointer)!;
                } finally { Marshal.FreeHGlobal(pointer); }
            }
            Check(Feed(false) == 1 && owned.GetValueOrDefault(key), "first stroke in an uncached layout blocks using current symbol mapping");
            Check(!(bool)Get("accepting") && ((ICollection)Get("pendingPresses")).Count == 1 &&
                notices.All(n => n.Method != "shortcuts.pressed"), "first blocked stroke waits for ownership acknowledgment");
            Check(Feed(true) == 1 && owned.Count == 0 && (bool)Get("refreshQueued"),
                "held release preserves its block across a layout change and schedules hook reconciliation");
            Set("accepting", true); Invoke("FlushPendingPresses");
            Check(notices.Count(n => n.Method == "shortcuts.pressed") == 1,
                "acknowledgment delivers the captured first stroke exactly once");
            Invoke("FlushPendingPresses");
            Check(notices.Count(n => n.Method == "shortcuts.pressed") == 1, "completed delivery is never replayed");
            Set("layout", currentLayout);
            Check(Feed(false) == 1, "another stroke remains recognized after the layout is applied");
            Inputs();
            Check(Feed(true) == 1 && owned.Count == 0,
                "removing the binding while held still blocks its release");
            Inputs(new { shortcut = symbol, blockOriginalInput = true });
            Set("inputs", Decode("ShortcutInput[]", Array.Empty<object>()));
            ((IDictionary)Get("chords")).Clear();
            Set("layout", nint.Zero);
            Check(Feed(false) == 0 && Feed(true) == 0 && owned.Count == 0,
                "disabled capture never revives a stale symbol table after a layout change");
            Inputs();

            Inputs(new { shortcut = symbol, blockOriginalInput = true });
            var beforeRoundTrip = notices.Count(n => n.Method == "shortcuts.pressed");
            var beforeApplied = notices.Count(n => n.Method == "shortcuts.applied");
            Set("layout", nint.Zero); Set("accepting", true);
            Check(Feed(false) == 1 && Feed(true) == 1,
                "transient layout change preserves both halves of the first blocked stroke");
            // Restore equality before the queued update, as when a layout is changed back immediately.
            Set("layout", currentLayout);
            RefreshWithoutInputHooks();
            Check(notices.Count(n => n.Method == "shortcuts.applied") == beforeApplied + 1,
                "layout change-back still requests ownership acknowledgment instead of leaving input suspended");
            Set("accepting", true); Invoke("FlushPendingPresses"); Invoke("FlushPendingPresses");
            Check(notices.Count(n => n.Method == "shortcuts.pressed") == beforeRoundTrip + 1 &&
                ((ICollection)Get("pendingPresses")).Count == 0,
                "layout change-back delivers the captured stroke once after acknowledgment");
            Inputs();

            // Symbol aliases interleaved in the catalog must keep saved order in a new layout.
            var lookupType = lookup.GetType();
            var plus = codec.GetMethod("Parse", members)!.Invoke(null, ["Plus", currentLayout])!;
            var implicitModifiers = (int)plus.GetType().GetProperty("Modifiers")!.GetValue(plus)!;
            var modifier = (implicitModifiers & 4) != 0 ? "Shift+" : (implicitModifiers & 1) != 0 ? "Ctrl+" : (implicitModifiers & 2) != 0 ? "Alt+" : "";
            var aliasRows = new[] { "Plus", modifier + "Plus", "Plus", modifier + "Plus" }
                .Select((shortcut, index) => new { shortcut, owner = "alias:" + index }).ToArray();
            var aliasLookup = Activator.CreateInstance(lookupType, members, null, [Decode("ShortcutInput[]", aliasRows)], null)!;
            var aliases = ((IEnumerable)lookupType.GetMethod("Match", members)!.Invoke(aliasLookup, [plus, currentLayout])!).Cast<object>().ToArray();
            Check(aliases.Select(r => (string)r.GetType().GetProperty("Owner")!.GetValue(r)!)
                .SequenceEqual(aliasRows.Select(r => r.owner)), "first lookup merges physical symbol aliases in saved row order");

            // Fixed patterns do not scan unrelated configured rows on a miss.
            var rows = Enumerable.Range(0, 10000).Select(i => new {
                shortcut = i % 2 == 0 ? "F1" : "F01", blockOriginalInput = i % 3 == 0,
                owner = "row:" + i,
            }).ToArray();
            var large = Activator.CreateInstance(lookupType, members, null, [Decode("ShortcutInput[]", rows)], null)!;
            var functionChord = codec.GetMethod("Parse", members)!.Invoke(null, ["F1", currentLayout])!;
            var matched = ((IEnumerable)lookupType.GetMethod("Match", members)!.Invoke(large, [functionChord, currentLayout])!).Cast<object>().ToArray();
            Check(matched.Length == rows.Length && matched.Select(r => (string)r.GetType().GetProperty("Owner")!.GetValue(r)!)
                .SequenceEqual(rows.Select(r => r.owner)), "equivalent groups preserve all 10000 configured rows in saved order");
            var miss = codec.GetMethod("Parse", members)!.Invoke(null, ["F2", currentLayout])!;
            var watch = Stopwatch.StartNew();
            for (var count = 0; count < 1000; count++)
                if (((IEnumerable)lookupType.GetMethod("Match", members)!.Invoke(large, [miss, currentLayout])!).Cast<object>().Any())
                    throw new Exception("Unexpected match.");
            watch.Stop();
            Console.WriteLine($"10000-row catalog, 1000 unmatched lookups: {watch.Elapsed.TotalMilliseconds:F3} ms (informational).");
            Check((nint)Get("keyboardHook") == 0 && (nint)Get("mouseHook") == 0,
                "all simulated input checks completed without installing keyboard/mouse hooks");
            ((IDisposable)engine).Dispose();
            Check(!timer.IsEnabled && (nint)Get("foregroundHook") == 0 && (nint)Get("desktopHook") == 0,
                "disposal stops fallback and unregisters both WinEvent observers");
            Console.WriteLine($"Input environment: {checks} passed; no OS key input or layout changes.");
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error); return 1;
        } finally { (engine as IDisposable)?.Dispose(); }
    }
    private static class EnvironmentNative
    {
        [DllImport("user32.dll")] internal static extern nint GetForegroundWindow();
    }
}
