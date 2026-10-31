using System.Runtime.InteropServices;

namespace AppDock.InputHost;

// Layout changes must not compile every command/condition inside a low-level hook.
// Groups retain the original row order; new layouts translate only distinct symbols.
internal sealed class ShortcutLookup
{
    private sealed record Entry(int Index, ShortcutInput Input);
    private sealed record Group(ShortcutPattern Pattern, List<Entry> Rows);
    private readonly Dictionary<ShortcutChord, List<Group>> fixedKeys = [];
    private readonly List<Group> symbols = [];
    private readonly Dictionary<nint, Dictionary<ShortcutChord, List<Group>>> layouts = [];
    internal bool HasSymbols => symbols.Count > 0;
    internal ShortcutLookup(ShortcutInput[] inputs)
    {
        var groups = new Dictionary<string, Group>(StringComparer.Ordinal);
        for (var index = 0; index < inputs.Length; index++) {
            var input = inputs[index];
            if (!groups.TryGetValue(input.Shortcut, out var group)) {
                try {
                    group = new Group(ShortcutCodec.Pattern(input.Shortcut), []);
                    if (group.Pattern.Character != '\0') symbols.Add(group);
                    else Add(fixedKeys, ShortcutCodec.Resolve(group.Pattern, 0), group);
                    groups.Add(input.Shortcut, group);
                } catch (ArgumentException) { continue; }
            }
            group.Rows.Add(new Entry(index, input));
        }
    }
    private static void Add(Dictionary<ShortcutChord, List<Group>> keys, ShortcutChord chord, Group group)
    {
        if (!keys.TryGetValue(chord, out var rows)) keys.Add(chord, rows = []);
        rows.Add(group);
    }
    private Dictionary<ShortcutChord, List<Group>> Layout(nint layout)
    {
        if (layouts.TryGetValue(layout, out var result)) return result;
        result = [];
        var translations = new Dictionary<char, short>();
        foreach (var group in symbols) {
            try { Add(result, ShortcutCodec.Resolve(group.Pattern, layout, translations), group); }
            catch (ArgumentException) { /* A symbol may be unavailable in this layout. */ }
        }
        layouts.Add(layout, result);
        return result;
    }
    internal void Prepare(nint current)
    {
        if (!HasSymbols) return;
        Layout(current);
        var loaded = new nint[GetKeyboardLayoutList(0, null)];
        if (loaded.Length == 0) return;
        var count = Math.Min(loaded.Length, GetKeyboardLayoutList(loaded.Length, loaded));
        for (var index = 0; index < count; index++) Layout(loaded[index]);
    }
    internal IEnumerable<ShortcutInput> Match(ShortcutChord chord, nint layout)
    {
        fixedKeys.TryGetValue(chord, out var fixedGroups);
        List<Group>? symbolGroups = null;
        if (HasSymbols) Layout(layout).TryGetValue(chord, out symbolGroups);
        var groups = (fixedGroups ?? []).Concat(symbolGroups ?? []).ToArray();
        // Merge only the matching groups. Never sort or copy the entire configured catalog.
        var positions = new int[groups.Length];
        while (true) {
            var next = -1;
            for (var group = 0; group < groups.Length; group++) {
                if (positions[group] == groups[group].Rows.Count) continue;
                if (next < 0 || groups[group].Rows[positions[group]].Index < groups[next].Rows[positions[next]].Index)
                    next = group;
            }
            if (next < 0) yield break;
            yield return groups[next].Rows[positions[next]++].Input;
        }
    }
    [DllImport("user32.dll")] private static extern int GetKeyboardLayoutList(int count, [Out] nint[]? layouts);
}
