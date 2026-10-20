namespace AppDock.SDK;

public sealed record RegisteredImageRef(string File);

public interface IRegisteredImageService
{
    Task<RegisteredImageRef> ImportAsync(byte[] bytes, string? filename = null, CancellationToken cancellationToken = default);
    Task<string> CopyToCacheAsync(RegisteredImageRef image, bool thumbnail = false, CancellationToken cancellationToken = default);
}
