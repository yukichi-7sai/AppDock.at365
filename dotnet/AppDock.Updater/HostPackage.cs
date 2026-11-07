using System.IO.Compression;
using System.Text.Json;

internal static partial class Program
{
    private const string HostManifest = "appdock-host.json";
    // Only program-owned top-level entries may be exchanged. User data and Applets
    // never enter the transaction, even if a downloaded manifest lists them.
    private static readonly HashSet<string> HostFiles = new(StringComparer.Ordinal) {
        "AppDock.at365.exe", HostManifest, "chrome_100_percent.pak", "chrome_200_percent.pak",
        "d3dcompiler_47.dll", "dxcompiler.dll", "dxil.dll", "electron_wer.dll", "ffmpeg.dll",
        "icudtl.dat", "LICENSE.electron.txt", "LICENSES.chromium.html", "resources.pak",
        "snapshot_blob.bin", "v8_context_snapshot.bin", "vk_swiftshader_icd.json",
        "vk_swiftshader.dll", "vulkan-1.dll"
    };
    private static bool FileItem(string kind) => kind is "host" or "host-file" or "host-resource" or "applet-resource";
    private static bool ResourceDirectory(string name) => name is "translations" or "configs";
    private static void ResourceName(string name)
    {
        SafeName(name);
        if (!name.Contains('/') || !ResourceDirectory(name.Split('/')[0]))
            throw NativeMessages.Error("native.hostPackage.resourceDestination", text => new IOException(text));
        if (name.StartsWith("translations/applets/", StringComparison.OrdinalIgnoreCase)) throw TranslationError();
    }
    private static void ResourceTarget(string file)
    {
        NoLinks(file);
        if (Directory.Exists(file)) throw NativeMessages.Error("native.hostPackage.resourceFileRequired", text => new IOException(text));
        for (var parent = Path.GetDirectoryName(file); !string.IsNullOrEmpty(parent); parent = Path.GetDirectoryName(parent))
            if (File.Exists(parent)) throw NativeMessages.Error("native.hostPackage.resourceParentFile", text => new IOException(text));
    }
    private static string HostKind(string name) => name == "AppDock.at365.exe" ? "host" :
        HostFiles.Contains(name) ? "host-file" : name is "resources" or "locales" || ResourceDirectory(name) ? "host-directory" :
        throw NativeMessages.Error("native.hostPackage.invalidEntry", text => new IOException(text));
    private static bool IsHostEntry(string name) => HostFiles.Contains(name) || name is "resources" or "locales" || ResourceDirectory(name);
    private static List<string> ReadHostPackage(string directory, string? version = null, bool exact = false)
    {
        NoLinks(directory);
        var manifest = Path.Combine(directory, HostManifest); NoLinks(manifest);
        using var document = JsonDocument.Parse(File.ReadAllText(manifest));
        var root = document.RootElement;
        if (root.GetProperty("schemaVersion").GetInt32() != 1 ||
            (version is not null && root.GetProperty("version").GetString() != version))
            throw NativeMessages.Error("native.hostPackage.versionMismatch", text => new IOException(text));
        var entries = root.GetProperty("entries").EnumerateArray().Select(e => e.GetString()!).ToList();
        if (entries.Count < 3 || entries.Distinct(StringComparer.OrdinalIgnoreCase).Count() != entries.Count ||
            entries.Any(e => !IsHostEntry(e)) || !entries.Contains("AppDock.at365.exe") ||
            !entries.Contains("resources") || !entries.Contains(HostManifest))
            throw NativeMessages.Error("native.hostPackage.manifestEntry", text => new IOException(text));
        if (exact)
        {
            var actual = Directory.EnumerateFileSystemEntries(directory).Select(p => Path.GetFileName(p)).ToHashSet(StringComparer.Ordinal);
            if (!actual.SetEquals(entries)) throw NativeMessages.Error("native.hostPackage.contentsMismatch", text => new IOException(text));
            foreach (var name in entries)
            {
                var location = Path.Combine(directory, name); NoLinks(location);
                if (FileItem(HostKind(name)) ? !File.Exists(location) : !Directory.Exists(location))
                    throw NativeMessages.Error("native.hostPackage.fileKind", text => new IOException(text));
            }
            foreach (var file in Files(directory)) {
                var relative = Path.GetRelativePath(directory, file).Replace('\\', '/');
                if (ResourceDirectory(relative.Split('/')[0])) ResourceName(relative);
            }
            using var stream = File.OpenRead(Path.Combine(directory, "AppDock.at365.exe"));
            if (stream.ReadByte() != 'M' || stream.ReadByte() != 'Z' || !File.Exists(Path.Combine(directory, "resources", "app.asar")))
                throw NativeMessages.Error("native.hostPackage.filesMissing", text => new IOException(text));
        }
        return entries;
    }
    private static List<string> WriteHostPackage(string directory, string version)
    {
        var entries = Directory.EnumerateFileSystemEntries(directory).Select(p => Path.GetFileName(p)).Where(n => n != HostManifest).Append(HostManifest).Order(StringComparer.Ordinal).ToList();
        if (entries.Any(n => !IsHostEntry(n))) throw NativeMessages.Error("native.hostPackage.unmanagedEntry", text => new IOException(text));
        NoLinks(Path.Combine(directory, HostManifest)); NoLinks(Path.Combine(directory, HostManifest + ".tmp"));
        Write(Path.Combine(directory, HostManifest), new { schemaVersion = 1, version, entries });
        ReadHostPackage(directory, version, true);
        var files = Files(directory);
        foreach (var file in files)
        {
            var name = Path.GetFileName(file).ToLowerInvariant();
            if (name is "coreclr.dll" or "clrjit.dll" or "hostfxr.dll" or "hostpolicy.dll" or "system.private.corelib.dll")
                throw NativeMessages.Error("native.hostPackage.runtimeBundled", text => new IOException(text), new { path = Path.GetRelativePath(directory, file) });
            if (name.EndsWith(".runtimeconfig.json", StringComparison.Ordinal))
            {
                using var config = JsonDocument.Parse(File.ReadAllText(file));
                var options = config.RootElement.GetProperty("runtimeOptions");
                if (options.TryGetProperty("includedFrameworks", out _) ||
                    !(options.TryGetProperty("framework", out _) || options.TryGetProperty("frameworks", out _)))
                    throw NativeMessages.Error("native.hostPackage.sharedRuntimeRequired", text => new IOException(text), new { path = Path.GetRelativePath(directory, file) });
            }
        }
        return files;
    }
    private static List<Item> PlanHost(string source, string destination, string version)
    {
        source = Full(source); destination = Full(destination); NoLinks(source); NoLinks(destination);
        if (Same(source, destination) || Within(source, destination) || Within(destination, source))
            throw NativeMessages.Error("native.hostPackage.independentDirectories", text => new IOException(text));
        var next = ReadHostPackage(source, version, true);
        // The initial manual migration may start from an EXE-only installation.
        var previous = File.Exists(Path.Combine(destination, HostManifest)) ? ReadHostPackage(destination) :
            Directory.EnumerateFileSystemEntries(destination).Select(p => Path.GetFileName(p)).Where(IsHostEntry).ToList();
        var items = new List<Item>();
        foreach (var name in next.Union(previous, StringComparer.Ordinal).Order(StringComparer.Ordinal))
        {
            var kind = HostKind(name); var target = Path.Combine(destination, name); NoLinks(target);
            if (ResourceDirectory(name))
            {
                // Only files shipped by this version are replaced. Additional files stay untouched.
                if (File.Exists(target)) throw NativeMessages.Error("native.hostPackage.resourceDirectoryRequired", text => new IOException(text));
                if (!next.Contains(name)) continue;
                foreach (var file in Files(Path.Combine(source, name)).Order(StringComparer.Ordinal))
                {
                    var relative = Path.GetRelativePath(source, file).Replace('\\', '/'); ResourceName(relative);
                    var installed = Path.Combine(destination, relative); ResourceTarget(installed);
                    var exists = File.Exists(installed);
                    items.Add(new("host-resource", relative, version, file, installed, Hash(file),
                        exists ? "update" : "install", exists ? Hash(installed) : null));
                }
                continue;
            }
            var present = Exists(target, kind);
            if ((FileItem(kind) ? Directory.Exists(target) : File.Exists(target)) ||
                (!previous.Contains(name) && (present || File.Exists(target) || Directory.Exists(target))))
                throw NativeMessages.Error("native.hostPackage.unmanagedDestination", text => new IOException(text));
            if (!next.Contains(name) && !present) continue;
            var staged = next.Contains(name) ? Path.Combine(source, name) : "";
            items.Add(new(kind, name == "AppDock.at365.exe" ? "host" : name, version, staged, target,
                staged == "" ? null : FileItem(kind) ? Hash(staged) : TreeHash(staged),
                staged == "" ? "uninstall" : present ? "update" : "install",
                present ? FileItem(kind) ? Hash(target) : TreeHash(target) : null));
        }
        if (!items.Any(i => i.Kind == "host" && i.Operation == "update")) throw NativeMessages.Error("native.hostPackage.executableMissing", text => new IOException(text));
        return items;
    }
    private static void DeployHost(string source, string destination)
    {
        source = Full(source); destination = Full(destination); NoLinks(source); NoLinks(destination);
        var entries = ReadHostPackage(source, exact: true);
        if (Same(source, destination) || Within(source, destination) || Within(destination, source)) throw NativeMessages.Error("native.hostPackage.overlappingDirectories", text => new IOException(text));
        if (!Directory.Exists(destination)) throw NativeMessages.Error("native.hostPackage.destinationMissing", text => new IOException(text));
        var previous = File.Exists(Path.Combine(destination, HostManifest)) ? ReadHostPackage(destination) : new List<string>();
        // Inspect every destination first; do not follow links while copying or pruning.
        foreach (var name in entries.Union(previous))
        {
            var target = Path.Combine(destination, name); NoLinks(target);
            if (FileItem(HostKind(name)) ? Directory.Exists(target) : File.Exists(target)) throw NativeMessages.Error("native.hostPackage.destinationKind", text => new IOException(text));
            if (ResourceDirectory(name))
            {
                if (!entries.Contains(name)) continue;
                foreach (var file in Files(Path.Combine(source, name)))
                {
                    ResourceTarget(Path.Combine(destination, Path.GetRelativePath(source, file)));
                }
            }
            else if (Directory.Exists(target)) _ = Files(target);
        }
        foreach (var name in entries.Where(n => n != HostManifest))
        {
            var origin = Path.Combine(source, name); var target = Path.Combine(destination, name);
            if (FileItem(HostKind(name))) File.Copy(origin, target, true);
            else
            {
                var files = Files(origin); Directory.CreateDirectory(target);
                foreach (var file in files)
                {
                    var relative = Path.GetRelativePath(origin, file); var installed = Path.Combine(target, relative);
                    Directory.CreateDirectory(Path.GetDirectoryName(installed)!); File.Copy(file, installed, true);
                    if (Hash(file) != Hash(installed)) throw NativeMessages.Error("native.hostPackage.resourceHashMismatch", text => new IOException(text));
                }
                var keep = files.Select(f => Path.GetRelativePath(origin, f)).ToHashSet(StringComparer.OrdinalIgnoreCase);
                if (!ResourceDirectory(name))
                    foreach (var file in Files(target)) if (!keep.Contains(Path.GetRelativePath(target, file))) File.Delete(file);
            }
            var kind = HostKind(name);
            if (!ResourceDirectory(name) && (FileItem(kind) ? Hash(origin) != Hash(target) : TreeHash(origin) != TreeHash(target))) throw NativeMessages.Error("native.hostPackage.deployedHashMismatch", text => new IOException(text));
        }
        foreach (var obsolete in previous.Except(entries).Where(n => !ResourceDirectory(n))) Delete(Path.Combine(destination, obsolete), HostKind(obsolete));
        File.Copy(Path.Combine(source, HostManifest), Path.Combine(destination, HostManifest), true);
    }
}
