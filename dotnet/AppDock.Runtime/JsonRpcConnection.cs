using System.Collections.Concurrent;
using System.Text.Json;

namespace AppDock.Runtime;

internal sealed class JsonRpcConnection(TextReader input, TextWriter output, Func<Exception, object>? describeError = null) : IAsyncDisposable
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly SemaphoreSlim writeLock = new(1, 1);
    private readonly ConcurrentDictionary<string, TaskCompletionSource<JsonElement>> pending = new();
    private readonly ConcurrentDictionary<long, Task> handlers = new();
    private long sequence;
    private long handlerSequence;
    private readonly CancellationTokenSource lifetime = new();
    public CancellationToken Lifetime => lifetime.Token;
    internal Task NotifyAsync(string method, object parameters) =>
        SendAsync(new { jsonrpc = "2.0", method, @params = parameters }, lifetime.Token);

    public async Task<JsonElement> RequestAsync(string method, object? parameters, CancellationToken token)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token, lifetime.Token);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        var id = $"extension-{Interlocked.Increment(ref sequence)}";
        var completion = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        pending[id] = completion;
        try
        {
            await SendAsync(new { jsonrpc = "2.0", id, method, @params = parameters }, timeout.Token);
            return await completion.Task.WaitAsync(timeout.Token);
        }
        finally { pending.TryRemove(id, out _); }
    }

    public async Task ReadAsync(Func<string, JsonElement, Task<object?>> handler)
    {
        try
        {
            while (!lifetime.IsCancellationRequested)
            {
                var line = await input.ReadLineAsync(lifetime.Token);
                if (line is null) break;
                if (line.Length > 1024 * 1024) throw new InvalidDataException("RPC message too large.");
                if (string.IsNullOrWhiteSpace(line)) continue;
                using var document = JsonDocument.Parse(line);
                var message = document.RootElement;
                if (message.GetProperty("jsonrpc").GetString() != "2.0") throw new InvalidDataException("JSON-RPC 2.0 required.");
                if (message.TryGetProperty("method", out var method))
                {
                    var copy = message.Clone();
                    var handlerId = Interlocked.Increment(ref handlerSequence);
                    var methodName = method.GetString()!;
                    var task = Task.Run(() => DispatchAsync(copy, methodName, handler));
                    handlers[handlerId] = task;
                    _ = task.ContinueWith(completed => { handlers.TryRemove(handlerId, out _); }, TaskScheduler.Default);
                }
                else if (message.TryGetProperty("id", out var idElement) && pending.TryGetValue(idElement.GetString()!, out var completion))
                {
                    if (message.TryGetProperty("error", out var error)) completion.TrySetException(new InvalidOperationException(error.GetProperty("message").GetString()));
                    else completion.TrySetResult(message.GetProperty("result").Clone());
                }
            }
        }
        finally
        {
            lifetime.Cancel();
            foreach (var item in pending.Values) item.TrySetCanceled();
            await Task.WhenAll(handlers.Values);
        }
    }
    private async Task DispatchAsync(JsonElement message, string method, Func<string, JsonElement, Task<object?>> handler)
    {
        var hasId = message.TryGetProperty("id", out var id);
        try
        {
            var parameters = message.TryGetProperty("params", out var p) ? p : JsonSerializer.SerializeToElement(new { });
            var result = await handler(method, parameters);
            if (hasId) await SendAsync(new { jsonrpc = "2.0", id, result }, lifetime.Token);
        }
        catch (Exception e)
        {
            if (hasId && !lifetime.IsCancellationRequested)
                try {
                    object error = describeError is null ? new { code = -32000, message = e.Message }
                        : new { code = -32000, message = e.Message, data = describeError(e) };
                    await SendAsync(new { jsonrpc = "2.0", id, error }, lifetime.Token);
                }
                catch (Exception) when (lifetime.IsCancellationRequested) { }
        }
    }
    private async Task SendAsync(object value, CancellationToken token)
    {
        var text = JsonSerializer.Serialize(value, Json);
        if (text.Length > 1024 * 1024) throw new InvalidDataException("RPC message too large.");
        await writeLock.WaitAsync(token);
        try { await output.WriteLineAsync(text); await output.FlushAsync(token); }
        finally { writeLock.Release(); }
    }
    public async ValueTask DisposeAsync()
    {
        await lifetime.CancelAsync();
        foreach (var item in pending.Values) item.TrySetCanceled();
        lifetime.Dispose(); writeLock.Dispose();
    }
}
