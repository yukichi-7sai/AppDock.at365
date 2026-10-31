const { settleSettings } = require('./settings-immediate-helper.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { parse } = require('smol-toml');
const http = require('node:http');
const root = path.resolve(__dirname, '..'),
  portable = process.argv[2] && path.resolve(process.argv[2]);
const profile = path.join(
  root,
  '.artifacts',
  `automation-${portable ? 'portable' : 'source'}-${Date.now()}`,
);
const checks = [],
  states = [];
fs.mkdirSync(profile, { recursive: true });
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.closeToTray = false;
settings.keybindings = [];
settings.keybindings.push({
  id: 'test-settings-switch',
  command: 'appdock.settings.closeToTray.toggle',
  key: 'Ctrl+Alt+F11',
  enabled: true,
  when: { scope: 'app', appletIds: [] },
});
settings.globalShortcutCommands = [];
settings.keybindings.push({
  id: 'test-applet-enable',
  command: 'appdock.applets.test.automation-provider.enable',
  key: 'Ctrl+Alt+F10',
  enabled: true,
  when: { scope: 'app', appletIds: [] },
});
settings.gestures.enabled = false;
const fixtureId = 'test.automation-provider';
const fixtureRoot = path.join(profile, 'extensions', 'automation-fixture');
fs.mkdirSync(fixtureRoot, { recursive: true });
const fixtureCommands = ['next', 'start', 'stop', 'prepare-background', 'web-api-probe'].map(
  (name) => ({
    id: `${fixtureId}.${name}`,
    title: name,
    automation: !['prepare-background', 'web-api-probe'].includes(name),
  }),
);
fs.writeFileSync(
  path.join(fixtureRoot, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: fixtureId,
    name: 'Automation command fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.cjs',
    commands: fixtureCommands,
    capabilities: ['settings', 'appdock-api'],
    settings: [
      {
        key: 'feature',
        title: 'Fixture feature',
        type: 'boolean',
        default: false,
        automation: true,
        generateCommands: ['on', 'off', 'toggle'],
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixtureRoot, 'index.cjs'),
  `
const fs=require('node:fs'),path=require('node:path');
exports.activate=async(context)=>{
 context.commands.register('test.automation-provider.web-api-probe','Web API probe',async()=>{
  const request=JSON.parse(fs.readFileSync(path.join(__dirname,'api-request.json'),'utf8'));let reply;
  try{reply={ok:true,value:await context.appdock.call(request.method,request.params)}}catch(e){reply={ok:false,code:e.code}}
  fs.writeFileSync(path.join(__dirname,'api-reply.json'),JSON.stringify(reply));
 });
 fs.appendFileSync(path.join(__dirname,'activations.txt'),process.pid+'\\n');
 context.tray.add('Fixture feature toggle','test.automation-provider.settings.feature.toggle');
 context.settings.onChanged(()=>fs.writeFileSync(path.join(__dirname,'observed.json'),JSON.stringify({feature:context.settings.get('feature',false)})));
 for(const name of ['next','start','stop','prepare-background']) context.commands.register('test.automation-provider.'+name,name,async()=>{
  if(name==='stop') throw Error('SECRET_COMMAND_FAILURE');
  const file=path.join(__dirname,'calls.json');
  const calls=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];
  calls.push(name);fs.writeFileSync(file,JSON.stringify(calls));
  return {secret:'SECRET_COMMAND_RESULT'};
 });
};
`,
);
settings.extensions[fixtureId] = { enabled: true, settings: {} };
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
const local = path.join(profile, 'local'),
  configFile = path.join(profile, 'codex', 'config.toml');
fs.mkdirSync(path.dirname(configFile), { recursive: true });
const original = '# Existing configuration must survive\npersonality = "friendly"\n';
fs.writeFileSync(configFile, original);
const portableHash = portable ? hash(portable) : undefined;
if (portable) require('./copy-host.cjs').copyHost(portable, path.join(profile, 'AppDock.at365.exe'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await wait(100);
  }
  throw Error(label);
}
async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
async function start() {
  const port = await freePort(),
    env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    portable ? path.join(profile, 'AppDock.at365.exe') : require('electron'),
    [
      ...(portable ? [] : [root]),
      `--test-profile=${profile}`,
      `--test-local-state=${local}`,
      `--remote-debugging-port=${port}`,
    ],
    { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
  );
  const state = { child };
  states.push(state);
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
    'host page',
  );
  state.page = require('./settings-aware-page.cjs').settingsAwarePage(state.page);
  state.page.setDefaultTimeout(15000);
  await until(
    () =>
      state.page.evaluate(
        async () =>
          (await window.dock?.snapshot())?.startupReady &&
          (await window.dock.automation({ kind: 'status' })).state,
      ),
    'host and automation ready',
  );
  return state;
}
async function stop(state) {
  if (!state.browser) return;
  await state.page.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
  await until(() => state.child.exitCode !== null, 'quit');
  await state.browser.close();
  state.browser = null;
}
async function connect(state) {
  const s = await state.page.evaluate(
    async () => (await window.dock.automation({ kind: 'status' })).state,
  );
  const headers = parse(fs.readFileSync(configFile, 'utf8')).mcp_servers[s.serverId].http_headers;
  const client = new Client({ name: 'AppDock GUI regression', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(s.endpoint), { requestInit: { headers } }),
  );
  return client;
}
async function call(client, name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw Error(JSON.stringify(r.structuredContent));
  return r.structuredContent;
}
async function patch(client, changes) {
  const s = await call(client, 'appdock_get_settings');
  return call(client, 'appdock_execute_command', {
    id: 'appdock.settings.update',
    args: { changes, expectedRevision: s.revision },
  });
}
let client;
let webVisits = 0;
const webServer = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(
    '<h1>Automation Web fixture</h1><a href="/second">Next</a><p id="visit">' +
      ++webVisits +
      '</p>',
  );
});
const webId = 'web.11111111-2222-3333-4444-555555555555';
(async () => {
  try {
    await new Promise((r) => webServer.listen(0, '127.0.0.1', r));
    let s = await start(),
      page = s.page;
    const account = await page.evaluate(() => window.dock.createWebAccount('Automation fixture'));
    await page.evaluate(
      async ({ webId, account, port }) => {
        const snap = await window.dock.snapshot();
        snap.settings.value.webApplets.items.push({
          id: webId,
          name: 'Automation Web fixture',
          url: `http://127.0.0.1:${port}/`,
          accountId: account.id,
          enabled: true,
          display: 'page',
          navigation: 'same-origin',
          allowedOrigins: [],
          icon: '',
        });
        await window.dock.saveSettings(snap.settings.value, snap.settings.revision);
      },
      { webId, account, port: webServer.address().port },
    );
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await page.getByRole('button', { name: 'MCPサーバー', exact: true }).click();
    const section = page.getByRole('region', { name: 'MCP・Codex連携' });
    const openDetails = async () => {
      const currentSection = page.getByRole('region', { name: 'MCP・Codex連携' });
      if (!(await currentSection.locator('details').evaluate((e) => e.open)))
        await currentSection.locator('summary').click();
    };
    await openDetails();
    async function togglePermission(name) {
      await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
      await page.getByRole('button', { name: '操作の許可', exact: true }).click();
      const control = page
        .getByRole('region', { name: '操作の許可', exact: true })
        .getByRole('switch', { name, exact: true });
      try {
        await until(() => control.isEnabled(), 'permission state loaded');
      } catch (e) {
        for (const p of page
          .context()
          .pages()
          .filter((p) => p.url().startsWith('appdock://host/'))) {
          console.error(
            'PERMISSION-DIAGNOSTIC',
            await p
              .evaluate(() => ({
                alerts: [...document.querySelectorAll('[role=alert]')].map((e) => e.textContent),
                switches: [...document.querySelectorAll('[role=switch]')].map((e) => ({
                  label: e.getAttribute('aria-label'),
                  disabled: e.disabled,
                })),
              }))
              .catch(() => null),
          );
        }
        throw e;
      }
      const next = !(await control.isChecked());
      await control.click();
      await until(
        async () => (await control.isChecked()) === next && (await control.isEnabled()),
        'permission saved',
      );
      await page.getByRole('button', { name: 'MCPサーバー', exact: true }).click();
    }
    await section.getByRole('textbox', { name: 'Codexの設定ファイル' }).fill(configFile);
    await section.getByRole('button', { name: '設定先を変更', exact: true }).click();
    await until(
      async () =>
        (await page.evaluate(async () => (await window.dock.automation({ kind: 'status' })).state))
          .configFile === configFile,
      'config selection',
    );
    await section.getByRole('switch', { name: 'Codex連携を有効にする' }).click();
    await openDetails();
    await section
      .getByRole('textbox', { name: 'Codexへの登録名', exact: true })
      .fill('AppDock_Test');
    await section.getByRole('button', { name: '登録名を保存', exact: true }).click();
    await until(
      async () =>
        (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state.serverId ===
        'AppDock_Test',
      'custom name saved',
    );
    await section.getByRole('button', { name: /^(Codexへ登録|登録を修復)$/ }).click();
    await until(
      () => parse(fs.readFileSync(configFile, 'utf8')).mcp_servers?.AppDock_Test,
      'custom registration',
    );
    await section.getByRole('button', { name: '登録を解除', exact: true }).click();
    await until(() => fs.readFileSync(configFile, 'utf8') === original, 'custom unregister');
    await section.getByRole('textbox', { name: 'Codexへの登録名', exact: true }).fill('AppDock');
    await section.getByRole('button', { name: '登録名を保存', exact: true }).click();
    await until(
      async () =>
        (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state.serverId ===
        'AppDock',
      'default name saved',
    );
    await openDetails();
    checks.push('custom short name registers/unregisters via GUI; default AppDock restored');
    await section.getByRole('button', { name: /^(Codexへ登録|登録を修復)$/ }).click();
    await until(
      () => fs.readFileSync(configFile, 'utf8').includes('BEGIN AppDock MCP'),
      'registration',
    );
    assert.ok(fs.readFileSync(configFile, 'utf8').startsWith(original));
    assert.deepEqual(Object.keys(parse(fs.readFileSync(configFile, 'utf8')).mcp_servers), [
      'AppDock',
    ]);
    await section.getByRole('button', { name: 'このPC内の接続テスト', exact: true }).click();
    await until(
      async () => (await section.innerText()).includes('AppDock内の疎通に成功'),
      'self test',
    );
    assert.equal(
      (await page.evaluate(async () => (await window.dock.automation({ kind: 'status' })).state))
        .lastClientAt,
      undefined,
    );
    client = await connect(s);
    assert.equal((await client.listTools()).tools.length, 22);
    assert.equal(
      (await call(client, 'appdock_get_info')).version,
      require('../package.json').version,
    );
    checks.push(
      'GUI register and self test; real SDK initialize/list/read; unrelated TOML retained',
    );
    await require('./automation-network-checks.cjs')({
      page,
      section,
      client,
      configFile,
      profile,
      checks,
      until,
    });
    await client.close();
    client = await connect(s);
    const registeredBytes = fs.readFileSync(configFile, 'utf8');
    const markerId = registeredBytes.match(/^# BEGIN AppDock MCP (appdock_[a-f0-9]{16})$/m)[1];
    fs.writeFileSync(configFile, original + '# END AppDock MCP ' + markerId + '\n');
    assert.equal(
      (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state.registration,
      'absent',
    );
    await section.getByRole('button', { name: /^(Codexへ登録|登録を修復)$/, exact: true }).click();
    await until(
      () => fs.readFileSync(configFile, 'utf8') === registeredBytes,
      'GUI repair after external uninstall',
    );
    fs.writeFileSync(configFile, original + '# BEGIN AppDock MCP ' + markerId + '\n');
    await section.getByRole('button', { name: '登録を解除', exact: true }).click();
    await until(() => fs.readFileSync(configFile, 'utf8') === original, 'GUI orphan unregister');
    await section.getByRole('button', { name: /^(Codexへ登録|登録を修復)$/, exact: true }).click();
    await until(
      () => fs.readFileSync(configFile, 'utf8') === registeredBytes,
      'GUI re-register after orphan cleanup',
    );
    checks.push(
      'external uninstall orphan END repaired through GUI; orphan BEGIN unregistered; unrelated TOML retained',
    );

    await until(
      async () =>
        (await call(client, 'appdock_get_applet', { id: fixtureId })).applet.state === 'running',
      'fixture running',
    );
    const catalog = await call(client, 'appdock_list_commands');
    assert(
      (await page.evaluate(() => window.dock.snapshot())).extensions
        .find((e) => e.id === fixtureId)
        .tray.some((t) => t.command === `${fixtureId}.settings.feature.toggle`),
    );
    assert.ok(catalog.commands.some((c) => c.id === `${fixtureId}.next` && c.available));
    assert.ok(
      !catalog.commands.some((c) => c.id === 'appdock.quit' || c.id.endsWith('prepare-background')),
    );
    assert.equal(
      (
        await client.callTool({
          name: 'appdock_execute_command',
          arguments: { id: `${fixtureId}.next` },
        })
      ).structuredContent.code,
      'EXECUTION_DISABLED',
    );
    assert.equal(fs.existsSync(path.join(fixtureRoot, 'calls.json')), false);
    await togglePermission('Codexからのコマンド実行を許可する');
    await until(
      async () => (await call(client, 'appdock_get_info')).executable,
      'command permission',
    );
    const executed = await call(client, 'appdock_execute_command', { id: `${fixtureId}.next` });
    assert.equal(executed.completion, 'handlerReturned');
    assert.equal(executed.effectVerified, false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'calls.json'))), ['next']);
    assert.ok(!JSON.stringify(executed).includes('SECRET_COMMAND_RESULT'));
    const lifecycleId = (id, op) => `appdock.applets.${id}.${op}`;
    const manage = (id, op) => call(client, 'appdock_execute_command', { id: lifecycleId(id, op) });
    assert.equal((await call(client, 'appdock_get_info')).appletManagementAllowed, false);
    assert.equal(
      (
        await client.callTool({
          name: 'appdock_execute_command',
          arguments: { id: lifecycleId(fixtureId, 'disable') },
        })
      ).structuredContent.code,
      'APPLET_MANAGEMENT_DISABLED',
    );
    await togglePermission('CodexからのApplet管理を許可する');
    await until(
      async () => (await call(client, 'appdock_get_info')).appletManagementAllowed,
      'management permission',
    );
    assert.equal((await call(client, 'appdock_get_info')).writable, false);
    const activationFile = path.join(fixtureRoot, 'activations.txt');
    const beforeRestart = fs.readFileSync(activationFile, 'utf8');
    const settingsBeforeRestart = fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), 'utf8');
    assert.equal((await manage(fixtureId, 'restart')).completion, 'lifecycleApplied');
    assert.notEqual(fs.readFileSync(activationFile, 'utf8'), beforeRestart);
    assert.equal(
      fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), 'utf8'),
      settingsBeforeRestart,
    );
    await manage(fixtureId, 'disable');
    assert.equal(
      JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'))).extensions[fixtureId]
        .enabled,
      false,
    );
    const stoppedActivations = fs.readFileSync(activationFile, 'utf8');
    assert.equal(
      (
        await client.callTool({
          name: 'appdock_execute_command',
          arguments: { id: lifecycleId(fixtureId, 'restart') },
        })
      ).structuredContent.code,
      'UNAVAILABLE',
    );
    assert.equal(fs.readFileSync(activationFile, 'utf8'), stoppedActivations);
    // Local commands share the service but do not depend on external permissions.
    await togglePermission('CodexからのApplet管理を許可する');
    await until(
      async () => !(await call(client, 'appdock_get_info')).appletManagementAllowed,
      'management revoked',
    );
    assert.equal(
      (
        await client.callTool({
          name: 'appdock_execute_command',
          arguments: { id: lifecycleId(fixtureId, 'enable') },
        })
      ).structuredContent.code,
      'APPLET_MANAGEMENT_DISABLED',
    );
    await call(client, 'appdock_execute_command', { id: 'appdock.open' });
    await page.bringToFront();
    await call(client, 'appdock_execute_command', { id: 'appdock.commands.search' });
    const palettePage = await require('./shell-overlay-helper.cjs').overlayPage(page);
    const managementPalette = palettePage.getByRole('dialog', { name: 'コマンドパレット' });
    await managementPalette
      .getByRole('combobox', { name: 'コマンドを検索' })
      .fill(lifecycleId(fixtureId, 'enable'));
    await until(
      () => managementPalette.locator('.palette-execute').isEnabled(),
      'management command available in palette',
    );
    await require('./shell-overlay-helper.cjs').closingAction(palettePage.keyboard.press('Escape'));
    await until(
      async () => !(await page.evaluate(() => window.dock.snapshot())).overlay.active,
      'palette closed',
    );
    await page.keyboard.press('Control+Alt+F10');
    await until(
      async () =>
        (await call(client, 'appdock_get_applet', { id: fixtureId })).applet.state === 'running',
      'local management keyboard enables disabled Applet',
    );
    await togglePermission('CodexからのApplet管理を許可する');
    await until(
      async () => (await call(client, 'appdock_get_info')).appletManagementAllowed,
      'management restored',
    );
    await manage(webId, 'disable');
    assert.equal(
      JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'))).webApplets.items.find(
        (a) => a.id === webId,
      ).enabled,
      false,
    );
    assert.equal(
      (
        await client.callTool({
          name: 'appdock_execute_command',
          arguments: { id: lifecycleId(webId, 'restart') },
        })
      ).structuredContent.code,
      'UNAVAILABLE',
    );
    await manage(webId, 'enable');
    await manage(webId, 'restart');
    for (const id of ['appdock.applets.open', 'appdock.logs.open', 'appdock.updates.open']) {
      assert.equal((await call(client, 'appdock_execute_command', { id })).completion, 'accepted');
      if (id === 'appdock.applets.open')
        await page.locator('main.applet-detail-main').waitFor({ state: 'visible' });
      if (id === 'appdock.logs.open')
        await page.getByRole('textbox', { name: 'ログを検索' }).waitFor({ state: 'visible' });
      if (id === 'appdock.updates.open')
        await page
          .getByRole('region', { name: 'AppDockについて' })
          .waitFor({ state: 'visible' });
    }
    await call(client, 'appdock_execute_command', { id: 'appdock.settings.open' });
    await page.getByRole('button', { name: 'MCPサーバー', exact: true }).click();
    await section.waitFor({ state: 'visible' });
    checks.push(
      'separate management permission default deny/revocation; persisted enable/disable; real Node restart without save; disabled restart rejected; local command bypasses external grant; WebApplet lifecycle; three host navigation commands',
    );
    assert.equal(
      (
        await client.callTool({
          name: 'appdock_execute_command',
          arguments: { id: `${fixtureId}.stop` },
        })
      ).structuredContent.code,
      'COMMAND_FAILED',
    );
    await call(client, 'appdock_execute_command', { id: `${webId}.open` });
    await until(
      () =>
        s.browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url() === `http://127.0.0.1:${webServer.address().port}/`),
      'web opened',
    );
    await call(client, 'appdock_execute_command', { id: 'appdock.settings.open' });
    await section.waitFor({ state: 'visible' });
    const logs = (await page.evaluate(() => window.dock.snapshot())).logs.filter(
      (l) => l.source === 'automation',
    );
    assert.ok(
      logs.some(
        (l) =>
          l.message.includes('API=commands.execute') &&
          l.message.includes(`target=${fixtureId}.next`) &&
          l.message.includes('result=success'),
      ),
    );
    assert.ok(logs.some((l) => l.message.includes('code=COMMAND_FAILED')));
    assert.ok(
      logs.some(
        (l) => l.message.includes('API=applets.get') && l.message.includes('result=success'),
      ),
    );
    assert.ok(!JSON.stringify(logs).includes('SECRET_'));
    const persisted = fs.readFileSync(path.join(local, 'logs', 'host.log'), 'utf8');
    assert.ok(persisted.includes('API=commands.execute'));
    const shell = await until(
      () =>
        s.browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().includes('/shells/default/index.html')),
      'Default Shell',
    );
    await shell.getByRole('button', { name: 'ログ', exact: true }).click();
    await page.getByRole('combobox', { name: 'ログのApplet' }).selectOption('automation');
    await page.getByRole('textbox', { name: 'ログを検索' }).fill('API=commands.execute');
    await page
      .getByText(/result=success/)
      .first()
      .waitFor();
    await page.screenshot({ path: path.join(profile, 'api-audit-log.png') });
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await page.getByRole('button', { name: 'MCPサーバー', exact: true }).click();
    checks.push(
      'explicit execution permission; real fixture command and WebApplet open; API outcomes in log UI and host.log without secret values',
    );
    await togglePermission('Codexからの設定変更を許可する');
    await until(
      async () =>
        (await page.evaluate(async () => (await window.dock.automation({ kind: 'status' })).state))
          .allowWrite,
      'allow write',
    );
    await patch(client, { theme: 'light' });
    await until(
      async () =>
        (await page.evaluate(() => window.dock.snapshot())).settings.value.host.theme === 'light',
      'patch reflected',
    );
    checks.push('MCP settings write, runtime snapshot and disk');
    await require('./automation-web-checks.cjs')({
      page,
      browser: s.browser,
      client,
      call,
      until,
      togglePermission,
      profile,
      fixtureId,
      fixtureRoot,
      webId,
      url: `http://127.0.0.1:${webServer.address().port}/`,
    });
    checks.push(
      'WebApplet five public commands, real page history/reload/home, safe settings via MCP and Node SDK, independent grants, dry run, forbidden fields and persistence',
    );
    const readShortcuts = () => call(client, 'appdock_get_shortcuts');
    const editShortcuts = async (operations, extra = {}) =>
      call(client, 'appdock_execute_command', {
        id: 'appdock.shortcuts.update',
        args: { expectedRevision: (await readShortcuts()).revision, operations, ...extra },
      });
    const shortcutBefore = await readShortcuts();
    assert.equal(shortcutBefore.shortcutEditingAllowed, false);
    const additions = ['next', 'start'].map((name, i) => ({
      kind: 'add',
      binding: {
        id: `mcp-shortcut-${i}`,
        command: `${fixtureId}.${name}`,
        key: 'Ctrl+Alt+F9',
        enabled: true,
        when: { scope: 'app', appletIds: [] },
      },
    }));
    assert.equal(
      (
        await client.callTool({
          name: 'appdock_execute_command',
          arguments: {
            id: 'appdock.shortcuts.update',
            args: { expectedRevision: shortcutBefore.revision, operations: additions },
          },
        })
      ).structuredContent.code,
      'SHORTCUT_EDITING_DISABLED',
    );
    await togglePermission('Codexからのショートカット編集を許可する');
    await until(
      async () => (await readShortcuts()).shortcutEditingAllowed,
      'shortcut editing grant',
    );
    const settingsBytes = fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), 'utf8');
    assert.equal((await editShortcuts(additions, { dryRun: true })).completion, 'validated');
    assert.equal(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), 'utf8'), settingsBytes);
    await editShortcuts(additions);
    await page.getByRole('button', { name: 'ショートカットキー', exact: true }).click();
    const shortcutSearch = page.getByRole('searchbox', {
      name: 'ショートカットキーのコマンドを検索',
    });
    await shortcutSearch.fill(`${fixtureId}.next`);
    await page
      .locator('.shortcuts-editor')
      .getByText('Ctrl+Alt+F9', { exact: true })
      .first()
      .waitFor();
    await page.screenshot({ path: path.join(profile, 'mcp-shortcut-created.png') });
    await shortcutSearch.fill('');
    await page.getByRole('button', { name: 'MCPサーバー', exact: true }).click();
    const callsFile = path.join(fixtureRoot, 'calls.json');
    const beforeKeys = JSON.parse(fs.readFileSync(callsFile)).length;
    await page.keyboard.press('Control+Alt+F9');
    await until(
      () => JSON.parse(fs.readFileSync(callsFile)).length === beforeKeys + 2,
      'MCP shortcut executes two commands',
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(callsFile)).slice(beforeKeys), ['next', 'start']);
    await editShortcuts([
      { kind: 'reorder', key: 'Ctrl+Alt+F9', ids: ['mcp-shortcut-1', 'mcp-shortcut-0'] },
    ]);
    await page.keyboard.press('Control+Alt+F9');
    await until(
      () => JSON.parse(fs.readFileSync(callsFile)).length === beforeKeys + 4,
      'MCP reorder applied',
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(callsFile)).slice(beforeKeys + 2), [
      'start',
      'next',
    ]);
    await editShortcuts([
      {
        kind: 'update',
        id: 'mcp-shortcut-0',
        changes: { key: 'Ctrl+Alt+F8', when: { scope: 'global', appletIds: [] } },
      },
    ]);
    const osStatus = await until(
      async () =>
        (await readShortcuts()).globalHotKeys.find(
          (s) => s.commandId === `${fixtureId}.next` && s.shortcut === 'Ctrl+Alt+F8',
        ),
      'OS registration status',
    );
    assert.equal(typeof osStatus.registered, 'boolean');
    await editShortcuts([{ kind: 'update', id: 'mcp-shortcut-0', changes: { enabled: false } }]);
    await until(
      async () =>
        !(await readShortcuts()).globalHotKeys.some((s) => s.commandId === `${fixtureId}.next`),
      'OS registration removed',
    );
    await togglePermission('Codexからのショートカット編集を許可する');
    await until(
      async () => !(await readShortcuts()).shortcutEditingAllowed,
      'shortcut editing revoked',
    );
    assert.equal(
      (
        await client.callTool({
          name: 'appdock_execute_command',
          arguments: {
            id: 'appdock.shortcuts.update',
            args: {
              expectedRevision: (await readShortcuts()).revision,
              operations: [{ kind: 'remove', id: 'mcp-shortcut-0' }],
            },
          },
        })
      ).structuredContent.code,
      'SHORTCUT_EDITING_DISABLED',
    );
    await togglePermission('Codexからのショートカット編集を許可する');
    await until(
      async () => (await readShortcuts()).shortcutEditingAllowed,
      'shortcut editing regranted',
    );
    await editShortcuts([
      { kind: 'remove', id: 'mcp-shortcut-0' },
      { kind: 'remove', id: 'mcp-shortcut-1' },
      {
        kind: 'add',
        binding: {
          id: 'mcp-persistent',
          command: 'appdock.open',
          key: 'Ctrl+Alt+F9',
          enabled: false,
          when: { scope: 'app', appletIds: [] },
        },
      },
    ]);
    const shortcutLogs = (await page.evaluate(() => window.dock.snapshot())).logs.filter(
      (l) => l.source === 'automation',
    );
    assert.ok(
      shortcutLogs.some(
        (l) =>
          l.message.includes('target=appdock.shortcuts.update') &&
          l.message.includes('result=success'),
      ),
    );
    assert.ok(shortcutLogs.some((l) => l.message.includes('API=shortcuts.get')));
    assert.ok(!JSON.stringify(shortcutLogs).includes('mcp-shortcut-0'));
    checks.push(
      `shortcut API dry run/add/change/remove/order, GUI reflection and real keyboard order, OS registration result=${osStatus.registered}, revocation and scoped audit`,
    );
    await require('./automation-gesture-checks.cjs')({
      page,
      client,
      call,
      until,
      togglePermission,
      profile,
      fixtureId,
    });
    checks.push(
      'gesture API add/update/remove/reorder/configure/dry run, GUI reflection, revocation, atomic validation and audit',
    );
    await require('./automation-ribbon-checks.cjs')({
      page,
      shell: await until(
        () =>
          s.browser
            .contexts()
            .flatMap((c) => c.pages())
            .find((p) => p.url().includes('/shells/default/index.html')),
        'Default Shell',
      ),
      client,
      call,
      until,
      togglePermission,
      profile,
      webId,
      manage,
    });
    checks.push(
      'ribbon API dry run, placement/order/visibility/separators/reset, GUI roundtrip, disabled Applet preservation, revocation, atomic validation and audit',
    );
    await require('./automation-tray-checks.cjs')({
      page,
      client,
      call,
      until,
      togglePermission,
      profile,
      fixtureId,
      fixtureRoot,
    });
    checks.push(
      'tray menu/click API dry run, GUI roundtrip, move/reorder/ungroup, atomic validation, private assignment rejection, revocation and audit without command execution',
    );
    const fixtureSettings = await call(client, 'appdock_get_settings', { appletId: fixtureId });
    assert.equal(fixtureSettings.values.feature, false);
    await call(client, 'appdock_execute_command', { id: `${fixtureId}.settings.feature.on` });
    await until(
      () =>
        fs.existsSync(path.join(fixtureRoot, 'observed.json')) &&
        JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'observed.json'))).feature === true,
      'Applet settingsChanged observed',
    );
    await page.evaluate(
      (id) => window.dock.executeCommand(id),
      `${fixtureId}.settings.feature.toggle`,
    );
    await until(
      () => JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'observed.json'))).feature === false,
      'local generated command observed',
    );
    await page.getByRole('button', { name: 'ショートカットキー', exact: true }).click();
    await page
      .getByRole('searchbox', { name: 'ショートカットキーのコマンドを検索' })
      .fill('appdock.settings.closeToTray.toggle');
    await page.getByText('appdock.settings.closeToTray.toggle', { exact: true }).first().waitFor();
    await page.getByRole('searchbox', { name: 'ショートカットキーのコマンドを検索' }).fill('');
    await page
      .getByRole('searchbox', { name: 'ショートカットキーのコマンドを検索' })
      .fill(lifecycleId(fixtureId, 'enable'));
    await page.getByText(lifecycleId(fixtureId, 'enable'), { exact: true }).first().waitFor();
    await page.getByRole('searchbox', { name: 'ショートカットキーのコマンドを検索' }).fill('');
    await page.getByRole('button', { name: 'MCPサーバー', exact: true }).click();
    await page.keyboard.press('Control+Alt+F11');
    await until(
      async () => (await call(client, 'appdock_get_settings')).values.closeToTray === true,
      'generated host keyboard command',
    );
    await page.keyboard.press('Control+Alt+F11');
    await until(
      async () => (await call(client, 'appdock_get_settings')).values.closeToTray === false,
      'generated host keyboard restore',
    );
    checks.push(
      'manifest settings generate discoverable MCP/local commands and shortcut rows; keyboard toggle persists; Applet settingsChanged observes updates',
    );
    if (process.env.APPDOCK_TEST_CODEX_EXE) {
      const state = (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state;
      await require('./automation-codex-check.cjs')({
        executable: process.env.APPDOCK_TEST_CODEX_EXE,
        configFile,
        server: state.serverId,
        output: profile,
      });
      checks.push(
        'installed Codex discovers and calls MCP tools with isolated config, without model inference',
      );
    }
    await page.getByRole('button', { name: '表示', exact: true }).click();
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    const json = page.getByRole('textbox', { name: '設定JSON' });
    const draft = JSON.parse(await json.inputValue());
    draft.host.closeToTray = false;
    await json.fill(JSON.stringify(draft, null, 2));
    await page.getByRole('button', { name: 'MCPサーバー', exact: true }).click();
    await editShortcuts([
      { kind: 'update', id: 'mcp-persistent', changes: { key: 'Ctrl+Alt+F8' } },
    ]);
    await call(client, 'appdock_execute_command', {
      id: 'appdock.ribbon.update',
      args: {
        expectedRevision: (await call(client, 'appdock_get_ribbon')).revision,
        operations: [{ kind: 'update', id: 'image-library', changes: { placement: 'bottom' } }],
      },
    });
    await call(client, 'appdock_execute_command', {
      id: 'appdock.tray.update',
      args: {
        expectedRevision: (await call(client, 'appdock_get_tray')).revision,
        operations: [{ kind: 'configure', changes: { doubleClickCommand: null } }],
      },
    });
    await settleSettings(page);
    await page.getByRole('button', { name: '表示', exact: true }).click();
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    assert.equal(
      JSON.parse(await json.inputValue()).host.theme,
      (await page.evaluate(() => window.dock.snapshot())).settings.value.host.theme,
    );
    assert.equal((await call(client, 'appdock_get_tray')).clicks.doubleClickCommand, null);
    assert.equal(
      (await call(client, 'appdock_get_ribbon')).layout.bottom.includes('image-library'),
      true,
    );
    await page.getByRole('button', { name: 'フォーム', exact: true }).click();
    await page.getByRole('button', { name: 'MCPサーバー', exact: true }).click();
    checks.push('immediate GUI settings and subsequent MCP updates converge to persisted state');
    const closeError = page.getByRole('button', { name: 'エラーを閉じる' });
    if (await closeError.isVisible()) await closeError.click();
    for (const theme of ['dark', 'light']) {
      await patch(client, { theme });
      for (const width of [1280, 960, 700]) {
        await page.setViewportSize({ width, height: 900 });
        await wait(180);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          true,
        );
        await page.screenshot({ path: path.join(profile, `codex-${theme}-${width}.png`) });
        await page.getByText('登録先や接続の詳細', { exact: true }).click();
        await page
          .getByRole('button', { name: '認証情報を再発行', exact: true })
          .scrollIntoViewIfNeeded();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          true,
        );
        await page.screenshot({ path: path.join(profile, `codex-details-${theme}-${width}.png`) });
        await page.getByText('登録先や接続の詳細', { exact: true }).click();
        await page.locator('.settings-body').evaluate((el) => {
          el.scrollTop = 0;
        });
      }
    }
    checks.push('both themes at 1280/960/700 without horizontal overflow');
    const before = await call(client, 'appdock_get_settings');
    const persistedTray = await call(client, 'appdock_get_tray');
    const persistedRibbon = await call(client, 'appdock_get_ribbon');
    const persistedGestures = await call(client, 'appdock_get_gestures');
    const persistedShortcuts = (await readShortcuts()).bindings;
    await manage(fixtureId, 'disable');
    await manage(webId, 'disable');
    await client.close();
    client = null;
    await stop(s);
    s = await start();
    page = s.page;
    assert.equal(
      (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state
        .allowManageApplets,
      true,
    );
    assert.equal(
      (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state.allowExecute,
      true,
    );
    client = await connect(s);
    for (const id of [fixtureId, webId])
      assert.equal((await call(client, 'appdock_get_applet', { id })).applet.enabled, false);
    assert.deepEqual(
      (await call(client, 'appdock_get_gestures')).settings,
      persistedGestures.settings,
    );
    assert.equal((await call(client, 'appdock_get_gestures')).gestureEditingAllowed, true);
    assert.deepEqual((await call(client, 'appdock_get_ribbon')).layout, persistedRibbon.layout);
    assert.equal((await call(client, 'appdock_get_ribbon')).ribbonEditingAllowed, true);
    const restoredTray = await call(client, 'appdock_get_tray');
    assert.deepEqual(restoredTray.menu, persistedTray.menu);
    assert.deepEqual(restoredTray.clicks, persistedTray.clicks);
    assert.equal(restoredTray.trayEditingAllowed, true);
    const restoredShell = await until(
      () =>
        s.browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().includes('/shells/default/index.html')),
      'restored Default Shell',
    );
    await restoredShell
      .locator('.ribbon-bottom [data-ribbon-id="separator:mcp-persistent"]')
      .waitFor();
    assert.deepEqual((await readShortcuts()).bindings, persistedShortcuts);
    assert.equal((await readShortcuts()).shortcutEditingAllowed, true);
    const after = await call(client, 'appdock_get_settings');
    assert.deepEqual(after.values, before.values);
    assert.notEqual(after.revision, before.revision);
    assert.equal(
      (
        await client.callTool({
          name: 'appdock_execute_command',
          arguments: {
            id: 'appdock.settings.update',
            args: { changes: { theme: 'dark' }, expectedRevision: before.revision },
          },
        })
      ).structuredContent.code,
      'REVISION_CONFLICT',
    );
    checks.push(
      'real process restart retains settings/endpoint/registration and invalidates old revision',
    );
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await page.getByRole('button', { name: 'MCPサーバー', exact: true }).click();
    await openDetails();
    await page.getByRole('button', { name: '登録を解除', exact: true }).click();
    await until(() => fs.readFileSync(configFile, 'utf8') === original, 'unregister');
    await page.getByRole('switch', { name: 'Codex連携を有効にする' }).click();
    await until(
      async () =>
        (await page.evaluate(async () => (await window.dock.automation({ kind: 'status' })).state))
          .running === false,
      'disable',
    );
    checks.push('GUI unregister preserves original TOML; disable closes endpoint');
    await client.close();
    client = null;
    await stop(s);
    if (portable) assert.equal(hash(portable), portableHash);
    const result = { ok: true, checks, profile, portable, sha256: portableHash };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client?.close().catch(() => {});
    for (const s of states) await stop(s).catch(() => {});
    webServer.closeAllConnections();
    await new Promise((r) => webServer.close(r));
  }
})().catch((e) => {
  fs.writeFileSync(path.join(profile, 'failure.txt'), String(e.stack));
  console.error(e);
  process.exitCode = 1;
});
