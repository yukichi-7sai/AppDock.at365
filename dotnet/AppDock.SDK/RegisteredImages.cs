namespace AppDock.SDK;

public sealed record RegisteredImageRef(string File);

public interface IRegisteredImageService
{
    Task<string> CopyToCacheAsync(RegisteredImageRef image, bool thumbnail = false, CancellationToken cancellationToken = default);
}
