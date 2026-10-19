using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Runtime.InteropServices;

// This private worker accepts requests only from the host's inherited pipe.
// Process.Start avoids libuv's detached-console and kill-on-parent-exit semantics.
Console.InputEncoding = new UTF8Encoding(false);
Console.OutputEncoding = new UTF8Encoding(false);
var input = Console.In;
var output = Console.Out;
using var nullDevice = File.OpenHandle("NUL", FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite);
if (!Native.SetHandleInformation(nullDevice.DangerousGetHandle(), 1, 1)) return;
foreach (var handle in new[] { -10, -11, -12 })
{
    if (!Native.SetHandleInformation(Native.GetStdHandle(handle), 1, 0)) return;
    if (!Native.SetStdHandle(handle, nullDevice.DangerousGetHandle())) return;
}
while (await input.ReadLineAsync() is { } line)
{
    if (line.Length > 128 * 1024) break;
    using var document = JsonDocument.Parse(line);
    var request = document.RootElement;
    var id = request.GetProperty("id").GetString();
    var method = request.GetProperty("method").GetString();
    var ok = method == "processes.ready";
    int? processId = null;
    if (method == "processes.start")
    {
        try
        {
            var spec = request.GetProperty("params");
            var info = new ProcessStartInfo
            {
                FileName = spec.GetProperty("file").GetString()!,
                WorkingDirectory = spec.GetProperty("cwd").GetString()!,
                UseShellExecute = false,
                CreateNoWindow = !spec.GetProperty("showConsole").GetBoolean(),
            };
            var arguments = spec.GetProperty("args").EnumerateArray().Select(a => a.GetString()!).ToArray();
            if (spec.GetProperty("verbatim").GetBoolean()) info.Arguments = string.Join(" ", arguments);
            else foreach (var argument in arguments) info.ArgumentList.Add(argument);
            using var child = Process.Start(info);
            ok = child is not null;
            if (child != null) processId = child.Id;
        }
        catch { ok = false; }
    }
    await output.WriteLineAsync(JsonSerializer.Serialize(new { jsonrpc = "2.0", id, result = new { ok, processId } }));
    await output.FlushAsync();
}
static class Native
{
    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern IntPtr GetStdHandle(int handle);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool SetStdHandle(int handle, IntPtr value);
}
