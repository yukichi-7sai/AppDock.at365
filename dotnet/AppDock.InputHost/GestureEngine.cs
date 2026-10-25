using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Threading;

namespace AppDock.InputHost;
internal sealed record Binding(string Id, string Command, string Gesture, string Title, string Window, Condition When, string? OwnerId = null);
internal sealed record Configuration(bool Enabled, string[] Browsers, string[] ExcludedProcesses,
    bool RequireChromiumWindowClass, int Distance, int WheelDelayMs, double IndicatorOpacity,
    string IndicatorPosition, Binding[] Rows, string Context, int Revision, string ExecutionMode = "all",
    bool ActivateOnStart = false, string SettingsKey = "", uint HostProcessId = 0, bool IndicatorShowNoAction = true,
    string IndicatorStyle = "compact", string IndicatorNoActionText = "アクション無し",
    string IndicatorMoreText = "ほか {count} 件");
internal enum GestureDirection { Up, Down, Left, Right }
[StructLayout(LayoutKind.Sequential)] internal readonly record struct GesturePoint(int X, int Y);

internal sealed class GestureEngine : IDisposable
{
    internal const nuint InputMarker = 0x365B012;
    private readonly Dispatcher dispatcher;
    private readonly DispatcherTimer timer;
    private nint target;
    private Configuration? config;
    private Binding[] candidates = [];
    private CommandHostContext hostContext = new();
    private CommandTargetContext? targetContext;
    private readonly GestureIndicatorNotifications indicator;
    private GesturePoint origin, checkpoint;
    private GesturePoint monitorCenter;
    private PendingStart? starting;
    private readonly List<GestureDirection> directions = new(2);
    private string previewGesture = "";
    private nint activationTarget;
    private long invokedAt;
    private bool activationUsed;
    private string process = "", session = "";
    private bool ready, cancelled, otherMode, busy, disposed;
    private readonly HashSet<uint> clicks = [], keys = [];
    private long lastWheel, lastRun;
    private bool wheelStarted;
    private int wheelDelta;
    private CancellationTokenSource? lifetime;
    internal Func<object, Task<System.Text.Json.JsonElement>>? Invoke;
    internal Func<object, Task<System.Text.Json.JsonElement>>? Prepare;
    internal Action<string>? Cancel;

    internal bool NeedsKeyboard => ready || keys.Count > 0 || config is {Enabled:true, Rows.Length:>0};
    internal bool NeedsMouse => ready || clicks.Count > 0 || config is {Enabled:true, Rows.Length:>0};
    internal Action? HooksChanged;
    internal GestureEngine(Dispatcher dispatcher, GestureIndicatorNotifications display)
    {
        this.dispatcher = dispatcher; indicator = display;
        timer = new DispatcherTimer(TimeSpan.FromMilliseconds(10), DispatcherPriority.Normal, (_,_) => Tick(), dispatcher);
        timer.Stop();
    }
    internal void Configure(Configuration next)
    {
        indicator?.Configure(next.Revision);
        hostContext = CommandConditions.HostContext(next.Context);
        // A show command may move focus to the host while its invocation is still completing.
        // Keep only that command alive across focus-only synchronization.
        if (busy && activationTarget != 0 && next.Enabled && next.SettingsKey.Length > 0 &&
            next.SettingsKey == config?.SettingsKey) { config = next; ReleaseHooksIfIdle(); return; }
        // A focus synchronization requested by this press may update its conditions while starting.
        // Actual settings/command changes still cancel, as do all later context changes.
        if (starting != null && next.Enabled && next.ActivateOnStart && next.SettingsKey.Length > 0 &&
            next.SettingsKey == config?.SettingsKey) { config = next; ReleaseHooksIfIdle(); return; }
        StopStart(false);
        CancelPending(); if (ready) cancelled = true;
        indicator?.Hide(); config = next;
        ReleaseHooksIfIdle();
    }
    private void ReleaseHooksIfIdle()
    {
        HooksChanged?.Invoke();
    }
    private bool Current => target != 0 && GetForegroundWindow() == target && IsWindowVisible(target);
    internal bool Valid(string id,string window) => activationTarget == 0 && id==session && target.ToInt64().ToString()==window && Current && !cancelled && lifetime is {IsCancellationRequested:false};
    private bool IntentionalForeground => busy && activationTarget != 0 &&
        (GetForegroundWindow() == activationTarget || GetForegroundWindow() == 0);
    internal (nint Source, uint Process)? ClaimActivation(string id, string source, nint destination)
    {
        if (!busy || Environment.TickCount64-invokedAt > 1500 || !Valid(id,source) ||
            config is not {HostProcessId:>0}) return null;
        GetWindowThreadProcessId(destination,out var owner);
        if (owner != config.HostProcessId) return null;
        activationTarget = destination;
        activationUsed = false;
        return (target, owner);
    }
    internal (nint Source, uint Process)? ConsumeActivation(string id, string source, nint destination)
    {
        if (!busy || cancelled || lifetime is not {IsCancellationRequested:false} || activationUsed ||
            Environment.TickCount64-invokedAt > 1500 || id != session || target.ToInt64().ToString() != source ||
            destination != activationTarget || (!Current && !IntentionalForeground) || !IsWindowVisible(destination)) return null;
        activationUsed = true;
        return (target, config!.HostProcessId);
    }
    private bool OnTarget(GesturePoint p) => GestureTarget.Matches(target, GestureTarget.At(p));
    private Binding[] MatchingRows(nint window, bool includeInactive = false)
    {
        var desktop = GestureTarget.IsDesktop(window);
        var className = new StringBuilder(256);
        var classLength = GetClassName(window, className, className.Capacity);
        targetContext = new(window.ToInt64().ToString(), process, classLength > 0 ? className.ToString() : null, desktop);
        var context = new CommandContext(hostContext, targetContext);
        var environment = new ConditionEnvironment(config!.Browsers, config.RequireChromiumWindowClass);
        return config!.Rows.Where(r =>
            (r.Window.Length == 0 || r.Window == window.ToInt64().ToString() || includeInactive && r.Window.Length > 0) &&
            (includeInactive && r.Window == "-1" || CommandConditions.Matches(r.When, context, r.OwnerId, environment))).ToArray();
    }
    private void Begin(GesturePoint p)
    {
        if (config is not {Enabled:true} || busy || HasStartBlocker()) return;
        var hit = GestureTarget.At(p);
        var foreground = GetForegroundWindow();
        if (hit == 0 || !IsWindowVisible(hit)) return;
        var same = GestureTarget.Matches(hit, foreground);
        if (!same && !config.ActivateOnStart) return;
        GetWindowThreadProcessId(hit, out var pid);
        using var instance = Process.GetProcessById((int)pid);
        process = instance.ProcessName.ToLowerInvariant();
        if (config.ExcludedProcesses.Contains(process,StringComparer.OrdinalIgnoreCase)) return;
        var hostWindow = pid == config.HostProcessId;
        var needsContext = false;
        if (config.ActivateOnStart && config.SettingsKey.Length > 0) {
            using var context = System.Text.Json.JsonDocument.Parse(config.Context);
            var knownWindow = context.RootElement.GetProperty("window").GetString();
            needsContext = hostWindow ? knownWindow != hit.ToInt64().ToString() : !string.IsNullOrEmpty(knownWindow);
        }
        target = same ? foreground : hit;
        var preparing = !same || needsContext;
        candidates = MatchingRows(target, preparing && config.ActivateOnStart && hostWindow);
        if (candidates.Length == 0) return;
        CancelPending(); lifetime = new(); session = Guid.NewGuid().ToString("N");
        origin = checkpoint = p; directions.Clear(); previewGesture=""; activationTarget=0; cancelled=false; otherMode=false;
        monitorCenter = GestureTarget.MonitorCenter(p);
        wheelDelta=0; wheelStarted=false; lastWheel=0; ready=true; timer.Start();
        if (preparing) {
            starting = new PendingStart(hit, foreground, hostWindow);
            _ = PrepareStartAsync(starting);
        }
    }
    private sealed class PendingStart(nint hit, nint source, bool hostWindow)
    {
        internal readonly nint Hit = hit, Source = source;
        internal readonly bool HostWindow = hostWindow;
        internal readonly long At = Environment.TickCount64;
        internal readonly CancellationTokenSource Cancellation = new();
        internal bool Released, Replay;
        internal GesturePoint ReleasePoint;
        internal string? Gesture;
        internal int Repeats;
    }
    private bool StartCurrent(PendingStart pending)
    {
        var foreground = GetForegroundWindow();
        return foreground == 0 || foreground == pending.Source || GestureTarget.Matches(pending.Hit, foreground);
    }
    private async Task PrepareStartAsync(PendingStart pending)
    {
        try {
            var activated = await Task.Run(() => GestureTarget.TryActivate(pending.Hit, pending.Source, pending.Cancellation.Token));
            if (pending.Cancellation.IsCancellationRequested) return;
            if (!activated) { await dispatcher.InvokeAsync(() => { if (starting == pending) StopStart(true); }); return; }
            var window = GetForegroundWindow();
            var prepared = Prepare == null || (await Prepare(new { window = window.ToInt64().ToString(), hostWindow = pending.HostWindow })).ValueKind == System.Text.Json.JsonValueKind.True;
            await dispatcher.InvokeAsync(() => {
                if (starting != pending || pending.Cancellation.IsCancellationRequested) return;
                if (!prepared || !GestureTarget.Matches(pending.Hit, GetForegroundWindow())) { StopStart(true); return; }
                target = GetForegroundWindow();
                candidates = MatchingRows(target);
                if (candidates.Length == 0) { StopStart(true); return; }
                starting = null;
                if (!cancelled && pending.Gesture != null) Run(pending.Gesture, pending.Repeats, pending.Released);
                else if (pending.Released && pending.Replay) ReplayRightClick(pending.ReleasePoint);
                if (!ready && !busy) timer.Stop();
            });
        } catch (Exception e) {
            Console.Error.WriteLine(e.Message);
            if (!dispatcher.HasShutdownStarted) await dispatcher.InvokeAsync(() => { if (starting == pending) StopStart(true); });
        } finally { pending.Cancellation.Dispose(); }
    }
    private void StopStart(bool fallback)
    {
        var pending = starting;
        if (pending == null) return;
        starting = null; pending.Cancellation.Cancel(); indicator.Hide();
        var restore = fallback && !cancelled && StartCurrent(pending) &&
            GetCursorPos(out var point) && GestureTarget.Matches(pending.Hit, GestureTarget.At(point));
        if (restore) {
            // Return the captured press to Windows; a still-held press gets its ordinary up later.
            var events = pending.Released ? new[] { MouseInput(8), MouseInput(16) } : new[] { MouseInput(8) };
            var sent = SendInput((uint)events.Length, events, Marshal.SizeOf<Input>());
            if (pending.Released && sent == 1) SendInput(1, [MouseInput(16)], Marshal.SizeOf<Input>());
            if (sent != events.Length) Console.Error.WriteLine("通常の右クリックを復元できませんでした。");
            ready = false;
        } else cancelled = true;
        CancelPending();
        if (!ready && !busy) timer.Stop();
        ReleaseHooksIfIdle();
    }
    internal nint Mouse(int code, uint message, nint data)
    {
        if (code < 0 || disposed) return 0;
        var input = Marshal.PtrToStructure<MouseData>(data);
        if (input.Extra == InputMarker) return 0;
        try {
            if ((message is 0x202 or 0x208) && clicks.Remove(message)) { ReleaseHooksIfIdle(); return 1; }
            if (message == 0x204 && !ready) { if (starting != null) StopStart(true); Begin(input.Point); if (ready) return 1; }
            else if (ready || starting != null) {
                if (starting is { } pending ? !StartCurrent(pending) : !Current && !IntentionalForeground) { cancelled=true; StopStart(false); CancelPending(); }
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
            if (!ready || up || cancelled || (starting is { } pending ? !StartCurrent(pending) : !Current)) return 0;
            var modifier = input.Key is 0x11 or 0xA2 or 0xA3 ? "Ctrl+" : input.Key is 0x12 or 0xA4 or 0xA5 ? "Alt+" : input.Key is 0x10 or 0xA0 or 0xA1 ? "Shift+" : null;
            if (modifier != null && candidates.Any(r=>r.Gesture.StartsWith("key:") && r.Gesture.Contains(modifier))) {
                keys.Add(input.Key); return 1;
            }
            var gesture = KeyGesture(input.Key);
            if (gesture != null && candidates.Any(r=>r.Gesture==gesture)) {
                // Pause is a down-only pulse; waiting for a paired up would capture
                // every later Pause, including ordinary input outside the gesture.
                if (input.Key != 0x13) keys.Add(input.Key);
                otherMode=true; lastWheel=0; indicator?.Hide(); Run(gesture); return 1;
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
        if (directions.Count > 0 && directions[^1] == next) return;
        if (directions.Count == 2) { cancelled=true; CancelPending(); indicator?.Hide(); return; }
        directions.Add(next.Value);
    }
    private string MovementGesture => "move-"+string.Join("-",directions.Select(d=>d.ToString().ToLowerInvariant()));
    private void Tick()
    {
        if (starting is { } pending) {
            if (!StartCurrent(pending)) { StopStart(false); return; }
            if (Environment.TickCount64 - pending.At > 1000) { StopStart(true); return; }
            if (ready && !otherMode && GetCursorPos(out var cursor)) Move(cursor);
            return;
        }
        if (!ready && !busy) {timer.Stop();return;}
        if (!Current && !IntentionalForeground) { cancelled=true; CancelPending(); }
        if (lastWheel != 0 && Environment.TickCount64-lastWheel >= 100) CancelPending();
        if (!ready) return;
        if (!otherMode && GetCursorPos(out var point)) Move(point);
        if (cancelled || otherMode || directions.Count == 0 || config!.IndicatorPosition == "none") { indicator?.Hide(); return; }
        var gesture = MovementGesture;
        if (indicator.IsVisible && previewGesture == gesture) return;
        var titles = SelectedRows(gesture).Select(r=>r.Title).ToArray();
        if (titles.Length == 0 && !config.IndicatorShowNoAction) { indicator.Hide(); return; }
        var captions = titles.Length == 0 ? new[] { config.IndicatorNoActionText } :
            titles.Take(3).Concat(titles.Length > 3 ? new[] { config.IndicatorMoreText.Replace("{count}", (titles.Length - 3).ToString()) } : []).ToArray();
        var center = origin;
        if (config!.IndicatorPosition == "monitor-center" || config.IndicatorPosition == "window-center" && GestureTarget.IsDesktop(target)) center = monitorCenter;
        else if (config.IndicatorPosition == "window-center" && GetWindowRect(target,out var rect)) center=new((rect.Left+rect.Right)/2,(rect.Top+rect.Bottom)/2);
        previewGesture = gesture;
        indicator.Display(center, process+".exe", directions.ToArray(), captions, config.IndicatorOpacity,
            config.IndicatorStyle,
            config.IndicatorStyle == "pill" ? PillCaptionRows : 0);
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
        if (busy || cancelled) return false;
        var rows=SelectedRows(gesture); if (rows.Length==0) return false;
        if (starting is { } pending) {
            if (pending.Gesture != null) return false;
            pending.Gesture = gesture; pending.Repeats = repeats; return true;
        }
        if (!Current) return false;
        if (lifetime == null || lifetime.IsCancellationRequested) { lifetime?.Dispose(); lifetime=new(); session=Guid.NewGuid().ToString("N"); }
        var token=lifetime.Token;
        var capturedSession=session; var capturedTarget=target.ToInt64().ToString();
        var capturedConfig=config!; var capturedContext=targetContext; var wheel=gesture.StartsWith("wheel-");
        busy=true;
        dispatcher.BeginInvoke(new Action(async () => {
            try {
                for (var i=0;i<repeats;i++) {
                    if (token.IsCancellationRequested || disposed || !Current || (!released && !ready) ||
                        (wheel && Environment.TickCount64-lastWheel>=100)) break;
                    invokedAt = Environment.TickCount64;
                    await Invoke!(new {session=capturedSession, window=capturedTarget, process, target=capturedContext,
                        gesture, rowIds=rows.Select(r=>r.Id).ToArray(), context=capturedConfig.Context,
                        revision=capturedConfig.Revision, settingsKey=capturedConfig.SettingsKey});
                    if (config!.WheelDelayMs>0) break;
                }
            } catch (Exception e) { Console.Error.WriteLine(e.Message); }
            finally { busy=false; activationTarget=0; }
        }));
        return true;
    }
    private Binding[] SelectedRows(string gesture)
    {
        // Candidates already passed the start-window, browser/exe and host page conditions.
        // Preview and execution must use the same ordered, command-deduplicated selection.
        return CommandConditions.Select(candidates.Where(r => r.Gesture == gesture), r => r.Command, config!.ExecutionMode);
    }
    // Reserve the largest displayed command batch for this start target before showing its first direction.
    private int PillCaptionRows => Math.Clamp(candidates.Where(row => row.Gesture.StartsWith("move-"))
        .Select(row => row.Gesture).Distinct().Select(gesture => SelectedRows(gesture).Length).DefaultIfEmpty(0).Max(), 1, 4);
    private void Release(GesturePoint point)
    {
        var replay=!otherMode && !cancelled && directions.Count==0;
        var stroke=!otherMode && !cancelled && directions.Count>0;
        if (stroke) Run(MovementGesture,released:true);
        else if (activationTarget == 0) CancelPending();
        ready=false; if (!busy) timer.Stop(); indicator?.Hide();
        if (starting is { } pending) {
            pending.Released = true; pending.Replay = replay; pending.ReleasePoint = point; timer.Start();
        } else if (replay) ReplayRightClick(point);
        ReleaseHooksIfIdle();
    }
    private void ReplayRightClick(GesturePoint point)
    {
        if (Current && OnTarget(point)) dispatcher.BeginInvoke(new Action(() => {
            if (Current && GetCursorPos(out var p) && OnTarget(p)) {
                var events=new[]{MouseInput(8),MouseInput(16)};
                var sent=SendInput(2,events,Marshal.SizeOf<Input>());
                if (sent==1) SendInput(1,[MouseInput(16)],Marshal.SizeOf<Input>());
                if (sent!=2) Console.Error.WriteLine("通常の右クリックを再送信できませんでした。");
            }
        }));
    }
    private void CancelPending()
    {
        if (lifetime is {IsCancellationRequested:false}) { lifetime.Cancel(); if (session.Length>0) Cancel?.Invoke(session); }
    }
    public void Dispose()
    {
        disposed=true; StopStart(false); CancelPending(); lifetime?.Dispose(); timer.Stop();
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
