using System.Collections.Concurrent;
using System.Text.Json;
using AppDock.SDK;

namespace AppDock.Runtime;

internal sealed class ExtensionContext(string id, JsonElement settings, JsonRpcConnection connection, CancellationToken lifetime) :
    IExtensionContext, ICommandService, ICustomCommandService, ITrayService, IRibbonService, ISettingsService, INotificationService,
    IAppDockService, IShellService, IUiService, IPageService, IRegisteredImageService, IBrowserService, ILogService, IStorageService, ISecretService, ISchedulerService, IAsyncDisposable
{
    private ConcurrentDictionary<string, (string Title, Func<CancellationToken, Task> Handler, string? Description)> commands = new();
    private readonly SemaphoreSlim commandUpdates = new(1, 1);
    private readonly ConcurrentDictionary<string, Func<JsonElement, CancellationToken, Task<JsonElement?>>> customHandlers = new();
    public ICustomCommandService CustomCommands => this;
    public async Task RegisterAsync(string typeId, Func<JsonElement, CancellationToken, Task<JsonElement?>> handler, CancellationToken cancellationToken = default)
    {
        if (!customHandlers.TryAdd(typeId, handler)) throw new ArgumentException("Duplicate custom command type.");
        try { await CallAsync("host.customCommands.register", new { typeId }, cancellationToken); }
        catch { customHandlers.TryRemove(typeId, out _); throw; }
    }
    internal async Task<JsonElement?> ExecuteCustomAsync(string typeId, JsonElement config, CancellationToken token)
    {
        if (!customHandlers.TryGetValue(typeId, out var handler)) throw new ArgumentException("Unknown custom command type.");
        await commandLock.WaitAsync(token);
        try { return await handler(config.Clone(), token); }
        finally { commandLock.Release(); }
    }
    private readonly List<object> tray = [];
    private readonly List<ScheduledTask> schedules = [];
    private readonly SemaphoreSlim commandLock = new(1, 1);
    private readonly ConcurrentDictionary<Guid, Func<CancellationToken, Task>> settingsHandlers = new();
    private readonly ConcurrentDictionary<Guid, Func<CancellationToken, Task>> notificationHandlers = new();
    private readonly ConcurrentDictionary<Guid, Func<OwnShellState, CancellationToken, Task>> shellHandlers = new();
    private readonly SemaphoreSlim shellChanges = new(1, 1);
    private long shellRevision = -1;
    private JsonElement configuration = settings;
    private readonly object sync = new();
    public string ExtensionId => id;
    internal static readonly AsyncLocal<string?> ExecutionId = new();
    public IAppDockService AppDock => this;
    async Task<JsonElement> IAppDockService.CallAsync(string method, object? parameters, CancellationToken cancellationToken)
    {
        var reply = await connection.RequestAsync("host.appdock.call", new { method, @params = parameters ?? new { }, executionId = ExecutionId.Value }, cancellationToken);
        if (!reply.GetProperty("ok").GetBoolean()) {
            var error = reply.GetProperty("error");
            throw new AppDockApiException(error.GetProperty("code").GetString()!, error.GetProperty("message").GetString()!);
        }
        return reply.GetProperty("value").Clone();
    }
    public IShellService Shell => this;
    public async Task<OwnShellState> GetStateAsync(CancellationToken cancellationToken = default)
    {
        var state = (await connection.RequestAsync("host.shell.getState", new { }, cancellationToken)).Deserialize<OwnShellState>(JsonRpcConnection.Json)!;
        lock (sync) { shellRevision = Math.Max(shellRevision, state.Revision); }
        return state;
    }
    IDisposable IShellService.OnChanged(Func<OwnShellState, CancellationToken, Task> handler)
    {
        var key = Guid.NewGuid(); shellHandlers[key] = handler;
        return new Registration(() => shellHandlers.TryRemove(key, out _));
    }
    internal async Task ChangeShellAsync(JsonElement value)
    {
        await shellChanges.WaitAsync(lifetime);
        try {
            var state = value.Deserialize<OwnShellState>(JsonRpcConnection.Json)!;
            lock (sync) { if (state.Revision <= shellRevision) return; shellRevision = state.Revision; }
            foreach (var handler in shellHandlers.Values) await handler(state, lifetime);
        }
        finally { shellChanges.Release(); }
    }
    public ICommandService Commands => this;
    public ITrayService Tray => this;
    public IRibbonService Ribbon => this;
    public Task SetBadgeAsync(RibbonBadgeTarget target, RibbonBadge? badge, CancellationToken cancellationToken = default)
        => CallAsync("host.ribbon.setBadge", new { target, badge }, cancellationToken);
    public ISettingsService Settings => this;
    public INotificationService Notifications => this;
    public IUiService Ui => this;
    public IPageService Pages => this;
    public IRegisteredImageService RegisteredImages => this;
    public Task<RegisteredImageRef> ImportAsync(byte[] bytes, string? filename = null, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(bytes);
        if (bytes.Length > 512 * 1024) throw new ArgumentException("Registered image import is limited to 512 KiB.");
        return RequestAsync<RegisteredImageRef>("host.registeredImages.import", new { filename, base64 = Convert.ToBase64String(bytes) }, cancellationToken);
    }
    public Task<string> CopyToCacheAsync(RegisteredImageRef image, bool thumbnail = false, CancellationToken cancellationToken = default)
        => RequestAsync<string>("host.registeredImages.copyToCache", new { image, variant = thumbnail ? "thumbnail" : "original" }, cancellationToken);
    public IBrowserService Browser => this;
    public ILogService Log => this;
    public IStorageService Storage => this;
    public ISecretService Secrets => this;
    public ISchedulerService Scheduler => this;
    private static object CommandContribution(string commandId, string title, string? description) => description is null
        ? new { id = commandId, title }
        : (object)new { id = commandId, title, description };
    public object Contributions => new { commands = commands.Select(c => CommandContribution(c.Key, c.Value.Title, c.Value.Description)).ToArray(), tray };
    public void Register(string commandId, string title, Func<CancellationToken, Task> handler)
    {
        if (!commandId.StartsWith(id + ".", StringComparison.Ordinal)) throw new ArgumentException("Command ID must start with the extension ID.");
        if (!commands.TryAdd(commandId, (title, handler, null))) throw new ArgumentException("Duplicate command ID.");
    }
    public void Add(string title, string command) => tray.Add(new { title, command });
    public async Task ReplaceAsync(IReadOnlyList<CommandRegistration> registrations, CancellationToken cancellationToken = default)
    {
        if (registrations.Count > 256) throw new ArgumentException("At most 256 commands are allowed.");
        var next = new ConcurrentDictionary<string, (string Title, Func<CancellationToken, Task> Handler, string? Description)>();
        foreach (var command in registrations)
        {
            if (!command.Id.StartsWith(id + ".", StringComparison.Ordinal) || command.Id.Length > 200
                || string.IsNullOrWhiteSpace(command.Title) || command.Title.Length > 200 || command.Handler is null
                || (command.Description?.Length ?? 0) > 1000
                || !next.TryAdd(command.Id, (command.Title, command.Handler, command.Description)))
                throw new ArgumentException("Invalid or duplicate command registration.");
        }
        await commandUpdates.WaitAsync(cancellationToken);
        var previous = commands;
        try
        {
            commands = next;
            await CallAsync("host.commands.replace", new { commands = next.Select(c => CommandContribution(c.Key, c.Value.Title, c.Value.Description)).ToArray() }, cancellationToken);
        }
        catch { commands = previous; throw; }
        finally { commandUpdates.Release(); }
    }
    public async Task ChangeSettingsAsync(JsonElement value)
    {
        await commandLock.WaitAsync(lifetime);
        try
        {
            bool changed;
            lock (sync) { changed = configuration.GetRawText() != value.GetRawText(); configuration = value.Clone(); }
            if (changed) foreach (var handler in settingsHandlers.Values) await handler(lifetime);
        }
        finally { commandLock.Release(); }
    }
    public IDisposable OnChanged(Func<CancellationToken, Task> handler)
    {
        var key = Guid.NewGuid();
        settingsHandlers[key] = handler;
        return new Registration(() => settingsHandlers.TryRemove(key, out _));
    }
    public Task SetOptionsAsync(string key, IReadOnlyList<SettingOption> options, CancellationToken cancellationToken = default)
        => CallAsync("host.settings.options", new { key, options }, cancellationToken);
    public T Get<T>(string key, T fallback)
    {
        lock (sync)
        {
            if (!configuration.TryGetProperty(key, out var value)) return fallback;
            try { return value.Deserialize<T>(JsonRpcConnection.Json) ?? fallback; }
            catch (JsonException) { return fallback; }
        }
    }
    public async Task SetAsync<T>(string key, T value, CancellationToken cancellationToken = default)
    {
        await CallAsync("host.settings.set", new { key, value }, cancellationToken);
        lock (sync)
        {
            var next = configuration.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());
            next[key] = JsonSerializer.SerializeToElement(value, JsonRpcConnection.Json);
            configuration = JsonSerializer.SerializeToElement(next, JsonRpcConnection.Json);
        }
    }
    public async Task<NotificationPublishResult> PublishAsync(NotificationRequest request, CancellationToken cancellationToken = default) =>
        (await connection.RequestAsync("host.notifications.publish", request, cancellationToken)).Deserialize<NotificationPublishResult>(JsonRpcConnection.Json)!;
    public async Task<NotificationPolicy> GetPolicyAsync(string typeId, CancellationToken cancellationToken = default) =>
        (await connection.RequestAsync("host.notifications.policy", new { typeId }, cancellationToken)).Deserialize<NotificationPolicy>(JsonRpcConnection.Json)!;
    public Task EndAsync(string notificationId, string status = "resolved", CancellationToken cancellationToken = default)
        => CallAsync("host.notifications.end", new { notificationId, status }, cancellationToken);
    public IDisposable OnPolicyChanged(Func<CancellationToken, Task> handler)
    {
        var key = Guid.NewGuid(); notificationHandlers[key] = handler;
        return new Registration(() => notificationHandlers.TryRemove(key, out _));
    }
    internal async Task ChangeNotificationPolicyAsync()
    {
        foreach (var handler in notificationHandlers.Values) await handler(lifetime);
    }
    public Task ShowAsync(string title, string body, CancellationToken cancellationToken = default) => CallAsync("host.notifications.show", new { title, body }, cancellationToken);
    Task IPageService.OpenAsync(string id, CancellationToken cancellationToken) => CallAsync("host.pages.open", new { id }, cancellationToken);
    public Task<PageListResult> ListAsync(CancellationToken cancellationToken = default)
        => RequestAsync<PageListResult>("host.pages.list", new { }, cancellationToken);
    public Task<PageRevisionResult> ReplaceAsync(IReadOnlyList<RuntimePageDefinition> pages, long expectedRevision, CancellationToken cancellationToken = default)
        => RequestAsync<PageRevisionResult>("host.pages.replace", new { pages, expectedRevision }, cancellationToken);
    public Task HideAsync(string id, CancellationToken cancellationToken = default) => CallAsync("host.pages.hide", new { id }, cancellationToken);
    Task IPageService.DisposeAsync(string id, CancellationToken cancellationToken) => CallAsync("host.pages.dispose", new { id }, cancellationToken);
    public Task OpenItemAsync(string id, CancellationToken cancellationToken = default) => CallAsync("host.pages.openItem", new { id }, cancellationToken);
    public Task<PageChangeResult> NotifyChangedAsync(string id, CancellationToken cancellationToken = default)
        => RequestAsync<PageChangeResult>("host.pages.changed", new { id }, cancellationToken);
    public Task<PageImagesResult> RegisterImagesAsync(string id, IReadOnlyList<PageImageFile> files, CancellationToken cancellationToken = default)
        => RequestAsync<PageImagesResult>("host.pages.images.register", new { id, files }, cancellationToken);
    public Task ReleaseImagesAsync(string id, IReadOnlyList<string> imageIds, CancellationToken cancellationToken = default)
        => CallAsync("host.pages.images.release", new { id, imageIds }, cancellationToken);
    public Task OpenDetailsAsync(CancellationToken cancellationToken = default) => CallAsync("host.ui.openDetails", new { }, cancellationToken);
    private async Task<T> RequestAsync<T>(string method, object parameters, CancellationToken token)
        => (await connection.RequestAsync(method, parameters, token)).Deserialize<T>(JsonRpcConnection.Json)!;
    public Task ShowPanelAsync(Panel panel, CancellationToken cancellationToken = default) => CallAsync("host.ui.panel", panel, cancellationToken);
    public async Task<string> GetImageDirectoryAsync(CancellationToken cancellationToken = default) =>
        (await connection.RequestAsync("host.ui.imageDirectory", new { }, cancellationToken)).GetString()!;
    public Task OpenAsync(string url, CancellationToken cancellationToken = default) => CallAsync("host.browser.open", new { url }, cancellationToken);
    public Task DebugAsync(string message, CancellationToken cancellationToken = default) => CallAsync("host.log", new { level = "debug", message }, cancellationToken);
    public Task InfoAsync(string message, CancellationToken cancellationToken = default) => CallAsync("host.log", new { level = "info", message }, cancellationToken);
    public Task ErrorAsync(string message, CancellationToken cancellationToken = default) => CallAsync("host.log", new { level = "error", message }, cancellationToken);
    public async Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default)
    {
        var result = await connection.RequestAsync("host.storage.get", new { key }, cancellationToken);
        return result.ValueKind == JsonValueKind.Null ? default : result.Deserialize<T>(JsonRpcConnection.Json);
    }
    Task IStorageService.SetAsync<T>(string key, T value, CancellationToken cancellationToken) => CallAsync("host.storage.set", new { key, value }, cancellationToken);
    private static string StorageScopeName(StorageScope scope) => scope switch
    {
        StorageScope.Device => "device",
        StorageScope.Shared => "shared",
        StorageScope.Memory => "memory",
        _ => throw new ArgumentOutOfRangeException(nameof(scope))
    };
    public async Task<T?> GetAsync<T>(string key, StorageScope scope, CancellationToken cancellationToken)
    {
        var result = await connection.RequestAsync("host.storage.get", new { key, scope = StorageScopeName(scope) }, cancellationToken);
        return result.ValueKind == JsonValueKind.Null ? default : result.Deserialize<T>(JsonRpcConnection.Json);
    }
    Task IStorageService.SetAsync<T>(string key, T value, StorageScope scope, CancellationToken cancellationToken) => CallAsync("host.storage.set", new { key, value, scope = StorageScopeName(scope) }, cancellationToken);
    async Task<string?> ISecretService.GetAsync(string key, CancellationToken cancellationToken)
    {
        var result = await connection.RequestAsync("host.secrets.get", new { key }, cancellationToken);
        return result.ValueKind == JsonValueKind.Null ? null : result.GetString();
    }
    Task ISecretService.SetAsync(string key, string value, CancellationToken cancellationToken) => CallAsync("host.secrets.set", new { key, value }, cancellationToken);
    public Task DeleteAsync(string key, CancellationToken cancellationToken = default) => CallAsync("host.secrets.delete", new { key }, cancellationToken);
    private async Task CallAsync(string method, object value, CancellationToken token) => _ = await connection.RequestAsync(method, value, token);
    public async Task ExecuteAsync(string commandId, CancellationToken token)
    {
        await commandLock.WaitAsync(token);
        try
        {
            if (!commands.TryGetValue(commandId, out var command)) throw new ArgumentException("Unknown command.");
            token.ThrowIfCancellationRequested();
            await command.Handler(token);
        }
        finally { commandLock.Release(); }
    }
    internal async Task<JsonElement?> ExecutePageActionAsync(IPageActionHandler handler, string actionId, JsonElement input, string pageId, CancellationToken token)
    {
        await commandLock.WaitAsync(token);
        try {
            token.ThrowIfCancellationRequested();
            var result = await handler.HandlePageActionAsync(actionId, input.Clone(), pageId, token);
            token.ThrowIfCancellationRequested();
            if (JsonSerializer.SerializeToUtf8Bytes(result, JsonRpcConnection.Json).Length > 512 * 1024)
                throw new InvalidDataException("ページの応答が大きすぎます。データを分割してください。");
            return result;
        }
        finally { commandLock.Release(); }
    }
    internal async Task ExecutePageFileRemovedAsync(IPageFileHandler handler, string pageId, string file, CancellationToken token)
    {
        await commandLock.WaitAsync(token);
        try { token.ThrowIfCancellationRequested(); await handler.HandlePageFileRemovedAsync(pageId, file, token); }
        finally { commandLock.Release(); }
    }
    public IDisposable Every(TimeSpan interval, Func<CancellationToken, Task> callback)
    {
        if (interval < TimeSpan.FromSeconds(1)) throw new ArgumentOutOfRangeException(nameof(interval));
        var scheduled = new ScheduledTask(interval, callback, lifetime, e => ErrorAsync(e.Message));
        lock (sync) schedules.Add(scheduled);
        return scheduled;
    }
    public async ValueTask DisposeAsync()
    {
        settingsHandlers.Clear();
        notificationHandlers.Clear();
        shellHandlers.Clear();
        ScheduledTask[] current; lock (sync) current = schedules.ToArray();
        foreach (var scheduled in current) scheduled.Dispose();
        await Task.WhenAll(current.Select(s => s.Completion));
    }
    private sealed class Registration(Action remove) : IDisposable
    {
        public void Dispose() => remove();
    }
    private sealed class ScheduledTask : IDisposable
    {
        private readonly CancellationTokenSource cancellation;
        public Task Completion { get; }
        public ScheduledTask(TimeSpan interval, Func<CancellationToken, Task> callback, CancellationToken lifetime, Func<Exception, Task> report)
        {
            cancellation = CancellationTokenSource.CreateLinkedTokenSource(lifetime);
            Completion = Task.Run(async () =>
            {
                using var timer = new PeriodicTimer(interval);
                try
                {
                    while (await timer.WaitForNextTickAsync(cancellation.Token))
                        try { await callback(cancellation.Token); }
                        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { break; }
                        catch (Exception e) { try { await report(e); } catch { Console.Error.WriteLine(e.Message); } }
                }
                catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
            });
        }
        public void Dispose() { cancellation.Cancel(); }
    }
}
