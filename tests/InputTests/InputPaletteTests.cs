using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;
using System.Windows.Threading;

internal static partial class Program
{
    // A real, isolated focus target with memory-only hook events. No OS key sending or hooks.
    private static int RunInputPaletteTests(string assemblyPath)
    {
        const BindingFlags members = BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
        using var form = new Form { Text = "AppDock palette handler fixture" };
        var editor = new TextBox { Text = "unchanged", Dock = DockStyle.Fill };
        form.Controls.Add(editor); form.Show(); editor.Focus(); FocusTarget(form); Application.DoEvents();
        object? engine = null;
        try {
            var assembly = Assembly.LoadFrom(System.IO.Path.GetFullPath(assemblyPath));
            var type = assembly.GetType("AppDock.InputHost.InputCaptureEngine", true)!;
            var targetType = assembly.GetType("AppDock.InputHost.InputPaletteTarget", true)!;
            var notices = new List<string>();
            engine = Activator.CreateInstance(type, members, null, [Dispatcher.CurrentDispatcher, null,
                new Func<string, object, bool>((method, payload) => {
                    if (method == "palette.key") notices.Add(JsonSerializer.SerializeToElement(payload).GetProperty("key").GetString()!);
                    return true;
                })], null)!;
            ((DispatcherTimer)type.GetField("timer", members)!.GetValue(engine)!).Stop();
            var owned = (Dictionary<uint, bool>)type.GetField("owned", members)!.GetValue(engine)!;
            var pressed = (HashSet<uint>)type.GetField("pressed", members)!.GetValue(engine)!;
            var confirmations = (System.Collections.IDictionary)type.GetField("confirmedPastes", members)!.GetValue(engine)!;
            object Reset(int count = 10) {
                owned.Clear(); pressed.Clear(); confirmations.Clear(); notices.Clear();
                var target = targetType.GetMethod("Capture", members)!.Invoke(null, [Guid.NewGuid().ToString(), form.Handle.ToString()])
                    ?? throw new Exception("Fixture editor did not retain foreground focus.");
                targetType.GetField("Count", members)!.SetValue(target, count);
                targetType.GetField("Popup", members)!.SetValue(target, form.Handle);
                type.GetField("palette", members)!.SetValue(engine, target);
                return target;
            }
            nint Feed(uint key, bool up = false) {
                var pointer = Marshal.AllocHGlobal(Marshal.SizeOf<GestureTestKeyData>());
                try {
                    Marshal.StructureToPtr(new GestureTestKeyData { Key = key, Flags = up ? 0x80u : 0u }, pointer, false);
                    return (nint)type.GetMethod("Keyboard", members)!.Invoke(engine, [0, up ? 0x101u : 0x100u, pointer])!;
                } finally { Marshal.FreeHGlobal(pointer); }
            }
            var checks = 0;
            void Check(bool ok, string name) { if (!ok) throw new Exception(name); checks++; Console.WriteLine("PASS " + name); }
            foreach (var offset in new[] { 0x30u, 0x60u }) {
                for (uint digit = 0; digit <= 9; digit++) {
                    Reset();
                    Check(Feed(offset + digit) == 1 && Feed(offset + digit) == 1 && Feed(offset + digit, true) == 1 &&
                        notices.SequenceEqual(["choose:" + (digit == 0 ? 9 : digit - 1)]) && confirmations.Count == 1 && owned.Count == 0,
                        $"digit {offset + digit:X} confirms once and owns repeat/up");
                }
            }
            Reset(3);
            Check(Feed(0x30) == 1 && Feed(0x30, true) == 1 && notices.Count == 0 && confirmations.Count == 0 &&
                type.GetField("palette", members)!.GetValue(engine) != null, "missing tenth item consumes 0 and keeps palette open");
            var opening = Reset(); targetType.GetField("Popup", members)!.SetValue(opening, nint.Zero);
            Feed(39); Feed(39, true);
            Check(notices.Count == 0 && !(bool)targetType.GetField("Switching", members)!.GetValue(opening)!, "switch before first presentation cannot overlap initial loading");
            foreach (var (key, action) in new[] { (33u,"page-up"), (34u,"page-down"), (38u,"up"), (40u,"down") }) {
                Reset(); Feed(key); Feed(key); Feed(key); Feed(key, true);
                Check(notices.SequenceEqual(Enumerable.Repeat(action, 3)) && owned.Count == 0, action + " repeats and releases");
            }
            foreach (var (key, action) in new[] { (36u,"home"), (35u,"end"), (37u,"switch"), (39u,"switch") }) {
                var target = Reset(); Feed(key); Feed(key); Feed(key, true);
                Check(notices.SequenceEqual([action]) && confirmations.Count == 0, action + " is single press");
                if (action == "switch") {
                    Feed(0x31); Feed(0x31, true); Feed(13); Feed(13, true);
                    Check(notices.Count == 1 && confirmations.Count == 0, "switch loading consumes confirmation keys");
                    targetType.GetField("Switching", members)!.SetValue(target, false);
                    Feed(0x31); Feed(0x31, true);
                    Check(notices.Last() == "choose:0" && confirmations.Count == 1, "selection resumes after new view is ready");
                }
            }
            Reset(); ((HashSet<uint>)type.GetField("withheldModifiers", members)!.GetValue(engine)!).Add(0xA2); Feed(0x31); Feed(0x31, true);
            Check(notices.SequenceEqual(["cancel"]) && confirmations.Count == 0, "Ctrl+1 does not choose the first item");
            var cancelled = Reset(); targetType.GetMethod("Cancel", members)!.Invoke(cancelled, null); Feed(0x31); Feed(0x31, true);
            Check(notices.SequenceEqual(["cancel"]) && confirmations.Count == 0, "stale input target cannot confirm a digit");
            Reset(); Feed(27); Feed(27, true);
            Check(notices.SequenceEqual(["cancel"]) && owned.Count == 0, "Escape cancels and owns its release");
            Check(editor.Text == "unchanged" && (nint)type.GetField("keyboardHook", members)!.GetValue(engine)! == 0 &&
                (nint)type.GetField("mouseHook", members)!.GetValue(engine)! == 0, "no hooks or OS key input; editor unchanged");
            Console.WriteLine($"Input palette checks: {checks}");
            return 0;
        } catch (Exception error) { Console.Error.WriteLine(error); return 1; }
        finally { (engine as IDisposable)?.Dispose(); }
    }
}
