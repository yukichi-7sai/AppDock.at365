using System.Runtime.InteropServices;
using System.Text.Json;

internal sealed class Target : Form
{
    private readonly List<string> events = [];
    private readonly nint previous = GetForegroundWindow();
    public Target() { Text = "AppDock isolated input target"; Width = 480; Height = 180; Controls.Add(new Label { Text = "Input verification window", Dock = DockStyle.Fill }); }
    protected override bool ProcessCmdKey(ref Message msg, Keys keyData) { events.Add("key:" + keyData); return true; }
    protected override void WndProc(ref Message m) {
        if (m.Msg == 0x0319) { events.Add("app:" + (((long)m.LParam >> 16) & 0x7ff)); m.Result = 1; return; }
        base.WndProc(ref m);
    }
    private static void Foreground(nint window) {
        var thread = GetWindowThreadProcessId(GetForegroundWindow(), out _);
        var own = GetCurrentThreadId();
        var attached = thread != 0 && thread != own && AttachThreadInput(own, thread, true);
        try { SetForegroundWindow(window); }
        finally { if (attached) AttachThreadInput(own, thread, false); }
    }
    private static string Class(nint window) {
        var text = new System.Text.StringBuilder(256); GetClassName(window, text, text.Capacity); return text.ToString();
    }
    private object Call(string method, JsonElement request) {
        if (method == "focus") {
            Show(); Activate();
            Foreground(Handle);
        }
        if (method == "clear") events.Clear();
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
        if (method == "closeExplorer") {
            var handle = new nint(long.Parse(request.GetProperty("params").GetProperty("window").GetString()!));
            if (Class(handle) == "CabinetWClass") PostMessage(handle, 0x10, 0, 0);
        }
        var foreground = GetForegroundWindow();
        var explorers = new List<string>();
        string? hostWindow = null;
        var hostPid = request.TryGetProperty("params", out var parameters) && parameters.TryGetProperty("pid", out var pid) ? pid.GetUInt32() : 0;
        EnumWindows((w, _) => { if (Class(w) == "CabinetWClass") explorers.Add(w.ToString()); return true; }, 0);
        if (hostPid != 0) EnumWindows((w, _) => {
            GetWindowThreadProcessId(w, out var owner);
            if (owner == hostPid && Class(w).StartsWith("Chrome_WidgetWin")) { hostWindow = w.ToString(); return false; }
            return true;
        }, 0);
        return new { window = Handle.ToString(), focused = foreground == Handle, foreground = foreground.ToString(),
            foregroundClass = Class(foreground), shell = GetShellWindow().ToString(), hostWindow, explorers, events = events.ToArray() };
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
    protected override void OnFormClosed(FormClosedEventArgs e) { keybd_event(0x11, 0, 2, 0); if (previous != 0) SetForegroundWindow(previous); base.OnFormClosed(e); }
    [STAThread] public static void Main() { Application.SetHighDpiMode(HighDpiMode.PerMonitorV2); Application.Run(new Target()); }
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern nint GetShellWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(nint window, System.Text.StringBuilder text, int count);
    private delegate bool EnumWindow(nint window, nint data);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindow callback, nint data);
    [DllImport("user32.dll")] private static extern bool ShowWindow(nint window, int state);
    [DllImport("user32.dll")] private static extern bool PostMessage(nint window, uint message, nint wParam, nint lParam);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint window);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint pid);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("user32.dll")] private static extern void keybd_event(byte key, byte scan, uint flags, nuint extra);
}
