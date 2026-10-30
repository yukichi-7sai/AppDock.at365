using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

internal static partial class Program
{
    private static async Task<bool> WaitForUpdatedWindow(NamedPipeServerStream pipe, Process process)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(120));
        var token = timeout.Token;
        async Task<bool> Receive()
        {
            while (true)
            {
                await pipe.WaitForConnectionAsync(token);
                // The random pipe is local/current-user only. Also bind the sender to the process we launched.
                if (!GetNamedPipeClientProcessId(pipe.SafePipeHandle, out var client) || client != process.Id)
                { pipe.Disconnect(); continue; }
                var message = new byte[6];
                await pipe.ReadExactlyAsync(message, token);
                return Encoding.ASCII.GetString(message) == "shown\n";
            }
        }
        var receive = Receive();
        try
        {
            var exited = process.WaitForExitAsync(token);
            var completed = await Task.WhenAny(receive, exited);
            return completed == receive && await receive;
        }
        catch (Exception error) when (error is OperationCanceledException or IOException) { return false; }
        finally
        {
            timeout.Cancel();
            try { await receive; } catch (Exception error) when (error is OperationCanceledException or IOException) { }
        }
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe, out uint processId);
}
