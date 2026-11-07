using System.Collections.Concurrent;
using System.ComponentModel;
using System.Text;
using System.Text.Json;

// Private inherited pipes only. No socket, persisted state, polling, or detached lifetime.
Console.InputEncoding = new UTF8Encoding(false);
Console.OutputEncoding = new UTF8Encoding(false);
var output = TextWriter.Synchronized(Console.Out);
void Send(object value) => output.WriteLine(JsonSerializer.Serialize(value));
var registrations = new ConcurrentDictionary<string, Registration>();
try
{
    while (await Console.In.ReadLineAsync() is { } line)
    {
        using var document = JsonDocument.Parse(line);
        var request = document.RootElement;
        var id = request.GetProperty("id").GetString()!;
        if (request.GetProperty("method").GetString() == "unwatch")
        {
            if (registrations.TryRemove(id, out var removed)) removed.Dispose();
            continue;
        }
        if (request.GetProperty("method").GetString() != "watch") continue;
        var registration = new Registration(id, request.GetProperty("path").GetString()!,
            request.GetProperty("recursive").GetBoolean(), Send);
        if (!registrations.TryAdd(id, registration)) { registration.Dispose(); continue; }
        // A slow/disconnected share must not block registrations for other roots.
        _ = Task.Run(registration.Start);
    }
}
finally
{
    foreach (var registration in registrations.Values) registration.Dispose();
}

sealed class Registration(string id, string path, bool recursive, Action<object> send) : IDisposable
{
    private readonly object gate = new();
    private FileSystemWatcher? watcher;
    private bool closed;

    public void Start()
    {
        FileSystemWatcher? next = null;
        try
        {
            if ((File.GetAttributes(path) & FileAttributes.Directory) == 0)
                throw new DirectoryNotFoundException();
            next = new FileSystemWatcher(path)
            {
                IncludeSubdirectories = recursive,
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName |
                    NotifyFilters.LastWrite | NotifyFilters.Size | NotifyFilters.Attributes,
            };
            next.Created += (_, e) => Changed("rename", e.Name);
            next.Deleted += (_, e) => Changed("rename", e.Name);
            next.Changed += (_, e) => Changed("change", e.Name);
            next.Renamed += (_, e) => { Changed("rename", e.OldName); Changed("rename", e.Name); };
            next.Error += (_, e) =>
            {
                if (e.GetException() is InternalBufferOverflowException) Changed("change", null);
                else Failed(e.GetException());
            };
            // Enabling may perform network I/O. Never hold the control/disposal lock here.
            next.EnableRaisingEvents = true;
            lock (gate)
            {
                if (closed) { next.Dispose(); return; }
                watcher = next;
                send(new { id, type = "ready" });
            }
        }
        catch (Exception error)
        {
            next?.Dispose();
            Failed(error);
        }
    }

    private void Changed(string kind, string? name)
    {
        lock (gate)
            if (!closed) send(new { id, type = "change", kind, name });
    }

    private void Failed(Exception error)
    {
        lock (gate)
        {
            if (closed) return;
            // Exception text may contain paths. Only typed diagnostics cross the pipe.
            var native = error is Win32Exception windows ? windows.NativeErrorCode : error.HResult & 0xffff;
            var code = error is DirectoryNotFoundException or FileNotFoundException || native is 2 or 3
                ? "ENOENT" : error is UnauthorizedAccessException || native == 5 ? "EACCES" : "EIO";
            send(new { id, type = "error", code, nativeCode = native });
            closed = true;
            watcher?.Dispose();
            watcher = null;
        }
    }

    public void Dispose()
    {
        lock (gate)
        {
            closed = true;
            watcher?.Dispose();
            watcher = null;
        }
    }
}
