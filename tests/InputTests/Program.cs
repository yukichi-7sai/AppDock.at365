using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using AppDock.Runtime;
using System.Windows.Forms;

internal static partial class Program
{
    private static int failures;
    [STAThread] static int Main(string[] args)
    {
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        if(args is ["--external-gesture",var exchange]) return RunExternalGesture(exchange);
        if(args is ["--shortcuts",var shortcutHelper]) return RunShortcutTests(shortcutHelper);
        if(args is ["--gesture-key-state",var gestureAssembly]) return RunGestureKeyStateTests(gestureAssembly);
        if(args is ["--gesture-popups",var popupAssembly]) return RunGesturePopupTests(popupAssembly);
        if(args is ["--lock-keys",var lockKeyAssembly]) return RunLockKeyTests(lockKeyAssembly);
        if(args is ["--input-queue",var inputQueueAssembly]) return RunInputQueueTests(inputQueueAssembly);
        if(args is ["--input-blocking",var inputBlockingAssembly]) return RunInputBlockingTests(inputBlockingAssembly);
        if(args is ["--indicator-notices",var indicatorAssembly]) return RunIndicatorNoticeTests(indicatorAssembly);
        if(args is ["--indicator-stages",var indicatorTarget,var indicatorHandle,var indicatorExchange]) return RunIndicatorStages(indicatorTarget,indicatorHandle,indicatorExchange);
        if(args is ["--desktop-indicator-stages",var desktopTarget,var desktopIndicator,var desktopExchange]) return RunIndicatorStages(desktopTarget,desktopIndicator,desktopExchange,true);
        if(args is ["--send" or "--send-inactive",var handle,var action]) {
            var sendCursor=Cursor.Position;
            Action? releaseBlocker=null;
            Probe? inactiveProbe=null;
            void Pause(int milliseconds) {
                var deadline=Environment.TickCount64+milliseconds;
                do {if(inactiveProbe!=null)Application.DoEvents();Thread.Sleep(5);}while(Environment.TickCount64<deadline);
            }
            try {
                nint window;
                if (handle.StartsWith("pid:")) {
                    var pid=int.Parse(handle[4..]); window=GetForegroundWindow();
                    GetWindowThreadProcessId(window,out var foregroundPid);
                    if (foregroundPid!=pid) window=Process.GetProcessById(pid).MainWindowHandle;
                } else window=new nint(long.Parse(handle));
                var focusDeadline=Environment.TickCount64+2000;
                do {FocusWindow(window);Thread.Sleep(50);} while(GetForegroundWindow()!=window && Environment.TickCount64<focusDeadline);
                if(GetForegroundWindow()!=window) throw new Exception($"Input target {handle}/{window} did not become foreground (actual {GetForegroundWindow()}).");
                if(args[0]=="--send-inactive") {
                    inactiveProbe=new Probe{Text="AppDock isolated inactive-start source",StartPosition=FormStartPosition.Manual,Location=Screen.PrimaryScreen!.WorkingArea.Location,Size=new(180,120)};
                    inactiveProbe.Show();FocusTarget(inactiveProbe);Application.DoEvents();Thread.Sleep(120);
                    if(GetForegroundWindow()!=inactiveProbe.Handle)throw new Exception("Inactive-start source did not become foreground.");
                }
                GetWindowRect(window,out var rect);Cursor.Position=new(rect.Left+350,rect.Top+330);Thread.Sleep(40);
                var hovered=GetAncestor(WindowFromPoint(Cursor.Position),2);
                var held=string.Join(",",new[]{0x10,0x11,0x12,0x5B,0x5C,0x01,0x02,0x04,0x05,0x06}.Where(k=>(GetAsyncKeyState(k)&0x8000)!=0).Select(k=>k.ToString("X")));
                Console.WriteLine($"Input preflight: target={window}, foreground={GetForegroundWindow()}, hovered={hovered}, held={held}, cursor={Cursor.Position}, action={action}");
                if(hovered!=window)throw new Exception("Input pointer did not reach the target window.");
                ushort modifier=action switch {"blocked:left-ctrl"=>0xA2,"blocked:right-ctrl"=>0xA3,"blocked:left-alt"=>0xA4,"blocked:right-alt"=>0xA5,"blocked:left-shift"=>0xA0,"blocked:right-shift"=>0xA1,"blocked:left-win"=>0x5B,"blocked:right-win"=>0x5C,_=>0};
                if(modifier!=0){releaseBlocker=()=>ReleaseModifier(modifier);Key(modifier);}
                else if(action=="blocked:left"){releaseBlocker=()=>Mouse(4);Mouse(2);}
                else if(action=="blocked:middle"){releaseBlocker=()=>Mouse(0x40);Mouse(0x20);}
                else if(action is "blocked:x1" or "blocked:x2"){var button=action=="blocked:x1"?1:2;releaseBlocker=()=>Mouse(0x100,button);Mouse(0x80,button);}
                Pause(60);Mouse(8);Pause(50);
                if(releaseBlocker!=null){
                    releaseBlocker();Thread.Sleep(40);
                    Cursor.Position=new(Cursor.Position.X-85,Cursor.Position.Y);Thread.Sleep(60);Mouse(0x800,120);
                }
                if(action.StartsWith("move-")) {
                    foreach(var direction in action[5..].Split('-')) {
                        var offset=direction switch {"up"=>new System.Drawing.Point(0,-85),"down"=>new(0,85),"left"=>new(-85,0),"right"=>new(85,0),_=>throw new Exception("Unknown move direction: "+direction)};
                        Cursor.Position=new(Cursor.Position.X+offset.X,Cursor.Position.Y+offset.Y);Pause(60);
                    }
                }
                else if(action=="key:A"){Key(0x41);Thread.Sleep(80);Key(0x41,true);}
                else if(action=="key:Ctrl+A"){Key(0x11);Thread.Sleep(20);Key(0x41);Thread.Sleep(80);Key(0x41,true);Key(0x11,true);}
                else if(action=="click-left"){Mouse(2);Thread.Sleep(80);Mouse(4);}
                else if(action=="wheel-up")Mouse(0x800,120);
                Pause(100);Mouse(16);Pause(150);return 0;
            }finally{Mouse(16);releaseBlocker?.Invoke();inactiveProbe?.Dispose();Cursor.Position=sendCursor;}
        }
        using var form=new Probe(); form.Text="AppDock isolated gesture test";form.StartPosition=FormStartPosition.CenterScreen;form.Size=new(720,500);
        var original=Cursor.Position;
        form.Shown+=async(_,_)=>{try{await Run(form,args[0]);}catch(Exception e){Console.Error.WriteLine(e);failures++;}finally{
            try {Mouse(0x10);Mouse(0x04);Mouse(0x40);Key(0x41,true);Cursor.Position=original;}
            catch(Exception e){Console.Error.WriteLine("Input cleanup: "+e.Message);}
            form.Close();}};
        Application.Run(form);return failures==0?0:1;
    }
    private static async Task Run(Probe form,string helper)
    {
        // Install before the worker: observe what it forwards before another gesture app can consume it.
        using var passthrough = new RightButtonProbe();
        using var child=Process.Start(new ProcessStartInfo(helper){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true})!;
        var errors=child.StandardError.ReadToEndAsync();
        await using var peer=new JsonRpcConnection(child.StandardOutput,child.StandardInput);
        var invocations=new List<string>();var selections=new List<string[]>();var cancellations=0;var delay=0;
        var indicatorLock=new object();JsonElement indicatorNotice=default;
        Func<JsonElement,Task>? invocationAction=null;
        var reading=peer.ReadAsync(async(method,p)=>{
            if(method=="gestures.indicator"){lock(indicatorLock)indicatorNotice=p.Clone();return null;}
            if(method=="gestures.prepare") return true;
            if(method=="gestures.cancel"){Interlocked.Increment(ref cancellations);return null;}
            if(method!="gestures.invoke")throw new Exception(method);
            lock(invocations){
                invocations.Add(p.GetProperty("gesture").GetString()!);
                selections.Add(p.GetProperty("rowIds").EnumerateArray().Select(r=>r.GetString()!).ToArray());
            }
            if(delay>0)await Task.Delay(delay);
            if(invocationAction!=null)await invocationAction(p);
            return null;
        });
        int Count(){lock(invocations)return invocations.Count;}
        string[] LastRows(){lock(invocations)return selections[^1];}
        async Task Sync(string scope="global",string[]? excluded=null,bool enabled=true,int interval=0,string window="",string mode="all",string position="gesture-start",bool selection=false,
            bool activate=false,bool excludeDesktop=false,string? processOverride=null,bool? showNoAction=null,bool unmatched=false,string[]? onlyTriggers=null,bool handoff=false,string context="test"){
            var directions=new[]{"up","down","left","right"};
            var triggers=directions.Select(d=>"move-"+d)
                .Concat(directions.SelectMany(a=>directions.Where(b=>a!=b).Select(b=>$"move-{a}-{b}")))
                .Concat(new[]{"click-left","click-middle","wheel-up","wheel-down","key:A","key:Ctrl+A"}).ToArray();
            if(unmatched) triggers=["move-left"];
            if(onlyTriggers!=null) triggers=onlyTriggers;
            var process=processOverride??Process.GetCurrentProcess().ProcessName.ToLowerInvariant();
            object Row(string id,string command,string gesture,string title,string rowScope="global",string rowWindow="",string? exe=null)=>
                new{id,command,gesture,title,window=rowWindow,when=new{scope=rowScope,appletIds=Array.Empty<string>(),processes=new[]{exe??process},excludeDesktop}};
            var rows = triggers.Select((g,i)=>Row("r"+i,"test.run",g,"Test "+g,scope,window)).ToArray();
            if(selection) rows=triggers.SelectMany(g=>new[]{
                Row("wrong-window-"+g,"test.wrong-window",g,"Wrong window",rowWindow:activate?"-1":"1"),
                Row("wrong-exe-"+g,"test.wrong-exe",g,"Wrong exe","exe",exe:"nonexistent-process"),
                Row("first-"+g,"test.first",g,"First","exe"),
                Row("second-"+g,"test.second",g,"Second"),
                Row("duplicate-"+g,"test.first",g,"Duplicate")}).ToArray();
            var configuration=JsonSerializer.SerializeToNode(new{enabled,browsers=new[]{process},excludedProcesses=excluded??[],requireChromiumWindowClass=false,distance=30,wheelDelayMs=interval,executionMode=mode,indicatorOpacity=.45,indicatorPosition=position,activateOnStart=activate,hostProcessId=activate||handoff?Environment.ProcessId:0,context,revision=1,rows,settingsKey=handoff?new string('a',64):""})!;
            if(showNoAction.HasValue) configuration["indicatorShowNoAction"]=showNoAction.Value;
            await peer.RequestAsync("gestures.sync",configuration,CancellationToken.None);
            await Task.Delay(70);
        }
        async Task Begin(){var deadline=Environment.TickCount64+2000;do{FocusTarget(form);await Task.Delay(80);}while(GetForegroundWindow()!=form.Handle&&Environment.TickCount64<deadline);if(GetForegroundWindow()!=form.Handle)throw new Exception("Gesture fixture did not become foreground: "+InputFocusDiagnostic());Cursor.Position=form.PointToScreen(new(330,220));Mouse(8);await Task.Delay(25);}
        async Task End(){Mouse(16);await Task.Delay(150);}
        void Check(bool condition,string name){Console.WriteLine((condition?"PASS ":"FAIL ")+name);if(!condition)failures++;}
        try{
            await Sync();
            var n=Count();var right=0;await Begin();Cursor.Position=new(Cursor.Position.X-80,Cursor.Position.Y);await Task.Delay(70);await End();
            // The first input/pipe round trip can outlast the fixed key-release wait.
            // Await its result without sending the gesture again.
            var firstDeadline=Environment.TickCount64+2000;
            while(Count()==n && Environment.TickCount64<firstDeadline)await Task.Delay(20);
            GetWindowThreadProcessId(GetForegroundWindow(),out var firstForegroundPid);
            Console.WriteLine($"First stroke: received={Count()-n}, foreground={GetForegroundWindow()==form.Handle}, foregroundProcess={Process.GetProcessById((int)firstForegroundPid).ProcessName}");
            Check(Count()==n+1 && invocations[^1]=="move-left","single stroke on release");
            JsonElement IndicatorNotice(){lock(indicatorLock)return indicatorNotice;}
            bool IndicatorVisible(){var notice=IndicatorNotice();return notice.ValueKind==JsonValueKind.Object&&notice.GetProperty("visible").GetBoolean();}
            string IndicatorCaption(){
                var notice=IndicatorNotice();
                return notice.ValueKind==JsonValueKind.Object&&notice.TryGetProperty("captions",out var captions)?
                    string.Join("|",captions.EnumerateArray().Select(value=>value.GetString())):"";
            }
            bool IndicatorDirections(params string[] directions){
                var notice=IndicatorNotice();return notice.ValueKind==JsonValueKind.Object&&notice.TryGetProperty("directions",out var values)&&
                    values.EnumerateArray().Select(value=>value.GetString()).SequenceEqual(directions);
            }
            bool IndicatorCenteredOnMonitor(System.Drawing.Point origin){
                var notice=IndicatorNotice();var bounds=Screen.FromPoint(origin).Bounds;
                return IndicatorVisible()&&notice.GetProperty("x").GetInt32()==(bounds.Left+bounds.Right)/2&&
                    notice.GetProperty("y").GetInt32()==(bounds.Top+bounds.Bottom)/2;
            }
            async Task Step(string direction,int distance=80) {
                var offset=direction switch {"up"=>new System.Drawing.Point(0,-distance),"down"=>new(0,distance),"left"=>new(-distance,0),_=>new(distance,0)};
                Cursor.Position=new(Cursor.Position.X+offset.X,Cursor.Position.Y+offset.Y);await Task.Delay(60);
            }
            var moveNames=new[]{"up","down","left","right"};
            foreach(var first in moveNames) foreach(var second in moveNames.Where(d=>d!=first)) {
                n=Count();await Begin();await Step(first);
                Check(Count()==n,$"{first}-{second} first stage waits for release");
                await Step(second);
                var previewDeadline=Environment.TickCount64+1000;
                while((!IndicatorVisible()||!IndicatorCaption().Contains($"Test move-{first}-{second}"))&&Environment.TickCount64<previewDeadline)await Task.Delay(20);
                var preview=IndicatorVisible();
                Check(preview&&IndicatorDirections(first,second),$"{first}-{second} notice updates both direction IDs");
                Check(Count()==n,$"{first}-{second} second stage waits for release");
                await End();Check(Count()==n+1&&invocations[^1]==$"move-{first}-{second}",$"{first}-{second} executes only the complete path");
            }
            n=Count();await Begin();await Step("right");await Step("right");await Step("up",29);await End();
            Check(Count()==n+1&&invocations[^1]=="move-right","continued direction and sub-threshold drift stay a single stage");
            await Sync(onlyTriggers:["move-left"],showNoAction:false);n=Count();right=form.RightUps;
            await Begin();await Step("left");Check(IndicatorVisible(),"assigned prefix is visible");
            await Step("up");Check(!IndicatorVisible(),"unassigned second stage hides the old preview");
            await End();Check(Count()==n&&form.RightUps==right,"unassigned pair never falls back to the prefix or a right click");
            await Sync(onlyTriggers:["move-up-down"],showNoAction:false);n=Count();
            await Begin();await Step("up");Check(!IndicatorVisible(),"unassigned prefix stays hidden");
            await Step("down");Check(IndicatorVisible(),"assigned pair appears after an unassigned prefix");
            await End();Check(Count()==n+1&&invocations[^1]=="move-up-down","pair-only binding executes after reversal");
            foreach(bool? showNoAction in new bool?[]{null,true,false}){
                await Sync(showNoAction:showNoAction,unmatched:true);n=Count();right=form.RightUps;
                await Begin();Cursor.Position=new(Cursor.Position.X+80,Cursor.Position.Y);
                var previewDeadline=Environment.TickCount64+500;
                while(!IndicatorVisible()&&Environment.TickCount64<previewDeadline)await Task.Delay(20);
                var preview=IndicatorVisible();var name=showNoAction?.ToString()??"legacy";
                Check((preview)==(showNoAction!=false),name+" no-action preview visibility");
                if(preview)Check(IndicatorCaption().Contains("アクション無し"),name+" no-action preview caption");
                await End();Check(Count()==n&&form.RightUps==right,name+" unmatched stroke neither executes nor replays a right click");
            }
            await Sync(showNoAction:false);n=Count();await Begin();Cursor.Position=new(Cursor.Position.X-80,Cursor.Position.Y);
            var matchedDeadline=Environment.TickCount64+1000;
            while(!IndicatorVisible()&&Environment.TickCount64<matchedDeadline)await Task.Delay(20);
            var matchedPreview=IndicatorVisible();
            Check(matchedPreview&&IndicatorCaption().Contains("Test move-left"),"no-action preview off still displays a matched action");
            await End();Check(Count()==n+1,"no-action preview off still executes a matched action");
            right=form.RightUps;await Begin();await End();Check(form.RightUps==right+1,"no-action preview off retains ordinary right click replay");
            foreach(var mode in new[]{"all","first"}){
                await Sync(mode:mode,selection:true);n=Count();await Begin();Cursor.Position=new(Cursor.Position.X-80,Cursor.Position.Y);
                var showDeadline=Environment.TickCount64+2000;
                while(!IndicatorVisible()&&Environment.TickCount64<showDeadline)await Task.Delay(20);
                var overlay=IndicatorVisible();Check(overlay,mode+" preview is visible");
                if(overlay){var caption=IndicatorCaption();Check(caption.Contains("First")&&!caption.Contains("Wrong")&&caption.Contains("Duplicate")== (mode=="all")&&caption.Contains("Second")== (mode=="all"),mode+" preview contains exactly selected rows");}
                await End();
                var expected=mode=="first"?new[]{"first-move-left"}:new[]{"first-move-left","second-move-left","duplicate-move-left"};
                Check(Count()==n+1&&LastRows().SequenceEqual(expected),mode+" stroke preserves conditions and each saved row");
                n=Count();await Begin();await Step("right");await Step("up");await End();
                expected=mode=="first"?new[]{"first-move-right-up"}:new[]{"first-move-right-up","second-move-right-up","duplicate-move-right-up"};
                Check(Count()==n+1&&LastRows().SequenceEqual(expected),mode+" two-step preserves conditions and each saved row");
                foreach(var gesture in new[]{"click-left","click-middle","wheel-up","key:A"}){
                    n=Count();await Begin();
                    if(gesture=="click-left"){Mouse(2);await Task.Delay(60);Mouse(4);}
                    else if(gesture=="click-middle"){Mouse(0x20);await Task.Delay(60);Mouse(0x40);}
                    else if(gesture=="wheel-up")Mouse(0x800,120);
                    else{Key(0x41);Key(0x41,true);}
                    await Task.Delay(60);await End();
                    expected=mode=="first"?new[]{"first-"+gesture}:new[]{"first-"+gesture,"second-"+gesture,"duplicate-"+gesture};
                    Check(Count()==n+1&&LastRows().SequenceEqual(expected),mode+" selection for "+gesture);
                }
            }
            await Sync(mode:"first",position:"none",selection:true);n=Count();await Begin();Cursor.Position=new(Cursor.Position.X-80,Cursor.Position.Y);await Task.Delay(150);
            Check(!IndicatorVisible(),"hidden indicator does not create a visible waiting window");await End();
            Check(Count()==n+1&&LastRows().SequenceEqual(new[]{"first-move-left"}),"hidden indicator retains gesture recognition and execution");
            await Sync(activate:true,selection:true,mode:"first",position:"none");n=Count();await Begin();Cursor.Position=new(Cursor.Position.X-80,Cursor.Position.Y);await End();
            Check(Count()==n+1&&LastRows().SequenceEqual(new[]{"first-move-left"}),"active host never selects rows reserved for activation preparation");
            await Sync(position:"monitor-center"); n=Count(); await Begin();
            var startPoint=Cursor.Position; Cursor.Position=new(Cursor.Position.X-80,Cursor.Position.Y);
            var indicatorDeadline=Environment.TickCount64+2000;
            while(!IndicatorVisible()&&Environment.TickCount64<indicatorDeadline)await Task.Delay(20);
            Check(IndicatorVisible()&&IndicatorCenteredOnMonitor(startPoint),"monitor-center uses the monitor containing the initial cursor");
            await End(); Check(Count()==n+1,"monitor-center retains execution");
            Check(AppDock.InputHost.GestureTarget.IsDesktop(GetShellWindow()),"Shell desktop is classified as desktop");
            Check(!AppDock.InputHost.GestureTarget.IsDesktop(form.Handle),"ordinary window is not classified as desktop");
            await Sync(scope:"desktop");n=Count();right=form.RightUps;await Begin();await End();
            Check(Count()==n&&form.RightUps==right+1,"desktop-only row does not capture an ordinary window");
            foreach(var scope in new[]{"global","exe"}){
                await Sync(scope:scope,excludeDesktop:true);n=Count();await Begin();Cursor.Position=new(Cursor.Position.X-80,Cursor.Position.Y);await End();
                Check(Count()==n+1,scope+" desktop exclusion retains ordinary windows");
            }
            using(var other=new Probe()){
                other.StartPosition=FormStartPosition.Manual;other.Location=Screen.PrimaryScreen!.WorkingArea.Location;other.Size=new(180,120);other.Show();
                foreach(var activate in new[]{false,true}){
                    await Sync(activate:activate,position:"none");n=Count();FocusTarget(other);await Task.Delay(80);
                    Cursor.Position=form.PointToScreen(new(330,220));right=form.RightUps;Mouse(8);
                    var activationDeadline=Environment.TickCount64+700;
                    while(GetForegroundWindow()!=form.Handle&&Environment.TickCount64<activationDeadline)await Task.Delay(10);
                    Cursor.Position=new(Cursor.Position.X-80,Cursor.Position.Y);await Task.Delay(100);await End();
                    Check(Count()==n+(activate?1:0),activate?"inactive window activates and starts on the same press":"disabled activation preserves ordinary inactive-window click");
                    if(!activate)Check(form.RightUps==right+1,"inactive ordinary click retains its paired up");
                }
                await Sync(activate:true,position:"none");FocusTarget(other);await Task.Delay(80);Cursor.Position=form.PointToScreen(new(330,220));
                right=form.RightUps;Mouse(8);await Task.Delay(150);await End();
                Check(form.RightUps==right+1,"activation followed by no gesture restores one ordinary right click");
            }
            form.Hide();await Task.Delay(100);
            var desktopPoint=DesktopPoint();Check(desktopPoint!=null,"a real desktop surface is available for input verification");
            if(desktopPoint is { } desktop){
                foreach(var scope in new[]{"desktop","exe"}){
                    await DismissDesktopContextMenu();
                    await Sync(scope:scope,activate:true,position:"window-center",processOverride:"explorer");n=Count();
                    Check(AppDock.InputHost.GestureTarget.IsDesktop(AppDock.InputHost.GestureTarget.At(new(desktop.X,desktop.Y))),scope+" input starts on the desktop surface");
                    Cursor.Position=desktop;Mouse(8);await Task.Delay(150);Cursor.Position=new(desktop.X-80,desktop.Y);
                    indicatorDeadline=Environment.TickCount64+2000;
                    while(!IndicatorVisible()&&Environment.TickCount64<indicatorDeadline)await Task.Delay(20);
                    Check(IndicatorVisible()&&IndicatorCenteredOnMonitor(desktop),scope+" desktop window-center falls back to the starting monitor center");
                    await End();Check(Count()==n+1,scope+" matches the real desktop");
                    await DismissDesktopContextMenu();
                }
                foreach(var scope in new[]{"global","exe"}){
                    await Sync(scope:scope,activate:true,excludeDesktop:true,processOverride:"explorer");n=Count();var downs=passthrough.Downs;
                    Cursor.Position=desktop;Mouse(8);await Task.Delay(100);await End();Key(0x1B);Key(0x1B,true);await Task.Delay(80);
                    Check(Count()==n&&passthrough.Downs==downs+1,scope+" desktop exclusion bypasses gesture capture from right-down");
                }
            }
            var folderFixture=await OpenFolderFixture();
            try {
                Check(!AppDock.InputHost.GestureTarget.IsDesktop(folderFixture.Window),"actual Explorer folder is distinct from the desktop");
                foreach(var scope in new[]{"desktop","global","exe"}) {
                    await Sync(scope:scope,excludeDesktop:scope!="desktop",position:"none",processOverride:"explorer");n=Count();
                    FocusWindow(folderFixture.Window);await Task.Delay(100);GetWindowRect(folderFixture.Window,out var folderRect);
                    Cursor.Position=new((folderRect.Left+folderRect.Right)/2,(folderRect.Top+folderRect.Bottom)/2);
                    Check(GetAncestor(WindowFromPoint(Cursor.Position),2)==folderFixture.Window,"Explorer input reaches its own folder surface");
                    Mouse(8);await Task.Delay(50);Cursor.Position=new(Cursor.Position.X-80,Cursor.Position.Y);await Task.Delay(80);await End();
                    Key(0x1B);Key(0x1B,true);await Task.Delay(40);
                    Check(Count()==n+(scope=="desktop"?0:1),scope+" desktop handling preserves the actual Explorer folder");
                }
            } finally { await CloseFolderFixture(folderFixture.Window,folderFixture.Folder); }
            FocusTarget(form);await Task.Delay(80);
            await Sync();
            right=form.RightUps;await Begin();await End();Check(form.RightUps==right+1,"ordinary right click replay");
            async Task BlockedStart(string name,Action press,Action release,int stateKey,bool releaseEarly)
            {
                FocusTarget(form);await Task.Delay(80);Cursor.Position=form.PointToScreen(new(330,220));
                var before=Count();var downs=form.RightDowns;var ups=form.RightUps;
                try {
                    press();await Task.Delay(60);
                    Check((GetAsyncKeyState(stateKey)&0x8000)!=0,name+" blocker is held");
                    Mouse(8);await Task.Delay(40);
                    Console.WriteLine($"{name}: right-down delta={form.RightDowns-downs}, foreground={GetForegroundWindow()==form.Handle}");Check(form.RightDowns==downs+1,name+" right-down passes immediately");
                    if(releaseEarly){release();await Task.Delay(40);}
                    Cursor.Position=new(Cursor.Position.X-80,Cursor.Position.Y);await Task.Delay(60);
                    Mouse(0x800,120);await Task.Delay(60);await End();
                    Console.WriteLine($"{name}: right-up delta={form.RightUps-ups}, invocation delta={Count()-before}");Check(Count()==before && form.RightUps==ups+1,name+" bypasses stroke/wheel and passes right-up"+(releaseEarly?" after early release":" while held"));
                } finally {Mouse(16);release();await Task.Delay(60);}
            }
            // Both sides are real OS inputs, including the extended right Ctrl/Alt keys.
            foreach(var modifier in new (ushort Key,string Name)[]{(0xA2,"left Ctrl"),(0xA3,"right Ctrl"),(0xA4,"left Alt"),(0xA5,"right Alt"),(0xA0,"left Shift"),(0xA1,"right Shift"),(0x5B,"left Win"),(0x5C,"right Win")})
                foreach(var early in new[]{false,true})
                    await BlockedStart(modifier.Name,()=>Key(modifier.Key),()=>ReleaseModifier(modifier.Key),modifier.Key,early);
            foreach(var button in new (uint Down,uint Up,int Data,int Key,string Name)[]{(2,4,0,GetSystemMetrics(23)!=0?2:1,"left button"),(0x20,0x40,0,4,"middle button"),(0x80,0x100,1,5,"X1 button"),(0x80,0x100,2,6,"X2 button")})
                foreach(var early in new[]{false,true})
                    await BlockedStart(button.Name,()=>Mouse(button.Down,button.Data),()=>Mouse(button.Up,button.Data),button.Key,early);
            n=Count();await Begin();Key(0xA2);await Task.Delay(20);Key(0x41);await Task.Delay(80);Key(0x41,true);await End();
            Check(Count()==n+1 && invocations[^1]=="key:Ctrl+A","modifier pressed after right-down remains a key gesture");
            n=Count();var down=passthrough.Downs;await Begin();
            Console.WriteLine($"Captured Ctrl: worker-forwarded right-down delta={passthrough.Downs-down}, invocation delta={Count()-n}");
            Check(passthrough.Downs==down+1,"captured Ctrl still held prevents a new waiting session");
            Key(0xA2,true);Cursor.Position=new(Cursor.Position.X-80,Cursor.Position.Y);await Task.Delay(60);await End();
            Check(Count()==n,"captured Ctrl release does not start a gesture mid-press");
            n=Count();await Begin();Mouse(2);await Task.Delay(80);await End();
            Check(Count()==n+1,"left click gesture starts normally before captured-button test");
            n=Count();down=passthrough.Downs;await Begin();
            Console.WriteLine($"Captured left: worker-forwarded right-down delta={passthrough.Downs-down}, invocation delta={Count()-n}");
            Check(passthrough.Downs==down+1,"captured left button still held prevents a new waiting session");
            Mouse(4);Cursor.Position=new(Cursor.Position.X-80,Cursor.Position.Y);await Task.Delay(60);await End();
            Check(Count()==n,"captured button release does not start a gesture mid-press");
            n=Count();await Begin();Cursor.Position=new(Cursor.Position.X-80,Cursor.Position.Y);await Task.Delay(70);await End();
            Check(Count()==n+1 && invocations[^1]=="move-left","plain right gesture resumes after blockers are released");
            n=Count();right=form.RightUps;await Begin();await Step("left");await Step("up");await Step("right");await Step("left");await End();Check(Count()==n&&form.RightUps==right,"third direction cancels until release without replay or fallback");
            n=Count();var left=form.LeftUps;await Begin();Mouse(2);await Task.Delay(100);await End();Mouse(4);await Task.Delay(60);Check(Count()==n+1 && form.LeftUps==left,"left click and release after right are consumed");
            n=Count();await Begin();Mouse(0x20);await Task.Delay(80);Mouse(0x40);await End();Check(Count()==n+1 && invocations[^1]=="click-middle","middle click");
            n=Count();var key=form.Keys;await Begin();Key(0x41);Key(0x41);await Task.Delay(80);await End();Key(0x41,true);await Task.Delay(50);Check(Count()==n+1 && form.Keys==key,"key repeat and paired key-up consumed");
            key=form.Keys;Key(0x41);Key(0x41,true);await Task.Delay(60);Check(form.Keys>key,"ordinary key passes outside gesture");
            n=Count();await Begin();Mouse(0x800,60);await Task.Delay(20);Mouse(0x800,60);await Task.Delay(60);Mouse(0x800,-120);await Task.Delay(60);await End();Check(Count()==n+2,"high-resolution wheel accumulation and reverse direction");
            await Sync(interval:400);n=Count();await Begin();Mouse(0x800,120);await Task.Delay(90);Mouse(0x800,-120);await Task.Delay(100);await End();Check(Count()==n+1,"wheel cooldown drops rather than queues");
            await Sync();delay=250;n=Count();await Begin();Mouse(0x800,120);await Task.Delay(30);for(var i=0;i<5;i++)Mouse(0x800,120);await End();await Task.Delay(300);Check(Count()==n+1,"busy wheel has no backlog");delay=0;
            n=Count();await Begin();await Sync(enabled:false);Cursor.Position=new(Cursor.Position.X-80,Cursor.Position.Y);await End();Check(Count()==n,"settings change cancels waiting gesture");
            await Sync(excluded:[Process.GetCurrentProcess().ProcessName.ToLowerInvariant()]);n=Count();right=form.RightUps;await Begin();await End();Check(Count()==n && form.RightUps==right+1,"excluded process passes normal clicks");
            await Sync(scope:"browser");n=Count();await Begin();Mouse(0x800,120);await Task.Delay(80);await End();Check(Count()==n+1,"browser process condition without Chromium restriction");
            await Sync(scope:"exe");n=Count();await Begin();Mouse(0x20);await Task.Delay(80);Mouse(0x40);await End();Check(Count()==n+1,"specified exe condition");
            await Sync(window:"1");n=Count();await Begin();Mouse(0x800,120);await End();Check(Count()==n,"wrong host window never captures");
            await Sync();n=Count();await Begin();using(var other=new Probe()){other.Show();other.Activate();SetForegroundWindow(other.Handle);await Task.Delay(80);Mouse(0x800,120);await End();}Check(Count()==n,"foreground change cancels");
            Check(cancellations>0,"session cancellation notifications");
            using var destination=new Probe{Text="AppDock foreground destination",Inactive=true};
            using var unrelated=new Probe{Text="AppDock unrelated foreground"};
            destination.Show();destination.Hide();
            foreach(var scenario in new[]{"normal","external-change","expired"}) {
                await Sync(handoff:true);var completion=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                invocationAction=async p=>{
                    try {
                        var id=p.GetProperty("session").GetString()!;var source=p.GetProperty("window").GetString()!;
                        object Request(string session,string from,nint to)=>new{session,source=from,window=to.ToString()};
                        async Task<bool> Prepare(string session,string from,nint to)=>(await peer.RequestAsync("gestures.prepareActivation",Request(session,from,to),CancellationToken.None)).GetBoolean();
                        async Task<bool> Activate()=>(await peer.RequestAsync("gestures.activate",Request(id,source,destination.Handle),CancellationToken.None)).GetBoolean();
                        if(scenario=="expired") {await Task.Delay(1550);Check(!await Prepare(id,source,destination.Handle),"expired gesture cannot claim foreground transfer");return;}
                        Check(!await Prepare("invalid",source,destination.Handle),"unknown gesture cannot claim foreground transfer");
                        Check(!await Prepare(id,"1",destination.Handle),"wrong start HWND cannot claim foreground transfer");
                        Check(!await Prepare(id,source,GetShellWindow()),"foreign process cannot be the gesture foreground destination");
                        Check(await Prepare(id,source,destination.Handle),"live gesture prepares its hidden host window");
                        var cancelledBefore=cancellations;
                        await form.InvokeAsync(()=>destination.Show());
                        Check(GetForegroundWindow()==form.Handle,"showing the destination alone preserves source foreground");
                        Check(await Activate(),"prepared gesture activates its host window");
                        var foregroundDeadline=Environment.TickCount64+500;
                        while(GetForegroundWindow()!=destination.Handle&&Environment.TickCount64<foregroundDeadline)await Task.Delay(10);
                        Check(GetForegroundWindow()==destination.Handle,"foreground transfer changes the actual OS foreground");
                        Check(!await Activate(),"gesture foreground transfer is single use");
                        await Sync(handoff:true,context:"after-handoff");await Task.Delay(100);
                        Check(cancellations==cancelledBefore,"intentional focus and focus-only sync do not cancel the command");
                        Check(!(await peer.RequestAsync("gestures.valid",new{session=id,window=source},CancellationToken.None)).GetBoolean(),"foreground transfer stops later commands on the old target");
                        if(scenario=="external-change"){
                            await form.InvokeAsync(()=>FocusTarget(unrelated));await Task.Delay(100);
                            Check(cancellations>cancelledBefore,"unrelated foreground change still cancels the command");
                        }
                    } catch(Exception error) {completion.TrySetException(error);throw;}
                    finally {completion.TrySetResult();}
                };
                await Begin();await Step("left");await End();await completion.Task.WaitAsync(TimeSpan.FromSeconds(5));
                invocationAction=null;destination.Hide();unrelated.Hide();
            }
        }finally{child.StandardInput.Close();await reading;await child.WaitForExitAsync();Console.Write(await errors);}
    }
    private sealed class Probe:Form {public bool Inactive;protected override bool ShowWithoutActivation=>Inactive;public int RightDowns,RightUps,LeftUps,Keys;protected override void WndProc(ref Message m){if(m.Msg is 0x204 or 0x206)RightDowns++;if(m.Msg==0x205)RightUps++;if(m.Msg==0x202)LeftUps++;if(m.Msg==0x100)Keys++;base.WndProc(ref m);}}
    private sealed class RightButtonProbe : IDisposable
    {
        private readonly MouseCallback callback;
        private readonly nint hook;
        internal int Downs;
        internal RightButtonProbe(){
            callback=(code,message,data)=>{if(code>=0&&message==0x204)Interlocked.Increment(ref Downs);return CallNextHookEx(hook,code,message,data);};
            hook=SetWindowsHookEx(14,callback,GetModuleHandle(null),0);
            if(hook==0)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
        public void Dispose()=>UnhookWindowsHookEx(hook);
    }
    private delegate nint MouseCallback(int code,uint message,nint data);
    [DllImport("user32.dll",SetLastError=true)]private static extern nint SetWindowsHookEx(int kind,MouseCallback callback,nint module,uint thread);
    [DllImport("user32.dll")]private static extern bool UnhookWindowsHookEx(nint hook);
    [DllImport("user32.dll")]private static extern nint CallNextHookEx(nint hook,int code,uint message,nint data);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]private static extern nint GetModuleHandle(string? name);
    [DllImport("user32.dll")]private static extern bool IsWindowVisible(nint window);
    private static void FocusTarget(Form form) {
        form.Show(); form.Activate(); FocusWindow(form.Handle);
    }
    private static void FocusWindow(nint window) {
        // The --send thread has no Form/message loop yet; AttachThreadInput needs a queue.
        PeekMessage(out _,0,0,0,0);
        var thread = GetWindowThreadProcessId(GetForegroundWindow(), out _);
        var own = GetCurrentThreadId();
        var targetThread = GetWindowThreadProcessId(window, out _);
        var attached = thread != 0 && thread != own && AttachThreadInput(own, thread, true);
        var targetAttached = targetThread != 0 && targetThread != own && targetThread != thread && AttachThreadInput(own, targetThread, true);
        try { BringWindowToTop(window); SetForegroundWindow(window); }
        finally {
            if(targetAttached) AttachThreadInput(own, targetThread, false);
            if(attached) AttachThreadInput(own, thread, false);
        }
    }
    [StructLayout(LayoutKind.Sequential)]private struct NativeMessage{public nint Window;public uint Message;public nuint WParam;public nint LParam;public uint Time;public int X,Y;public uint Private;}
    [DllImport("user32.dll")]private static extern bool PeekMessage(out NativeMessage message,nint window,uint min,uint max,uint flags);
    [DllImport("kernel32.dll")]private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")]private static extern bool AttachThreadInput(uint a,uint b,bool attach);
    private static void Mouse(uint flags,int data=0){if(SendInput(1,[new(){Union=new(){Mouse=new(){Flags=flags,Data=unchecked((uint)data)}}}],Marshal.SizeOf<Input>())!=1)throw new Exception("SendInput mouse failed: "+Marshal.GetLastWin32Error());}
    private static void Key(ushort key,bool up=false)=>SendInput(1,[new(){Type=1,Union=new(){Key=new(){Key=key,Flags=(up?2u:0)|(key is 0xA3 or 0xA5 or 0x5B or 0x5C?1u:0)}}}],Marshal.SizeOf<Input>());
    [StructLayout(LayoutKind.Sequential)]private struct Input{public uint Type;public Union Union;}
    [StructLayout(LayoutKind.Explicit)]private struct Union{[FieldOffset(0)]public MouseEvent Mouse;[FieldOffset(0)]public KeyEvent Key;}
    [StructLayout(LayoutKind.Sequential)]private struct MouseEvent{public int X,Y;public uint Data,Flags,Time;public nuint Extra;}
    [StructLayout(LayoutKind.Sequential)]private struct KeyEvent{public ushort Key,Scan;public uint Flags,Time;public nuint Extra;}
    [DllImport("user32.dll",SetLastError=true)]private static extern uint SendInput(uint count,Input[] inputs,int size);
    // Ctrl around Win-up prevents the test from opening the Start menu.
    private static void ReleaseModifier(ushort key) {
        if(key is 0x5B or 0x5C)Key(0xA2);
        Key(key,true);
        if(key is 0x5B or 0x5C)Key(0xA2,true);
    }
    [DllImport("user32.dll")]private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")]private static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")]private static extern nint WindowFromPoint(System.Drawing.Point point);
    [DllImport("user32.dll")]private static extern nint GetAncestor(nint window,uint flags);
    [DllImport("user32.dll")]private static extern bool BringWindowToTop(nint handle);
    [DllImport("user32.dll")]private static extern bool SetForegroundWindow(nint handle);
    [DllImport("user32.dll")]private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")]private static extern uint GetWindowThreadProcessId(nint handle,out uint pid);
    [StructLayout(LayoutKind.Sequential)]private struct Rect{public int Left,Top,Right,Bottom;}
    [DllImport("user32.dll")]private static extern bool GetWindowRect(nint handle,out Rect rect);
}
