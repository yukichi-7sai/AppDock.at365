using System.Text.Json;
using AppDock.InputHost;

var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
using var fixtures = JsonDocument.Parse(File.ReadAllText(args[0]));
string[] Strings(JsonElement value, string key) => value.TryGetProperty(key, out var part)
    ? part.EnumerateArray().Select(item => item.GetString()!).ToArray() : [];
Condition When(JsonElement value) => new(value.GetProperty("scope").GetString()!, Strings(value, "appletIds"),
    Strings(value, "processes"), value.TryGetProperty("excludeDesktop", out var exclude) && exclude.GetBoolean(), Strings(value, "excludedProcesses"));
ConditionEnvironment? EnvironmentFor(JsonElement value) => value.TryGetProperty("environment", out var part)
    ? part.Deserialize<ConditionEnvironment>(options) : null;
var count = 0;
foreach (var fixture in fixtures.RootElement.GetProperty("conditions").EnumerateArray()) {
    var context = fixture.GetProperty("context").Deserialize<CommandContext>(options)!;
    var owner = fixture.TryGetProperty("ownerId", out var id) ? id.GetString() : null;
    var actual = CommandConditions.Matches(When(fixture.GetProperty("when")), context, owner, EnvironmentFor(fixture));
    if (actual != fixture.GetProperty("expected").GetBoolean()) throw new Exception(fixture.GetProperty("name").GetString());
    count++;
}
foreach (var fixture in fixtures.RootElement.GetProperty("selections").EnumerateArray()) {
    var catalog = fixture.GetProperty("catalog").EnumerateArray()
        .Where(c => !c.TryGetProperty("available", out var available) || available.GetBoolean())
        .ToDictionary(c => c.GetProperty("id").GetString()!);
    var context = fixture.GetProperty("context").Deserialize<CommandContext>(options)!;
    var rows = fixture.GetProperty("rows").EnumerateArray().Where(row => {
        if (row.TryGetProperty("enabled", out var enabled) && !enabled.GetBoolean()) return false;
        if (!catalog.TryGetValue(row.GetProperty("command").GetString()!, out var command)) return false;
        var owner = command.TryGetProperty("extensionId", out var id) ? id.GetString() : null;
        return CommandConditions.Matches(When(row.GetProperty("when")), context, owner, EnvironmentFor(fixture));
    });
    var selected = CommandConditions.Select(rows, row => row.GetProperty("command").GetString()!, fixture.GetProperty("mode").GetString()!);
    foreach (var (field, expected) in new[] { ("id", "expectedRows"), ("command", "expectedCommands") })
        if (!selected.Select(row => row.GetProperty(field).GetString()!).SequenceEqual(Strings(fixture, expected)))
            throw new Exception(fixture.GetProperty("name").GetString() + ": " + field);
    count++;
}
if (CommandConditions.HostContext("unknown").Focused != null) throw new Exception("Missing context must fail closed.");
if (CommandConditions.HostContextForWindow("{\"window\":\"1\",\"appFocused\":true}", "2").Focused != false)
    throw new Exception("A previous host window must not authorize stack input in another window.");
if (CommandConditions.HostContextForWindow("{\"window\":\"1\",\"appFocused\":true,\"appletId\":\"demo\"}", "1").AppletId != "demo")
    throw new Exception("Current window context must retain child command ownership.");
foreach (var fixture in fixtures.RootElement.GetProperty("inputExecutionModes").EnumerateArray()) {
    var modes = fixture.GetProperty("overrides").Deserialize<Dictionary<string, string>>(options)!;
    var actual = CommandConditions.ExecutionMode(fixture.GetProperty("fallback").GetString()!, modes, fixture.GetProperty("input").GetString()!);
    if (actual != fixture.GetProperty("expected").GetString()) throw new Exception(fixture.GetProperty("name").GetString());
    count++;
}
foreach (var fixture in fixtures.RootElement.GetProperty("stackConditions").EnumerateArray()) {
    var context = fixture.GetProperty("context").Deserialize<CommandContext>(options)!;
    var value = fixture.GetProperty("paths");
    var paths = value.ValueKind == JsonValueKind.Null ? null : value.EnumerateArray().Select(path => path.EnumerateArray().Select(term =>
        new StackConditionTerm(When(term.GetProperty("when")), term.TryGetProperty("ownerId", out var owner) ? owner.GetString() : null)).ToArray()).ToArray();
    if (CommandConditions.MatchesStack(paths, context, EnvironmentFor(fixture)) != fixture.GetProperty("expected").GetBoolean())
        throw new Exception(fixture.GetProperty("name").GetString());
    count++;
}
Console.WriteLine($"Command condition/selection fixtures: {count} passed.");
