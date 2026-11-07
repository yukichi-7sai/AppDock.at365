using AppDock.SDK;
using AppDock.Runtime;
using System.Text;
Console.InputEncoding = Encoding.UTF8;
Console.OutputEncoding = new UTF8Encoding(false);
await AppletSession.RunAsync(new AppDock.Tests.LocalizationProbe(), Console.In, Console.Out);

namespace AppDock.Tests {
    public sealed class LocalizationProbe : IAppDockExtension {
        private IDisposable? subscription;
        public async Task ActivateAsync(IExtensionContext context, CancellationToken token) {
            Task Show(CancellationToken ct) => context.Storage.SetAsync("localization", new {
                title = context.Localization.Text("title"),
                named = context.Localization.Text("named", new Dictionary<string, object?> { ["name"] = "{{count}} $t(title)", ["count"] = 3 }),
                language = context.Localization.Language
            }, StorageScope.Memory, ct);
            context.Commands.Register(context.ExtensionId + ".show", context.Localization.Text("title"), Show);
            subscription = context.Localization.OnChanged(Show);
            await Show(token);
        }
        public Task DeactivateAsync(CancellationToken token) { subscription?.Dispose(); return Task.CompletedTask; }
    }
}
