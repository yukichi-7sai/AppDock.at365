using AppDock.InputHost;
using System.Text.Json;

var checks = 0;
void Check(bool value, string name) { if (!value) throw new Exception(name); checks++; Console.WriteLine("PASS " + name); }
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
