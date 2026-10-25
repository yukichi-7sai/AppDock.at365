using System.Reflection;
using System.IO;
using System.Text.Json;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

// The display fixture never creates the input engine, registers hooks, or sends OS input.
internal static class Program
{
    private static int checks;
    [STAThread]
    private static void Main(string[] args)
    {
        var output = Path.GetFullPath(args.Length > 0 ? args[0] : ".artifacts/gesture-indicator-native");
        Directory.CreateDirectory(output);
        var assembly = args.Length > 1 ? Assembly.LoadFrom(Path.GetFullPath(args[1])) : Assembly.Load("AppDock.InputHost");
        var type = assembly.GetType("AppDock.InputHost.GestureIndicator", true)!;
        var pointType = assembly.GetType("AppDock.InputHost.GesturePoint", true)!;
        var directionType = assembly.GetType("AppDock.InputHost.GestureDirection", true)!;
        var display = type.GetMethod("Display", BindingFlags.Instance | BindingFlags.NonPublic)!;
        var app = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
        var window = (Window)Activator.CreateInstance(type, nonPublic: true)!;
        var handle = new WindowInteropHelper(window).Handle;
        var monitor = new MonitorInfo { Size = Marshal.SizeOf<MonitorInfo>() };
        GetCursorPos(out var cursor);
        Check(GetMonitorInfo(MonitorFromPoint(cursor, 2), ref monitor), "monitor bounds available");
        Console.WriteLine($"Monitor: {monitor.Bounds.Left},{monitor.Bounds.Top} to {monitor.Bounds.Right},{monitor.Bounds.Bottom}; physical size={monitor.Bounds.Right - monitor.Bounds.Left}x{monitor.Bounds.Bottom - monitor.Bounds.Top}");
        var center = new NativePoint((monitor.Bounds.Left + monitor.Bounds.Right) / 2, (monitor.Bounds.Top + monitor.Bounds.Bottom) / 2);
        var directions = Array.CreateInstance(directionType, 2);
        directions.SetValue(Enum.Parse(directionType, "Right"), 0);
        directions.SetValue(Enum.Parse(directionType, "Up"), 1);
        var process = "explorer.exe";
        var captions = new[] { "ひとつ上のフォルダーへ", "コマンドを実行", "次の操作", "ほか 2 件" };
        void Show(string style, bool dark, NativePoint origin, string[] lines, double opacity = 0.45, Array? sequence = null, int captionRows = 0)
        {
            var foreground = GetForegroundWindow();
            display.Invoke(window, [Activator.CreateInstance(pointType, origin.X, origin.Y), process, sequence ?? directions, lines,
                opacity, style, dark ? "#7ce1c5" : "#217a65", dark, captionRows]);
            window.Dispatcher.Invoke(() => { }, DispatcherPriority.ApplicationIdle);
            Check(GetForegroundWindow() == foreground, style + " does not activate");
            Check(window.IsVisible, style + " is visible");
        }
        try
        {
            var flags = GetWindowLong(handle, -20);
            Check((flags & 0x080000A0) == 0x080000A0, "click-through, no-activate and tool-window flags");
            Check(!window.ShowInTaskbar && !window.ShowActivated && window.Topmost, "overlay lifetime flags");
            foreach (var style in new[] { "compact", "pill", "ring", "classic" })
            foreach (var dark in new[] { false, true })
            {
                Show(style, dark, center, captions);
                var content = (FrameworkElement)window.Content;
                var modern = (ContentControl)window.FindName("_modern");
                var classic = (Grid)window.FindName("_classic");
                Check((modern.Visibility == Visibility.Visible) == (style != "classic"), style + " surface selected");
                Check((classic.Visibility == Visibility.Visible) == (style == "classic"), style + " classic selection");
                Check(window.Opacity == (style == "classic" ? 0.45 : 1), style + " foreground opacity");
                if (style != "classic")
                {
                    var texts = Descendants<TextBlock>((DependencyObject)modern.Content).ToArray();
                    Check(texts.Select(text => text.Text).SequenceEqual(new[] { process }.Concat(captions)), style + " command order and overflow count");
                    Check(texts.All(text => text.Foreground is SolidColorBrush brush && brush.Color.A == 255 && text.Opacity == 1), style + " text stays opaque");
                    Check(Descendants<Border>((DependencyObject)modern.Content).Where(border => border.Background != null)
                        .All(border => border.Background is SolidColorBrush brush && brush.Color.A is 114 or 115), style + " background opacity");
                    var arrows = Descendants<Image>((DependencyObject)modern.Content).Single();
                    Check(AutomationProperties.GetName(arrows) == "➡️⬆️", style + " accessible ordered directions");
                    Check(arrows.Source is DrawingImage { Drawing: DrawingGroup drawing } && drawing.Children.Count == 3, style + " two vector arrows");
                }
                GetWindowRect(handle, out var bounds);
                Console.WriteLine($"{style}/{(dark ? "dark" : "light")}: center={center.X},{center.Y}; bounds={bounds.Left},{bounds.Top},{bounds.Right},{bounds.Bottom}; content={content.ActualWidth},{content.ActualHeight}; desired={content.DesiredSize}; window={window.ActualWidth},{window.ActualHeight}; dpi={GetDpiForWindow(handle)}; threadAwareness={GetAwarenessFromDpiAwarenessContext(GetThreadDpiAwarenessContext())}");
                Check(Math.Abs((bounds.Left + bounds.Right) / 2 - center.X) <= 1 && Math.Abs((bounds.Top + bounds.Bottom) / 2 - center.Y) <= 1,
                    style + " center placement after content height reuse");
                foreach (var backdrop in new[] { "light", "dark" })
                    Save(content, window.Opacity, backdrop == "light" ? Colors.White : System.Windows.Media.Color.FromRgb(20, 23, 30),
                        Path.Combine(output, $"{style}-{(dark ? "dark" : "light")}-on-{backdrop}.png"));
                var longLines = new[] { new string('W', 300), "長いコマンド名" + new string('あ', 200), "一行目\n二行目", "ほか 99 件" };
                Show(style, dark, new NativePoint(monitor.Bounds.Right - 1, monitor.Bounds.Bottom - 1), longLines);
                GetWindowRect(handle, out bounds);
                Check(bounds.Right <= monitor.Bounds.Right && bounds.Bottom <= monitor.Bounds.Bottom && bounds.Left >= monitor.Bounds.Left && bounds.Top >= monitor.Bounds.Top,
                    style + " long titles remain inside monitor");
                Check(content.ActualWidth <= 500, style + " long titles do not widen overlay");
                if (style != "classic")
                    Check(Descendants<TextBlock>((DependencyObject)modern.Content).Select(text => text.Text)
                        .SequenceEqual(new[] { process }.Concat(longLines.Select(line => line.ReplaceLineEndings(" ")))),
                        style + " multiline names retain separate command rows");
                Show(style, dark, new NativePoint(monitor.Bounds.Left, monitor.Bounds.Top), ["アクション無し"]);
                GetWindowRect(handle, out bounds);
                Check(bounds.Left >= monitor.Bounds.Left && bounds.Top >= monitor.Bounds.Top, style + " top-left edge clamping");
                foreach (var opacity in new[] { 0.1, 0.45, 1 })
                {
                    Show(style, dark, center, ["アクション無し"], opacity);
                    Check(window.Opacity == (style == "classic" ? opacity : 1), style + " opacity boundary");
                    if (style != "classic")
                    {
                        Check(Descendants<Border>((DependencyObject)modern.Content).Where(border => border.Background != null)
                            .All(border => border.Background is SolidColorBrush brush && brush.Color.A == (byte)Math.Round(opacity * 255)),
                            style + " background opacity boundary");
                        Check(Descendants<TextBlock>((DependencyObject)modern.Content)
                            .All(text => text.Foreground is SolidColorBrush brush && brush.Color.A == 255), style + " boundary text remains opaque");
                    }
                }
                window.Hide();
                Check(!window.IsVisible, style + " hide");
            }
            foreach (var (direction, mark) in new[] { ("Up", "⬆️"), ("Down", "⬇️"), ("Left", "⬅️"), ("Right", "➡️") })
            {
                var single = Array.CreateInstance(directionType, 1);
                single.SetValue(Enum.Parse(directionType, direction), 0);
                Show("compact", true, center, ["方向の表示"], sequence: single);
                var modern = (ContentControl)window.FindName("_modern");
                Check(AutomationProperties.GetName(Descendants<Image>((DependencyObject)modern.Content).Single()) == mark, direction + " accessible direction");
                Save((FrameworkElement)window.Content, 1, Colors.White, Path.Combine(output, $"direction-{direction.ToLowerInvariant()}.png"));
            }
            var oneDirection = Array.CreateInstance(directionType, 1);
            oneDirection.SetValue(Enum.Parse(directionType, "Right"), 0);
            foreach (var dark in new[] { false, true })
            foreach (var reservedRows in new[] { 1, 2, 3, 4 })
            {
                window.Hide();
                Show("pill", dark, center, ["アクション無し"], sequence: oneDirection, captionRows: reservedRows);
                GetWindowRect(handle, out var first);
                var modern = (ContentControl)window.FindName("_modern");
                var firstCaption = Descendants<TextBlock>((DependencyObject)modern.Content).Skip(1).First();
                var firstTextOrigin = firstCaption.PointToScreen(new Point());
                var height = ((FrameworkElement)window.Content).ActualHeight;
                for (var count = 1; count <= reservedRows; count++)
                {
                    var lines = Enumerable.Range(0, count).Select(index => index == 0 ? "長い名前" + new string('W', 200) : "Agあ⬆️").ToArray();
                    Show("pill", dark, center, lines, sequence: directions, captionRows: reservedRows);
                    GetWindowRect(handle, out var second);
                    Check(first.Equals(second), $"pill stage transition keeps window bounds ({reservedRows} reserved/{count} captions)");
                    modern = (ContentControl)window.FindName("_modern");
                    var texts = Descendants<TextBlock>((DependencyObject)modern.Content).ToArray();
                    Check(texts[1].PointToScreen(new Point()) == firstTextOrigin, "pill caption origin does not move when second direction appears");
                    Check(texts.Skip(1).All(text => text.ActualHeight == 24 && text.ActualWidth > 0), "pill caption rows remain visible at fixed line height");
                }
                Show("pill", dark, center, ["x"], sequence: oneDirection, captionRows: reservedRows);
                GetWindowRect(handle, out var returned);
                Check(first.Equals(returned), "pill content reuse does not change reserved bounds");
                Check(Math.Abs(height - (50 + 24 * reservedRows)) < 0.01, "pill reserves only the required caption rows");
            }
            var engineType = assembly.GetType("AppDock.InputHost.GestureEngine", true)!;
            var configurationType = assembly.GetType("AppDock.InputHost.Configuration", true)!;
            using (var engine = (IDisposable)Activator.CreateInstance(engineType, BindingFlags.Instance | BindingFlags.NonPublic, null, [Dispatcher.CurrentDispatcher, null], null)!)
            {
                var rows = new[] { ("move-right", "a"), ("move-right-up", "a"), ("move-right-up", "b"), ("move-right-up", "c"), ("move-right-up", "d"), ("move-right-up", "d"), ("wheel-up", "e") }
                    .Select((entry, index) => new { id = index.ToString(), command = entry.Item2, gesture = entry.Item1, title = entry.Item2, window = "", when = new { scope = "global", appletIds = Array.Empty<string>(), processes = Array.Empty<string>() } });
                foreach (var mode in new[] { "all", "first" })
                {
                    var json = JsonSerializer.Serialize(new { enabled = true, browsers = Array.Empty<string>(), excludedProcesses = Array.Empty<string>(), requireChromiumWindowClass = false, distance = 50, wheelDelayMs = 0, indicatorOpacity = .45, indicatorPosition = "gesture-start", rows, context = "{}", revision = 1, executionMode = mode });
                    var configuration = JsonSerializer.Deserialize(json, configurationType, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
                    engineType.GetField("config", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(engine, configuration);
                    engineType.GetField("candidates", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(engine, configurationType.GetProperty("Rows")!.GetValue(configuration));
                    var budget = (int)engineType.GetProperty("PillCaptionRows", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(engine)!;
                    Check(budget == (mode == "all" ? 4 : 1), "pill caption reservation follows deduplicated first/all selection");
                }
            }
            Console.WriteLine($"PASS: {checks} native gesture indicator checks; snapshots: {output}");
        }
        finally { window.Close(); app.Shutdown(); }
    }

    private static IEnumerable<T> Descendants<T>(DependencyObject root) where T : DependencyObject
    {
        if (root is T item) yield return item;
        for (var index = 0; index < VisualTreeHelper.GetChildrenCount(root); index++)
            foreach (var child in Descendants<T>(VisualTreeHelper.GetChild(root, index))) yield return child;
    }
    private static void Save(FrameworkElement content, double opacity, System.Windows.Media.Color backdrop, string path)
    {
        var width = (int)Math.Ceiling(content.ActualWidth);
        var height = (int)Math.Ceiling(content.ActualHeight);
        var render = new RenderTargetBitmap(width, height, 96, 96, PixelFormats.Pbgra32);
        render.Render(content);
        var visual = new DrawingVisual();
        using (var context = visual.RenderOpen())
        {
            context.DrawRectangle(new SolidColorBrush(backdrop), null, new Rect(0, 0, width + 48, height + 48));
            context.PushOpacity(opacity);
            context.DrawImage(render, new Rect(24, 24, width, height));
            context.Pop();
        }
        var composite = new RenderTargetBitmap(width + 48, height + 48, 96, 96, PixelFormats.Pbgra32);
        composite.Render(visual);
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(composite));
        using var stream = File.Create(path);
        encoder.Save(stream);
    }
    private static void Check(bool passed, string description)
    {
        if (!passed) throw new InvalidOperationException(description);
        checks++;
    }
    [StructLayout(LayoutKind.Sequential)] private readonly record struct NativePoint(int X, int Y);
    [StructLayout(LayoutKind.Sequential)] private struct NativeRect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct MonitorInfo { public int Size; public NativeRect Bounds, WorkArea; public uint Flags; }
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out NativePoint point);
    [DllImport("user32.dll")] private static extern nint MonitorFromPoint(NativePoint point, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool GetMonitorInfo(nint monitor, ref MonitorInfo info);
    [DllImport("user32.dll")] private static extern int GetWindowLong(nint window, int index);
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool GetWindowRect(nint window, out NativeRect rect);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(nint window);
    [DllImport("user32.dll")] private static extern nint GetThreadDpiAwarenessContext();
    [DllImport("user32.dll")] private static extern int GetAwarenessFromDpiAwarenessContext(nint context);
}
