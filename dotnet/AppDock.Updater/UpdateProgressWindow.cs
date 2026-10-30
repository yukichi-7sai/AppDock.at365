using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text.Json;

// A native window keeps the updater independent of Electron and WindowsDesktop Runtime.
internal sealed class UpdateProgressWindow : IDisposable
{
    private const uint Refresh = 0x8001, Finish = 0x8002;
    private readonly ManualResetEventSlim shown = new(), closed = new();
    private readonly object gate = new();
    private readonly Thread thread;
    private nint window, phaseLabel, headingLabel, detailLabel, progress, closeButton;
    private string phase = Text("waiting"), heading = Text("heading"), detail = Text("detail");
    private bool dismissible;
    private readonly string executable;
    private readonly WindowProcedure procedure;
    private static readonly Dictionary<string, string> Messages = ReadMessages();

    private static Dictionary<string, string> ReadMessages()
    {
        using var stream = typeof(UpdateProgressWindow).Assembly.GetManifestResourceStream("AppDock.Updater.Messages.json")!;
        return JsonSerializer.Deserialize<Dictionary<string, string>>(stream)!;
    }
    internal static string Text(string key) => Messages["services.updaterWindow." + key];
    private UpdateProgressWindow(string executable)
    {
        this.executable = executable;
        procedure = WindowProc;
        thread = new Thread(Run) { IsBackground = true, Name = "Update progress" };
        thread.Start();
    }
    public static UpdateProgressWindow? Open(JsonElement job, string executable)
    {
        if (!job.TryGetProperty("showProgress", out var enabled) || enabled.ValueKind != JsonValueKind.True) return null;
        var view = new UpdateProgressWindow(executable);
        if (view.shown.Wait(TimeSpan.FromSeconds(5)) && view.window != 0) return view;
        view.Dispose();
        return null;
    }
    public void Phase(string key)
    {
        lock (gate) phase = Text(key);
        PostMessage(window, Refresh, 0, 0);
    }
    public void Outcome(string key)
    {
        lock (gate)
        {
            heading = Text("attention"); detail = Text(key); phase = ""; dismissible = true;
        }
        PostMessage(window, Refresh, 0, 0);
        closed.Wait();
    }
    public void Dispose()
    {
        if (window != 0) PostMessage(window, Finish, 0, 0);
        if (Thread.CurrentThread != thread) thread.Join(TimeSpan.FromSeconds(2));
    }
    private void Run()
    {
        nint font = 0, headingFont = 0, icon = 0;
        var className = "AppDock.UpdateProgress." + Environment.ProcessId;
        var instance = GetModuleHandle(null);
        try
        {
            SetThreadDpiAwarenessContext(-4);
            var dpi = GetDpiForSystem();
            int Scale(int value) => (int)(value * dpi / 96);
            font = CreateFont(-Scale(14), 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 5, 0, "Segoe UI");
            headingFont = CreateFont(-Scale(19), 0, 0, 0, 600, 0, 0, 0, 1, 0, 0, 5, 0, "Segoe UI");
            var cls = new WindowClass { Size = (uint)Marshal.SizeOf<WindowClass>(), Procedure = procedure,
                Instance = instance, Cursor = LoadCursor(0, 32512), Background = (nint)6, ClassName = className };
            if (RegisterClassEx(ref cls) == 0) throw new Win32Exception();
            var controls = new CommonControls { Size = 8, Classes = 0x20 };
            InitCommonControlsEx(ref controls);
            var bounds = new Rectangle { Right = Scale(460), Bottom = Scale(212) };
            const uint style = 0x00C00000; // Caption, with no close/minimize/maximize controls.
            AdjustWindowRectEx(ref bounds, style, false, 0);
            var width = bounds.Right - bounds.Left; var height = bounds.Bottom - bounds.Top;
            var work = new Rectangle(); SystemParametersInfo(0x30, 0, ref work, 0);
            window = CreateWindowEx(0, className, Text("title"), style,
                work.Left + (work.Right - work.Left - width) / 2, work.Top + (work.Bottom - work.Top - height) / 2,
                width, height, 0, 0, instance, 0);
            if (window == 0) throw new Win32Exception();
            nint Child(string type, string text, int x, int y, int w, int h, uint extra = 0, int id = 0) =>
                CreateWindowEx(0, type, text, 0x50000000 | extra, Scale(x), Scale(y), Scale(w), Scale(h), window, id, instance, 0);
            headingLabel = Child("STATIC", heading, 24, 18, 412, 30);
            detailLabel = Child("STATIC", detail, 24, 55, 412, 42);
            phaseLabel = Child("STATIC", phase, 24, 104, 412, 24);
            progress = Child("msctls_progress32", "", 24, 140, 412, 14, 8);
            closeButton = Child("BUTTON", Text("close"), 348, 172, 88, 28, 0x10001, 100);
            foreach (var control in new[] { detailLabel, phaseLabel, closeButton }) SendMessage(control, 0x30, font, 1);
            SendMessage(headingLabel, 0x30, headingFont, 1);
            SendMessage(progress, 0x40A, 1, 35);
            ShowWindow(closeButton, 0);
            var icons = new nint[1];
            if (ExtractIconEx(executable, 0, icons, null, 1) != 0)
            {
                icon = icons[0]; SendMessage(window, 0x80, 1, icon); SendMessage(window, 0x80, 0, icon);
            }
            ShowWindow(window, 4); // Show without stealing focus while the host shuts down.
            UpdateWindow(window);
            shown.Set();
            while (GetMessage(out var message, 0, 0, 0) > 0)
                if (!IsDialogMessage(window, ref message)) { TranslateMessage(ref message); DispatchMessage(ref message); }
        }
        catch (Exception error) { Console.Error.WriteLine(error.Message); }
        finally
        {
            if (window != 0) DestroyWindow(window);
            window = 0; shown.Set(); closed.Set();
            if (font != 0) DeleteObject(font); if (headingFont != 0) DeleteObject(headingFont);
            if (icon != 0) DestroyIcon(icon);
            UnregisterClass(className, instance);
        }
    }
    private nint WindowProc(nint hwnd, uint message, nuint wParam, nint lParam)
    {
        switch (message)
        {
            case Refresh:
                lock (gate)
                {
                    SetWindowText(headingLabel, heading); SetWindowText(detailLabel, detail); SetWindowText(phaseLabel, phase);
                    if (dismissible)
                    {
                        SendMessage(progress, 0x40A, 0, 0); ShowWindow(progress, 0); ShowWindow(closeButton, 5); SetFocus(closeButton);
                    }
                }
                return 0;
            case Finish: DestroyWindow(hwnd); return 0;
            case 0x10: if (dismissible) DestroyWindow(hwnd); return 0;
            case 0x111:
                if (dismissible && ((wParam & 0xffff) is 100 or 1 or 2)) DestroyWindow(hwnd);
                return 0;
            case 0x138: SetBkMode(wParam, 1); return GetSysColorBrush(5);
            case 2: PostQuitMessage(0); return 0;
            default: return DefWindowProc(hwnd, message, wParam, lParam);
        }
    }
    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate nint WindowProcedure(nint hwnd, uint message, nuint wParam, nint lParam);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WindowClass
    {
        public uint Size, Style; public WindowProcedure Procedure; public int ClassExtra, WindowExtra;
        public nint Instance, Icon, Cursor, Background; public string? MenuName, ClassName; public nint SmallIcon;
    }
    [StructLayout(LayoutKind.Sequential)] private struct Rectangle { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct CommonControls { public uint Size, Classes; }
    [StructLayout(LayoutKind.Sequential)] private struct Message
    {
        public nint Window; public uint Id; public nuint WParam; public nint LParam; public uint Time; public int X, Y; public uint Private;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern nint GetModuleHandle(string? name);
    [DllImport("user32.dll")] private static extern nint SetThreadDpiAwarenessContext(nint context);
    [DllImport("user32.dll")] private static extern uint GetDpiForSystem();
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern ushort RegisterClassEx(ref WindowClass value);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool UnregisterClass(string name, nint instance);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern nint LoadCursor(nint instance, nint name);
    [DllImport("comctl32.dll")] private static extern bool InitCommonControlsEx(ref CommonControls value);
    [DllImport("user32.dll")] private static extern bool AdjustWindowRectEx(ref Rectangle value, uint style, bool menu, uint extended);
    [DllImport("user32.dll")] private static extern bool SystemParametersInfo(uint action, uint parameter, ref Rectangle value, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern nint CreateWindowEx(uint extended, string type, string text, uint style, int x, int y, int width, int height, nint parent, nint menu, nint instance, nint parameter);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern nint DefWindowProc(nint hwnd, uint message, nuint wParam, nint lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern nint SendMessage(nint hwnd, uint message, nint wParam, nint lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool PostMessage(nint hwnd, uint message, nuint wParam, nint lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool SetWindowText(nint hwnd, string text);
    [DllImport("user32.dll")] private static extern bool ShowWindow(nint hwnd, int command);
    [DllImport("user32.dll")] private static extern bool UpdateWindow(nint hwnd);
    [DllImport("user32.dll")] private static extern bool DestroyWindow(nint hwnd);
    [DllImport("user32.dll")] private static extern nint SetFocus(nint hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetMessage(out Message value, nint hwnd, uint min, uint max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool IsDialogMessage(nint hwnd, ref Message value);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref Message value);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern nint DispatchMessage(ref Message value);
    [DllImport("user32.dll")] private static extern void PostQuitMessage(int code);
    [DllImport("user32.dll")] private static extern nint GetSysColorBrush(int index);
    [DllImport("gdi32.dll")] private static extern int SetBkMode(nuint dc, int mode);
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] private static extern nint CreateFont(int height, int width, int escapement, int orientation, int weight, uint italic, uint underline, uint strikeout, uint charset, uint output, uint clip, uint quality, uint pitch, string name);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(nint value);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern uint ExtractIconEx(string file, int index, nint[] large, nint[]? small, uint count);
    [DllImport("user32.dll")] private static extern bool DestroyIcon(nint icon);
}
