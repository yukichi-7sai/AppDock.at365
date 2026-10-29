using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Threading;
using AppDock.InputHost;

internal static partial class Program
{
    // Real fixture windows and menu loops; feed hook callbacks in memory, without
    // installing hooks or sending input to applications running on the desktop.
    private static int RunGesturePopupTests(string assemblyPath)
    {
        using var owner = new Form { Text = "Gesture popup fixture", StartPosition = FormStartPosition.CenterScreen, Size = new(520, 320) };
        var failed = false;
        owner.Shown += async (_, _) => {
            try {
                var assembly = Assembly.LoadFrom(Path.GetFullPath(assemblyPath));
                FocusTarget(owner);
                await Task.Delay(100);
                PopupCheck(GetForegroundWindow() == owner.Handle, "fixture owner is foreground");
                CheckPress(owner.PointToScreen(new(260, 180)), false, "ordinary window still starts", assembly);

                using (var menu = new ContextMenuStrip()) {
                    menu.Items.Add("Fixture item");
                    menu.Show(owner, new Point(70, 80));
                    await Task.Delay(80);
                    var foreground = GetForegroundWindow();
                    CheckPress(menu.PointToScreen(new(24, 12)), true, "WinForms popup passes right down and up", assembly);
                    CheckPress(menu.PointToScreen(new(24, 12)), true, "WinForms popup also passes with inactive start disabled", assembly, false);
                    await Task.Delay(80);
                    PopupCheck(menu.Visible && GetForegroundWindow() == foreground, "WinForms popup remains open without activation");
                    menu.Close();
                }
                using (var combo = new ComboBox { Location = new(70, 80), Width = 200, DropDownStyle = ComboBoxStyle.DropDownList }) {
                    combo.Items.AddRange(["First item", "Second item"]);
                    owner.Controls.Add(combo); combo.SelectedIndex = 0; combo.DroppedDown = true;
                    await Task.Delay(80);
                    var info = new PopupComboInfo { Size = (uint)Marshal.SizeOf<PopupComboInfo>() };
                    PopupCheck(GetFixtureComboBoxInfo(combo.Handle, ref info) && GetWindowRect(info.List, out var rect), "combo dropdown is displayed");
                    GetWindowRect(info.List, out rect);
                    CheckPress(new(rect.Left + 20, rect.Top + 12), true, "combo dropdown passes original right click", assembly);
                    PopupCheck(combo.DroppedDown && IsWindowVisible(info.List), "combo dropdown remains open");
                    combo.DroppedDown = false; owner.Controls.Remove(combo);
                }

                using (var popup = new PopupFixture { Location = owner.PointToScreen(new(80, 90)), Size = new(180, 90) }) {
                    popup.Show(owner);
                    await Task.Delay(80);
                    CheckPress(popup.PointToScreen(new(40, 30)), true, "owned popup passes original right click", assembly);
                    PopupCheck(GetForegroundWindow() == owner.Handle && popup.Visible, "owned popup does not steal foreground");
                    popup.Close();
                }
                using (var popup = new PopupFixture { Location = owner.PointToScreen(new(80, 90)), Size = new(180, 90) }) {
                    popup.Show();
                    await Task.Delay(80);
                    CheckPress(popup.PointToScreen(new(40, 30)), true, "unowned non-activating popup passes original right click", assembly);
                    popup.Close();
                }
                using (var popup = new PopupFixture { NonActivating = false, Location = owner.PointToScreen(new(80, 90)), Size = new(180, 90) }) {
                    popup.Show(owner); FocusTarget(popup); await Task.Delay(80);
                    CheckPress(popup.PointToScreen(new(40, 30)), true, "active owned popup also passes original right click", assembly);
                    popup.Close();
                }
                using (var window = new PopupFixture { NonActivating = false, ShowInTaskbar = true, Location = owner.Location, Size = new(360, 220) }) {
                    window.Show(); FocusTarget(window); await Task.Delay(80);
                    CheckPress(window.PointToScreen(new(100, 90)), false, "independent borderless application window still starts", assembly);
                    window.Close();
                }
                using (var dialog = new Form { Text = "Owned dialog fixture", StartPosition = FormStartPosition.Manual, Location = owner.Location, Size = new(360, 220), FormBorderStyle = FormBorderStyle.FixedDialog }) {
                    dialog.Show(owner); FocusTarget(dialog); await Task.Delay(80);
                    PopupCheck(GetForegroundWindow() == dialog.Handle, "owned dialog is foreground");
                    CheckPress(dialog.PointToScreen(new(100, 90)), false, "ordinary owned dialog still starts", assembly);
                    dialog.Close();
                }
                FocusTarget(owner);
                await Task.Delay(80);
                await CheckNativePopup(owner, assembly);
                CheckPress(owner.PointToScreen(new(260, 180)), false, "gesture starts again after menu closes", assembly);
            } catch (Exception e) { Console.Error.WriteLine(e); failed = true; }
            finally { owner.Close(); }
        };
        Application.Run(owner);
        return failed ? 1 : 0;
    }
    private static void CheckPress(Point point, bool pass, string label, Assembly assembly, bool activate = true)
    {
        const BindingFlags members = BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public;
        var noticeType = assembly.GetType("AppDock.InputHost.GestureIndicatorNotifications", true)!;
        Action<object> notice = _ => { };
        var display = Activator.CreateInstance(noticeType, members, null, [notice], null)!;
        var type = assembly.GetType("AppDock.InputHost.GestureEngine", true)!;
        using var engine = (IDisposable)Activator.CreateInstance(type, members, null, [Dispatcher.CurrentDispatcher, display], null)!;
        var configType = assembly.GetType("AppDock.InputHost.Configuration", true)!;
        var config = JsonSerializer.Deserialize(JsonSerializer.Serialize(new {
            enabled = true, activateOnStart = activate, browsers = Array.Empty<string>(), excludedProcesses = Array.Empty<string>(),
            requireChromiumWindowClass = false, distance = 30, wheelDelayMs = 0, indicatorOpacity = .5, indicatorPosition = "none",
            context = "{}", revision = 1, rows = new[] { new { id = "fixture", command = "fixture.run", gesture = "move-left", title = "Fixture", window = "",
                when = new { scope = "global", appletIds = Array.Empty<string>(), processes = Array.Empty<string>() } } }
        }), configType, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        type.GetMethod("Configure", members)!.Invoke(engine, [config, null]);
        var mouse = type.GetMethod("Mouse", members)!;
        var pointer = Marshal.AllocHGlobal(Marshal.SizeOf<PopupMouseData>());
        try {
            Marshal.StructureToPtr(new PopupMouseData { X = point.X, Y = point.Y }, pointer, false);
            var down = (nint)mouse.Invoke(engine, [0, 0x204u, pointer])!;
            var ready = (bool)type.GetField("ready", members)!.GetValue(engine)!;
            PopupCheck(pass ? down == 0 && !ready : down == 1 && ready, label);
            if (pass) PopupCheck((nint)mouse.Invoke(engine, [0, 0x205u, pointer])! == 0, label + " releases without capture");
        } finally { Marshal.FreeHGlobal(pointer); }
    }
    private static async Task CheckNativePopup(Form owner, Assembly assembly)
    {
        var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var menu = CreateFixturePopupMenu();
        AppendFixtureMenu(menu, 0, 1, "Fixture item");
        var point = owner.PointToScreen(new(70, 80));
        using var timer = new System.Windows.Forms.Timer { Interval = 100 };
        timer.Tick += (_, _) => {
            timer.Stop();
            try {
                var info = new DesktopGuiInfo { Size = (uint)Marshal.SizeOf<DesktopGuiInfo>() };
                PopupCheck(DesktopGuiThreadInfo(0, ref info) && (info.Flags & 0x1C) != 0 && info.MenuOwner == owner.Handle,
                    "standard popup menu loop is active");
                CheckPress(new(point.X + 24, point.Y + 12), true, "standard menu passes original right click", assembly);
                CheckPress(new(point.X + 24, point.Y + 12), true, "standard menu also passes with inactive start disabled", assembly, false);
                var after = new DesktopGuiInfo { Size = (uint)Marshal.SizeOf<DesktopGuiInfo>() };
                PopupCheck(DesktopGuiThreadInfo(0, ref after) && after.Flags == info.Flags && after.MenuOwner == info.MenuOwner && after.Capture == info.Capture,
                    "standard menu preserves its menu loop and mouse capture");
                CheckPress(owner.PointToScreen(new(300, 200)), true, "click outside an active menu passes to its owner", assembly);
                completion.SetResult();
            } catch (Exception e) { completion.SetException(e); }
            finally { PostFixtureMessage(owner.Handle, 0x1F, 0, 0); }
        };
        try {
            timer.Start();
            TrackFixturePopupMenu(menu, 0x100, point.X, point.Y, owner.Handle, 0);
            await completion.Task.WaitAsync(TimeSpan.FromSeconds(3));
        } finally { DestroyFixtureMenu(menu); }
    }
    private static void PopupCheck(bool success, string label)
    {
        if (!success) throw new Exception(label);
        Console.WriteLine("PASS " + label);
    }
    private sealed class PopupFixture : Form
    {
        internal bool NonActivating = true;
        internal PopupFixture() { FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual; }
        protected override bool ShowWithoutActivation => NonActivating;
        protected override CreateParams CreateParams { get { var p = base.CreateParams; p.Style |= unchecked((int)0x80000000); if (NonActivating) p.ExStyle |= 0x08000000; return p; } }
    }
    [StructLayout(LayoutKind.Sequential)] private struct PopupMouseData { public int X, Y; public uint Data, Flags, Time; public nuint Extra; }
    [StructLayout(LayoutKind.Sequential)] private struct PopupComboInfo { public uint Size; public Rect ItemRect, ButtonRect; public uint ButtonState; public nint Combo, Item, List; }
    [DllImport("user32.dll", EntryPoint = "GetComboBoxInfo")] private static extern bool GetFixtureComboBoxInfo(nint combo, ref PopupComboInfo info);
    [DllImport("user32.dll", EntryPoint = "CreatePopupMenu")] private static extern nint CreateFixturePopupMenu();
    [DllImport("user32.dll", EntryPoint = "AppendMenuW", CharSet = CharSet.Unicode)] private static extern bool AppendFixtureMenu(nint menu, uint flags, nuint id, string text);
    [DllImport("user32.dll", EntryPoint = "TrackPopupMenuEx")] private static extern bool TrackFixturePopupMenu(nint menu, uint flags, int x, int y, nint owner, nint parameters);
    [DllImport("user32.dll", EntryPoint = "DestroyMenu")] private static extern bool DestroyFixtureMenu(nint menu);
}
