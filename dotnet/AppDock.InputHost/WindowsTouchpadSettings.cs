using Microsoft.Win32;
using System.IO;
using Microsoft.Win32.SafeHandles;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace AppDock.InputHost;

internal sealed record TouchpadValue(bool Exists, uint Value = 0);
internal sealed record TouchpadDescriptor(string Id, string Key, string Action, string Mode, uint CustomAction, int Direction);
internal sealed record TouchpadWindowsGesture(string Gesture, string? Key, uint Action, uint Mode, bool Supported);
internal sealed record TouchpadWindowsSnapshot(long Generation, string Revision, Dictionary<string, TouchpadValue> Values,
    Dictionary<string, uint> Effective, TouchpadWindowsGesture[] Gestures);
internal sealed record TouchpadChange(string Name, TouchpadValue Before, TouchpadValue After);
internal sealed record TouchpadWindowsPlan(string Revision, TouchpadChange[] Changes, TouchpadWindowsGesture[] Before,
    Dictionary<string, string> Connections);
internal interface ITouchpadValues { TouchpadValue Read(string name); void Write(string name, TouchpadValue value); }
internal interface ITouchpadCache : IDisposable { uint Read(string name); void Changed(string name); }

internal sealed class TouchpadRegistryValues : ITouchpadValues
{
    internal const string Path = @"Software\Microsoft\Windows\CurrentVersion\PrecisionTouchPad";
    public TouchpadValue Read(string name)
    {
        using var key = Registry.CurrentUser.OpenSubKey(Path) ?? throw new InvalidOperationException("タッチパッドのWindows設定が見つかりません。");
        var value = key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames);
        if (value == null) return new(false);
        if (key.GetValueKind(name) != RegistryValueKind.DWord || value is not int number)
            throw new InvalidDataException("タッチパッドのWindows設定形式を確認できません。");
        return new(true, unchecked((uint)number));
    }
    public void Write(string name, TouchpadValue value)
    {
        using var key = Registry.CurrentUser.OpenSubKey(Path, true) ?? throw new InvalidOperationException("タッチパッド設定へ書き込めません。");
        if (value.Exists) key.SetValue(name, unchecked((int)value.Value), RegistryValueKind.DWord);
        else key.DeleteValue(name, false);
        key.Flush();
    }
}

internal static class TouchpadWindowsModel
{
    internal static readonly TouchpadDescriptor[] Descriptors = new[] { "Three", "Four" }.SelectMany(fingers =>
        new[] { "Tap", "Up", "Down", "Left", "Right" }.Select(direction => {
            var tap = direction == "Tap";
            var stem = (tap ? "Custom" : "") + fingers + "Finger" + direction;
            return new TouchpadDescriptor(fingers.ToLowerInvariant() + "." + direction.ToLowerInvariant(),
                stem + "KeyParams", stem, fingers + "Finger" + (tap ? "Tap" : "Slide") + "Enabled",
                tap ? 7u : 0xFFFFu, direction switch { "Left" => 1, "Up" => 2, "Right" => 3, "Down" => 4, _ => 0 });
        })).ToArray();
    internal static readonly string[] Names = Descriptors.SelectMany(row => new[] { row.Key, row.Action, row.Mode }).Distinct().ToArray();
    // The descriptor profile verifies this table against the installed Windows settings handler.
    internal static readonly uint[] PresetTable = [1,1,1, 2,1,2, 3,1,1, 4,1,3,
        1,2,4, 2,2,2, 3,2,4, 4,2,3, 1,3,15, 2,3,16, 3,3,14, 4,3,17];
    internal static uint? Action(TouchpadDescriptor row, IReadOnlyDictionary<string, uint> values)
    {
        var mode = values[row.Mode];
        if (mode == 0xFFFF) return values[row.Action];
        if (row.Direction == 0) return mode <= 4 ? mode : null;
        if (mode == 0) return 0;
        for (int i = 0; i < PresetTable.Length; i += 3)
            if (PresetTable[i] == row.Direction && PresetTable[i + 1] == mode) return PresetTable[i + 2];
        return null;
    }
    internal static uint Encode(string shortcut)
    {
        var parts = shortcut.Split('+');
        if (!int.TryParse(parts[^1].TrimStart('F'), out var function) || parts[^1] != "F" + function || function is < 13 or > 24)
            throw new ArgumentException("接続用キーはF13～F24です。");
        uint modifiers = 0;
        foreach (var part in parts[..^1]) {
            uint flag = part switch { "Ctrl" => 1, "Shift" => 2, "Win" => 4, "Alt" => 16, _ => throw new ArgumentException("修飾キーが不正です。") };
            if ((modifiers & flag) != 0) throw new ArgumentException("修飾キーが重複しています。");
            modifiers |= flag;
        }
        return ((uint)(0x70 + function - 1) << 16) | modifiers;
    }
    internal static string? Decode(uint value)
    {
        var key = value >> 16; var modifiers = value & 0xFFFF;
        if (key is < 0x70 or > 0x87 || (modifiers & ~31u) != 0) return null;
        return ((modifiers & 1) != 0 ? "Ctrl+" : "") + ((modifiers & 16) != 0 ? "Alt+" : "") +
            ((modifiers & 2) != 0 ? "Shift+" : "") + ((modifiers & 12) != 0 ? "Win+" : "") + "F" + (key - 0x70 + 1);
    }
    internal static TouchpadWindowsGesture[] Gestures(IReadOnlyDictionary<string, uint> effective) => Descriptors.Select(row => {
        var action = Action(row, effective);
        var key = action == row.CustomAction ? Decode(effective[row.Key]) : null;
        return new TouchpadWindowsGesture(row.Id, key, action ?? uint.MaxValue, effective[row.Mode], action != null);
    }).ToArray();
    internal static TouchpadWindowsPlan Plan(TouchpadWindowsSnapshot snapshot, Dictionary<string, string> connections)
    {
        if (connections.Count is < 1 or > 10 || connections.Keys.Any(id => !Descriptors.Any(row => row.Id == id)))
            throw new ArgumentException("変更するジェスチャーを確認してください。");
        var desired = new Dictionary<string, uint>();
        foreach (var (id, shortcut) in connections) {
            var row = Descriptors.Single(row => row.Id == id);
            if (row.Direction != 0 && snapshot.Effective[row.Mode] != 0xFFFF)
                foreach (var sibling in Descriptors.Where(sibling => sibling.Mode == row.Mode))
                    desired[sibling.Action] = Action(sibling, snapshot.Effective)
                        ?? throw new InvalidOperationException("ほかの方向の動作を維持できないWindows設定のため、変更しません。");
            desired[row.Key] = Encode(shortcut);
            desired[row.Action] = row.CustomAction;
            desired[row.Mode] = 0xFFFF;
        }
        // All targets override the preserved siblings, independent of request order.
        foreach (var (id, shortcut) in connections) {
            var row = Descriptors.Single(row => row.Id == id);
            desired[row.Key] = Encode(shortcut); desired[row.Action] = row.CustomAction;
        }
        var after = new Dictionary<string, uint>(snapshot.Effective);
        foreach (var (name, value) in desired) after[name] = value;
        var gestures = Gestures(after);
        foreach (var (id, shortcut) in connections)
            if (gestures.Count(row => row.Key == shortcut) != 1)
                throw new InvalidOperationException("Windowsの別のジェスチャーと接続用キーが重複しています。");
        var modes = Descriptors.Select(row => row.Mode).ToHashSet();
        var changes = desired.OrderBy(pair => modes.Contains(pair.Key) ? 1 : 0)
            .Select(pair => new TouchpadChange(pair.Key, snapshot.Values[pair.Key], new(true, pair.Value)))
            .Where(change => change.Before != change.After).ToArray();
        return new(snapshot.Revision, changes, snapshot.Gestures, connections);
    }
}

internal sealed class WindowsTouchpadSettings : IDisposable
{
    private readonly ITouchpadValues values;
    private readonly Func<ITouchpadCache> openCache;
    private readonly Func<long> generation;
    internal WindowsTouchpadSettings(ITouchpadValues values, Func<ITouchpadCache> openCache, Func<long>? generation = null)
    { this.values = values; this.openCache = openCache; this.generation = generation ?? (() => 0); }
    internal TouchpadWindowsSnapshot Read()
    {
        for (var attempt = 0; ; attempt++) {
            try { return ReadOnce(); }
            catch (IOException) when (attempt < 2) { }
        }
    }
    private TouchpadWindowsSnapshot ReadOnce()
    {
        var observed = generation();
        using var cache = openCache();
        var raw = TouchpadWindowsModel.Names.ToDictionary(name => name, name => values.Read(name));
        var effective = TouchpadWindowsModel.Names.ToDictionary(name => name, cache.Read);
        if (observed != generation()) throw new IOException("Windows設定の変更を確認中です。再確認してください。");
        var revision = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { raw, effective }))));
        return new(observed, revision, raw, effective, TouchpadWindowsModel.Gestures(effective));
    }
    internal TouchpadWindowsSnapshot Apply(TouchpadWindowsPlan plan)
    {
        var current = Read();
        if (current.Revision != plan.Revision) throw new IOException("Windows設定が操作前に変更されました。再確認してください。");
        // Recompute server-side: IPC cannot write arbitrary values or paths.
        var validated = TouchpadWindowsModel.Plan(current, plan.Connections);
        if (JsonSerializer.Serialize(validated.Changes) != JsonSerializer.Serialize(plan.Changes)) throw new ArgumentException("Windows設定の変更計画が一致しません。");
        using var cache = openCache();
        var written = new List<TouchpadChange>();
        try {
            foreach (var change in validated.Changes) {
                if (values.Read(change.Name) != change.Before) throw new IOException("Windows設定が操作中に変更されました。");
                values.Write(change.Name, change.After); written.Add(change);
                if (values.Read(change.Name) != change.After) throw new IOException("Windows設定の保存を確認できません。");
                cache.Changed(change.Name);
                if (cache.Read(change.Name) != change.After.Value) throw new IOException("Windows設定の反映を確認できません。");
            }
            var after = Read();
            foreach (var row in after.Gestures) {
                if (validated.Connections.TryGetValue(row.Gesture, out var key)) {
                    if (row.Key != key) throw new IOException("接続用キーの反映を確認できません。");
                } else {
                    var before = validated.Before.Single(before => before.Gesture == row.Gesture);
                    if (row.Action != before.Action || row.Key != before.Key || row.Supported != before.Supported)
                        throw new IOException("変更対象以外のジェスチャーの動作を確認できません。");
                }
            }
            return after;
        } catch {
            foreach (var change in written.AsEnumerable().Reverse()) {
                try { if (values.Read(change.Name) == change.After) { values.Write(change.Name, change.Before); cache.Changed(change.Name); } }
                catch { /* The durable manager journal remains pending for explicit recovery. */ }
            }
            throw;
        }
    }
    public void Dispose() { }
}

/// <summary>Generation changes invalidate native input immediately, before the main-process reread.</summary>
internal sealed class TouchpadWindowsMonitor : IDisposable
{
    private long generation = 1;
    private readonly CancellationTokenSource stopped = new();
    private readonly EventWaitHandle changed = new(false, EventResetMode.AutoReset);
    private readonly RegistryKey? key;
    private readonly Task worker = Task.CompletedTask;
    internal long Generation => Interlocked.Read(ref generation);
    internal TouchpadWindowsMonitor(Action notify)
    {
        key = Registry.CurrentUser.OpenSubKey(TouchpadRegistryValues.Path);
        if (key == null) return;
        worker = Task.Run(() => {
            while (!stopped.IsCancellationRequested) {
                var result = RegNotifyChangeKeyValue(key.Handle, false, 4 | 0x10000000, changed.SafeWaitHandle, true);
                if (result != 0) { Interlocked.Increment(ref generation); notify(); return; }
                if (WaitHandle.WaitAny([changed, stopped.Token.WaitHandle]) != 0) return;
                Interlocked.Increment(ref generation); notify();
            }
        });
    }
    public void Dispose() { stopped.Cancel(); worker.GetAwaiter().GetResult(); key?.Dispose(); changed.Dispose(); stopped.Dispose(); }
    [DllImport("advapi32.dll")] private static extern int RegNotifyChangeKeyValue(SafeRegistryHandle key, bool subtree,
        uint filter, SafeWaitHandle signal, bool asynchronous);
}

internal static class TouchpadInputLease
{
    internal static TouchpadWindowsMonitor? Monitor;
    internal static int Owned;
    internal static bool Accepts(long generation) => Volatile.Read(ref Owned) == 1 && generation > 0 && Monitor?.Generation == generation;
}

internal sealed class TouchpadWindowsController : IDisposable
{
    private readonly TouchpadWindowsMonitor monitor;
    private readonly Mutex lease;
    private TouchpadCacheProfile? profile;
    private bool owned, disposed;
    internal TouchpadWindowsController(Action changed)
    {
        var user = System.Security.Principal.WindowsIdentity.GetCurrent().User?.Value
            ?? throw new InvalidOperationException("Windowsユーザーを確認できません。");
        lease = new Mutex(false, "Local\\AppDock.TouchpadBridge." + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(user))));
        monitor = new TouchpadWindowsMonitor(changed);
        TouchpadInputLease.Monitor = monitor;
    }
    internal object Handle(string method, JsonElement request)
    {
        if (disposed) throw new ObjectDisposedException(nameof(TouchpadWindowsController));
        if (method == "touchpad.lease") {
            var enabled = request.GetProperty("enabled").GetBoolean();
            if (enabled && !owned) {
                try { owned = lease.WaitOne(0); } catch (AbandonedMutexException) { owned = true; }
            } else if (!enabled && owned) { lease.ReleaseMutex(); owned = false; }
            Volatile.Write(ref TouchpadInputLease.Owned, owned ? 1 : 0);
            return enabled ? owned : true;
        }
        profile ??= TouchpadCacheProfile.Read();
        using var settings = new WindowsTouchpadSettings(new TouchpadRegistryValues(), () => new TouchpadWindowsCache(profile), () => monitor.Generation);
        if (method == "touchpad.read") return settings.Read();
        if (method == "touchpad.plan") {
            var connections = request.GetProperty("connections").Deserialize<Dictionary<string, string>>(AppDock.Runtime.JsonRpcConnection.Json)
                ?? throw new ArgumentException("接続先がありません。");
            return TouchpadWindowsModel.Plan(settings.Read(), connections);
        }
        if (method == "touchpad.apply") {
            if (!owned) throw new InvalidOperationException("このAppDockはタッチパッド接続を所有していません。");
            var plan = request.GetProperty("plan").Deserialize<TouchpadWindowsPlan>(AppDock.Runtime.JsonRpcConnection.Json)
                ?? throw new ArgumentException("変更計画がありません。");
            return settings.Apply(plan);
        }
        throw new ArgumentException("Unknown touchpad operation.");
    }
    public void Dispose()
    {
        if (disposed) return;
        disposed = true; Volatile.Write(ref TouchpadInputLease.Owned, 0);
        if (owned) { lease.ReleaseMutex(); owned = false; }
        monitor.Dispose(); lease.Dispose();
    }
}
