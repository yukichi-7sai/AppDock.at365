using AppDock.InputHost;
using System.Text.Json;

var checks = 0;
void Check(bool value, string name) { if (!value) throw new Exception(name); checks++; Console.WriteLine("PASS " + name); }
{
    NativeMessages.Set(JsonSerializer.SerializeToElement(new Dictionary<string, string> {
        ["native.touchpad.connectionKey"] = "Choose a connection key.",
        ["native.hostPackage.runtimeBundled"] = "Cannot bundle: {{path}}",
    }));
    try { TouchpadWindowsModel.Encode("not-a-key"); throw new Exception("expected validation failure"); }
    catch (ArgumentException error) {
        Check(error.Message == "Choose a connection key.", "native error retains exception type and selected wording");
        var message = JsonSerializer.SerializeToElement(NativeMessages.Describe(error));
        Check(message.GetProperty("hostTextKey").GetString() == "native.touchpad.connectionKey", "native cause travels as a stable key");
    }
    const string value = "日本語/{{path}}/$t(language.label)";
    Check(NativeMessages.Text("native.hostPackage.runtimeBundled", new { path = value }) == "Cannot bundle: " + value, "native interpolation preserves variable text literally");
    Check((string)NativeMessages.Describe(new IOException(value)) == value, "external exception text is untouched");
    foreach (var translate in new[] { false, true }) {
        using var input = new MessageInput(); using var output = new MessageOutput();
        await using var peer = new AppDock.Runtime.JsonRpcConnection(input, output, translate ? NativeMessages.Describe : null);
        var reading = peer.ReadAsync((method, parameters) => throw NativeMessages.Error("native.touchpad.connectionKey", text => new ArgumentException(text)));
        input.Messages.Writer.TryWrite("{\"jsonrpc\":\"2.0\",\"id\":\"fixture\",\"method\":\"invalid\"}");
        var reply = JsonSerializer.Deserialize<JsonElement>(await output.Received.Task.WaitAsync(TimeSpan.FromSeconds(5)));
        input.Messages.Writer.Complete(); await reading;
        var error = reply.GetProperty("error");
        Check(error.GetProperty("code").GetInt32() == -32000 && error.GetProperty("message").GetString() == "Choose a connection key.", "RPC retains error code and message");
        Check(error.TryGetProperty("data", out var data) == translate, "only host-native RPC adds message data");
        if (translate) Check(data.GetProperty("hostTextKey").GetString() == "native.touchpad.connectionKey", "native RPC serializes the cause key");
    }
    NativeMessages.Set(JsonSerializer.SerializeToElement(new { }));
}
for (var key = 13; key <= 24; key++) foreach (var modifiers in new[] { "", "Ctrl+", "Alt+", "Shift+", "Win+", "Ctrl+Alt+Shift+Win+" })
    Check(TouchpadWindowsModel.Decode(TouchpadWindowsModel.Encode(modifiers + "F" + key)) == modifiers + "F" + key, "codec " + modifiers + "F" + key);
foreach (var mode in new uint[] { 0, 1, 2, 3, 0xFFFF }) foreach (var target in TouchpadWindowsModel.Descriptors) {
    var store = new FakeValues(mode); using var model = new WindowsTouchpadSettings(store, () => new FakeCache(store));
    var before = model.Read(); var plan = TouchpadWindowsModel.Plan(before, new() { [target.Id] = "Ctrl+Alt+F24" });
    var after = model.Apply(plan);
    Check(after.Gestures.Single(row => row.Gesture == target.Id).Key == "Ctrl+Alt+F24", "apply " + mode + " " + target.Id);
    Check(after.Gestures.Where(row => row.Gesture != target.Id).All(row => { var old = before.Gestures.Single(b => b.Gesture == row.Gesture); return old.Key == row.Key && old.Action == row.Action; }), "preserve siblings " + target.Id);
}
{
    var store = new FakeValues(1); using var model = new WindowsTouchpadSettings(store, () => new FakeCache(store));
    var requested = TouchpadWindowsModel.Descriptors.Select((row, i) => (row.Id, Key: "F" + (13 + i))).ToDictionary(row => row.Id, row => row.Key);
    var after = model.Apply(TouchpadWindowsModel.Plan(model.Read(), requested)); Check(after.Gestures.All(row => row.Key == requested[row.Gesture]), "all ten simultaneously");
}
foreach (var failAt in Enumerable.Range(1, 6)) {
    var store = new FakeValues(1); var before = JsonSerializer.Serialize(store.Values); store.FailAt = failAt;
    using var model = new WindowsTouchpadSettings(store, () => new FakeCache(store));
    try { model.Apply(TouchpadWindowsModel.Plan(model.Read(), new() { ["three.up"] = "F14" })); throw new Exception("expected injected failure"); }
    catch (IOException) { Check(JsonSerializer.Serialize(store.Values) == before, "rollback write " + failAt); }
}
{
    var store = new FakeValues(1); using var model = new WindowsTouchpadSettings(store, () => new FakeCache(store));
    var plan = TouchpadWindowsModel.Plan(model.Read(), new() { ["four.tap"] = "F18" }); store.Values["FourFingerTapEnabled"] = new(true, 3);
    try { model.Apply(plan); throw new Exception("expected conflict"); } catch (IOException) { Check(store.Writes == 0, "prewrite revision conflict"); }
}
Console.WriteLine($"PASS {checks} checks; fake settings only, no Windows writes");

sealed class FakeValues : ITouchpadValues {
    internal Dictionary<string, TouchpadValue> Values = TouchpadWindowsModel.Names.ToDictionary(name => name, _ => new TouchpadValue(true, 0));
    internal int Writes, FailAt;
    internal FakeValues(uint mode) { foreach (var row in TouchpadWindowsModel.Descriptors) { Values[row.Mode] = new(true, row.Direction == 0 ? 1 : mode); Values[row.Action] = new(true, row.Direction == 0 ? 1u : 2u); } }
    public TouchpadValue Read(string name) => Values[name];
    public void Write(string name, TouchpadValue value) { if (++Writes == FailAt) throw new IOException("injected failure"); Values[name] = value; }
}
sealed class FakeCache(FakeValues values) : ITouchpadCache { public uint Read(string name) => values.Read(name).Value; public void Changed(string name) { } public void Dispose() { } }

sealed class MessageInput : TextReader {
    internal readonly System.Threading.Channels.Channel<string> Messages = System.Threading.Channels.Channel.CreateUnbounded<string>();
    public override async ValueTask<string?> ReadLineAsync(CancellationToken token) {
        try { return await Messages.Reader.ReadAsync(token); }
        catch (System.Threading.Channels.ChannelClosedException) { return null; }
    }
}
sealed class MessageOutput : StringWriter {
    internal readonly TaskCompletionSource<string> Received = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public override Task WriteLineAsync(string? value) { Received.TrySetResult(value!); return Task.CompletedTask; }
}
