using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;

internal static partial class Program
{
    private static string Operation(Item item) => item.Operation ?? throw new IOException("操作種別がありません。");
    private static void VerifyPrevious(Item item, string location)
    {
        NoLinks(location);
        if (!Exists(location, item.Kind) || !Regex.IsMatch(item.PreviousSha256 ?? "", "^[a-f0-9]{64}$", RegexOptions.IgnoreCase) ||
            !string.Equals(item.Kind == "host" ? Hash(location) : TreeHash(location), item.PreviousSha256, StringComparison.OrdinalIgnoreCase))
            throw new IOException("変更前の配置が計画と一致しません。");
        if (item.Kind == "applet")
        {
            using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(location, "extension.json")));
            if (manifest.RootElement.GetProperty("id").GetString() != item.Id) throw new IOException("配置先AppletのIDが一致しません。");
        }
    }
    private static string TransactionRoot(string baseDirectory, string operationId)
    {
        if (!Guid.TryParse(operationId, out var id)) throw new IOException("トランザクションIDが不正です。");
        return Path.Combine(baseDirectory, "extensions", ".transactions", id.ToString("N"));
    }
    private static void ValidatePackageSwaps(string baseDirectory, string executable, string operationId, List<Swap> swaps)
    {
        if (!Same(executable, Path.Combine(baseDirectory, "AppDock.at365.exe")) || swaps.Count is 0 or > 501)
            throw new IOException("パッケージ処理の本体・対象数が正しくありません。");
        NoLinks(baseDirectory); NoLinks(executable);
        var transactionRoot = TransactionRoot(baseDirectory, operationId); NoLinks(transactionRoot);
        var destinations = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < swaps.Count; index++)
        {
            var swap = swaps[index]; var item = swap.Item; var operation = Operation(item);
            var directory = Path.Combine(transactionRoot, index.ToString(System.Globalization.CultureInfo.InvariantCulture));
            if (operation is not ("install" or "update" or "uninstall") || !destinations.Add(Full(item.Destination)) ||
                !Same(swap.Next, Path.Combine(directory, "next")) || !Same(swap.Backup, Path.Combine(directory, "previous")))
                throw new IOException("パッケージ操作・復旧先の範囲が正しくありません。");
            if (item.Kind == "host")
            {
                if (operation != "update" || item.Id != "host" || !Same(item.Destination, executable)) throw new IOException("本体の操作が不正です。");
            }
            else if (item.Kind != "applet" || item.Id == "appdock.default-shell" ||
                !Regex.IsMatch(item.Id, "^[a-z0-9][a-z0-9.-]{0,100}$") ||
                !Same(Path.GetDirectoryName(item.Destination)!, Path.Combine(baseDirectory, "extensions")))
                throw new IOException("Appletの配置先が正しくありません。");
            else SafeName(Path.GetFileName(item.Destination));
            if (item.Kind == "applet" ? File.Exists(item.Destination) || File.Exists(swap.Next) || File.Exists(swap.Backup)
                : Directory.Exists(item.Destination) || Directory.Exists(swap.Next) || Directory.Exists(swap.Backup))
                throw new IOException("配置・復旧先のファイル形式が不正です。");
            if (operation == "install" && (item.PreviousSha256 is not null || !Same(item.Destination, Path.Combine(baseDirectory, "extensions", item.Id))))
                throw new IOException("新規導入の配置条件が正しくありません。");
            if (operation == "uninstall" && (!string.IsNullOrEmpty(item.Source) || item.Sha256 is not null))
                throw new IOException("削除に配布物は指定できません。");
            if (operation != "install" && !Regex.IsMatch(item.PreviousSha256 ?? "", "^[a-f0-9]{64}$", RegexOptions.IgnoreCase))
                throw new IOException("変更前のハッシュがありません。");
            if (operation != "uninstall" && (string.IsNullOrEmpty(item.Source) || !Regex.IsMatch(item.Sha256 ?? "", "^[a-f0-9]{64}$", RegexOptions.IgnoreCase)))
                throw new IOException("新しい配布物がありません。");
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
                if (operation == "uninstall") throw new IOException("削除計画に不明な配布物があります。");
                if (committed) Verify(item with { Source = swap.Next });
                else if (item.Kind == "applet") _ = TreeHash(swap.Next);
                else NoLinks(swap.Next);
            }
            if (committed)
            {
                if (operation == "uninstall") { if (destination) throw new IOException("削除先に別の配置があります。"); }
                else Verify(item with { Source = item.Destination });
            }
            else if (operation == "install")
            {
                if (backup) throw new IOException("新規導入に旧配置があります。");
                if (destination) Verify(item with { Source = item.Destination });
            }
            else if (backup)
            {
                if (destination)
                {
                    if (operation == "uninstall") throw new IOException("削除先に別の配置があります。");
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
        var swaps = JsonSerializer.Deserialize<List<Swap>>(root.GetProperty("swaps"), JsonOptions) ?? throw new IOException("復旧対象がありません。");
        var committed = root.TryGetProperty("committed", out var flag) && flag.GetBoolean();
        ValidatePackageSwaps(baseDirectory, executable, operationId, swaps);
        FinishPackageSwaps(baseDirectory, operationId, swaps, committed);
        Write(Path.Combine(stateDirectory, "update-result.json"), new { ok = committed, restored = !committed, operationId,
            message = committed ? "Applet・更新の適用後の後片付けを完了しました。" : "中断されたApplet・更新操作を元の配置へ戻しました。", time = DateTimeOffset.Now });
        File.Delete(Path.Combine(stateDirectory, "update-transaction.json"));
    }
    private static void ApplyPackageJob(JsonElement root, string stage, string jobPath)
    {
        var baseDirectory = Full(root.GetProperty("baseDirectory").GetString()!);
        var executable = Full(root.GetProperty("executable").GetString()!);
        var stateDirectory = StateDirectory(baseDirectory, root.TryGetProperty("stateDirectory", out var state) ? state.GetString() : null);
        var result = Full(root.GetProperty("result").GetString()!);
        if (!Same(result, Path.Combine(stateDirectory, "update-result.json"))) throw new IOException("結果の保存先が不正です。");
        var operationId = root.GetProperty("operationId").GetString()!;
        var transactionRoot = TransactionRoot(baseDirectory, operationId);
        var swaps = root.GetProperty("items").EnumerateArray().Select((value, index) => {
            var item = JsonSerializer.Deserialize<Item>(value, JsonOptions) ?? throw new IOException("対象が不正です。");
            var directory = Path.Combine(transactionRoot, index.ToString(System.Globalization.CultureInfo.InvariantCulture));
            return new Swap(item, Path.Combine(directory, "next"), Path.Combine(directory, "previous"));
        }).ToList();
        ValidatePackageSwaps(baseDirectory, executable, operationId, swaps);
        var journal = Path.Combine(stateDirectory, "update-transaction.json"); NoLinks(journal); NoLinks(result);
        if (File.Exists(journal) || Directory.Exists(transactionRoot)) throw new IOException("前回のパッケージ処理の復旧が必要です。");
        foreach (var swap in swaps)
        {
            var item = swap.Item;
            if (Operation(item) == "install")
            {
                if (File.Exists(item.Destination) || Directory.Exists(item.Destination)) throw new IOException("新規導入先が既に存在します。");
            }
            else VerifyPrevious(item, item.Destination);
            if (Operation(item) != "uninstall")
            {
                if (!Within(stage, item.Source)) throw new IOException("配布物は専用TEMP内に必要です。");
                Verify(item);
            }
        }
        var arguments = root.GetProperty("args").EnumerateArray().Select(v => v.GetString()!).ToArray();
        var processes = new List<Process>();
        bool exited = false, committed = false, recovered = true;
        try
        {
            foreach (var id in root.GetProperty("processIds").EnumerateArray().Select(v => v.GetInt32()).Distinct())
            {
                if (id <= 0 || id == Environment.ProcessId) throw new IOException("待機プロセスが不正です。");
                try { var process = Process.GetProcessById(id); try { _ = process.Handle; processes.Add(process); } catch (InvalidOperationException) { process.Dispose(); } }
                catch (ArgumentException) { }
            }
            File.WriteAllText(jobPath + ".ready", "ready");
            var deadline = Stopwatch.StartNew();
            while (!File.Exists(jobPath + ".commit")) { if (deadline.ElapsedMilliseconds > 30000) throw new IOException("処理が取り消されました。"); Thread.Sleep(100); }
            foreach (var process in processes) if (!process.WaitForExit(Math.Max(1, 60000 - (int)deadline.ElapsedMilliseconds))) throw new IOException("AppDockとAppletの終了を確認できませんでした。");
            exited = true;
            // Revalidate after all writers stopped, before creating the journal or moving a file.
            foreach (var swap in swaps)
            {
                if (Operation(swap.Item) == "install") { if (File.Exists(swap.Item.Destination) || Directory.Exists(swap.Item.Destination)) throw new IOException("導入先が変更されました。"); }
                else VerifyPrevious(swap.Item, swap.Item.Destination);
                if (Operation(swap.Item) != "uninstall") Verify(swap.Item);
            }
            Write(journal, new { schemaVersion = 2, operationId, executable, helper = Path.Combine(stage, "AppDock.Updater.exe"), swaps });
            foreach (var swap in swaps)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(swap.Next)!); NoLinks(swap.Next);
                if (Operation(swap.Item) == "uninstall") continue;
                if (swap.Item.Kind == "host") File.Copy(swap.Item.Source, swap.Next);
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
            Write(result, new { ok = true, operationId, time = DateTimeOffset.Now, message = "Applet・更新の操作を適用しました。", temporaryDirectory = stage,
                updated = swaps.Select(s => new { s.Item.Id, s.Item.Version, operation = Operation(s.Item) }) });
            FinishPackageSwaps(baseDirectory, operationId, swaps, true); File.Delete(journal);
        }
        catch (Exception error)
        {
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
        if (exited && recovered) Restart(executable, arguments);
    }
}
