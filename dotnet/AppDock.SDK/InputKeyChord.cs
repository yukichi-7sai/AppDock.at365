using System.Text.RegularExpressions;

namespace AppDock.SDK;

public sealed record InputKeyChord(ushort[] Modifiers, ushort Key, bool Extended)
{
    // Symbols are resolved against the foreground window's keyboard layout at send time.
    public char? Symbol { get; init; }
    public InputKeyChord ResolveSymbol(short mapping)
    {
        if (Symbol is null) return this;
        if (mapping < 0 || (mapping & 0xff) == 0 || ((mapping >> 8) & ~7) != 0)
            throw new ArgumentException("現在のキーボード配列では記号キーを送信できません。");
        var extra = new List<ushort>();
        if ((mapping & 0x100) != 0) extra.Add(0x10);
        if ((mapping & 0x200) != 0) extra.Add(0x11);
        if ((mapping & 0x400) != 0) extra.Add(0x12);
        return this with { Key = (ushort)(mapping & 0xff), Modifiers = Modifiers.Concat(extra).Distinct().ToArray(), Symbol = null };
    }
    public string ToShortcut()
    {
        var modifiers = Modifiers.Select(m => m switch { 0x11 => "Ctrl", 0x12 => "Alt", 0x10 => "Shift", 0x5B => "Win", _ => throw new ArgumentException("Invalid modifier") });
        var key = Symbol is char symbol ? symbol switch { '.' => "Period", ';' => "Semicolon", '/' => "Slash", '+' => "Plus", '-' => "Minus", _ => throw new ArgumentException("Invalid symbol") }
            : Key is >= 0x41 and <= 0x5A or >= 0x30 and <= 0x39 ? ((char)Key).ToString()
            : Key is >= 0x70 and <= 0x87 ? "F" + (Key - 0x6F)
            : Key switch { 0x5B => "Win", 0x13 => "Pause", 0x2C => "PrintScreen", 0x0D => "Enter", 0x09 => "Tab", 0x1B => "Escape", 0x20 => "Space", 0x08 => "Backspace", 0x2E => "Delete", 0x2D => "Insert", 0x24 => "Home", 0x23 => "End", 0x21 => "PageUp", 0x22 => "PageDown", 0x25 => "Left", 0x27 => "Right", 0x26 => "Up", 0x28 => "Down", _ => throw new ArgumentException("Invalid key") };
        return string.Join("+", modifiers.Append(key));
    }
    public static InputKeyChord Parse(string value)
    {
        if (value.Length > 100) throw new ArgumentException("送信キーが長すぎます。");
        var parts = value.Split('+').Select(part => part.Trim().ToUpperInvariant()).ToArray();
        var modifiers = parts[..^1].Select(part => part switch {
            "CTRL" or "CONTROL" => (ushort)0x11, "ALT" => (ushort)0x12,
            "SHIFT" => (ushort)0x10, "WIN" or "WINDOWS" or "META" => (ushort)0x5B,
            _ => throw new ArgumentException($"未対応の修飾キー: {part}")
        }).ToArray();
        if (modifiers.Distinct().Count() != modifiers.Length) throw new ArgumentException("修飾キーが重複しています。");
        var name = parts[^1];
        char? symbol = name switch { "." or "PERIOD" => '.', ";" or "SEMICOLON" => ';', "/" or "SLASH" => '/', "PLUS" => '+', "-" or "MINUS" => '-', _ => null };
        if (symbol is not null) return new(modifiers, 0, false) { Symbol = symbol };
        var key = name.Length == 1 && (name[0] is >= 'A' and <= 'Z' or >= '0' and <= '9') ? (ushort)name[0]
            : Regex.IsMatch(name, "^F([1-9]|1[0-9]|2[0-4])$") ? (ushort)(0x6F + int.Parse(name[1..]))
            : name switch {
                "WIN" or "WINDOWS" or "META" when modifiers.Length == 0 => (ushort)0x5B,
                "PAUSE" => 0x13, "PRINTSCREEN" or "PRTSCN" => 0x2C,
                "ENTER" => (ushort)0x0D, "TAB" => 0x09, "ESC" or "ESCAPE" => 0x1B, "SPACE" => 0x20,
                "BACKSPACE" => 0x08, "DELETE" => 0x2E, "INSERT" => 0x2D, "HOME" => 0x24, "END" => 0x23,
                "PAGEUP" => 0x21, "PAGEDOWN" => 0x22, "LEFT" => 0x25, "RIGHT" => 0x27, "UP" => 0x26, "DOWN" => 0x28,
                _ => throw new ArgumentException($"未対応の送信キー: {value}（例: Ctrl+Shift+T）")
            };
        return new(modifiers, (ushort)key, key is >= 0x21 and <= 0x28 or 0x2C or 0x2D or 0x2E or 0x5B);
    }
}
