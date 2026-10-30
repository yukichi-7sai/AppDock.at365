using System.IO.Pipes;
using System.Text.Json;

var mode = args[0]; var control = args[1];
if (mode == "hold")
{
    File.WriteAllText(Path.Combine(control, "holding"), "ready");
    while (!File.Exists(Path.Combine(control, "exit-old"))) Thread.Sleep(30);
    return;
}
var pipe = Environment.GetEnvironmentVariable("APPDOCK_UPDATE_READY_PIPE");
File.WriteAllText(Path.Combine(control, "started.json"), JsonSerializer.Serialize(new { pid = Environment.ProcessId, pipe }));
if (mode == "exit") return;
while (!File.Exists(Path.Combine(control, "show-new"))) Thread.Sleep(30);
using (var client = new NamedPipeClientStream(".", pipe!, PipeDirection.Out, PipeOptions.Asynchronous))
{
    await client.ConnectAsync(5000);
    await client.WriteAsync("shown\n"u8.ToArray());
}
File.WriteAllText(Path.Combine(control, "acknowledged"), "shown");
