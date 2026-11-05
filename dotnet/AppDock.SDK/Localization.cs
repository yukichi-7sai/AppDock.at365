namespace AppDock.SDK;

public sealed record AppletLocalizationSnapshot(string Language, string DefaultLanguage, IReadOnlyDictionary<string, string> Messages);

public interface ILocalizationService
{
    string Language { get; }
    AppletLocalizationSnapshot Snapshot();
    string Text(string key, IReadOnlyDictionary<string, object?>? values = null);
    IDisposable OnChanged(Func<CancellationToken, Task> handler);
}
