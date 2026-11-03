namespace AppDock.InputHost;

internal static class InputPaletteKeys
{
    // Windows reports NumLock-off navigation as navigation VKs, not VK_NUMPAD digits.
    internal static int Index(uint key)
    {
        var digit = key is >= 0x30 and <= 0x39 ? (int)(key - 0x30) :
            key is >= 0x60 and <= 0x69 ? (int)(key - 0x60) : -1;
        return digit < 0 ? -1 : digit == 0 ? 9 : digit - 1;
    }
    internal static string? Action(uint key) => Index(key) is var index && index >= 0
        ? "choose:" + index
        : key switch {
            38 => "up", 40 => "down", 33 => "page-up", 34 => "page-down",
            36 => "home", 35 => "end", 37 or 39 => "switch",
            13 => "choose", 27 => "cancel", _ => null,
        };
    internal static bool Repeats(string key) => key is "up" or "down" or "page-up" or "page-down";
}
