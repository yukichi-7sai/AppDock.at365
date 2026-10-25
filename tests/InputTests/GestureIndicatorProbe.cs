using System.IO;
using System.Text.Json;
using System.Runtime.InteropServices;
using System.Windows.Forms;

internal static partial class Program
{
    // Mouse-only handshake lets the browser test inspect a live gesture before release.
    private static int RunIndicatorStages(string targetText, string overlayText, string exchange)
    {
        var original=Cursor.Position;
        try
        {
            var target=new nint(long.Parse(targetText));
            var overlay=new nint(long.Parse(overlayText));
            var deadline=Environment.TickCount64+2000;
            do {FocusWindow(target);Thread.Sleep(40);} while(GetForegroundWindow()!=target && Environment.TickCount64<deadline);
            if(GetForegroundWindow()!=target)throw new Exception("Indicator target did not become foreground.");
            GetWindowRect(target,out var bounds);
            Cursor.Position=new((bounds.Left+bounds.Right)/2,(bounds.Top+bounds.Bottom)/2);
            Thread.Sleep(80);
            void Stage(string name)
            {
                File.WriteAllText(Path.Combine(exchange,name+".json"),JsonSerializer.Serialize(new {
                    foreground=GetForegroundWindow().ToInt64(),target=target.ToInt64(),
                    overlayFlags=overlay==0?0:GetIndicatorWindowLong(overlay,-20)
                }));
                var until=Environment.TickCount64+15000;
                while(!File.Exists(Path.Combine(exchange,name+".continue")) && Environment.TickCount64<until)Thread.Sleep(10);
                if(Environment.TickCount64>=until)throw new Exception("Indicator stage timed out: "+name);
                if(GetForegroundWindow()!=target)throw new Exception("Indicator stole or lost the gesture target focus.");
            }
            Mouse(8);Thread.Sleep(80);
            Cursor.Position=new(Cursor.Position.X+85,Cursor.Position.Y);Thread.Sleep(120);Stage("one");
            Cursor.Position=new(Cursor.Position.X,Cursor.Position.Y-85);Thread.Sleep(120);Stage("two");
            Mouse(16);Thread.Sleep(120);
            File.WriteAllText(Path.Combine(exchange,"released"),"ok");
            return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
        finally {Mouse(16);Cursor.Position=original;}
    }
    [DllImport("user32.dll",EntryPoint="GetWindowLongW")]private static extern int GetIndicatorWindowLong(nint window,int index);
}
