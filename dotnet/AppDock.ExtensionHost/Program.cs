using System.Reflection;
using System.Runtime.Loader;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using AppDock.SDK;
using AppDock.Runtime;

Console.InputEncoding = Encoding.UTF8;
Console.OutputEncoding = new UTF8Encoding(false);
var wireOutput = Console.Out;
Console.SetOut(Console.Error); // Extension Console.WriteLine cannot corrupt the protocol.
if (args is ["--double-click-time"])
{
    wireOutput.WriteLine(NativeMouse.GetDoubleClickTime());
    return 0;
}
if (args.Length != 2) { Console.Error.WriteLine("Usage: AppDock.ExtensionHost <assembly.dll> <type>"); return 2; }
try
{
    var assemblyPath = Path.GetFullPath(args[0]);
    var loader = new ExtensionLoadContext(assemblyPath);
    var type = loader.LoadFromAssemblyPath(assemblyPath).GetType(args[1], throwOnError: true)!;
    var extension = Activator.CreateInstance(type) as IAppDockExtension ?? throw new InvalidOperationException("Type must implement IAppDockExtension.");
    await AppletSession.RunAsync(extension, Console.In, wireOutput);
    return 0;
}
catch (Exception e) { Console.Error.WriteLine(e); return 1; }

internal sealed class ExtensionLoadContext(string mainAssembly) : AssemblyLoadContext
{
    private readonly AssemblyDependencyResolver resolver = new(mainAssembly);
    protected override Assembly? Load(AssemblyName name)
    {
        if (name.Name == typeof(IAppDockExtension).Assembly.GetName().Name) return typeof(IAppDockExtension).Assembly;
        var file = resolver.ResolveAssemblyToPath(name);
        // Class libraries copied with their dependencies may not have a deps.json.
        if (file is null)
        {
            var local = Path.Combine(Path.GetDirectoryName(mainAssembly)!, name.Name + ".dll");
            if (File.Exists(local)) file = local;
        }
        return file is null ? null : LoadFromAssemblyPath(file);
    }
    protected override nint LoadUnmanagedDll(string name)
    {
        var file = resolver.ResolveUnmanagedDllToPath(name);
        return file is null ? nint.Zero : LoadUnmanagedDllFromPath(file);
    }
}

internal static class NativeMouse
{
    [DllImport("user32.dll")]
    internal static extern uint GetDoubleClickTime();
}
