using Windows.ApplicationModel.DataTransfer;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace AppDock.InputHost;

internal static class PaletteHistory
{
    internal sealed record Row(string id, string kind, string preview, string? thumbnail);
    internal sealed record Listing(string status, List<Row> rows);

    internal static async Task<Listing> ReadAsync(InputPaletteTarget target)
    {
        var history = await Clipboard.GetHistoryItemsAsync();
        var rows = new List<Row>();
        if (history.Status != ClipboardHistoryItemsResultStatus.Success)
            return new(history.Status == ClipboardHistoryItemsResultStatus.ClipboardHistoryDisabled ? "disabled" : "denied", rows);
        foreach (var item in history.Items)
        {
            if (!target.IsCurrent()) break;
            try
            {
                if (item.Content.Contains(StandardDataFormats.Bitmap))
                {
                    string? thumbnail = null;
                    try { thumbnail = await ThumbnailAsync(item.Content); }
                    catch (Exception) { /* An unavailable preview does not invalidate the original item. */ }
                    rows.Add(new(item.Id, "image", "", thumbnail));
                }
                else if (item.Content.Contains(StandardDataFormats.Text))
                {
                    var text = await item.Content.GetTextAsync();
                    var end = Math.Min(160, text.Length);
                    if (end < text.Length && end > 0 && char.IsHighSurrogate(text[end - 1])) end--;
                    rows.Add(new(item.Id, "text", text[..end], null));
                }
            }
            catch (System.Runtime.InteropServices.COMException) { /* Item removed during enumeration. */ }
        }
        return new("ok", rows);
    }

    private static async Task<string> ThumbnailAsync(DataPackageView content)
    {
        using var stream = await (await content.GetBitmapAsync()).OpenReadAsync();
        var decoder = await BitmapDecoder.CreateAsync(stream);
        double scale = Math.Min(1, Math.Min(72d / decoder.PixelWidth, 44d / decoder.PixelHeight));
        var transform = new BitmapTransform
        {
            ScaledWidth = Math.Max(1u, (uint)(decoder.PixelWidth * scale)),
            ScaledHeight = Math.Max(1u, (uint)(decoder.PixelHeight * scale))
        };
        using var bitmap = await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied, transform,
            ExifOrientationMode.RespectExifOrientation, ColorManagementMode.DoNotColorManage);
        using var output = new InMemoryRandomAccessStream();
        var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, output);
        encoder.SetSoftwareBitmap(bitmap);
        await encoder.FlushAsync();
        using var reader = new DataReader(output.GetInputStreamAt(0));
        var bytes = new byte[checked((int)output.Size)];
        await reader.LoadAsync((uint)bytes.Length);
        reader.ReadBytes(bytes);
        return "data:image/png;base64," + Convert.ToBase64String(bytes);
    }

    internal static async Task<(string Status, string? Text, PalettePaste.ClipboardVersion Version)> RestoreAsync(string id, InputPaletteTarget target)
    {
        var history = await Clipboard.GetHistoryItemsAsync();
        if (history.Status != ClipboardHistoryItemsResultStatus.Success) return ("denied", null, default);
        var item = history.Items.FirstOrDefault(i => i.Id == id);
        if (item == null) return ("deleted", null, default);
        string? text = null;
        if (!item.Content.Contains(StandardDataFormats.Bitmap) && item.Content.Contains(StandardDataFormats.Text))
            text = await item.Content.GetTextAsync();
        if (!target.IsCurrent()) return ("cancelled", null, default);
        return Clipboard.SetHistoryItemAsContent(item) switch
        {
            SetHistoryItemAsContentStatus.Success => ("ok", text, PalettePaste.ClipboardVersion.Current()),
            SetHistoryItemAsContentStatus.ItemDeleted => ("deleted", null, default),
            _ => ("denied", null, default)
        };
    }
}
