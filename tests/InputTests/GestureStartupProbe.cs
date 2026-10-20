using System.IO;
using System.Windows.Forms;

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
                var deadline = Environment.TickCount64 + 180000;
                while (Environment.TickCount64 < deadline && !File.Exists(Path.Combine(exchange, "stop"))) {
                    var request = Path.Combine(exchange, "send-" + sequence);
                    if (!File.Exists(request)) { await Task.Delay(20); continue; }
                    FocusTarget(form);
                    await Task.Delay(120);
                    if (GetForegroundWindow() != form.Handle) throw new Exception("External fixture did not become foreground.");
                    Cursor.Position = form.PointToScreen(new(330, 220));
                    await Task.Delay(60);
                    Mouse(8); await Task.Delay(80);
                    Cursor.Position = new(Cursor.Position.X - 85, Cursor.Position.Y);
                    await Task.Delay(100); Mouse(16); await Task.Delay(200);
                    File.WriteAllText(Path.Combine(exchange, "done-" + sequence++), "ok");
                }
            } catch (Exception e) { Console.Error.WriteLine(e); failed++; }
            finally { Mouse(16); Cursor.Position = original; form.Close(); }
        };
        Application.Run(form);
        return failed == 0 ? 0 : 1;
    }
}
