using System.IO;
using System.Text.Json;
using System.Runtime.InteropServices;
using System.Windows.Forms;

internal static partial class Program
{
    // Mouse-only handshake lets the browser test inspect a live gesture before release.
    private static int RunIndicatorStages(string targetText, string overlayText, string exchange, bool desktop = false, bool external = false)
    {
        var original=Cursor.Position;
        using var externalWindow=external?new Probe { Text="AppDock isolated topmost competitor",Inactive=true,StartPosition=FormStartPosition.Manual,Size=new(160,100) }:null;
        var source=new nint(long.Parse(targetText));
        var sourceWasTopmost=false;
        var promoted=false;
        var rightHeld=false;
        void Pause(int milliseconds) {
            var until=Environment.TickCount64+milliseconds;
            do {Application.DoEvents();Thread.Sleep(5);}while(Environment.TickCount64<until);
        }
        try
        {
            var target=source;
            var overlay=new nint(long.Parse(overlayText));
            if(IsWindowVisible(overlay))throw new Exception("Indicator must be hidden before its topmost state is removed.");
            if(!SetIndicatorWindowPos(overlay,new nint(-2),0,0,0,0,0x13) || (GetIndicatorWindowLong(overlay,-20)&8)!=0)
                throw new Exception("Could not remove the hidden indicator's topmost state.");
            if(!desktop){
                sourceWasTopmost=(GetIndicatorWindowLong(source,-20)&8)!=0;
                if(!SetIndicatorWindowPos(source,new nint(-1),0,0,0,0,0x13))throw new Exception("Could not promote the isolated gesture target.");
                promoted=true;
            }
            var deadline=Environment.TickCount64+2000;
            do {FocusWindow(target);Pause(40);} while(GetForegroundWindow()!=target && Environment.TickCount64<deadline);
            if(GetForegroundWindow()!=target)throw new Exception("Indicator target did not become foreground.");
            GetWindowRect(target,out var bounds);
            var sourcePoint=new System.Drawing.Point(bounds.Left+80,bounds.Top+200);
            Cursor.Position=new((bounds.Left+bounds.Right)/2,(bounds.Top+bounds.Bottom)/2);
            if(externalWindow!=null){
                externalWindow.Location=new(Cursor.Position.X+50,Cursor.Position.Y+10);
                externalWindow.Show();
                if(!SetIndicatorWindowPos(externalWindow.Handle,new nint(-1),0,0,0,0,0x13))throw new Exception("Could not promote the isolated competing window.");
                Application.DoEvents();
            }
            if(desktop){
                var point=DesktopIndicatorPoint()??throw new Exception("No desktop surface is available for the two-stage gesture.");
                Cursor.Position=point;target=AppDock.InputHost.GestureTarget.At(new(point.X,point.Y));
            }
            Pause(80);
            bool Above(nint other) {
                for(var window=GetIndicatorWindow(other,3);window!=0;window=GetIndicatorWindow(window,3))
                    if(window==overlay)return true;
                return false;
            }
            void Stage(string name)
            {
                var visibleUntil=Environment.TickCount64+2000;
                while((!IsWindowVisible(overlay) || (GetIndicatorWindowLong(overlay,-20)&8)==0 || !Above(target) || externalWindow!=null && !Above(externalWindow.Handle))
                    && Environment.TickCount64<visibleUntil)Pause(10);
                if(!IsWindowVisible(overlay))throw new Exception("Indicator did not appear: "+InputFocusDiagnostic());
                var sourceUncovered=GetAncestor(WindowFromPoint(sourcePoint),2)==source;
                if(desktop&&!sourceUncovered)throw new Exception("Desktop activation covered the source window.");
                File.WriteAllText(Path.Combine(exchange,name+".json"),JsonSerializer.Serialize(new {
                    foreground=GetForegroundWindow().ToInt64(),target=target.ToInt64(),
                    targetMatched=AppDock.InputHost.GestureTarget.Matches(target,GetForegroundWindow()),
                    sourceUncovered,
                    desktop,centerX=(Screen.FromPoint(Cursor.Position).Bounds.Left+Screen.FromPoint(Cursor.Position).Bounds.Right)/2,
                    centerY=(Screen.FromPoint(Cursor.Position).Bounds.Top+Screen.FromPoint(Cursor.Position).Bounds.Bottom)/2,
                    overlayFlags=overlay==0?0:GetIndicatorWindowLong(overlay,-20),
                    overlayAboveTarget=Above(target),
                    overlayAboveExternal=externalWindow==null || Above(externalWindow.Handle),
                    externalTopmost=externalWindow!=null && (GetIndicatorWindowLong(externalWindow.Handle,-20)&8)!=0,
                    targetTopmost=(GetIndicatorWindowLong(source,-20)&8)!=0,
                    overlayDemotedBeforeStart=true,external
                }));
                var until=Environment.TickCount64+15000;
                while(!File.Exists(Path.Combine(exchange,name+".continue")) && Environment.TickCount64<until)Pause(10);
                if(Environment.TickCount64>=until)throw new Exception("Indicator stage timed out: "+name);
                if(!AppDock.InputHost.GestureTarget.Matches(target,GetForegroundWindow()))throw new Exception("Indicator stole or lost the gesture target focus.");
            }
            if(desktop)DismissDesktopContextMenu().GetAwaiter().GetResult();
            Mouse(8);rightHeld=true;Pause(80);
            if(desktop){
                deadline=Environment.TickCount64+2000;
                while(!AppDock.InputHost.GestureTarget.Matches(target,GetForegroundWindow())&&Environment.TickCount64<deadline)Pause(10);
            }
            Cursor.Position=new(Cursor.Position.X+85,Cursor.Position.Y);Pause(120);Stage("one");
            Cursor.Position=new(Cursor.Position.X,Cursor.Position.Y-85);Pause(120);Stage("two");
            Mouse(16);rightHeld=false;Pause(120);
            File.WriteAllText(Path.Combine(exchange,"released"),"ok");
            return 0;
        }
        catch(Exception error){File.WriteAllText(Path.Combine(exchange,"helper-failure.txt"),error.ToString());Console.Error.WriteLine(error);return 1;}
        finally {
            if(rightHeld)Mouse(16);Cursor.Position=original;
            if(promoted)SetIndicatorWindowPos(source,new nint(sourceWasTopmost?-1:-2),0,0,0,0,0x13);
            if(desktop)DismissDesktopContextMenu().GetAwaiter().GetResult();
        }
    }
    private static System.Drawing.Point? DesktopIndicatorPoint()
    {
        foreach(var screen in Screen.AllScreens)
            for(var y=screen.WorkingArea.Top+160;y<screen.WorkingArea.Bottom-100;y+=100)
                for(var x=screen.WorkingArea.Right-180;x>screen.WorkingArea.Left+180;x-=100){
                    if(new[]{new AppDock.InputHost.GesturePoint(x,y),new(x+85,y),new(x+85,y-85)}.All(point=>AppDock.InputHost.GestureTarget.IsDesktop(AppDock.InputHost.GestureTarget.At(point))))return new(x,y);
                }
        return null;
    }
    [DllImport("user32.dll",EntryPoint="GetWindowLongW")]private static extern int GetIndicatorWindowLong(nint window,int index);
    [DllImport("user32.dll",EntryPoint="GetWindow")]private static extern nint GetIndicatorWindow(nint window,uint command);
    [DllImport("user32.dll",EntryPoint="SetWindowPos")]private static extern bool SetIndicatorWindowPos(nint window,nint after,int x,int y,int width,int height,uint flags);
}
