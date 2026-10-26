using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Threading;

internal static partial class Program
{
    // Calls the hook handler with memory-only data. No hooks, SendInput,
    // foreground changes, or message pumping are used by this test mode.
    private static int RunGestureKeyStateTests(string assemblyPath)
    {
        const BindingFlags members = BindingFlags.Instance | BindingFlags.NonPublic;
        object? engine = null;
        try {
            var assembly = Assembly.LoadFrom(Path.GetFullPath(assemblyPath));
            var type = assembly.GetType("AppDock.InputHost.GestureEngine", true)!;
            engine = Activator.CreateInstance(type, members, null, [Dispatcher.CurrentDispatcher, null], null)!;
            void Set(string name, object value) => type.GetField(name, members)!.SetValue(engine, value);
            var binding = assembly.GetType("AppDock.InputHost.Binding", true)!;
            var rows = new[] { "Pause", "A", "CapsLock", "ScrollLock", "Alphanumeric", "KanaMode", "Convert", "NonConvert" }.SelectMany(key =>
                new[] { "", "Ctrl+", "Alt+", "Shift+", "Ctrl+Alt+", "Ctrl+Shift+", "Alt+Shift+", "Ctrl+Alt+Shift+" }
                    .Select(prefix => new { id = key + prefix, command = "fixture", gesture = "key:" + prefix + key,
                        title = "fixture", window = "", when = new { scope = "global", appletIds = Array.Empty<string>(), processes = Array.Empty<string>() } }));
            Set("candidates", JsonSerializer.Deserialize(JsonSerializer.Serialize(rows), binding.MakeArrayType(),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!);
            Set("busy", true); // Prevent command execution; exercise capture/release state only.
            Set("ready", true);
            var keyboard = type.GetMethod("Keyboard", members)!;
            var keys = (HashSet<uint>)type.GetField("keys", members)!.GetValue(engine)!;
            nint Feed(uint key, bool up = false, uint scan = 0) {
                Set("target", GetForegroundWindow()); // Observe only; do not change the active app.
                if ((GetAsyncKeyState(0x5B) & 0x8000) != 0 || (GetAsyncKeyState(0x5C) & 0x8000) != 0)
                    throw new Exception("Release the Windows key before running the state-only fixture.");
                var pointer = Marshal.AllocHGlobal(Marshal.SizeOf<GestureTestKeyData>());
                try {
                    Marshal.StructureToPtr(new GestureTestKeyData { Key = key, Scan = scan }, pointer, false);
                    return (nint)keyboard.Invoke(engine, [0, up ? 0x101u : 0x100u, pointer])!;
                } finally { Marshal.FreeHGlobal(pointer); }
            }
            void Check(bool value, string label) {
                if (!value) throw new Exception(label);
                Console.WriteLine("PASS " + label);
            }
            foreach (var (key, name) in new[] { (0x13u, "Pause"), (0xF0u, "Alphanumeric"), (0x15u, "KanaMode") }) {
                Set("ready", true);
                Check(Feed(key) == 1, name + " synthetic down is captured during gesture");
                Check(!keys.Contains(key), name + " does not wait for a paired release");
                Check(Feed(key) == 1 && !keys.Contains(key), name + " another down-only pulse remains usable");
                Set("ready", false);
                Check(Feed(key) == 0, name + " ordinary input passes after gesture without key-up");
                Check(Feed(key, true) == 0, name + " optional key-up passes");
                Set("ready", true);
                Check(Feed(key) == 1, name + " next gesture accepts a pulse");
            }
            Check(Feed(0x41) == 1 && keys.Contains(0x41), "ordinary gesture key retains its release latch");
            Set("ready", false);
            Check(Feed(0x41) == 1, "ordinary key repeats remain captured after gesture");
            Check(Feed(0x41, true) == 1 && !keys.Contains(0x41), "ordinary captured key-up releases the latch");
            Check(Feed(0x41) == 0, "ordinary key passes after its paired release");
            foreach (var (key, name) in new[] { (0x14u, "CapsLock"), (0x91u, "ScrollLock"),
                (0x1Cu, "Convert"), (0x1Du, "NonConvert") }) {
                Set("ready", true);
                Check(Feed(key) == 1 && keys.Contains(key), name + " is captured during gesture");
                Set("ready", false);
                Check(Feed(key) == 1, name + " repeat stays captured after gesture");
                Check(Feed(key, true) == 1 && !keys.Contains(key), name + " paired release is captured");
                Check(Feed(key) == 0, name + " passes after its paired release");
            }
            foreach (var raw in new uint[] { 0xF2, 0xF1, 0xF5, 0xF6 }) {
                Set("ready", true);
                Check(Feed(raw, scan: 0x70) == 1 && !keys.Contains(0x15),
                    $"KanaMode gesture accepts IME code {raw:X2} without retaining ownership");
                Check(Feed(raw, scan: 0x70) == 1 && !keys.Contains(0x15),
                    $"KanaMode gesture accepts a second IME pulse {raw:X2}");
                Set("ready", false);
                Check(Feed(raw, scan: 0x70) == 0, $"IME pulse {raw:X2} passes after the gesture");
            }
            foreach (var (raw, scan, canonical, name) in new[] {
                (0x03u, 0x46u, 0x91u, "ScrollLock"), (0xF7u, 0x7Bu, 0x1Du, "NonConvert") }) {
                Set("ready", true);
                Check(Feed(raw, scan: scan) == 1 && keys.Contains(canonical),
                    name + " gesture captures the derived physical key");
                Set("ready", false);
                Check(Feed(raw, scan: scan) == 1, name + " derived repeat remains captured");
                Check(Feed(raw, true, scan: scan) == 1 && !keys.Contains(canonical),
                    name + " derived release clears gesture ownership");
                Check(Feed(raw, scan: scan) == 0, name + " derived input passes after release");
            }
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error);
            return 1;
        } finally { (engine as IDisposable)?.Dispose(); }
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct GestureTestKeyData { public uint Key, Scan, Flags, Time; public nuint Extra; }
}
