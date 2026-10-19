using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Threading;

namespace AppDock.InputHost;
internal sealed record Condition(string Scope, string[] AppletIds, string[] Processes);
internal sealed record Binding(string Id, string Command, string Gesture, string Title, string Window, Condition When);
internal sealed record Configuration(bool Enabled, string[] Browsers, string[] ExcludedProcesses,
    bool RequireChromiumWindowClass, int Distance, int WheelDelayMs, double IndicatorOpacity,
    string IndicatorPosition, Binding[] Rows, string Context, int Revision, string ExecutionMode = "all");
internal enum GestureDirection { Up, Down, Left, Right }
[StructLayout(LayoutKind.Sequential)] internal readonly record struct GesturePoint(int X, int Y);
internal static class GestureConfiguration { internal static readonly string[] Marks = ["⬆️","⬇️","⬅️","➡️"]; }

internal sealed class GestureEngine : IDisposable
{
    internal const nuint InputMarker = 0x365B012;
    private readonly Dispatcher dispatcher;
    private readonly DispatcherTimer timer;
    private nint target;
    private Configuration? config;
    private Binding[] candidates = [];
    private readonly GestureDisplay indicator;
    private GesturePoint origin, checkpoint;
    private GestureDirection? direction;
    private string process = "", session = "";
    private bool ready, cancelled, otherMode, busy, disposed;
    private readonly HashSet<uint> clicks = [], keys = [];
    private long lastWheel, lastRun;
    private bool wheelStarted;
    private int wheelDelta;
    private CancellationTokenSource? lifetime;
    internal Func<object, Task<System.Text.Json.JsonElement>>? Invoke;
    internal Action<string>? Cancel;

    internal bool NeedsKeyboard => ready || keys.Count > 0 || config is {Enabled:true, Rows.Length:>0};
    internal bool NeedsMouse => ready || clicks.Count > 0 || config is {Enabled:true, Rows.Length:>0};
    internal Action? HooksChanged;
    internal GestureEngine(Dispatcher dispatcher, GestureDisplay display)
    {
        this.dispatcher = dispatcher; indicator = display;
        timer = new DispatcherTimer(TimeSpan.FromMilliseconds(10), DispatcherPriority.Normal, (_,_) => Tick(), dispatcher);
        timer.Stop();
    }
    internal void Configure(Configuration next)
    {
        CancelPending(); if (ready) cancelled = true;
        indicator?.Hide(); config = next;
        ReleaseHooksIfIdle();
    }
    private void ReleaseHooksIfIdle()
    {
        HooksChanged?.Invoke();
    }
    private bool Current => target != 0 && GetForegroundWindow() == target && IsWindowVisible(target);
    internal bool Valid(string id,string window) => id==session && target.ToInt64().ToString()==window && Current && !cancelled && lifetime is {IsCancellationRequested:false};
    private bool OnTarget(GesturePoint p) => GetAncestor(WindowFromPoint(p),2) == target;
    private void Begin(GesturePoint p)
    {
        if (config is not {Enabled:true} || busy || HasStartBlocker()) return;
        target = GetForegroundWindow();
        if (target == 0 || !OnTarget(p)) return;
        GetWindowThreadProcessId(target, out var pid);
        using var instance = Process.GetProcessById((int)pid);
        process = instance.ProcessName.ToLowerInvariant();
        if (config.ExcludedProcesses.Contains(process,StringComparer.OrdinalIgnoreCase)) return;
        var className = new StringBuilder(256); GetClassName(target,className,className.Capacity);
        candidates = config.Rows.Where(r =>
            (r.Window.Length == 0 || r.Window == target.ToInt64().ToString()) &&
            (r.When.Scope != "browser" || config.Browsers.Contains(process,StringComparer.OrdinalIgnoreCase) &&
                (!config.RequireChromiumWindowClass || className.ToString().StartsWith("Chrome_WidgetWin_",StringComparison.Ordinal))) &&
            (r.When.Scope != "exe" || r.When.Processes.Contains(process,StringComparer.OrdinalIgnoreCase))).ToArray();
        if (candidates.Length == 0) return;
        CancelPending(); lifetime = new(); session = Guid.NewGuid().ToString("N");
        origin = checkpoint = p; direction=null; cancelled=false; otherMode=false;
        wheelDelta=0; wheelStarted=false; lastWheel=0; ready=true; timer.Start();
    }
    internal nint Mouse(int code, uint message, nint data)
    {
        if (code < 0 || disposed) return 0;
        var input = Marshal.PtrToStructure<MouseData>(data);
        if (input.Extra == InputMarker) return 0;
        try {
            if ((message is 0x202 or 0x208) && clicks.Remove(message)) { ReleaseHooksIfIdle(); return 1; }
            if (message == 0x204 && !ready) { Begin(input.Point); if (ready) return 1; }
            else if (ready) {
                if (!Current) { cancelled=true; CancelPending(); }
                if (!otherMode && message is 0x200 or 0x205) Move(input.Point);
                if (message is 0x201 or 0x207) {
                    var gesture = message == 0x201 ? "click-left" : "click-middle";
                    clicks.Add(message+1); otherMode=true; lastWheel=0; indicator?.Hide();
                    if (!cancelled) Run(gesture); return 1;
                }
                if (message == 0x20A) { Wheel(unchecked((short)(input.Data>>16))); return 1; }
                if (message == 0x205) { Release(input.Point); return 1; }
                if (message == 0x204) return 1;
            }
        } catch (Exception e) { Console.Error.WriteLine(e); cancelled=true; CancelPending(); }
        return 0;
    }
    internal nint Keyboard(int code, uint message, nint data)
    {
        if (code < 0 || disposed) return 0;
        var input = Marshal.PtrToStructure<KeyData>(data);
        if (input.Extra == InputMarker) return 0;
        try {
            var up = message is 0x101 or 0x105;
            if (up && keys.Remove(input.Key)) { ReleaseHooksIfIdle(); return 1; }
            if (keys.Contains(input.Key)) return 1; // OS repeat, including after right release.
            if (!ready || up || cancelled || !Current) return 0;
            var modifier = input.Key is 0x11 or 0xA2 or 0xA3 ? "Ctrl+" : input.Key is 0x12 or 0xA4 or 0xA5 ? "Alt+" : input.Key is 0x10 or 0xA0 or 0xA1 ? "Shift+" : null;
            if (modifier != null && candidates.Any(r=>r.Gesture.StartsWith("key:") && r.Gesture.Contains(modifier))) {
                keys.Add(input.Key); return 1;
            }
            var gesture = KeyGesture(input.Key);
            if (gesture != null && candidates.Any(r=>r.Gesture==gesture)) {
                keys.Add(input.Key); otherMode=true; lastWheel=0; indicator?.Hide(); Run(gesture); return 1;
            }
            if (input.Key == 0x1B) { keys.Add(input.Key); cancelled=true; CancelPending(); indicator?.Hide(); return 1; }
        } catch (Exception e) { Console.Error.WriteLine(e); cancelled=true; CancelPending(); }
        return 0;
    }
    private string? KeyGesture(uint key)
    {
        string? name = key switch {
            >= 0x41 and <= 0x5A or >= 0x30 and <= 0x39 => ((char)key).ToString(),
            >= 0x70 and <= 0x87 => "F"+(key-0x6F),
            0x20=>"Space",0x09=>"Tab",0x0D=>"Enter",0x1B=>"Escape",0x08=>"Backspace",0x2E=>"Delete",
            0x2D=>"Insert",0x24=>"Home",0x23=>"End",0x21=>"PageUp",0x22=>"PageDown",
            0x25=>"Left",0x26=>"Up",0x27=>"Right",0x28=>"Down",0x13=>"Pause",
            >=0x60 and <=0x69 => (key-0x60).ToString(),0x6B=>"Plus",0x6D=>"-",0x6E=>".",0x6F=>"/",
            0xBC=>",",0xBE=>".",0xBF=>"/",0xDC=>"\\",0xBA=>";",0xDB=>"[",0xDD=>"]",0xDE=>"'",0xBD=>"-",0xBB=>Pressed(0x10)||keys.Overlaps([0x10u,0xA0u,0xA1u])?"Plus":"=",_=>null};
        if (name == null || Pressed(0x5B) || Pressed(0x5C)) return null;
        return "key:"+(Pressed(0x11)||keys.Overlaps([0x11u,0xA2u,0xA3u])?"Ctrl+":"")+(Pressed(0x12)||keys.Overlaps([0x12u,0xA4u,0xA5u])?"Alt+":"")+(Pressed(0x10)||keys.Overlaps([0x10u,0xA0u,0xA1u])?"Shift+":"")+name;
    }
    private static bool Pressed(int key) => (GetAsyncKeyState(key)&0x8000)!=0;
    private bool HasStartBlocker()
    {
        // Captured downs do not reach the OS key state until their paired release.
        if (keys.Overlaps([0x10u,0x11u,0x12u,0xA0u,0xA1u,0xA2u,0xA3u,0xA4u,0xA5u]) || clicks.Count > 0) return true;
        // GetAsyncKeyState uses physical mouse buttons; the hook uses logical buttons.
        var leftButton = GetSystemMetrics(23) != 0 ? 0x02 : 0x01; // SM_SWAPBUTTON
        return Pressed(0x10) || Pressed(0x11) || Pressed(0x12) || Pressed(0x5B) || Pressed(0x5C) ||
            Pressed(leftButton) || Pressed(0x04) || Pressed(0x05) || Pressed(0x06);
    }
    private void Move(GesturePoint p)
    {
        if (cancelled) return;
        var d = config!.Distance;
        GestureDirection? next = p.Y < checkpoint.Y-d ? GestureDirection.Up : p.Y > checkpoint.Y+d ? GestureDirection.Down :
            p.X < checkpoint.X-d ? GestureDirection.Left : p.X > checkpoint.X+d ? GestureDirection.Right : null;
        if (next == null) return;
        checkpoint=p;
        if (direction != null && direction != next) { cancelled=true; CancelPending(); indicator?.Hide(); return; }
        direction=next;
    }
    private void Tick()
    {
        if (!ready && !busy) {timer.Stop();return;}
        if (!Current) { cancelled=true; CancelPending(); }
        if (lastWheel != 0 && Environment.TickCount64-lastWheel >= 100) CancelPending();
        if (!ready) return;
        if (!otherMode && GetCursorPos(out var point)) Move(point);
        if (cancelled || otherMode || direction == null || config!.IndicatorPosition == "none") { indicator?.Hide(); return; }
        if (indicator.IsVisible) return;
        var titles = SelectedRows("move-"+direction.ToString()!.ToLowerInvariant()).Select(r=>r.Title).ToArray();
        var caption = string.Join("\n",titles.Take(3)) + (titles.Length>3 ? $"\nほか {titles.Length-3} 件" : "");
        var center = origin;
        if (config!.IndicatorPosition == "window-center" && GetWindowRect(target,out var rect)) center=new((rect.Left+rect.Right)/2,(rect.Top+rect.Bottom)/2);
        indicator.Display(center,process+".exe",direction.Value,caption.Length==0?"アクション無し":caption,config.IndicatorOpacity);
    }
    private void Wheel(int delta)
    {
        if (cancelled || delta == 0) return;
        otherMode=true; indicator?.Hide(); lastWheel=Environment.TickCount64; wheelDelta+=delta;
        var count=Math.Abs(wheelDelta)/120; if (count==0) return;
        var gesture=wheelDelta>0?"wheel-up":"wheel-down"; wheelDelta%=120;
        if (wheelStarted && lastWheel-lastRun < config!.WheelDelayMs) return;
        if (Run(gesture,count)) { lastRun=lastWheel; wheelStarted=true; }
    }
    private bool Run(string gesture, int repeats=1, bool released=false)
    {
        if (busy || cancelled || !Current) return false;
        var rows=SelectedRows(gesture); if (rows.Length==0) return false;
        if (lifetime == null || lifetime.IsCancellationRequested) { lifetime?.Dispose(); lifetime=new(); session=Guid.NewGuid().ToString("N"); }
        var token=lifetime.Token;
        var capturedSession=session; var capturedTarget=target.ToInt64().ToString();
        var capturedConfig=config!; var wheel=gesture.StartsWith("wheel-");
        busy=true;
        dispatcher.BeginInvoke(new Action(async () => {
            try {
                for (var i=0;i<repeats;i++) {
                    if (token.IsCancellationRequested || disposed || !Current || (!released && !ready) ||
                        (wheel && Environment.TickCount64-lastWheel>=100)) break;
                    await Invoke!(new {session=capturedSession, window=capturedTarget, process,
                        gesture, rowIds=rows.Select(r=>r.Id).ToArray(), context=capturedConfig.Context, revision=capturedConfig.Revision});
                    if (config!.WheelDelayMs>0) break;
                }
            } catch (Exception e) { Console.Error.WriteLine(e.Message); }
            finally { busy=false; }
        }));
        return true;
    }
    private Binding[] SelectedRows(string gesture)
    {
        // Candidates already passed the start-window, browser/exe and host page conditions.
        // Preview and execution must use the same ordered, command-deduplicated selection.
        var rows = candidates.Where(r => r.Gesture == gesture).DistinctBy(r => r.Command);
        return (config!.ExecutionMode == "first" ? rows.Take(1) : rows).ToArray();
    }
    private void Release(GesturePoint point)
    {
        var replay=!otherMode && !cancelled && direction==null;
        var stroke=!otherMode && !cancelled && direction!=null;
        if (stroke) Run("move-"+direction.ToString()!.ToLowerInvariant(),released:true);
        else CancelPending();
        ready=false; if (!busy) timer.Stop(); indicator?.Hide();
        if (replay && Current && OnTarget(point)) dispatcher.BeginInvoke(new Action(() => {
            if (Current && GetCursorPos(out var p) && OnTarget(p)) {
                var events=new[]{MouseInput(8),MouseInput(16)};
                var sent=SendInput(2,events,Marshal.SizeOf<Input>());
                if (sent==1) SendInput(1,[MouseInput(16)],Marshal.SizeOf<Input>());
                if (sent!=2) Console.Error.WriteLine("通常の右クリックを再送信できませんでした。");
            }
        }));
        ReleaseHooksIfIdle();
    }
    private void CancelPending()
    {
        if (lifetime is {IsCancellationRequested:false}) { lifetime.Cancel(); if (session.Length>0) Cancel?.Invoke(session); }
    }
    public void Dispose()
    {
        disposed=true; CancelPending(); lifetime?.Dispose(); timer.Stop();
        indicator?.Close();
    }
    private static Input MouseInput(uint flags)=>new(){Union=new(){Mouse=new(){Flags=flags,Extra=InputMarker}}};
    [StructLayout(LayoutKind.Sequential)] private struct MouseData {public GesturePoint Point; public uint Data,Flags,Time; public nuint Extra;}
    [StructLayout(LayoutKind.Sequential)] private struct KeyData {public uint Key,Scan,Flags,Time; public nuint Extra;}
    [StructLayout(LayoutKind.Sequential)] private struct Input {public uint Type; public InputUnion Union;}
    [StructLayout(LayoutKind.Explicit)] private struct InputUnion {[FieldOffset(0)] public MouseEvent Mouse; [FieldOffset(0)] public KeyEvent Key;}
    [StructLayout(LayoutKind.Sequential)] private struct MouseEvent {public int X,Y; public uint Data,Flags,Time; public nuint Extra;}
    [StructLayout(LayoutKind.Sequential)] private struct KeyEvent {public ushort Key,Scan; public uint Flags,Time; public nuint Extra;}
    [StructLayout(LayoutKind.Sequential)] private struct WindowRect {public int Left,Top,Right,Bottom;}
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint window);
    [DllImport("user32.dll")] private static extern nint WindowFromPoint(GesturePoint p);
    [DllImport("user32.dll")] private static extern nint GetAncestor(nint window,uint flags);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window,out uint pid);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern int GetClassName(nint window,StringBuilder name,int size);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out GesturePoint point);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(nint window,out WindowRect rect);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll",SetLastError=true)] private static extern uint SendInput(uint count,Input[] inputs,int size);
}
