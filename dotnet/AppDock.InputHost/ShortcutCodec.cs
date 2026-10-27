using System.Runtime.InteropServices;
using System.Text;

namespace AppDock.InputHost;

internal sealed record ShortcutCondition(Condition When, bool BlockOriginalInput = true, StackConditionTerm[][]? StackConditions = null);
internal sealed record ShortcutInput(string Shortcut, bool BlockOriginalInput = true,
    ShortcutCondition[]? Conditions = null, ConditionEnvironment? Environment = null,
    string? Owner = null, long TouchpadGeneration = 0);
internal sealed record ShortcutStatus(string Shortcut, bool Registered, string[] InputKeys,
    string Backend = "hook", bool EffectiveBlockOriginalInput = true, string? Error = null);
internal readonly record struct ShortcutChord(uint Key, int Modifiers);
internal static class ShortcutCodec
{
    // Japanese IME mode keys may arrive without a matching key-up, like Pause.
    internal static bool IsPulse(uint key) => key is 0x13 or 0x15 or 0xF0;
    // Normalize derived codes only at their physical positions. Extended Break
    // and unrelated remapped keys keep their own identities.
    internal static uint CaptureKey(uint key, uint scan, uint flags)
    {
        if ((flags & 1) != 0) return key;
        return (scan, key) switch {
            (0x70, 0xF0 or 0xF1 or 0xF2 or 0xF5 or 0xF6) => 0x15,
            (0x46, 0x03) => 0x91, // Ctrl+ScrollLock arrives as Cancel/Break.
            (0x7B, 0xF7) => 0x1D, // Ctrl+Alt+NonConvert arrives as IME word registration.
            _ => key
        };
    }
    internal static bool IsModifier(uint key) => key is 0x10 or 0x11 or 0x12 or 0x5B or 0x5C or >= 0xA0 and <= 0xA5;
    internal static bool Protected(ShortcutChord chord) =>
        ((chord.Modifiers & 8) != 0 && chord.Key == 0x4C) ||
        ((chord.Modifiers & 3) == 3 && chord.Key == 0x2E);
    internal static ShortcutChord Parse(string shortcut, nint layout)
    {
        var parts = shortcut.Split('+');
        var modifiers = 0;
        foreach (var part in parts[..^1]) modifiers |= part switch {
            "Ctrl" => 1, "Alt" => 2, "Shift" => 4, "Win" => 8,
            _ => throw new ArgumentException("Unknown shortcut modifier.")
        };
        var name = parts[^1];
        uint key = name switch {
            "Pause" => 0x13, "CapsLock" => 0x14, "ScrollLock" => 0x91,
            "Alphanumeric" => 0xF0, "Convert" => 0x1C, "NonConvert" => 0x1D,
            "KanaMode" => 0x15,
            "Space" => 0x20, "Tab" => 9, "Enter" => 13,
            "Escape" => 27, "Backspace" => 8, "Delete" => 0x2E, "Insert" => 0x2D,
            "Home" => 0x24, "End" => 0x23, "PageUp" => 0x21, "PageDown" => 0x22,
            "Up" => 0x26, "Down" => 0x28, "Left" => 0x25, "Right" => 0x27, _ => 0
        };
        if (key == 0 && name.StartsWith('F') && int.TryParse(name.AsSpan(1), out var function) && function is >= 1 and <= 24)
            key = (uint)(0x70 + function - 1);
        if (key == 0 && name.Length == 1 && char.IsAsciiLetterOrDigit(name[0])) key = char.ToUpperInvariant(name[0]);
        if (key == 0) {
            var character = name == "Plus" ? '+' : name.Length == 1 ? name[0] : '\0';
            var code = character == '\0' ? -1 : VkKeyScanEx(character, layout);
            if (code == -1) throw new ArgumentException("このキーボード配列ではキーを検出できません。");
            key = (uint)(code & 255);
            var shift = (code >> 8) & 7;
            modifiers |= (shift & 1) << 2 | (shift & 2) >> 1 | (shift & 4) >> 1;
        }
        var chord = new ShortcutChord(key, modifiers);
        if (Protected(chord)) throw new ArgumentException("Windowsが保護するキーは割り当てられません。");
        return chord;
    }
    internal static string? Format(uint key, int modifiers, nint layout)
    {
        if (IsModifier(key)) return null;
        string? name = key switch {
            >= 0x41 and <= 0x5A or >= 0x30 and <= 0x39 => ((char)key).ToString(),
            >= 0x70 and <= 0x87 => "F" + (key - 0x6F),
            >= 0x60 and <= 0x69 => (key - 0x60).ToString(),
            0x20 => "Space", 9 => "Tab", 13 => "Enter", 27 => "Escape", 8 => "Backspace",
            0x2E => "Delete", 0x2D => "Insert", 0x24 => "Home", 0x23 => "End",
            0x21 => "PageUp", 0x22 => "PageDown", 0x25 => "Left", 0x26 => "Up",
            0x27 => "Right", 0x28 => "Down", 0x13 => "Pause",
            0x14 => "CapsLock", 0x91 => "ScrollLock",
            0xF0 => "Alphanumeric", 0x1C => "Convert", 0x1D => "NonConvert",
            0x15 => "KanaMode",
            0x6B => "Plus", 0x6D => "-", 0x6E => ".", 0x6F => "/", _ => null
        };
        if (name == null) {
            var state = new byte[256];
            if ((modifiers & 4) != 0) state[0x10] = 0x80;
            var text = new StringBuilder(8);
            var length = ToUnicodeEx(key, MapVirtualKeyEx(key, 0, layout), state, text, 8, 4, layout);
            if (length != 1 || !",./\\;[]'=-+".Contains(text[0])) return null;
            name = text[0] == '+' ? "Plus" : text[0].ToString();
        }
        return ((modifiers & 1) != 0 ? "Ctrl+" : "") + ((modifiers & 2) != 0 ? "Alt+" : "") +
            ((modifiers & 4) != 0 ? "Shift+" : "") + ((modifiers & 8) != 0 ? "Win+" : "") + name;
    }
    [DllImport("user32.dll", EntryPoint = "VkKeyScanExW", CharSet = CharSet.Unicode)] private static extern short VkKeyScanEx(char value, nint layout);
    [DllImport("user32.dll", EntryPoint = "MapVirtualKeyExW")] private static extern uint MapVirtualKeyEx(uint key, uint mode, nint layout);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int ToUnicodeEx(uint key, uint scan, byte[] state, StringBuilder text, int size, uint flags, nint layout);
}
