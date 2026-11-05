using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using AppDock.SDK;

namespace AppDock.Runtime;

internal sealed class LocalizationService : ILocalizationService
{
    private AppletLocalizationSnapshot current = new("ja", "ja", new Dictionary<string, string>());
    private readonly ConcurrentDictionary<Guid, Func<CancellationToken, Task>> handlers = new();
    public string Language => Volatile.Read(ref current).Language;
    public AppletLocalizationSnapshot Snapshot()
    {
        var value = Volatile.Read(ref current);
        return value with { Messages = new Dictionary<string, string>(value.Messages, StringComparer.Ordinal) };
    }
    public string Text(string key, IReadOnlyDictionary<string, object?>? values = null)
    {
        var template = Volatile.Read(ref current).Messages.TryGetValue(key, out var value) ? value : key;
        return Regex.Replace(template, "{{([^{}]+)}}", match => {
            if (values is null || !values.TryGetValue(match.Groups[1].Value, out var replacement)) return match.Value;
            return replacement switch {
                string text => text,
                byte or sbyte or short or ushort or int or uint or long or ulong or float or double or decimal => Convert.ToString(replacement, CultureInfo.InvariantCulture)!,
                _ => match.Value
            };
        });
    }
    internal void Initialize(JsonElement value)
        => Volatile.Write(ref current, value.Deserialize<AppletLocalizationSnapshot>(JsonRpcConnection.Json) ?? throw new ArgumentException("Invalid localization snapshot."));
    internal async Task ChangeAsync(JsonElement value, CancellationToken token)
    {
        Initialize(value);
        foreach (var handler in handlers.Values) await handler(token);
    }
    public IDisposable OnChanged(Func<CancellationToken, Task> handler)
    {
        var id = Guid.NewGuid(); handlers[id] = handler;
        return new Subscription(() => handlers.TryRemove(id, out _));
    }
    internal void Clear() => handlers.Clear();
    private sealed class Subscription(Action remove) : IDisposable
    {
        public void Dispose() => remove();
    }
}
