using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Effects;

namespace AppDock.InputHost;

/// <summary>Presentation only; gesture recognition and command selection stay in GestureEngine.</summary>
internal static class GestureIndicatorContent
{
    internal static FrameworkElement Create(string style, string process, GestureDirection[] directions,
        string[] captions, double opacity, string accent, bool dark, int captionRows = 0)
    {
        var background = Color(dark ? "#191B23" : "#FFFFFF", opacity);
        var foreground = Color(dark ? "#EFF0F5" : "#242939");
        var outline = Color(dark ? "#4B5262" : "#E0E4ED", opacity);
        var highlight = Color(accent);

        TextBlock Text(string text, double size, Brush brush, bool bold = false) => new()
        {
            Text = text.ReplaceLineEndings(" "), FontSize = size, Foreground = brush,
            FontWeight = bold ? FontWeights.SemiBold : FontWeights.Normal,
            TextTrimming = TextTrimming.CharacterEllipsis, TextWrapping = TextWrapping.NoWrap,
            FontFamily = new FontFamily("Segoe UI"), MaxWidth = 360,
            Effect = new DropShadowEffect { Color = dark ? Colors.Black : Colors.White, BlurRadius = 3, ShadowDepth = 0, Opacity = 0.85 },
        };
        StackPanel Labels(double size, bool centered = false, int reservedRows = 0)
        {
            var labels = new StackPanel();
            if (reservedRows > 0) labels.Height = 20 + 24 * reservedRows;
            var name = Text(process, 12, foreground);
            if (reservedRows > 0) { name.Height = 16; name.LineHeight = 16; name.LineStackingStrategy = LineStackingStrategy.BlockLineHeight; }
            name.Margin = new Thickness(0, 0, 4, 4);
            name.TextAlignment = centered ? TextAlignment.Center : TextAlignment.Left;
            labels.Children.Add(name);
            foreach (var caption in captions)
            {
                var line = Text(caption, size, foreground, true);
                if (reservedRows > 0) { line.Height = 24; line.LineHeight = 24; line.LineStackingStrategy = LineStackingStrategy.BlockLineHeight; }
                line.TextAlignment = centered ? TextAlignment.Center : TextAlignment.Left;
                labels.Children.Add(line);
            }
            return labels;
        }
        Border Surface(UIElement content, double width, double radius, Thickness padding) => new()
        {
            Width = width, Background = background, BorderBrush = outline, BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(radius), Padding = padding, Child = content,
        };

        if (style == "pill")
        {
            var row = new Grid();
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(76) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            var arrows = Arrows(directions, highlight, 26, dark);
            arrows.HorizontalAlignment = HorizontalAlignment.Left;
            arrows.Margin = new Thickness(0, 0, 16, 0);
            row.Children.Add(arrows);
            var labels = Labels(17, reservedRows: Math.Clamp(Math.Max(captionRows, captions.Length), 1, 4));
            Grid.SetColumn(labels, 1);
            row.Children.Add(labels);
            return Surface(row, 400, 32, new Thickness(18, 14, 18, 14));
        }
        if (style == "ring")
        {
            var column = new StackPanel { Width = 320 };
            column.Children.Add(new Border
            {
                Width = 106, Height = 106, CornerRadius = new CornerRadius(53),
                BorderBrush = highlight, BorderThickness = new Thickness(3), Background = background,
                HorizontalAlignment = HorizontalAlignment.Center, Child = Arrows(directions, highlight, 30, dark),
                Margin = new Thickness(0, 0, 0, 12),
            });
            column.Children.Add(Surface(Labels(18, true), 320, 12, new Thickness(20, 12, 20, 12)));
            return column;
        }

        var card = new StackPanel();
        card.Children.Add(Text(process, 12, foreground));
        var sequence = Arrows(directions, highlight, 32, dark);
        sequence.HorizontalAlignment = HorizontalAlignment.Left;
        sequence.Margin = new Thickness(0, 12, 0, 12);
        card.Children.Add(sequence);
        foreach (var caption in captions) card.Children.Add(Text(caption, 20, foreground, true));
        return Surface(card, 320, 18, new Thickness(22));
    }

    private static Image Arrows(GestureDirection[] directions, Brush brush, double size, bool dark)
    {
        // Use one image so screen readers receive the complete direction sequence in order.
        var drawing = new DrawingGroup();
        var pen = new Pen(brush, 1.6) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round, LineJoin = PenLineJoin.Round };
        var geometry = Geometry.Parse("M5,12 H19 M14,7 L19,12 L14,17");
        var gap = 8 * 24 / size;
        for (var index = 0; index < directions.Length; index++)
        {
            var transform = new TransformGroup();
            transform.Children.Add(new RotateTransform(directions[index] switch
            {
                GestureDirection.Up => -90, GestureDirection.Down => 90,
                GestureDirection.Left => 180, _ => 0,
            }, 12, 12));
            transform.Children.Add(new TranslateTransform(index * (24 + gap), 0));
            var arrow = new DrawingGroup { Transform = transform };
            arrow.Children.Add(new GeometryDrawing(null, pen, geometry));
            drawing.Children.Add(arrow);
        }
        // Transparent bounds give every direction the same square viewport.
        var width = Math.Max(1, directions.Length) * 24 + Math.Max(0, directions.Length - 1) * gap;
        drawing.Children.Add(new GeometryDrawing(Brushes.Transparent, null, new RectangleGeometry(new Rect(0, 0, width, 24))));
        drawing.Freeze();
        var image = new Image
        {
            Source = new DrawingImage(drawing), Width = width * size / 24, Height = size,
            VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center,
            Effect = new DropShadowEffect { Color = dark ? Colors.Black : Colors.White, BlurRadius = 3, ShadowDepth = 0, Opacity = 0.85 },
        };
        AutomationProperties.SetName(image, string.Concat(directions.Select(direction => GestureConfiguration.Marks[(int)direction])));
        return image;
    }

    private static SolidColorBrush Color(string hex, double opacity = 1)
    {
        // The host resolves the shared accent palette; never interpret arbitrary WPF color expressions.
        var valid = hex.Length == 7 && hex[0] == '#' && hex.AsSpan(1).ToArray().All(Uri.IsHexDigit);
        var color = valid ? (System.Windows.Media.Color)ColorConverter.ConvertFromString(hex) : Colors.Gray;
        color.A = (byte)Math.Round(Math.Clamp(opacity, 0.1, 1) * 255);
        var brush = new SolidColorBrush(color);
        brush.Freeze();
        return brush;
    }
}
