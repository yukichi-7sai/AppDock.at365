using System.Text.Json;
using AppDock.InputHost;

var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
using var fixtures = JsonDocument.Parse(File.ReadAllText(args[0]));
string[] Strings(JsonElement value, string key) => value.TryGetProperty(key, out var part)
    ? part.EnumerateArray().Select(item => item.GetString()!).ToArray() : [];
Condition When(JsonElement value) => new(value.GetProperty("scope").GetString()!, Strings(value, "appletIds"),
    Strings(value, "processes"), value.TryGetProperty("excludeDesktop", out var exclude) && exclude.GetBoolean());
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
Console.WriteLine($"Command condition/selection fixtures: {count} passed.");
