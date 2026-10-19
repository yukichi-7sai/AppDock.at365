using AppDock.Runtime;
using AppDock.Tests;
using System.Text;
Console.InputEncoding = Encoding.UTF8;
Console.OutputEncoding = new UTF8Encoding(false);
await AppletSession.RunAsync(new PageProbe(), Console.In, Console.Out);
