namespace AppDock.SDK;

public interface IAppDockExtension
{
    Task ActivateAsync(IExtensionContext context, CancellationToken cancellationToken);
    Task DeactivateAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
public interface IPanelActionHandler
{
    Task HandlePanelActionAsync(string actionId, CancellationToken cancellationToken);
}
public interface IExtensionContext
{
    string ExtensionId { get; }
    IShellService Shell => throw new NotSupportedException("Shell state requires AppDock 0.34.0 or later.");
    IAppDockService AppDock => throw new NotSupportedException("AppDock operations require AppDock 0.26.36 or later.");
    ICommandService Commands { get; }
    ICustomCommandService CustomCommands => throw new NotSupportedException("Custom commands require AppDock 0.60.0 or later.");
    ITrayService Tray { get; }
    IRibbonService Ribbon => throw new NotSupportedException("Ribbon badges require AppDock 0.51.0 or later.");
    ISettingsService Settings { get; }
    IRegisteredImageService RegisteredImages => throw new NotSupportedException("Registered images require AppDock 0.69.0 or later.");
    INotificationService Notifications { get; }
    IUiService Ui { get; }
    IPageService Pages => throw new NotSupportedException("Applet pages require AppDock 0.18.0 or later.");
    IBrowserService Browser { get; }
    ILogService Log { get; }
    IStorageService Storage { get; }
    ISecretService Secrets { get; }
    ISchedulerService Scheduler { get; }
}
public interface ICommandService
{
    void Register(string id, string title, Func<CancellationToken, Task> handler);
    Task ReplaceAsync(IReadOnlyList<CommandRegistration> commands, CancellationToken cancellationToken = default);
}
public sealed record CommandRegistration(string Id, string Title, Func<CancellationToken, Task> Handler)
{
    public string? Description { get; init; }
}
public interface ICustomCommandService
{
    Task RegisterAsync(string typeId, Func<System.Text.Json.JsonElement, CancellationToken, Task<System.Text.Json.JsonElement?>> handler, CancellationToken cancellationToken = default);
}
public interface ITrayService { void Add(string title, string command); }
public interface ISettingsService
{
    T Get<T>(string key, T fallback);
    Task SetAsync<T>(string key, T value, CancellationToken cancellationToken = default);
    IDisposable OnChanged(Func<CancellationToken, Task> handler);
    Task SetOptionsAsync(string key, IReadOnlyList<SettingOption> options, CancellationToken cancellationToken = default);
}
public interface INotificationService {
    Task ShowAsync(string title, string body, CancellationToken cancellationToken = default);
    Task<NotificationPublishResult> PublishAsync(NotificationRequest request, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Typed notifications require AppDock 0.30.0 or later.");
    Task<NotificationPolicy> GetPolicyAsync(string typeId, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Typed notifications require AppDock 0.30.0 or later.");
    Task EndAsync(string notificationId, string status = "resolved", CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Typed notifications require AppDock 0.30.0 or later.");
    IDisposable OnPolicyChanged(Func<CancellationToken, Task> handler)
        => throw new NotSupportedException("Typed notifications require AppDock 0.30.0 or later.");
}
public sealed record NotificationHistoryText(string Title, string Body);
public sealed record NotificationAction(string Key, string Label, string Command, bool Primary = false, bool Disabled = false);
public sealed record NotificationRequest(string TypeId, string Title, string Body, string? Level = null, string? DedupeKey = null,
    NotificationHistoryText? HistoryText = null, IReadOnlyList<NotificationAction>? Actions = null, bool RestartTimer = false)
{
    public bool Silent { get; init; }
}
public sealed record NotificationPublishResult(string Status, string? NotificationId, string? Reason);
public sealed record NotificationLifetime(string Type, int? Milliseconds);
public sealed record NotificationPolicy(bool Enabled, IReadOnlyList<string> SelectedTargets, IReadOnlyList<string> Targets,
    NotificationLifetime Lifetime, bool Dismissible, int? DurationSeconds, string? Reason);
public interface IUiService {
    Task ShowPanelAsync(Panel panel, CancellationToken cancellationToken = default);
    Task<string> GetImageDirectoryAsync(CancellationToken cancellationToken = default);
    Task OpenDetailsAsync(CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Opening Applet details requires AppDock 0.66.1 or later.");
}
public interface IBrowserService { Task OpenAsync(string url, CancellationToken cancellationToken = default); }
public interface ILogService
{
    Task DebugAsync(string message, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Debug logging requires AppDock 0.109.2 or later.");
    Task InfoAsync(string message, CancellationToken cancellationToken = default);
    Task ErrorAsync(string message, CancellationToken cancellationToken = default);
}
public interface IStorageService
{
    Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default);
    Task SetAsync<T>(string key, T value, CancellationToken cancellationToken = default);
}
public interface ISecretService
{
    Task<string?> GetAsync(string key, CancellationToken cancellationToken = default);
    Task SetAsync(string key, string value, CancellationToken cancellationToken = default);
    Task DeleteAsync(string key, CancellationToken cancellationToken = default);
}
public interface ISchedulerService
{
    // The next tick is skipped until the previous callback completes.
    IDisposable Every(TimeSpan interval, Func<CancellationToken, Task> callback);
}
public sealed record Panel(string Title, string? Description = null, IReadOnlyList<PanelFact>? Facts = null, IReadOnlyList<PanelAction>? Actions = null)
{
    public IReadOnlyList<PanelImage>? Images { get; init; }
    public IReadOnlyList<PanelAction>? Tabs { get; init; }
}
public sealed record PanelImage(string Title, string? Description = null, string? Image = null, IReadOnlyList<PanelAction>? Actions = null)
{
    public string? Tooltip { get; init; }
    public string? ImageFile { get; init; }
}
public sealed record PanelFact(string Label, string Value);
public sealed record PanelAction(string Title, string Command)
{
    public string? ActionId { get; init; }
    public bool? Selected { get; init; }
}
public sealed record SettingOption(string Label, string Value);

public interface IShellService
{
    Task<OwnShellState> GetStateAsync(CancellationToken cancellationToken = default);
    IDisposable OnChanged(Func<OwnShellState, CancellationToken, Task> handler);
}
public sealed record OwnShellRegionState(string Region, bool Configured, bool Resolved, bool Bound, bool Ready, bool Visible, string? Reason);
public sealed record OwnShellState(string ContextId, long Revision, IReadOnlyList<OwnShellRegionState> Regions);
