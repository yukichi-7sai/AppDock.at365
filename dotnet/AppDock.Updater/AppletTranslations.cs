using System.Text.Json;
using System.Text.RegularExpressions;

internal static partial class Program
{
    private static IOException TranslationError() => NativeMessages.Error("native.package.translations", text => new IOException(text));
    private static bool TranslationFileName(string name) => name == "applet.json" || Regex.IsMatch(name, @"^applet_[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*\.json$");
    private static List<string> AppletTranslationFiles(string source)
    {
        NoLinks(source);
        var manifestPath = Path.Combine(source, "extension.json"); NoLinks(manifestPath);
        using var document = JsonDocument.Parse(File.ReadAllText(manifestPath));
        var manifest = document.RootElement;
        if (!manifest.TryGetProperty("localization", out var declaration)) return [];
        if (declaration.ValueKind != JsonValueKind.Object || declaration.EnumerateObject().Count() != 1 ||
            !declaration.TryGetProperty("defaultLanguage", out var language) || language.ValueKind != JsonValueKind.String ||
            !Regex.IsMatch(language.GetString()!, @"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$") ||
            !manifest.TryGetProperty("minimumHostVersion", out var minimum) || minimum.ValueKind != JsonValueKind.String ||
            !Regex.IsMatch(minimum.GetString()!, @"^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z.-]+)?$") ||
            !System.Version.TryParse(minimum.GetString()!.TrimStart('v').Split('+')[0], out var version) || version < new System.Version(0, 159, 0)) throw TranslationError();
        var folder = Path.Combine(source, "resources", "translations"); NoLinks(folder, source);
        if (!Directory.Exists(folder)) throw TranslationError();
        var files = Directory.EnumerateFileSystemEntries(folder).Order(StringComparer.Ordinal).ToList();
        if (!files.Any(file => Path.GetFileName(file) == "applet.json")) throw TranslationError();
        foreach (var file in files)
        {
            NoLinks(file, source);
            if (!File.Exists(file) || !TranslationFileName(Path.GetFileName(file))) throw TranslationError();
            using var dictionary = JsonDocument.Parse(File.ReadAllText(file));
            if (dictionary.RootElement.ValueKind != JsonValueKind.Object) throw TranslationError();
            if (Path.GetFileName(file) == "applet.json" && dictionary.RootElement.EnumerateObject().Any(entry =>
                !Regex.IsMatch(entry.Name, @"^[a-zA-Z0-9][a-zA-Z0-9._-]*$") || entry.Value.ValueKind != JsonValueKind.String ||
                string.IsNullOrWhiteSpace(entry.Value.GetString()))) throw TranslationError();
        }
        return files;
    }
    private static List<Item> PlanAppletTranslations(string source, string destination)
    {
        source = Full(source); destination = Full(destination); NoLinks(source); NoLinks(destination);
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(source, "extension.json")));
        var manifest = document.RootElement;
        var id = manifest.GetProperty("id").GetString()!;
        var version = manifest.GetProperty("version").GetString()!;
        if (!Regex.IsMatch(id, "^[a-z0-9][a-z0-9.-]{0,100}$")) throw TranslationError();
        SafeName(id);
        var items = new List<Item>();
        foreach (var file in AppletTranslationFiles(source))
        {
            var target = Path.Combine(destination, "translations", "applets", id, Path.GetFileName(file));
            if (Same(file, target) || Within(source, target)) throw TranslationError();
            ResourceTarget(target);
            var exists = File.Exists(target);
            items.Add(new("applet-resource", id, version, file, target, Hash(file), exists ? "update" : "install", exists ? Hash(target) : null));
        }
        return items;
    }
    private static void ValidateAppletResource(string baseDirectory, Item item, List<Swap> swaps)
    {
        var owner = swaps.Select(swap => swap.Item).SingleOrDefault(parent => parent.Kind == "applet" && parent.Id == item.Id);
        var name = Path.GetFileName(item.Destination);
        if (owner is null || Operation(owner) == "uninstall" || Operation(item) == "uninstall" || owner.Version != item.Version ||
            !TranslationFileName(name) || !Same(item.Destination, Path.Combine(baseDirectory, "translations", "applets", owner.Id, name)) ||
            !Same(item.Source, Path.Combine(owner.Source, "resources", "translations", name))) throw TranslationError();
        ResourceTarget(item.Destination);
    }
}
