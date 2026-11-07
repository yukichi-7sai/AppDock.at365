using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;

internal static partial class Program
{
    private static string Operation(Item item) => item.Operation ?? throw NativeMessages.Error("native.package.operationMissing", text => new IOException(text));
    private static void VerifyPrevious(Item item, string location)
    {
        NoLinks(location);
        if (!Exists(location, item.Kind) || !Regex.IsMatch(item.PreviousSha256 ?? "", "^[a-f0-9]{64}$", RegexOptions.IgnoreCase) ||
            !string.Equals(FileItem(item.Kind) ? Hash(location) : TreeHash(location), item.PreviousSha256, StringComparison.OrdinalIgnoreCase))
            throw NativeMessages.Error("native.package.previousMismatch", text => new IOException(text));
        if (item.Kind == "applet")
        {
            using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(location, "extension.json")));
            if (manifest.RootElement.GetProperty("id").GetString() != item.Id) throw NativeMessages.Error("native.updater.installedAppletMismatch", text => new IOException(text));
        }
    }
    private static string TransactionRoot(string baseDirectory, string operationId)
    {
        if (!Guid.TryParse(operationId, out var id)) throw NativeMessages.Error("native.package.transactionId", text => new IOException(text));
        return Path.Combine(baseDirectory, "extensions", ".transactions", id.ToString("N"));
    }
    private static void ValidatePackageSwaps(string baseDirectory, string executable, string operationId, List<Swap> swaps)
    {
        if (!Same(executable, Path.Combine(baseDirectory, "AppDock.at365.exe")) || swaps.Count == 0)
            throw NativeMessages.Error("native.package.hostOrCount", text => new IOException(text));
        NoLinks(baseDirectory); NoLinks(executable);
        var transactionRoot = TransactionRoot(baseDirectory, operationId); NoLinks(transactionRoot);
        var destinations = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < swaps.Count; index++)
        {
            var swap = swaps[index]; var item = swap.Item; var operation = Operation(item);
            var directory = Path.Combine(transactionRoot, index.ToString(System.Globalization.CultureInfo.InvariantCulture));
            if (operation is not ("install" or "update" or "uninstall") || !destinations.Add(Full(item.Destination)) ||
                !Same(swap.Next, Path.Combine(directory, "next")) || !Same(swap.Backup, Path.Combine(directory, "previous")))
                throw NativeMessages.Error("native.package.operationScope", text => new IOException(text));
            if (item.Kind == "host")
            {
                if (operation != "update" || item.Id != "host" || !Same(item.Destination, executable)) throw NativeMessages.Error("native.package.hostOperation", text => new IOException(text));
            }
            else if (item.Kind is "host-file" or "host-directory")
            {
                if (!IsHostEntry(item.Id) || ResourceDirectory(item.Id) || HostKind(item.Id) != item.Kind ||
                    !Same(item.Destination, Path.Combine(baseDirectory, item.Id))) throw NativeMessages.Error("native.package.hostFileDestination", text => new IOException(text));
            }
            else if (item.Kind == "host-resource")
            {
                ResourceName(item.Id);
                if (operation == "uninstall" || !Same(item.Destination, Path.Combine(baseDirectory, item.Id)))
                    throw NativeMessages.Error("native.package.resourceOperation", text => new IOException(text));
                ResourceTarget(item.Destination);
            }
            else if (item.Kind == "applet-resource") ValidateAppletResource(baseDirectory, item, swaps);
            else if (item.Kind != "applet" || item.Id == "appdock.default-shell" ||
                !Regex.IsMatch(item.Id, "^[a-z0-9][a-z0-9.-]{0,100}$") ||
                !Same(Path.GetDirectoryName(item.Destination)!, Path.Combine(baseDirectory, "extensions")))
                throw NativeMessages.Error("native.package.appletDestination", text => new IOException(text));
            else SafeName(Path.GetFileName(item.Destination));
            if (!FileItem(item.Kind) ? File.Exists(item.Destination) || File.Exists(swap.Next) || File.Exists(swap.Backup)
                : Directory.Exists(item.Destination) || Directory.Exists(swap.Next) || Directory.Exists(swap.Backup))
                throw NativeMessages.Error("native.package.fileKind", text => new IOException(text));
            if (operation == "install" && (item.PreviousSha256 is not null || (item.Kind == "applet" && !Same(item.Destination, Path.Combine(baseDirectory, "extensions", item.Id)))))
                throw NativeMessages.Error("native.package.installConditions", text => new IOException(text));
            if (operation == "uninstall" && (!string.IsNullOrEmpty(item.Source) || item.Sha256 is not null))
                throw NativeMessages.Error("native.package.uninstallPayload", text => new IOException(text));
            if (operation != "install" && !Regex.IsMatch(item.PreviousSha256 ?? "", "^[a-f0-9]{64}$", RegexOptions.IgnoreCase))
                throw NativeMessages.Error("native.package.previousHashMissing", text => new IOException(text));
            if (operation != "uninstall" && (string.IsNullOrEmpty(item.Source) || !Regex.IsMatch(item.Sha256 ?? "", "^[a-f0-9]{64}$", RegexOptions.IgnoreCase)))
                throw NativeMessages.Error("native.package.payloadMissing", text => new IOException(text));
            NoLinks(item.Destination); NoLinks(swap.Next); NoLinks(swap.Backup);
        }
    }
    private static void ValidateRecoveryState(List<Swap> swaps, bool committed)
    {
        foreach (var swap in swaps)
        {
            var item = swap.Item; var operation = Operation(item);
            var destination = Exists(item.Destination, item.Kind); var backup = Exists(swap.Backup, item.Kind);
            if (backup) VerifyPrevious(item, swap.Backup);
            if (Exists(swap.Next, item.Kind))
            {
                if (operation == "uninstall") throw NativeMessages.Error("native.package.uninstallUnknownPayload", text => new IOException(text));
                if (committed) Verify(item with { Source = swap.Next });
                else if (!FileItem(item.Kind)) _ = TreeHash(swap.Next);
                else NoLinks(swap.Next);
            }
            if (committed)
            {
                if (operation == "uninstall") { if (destination) throw NativeMessages.Error("native.package.uninstallDestinationChanged", text => new IOException(text)); }
                else Verify(item with { Source = item.Destination });
            }
            else if (operation == "install")
            {
                if (backup) throw NativeMessages.Error("native.package.installHasPrevious", text => new IOException(text));
                if (destination) Verify(item with { Source = item.Destination });
            }
            else if (backup)
            {
                if (destination)
                {
                    if (operation == "uninstall") throw NativeMessages.Error("native.package.uninstallDestinationChanged", text => new IOException(text));
                    Verify(item with { Source = item.Destination });
                }
            }
            else VerifyPrevious(item, item.Destination);
        }
    }
    private static void FinishPackageSwaps(string baseDirectory, string operationId, List<Swap> swaps, bool committed)
    {
        ValidateRecoveryState(swaps, committed);
        foreach (var swap in swaps.AsEnumerable().Reverse())
        {
            var operation = Operation(swap.Item);
            if (!committed)
            {
                if (operation == "install") Delete(swap.Item.Destination, swap.Item.Kind);
                else if (Exists(swap.Backup, swap.Item.Kind))
                {
                    Delete(swap.Item.Destination, swap.Item.Kind);
                    Move(swap.Backup, swap.Item.Destination, swap.Item.Kind);
                }
            }
            Delete(swap.Next, swap.Item.Kind);
            if (committed) Delete(swap.Backup, swap.Item.Kind);
            var directory = Path.GetDirectoryName(swap.Next)!;
            if (Directory.Exists(directory)) Directory.Delete(directory, false);
        }
        var transactionRoot = TransactionRoot(baseDirectory, operationId);
        if (Directory.Exists(transactionRoot)) Directory.Delete(transactionRoot, false);
    }
    private static void RecoverPackageJournal(string baseDirectory, string stateDirectory, JsonElement root)
    {
        var operationId = root.GetProperty("operationId").GetString()!;
        var executable = root.GetProperty("executable").GetString()!;
        var swaps = JsonSerializer.Deserialize<List<Swap>>(root.GetProperty("swaps"), JsonOptions) ?? throw NativeMessages.Error("native.package.recoveryMissing", text => new IOException(text));
        var committed = root.TryGetProperty("committed", out var flag) && flag.GetBoolean();
        ValidatePackageSwaps(baseDirectory, executable, operationId, swaps);
        FinishPackageSwaps(baseDirectory, operationId, swaps, committed);
        Write(Path.Combine(stateDirectory, "update-result.json"), new { ok = committed, restored = !committed, operationId,
            message = committed ? NativeMessages.Text("native.package.cleanupCompleted") : NativeMessages.Text("native.package.restored"), time = DateTimeOffset.Now });
        File.Delete(Path.Combine(stateDirectory, "update-transaction.json"));
    }
    private static void ApplyPackageJob(JsonElement root, string stage, string jobPath)
    {
        var baseDirectory = Full(root.GetProperty("baseDirectory").GetString()!);
        var executable = Full(root.GetProperty("executable").GetString()!);
        var stateDirectory = StateDirectory(baseDirectory, root.TryGetProperty("stateDirectory", out var state) ? state.GetString() : null);
        var result = Full(root.GetProperty("result").GetString()!);
        if (!Same(result, Path.Combine(stateDirectory, "update-result.json"))) throw NativeMessages.Error("native.package.resultLocation", text => new IOException(text));
        var operationId = root.GetProperty("operationId").GetString()!;
        var transactionRoot = TransactionRoot(baseDirectory, operationId);
        var swaps = root.GetProperty("items").EnumerateArray().Select((value, index) => {
            var item = JsonSerializer.Deserialize<Item>(value, JsonOptions) ?? throw NativeMessages.Error("native.package.invalidTarget", text => new IOException(text));
            var directory = Path.Combine(transactionRoot, index.ToString(System.Globalization.CultureInfo.InvariantCulture));
            return new Swap(item, Path.Combine(directory, "next"), Path.Combine(directory, "previous"));
        }).ToList();
        ValidatePackageSwaps(baseDirectory, executable, operationId, swaps);
        var journal = Path.Combine(stateDirectory, "update-transaction.json"); NoLinks(journal); NoLinks(result);
        if (File.Exists(journal) || Directory.Exists(transactionRoot)) throw NativeMessages.Error("native.package.recoveryRequired", text => new IOException(text));
        foreach (var swap in swaps)
        {
            var item = swap.Item;
            if (Operation(item) == "install")
            {
                if (File.Exists(item.Destination) || Directory.Exists(item.Destination)) throw NativeMessages.Error("native.package.installDestinationExists", text => new IOException(text));
            }
            else VerifyPrevious(item, item.Destination);
            if (Operation(item) != "uninstall")
            {
                if (!Within(stage, item.Source)) throw NativeMessages.Error("native.package.payloadScope", text => new IOException(text));
                Verify(item);
            }
        }
        var arguments = root.GetProperty("args").EnumerateArray().Select(v => v.GetString()!).ToArray();
        using var progress = UpdateProgressWindow.Open(root, executable);
        var processes = new List<Process>();
        bool exited = false, committed = false, recovered = true;
        try
        {
            foreach (var id in root.GetProperty("processIds").EnumerateArray().Select(v => v.GetInt32()).Distinct())
            {
                if (id <= 0 || id == Environment.ProcessId) throw NativeMessages.Error("native.package.waitProcess", text => new IOException(text));
                try { var process = Process.GetProcessById(id); try { _ = process.Handle; processes.Add(process); } catch (InvalidOperationException) { process.Dispose(); } }
                catch (ArgumentException) { }
            }
            File.WriteAllText(jobPath + ".ready", "ready");
            var deadline = Stopwatch.StartNew();
            while (!File.Exists(jobPath + ".commit")) { if (deadline.ElapsedMilliseconds > 30000) throw NativeMessages.Error("native.package.cancelled", text => new IOException(text)); Thread.Sleep(100); }
            foreach (var process in processes) if (!process.WaitForExit(Math.Max(1, 60000 - (int)deadline.ElapsedMilliseconds))) throw NativeMessages.Error("native.package.exitUnconfirmed", text => new IOException(text));
            exited = true;
            progress?.Phase("applying");
            // Revalidate after all writers stopped, before creating the journal or moving a file.
            foreach (var swap in swaps)
            {
                if (Operation(swap.Item) == "install") { if (File.Exists(swap.Item.Destination) || Directory.Exists(swap.Item.Destination)) throw NativeMessages.Error("native.package.installDestinationChanged", text => new IOException(text)); }
                else VerifyPrevious(swap.Item, swap.Item.Destination);
                if (Operation(swap.Item) != "uninstall") Verify(swap.Item);
            }
            Write(journal, new { schemaVersion = 2, operationId, executable, helper = Path.Combine(stage, "AppDock.Updater.exe"), swaps });
            foreach (var swap in swaps)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(swap.Next)!); NoLinks(swap.Next);
                if (Operation(swap.Item) == "uninstall") continue;
                if (FileItem(swap.Item.Kind)) File.Copy(swap.Item.Source, swap.Next);
                else CopyDirectory(swap.Item.Source, swap.Next);
                Verify(swap.Item with { Source = swap.Next });
            }
            foreach (var swap in swaps)
            {
                if (Operation(swap.Item) != "install") Move(swap.Item.Destination, swap.Backup, swap.Item.Kind);
                if (Operation(swap.Item) != "uninstall") Move(swap.Next, swap.Item.Destination, swap.Item.Kind);
            }
            Write(journal, new { schemaVersion = 2, operationId, executable, helper = Path.Combine(stage, "AppDock.Updater.exe"), swaps, committed = true });
            committed = true;
            Write(result, new { ok = true, operationId, time = DateTimeOffset.Now, message = NativeMessages.Text("native.package.applied"), temporaryDirectory = stage,
                updated = swaps.Where(s => s.Item.Kind is "host" or "applet").Select(s => new { s.Item.Id, s.Item.Version, operation = Operation(s.Item) }) });
            FinishPackageSwaps(baseDirectory, operationId, swaps, true); File.Delete(journal);
        }
        catch (Exception error)
        {
            progress?.Phase("restoring");
            try
            {
                if (!committed && File.Exists(journal)) { FinishPackageSwaps(baseDirectory, operationId, swaps, false); File.Delete(journal); }
                else if (committed) recovered = false;
            }
            catch { recovered = false; }
            if (!committed) Write(result, new { ok = false, restored = recovered, operationId, time = DateTimeOffset.Now,
                message = error.Message, temporaryDirectory = recovered ? stage : null });
        }
        finally { foreach (var process in processes) process.Dispose(); }
        if (exited && recovered) Restart(executable, arguments, progress);
        else progress?.Outcome("updateFailed");
    }
}
