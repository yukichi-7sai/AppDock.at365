using System.IO;
using System.Reflection;
using System.Text.Json;

internal static partial class Program
{
    // Hold the sender's gate throughout the test: cancellation must complete without sending OS input.
    private static int RunInputQueueTests(string assemblyPath)
    {
        const BindingFlags members = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        var type = Assembly.LoadFrom(Path.GetFullPath(assemblyPath)).GetType("AppDock.InputHost.InputSender", true)!;
        using var sender = (IDisposable)Activator.CreateInstance(type, members, null, [], null)!;
        var gate = (SemaphoreSlim)type.GetField("gate", members)!.GetValue(sender)!;
        var execute = type.GetMethod("ExecuteAsync", members)!;
        var cancel = type.GetMethod("Cancel", members)!;
        using var lifetime = new CancellationTokenSource();
        gate.Wait();
        try {
            Task<object> Start(string id) => (Task<object>)execute.Invoke(sender, ["input.sendKeys",
                JsonSerializer.SerializeToElement(new { id, keys = "Ctrl+Shift+T", window = "0" }), lifetime.Token])!;
            void Check(bool condition, string label) {
                if (!condition) throw new Exception(label);
                Console.WriteLine("PASS " + label);
            }
            var first = Start("first");
            var second = Start("second");
            Check(!first.IsCompleted && !second.IsCompleted, "overlapping requests wait for the key-stroke gate instead of returning busy");
            cancel.Invoke(sender, ["first"]);
            Check(first.Wait(2000) && JsonSerializer.SerializeToElement(first.Result).GetProperty("code").GetString() == "CANCELLED",
                "queued request cancels before admission");
            Check(!second.IsCompleted, "cancelling one queued request preserves the other");
            lifetime.Cancel();
            Check(second.Wait(2000) && JsonSerializer.SerializeToElement(second.Result).GetProperty("code").GetString() == "CANCELLED",
                "lifetime cancellation releases another queued request without sending input");
            Console.WriteLine("Input queue: 4 passed; no OS input sent.");
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error); return 1;
        } finally { gate.Release(); }
    }
}
