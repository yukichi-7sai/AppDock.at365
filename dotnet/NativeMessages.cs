using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

// Internal host-process messages. Applet-owned text never enters this protocol.
internal sealed record NativeMessage(
    [property: JsonPropertyName("hostTextKey")] string Key,
    [property: JsonPropertyName("values")] JsonElement Values);

internal static class NativeMessages
{
    private const string DataKey = "AppDock.HostMessage";
    private static IReadOnlyDictionary<string, string> messages = new Dictionary<string, string>();
    internal static NativeMessage Message(string key, object? values = null) =>
        new(key, JsonSerializer.SerializeToElement(values ?? new { }));
    internal static T Error<T>(string key, Func<string, T> create, object? values = null) where T : Exception
    {
        var error = create(Text(key, values));
        error.Data[DataKey] = Message(key, values);
        return error;
    }
    internal static object Describe(Exception error) => error.Data[DataKey] as NativeMessage ?? (object)error.Message;
    internal static void Log(string key) => Console.Error.WriteLine(JsonSerializer.Serialize(Message(key)));
    internal static void Set(JsonElement source)
    {
        if (source.ValueKind != JsonValueKind.Object) return;
        var next = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var property in source.EnumerateObject())
            if (property.Name.StartsWith("native.", StringComparison.Ordinal) && property.Value.ValueKind == JsonValueKind.String &&
                !string.IsNullOrWhiteSpace(property.Value.GetString())) next[property.Name] = property.Value.GetString()!;
        messages = next;
    }
    internal static string Text(string key, object? values = null)
    {
        var text = messages.GetValueOrDefault(key) ?? key;
        if (values is null) return text;
        var arguments = JsonSerializer.SerializeToElement(values);
        // One pass: values containing braces or translation-looking text remain literal.
        return Regex.Replace(text, @"\{\{([A-Za-z0-9_]+)\}\}", match =>
            arguments.TryGetProperty(match.Groups[1].Value, out var value) ? value.ValueKind switch
            {
                JsonValueKind.String => value.GetString()!,
                JsonValueKind.Number => value.GetRawText(),
                _ => match.Value,
            } : match.Value);
    }
    internal static void LoadBase(string file)
    {
        if (!File.Exists(file)) return;
        try { using var document = JsonDocument.Parse(File.ReadAllText(file)); Set(document.RootElement); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException) { }
    }
}
