using System.Text.Json;
using System.Runtime.CompilerServices;

namespace AppDock.InputHost;

internal sealed record Condition(string Scope, string[] AppletIds, string[] Processes, bool ExcludeDesktop = false, string[]? ExcludedProcesses = null);
internal sealed record CommandHostContext(bool? Focused = null, string? PageId = null, string? AppletId = null);
internal sealed record CommandTargetContext(string Window, string? ProcessName = null, string? WindowClass = null, bool? Desktop = null);
internal sealed record CommandContext(CommandHostContext Host, CommandTargetContext? Target = null);
internal sealed record ConditionEnvironment(string[]? Browsers = null, bool RequireChromiumWindowClass = false, string[]? ExcludedProcesses = null);
internal sealed record StackConditionTerm(Condition When, string? OwnerId = null);

/// <summary>Native projection of the shared input condition and selection contract.</summary>
internal static class CommandConditions
{
    private static readonly ConditionalWeakTable<string[], HashSet<string>> processIndexes = new();
    private static readonly ConditionalWeakTable<string[], HashSet<string>> appletIndexes = new();
    private static HashSet<string> Processes(string[] names) => processIndexes.GetValue(names,
        values => values.Select(ProcessName).ToHashSet(StringComparer.OrdinalIgnoreCase));
    private static void Prepare(string[]? names, Dictionary<string, HashSet<string>> pool)
    {
        if (names == null || processIndexes.TryGetValue(names, out _)) return;
        var key = string.Join('\0', names.Select(name => ProcessName(name).ToUpperInvariant()));
        if (!pool.TryGetValue(key, out var index)) {
            index = names.Select(ProcessName).ToHashSet(StringComparer.OrdinalIgnoreCase);
            pool.Add(key, index);
        }
        processIndexes.GetValue(names, _ => index);
    }
    internal static void Prepare(Condition when, Dictionary<string, HashSet<string>> pool)
    {
        Prepare(when.Processes, pool);
        Prepare(when.ExcludedProcesses, pool);
        appletIndexes.GetValue(when.AppletIds, ids => ids.ToHashSet(StringComparer.Ordinal));
    }
    internal static void Prepare(ConditionEnvironment? environment, Dictionary<string, HashSet<string>> pool)
    {
        Prepare(environment?.Browsers, pool);
        Prepare(environment?.ExcludedProcesses, pool);
    }
    internal static void Prepare(StackConditionTerm[][]? paths, Dictionary<string, HashSet<string>> pool)
    {
        if (paths != null) foreach (var path in paths) foreach (var term in path) Prepare(term.When, pool);
    }
    internal static bool Excluded(string[] names, string process) => Processes(names).Contains(ProcessName(process));
    internal static bool MatchesStack(StackConditionTerm[][]? paths, CommandContext context, ConditionEnvironment? environment = null) =>
        paths == null || paths.Any(path => path.All(term => Matches(term.When, context, term.OwnerId, environment)));
    internal static long ExecutionLimit(string fallback, IReadOnlyDictionary<string, JsonElement>? modes, string input) =>
        modes != null && modes.TryGetValue(input, out var mode) ? SelectionLimit(mode) : SelectionLimit(fallback);

    private static long SelectionLimit(string mode) => mode switch {
        "first" => 1,
        "all" => long.MaxValue,
        _ => throw new ArgumentException("Unknown command execution mode.")
    };
    internal static long SelectionLimit(JsonElement mode)
    {
        if (mode.ValueKind == JsonValueKind.String) return SelectionLimit(mode.GetString()!);
        if (mode.ValueKind == JsonValueKind.Object && mode.EnumerateObject().Count() == 2 &&
            mode.TryGetProperty("mode", out var kind) && kind.ValueKind == JsonValueKind.String && kind.GetString() == "count" &&
            mode.TryGetProperty("count", out var count) && count.ValueKind == JsonValueKind.Number &&
            count.TryGetDouble(out var value) && value >= 1 && value <= 9007199254740991 && Math.Truncate(value) == value)
            return (long)value;
        throw new ArgumentException("Invalid command execution count.");
    }

    private static string ProcessName(string name) =>
        name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? name[..^4] : name;
    private static bool ContainsProcess(string[] names, string process) =>
        Processes(names).Contains(ProcessName(process));

    internal static bool Matches(Condition when, CommandContext context, string? ownerId = null,
        ConditionEnvironment? environment = null)
    {
        var host = context.Host;
        var target = context.Target;
        if ((environment?.ExcludedProcesses?.Length > 0 || when.ExcludedProcesses?.Length > 0) &&
            (string.IsNullOrEmpty(target?.ProcessName) ||
             environment?.ExcludedProcesses is { } global && ContainsProcess(global, target.ProcessName) ||
             when.ExcludedProcesses is { } local && ContainsProcess(local, target.ProcessName))) return false;
        if (when.ExcludeDesktop && target?.Desktop != false) return false;
        return when.Scope switch {
            "global" => true,
            "app" => host.Focused == true,
            "pages" => host.Focused == true && (!string.IsNullOrEmpty(host.PageId) || !string.IsNullOrEmpty(host.AppletId)),
            "owner" => host.Focused == true && !string.IsNullOrEmpty(ownerId) && host.AppletId == ownerId,
            "applets" => host.Focused == true &&
                (!string.IsNullOrEmpty(host.PageId) && appletIndexes.GetValue(when.AppletIds, ids => ids.ToHashSet(StringComparer.Ordinal)).Contains(host.PageId) ||
                 !string.IsNullOrEmpty(host.AppletId) && appletIndexes.GetValue(when.AppletIds, ids => ids.ToHashSet(StringComparer.Ordinal)).Contains(host.AppletId)),
            "desktop" => target?.Desktop == true,
            "browser" => !string.IsNullOrEmpty(target?.ProcessName) && environment?.Browsers != null &&
                ContainsProcess(environment.Browsers, target.ProcessName) &&
                (!environment.RequireChromiumWindowClass || target.WindowClass?.StartsWith("Chrome_WidgetWin_", StringComparison.Ordinal) == true),
            "exe" => !string.IsNullOrEmpty(target?.ProcessName) && ContainsProcess(when.Processes, target.ProcessName),
            _ => false
        };
    }

    internal static T[] Select<T>(IEnumerable<T> rows, Func<T, string> command, long limit)
    {
        if (limit < 1) throw new ArgumentException("Invalid command execution count.");
        return (limit >= int.MaxValue ? rows : rows.Take((int)limit)).ToArray();
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
    internal static CommandHostContext HostContextForWindow(string json, string window)
    {
        try {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.TryGetProperty("window", out var known) && known.GetString() == window
                ? HostContext(json) : new(false);
        } catch (JsonException) { return new(); }
    }
}
