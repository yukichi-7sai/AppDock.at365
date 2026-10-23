// Exercise the installed Codex MCP client without invoking a model or using account credentials.
const { spawn } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path');
const readline = require('node:readline');
const assert = require('node:assert/strict');
module.exports = async function checkCodex({ executable, configFile, server, output }) {
  const child = spawn(executable, ['app-server'], {
    cwd: path.dirname(configFile),
    env: { ...process.env, CODEX_HOME: path.dirname(configFile) },
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  let sequence = 0;
  const diagnostics = [];
  child.stderr.on('data', (b) => {
    if (diagnostics.length < 20)
      diagnostics.push(String(b).replace(/Bearer [^\s"}]+/g, 'Bearer [redacted]'));
  });
  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let item;
    try {
      item = JSON.parse(line);
    } catch {
      return;
    }
    const p = pending.get(item.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(item.id);
    if (item.error) p.reject(Error(JSON.stringify(item.error)));
    else p.resolve(item.result);
  });
  child.on('error', (error) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
  });
  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error('Codex timeout: ' + method));
      }, 30000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  try {
    const initialized = await rpc('initialize', {
      clientInfo: { name: 'appdock_mcp_regression', version: '1' },
      capabilities: { experimentalApi: true },
    });
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    const started = await rpc('thread/start', {
      cwd: path.dirname(configFile),
      ephemeral: true,
      approvalPolicy: 'never',
      sandbox: 'read-only',
    });
    const threadId = started.thread.id;
    let tools = [];
    for (let n = 0; n < 20; n++) {
      const status = await rpc('mcpServerStatus/list', { threadId, detail: 'toolsAndAuthOnly' });
      const entry = status.data?.find((x) => x.name === server);
      tools = Object.keys(entry?.tools ?? {});
      if (tools.length === 14) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.equal(tools.length, 14, 'Codex discovers all fourteen MCP tools');
    const call = (tool, args = {}) =>
      rpc('mcpServer/tool/call', { threadId, server, tool, arguments: args });
    const info = await call('appdock_get_info');
    const tray = await call('appdock_get_tray');
    assert.equal(tray.isError ?? false, false);
    assert.ok(Array.isArray(tray.structuredContent.menu));
    if (tray.structuredContent.trayEditingAllowed) {
      const preview = await call('appdock_execute_command', {
        id: 'appdock.tray.update',
        args: {
          expectedRevision: tray.structuredContent.revision,
          dryRun: true,
          operations: [
            {
              kind: 'configure',
              changes: { singleClickCommand: 'appdock.open', doubleClickCommand: null },
            },
          ],
        },
      });
      assert.equal(preview.structuredContent.completion, 'validated');
      assert.deepEqual(
        (await call('appdock_get_tray')).structuredContent.clicks,
        tray.structuredContent.clicks,
      );
    }
    const ribbon = await call('appdock_get_ribbon');
    assert.equal(ribbon.isError ?? false, false);
    assert.ok(Array.isArray(ribbon.structuredContent.items));
    if (ribbon.structuredContent.ribbonEditingAllowed) {
      const dry = await call('appdock_execute_command', {
        id: 'appdock.ribbon.update',
        args: {
          expectedRevision: ribbon.structuredContent.revision,
          dryRun: true,
          operations: [{ kind: 'update', id: 'image-library', changes: { visible: false } }],
        },
      });
      assert.equal(dry.structuredContent.completion, 'validated');
      assert.deepEqual(
        (await call('appdock_get_ribbon')).structuredContent.layout,
        ribbon.structuredContent.layout,
      );
    }
    const gestures = await call('appdock_get_gestures');
    assert.equal(gestures.isError ?? false, false);
    assert.ok(Array.isArray(gestures.structuredContent.bindings));
    if (gestures.structuredContent.gestureEditingAllowed) {
      const dry = await call('appdock_execute_command', {
        id: 'appdock.gestures.update',
        args: {
          expectedRevision: gestures.structuredContent.revision,
          dryRun: true,
          operations: [{ kind: 'configure', changes: { distance: 75 } }],
        },
      });
      assert.equal(dry.structuredContent.completion, 'validated');
      assert.deepEqual(
        (await call('appdock_get_gestures')).structuredContent.settings,
        gestures.structuredContent.settings,
      );
    }
    const shortcuts = await call('appdock_get_shortcuts');
    assert.equal(shortcuts.isError ?? false, false);
    assert.ok(Array.isArray(shortcuts.structuredContent.bindings));
    if (shortcuts.structuredContent.shortcutEditingAllowed) {
      const preview = await call('appdock_execute_command', {
        id: 'appdock.shortcuts.update',
        args: {
          expectedRevision: shortcuts.structuredContent.revision,
          dryRun: true,
          operations: [
            {
              kind: 'add',
              binding: {
                id: 'codex-validation',
                command: 'appdock.open',
                key: 'Ctrl+Alt+F9',
                enabled: false,
                when: { scope: 'app', appletIds: [] },
              },
            },
          ],
        },
      });
      assert.equal(preview.isError ?? false, false);
      assert.equal(preview.structuredContent.completion, 'validated');
      assert.deepEqual(
        (await call('appdock_get_shortcuts')).structuredContent.bindings,
        shortcuts.structuredContent.bindings,
      );
    }
    assert.equal(info.isError ?? false, false);
    const catalog = await call('appdock_list_commands');
    assert.ok(catalog.structuredContent.commands.some((c) => c.id === 'appdock.open'));
    const opened = await call('appdock_execute_command', { id: 'appdock.open' });
    assert.equal(opened.isError ?? false, false);
    assert.equal(opened.structuredContent.completion, 'accepted');
    const before = await call('appdock_get_settings');
    assert.equal(before.isError ?? false, false);
    const values = before.structuredContent;
    const next = await call('appdock_execute_command', {
      id: 'appdock.settings.update',
      args: {
        expectedRevision: values.revision,
        changes: { closeToTray: !values.values.closeToTray },
      },
    });
    assert.equal(next.isError ?? false, false);
    assert.equal(next.structuredContent.values.closeToTray, !values.values.closeToTray);
    const after = await call('appdock_get_settings');
    assert.equal(after.structuredContent.values.closeToTray, !values.values.closeToTray);
    const restore = await call('appdock_execute_command', {
      id: 'appdock.settings.update',
      args: {
        expectedRevision: after.structuredContent.revision,
        changes: { closeToTray: values.values.closeToTray },
      },
    });
    assert.equal(restore.isError ?? false, false);
    const result = {
      ok: true,
      client: initialized.userAgent,
      toolCount: tools.length,
      checks: [
        'installed Codex reads GUI-created config',
        'discovers fourteen MCP tools; reads shortcuts, gestures, ribbon and tray with dry-run editing; lists commands and executes appdock.open',
        'get info/get settings/patch/read back/restore through Codex MCP client',
      ],
      modelInvoked: false,
    };
    fs.writeFileSync(path.join(output, 'codex-result.json'), JSON.stringify(result, null, 2));
    return result;
  } catch (e) {
    fs.writeFileSync(
      path.join(output, 'codex-failure.txt'),
      String(e.stack) + '\n' + diagnostics.join('\n'),
    );
    throw e;
  } finally {
    for (const p of pending.values()) clearTimeout(p.timer);
    child.stdin.end();
    await Promise.race([
      new Promise((r) => child.once('exit', r)),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
    if (child.exitCode === null) {
      child.kill();
      await new Promise((r) => child.once('exit', r));
    }
    lines.close();
  }
};
