using System.IO;
using System.Reflection;
using System.Text.Json;

internal static partial class Program
{
    private static int RunIndicatorNoticeTests(string dll)
    {
        try {
            var assembly = Assembly.LoadFrom(Path.GetFullPath(dll));
            const BindingFlags members = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
            var count = 0;
            void Check(bool condition, string message) {
                if (!condition) throw new Exception(message);
                count++; Console.WriteLine("PASS: " + message);
            }
            Check(!assembly.GetTypes().Any(type => typeof(System.Windows.Window).IsAssignableFrom(type)), "InputHost has no native window types");
            Check(!assembly.GetManifestResourceNames().Any(name => name.EndsWith(".g.resources", StringComparison.Ordinal)), "InputHost has no compiled WPF window resources");
            var config = assembly.GetType("AppDock.InputHost.Configuration", true)!;
            Check(new[] { "IndicatorUseWeb", "IndicatorAccent", "IndicatorDark" }.All(name => config.GetProperty(name) == null), "capture configuration has no native renderer selection or palette");
            var type = assembly.GetType("AppDock.InputHost.GestureIndicatorNotifications", true)!;
            var notices = new List<JsonElement>();
            var publisher = Activator.CreateInstance(type, members, null, [new Action<object>(payload => notices.Add(JsonSerializer.SerializeToElement(payload)))], null)!;
            object? Call(string method, params object[] args) => type.GetMethod(method, members)!.Invoke(publisher, args);
            Call("Configure", 7);
            Call("Hide");
            Check(notices.Count == 0, "initial hidden state does not publish");
            var point = Activator.CreateInstance(assembly.GetType("AppDock.InputHost.GesturePoint", true)!, [-1500, 400])!;
            var direction = assembly.GetType("AppDock.InputHost.GestureDirection", true)!;
            var directions = Array.CreateInstance(direction, 2);
            directions.SetValue(Enum.Parse(direction, "Right"), 0);
            directions.SetValue(Enum.Parse(direction, "Up"), 1);
            Call("Display", point, "sample.exe", directions, new[] { "<button>literal</button>", "second" }, 0.45, "pill", 4);
            var show = notices.Single();
            Check(show.GetProperty("visible").GetBoolean() && show.GetProperty("revision").GetInt32() == 7, "visible notice carries capture revision");
            Check(show.GetProperty("x").GetInt32() == -1500 && show.GetProperty("y").GetInt32() == 400, "physical coordinates retain negative monitor origin");
            Check(show.GetProperty("directions").EnumerateArray().Select(value => value.GetString()).SequenceEqual(new[] { "right", "up" }), "direction IDs retain input order");
            Check(show.GetProperty("captions")[0].GetString() == "<button>literal</button>" && show.GetProperty("captions")[1].GetString() == "second", "command labels retain literal text and order");
            Check(show.GetProperty("captionRows").GetInt32() == 4 && show.GetProperty("style").GetString() == "pill", "reserved caption rows reach the JS renderer");
            Check(show.GetProperty("opacity").GetDouble() == 0.45 && show.GetProperty("process").GetString() == "sample.exe", "presentation values retain their original values");
            Call("Configure", 8);
            Call("Hide");
            var hide = notices.Last();
            Check(hide.EnumerateObject().Count() == 2 && !hide.GetProperty("visible").GetBoolean() && hide.GetProperty("revision").GetInt32() == 8, "hide drops presentation data and uses current revision");
            Call("Hide");
            Call("Close");
            Check(notices.Count == 2, "repeated hide and close do not duplicate notifications");
            Call("Display", point, "sample.exe", directions, new[] { "again" }, 1d, "classic", 0);
            Call("Close");
            Check(notices.Count == 4 && !notices.Last().GetProperty("visible").GetBoolean(), "close publishes hide for a visible indicator");
            Console.WriteLine($"PASS: {count} gesture indicator notification checks");
            return 0;
        } catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
