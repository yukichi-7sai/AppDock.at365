using AppDock.SDK;

namespace AppDock.Runtime;

/// <summary>Hosts a .NET Applet over AppDock's inherited stdin/stdout connection.</summary>
public static class AppletSession
{
    public static async Task RunAsync(IAppDockExtension applet, TextReader input, TextWriter output, CancellationToken cancellationToken = default)
    {
        await using var connection = new JsonRpcConnection(input, output);
        using var active = CancellationTokenSource.CreateLinkedTokenSource(connection.Lifetime, cancellationToken);
        ExtensionContext? context = null;
        var deactivated = false;
        var activated = false;
        var invocations = new System.Collections.Concurrent.ConcurrentDictionary<string, CancellationTokenSource>();
        // RPC handlers run concurrently: cancellation may arrive before command registration.
        var cancelledInvocations = new System.Collections.Concurrent.ConcurrentDictionary<string, byte>();
        var cancellationOrder = new System.Collections.Concurrent.ConcurrentQueue<string>();
        try
        {
            await connection.ReadAsync(async (method, parameters) =>
            {
                switch (method)
                {
                    case "activate":
                        if (context is not null) throw new InvalidOperationException("Already activated.");
                        context = new ExtensionContext(parameters.GetProperty("id").GetString()!, parameters.GetProperty("settings"), connection, active.Token);
                        await applet.ActivateAsync(context, active.Token);
                        Volatile.Write(ref activated, true);
                        return context.Contributions;
                    case "shell.changed":
                        if (context is not null) await context.ChangeShellAsync(parameters);
                        return null;
                    case "notifications.changed":
                        if (context is not null) await context.ChangeNotificationPolicyAsync();
                        return null;
                    case "settings.changed":
                        if (context is not null) await context.ChangeSettingsAsync(parameters);
                        return null;
                    case "customCommand.execute":
                    case "command.execute":
                        if (context is null) throw new InvalidOperationException("Not activated.");
                        var invocation = parameters.TryGetProperty("invocation", out var metadata)
                            ? System.Text.Json.JsonSerializer.Deserialize<CommandInvocation>(metadata, JsonRpcConnection.Json) : null;
                        using (var commandLifetime = CancellationTokenSource.CreateLinkedTokenSource(active.Token)) {
                            var callId = parameters.TryGetProperty("executionId", out var callIdentity) ? callIdentity.GetString()! : invocation?.Session;
                            if (callId is not null && !invocations.TryAdd(callId, commandLifetime))
                                throw new InvalidOperationException("Invocation already running.");
                            if (invocation is not null && invocation.Session != callId) invocations.TryAdd(invocation.Session, commandLifetime);
                            try {
                                if ((invocation is not null && cancelledInvocations.ContainsKey(invocation.Session)) || (callId is not null && cancelledInvocations.ContainsKey(callId))) commandLifetime.Cancel();
                                CommandExecution.Current = invocation;
                                ExtensionContext.ExecutionId.Value = parameters.TryGetProperty("executionId", out var executionId) ? executionId.GetString() : null;
                                if (method == "customCommand.execute")
                                    return await context.ExecuteCustomAsync(parameters.GetProperty("typeId").GetString()!, parameters.GetProperty("config"), commandLifetime.Token);
                                await context.ExecuteAsync(parameters.GetProperty("id").GetString()!, commandLifetime.Token);
                            } finally {
                                CommandExecution.Current = null;
                                ExtensionContext.ExecutionId.Value = null;
                                if (invocation is not null) invocations.TryRemove(invocation.Session, out _);
                                if (callId is not null) invocations.TryRemove(callId, out _);
                            }
                        }
                        return null;
                    case "customCommand.cancel":
                    case "command.cancel":
                        var cancelledSession = parameters.GetProperty(method == "customCommand.cancel" ? "executionId" : "session").GetString()!;
                        if (cancelledInvocations.TryAdd(cancelledSession, 0)) cancellationOrder.Enqueue(cancelledSession);
                        while (cancelledInvocations.Count > 256 && cancellationOrder.TryDequeue(out var expired))
                            cancelledInvocations.TryRemove(expired, out _);
                        if (invocations.TryGetValue(cancelledSession, out var pending))
                            try { await pending.CancelAsync(); }
                            catch (ObjectDisposedException) { /* Command completed concurrently. */ }
                        return null;
                    case "panel.action":
                        if (context is null || applet is not IPanelActionHandler panelActions)
                            throw new InvalidOperationException("Panel actions are not supported.");
                        await panelActions.HandlePanelActionAsync(parameters.GetProperty("id").GetString()!, active.Token);
                        return null;
                    case "page.action":
                        if (context is null || !Volatile.Read(ref activated) || applet is not IPageActionHandler pageActions)
                            throw new InvalidOperationException("ページ操作は提供されていません。");
                        return await context.ExecutePageActionAsync(pageActions,
                            parameters.GetProperty("id").GetString()!, parameters.GetProperty("input"),
                            parameters.GetProperty("pageId").GetString()!, active.Token);
                    case "page.fileRemoved":
                        if (context is not null && Volatile.Read(ref activated) && applet is IPageFileHandler files)
                            await context.ExecutePageFileRemovedAsync(files, parameters.GetProperty("pageId").GetString()!, parameters.GetProperty("file").GetString()!, active.Token);
                        return null;
                    case "deactivate":
                        Volatile.Write(ref activated, false);
                        await active.CancelAsync();
                        if (context is not null) await context.DisposeAsync();
                        await applet.DeactivateAsync(CancellationToken.None);
                        deactivated = true;
                        return null;
                    default: throw new InvalidOperationException($"Unknown method: {method}");
                }
            });
        }
        finally
        {
            await active.CancelAsync();
            if (context is not null) await context.DisposeAsync();
            if (!deactivated) await applet.DeactivateAsync(CancellationToken.None);
        }
    }
}
