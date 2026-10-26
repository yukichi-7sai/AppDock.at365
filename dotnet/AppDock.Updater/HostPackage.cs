using System.IO.Compression;
using System.Text.Json;

internal static partial class Program
{
    private const string HostManifest = "appdock-host.json";
    private const long HostLimit = 1024L * 1024 * 1024;
    // Only program-owned top-level entries may be exchanged. User data and Applets
    // never enter the transaction, even if a downloaded manifest lists them.
    private static readonly HashSet<string> HostFiles = new(StringComparer.Ordinal) {
        "AppDock.at365.exe", HostManifest, "chrome_100_percent.pak", "chrome_200_percent.pak",
        "d3dcompiler_47.dll", "dxcompiler.dll", "dxil.dll", "electron_wer.dll", "ffmpeg.dll",
        "icudtl.dat", "LICENSE.electron.txt", "LICENSES.chromium.html", "resources.pak",
        "snapshot_blob.bin", "v8_context_snapshot.bin", "vk_swiftshader_icd.json",
        "vk_swiftshader.dll", "vulkan-1.dll"
    };
    private static bool FileItem(string kind) => kind is "host" or "host-file";
    private static string HostKind(string name) => name == "AppDock.at365.exe" ? "host" :
        HostFiles.Contains(name) ? "host-file" : name is "resources" or "locales" ? "host-directory" :
        throw new IOException("本体に含められないファイル・フォルダーです。");
    private static bool IsHostEntry(string name) => HostFiles.Contains(name) || name is "resources" or "locales";
    private static List<string> ReadHostPackage(string directory, string? version = null, bool exact = false)
    {
        NoLinks(directory);
        var manifest = Path.Combine(directory, HostManifest); NoLinks(manifest);
        if (new FileInfo(manifest).Length > 65536) throw new IOException("本体のファイル一覧が大きすぎます。");
        using var document = JsonDocument.Parse(File.ReadAllText(manifest));
        var root = document.RootElement;
        if (root.GetProperty("schemaVersion").GetInt32() != 1 ||
            (version is not null && root.GetProperty("version").GetString() != version))
            throw new IOException("本体のファイル一覧・版が一致しません。");
        var entries = root.GetProperty("entries").EnumerateArray().Select(e => e.GetString()!).ToList();
        if (entries.Count is < 3 or > 50 || entries.Distinct(StringComparer.OrdinalIgnoreCase).Count() != entries.Count ||
            entries.Any(e => !IsHostEntry(e)) || !entries.Contains("AppDock.at365.exe") ||
            !entries.Contains("resources") || !entries.Contains(HostManifest))
            throw new IOException("本体のファイル一覧に不正な項目があります。");
        if (exact)
        {
            var actual = Directory.EnumerateFileSystemEntries(directory).Select(p => Path.GetFileName(p)).ToHashSet(StringComparer.Ordinal);
            if (!actual.SetEquals(entries)) throw new IOException("本体の一覧と配布フォルダーの内容が一致しません。");
            foreach (var name in entries)
            {
                var location = Path.Combine(directory, name); NoLinks(location);
                if (FileItem(HostKind(name)) ? !File.Exists(location) : !Directory.Exists(location))
                    throw new IOException("本体のファイル形式が一致しません。");
            }
            _ = Files(directory, HostLimit);
            using var stream = File.OpenRead(Path.Combine(directory, "AppDock.at365.exe"));
            if (stream.ReadByte() != 'M' || stream.ReadByte() != 'Z' || !File.Exists(Path.Combine(directory, "resources", "app.asar")))
                throw new IOException("本体のEXE・resourcesがありません。");
        }
        return entries;
    }
    private static void WriteHostPackage(string directory, string version)
    {
        var entries = Directory.EnumerateFileSystemEntries(directory).Select(p => Path.GetFileName(p)).Where(n => n != HostManifest).Append(HostManifest).Order(StringComparer.Ordinal).ToList();
        if (entries.Any(n => !IsHostEntry(n))) throw new IOException("本体配布フォルダーに利用者データ・不明なファイルがあります。");
        NoLinks(Path.Combine(directory, HostManifest)); NoLinks(Path.Combine(directory, HostManifest + ".tmp"));
        Write(Path.Combine(directory, HostManifest), new { schemaVersion = 1, version, entries });
        ReadHostPackage(directory, version, true);
    }
    private static List<Item> PlanHost(string source, string destination, string version)
    {
        source = Full(source); destination = Full(destination); NoLinks(source); NoLinks(destination);
        if (Same(source, destination) || Within(source, destination) || Within(destination, source))
            throw new IOException("本体配布元と配置先は独立したフォルダーにしてください。");
        var next = ReadHostPackage(source, version, true);
        // The initial manual migration may start from an EXE-only installation.
        var previous = File.Exists(Path.Combine(destination, HostManifest)) ? ReadHostPackage(destination) :
            Directory.EnumerateFileSystemEntries(destination).Select(p => Path.GetFileName(p)).Where(IsHostEntry).ToList();
        var items = new List<Item>();
        foreach (var name in next.Union(previous, StringComparer.Ordinal).Order(StringComparer.Ordinal))
        {
            var kind = HostKind(name); var target = Path.Combine(destination, name); NoLinks(target);
            var present = Exists(target, kind);
            if ((FileItem(kind) ? Directory.Exists(target) : File.Exists(target)) ||
                (!previous.Contains(name) && (present || File.Exists(target) || Directory.Exists(target))))
                throw new IOException("本体の配置先に管理外のファイルがあります。");
            if (!next.Contains(name) && !present) continue;
            var staged = next.Contains(name) ? Path.Combine(source, name) : "";
            items.Add(new(kind, name == "AppDock.at365.exe" ? "host" : name, version, staged, target,
                staged == "" ? null : FileItem(kind) ? Hash(staged) : TreeHash(staged, HostLimit),
                staged == "" ? "uninstall" : present ? "update" : "install",
                present ? FileItem(kind) ? Hash(target) : TreeHash(target, HostLimit) : null));
        }
        if (!items.Any(i => i.Kind == "host" && i.Operation == "update")) throw new IOException("配置先の本体EXEが見つかりません。");
        return items;
    }
    private static void DeployHost(string source, string destination)
    {
        source = Full(source); destination = Full(destination); NoLinks(source); NoLinks(destination);
        var entries = ReadHostPackage(source, exact: true);
        if (Same(source, destination) || Within(source, destination) || Within(destination, source)) throw new IOException("配布元と配置先が重複しています。");
        if (!Directory.Exists(destination)) throw new IOException("配置先フォルダーがありません。");
        var previous = File.Exists(Path.Combine(destination, HostManifest)) ? ReadHostPackage(destination) : new List<string>();
        // Inspect every destination first; do not follow links while copying or pruning.
        foreach (var name in entries.Union(previous))
        {
            var target = Path.Combine(destination, name); NoLinks(target);
            if (FileItem(HostKind(name)) ? Directory.Exists(target) : File.Exists(target)) throw new IOException("配置先の形式が一致しません。");
            if (Directory.Exists(target)) _ = Files(target, HostLimit);
        }
        foreach (var name in entries.Where(n => n != HostManifest))
        {
            var origin = Path.Combine(source, name); var target = Path.Combine(destination, name);
            if (FileItem(HostKind(name))) File.Copy(origin, target, true);
            else
            {
                var files = Files(origin, HostLimit); Directory.CreateDirectory(target);
                foreach (var file in files)
                {
                    var relative = Path.GetRelativePath(origin, file); var installed = Path.Combine(target, relative);
                    Directory.CreateDirectory(Path.GetDirectoryName(installed)!); File.Copy(file, installed, true);
                }
                var keep = files.Select(f => Path.GetRelativePath(origin, f)).ToHashSet(StringComparer.OrdinalIgnoreCase);
                foreach (var file in Files(target, HostLimit)) if (!keep.Contains(Path.GetRelativePath(target, file))) File.Delete(file);
            }
            var kind = HostKind(name);
            if ((FileItem(kind) ? Hash(origin) != Hash(target) : TreeHash(origin, HostLimit) != TreeHash(target, HostLimit))) throw new IOException("配置した本体のハッシュが一致しません。");
        }
        foreach (var obsolete in previous.Except(entries)) Delete(Path.Combine(destination, obsolete), HostKind(obsolete));
        File.Copy(Path.Combine(source, HostManifest), Path.Combine(destination, HostManifest), true);
    }
}
