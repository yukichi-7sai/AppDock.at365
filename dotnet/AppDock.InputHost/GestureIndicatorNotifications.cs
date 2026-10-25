namespace AppDock.InputHost;

internal sealed class GestureIndicatorNotifications(Action<object> changed)
{
    private int revision;
    internal bool IsVisible { get; private set; }
    internal void Configure(int nextRevision) => revision = nextRevision;
    internal void Hide()
    {
        if (!IsVisible) return;
        IsVisible = false;
        changed(new { visible = false, revision });
    }
    internal void Display(GesturePoint origin, string process, GestureDirection[] directions, string[] captions,
        double opacity, string style, int captionRows = 0)
    {
        IsVisible = true;
        changed(new { visible = true, revision, x = origin.X, y = origin.Y, process,
            directions = directions.Select(direction => direction.ToString().ToLowerInvariant()).ToArray(),
            captions, opacity, style, captionRows });
    }
    internal void Close() => Hide();
}
