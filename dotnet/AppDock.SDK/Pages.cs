using System.Text.Json;
using System.Text.Json.Serialization;

namespace AppDock.SDK;

public interface IPageService
{
    Task OpenAsync(string id, CancellationToken cancellationToken = default);
    Task<PageListResult> ListAsync(CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Extended pages require AppDock 0.66.1 or later.");
    Task<PageRevisionResult> ReplaceAsync(IReadOnlyList<RuntimePageDefinition> pages, long expectedRevision, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Extended pages require AppDock 0.66.1 or later.");
    Task HideAsync(string id, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Extended pages require AppDock 0.66.1 or later.");
    Task DisposeAsync(string id, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Extended pages require AppDock 0.66.1 or later.");
    Task OpenItemAsync(string id, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Extended pages require AppDock 0.66.1 or later.");
    Task<PageChangeResult> NotifyChangedAsync(string id, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Page notifications require AppDock 0.66.1 or later.");
    Task<PageImagesResult> RegisterImagesAsync(string id, IReadOnlyList<PageImageFile> files, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Page images require AppDock 0.66.1 or later.");
    Task ReleaseImagesAsync(string id, IReadOnlyList<string> imageIds, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Page images require AppDock 0.66.1 or later.");
}

public interface IPageActionHandler
{
    Task<JsonElement?> HandlePageActionAsync(string actionId, JsonElement input, string pageId, CancellationToken cancellationToken);
}
public interface IPageFileHandler
{
    Task HandlePageFileRemovedAsync(string pageId, string file, CancellationToken cancellationToken);
}

public sealed record RuntimePageDefinition(string Id, string Title, string Ui)
{
    public string Source => "local";
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Icon { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? DefaultDisplay { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public JsonElement? Context { get; init; }
}
public sealed record AppletPageDefinition(string Id, string Title, string Source, string OpenCommand)
{
    public string? Ui { get; init; }
    public string? Icon { get; init; }
    public string? DefaultDisplay { get; init; }
    public JsonElement? Context { get; init; }
}
public sealed record PageListResult(long Revision, IReadOnlyList<AppletPageDefinition> Pages);
public sealed record PageRevisionResult(long Revision);
public sealed record PageChangeResult(bool Accepted, bool Delivered);
public sealed record PageImageFile(string Key, string File);
public sealed record PageImageReference(string Key, string Id, string Url);
public sealed record PageImagesResult(IReadOnlyList<PageImageReference> Images);
