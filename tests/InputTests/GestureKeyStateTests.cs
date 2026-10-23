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
            var rows = new[] { "Pause", "A" }.SelectMany(key =>
                new[] { "", "Ctrl+", "Alt+", "Shift+", "Ctrl+Alt+", "Ctrl+Shift+", "Alt+Shift+", "Ctrl+Alt+Shift+" }
                    .Select(prefix => new { id = key + prefix, command = "fixture", gesture = "key:" + prefix + key,
                        title = "fixture", window = "", when = new { scope = "global", appletIds = Array.Empty<string>(), processes = Array.Empty<string>() } }));
            Set("candidates", JsonSerializer.Deserialize(JsonSerializer.Serialize(rows), binding.MakeArrayType(),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!);
            Set("busy", true); // Prevent command execution; exercise capture/release state only.
            Set("ready", true);
            var keyboard = type.GetMethod("Keyboard", members)!;
            var keys = (HashSet<uint>)type.GetField("keys", members)!.GetValue(engine)!;
            nint Feed(uint key, bool up = false) {
                Set("target", GetForegroundWindow()); // Observe only; do not change the active app.
                if ((GetAsyncKeyState(0x5B) & 0x8000) != 0 || (GetAsyncKeyState(0x5C) & 0x8000) != 0)
                    throw new Exception("Release the Windows key before running the state-only fixture.");
                var pointer = Marshal.AllocHGlobal(Marshal.SizeOf<GestureTestKeyData>());
                try {
                    Marshal.StructureToPtr(new GestureTestKeyData { Key = key }, pointer, false);
                    return (nint)keyboard.Invoke(engine, [0, up ? 0x101u : 0x100u, pointer])!;
                } finally { Marshal.FreeHGlobal(pointer); }
            }
            void Check(bool value, string label) {
                if (!value) throw new Exception(label);
                Console.WriteLine("PASS " + label);
            }
            Check(Feed(0x13) == 1, "synthetic Pause down is captured during gesture");
            Check(!keys.Contains(0x13), "Pause does not wait for a paired release");
            Check(Feed(0x13) == 1 && !keys.Contains(0x13), "another synthetic down-only pulse remains usable");
            Set("ready", false);
            Check(Feed(0x13) == 0, "ordinary Pause passes after gesture without key-up");
            Check(Feed(0x13, true) == 0, "optional Pause key-up passes");
            Set("ready", true);
            Check(Feed(0x13) == 1, "next gesture accepts a synthetic Pause pulse");
            Check(Feed(0x41) == 1 && keys.Contains(0x41), "ordinary gesture key retains its release latch");
            Set("ready", false);
            Check(Feed(0x41) == 1, "ordinary key repeats remain captured after gesture");
            Check(Feed(0x41, true) == 1 && !keys.Contains(0x41), "ordinary captured key-up releases the latch");
            Check(Feed(0x41) == 0, "ordinary key passes after its paired release");
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error);
            return 1;
        } finally { (engine as IDisposable)?.Dispose(); }
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct GestureTestKeyData { public uint Key, Scan, Flags, Time; public nuint Extra; }
}
