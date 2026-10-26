using System.Runtime.InteropServices;
using System.Text.Json;

internal sealed class Target : Form
{
    private readonly List<string> events = [];
    private readonly nint previous = GetForegroundWindow();
    private readonly System.Drawing.Point previousCursor = Cursor.Position;
    private bool movedCursor;
    private object? focusAttempt;
    public Target() { Text = "AppDock isolated input target"; Width = 480; Height = 180; Controls.Add(new Label { Text = "Input verification window", Dock = DockStyle.Fill }); }
    protected override bool ProcessCmdKey(ref Message msg, Keys keyData) { events.Add("key:" + keyData); return true; }
    protected override void WndProc(ref Message m) {
        if (m.Msg == 0x0319) { events.Add("app:" + (((long)m.LParam >> 16) & 0x7ff)); m.Result = 1; return; }
        base.WndProc(ref m);
    }
    private static object Foreground(nint window) {
        var thread = GetWindowThreadProcessId(GetForegroundWindow(), out _);
        var own = GetCurrentThreadId();
        var attached = thread != 0 && thread != own && AttachThreadInput(own, thread, true);
        var targetThread = GetWindowThreadProcessId(window, out _);
        var targetAttached = targetThread != 0 && targetThread != own && targetThread != thread && AttachThreadInput(own, targetThread, true);
        var attachError = Marshal.GetLastWin32Error();
        try { return new { thread, own, attached, attachError, activated = SetForegroundWindow(window), visible = IsWindowVisible(window),
            session = System.Diagnostics.Process.GetCurrentProcess().SessionId, desktop = DesktopName(GetThreadDesktop(own)), foregroundDesktop = DesktopName(GetThreadDesktop(thread)) }; }
        finally { if (targetAttached) AttachThreadInput(own, targetThread, false); if (attached) AttachThreadInput(own, thread, false); }
    }
    private static string DesktopName(nint desktop) {
        var name = new System.Text.StringBuilder(256);
        return GetUserObjectInformation(desktop, 2, name, 512, out _) ? name.ToString() : "error:" + Marshal.GetLastWin32Error();
    }
    private static string Class(nint window) {
        var text = new System.Text.StringBuilder(256); GetClassName(window, text, text.Capacity); return text.ToString();
    }
    private static string Title(nint window) { var text = new System.Text.StringBuilder(512); GetWindowText(window, text, text.Capacity); return text.ToString(); }
    private object Call(string method, JsonElement request) {
        if (method == "click") {
            var p = request.GetProperty("params");
            var window = new nint(long.Parse(p.GetProperty("window").GetString()!));
            var point = new System.Drawing.Point(p.GetProperty("x").GetInt32(), p.GetProperty("y").GetInt32());
            var hit = WindowFromPoint(point);
            if (GetForegroundWindow() != window || hit != window && GetAncestor(hit, 2) != window)
                throw new Exception("The diagnostic click is outside the foreground target.");
            movedCursor = true; Cursor.Position = point;
            mouse_event(2, 0, 0, 0, 0); Thread.Sleep(30); mouse_event(4, 0, 0, 0, 0);
        }
        if (method == "imeChord") {
            var p = request.GetProperty("params");
            var window = new nint(long.Parse(p.GetProperty("window").GetString()!));
            var scan = p.GetProperty("scan").GetUInt16();
            var key = p.GetProperty("key").GetUInt16();
            var physical = p.GetProperty("physical").GetBoolean();
            var modifiers = p.GetProperty("modifiers").EnumerateArray().Select(v => v.GetByte()).ToArray();
            if (scan is not (0x70 or 0x79 or 0x7B or 0x29) || key is not (0x15 or 0x1C or 0x19 or 0xF1 or 0xF2 or 0xF5 or 0xF6 or 0xF7) ||
                modifiers.Any(v => v is not (0x11 or 0x12 or 0x10 or 0x5B)))
                throw new Exception("Unsupported diagnostic IME input.");
            void Stroke(bool up) {
                if (!up && GetForegroundWindow() != window) throw new Exception("The diagnostic input target is not foreground.");
                var input = new Input { Type = 1, Data = new InputUnion { Keyboard = new KeyInput {
                    Key = physical ? (ushort)0 : key, Scan = scan, Flags = (physical ? 8u : 0u) | (up ? 2u : 0u) } } };
                if (SendInput(1, [input], Marshal.SizeOf<Input>()) != 1) throw new Exception("Diagnostic input failed.");
            }
            if (GetForegroundWindow() != window) throw new Exception("The diagnostic input target is not foreground.");
            try {
                foreach (var modifier in modifiers) { keybd_event(modifier, 0, modifier == 0x5B ? 1u : 0, 0); Thread.Sleep(40); }
                Stroke(false); Thread.Sleep(40); Stroke(true);
            } finally {
                foreach (var modifier in modifiers.Reverse()) { Thread.Sleep(40); keybd_event(modifier, 0, 2 | (modifier == 0x5B ? 1u : 0), 0); }
            }
        }
        if (method == "focus") {
            Show();
            ShowWindow(Handle, 9);
            Activate();
            focusAttempt = Foreground(Handle);
        }
        if (method == "clear") events.Clear();
        if (method == "focusWindow") Foreground(new nint(long.Parse(request.GetProperty("params").GetProperty("window").GetString()!)));
        if (method == "hold") keybd_event(0x11, 0, 0, 0);
        if (method == "release") keybd_event(0x11, 0, 2, 0);
        if (method == "desktop") Foreground(GetShellWindow());
        if (method == "hotkey") {
            var key = request.GetProperty("params").GetProperty("key").GetByte();
            keybd_event(0x11, 0, 0, 0); Thread.Sleep(20);
            keybd_event(0x10, 0, 0, 0); Thread.Sleep(20);
            keybd_event(key, 0, 0, 0); Thread.Sleep(20);
            keybd_event(key, 0, 2, 0); Thread.Sleep(20);
            keybd_event(0x10, 0, 2, 0); Thread.Sleep(20);
            keybd_event(0x11, 0, 2, 0);
        }
        if (method == "windowState") {
            var p = request.GetProperty("params");
            ShowWindow(new nint(long.Parse(p.GetProperty("window").GetString()!)), p.GetProperty("state").GetInt32());
        }
        if (method == "chord") {
            var p = request.GetProperty("params");
            var modifiers = p.GetProperty("modifiers").EnumerateArray().Select(value => value.GetByte()).ToArray();
            var key = p.GetProperty("key").GetByte();
            var repeats = p.TryGetProperty("repeats", out var repeat) ? repeat.GetInt32() : 0;
            try {
                foreach (var modifier in modifiers) { keybd_event(modifier, 0, modifier is 0x5B or 0x5C ? 1u : 0, 0); Thread.Sleep(20); }
                keybd_event(key, 0, 0, 0); Thread.Sleep(30);
                for (var index = 0; index < repeats; index++) { keybd_event(key, 0, 0, 0); Thread.Sleep(25); }
            } finally {
                keybd_event(key, 0, 2, 0);
                foreach (var modifier in modifiers.Reverse()) { Thread.Sleep(20); keybd_event(modifier, 0, 2 | (modifier is 0x5B or 0x5C ? 1u : 0), 0); }
            }
        }
        if (method == "closeExplorer") {
            var handle = new nint(long.Parse(request.GetProperty("params").GetProperty("window").GetString()!));
            if (Class(handle) == "CabinetWClass") PostMessage(handle, 0x10, 0, 0);
        }
        if (method == "closeTerminal") {
            var p = request.GetProperty("params");
            var handle = new nint(long.Parse(p.GetProperty("window").GetString()!));
            if (Class(handle) == "CASCADIA_HOSTING_WINDOW_CLASS" && Title(handle).Contains(p.GetProperty("title").GetString()!, StringComparison.Ordinal)) PostMessage(handle, 0x10, 0, 0);
        }
        var foreground = GetForegroundWindow();
        var explorers = new List<string>();
        var terminals = new List<object>();
        string? hostWindow = null;
        var hostPid = request.TryGetProperty("params", out var parameters) && parameters.TryGetProperty("pid", out var pid) ? pid.GetUInt32() : 0;
        EnumWindows((w, _) => {
            if (Class(w) == "CabinetWClass") explorers.Add(w.ToString());
            if (Title(w).StartsWith("AppDock shortcut test ", StringComparison.Ordinal)) {
                GetWindowThreadProcessId(w,out var process); terminals.Add(new { window=w.ToString(),title=Title(w),kind=Class(w),process });
            }
            return true;
        }, 0);
        if (hostPid != 0) EnumWindows((w, _) => {
            GetWindowThreadProcessId(w, out var owner);
            if (owner == hostPid && Class(w).StartsWith("Chrome_WidgetWin")) { hostWindow = w.ToString(); return false; }
            return true;
        }, 0);
        var layout = GetKeyboardLayout(GetWindowThreadProcessId(Handle, out _));
        var symbolKeys = new[] { '.', ';', '/', '+', '-' }.ToDictionary(c => c.ToString(), c => {
            var mapping = VkKeyScanEx(c, layout);
            return mapping == -1 ? null : "key:" + (Keys)((mapping & 0xff) | ((mapping & 0x100) != 0 ? (int)Keys.Shift : 0)
                | ((mapping & 0x200) != 0 ? (int)Keys.Control : 0) | ((mapping & 0x400) != 0 ? (int)Keys.Alt : 0));
        });
        return new { window = Handle.ToString(), focused = foreground == Handle, foreground = foreground.ToString(), symbolKeys, focusAttempt,
            foregroundClass = Class(foreground), foregroundTitle = Title(foreground), shell = GetShellWindow().ToString(), hostWindow, explorers, terminals, events = events.ToArray() };
    }
    protected override void OnShown(EventArgs e) {
        base.OnShown(e);
        var arguments = Environment.GetCommandLineArgs();
        if (arguments.Length >= 3 && arguments[1] == "--process-target") {
            var output = arguments[2];
            var timer = new System.Windows.Forms.Timer { Interval = 100 };
            timer.Tick += (_, _) => {
                if (File.Exists(output + ".stop")) { timer.Stop(); timer.Dispose(); Close(); return; }
                File.WriteAllText(output, JsonSerializer.Serialize(new { pid = Environment.ProcessId, visible = Visible, window = Handle.ToString(), heartbeat = DateTime.UtcNow.Ticks, args = arguments.Skip(3).ToArray() }));
            };
            timer.Start();
            return;
        }
        _ = Task.Run(async () => {
            try {
                while (await Console.In.ReadLineAsync() is string line) {
                    using var doc = JsonDocument.Parse(line);
                    var request = doc.RootElement;
                    var method = request.GetProperty("method").GetString()!;
                    object result = Invoke(() => Call(method, request));
                    Console.WriteLine(JsonSerializer.Serialize(new { jsonrpc = "2.0", id = request.GetProperty("id").GetString(), result }));
                }
            } finally { BeginInvoke(Close); }
        });
    }
    protected override void OnFormClosed(FormClosedEventArgs e) {
        if (movedCursor) Cursor.Position = previousCursor;
        keybd_event(0x11, 0, 2, 0); if (previous != 0) SetForegroundWindow(previous); base.OnFormClosed(e);
        var arguments = Environment.GetCommandLineArgs();
        if (arguments.Length >= 3 && arguments[1] == "--process-target") File.WriteAllText(arguments[2] + ".closed", "closed");
    }
    [STAThread] public static void Main() { Application.SetHighDpiMode(HighDpiMode.PerMonitorV2); Application.Run(new Target()); }
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint window);
    [DllImport("user32.dll")] private static extern nint GetKeyboardLayout(uint thread);
    [DllImport("user32.dll", EntryPoint = "VkKeyScanExW", CharSet = CharSet.Unicode)] private static extern short VkKeyScanEx(char character, nint layout);
    [DllImport("user32.dll")] private static extern nint GetShellWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(nint window, System.Text.StringBuilder text, int count);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(nint window, System.Text.StringBuilder text, int count);
    private delegate bool EnumWindow(nint window, nint data);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindow callback, nint data);
    [DllImport("user32.dll")] private static extern bool ShowWindow(nint window, int state);
    [DllImport("user32.dll")] private static extern bool PostMessage(nint window, uint message, nint wParam, nint lParam);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint window);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint pid);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll", SetLastError = true)] private static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("user32.dll")] private static extern nint GetThreadDesktop(uint thread);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool GetUserObjectInformation(nint handle, int index, System.Text.StringBuilder name, uint size, out uint needed);
    [DllImport("user32.dll")] private static extern void keybd_event(byte key, byte scan, uint flags, nuint extra);
    [DllImport("user32.dll")] private static extern void mouse_event(uint flags, uint x, uint y, uint data, nuint extra);
    [DllImport("user32.dll")] private static extern nint WindowFromPoint(System.Drawing.Point point);
    [DllImport("user32.dll")] private static extern nint GetAncestor(nint window, uint flags);
    [StructLayout(LayoutKind.Sequential)] private struct Input { public uint Type; public InputUnion Data; }
    [StructLayout(LayoutKind.Explicit)] private struct InputUnion { [FieldOffset(0)] public KeyInput Keyboard; [FieldOffset(0)] public MouseInput Mouse; }
    [StructLayout(LayoutKind.Sequential)] private struct KeyInput { public ushort Key, Scan; public uint Flags, Time; public nuint Extra; }
    [StructLayout(LayoutKind.Sequential)] private struct MouseInput { public int X, Y; public uint Data, Flags, Time; public nuint Extra; }
    [DllImport("user32.dll", SetLastError=true)] private static extern uint SendInput(uint count, Input[] inputs, int size);
}
