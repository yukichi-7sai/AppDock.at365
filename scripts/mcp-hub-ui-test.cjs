const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net'),
  assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process'),
  { randomUUID, createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { parse } = require('smol-toml');
const root = path.resolve(__dirname, '..'),
  portable = process.argv[2] && path.resolve(process.argv[2]);
const profile = path.join(
    root,
    '.artifacts',
    `mcp-hub-${portable ? 'portable' : 'source'}-${Date.now()}`,
  ),
  local = path.join(profile, 'local');
fs.mkdirSync(profile, { recursive: true });
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const checks = [],
  states = [];
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.closeToTray = false;
settings.host.hardwareAcceleration = false;
settings.gestures.enabled = false;
settings.updates.checkHostOnStartup = false;
settings.updates.checkAppletsOnStartup = false;
const providerIds = ['test.custom-node', 'test.custom-dotnet', 'test.custom-native'];
for (const [index, id] of providerIds.entries()) {
  const folder = path.join(profile, 'extensions', id);
  fs.mkdirSync(folder, { recursive: true });
  if (index === 0)
    fs.copyFileSync(
      path.join(root, 'tests/fixtures/extensions/custom-commands/index.cjs'),
      path.join(folder, 'index.cjs'),
    );
  else
    fs.cpSync(
      path.join(root, 'tests/fixtures/dotnet/AppDock.CustomCommands/bin/Release/net10.0'),
      folder,
      { recursive: true },
    );
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name: id,
      version: '1.0.0',
      minimumHostVersion: '0.60.0',
      runtime: ['node', 'dotnet', 'native'][index],
      entry:
        index === 0
          ? 'index.cjs'
          : index === 1
            ? 'AppDock.CustomCommands.dll'
            : 'AppDock.CustomCommands.exe',
      ...(index === 1 ? { type: 'AppDock.CustomCommands.Probe' } : {}),
      capabilities: ['custom-commands', 'appdock-api'],
      customCommandTypes: [
        {
          id: id + '.echo',
          title: ['Node Echo', '.NET Echo', 'Native Echo'][index],
          configVersion: 1,
          automation: true,
          configSchema: {
            type: 'object',
            properties: {
              message: { type: 'string', maxLength: 100 },
              delay: { type: 'integer', minimum: 0, maximum: 30000 },
            },
            required: ['message'],
            additionalProperties: false,
          },
          fields: [{ key: 'message', title: 'メッセージ', type: 'string', default: 'fixed' }],
        },
      ],
    }),
  );
  settings.extensions[id] = { enabled: true, settings: {} };
}
const watchRoot = path.resolve(root, '../Applet.Watch.at365');
const watchFolder = path.join(profile, 'extensions', 'at365.watch');
fs.cpSync(path.join(watchRoot, 'Applet.Watch/bin/Release/net10.0-windows/win-x64'), watchFolder, {
  recursive: true,
});
fs.copyFileSync(path.join(watchRoot, 'extension.json'), path.join(watchFolder, 'extension.json'));
settings.extensions['at365.watch'] = { enabled: true, settings: { visible: false } };
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const configFile = path.join(profile, 'codex', 'config.toml');
fs.mkdirSync(path.dirname(configFile), { recursive: true });
fs.writeFileSync(configFile, '# isolated test\n');
const portableHash = portable ? hash(portable) : undefined;
if (portable) fs.copyFileSync(portable, path.join(profile, 'AppDock.at365.exe'));
function fixtureHashes(folder) {
  return Object.fromEntries(
    fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(folder, entry.name);
      return entry.isDirectory()
        ? Object.entries(fixtureHashes(file))
        : [[path.relative(profile, file), hash(file)]];
    }),
  );
}
const fixtureInputs = fixtureHashes(path.join(profile, 'extensions'));
const fixtureMetadata = {
  watchHead: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: watchRoot,
    encoding: 'utf8',
    windowsHide: true,
  }).trim(),
  node: process.version,
  nodeSha256: hash(process.execPath),
  mcpServerSha256: hash(path.join(root, 'tests/fixtures/mcp-server.cjs')),
};
fs.writeFileSync(
  path.join(profile, 'fixture-inputs.json'),
  JSON.stringify({ metadata: fixtureMetadata, files: fixtureInputs }, null, 2),
);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, timeout = 30000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (e) {
      last = e;
    }
    await wait(100);
  }
  throw Error(label + (last ? ' ' + last.message : ''));
}
async function start() {
  const listener = net.createServer();
  await new Promise((r) => listener.listen(0, '127.0.0.1', r));
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  const env = { ...process.env, APPDOCK_WATCH_TEST_OUTPUT: path.join(profile, 'watch') };
  delete env.ELECTRON_RUN_AS_NODE;
  const state = {
    child: spawn(
      portable ? path.join(profile, 'AppDock.at365.exe') : require('electron'),
      [
        ...(portable ? [] : [root]),
        `--test-profile=${profile}`,
        `--test-local-state=${local}`,
        `--remote-debugging-port=${port}`,
      ],
      { cwd: profile, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  };
  states.push(state);
  for (const stream of [state.child.stdout, state.child.stderr])
    stream.on('data', (data) => fs.appendFileSync(path.join(profile, 'process.log'), data));
  state.browser = await until(
    () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
    'CDP',
  );
  state.page = await until(
    () =>
      state.browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().startsWith('appdock://host/')),
    'host',
  );
  state.page.setDefaultTimeout(15000);
  await until(
    () =>
      state.page.evaluate(async () => {
        const s = await window.dock.snapshot();
        return (
          s.startupReady &&
          ['test.custom-node', 'test.custom-dotnet', 'test.custom-native'].every((id) =>
            s.extensions.some((a) => a.id === id && a.state === 'running'),
          )
        );
      }),
    'providers',
  );
  return state;
}
async function stop(state) {
  if (!state.browser || !state.page) {
    if (state.child.exitCode === null) state.child.kill();
    await state.browser?.close().catch(() => {});
    state.browser = null;
    return;
  }
  await state.page.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
  await until(() => state.child.exitCode !== null, 'quit');
  await state.browser.close();
  state.browser = null;
}
let client;
async function connect(state) {
  const status = await state.page.evaluate(
    async () => (await window.dock.automation({ kind: 'status' })).state,
  );
  const headers = parse(fs.readFileSync(configFile, 'utf8')).mcp_servers[status.serverId]
    .http_headers;
  client = new Client({ name: 'AppDock MCP hub fixture', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(status.endpoint), { requestInit: { headers } }),
  );
}
async function call(name, args = {}) {
  const reply = await client.callTool({ name, arguments: args });
  if (reply.isError) throw Error(JSON.stringify(reply.structuredContent));
  return reply.structuredContent;
}
async function update(operations) {
  const state = await call('appdock_list_custom_commands');
  return call('appdock_execute_command', {
    id: 'appdock.customCommands.update',
    args: { expectedRevision: state.revision, operations },
  });
}
async function checkDialogLayout(dialog) {
  const layout = await dialog.evaluate((element) => {
    const body = element.querySelector('.settings-dialog-body');
    return {
      overflow: body.scrollWidth - body.clientWidth,
      choices: [...element.querySelectorAll('.settings-choice')].map((label) => {
        const input = label.querySelector('input').getBoundingClientRect();
        const text = label.querySelector('span').getBoundingClientRect();
        const bounds = label.getBoundingClientRect();
        return {
          width: input.width,
          visible: text.right <= bounds.right + 1 && text.left >= bounds.left,
        };
      }),
    };
  });
  assert(layout.overflow <= 1, JSON.stringify(layout));
  assert(
    layout.choices.every((c) => c.width <= 30 && c.visible),
    JSON.stringify(layout),
  );
}
(async () => {
  try {
    let state = await start(),
      page = state.page;
    assert.equal(
      (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state.enabled,
      false,
    );
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await page.getByRole('button', { name: 'MCP接続先', exact: true }).click();
    await page.getByRole('button', { name: '接続先を追加', exact: true }).click();
    const connectionDialog = page.getByRole('dialog');
    await connectionDialog.getByLabel('名前', { exact: true }).fill('Local MCP fixture');
    await connectionDialog.getByLabel('このPCで接続を許可する').check();
    await connectionDialog.getByLabel('接続方式', { exact: true }).selectOption('stdio');
    await connectionDialog.getByLabel('実行ファイル', { exact: true }).fill(process.execPath);
    await connectionDialog
      .getByLabel('起動引数（JSON配列）', { exact: true })
      .fill(JSON.stringify([path.join(root, 'tests/fixtures/mcp-server.cjs')]));
    await connectionDialog.getByRole('button', { name: 'OK', exact: true }).click();
    await connectionDialog.waitFor({ state: 'hidden' });
    const mcpServerId = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'))
      .mcpServers.items[0].id;
    await page.getByLabel('確認するMCP接続先').selectOption(mcpServerId);
    await page.getByRole('button', { name: '接続してツールを取得', exact: true }).click();
    await page.getByLabel('MCPツール', { exact: true }).selectOption('echo');
    await page
      .getByLabel('MCPツールの引数', { exact: true })
      .fill(JSON.stringify({ message: 'local MCP works' }));
    await page.getByRole('button', { name: 'ツールを実行', exact: true }).click();
    await until(async () => {
      const button = page.getByRole('button', { name: '結果を表示', exact: true });
      if (!(await button.count())) return false;
      await button.first().click();
      return (await page.getByLabel('MCP実行結果', { exact: true }).innerText()).includes(
        'local MCP works',
      );
    }, 'local MCP execution');
    await page.screenshot({ path: path.join(profile, 'mcp-client-light.png') });
    checks.push(
      'MCP server OFF: common settings dialog registers a stdio server, discovers and runs a tool, displays its job result',
    );
    await page.evaluate(async (configFile) => {
      await window.dock.automation({ kind: 'selectConfig', file: configFile });
      await window.dock.automation({ kind: 'configure', enabled: true, allowWrite: true, port: 0 });
      await window.dock.automation({ kind: 'setExecution', allowed: true });
      await window.dock.automation({ kind: 'setCustomCommandManagement', allowed: true });
      await window.dock.automation({ kind: 'setShortcutEditing', allowed: true });
      await window.dock.automation({ kind: 'register' });
    }, configFile);
    await connect(state);
    const outer = JSON.stringify((await client.listTools()).tools);
    assert.equal(
      (await client.callTool({ name: 'appdock_mcp_list_servers', arguments: {} })).isError,
      true,
    );
    await page.evaluate(() => window.dock.automation({ kind: 'setMcpClient', allowed: true }));
    assert.equal((await call('appdock_mcp_list_servers')).items.length, 0);
    await page.getByRole('button', { name: 'Local MCP fixtureを編集', exact: true }).click();
    let relayDialog = page.getByRole('dialog');
    await relayDialog.getByLabel('MCPへ公開する', { exact: true }).check();
    await relayDialog
      .getByLabel('公開するツール名（1行1件）', { exact: true })
      .fill('echo\nimage\nfail\nschedule_off\nchange_catalog\nadded\ndelay');
    await relayDialog.getByRole('button', { name: 'OK', exact: true }).click();
    await relayDialog.waitFor({ state: 'hidden' });
    assert.equal((await call('appdock_mcp_list_servers')).items[0].id, mcpServerId);
    const hubJob = async (name, args = {}) => {
      const { tool } = await call('appdock_mcp_get_tool', { serverId: mcpServerId, name });
      const started = await call('appdock_mcp_call_tool', {
        serverId: mcpServerId,
        name,
        toolRevision: tool.toolRevision,
        requestId: randomUUID(),
        arguments: args,
      });
      return until(async () => {
        const reply = await client.callTool({
          name: 'appdock_mcp_get_job',
          arguments: { jobId: started.jobId },
        });
        return reply.structuredContent?.state !== 'running' && reply;
      }, 'hub job');
    };
    assert.equal(
      (await hubJob('echo', { message: 'relay' })).structuredContent.result.structuredContent
        .message,
      'relay',
    );
    const imageResult = await hubJob('image');
    assert.equal(imageResult.content[0].type, 'image');
    assert.equal(imageResult.structuredContent.result.content, undefined);
    assert.equal((await hubJob('fail')).isError, true);
    assert.equal(
      (
        await client.callTool({
          name: 'appdock_mcp_get_tool',
          arguments: { serverId: mcpServerId, name: 'unsupported' },
        })
      ).isError,
      true,
    );
    await hubJob('change_catalog');
    assert(
      (await call('appdock_mcp_list_tools', { serverId: mcpServerId, limit: 50 })).items.some(
        (t) => t.name === 'added',
      ),
    );
    assert.equal((await hubJob('added')).isError, undefined);
    assert.equal(JSON.stringify((await client.listTools()).tools), outer);
    checks.push(
      'MCP hub: explicit server/tool publication, same-connection discovery changes, native image content, downstream isError and private-tool rejection',
    );
    await page.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.host.theme = 'dark';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await page.setViewportSize({ width: 740, height: 760 });
    await page.getByRole('button', { name: 'Local MCP fixtureを編集', exact: true }).click();
    await checkDialogLayout(page.getByRole('dialog'));
    await page.screenshot({ path: path.join(profile, 'mcp-client-dialog-dark-narrow.png') });
    await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    const allTypes = (await call('appdock_list_custom_command_types')).items;
    assert(allTypes.some((t) => t.id === 'appdock.mcp.call' && t.owner.kind === 'host'));
    const types = allTypes.filter((t) => t.owner.kind === 'applet');
    assert.equal(types.length, 3);
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await page.getByRole('button', { name: 'カスタムコマンド', exact: true }).click();
    await page.getByRole('button', { name: 'コマンドを追加', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('種類', { exact: true }).selectOption('test.custom-node.echo');
    await dialog.getByLabel('名前', { exact: true }).fill('Saved Node');
    await dialog.getByLabel('メッセージ', { exact: true }).fill('fixed');
    await dialog.getByLabel('MCP・Appletの共通APIへ公開').check();
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    let list = await call('appdock_list_custom_commands');
    const node = list.items.find((i) => i.title === 'Saved Node');
    assert(node);
    for (const type of types.filter((t) => t.id !== 'test.custom-node.echo'))
      await update([
        {
          op: 'add',
          expectedTypeRevision: type.typeRevision,
          item: {
            id: randomUUID(),
            typeId: type.id,
            title: type.title,
            configVersion: 1,
            config: { message: 'fixed' },
            enabled: true,
            automation: true,
          },
        },
      ]);
    list = await call('appdock_list_custom_commands');
    assert.equal(list.items.length, 3);
    for (const item of list.items) {
      const result = await call('appdock_execute_command', { id: item.commandId });
      assert.equal(result.result.message, 'fixed');
      assert.equal(result.result.source, 'mcp');
      assert.equal(result.effectVerified, false);
    }
    assert.equal(JSON.stringify((await client.listTools()).tools), outer);
    checks.push(
      'same MCP connection: dynamic CRUD and Node/.NET/native executions without tool metadata change',
    );
    await page.getByRole('button', { name: 'Saved Nodeを編集', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('名前', { exact: true }).fill('Keep my input');
    await update([{ op: 'update', id: node.id, changes: { title: 'Concurrent title' } }]);
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await dialog.getByLabel('名前', { exact: true }).inputValue(), 'Keep my input');
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    const json = page.getByRole('textbox', { name: '設定JSON' });
    const projection = JSON.parse(await json.inputValue());
    projection.customCommands.items.find((i) => i.id === node.id).title = 'JSON title';
    await json.fill(JSON.stringify(projection, null, 2));
    await json.press('Tab');
    await until(
      async () =>
        (await call('appdock_get_custom_command', { id: node.id })).item.title === 'JSON title',
      'JSON save',
    );
    const forged = structuredClone(projection);
    forged.customCommands.items.find((i) => i.id === node.id).owner = { kind: 'host' };
    await json.fill(JSON.stringify(forged, null, 2));
    await json.press('Tab');
    await page.getByRole('alert').first().waitFor();
    assert.equal(
      (await call('appdock_get_custom_command', { id: node.id })).item.owner.kind,
      'applet',
    );
    await page.getByRole('button', { name: 'フォーム', exact: true }).click();
    checks.push(
      'dialog preserves conflicting input; page JSON uses CRUD validation and rejects owner spoofing',
    );
    const watchState = () =>
      JSON.parse(fs.readFileSync(path.join(profile, 'watch', 'clock-state.json'), 'utf8'));
    await until(() => watchState().visible === false, 'native Watch connected');
    await page.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.extensions['at365.watch'].settings.visible = true;
      s.settings.value.extensions['at365.watch'].settings.showSeconds = false;
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await until(
      () => watchState().visible && watchState().showSeconds === false,
      'native Watch display/save',
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8')).extensions[
        'at365.watch'
      ].settings.showSeconds,
      false,
    );
    const watchPid = watchState().processId;
    await page.evaluate(() => window.dock.toggleExtension('at365.watch', false));
    await until(() => {
      try {
        process.kill(watchPid, 0);
        return false;
      } catch {
        return true;
      }
    }, 'native Watch stopped');
    await page.evaluate(() => window.dock.toggleExtension('at365.watch', true));
    await until(
      () =>
        watchState().processId !== watchPid && watchState().visible && !watchState().showSeconds,
      'native Watch restored',
    );
    await page.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.extensions['at365.watch'].settings.visible = false;
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    checks.push(
      'existing native Watch Release build: connection, window display, shared save, stop and restart',
    );
    // Use the host's validated settings path to retain the exact stable command ID.
    await page.evaluate(async (command) => {
      const snapshot = await window.dock.snapshot();
      snapshot.settings.value.keybindings = [
        {
          id: 'custom-fixture',
          command,
          key: 'Ctrl+Alt+F6',
          enabled: true,
          when: { scope: 'app', appletIds: [] },
        },
      ];
      await window.dock.saveSettings(snapshot.settings.value, snapshot.settings.revision);
    }, node.commandId);
    await update([{ op: 'update', id: node.id, changes: { title: 'Renamed Node' } }]);
    assert.equal((await call('appdock_get_shortcuts')).bindings[0].command, node.commandId);
    const dispatched = await page.evaluate(() => window.dock.dispatchShortcut('Ctrl+Alt+F6'));
    assert.equal(dispatched.executed, 1);
    checks.push(
      'stable ID retained after rename; existing shortcut dispatcher executes custom command',
    );
    await page.getByRole('button', { name: 'Renamed Nodeを編集', exact: true }).waitFor();
    await page.getByRole('button', { name: 'コマンドを追加', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('種類', { exact: true }).selectOption('appdock.mcp.call');
    await dialog.getByLabel('名前', { exact: true }).fill('Saved MCP');
    await dialog.getByLabel('MCP接続先', { exact: true }).selectOption(mcpServerId);
    await dialog.getByRole('button', { name: 'ツールを取得', exact: true }).click();
    await dialog.getByLabel('MCPツール', { exact: true }).selectOption('schedule_off');
    await until(
      () => dialog.getByText('ツールの引数Schema', { exact: true }).isVisible(),
      'saved command tool detail',
    );
    await dialog.getByLabel('固定引数（JSON）', { exact: true }).fill('{bad');
    assert.equal(await dialog.getByRole('button', { name: 'OK', exact: true }).isEnabled(), false);
    await dialog.getByLabel('固定引数（JSON）', { exact: true }).fill('{"seconds":600}');
    await dialog.getByLabel('MCP・Appletの共通APIへ公開').check();
    await checkDialogLayout(dialog);
    await page.setViewportSize({ width: 740, height: 760 });
    await checkDialogLayout(dialog);
    await dialog.locator('.settings-dialog-body').evaluate((body) => (body.scrollTop = 0));
    await page.screenshot({ path: path.join(profile, 'mcp-command-dialog-dark-narrow.png') });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: path.join(profile, 'mcp-command-dialog.png') });
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const savedMcp = (await call('appdock_list_custom_commands')).items.find(
      (i) => i.title === 'Saved MCP',
    );
    assert(savedMcp);
    const savedJob = async () => {
      const accepted = await call('appdock_execute_command', { id: savedMcp.commandId });
      assert.equal(accepted.completion, 'handlerReturned');
      assert.equal(accepted.result.completion, 'accepted');
      return until(async () => {
        const j = await call('appdock_mcp_get_job', { jobId: accepted.result.jobId });
        return j.state !== 'running' && j;
      }, 'saved MCP job');
    };
    assert.equal((await savedJob()).result.structuredContent.scheduledSeconds, 600);
    const mcpType = (await call('appdock_get_custom_command_type', { typeId: 'appdock.mcp.call' }))
      .type;
    const mcpDefinition = (await call('appdock_get_custom_command', { id: savedMcp.id })).item;
    const apiItem = { ...mcpDefinition, id: randomUUID(), title: 'API MCP' };
    delete apiItem.owner;
    const beforeDryRun = fs.readFileSync(path.join(profile, 'settings.json'), 'utf8');
    await call('appdock_mcp_get_tool', { serverId: mcpServerId, name: 'schedule_off' });
    await call('appdock_execute_command', {
      id: 'appdock.customCommands.update',
      args: {
        expectedRevision: (await call('appdock_list_custom_commands')).revision,
        dryRun: true,
        operations: [{ op: 'add', item: apiItem, expectedTypeRevision: mcpType.typeRevision }],
      },
    });
    assert.equal(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'), beforeDryRun);
    await update([{ op: 'add', item: apiItem, expectedTypeRevision: mcpType.typeRevision }]);
    await update([{ op: 'remove', id: apiItem.id }]);
    const shortcuts = await call('appdock_get_shortcuts');
    await call('appdock_execute_command', {
      id: 'appdock.shortcuts.update',
      args: {
        expectedRevision: shortcuts.revision,
        operations: [
          {
            kind: 'add',
            binding: {
              id: 'mcp-fixture',
              command: savedMcp.commandId,
              key: 'Ctrl+Alt+F7',
              enabled: true,
              when: { scope: 'app', appletIds: [] },
            },
          },
        ],
      },
    });
    await update([{ op: 'update', id: savedMcp.id, changes: { title: 'Renamed MCP' } }]);
    assert.equal(
      (await page.evaluate(() => window.dock.dispatchShortcut('Ctrl+Alt+F7'))).executed,
      1,
    );
    await page.getByRole('button', { name: 'MCP接続先', exact: true }).click();
    await until(async () => {
      const buttons = page.getByRole('button', { name: '結果を表示', exact: true });
      if (!(await buttons.count())) return false;
      await buttons.first().click();
      const content = await page.getByLabel('MCP実行結果', { exact: true }).innerText();
      return content.includes('scheduledSeconds') && content.includes('600');
    }, 'shortcut MCP job result');
    await page.getByRole('button', { name: 'Local MCP fixtureを編集', exact: true }).click();
    relayDialog = page.getByRole('dialog');
    await relayDialog.getByLabel('MCPへ公開する', { exact: true }).uncheck();
    await relayDialog.getByRole('button', { name: 'OK', exact: true }).click();
    await relayDialog.waitFor({ state: 'hidden' });
    assert.equal(
      (
        await client.callTool({
          name: 'appdock_execute_command',
          arguments: { id: savedMcp.commandId },
        })
      ).isError,
      true,
    );
    await page.getByRole('button', { name: 'Local MCP fixtureを編集', exact: true }).click();
    relayDialog = page.getByRole('dialog');
    await relayDialog.getByLabel('MCPへ公開する', { exact: true }).check();
    await relayDialog.getByRole('button', { name: 'OK', exact: true }).click();
    await relayDialog.waitFor({ state: 'hidden' });
    assert.equal((await savedJob()).result.structuredContent.scheduledSeconds, 600);
    assert.equal(JSON.stringify((await client.listTools()).tools), outer);
    checks.push(
      'saved MCP command: common dialog, invalid JSON retention, API dry-run/create, stable shortcut, accepted job completion, publication boundary',
    );
    await page.getByRole('button', { name: 'カスタムコマンド', exact: true }).click();
    await page.screenshot({ path: path.join(profile, 'custom-commands-light.png') });
    await page.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.host.theme = 'dark';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await page.setViewportSize({ width: 740, height: 760 });
    await wait(200);
    await page.screenshot({ path: path.join(profile, 'custom-commands-dark-narrow.png') });
    const current = await call('appdock_get_custom_command', { id: node.id });
    await update([
      {
        op: 'update',
        id: node.id,
        changes: { config: { message: 'fixed', delay: 5000 } },
        expectedTypeRevision: current.typeRevision,
      },
    ]);
    const running = client.callTool({
      name: 'appdock_execute_command',
      arguments: { id: node.commandId },
    });
    await wait(200);
    await page.evaluate(() => window.dock.automation({ kind: 'setExecution', allowed: false }));
    const cancelled = await running;
    assert.equal(cancelled.isError, true);
    assert(['CANCELLED', 'OUTCOME_UNKNOWN'].includes(cancelled.structuredContent.code));
    await page.evaluate(() => window.dock.automation({ kind: 'setExecution', allowed: true }));
    await update([
      {
        op: 'update',
        id: node.id,
        changes: { config: { message: 'fixed' } },
        expectedTypeRevision: current.typeRevision,
      },
    ]);
    checks.push('permission revocation cancels in-flight provider and preserves outcome semantics');
    await page.evaluate(() => window.dock.toggleExtension('test.custom-node', false));
    await until(
      async () =>
        !(await call('appdock_list_commands')).commands.find((c) => c.id === node.commandId)
          .available,
      'unavailable',
    );
    assert.equal((await call('appdock_get_custom_command', { id: node.id })).item.id, node.id);
    await page.evaluate(() => window.dock.toggleExtension('test.custom-node', true));
    await until(
      async () =>
        (await call('appdock_list_commands')).commands.find((c) => c.id === node.commandId)
          .available,
      'rebound',
    );
    await client.close();
    client = null;
    await stop(state);
    state = await start();
    page = state.page;
    await connect(state);
    assert.equal((await call('appdock_list_custom_commands')).items.length, 4);
    assert.equal((await savedJob()).result.structuredContent.scheduledSeconds, 600);
    assert.equal(
      (await call('appdock_execute_command', { id: node.commandId })).result.message,
      'fixed',
    );
    checks.push(
      'stop/start rebinds provider; actual process restart restores definitions and command IDs',
    );
    await update([{ op: 'remove', id: node.id }]);
    assert(
      (await call('appdock_get_shortcuts')).bindings.some((b) => b.command === node.commandId),
    );
    assert(!(await call('appdock_list_commands')).commands.some((c) => c.id === node.commandId));
    checks.push('delete removes executable catalog entry while retaining shortcut references');
    await client.close();
    client = null;
    await stop(state);
    if (portable) assert.equal(hash(portable), portableHash);
    assert.deepEqual(fixtureHashes(path.join(profile, 'extensions')), fixtureInputs);
    const result = {
      ok: true,
      profile,
      portable,
      sha256: portableHash,
      fixtureMetadata,
      fixtureInputsUnchanged: true,
      checks,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    for (const state of states)
      if (state.browser) {
        await state.page
          .screenshot({ path: path.join(profile, 'last-screen.png') })
          .catch(() => {});
        await state.page
          .locator('body')
          .innerText()
          .then((text) => fs.writeFileSync(path.join(profile, 'last-screen.txt'), text))
          .catch(() => {});
      }
    await client?.close().catch(() => {});
    for (const state of states) await stop(state).catch(() => {});
  }
})().catch((e) => {
  fs.writeFileSync(path.join(profile, 'failure.txt'), String(e.stack));
  console.error(e);
  process.exitCode = 1;
});
