using System.Diagnostics;
using System.Runtime.InteropServices;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.IO.Pipes;

internal static partial class Program
{
    private const long Limit = 512L * 1024 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true, DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull };
    private sealed record Item(string Kind, string Id, string Version, string Source, string Destination, string? Sha256, string? Operation = null, string? PreviousSha256 = null);
    private sealed record Swap(Item Item, string Next, string Backup);
    private static string Full(string value) => Path.GetFullPath(value);
    private static bool Same(string a, string b) => string.Equals(Full(a), Full(b), StringComparison.OrdinalIgnoreCase);
    private static bool Within(string root, string file) => Full(file).StartsWith(Full(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetVolumeNameForVolumeMountPointW(string mountPoint, StringBuilder volumeName, uint length);
    private static bool VolumeMount(string directory)
    {
        if (!OperatingSystem.IsWindows() || !Directory.Exists(directory)) return false;
        var volume = new StringBuilder(64);
        return GetVolumeNameForVolumeMountPointW(directory.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, volume, 64);
    }
    private static void NoLinks(string value, string? treeRoot = null)
    {
        var target = Full(value);
        var boundary = Full(treeRoot ?? value);
        for (var current = target; !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
            if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
            {
                // Registered volume ancestors are normal storage, including during apply/recovery.
                // A linked target or any mount/link inside a payload tree is still rejected.
                if (!Same(current, boundary) && Within(current, boundary) && VolumeMount(current)) continue;
                throw new IOException("更新対象にリンク・ジャンクションを使用できません。");
            }
    }
    private static void SafeName(string name)
    {
        if (string.IsNullOrEmpty(name) || name.StartsWith('/') || name.Contains('\\') || name.Contains(':') || name.Any(c => c < 32) ||
            name.Split('/').Any(p => string.IsNullOrEmpty(p) || p is "." or ".." || p.EndsWith('.') || p.EndsWith(' ') ||
                System.Text.RegularExpressions.Regex.IsMatch(p, @"^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase)))
            throw new IOException("更新ファイルに使用できないパスが含まれています。");
    }
    private static string Hash(string file)
    {
        using var stream = File.OpenRead(file);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }
    private static string TreeHash(string directory, long max = Limit)
    {
        NoLinks(directory);
        var files = Files(directory, max).OrderBy(p => Path.GetRelativePath(directory, p).Replace('\\', '/'), StringComparer.Ordinal);
        var text = new StringBuilder();
        foreach (var file in files) text.Append(Path.GetRelativePath(directory, file).Replace('\\', '/')).Append('\0').Append(Hash(file)).Append('\n');
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text.ToString()))).ToLowerInvariant();
    }
    private static List<string> Files(string directory, long max = Limit)
    {
        var files = new List<string>(); long size = 0;
        void Walk(string current)
        {
            NoLinks(current, directory);
            foreach (var file in Directory.EnumerateFileSystemEntries(current))
            {
                NoLinks(file, directory); SafeName(Path.GetRelativePath(directory, file).Replace('\\', '/'));
                if (Directory.Exists(file)) Walk(file);
                else
                {
                    size += new FileInfo(file).Length;
                    if (size > max || files.Count >= 10000) throw new IOException("更新ファイルのサイズ・個数が上限を超えました。");
                    files.Add(file);
                }
            }
        }
        Walk(directory); return files;
    }
    private static void Extract(string archive, string directory, long max = Limit)
    {
        if (Directory.Exists(directory)) throw new IOException("展開先は空の新規フォルダーにしてください。");
        Directory.CreateDirectory(directory); NoLinks(directory);
        using var zip = ZipFile.OpenRead(archive);
        long size = 0; var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (zip.Entries.Count > 10000) throw new IOException("ZIPのファイル数が上限を超えました。");
        foreach (var entry in zip.Entries)
        {
            var name = entry.FullName.TrimEnd('/'); SafeName(name);
            if (((entry.ExternalAttributes >> 16) & 0xf000) == 0xa000) throw new IOException("ZIPにリンクを含めることはできません。");
            if (!paths.Add(name)) throw new IOException("ZIPに重複したパスがあります。");
            var destination = Full(Path.Combine(directory, name));
            if (!Within(directory, destination) || (size += entry.Length) > max) throw new IOException("ZIPの展開範囲・サイズが上限を超えました。");
            if (entry.FullName.EndsWith('/')) Directory.CreateDirectory(destination);
            else { Directory.CreateDirectory(Path.GetDirectoryName(destination)!); entry.ExtractToFile(destination, false); }
        }
    }
    private static void Write(string file, object value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        var next = file + ".tmp";
        var bytes = JsonSerializer.SerializeToUtf8Bytes(value, JsonOptions);
        using (var stream = new FileStream(next, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            stream.Write(bytes); stream.Flush(true);
        }
        File.Move(next, file, true);
    }
    private static void CopyDirectory(string source, string destination, long max = Limit)
    {
        Directory.CreateDirectory(destination);
        foreach (var file in Files(source, max))
        {
            var target = Path.Combine(destination, Path.GetRelativePath(source, file));
            Directory.CreateDirectory(Path.GetDirectoryName(target)!); File.Copy(file, target, false);
        }
    }
    private static void Move(string source, string destination, string kind)
    {
        NoLinks(source); NoLinks(destination);
        if (FileItem(kind)) File.Move(source, destination); else Directory.Move(source, destination);
    }
    private static void Delete(string location, string kind)
    {
        NoLinks(location);
        if (FileItem(kind)) { if (File.Exists(location)) File.Delete(location); }
        else if (Directory.Exists(location)) Directory.Delete(location, true);
    }
    private static bool Exists(string location, string kind) => FileItem(kind) ? File.Exists(location) : Directory.Exists(location);
    private static void Verify(Item item)
    {
        NoLinks(item.Source); NoLinks(item.Destination);
        var digest = FileItem(item.Kind) ? Hash(item.Source) : TreeHash(item.Source, item.Kind == "host-directory" ? HostLimit : Limit);
        if (!string.Equals(digest, item.Sha256, StringComparison.OrdinalIgnoreCase)) throw new IOException("準備済み更新ファイルのハッシュが一致しません。");
        if (item.Kind == "applet")
        {
            using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(item.Source, "extension.json")));
            if (manifest.RootElement.GetProperty("id").GetString() != item.Id || manifest.RootElement.GetProperty("version").GetString() != item.Version)
                throw new IOException("準備済みAppletのID・版が一致しません。");
        }
    }
    private static void Restart(string executable, string[] arguments, UpdateProgressWindow? progress = null)
    {
        progress?.Phase("starting");
        var pipeName = "AppDock.UpdateReady." + Guid.NewGuid().ToString("N");
        using var pipe = progress is null ? null : new NamedPipeServerStream(pipeName, PipeDirection.In, 1,
            PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(executable)!, CreateNoWindow = true };
        start.Environment.Remove("ELECTRON_RUN_AS_NODE");
        start.Environment.Remove("APPDOCK_UPDATE_READY_PIPE");
        if (pipe is not null) start.Environment["APPDOCK_UPDATE_READY_PIPE"] = pipeName;
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        try
        {
            using var process = Process.Start(start) ?? throw new IOException("AppDockを起動できませんでした。");
            if (pipe is not null && !WaitForUpdatedWindow(pipe, process).GetAwaiter().GetResult())
                progress?.Outcome("startupUnconfirmed");
        }
        catch when (progress is not null) { progress.Outcome("restartFailed"); }
    }
    private static string StateDirectory(string baseDirectory, string? requested)
    {
        var legacy = Path.Combine(baseDirectory, "data");
        var state = Full(requested ?? legacy);
        var profiles = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "at365", "AppDock", "profiles");
        // Normal state is local-only. Isolated tests can keep state within their placement.
        if (!Same(state, legacy) && !Within(baseDirectory, state) &&
            !(Same(Path.GetDirectoryName(state)!, profiles) && System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(state), "^[a-f0-9]{64}$")))
            throw new IOException("PC専用の更新記録保存先が正しくありません。");
        NoLinks(state); return state;
    }
    private static void Apply(string jobPath)
    {
        jobPath = Full(jobPath);
        var stage = Path.GetDirectoryName(jobPath)!;
        NoLinks(stage);
        if (!Path.GetFileName(stage).StartsWith("AppDock-update-", StringComparison.Ordinal) || !Within(Path.GetTempPath(), stage))
            throw new IOException("更新ジョブは専用の一時フォルダーに必要です。");
        using var job = JsonDocument.Parse(File.ReadAllText(jobPath));
        var root = job.RootElement;
        if (root.GetProperty("schemaVersion").GetInt32() == 2) { ApplyPackageJob(root, stage, jobPath); return; }
        if (root.GetProperty("schemaVersion").GetInt32() != 1) throw new IOException("更新ジョブの形式が違います。");
        var baseDirectory = Full(root.GetProperty("baseDirectory").GetString()!); NoLinks(baseDirectory);
        var executable = Full(root.GetProperty("executable").GetString()!); NoLinks(executable);
        var result = Full(root.GetProperty("result").GetString()!);
        var stateDirectory = StateDirectory(baseDirectory, root.TryGetProperty("stateDirectory", out var state) && state.ValueKind == JsonValueKind.String ? state.GetString() : null);
        if (!Same(result, Path.Combine(stateDirectory, "update-result.json"))) throw new IOException("結果保存先が正しくありません。");
        var arguments = root.GetProperty("args").EnumerateArray().Select(v => v.GetString()!).ToArray();
        var swaps = new List<Swap>(); var destinations = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var value in root.GetProperty("items").EnumerateArray())
        {
            var item = new Item(value.GetProperty("kind").GetString()!, value.GetProperty("id").GetString()!, value.GetProperty("version").GetString()!,
                Full(value.GetProperty("source").GetString()!), Full(value.GetProperty("destination").GetString()!), value.GetProperty("sha256").GetString());
            if (!Within(stage, item.Source) || !destinations.Add(item.Destination)) throw new IOException("更新ジョブの範囲・重複が正しくありません。");
            if (item.Kind == "host")
            {
                if (item.Id != "host" || !Same(item.Destination, executable) || !Same(Path.GetDirectoryName(executable)!, baseDirectory) ||
                    !string.Equals(Path.GetFileName(executable), "AppDock.at365.exe", StringComparison.OrdinalIgnoreCase)) throw new IOException("本体更新先が正しくありません。");
            }
            else if (item.Kind != "applet" || !Same(Path.GetDirectoryName(item.Destination)!, Path.Combine(baseDirectory, "extensions")))
                throw new IOException("Applet更新先が正しくありません。");
            Verify(item);
            if (!Exists(item.Destination, item.Kind)) throw new IOException("更新対象がなくなりました。");
            if (item.Kind == "applet")
            {
                using var installed = JsonDocument.Parse(File.ReadAllText(Path.Combine(item.Destination, "extension.json")));
                if (installed.RootElement.GetProperty("id").GetString() != item.Id) throw new IOException("配置先AppletのIDが一致しません。");
            }
            var suffix = Guid.NewGuid().ToString("N");
            swaps.Add(new(item, item.Destination + ".update-" + suffix, item.Destination + ".previous-" + suffix));
        }
        if (swaps.Count is 0 or > 501) throw new IOException("更新対象の数が正しくありません。");
        var processes = new List<Process>();
        foreach (var id in root.GetProperty("processIds").EnumerateArray().Select(v => v.GetInt32()).Distinct())
        {
            if (id == Environment.ProcessId || id <= 0) throw new IOException("待機するプロセスが正しくありません。");
            try
            {
                var process = Process.GetProcessById(id);
                // Open the handle before ready/commit, so a process that exits just after
                // AppDock quits is still observable and a reused PID cannot be mistaken for it.
                try { _ = process.Handle; processes.Add(process); }
                catch (InvalidOperationException) { process.Dispose(); }
            }
            catch (ArgumentException) { }
        }
        var journal = Path.Combine(stateDirectory, "update-transaction.json");
        NoLinks(result); NoLinks(journal);
        if (File.Exists(journal)) throw new IOException("前回の更新復元が必要です。AppDockを起動し直してください。");
        using var progress = UpdateProgressWindow.Open(root, executable);
        File.WriteAllText(jobPath + ".ready", "ready");
        var deadline = Stopwatch.StartNew();
        while (!File.Exists(jobPath + ".commit"))
        {
            if (deadline.ElapsedMilliseconds > 30000) throw new IOException("更新の開始が取り消されました。");
            Thread.Sleep(100);
        }
        bool changed = false; bool restored = true; bool allExited = false; bool committed = false;
        try
        {
            foreach (var process in processes)
            {
                if (!process.WaitForExit(Math.Max(1, 60000 - (int)deadline.ElapsedMilliseconds))) throw new IOException("AppDock/ランチャー/対象Appletの終了を確認できませんでした。");
                process.Dispose();
            }
            allExited = true;
            progress?.Phase("applying");
            Write(journal, new { executable, helper = Path.Combine(stage, "AppDock.Updater.exe"), swaps });
            foreach (var swap in swaps)
            {
                Verify(swap.Item);
                if (swap.Item.Kind == "host") File.Copy(swap.Item.Source, swap.Next);
                else CopyDirectory(swap.Item.Source, swap.Next);
                Verify(swap.Item with { Source = swap.Next });
            }
            foreach (var swap in swaps)
            {
                Move(swap.Item.Destination, swap.Backup, swap.Item.Kind); changed = true;
                Move(swap.Next, swap.Item.Destination, swap.Item.Kind);
            }
            // Record the commit before cleanup. Recovery can finish it without undoing a complete update.
            Write(journal, new { executable, helper = Path.Combine(stage, "AppDock.Updater.exe"), swaps, committed = true });
            committed = true;
            Write(result, new { ok = true, time = DateTimeOffset.Now, message = "更新を適用しました。", temporaryDirectory = stage, updated = swaps.Select(s => new { s.Item.Id, s.Item.Version }) });
        }
        catch (Exception error)
        {
            // After commit, leave the journal for recovery instead of rolling back a completed update.
            if (committed) { restored = false; progress?.Outcome("updateFailed"); throw; }
            progress?.Phase("restoring");
            foreach (var swap in swaps.AsEnumerable().Reverse())
            {
                try
                {
                    if (Exists(swap.Backup, swap.Item.Kind)) { Delete(swap.Item.Destination, swap.Item.Kind); Move(swap.Backup, swap.Item.Destination, swap.Item.Kind); }
                }
                catch { restored = false; }
            }
            if (restored && File.Exists(journal)) File.Delete(journal);
            Write(result, new { ok = false, time = DateTimeOffset.Now, message = error.Message, restored, temporaryDirectory = restored ? stage : null });
        }
        finally
        {
            foreach (var process in processes) process.Dispose();
            if (restored)
            {
                foreach (var swap in swaps)
                {
                    try { Delete(swap.Next, swap.Item.Kind); Delete(swap.Backup, swap.Item.Kind); } catch { restored = false; }
                }
                if (committed && restored) File.Delete(journal);
            }
        }
        // If a process failed to exit, avoid starting a second instance. Nothing was exchanged in that case.
        if (restored && (changed || allExited)) Restart(executable, arguments, progress);
        else progress?.Outcome("updateFailed");
    }
    private static void Recover(string baseDirectory, string? requestedState = null)
    {
        baseDirectory = Full(baseDirectory); NoLinks(baseDirectory);
        var stateDirectory = StateDirectory(baseDirectory, requestedState);
        var journal = Path.Combine(stateDirectory, "update-transaction.json"); NoLinks(journal);
        var result = Path.Combine(stateDirectory, "update-result.json"); NoLinks(result);
        if (!File.Exists(journal)) return;
        using var document = JsonDocument.Parse(File.ReadAllText(journal));
        if (document.RootElement.TryGetProperty("schemaVersion", out var schema) && schema.GetInt32() == 2)
        { RecoverPackageJournal(baseDirectory, stateDirectory, document.RootElement); return; }
        var committed = document.RootElement.TryGetProperty("committed", out var flag) && flag.GetBoolean();
        var swaps = JsonSerializer.Deserialize<List<Swap>>(document.RootElement.GetProperty("swaps"), JsonOptions)
            ?? throw new IOException("更新復元の記録がありません。");
        if (swaps.Count is 0 or > 501) throw new IOException("更新復元の対象数が正しくありません。");
        var destinations = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        // Validate the entire journal before touching any destination.
        foreach (var swap in swaps)
        {
            var kind = swap.Item.Kind; var destination = Full(swap.Item.Destination);
            var backup = Full(swap.Backup); var next = Full(swap.Next);
            var suffix = backup.StartsWith(destination + ".previous-", StringComparison.OrdinalIgnoreCase) ? backup[(destination.Length + 10)..] : "";
            if (!Within(baseDirectory, destination) || !destinations.Add(destination) ||
                !System.Text.RegularExpressions.Regex.IsMatch(suffix, "^[a-f0-9]{32}$") ||
                !Same(next, destination + ".update-" + suffix) ||
                (kind == "host" ? swap.Item.Id != "host" || !Same(destination, Path.Combine(baseDirectory, "AppDock.at365.exe")) : kind != "applet" || !Same(Path.GetDirectoryName(destination)!, Path.Combine(baseDirectory, "extensions"))))
                throw new IOException("更新復元の範囲が正しくありません。");
            NoLinks(destination); NoLinks(backup); NoLinks(next);
            if (!Exists(destination, kind) && !Exists(backup, kind)) throw new IOException("復元する更新ファイルが見つかりません。");
            if (committed) Verify(swap.Item with { Source = destination });
        }
        foreach (var swap in swaps.AsEnumerable().Reverse())
        {
            if (committed) Delete(swap.Backup, swap.Item.Kind);
            else if (Exists(swap.Backup, swap.Item.Kind))
            {
                Delete(swap.Item.Destination, swap.Item.Kind);
                Move(swap.Backup, swap.Item.Destination, swap.Item.Kind);
            }
            Delete(swap.Next, swap.Item.Kind);
        }
        Write(result, new { ok = committed, restored = !committed,
            message = committed ? "中断された更新の後片付けを完了しました。" : "中断された更新を元のバージョンへ復元しました。", time = DateTimeOffset.Now });
        File.Delete(journal);
    }
    private static void Pack(string kind, string source, string version, string output)
    {
        source = Full(source); output = Full(output); NoLinks(source); NoLinks(output);
        string id; string? minimumHostVersion = null; string payload;
        List<string>? files = null;
        if (kind == "host")
        {
            id = "host"; payload = "AppDock.at365.exe";
            if (Directory.Exists(source))
            {
                WriteHostPackage(source, version); files = Files(source, HostLimit); payload = "update.zip";
            }
        }
        else if (kind == "applet")
        {
            using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(source, "extension.json")));
            var m = manifest.RootElement;
            id = m.GetProperty("id").GetString()!; version = m.GetProperty("version").GetString()!;
            var entry = m.GetProperty("entry").GetString()!; SafeName(entry);
            if (m.GetProperty("apiVersion").GetInt32() != 1 || !File.Exists(Path.Combine(source, entry)))
                throw new IOException("発行するAppletのAPI・エントリーが正しくありません。");
            if (m.TryGetProperty("minimumHostVersion", out var minimum)) minimumHostVersion = minimum.GetString();
            // Collect before creating the archive, including when output is the source itself.
            files = Files(source).Where(file => Path.GetRelativePath(source, file).Replace('\\', '/') is not ("update.json" or "update.zip")).ToList();
            payload = "update.zip";
        }
        else throw new IOException("発行形式はhost/appletです。");
        Directory.CreateDirectory(output);
        var filePath = Path.Combine(output, payload);
        NoLinks(filePath);
        NoLinks(Path.Combine(output, "update.json"));
        NoLinks(Path.Combine(output, "update.json.tmp"));
        var temporary = Path.Combine(output, ".update-" + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            if (files is not null)
            {
                using (var archive = ZipFile.Open(temporary, ZipArchiveMode.Create))
                    foreach (var file in files!)
                        archive.CreateEntryFromFile(file, Path.GetRelativePath(source, file).Replace('\\', '/'), CompressionLevel.Optimal);
                if (new FileInfo(temporary).Length > Limit) throw new IOException("ZIPの配布サイズが上限を超えました。");
                File.Move(temporary, filePath, true);
            }
            else if (!Same(source, filePath)) { File.Copy(source, temporary); File.Move(temporary, filePath, true); }
            Write(Path.Combine(output, "update.json"), new { schemaVersion = 1, kind, id, version, minimumHostVersion,
                payload = new { file = payload, sha256 = Hash(filePath), size = new FileInfo(filePath).Length, format = files is null ? "exe" : "zip" } });
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    public static int Main(string[] args)
    {
        try
        {
            if (args.Length == 3 && args[0] == "--extract") Extract(args[1], args[2]);
            else if (args.Length == 3 && args[0] == "--extract-host") Extract(args[1], args[2], HostLimit);
            else if (args.Length == 2 && args[0] == "--apply") Apply(args[1]);
            else if (args.Length == 2 && args[0] == "--recover") Recover(args[1]);
            else if (args.Length == 3 && args[0] == "--recover") Recover(args[1], args[2]);
            else if (args.Length == 5 && args[0] == "--pack") Pack(args[1], args[2], args[3], args[4]);
            else if (args.Length == 4 && args[0] == "--plan-host")
                Console.WriteLine(JsonSerializer.Serialize(PlanHost(args[1], args[2], args[3]), JsonOptions));
            else if (args.Length == 3 && args[0] == "--deploy-host") DeployHost(args[1], args[2]);
            else if (args.Length == 3 && args[0] == "--seal-host") WriteHostPackage(Full(args[1]), args[2]);
            else throw new ArgumentException("AppDock.Updater: --apply job.json / --extract zip directory / --recover base / --pack host|applet source version output");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
    }
}
