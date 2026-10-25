using System.IO;
using System.Text.Json;
using System.Runtime.InteropServices;
using System.Windows.Forms;

internal static partial class Program
{
    // Mouse-only handshake lets the browser test inspect a live gesture before release.
    private static int RunIndicatorStages(string targetText, string overlayText, string exchange, bool desktop = false)
    {
        var original=Cursor.Position;
        try
        {
            var target=new nint(long.Parse(targetText));
            var source=target;
            var overlay=new nint(long.Parse(overlayText));
            var deadline=Environment.TickCount64+2000;
            do {FocusWindow(target);Thread.Sleep(40);} while(GetForegroundWindow()!=target && Environment.TickCount64<deadline);
            if(GetForegroundWindow()!=target)throw new Exception("Indicator target did not become foreground.");
            GetWindowRect(target,out var bounds);
            var sourcePoint=new System.Drawing.Point(bounds.Left+80,bounds.Top+200);
            Cursor.Position=new((bounds.Left+bounds.Right)/2,(bounds.Top+bounds.Bottom)/2);
            if(desktop){
                var point=DesktopIndicatorPoint()??throw new Exception("No desktop surface is available for the two-stage gesture.");
                Cursor.Position=point;target=AppDock.InputHost.GestureTarget.At(new(point.X,point.Y));
            }
            Thread.Sleep(80);
            void Stage(string name)
            {
                var sourceUncovered=GetAncestor(WindowFromPoint(sourcePoint),2)==source;
                if(desktop&&!sourceUncovered)throw new Exception("Desktop activation covered the source window.");
                File.WriteAllText(Path.Combine(exchange,name+".json"),JsonSerializer.Serialize(new {
                    foreground=GetForegroundWindow().ToInt64(),target=target.ToInt64(),
                    targetMatched=AppDock.InputHost.GestureTarget.Matches(target,GetForegroundWindow()),
                    sourceUncovered,
                    desktop,centerX=(Screen.FromPoint(Cursor.Position).Bounds.Left+Screen.FromPoint(Cursor.Position).Bounds.Right)/2,
                    centerY=(Screen.FromPoint(Cursor.Position).Bounds.Top+Screen.FromPoint(Cursor.Position).Bounds.Bottom)/2,
                    overlayFlags=overlay==0?0:GetIndicatorWindowLong(overlay,-20)
                }));
                var until=Environment.TickCount64+15000;
                while(!File.Exists(Path.Combine(exchange,name+".continue")) && Environment.TickCount64<until)Thread.Sleep(10);
                if(Environment.TickCount64>=until)throw new Exception("Indicator stage timed out: "+name);
                if(!AppDock.InputHost.GestureTarget.Matches(target,GetForegroundWindow()))throw new Exception("Indicator stole or lost the gesture target focus.");
            }
            Mouse(8);Thread.Sleep(80);
            if(desktop){
                deadline=Environment.TickCount64+2000;
                while(!AppDock.InputHost.GestureTarget.Matches(target,GetForegroundWindow())&&Environment.TickCount64<deadline)Thread.Sleep(10);
            }
            Cursor.Position=new(Cursor.Position.X+85,Cursor.Position.Y);Thread.Sleep(120);Stage("one");
            Cursor.Position=new(Cursor.Position.X,Cursor.Position.Y-85);Thread.Sleep(120);Stage("two");
            Mouse(16);Thread.Sleep(120);
            File.WriteAllText(Path.Combine(exchange,"released"),"ok");
            return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
        finally {Mouse(16);Cursor.Position=original;}
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
}
