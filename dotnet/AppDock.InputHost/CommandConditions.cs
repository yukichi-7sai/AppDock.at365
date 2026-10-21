using System.Text.Json;

namespace AppDock.InputHost;

internal sealed record Condition(string Scope, string[] AppletIds, string[] Processes, bool ExcludeDesktop = false);
internal sealed record CommandHostContext(bool? Focused = null, string? PageId = null, string? AppletId = null);
internal sealed record CommandTargetContext(string Window, string? ProcessName = null, string? WindowClass = null, bool? Desktop = null);
internal sealed record CommandContext(CommandHostContext Host, CommandTargetContext? Target = null);
internal sealed record ConditionEnvironment(string[]? Browsers = null, bool RequireChromiumWindowClass = false);

/// <summary>Native projection of the shared input condition and selection contract.</summary>
internal static class CommandConditions
{
    private static string ProcessName(string name) =>
        name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? name[..^4] : name;
    private static bool ContainsProcess(string[] names, string process) =>
        names.Any(name => ProcessName(name).Equals(ProcessName(process), StringComparison.OrdinalIgnoreCase));

    internal static bool Matches(Condition when, CommandContext context, string? ownerId = null,
        ConditionEnvironment? environment = null)
    {
        var host = context.Host;
        var target = context.Target;
        if (when.ExcludeDesktop && target?.Desktop != false) return false;
        return when.Scope switch {
            "global" => true,
            "app" => host.Focused == true,
            "pages" => host.Focused == true && (!string.IsNullOrEmpty(host.PageId) || !string.IsNullOrEmpty(host.AppletId)),
            "owner" => host.Focused == true && !string.IsNullOrEmpty(ownerId) && host.AppletId == ownerId,
            "applets" => host.Focused == true &&
                (!string.IsNullOrEmpty(host.PageId) && when.AppletIds.Contains(host.PageId) ||
                 !string.IsNullOrEmpty(host.AppletId) && when.AppletIds.Contains(host.AppletId)),
            "desktop" => target?.Desktop == true,
            "browser" => !string.IsNullOrEmpty(target?.ProcessName) && environment?.Browsers != null &&
                ContainsProcess(environment.Browsers, target.ProcessName) &&
                (!environment.RequireChromiumWindowClass || target.WindowClass?.StartsWith("Chrome_WidgetWin_", StringComparison.Ordinal) == true),
            "exe" => !string.IsNullOrEmpty(target?.ProcessName) && ContainsProcess(when.Processes, target.ProcessName),
            _ => false
        };
    }

    internal static T[] Select<T>(IEnumerable<T> rows, Func<T, string> command, string mode)
    {
        if (mode is not ("all" or "first")) throw new ArgumentException("Unknown command execution mode.");
        var selected = rows.DistinctBy(command);
        return (mode == "first" ? selected.Take(1) : selected).ToArray();
    }

    internal static CommandHostContext HostContext(string json)
    {
        try {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return new();
            bool? focused = root.TryGetProperty("appFocused", out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False
                ? value.GetBoolean() : null;
            string? Read(string name) => root.TryGetProperty(name, out var part) && part.ValueKind == JsonValueKind.String ? part.GetString() : null;
            return new(focused, Read("pageId"), Read("appletId"));
        } catch (JsonException) { return new(); }
    }
}
