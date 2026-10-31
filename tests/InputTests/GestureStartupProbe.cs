using System.IO;
using System.Text.Json;
using System.Windows.Forms;
using AppDock.InputHost;

internal static partial class Program
{
    private static int RunExternalGesture(string exchange)
    {
        using var form = new Probe { Text = "AppDock isolated startup gesture target", Size = new(720, 500), StartPosition = FormStartPosition.CenterScreen };
        var original = Cursor.Position;
        var failed = 0;
        form.Shown += async (_, _) => {
            try {
                FocusTarget(form);
                File.WriteAllText(Path.Combine(exchange, "ready"), form.Handle.ToString());
                var sequence = 0;
                nint reportedForeground = 0;
                var deadline = Environment.TickCount64 + 180000;
                while (Environment.TickCount64 < deadline && !File.Exists(Path.Combine(exchange, "stop"))) {
                    var foreground=GetForegroundWindow();
                    if(foreground!=reportedForeground){reportedForeground=foreground;File.WriteAllText(Path.Combine(exchange,"foreground"),foreground.ToString());}
                    var request = Path.Combine(exchange, "send-" + sequence);
                    if (!File.Exists(request)) { await Task.Delay(20); continue; }
                    var text=File.ReadAllText(request);
                    var gesture="move-left";
                    if(!string.IsNullOrWhiteSpace(text)) {using var requestJson=JsonDocument.Parse(text);gesture=requestJson.RootElement.GetProperty("gesture").GetString()!;}
                    FocusTarget(form);
                    await Task.Delay(120);
                    if (GetForegroundWindow() != form.Handle) throw new Exception("External fixture did not become foreground.");
                    Cursor.Position = form.PointToScreen(new(330, 220));
                    await Task.Delay(60);
                    var hovered = GestureTarget.At(new(Cursor.Position.X, Cursor.Position.Y));
                    var className = new System.Text.StringBuilder(256);
                    PopupClassName(hovered, className, className.Capacity);
                    var held = string.Join(",", new[] { 0x10, 0x11, 0x12, 0x5B, 0x5C, 1, 2, 4, 5, 6 }
                        .Where(key => (GetAsyncKeyState(key) & 0x8000) != 0).Select(key => key.ToString("X")));
                    Console.WriteLine($"External input preflight: target={form.Handle}, foreground={GetForegroundWindow()}, hovered={hovered}, class={className}, held={held}, action={gesture}");
                    if (hovered != form.Handle) throw new Exception("External gesture target is covered by another window.");
                    if(gesture=="shortcut:Ctrl+Alt+F11") {
                        var releaseDeadline = Environment.TickCount64 + 3000;
                        bool ModifierHeld() => new[] { 0x10, 0x11, 0x12, 0x5B, 0x5C }.Any(key => (GetAsyncKeyState(key) & 0x8000) != 0);
                        while (ModifierHeld() && Environment.TickCount64 < releaseDeadline) await Task.Delay(20);
                        if (ModifierHeld()) throw new Exception("Release physical modifiers before the shortcut fixture.");
                        try {
                            Key(0x11);Key(0x12);Key(0x7A);await Task.Delay(40);
                        } finally { Key(0x7A,true);Key(0x12,true);Key(0x11,true); }
                        await Task.Delay(200);
                        File.WriteAllText(Path.Combine(exchange,"done-"+sequence++),"ok");continue;
                    }
                    Mouse(8); await Task.Delay(80);
                    if(gesture.StartsWith("move-")) foreach(var direction in gesture[5..].Split('-')) {
                        var offset=direction switch {"up"=>new System.Drawing.Point(0,-85),"down"=>new(0,85),"left"=>new(-85,0),"right"=>new(85,0),_=>throw new Exception("Unknown direction")};
                        Cursor.Position=new(Cursor.Position.X+offset.X,Cursor.Position.Y+offset.Y);await Task.Delay(60);
                    }
                    else if(gesture=="click-left"){Mouse(2);await Task.Delay(40);Mouse(4);}
                    else if(gesture=="wheel-up")Mouse(0x800,120);
                    else if(gesture=="key:A"){Key(0x41);await Task.Delay(40);Key(0x41,true);}
                    await Task.Delay(100); Mouse(16); await Task.Delay(200);
                    Console.WriteLine($"External target messages: right-down={form.RightDowns}, right-up={form.RightUps}");
                    File.WriteAllText(Path.Combine(exchange, "done-" + sequence++), "ok");
                }
            } catch (Exception e) { Console.Error.WriteLine(e); failed++; }
            finally { Mouse(16); Cursor.Position = original; form.Close(); }
        };
        Application.Run(form);
        return failed == 0 ? 0 : 1;
    }
}
