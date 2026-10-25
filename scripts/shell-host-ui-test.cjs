const { settleSettings } = require('./settings-immediate-helper.cjs');
const { settingsPage: getSettingsPage, deferred } = require('./settings-host-helper.cjs');
const { _electron: electron, chromium } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { parse } = require('smol-toml');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `shell-host-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.profile = { name: 'Legacy fixture', avatar: null };
settings.profile.name = 'Test profile';
settings.host.hardwareAcceleration = false;
settings.host.closeToTray = false;
settings.globalShortcutCommands = [];
const external = path.join(profile, 'extensions', 'fixture-shell');
fs.cpSync(path.join(root, 'out/shells/default'), external, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(external, 'extension.json')));
manifest.id = 'fixture.shell';
manifest.name = 'Fixture Shell';
manifest.minimumHostVersion = '0.34.0';
manifest.capabilities.push('pages', 'appdock-api');
manifest.commands = ['public', 'private'].map((id) => ({
  id: `fixture.shell.${id}`,
  title: id,
  activateOnExecute: true,
  automation: id === 'public',
}));
manifest.commands.push(
  { id: 'fixture.shell.probe', title: 'Probe' },
  { id: 'fixture.shell.crash', title: 'Crash' },
);
manifest.pages = ['public', 'private'].map((id) => ({
  id,
  title: `Fixture ${id}`,
  source: 'local',
  ui: 'page.html',
  openCommand: `fixture.shell.${id}`,
}));
fs.writeFileSync(path.join(external, 'extension.json'), JSON.stringify(manifest));
fs.writeFileSync(
  path.join(external, 'page.html'),
  '<!doctype html><html><body><input aria-label="Retained input"></body></html>',
);
fs.writeFileSync(
  path.join(external, 'worker.cjs'),
  `const fs=require('fs'),path=require('path'); exports.activate=async c=>{c.commands.register('fixture.shell.crash','Crash',()=>process.exit(1));for(const id of ['public','private'])c.commands.register('fixture.shell.'+id,id,()=>c.pages.open(id));c.commands.register('fixture.shell.probe','Probe',async()=>fs.writeFileSync(path.join(__dirname,'probe.json'),JSON.stringify(await c.appdock.call('ui.ribbon.get'))));};`,
);
settings.extensions[manifest.id] = { enabled: true, settings: {} };
const stalled = path.join(profile, 'extensions', 'stalled');
fs.mkdirSync(stalled, { recursive: true });
fs.writeFileSync(
  path.join(stalled, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.stalled',
    name: 'Stalled',
    version: '1.0.0',
    runtime: 'node',
    entry: 'worker.cjs',
    capabilities: ['shell'],
    shell: { apiVersion: 1, ribbonSchemaVersion: 3, ui: 'index.html' },
  }),
);
fs.writeFileSync(path.join(stalled, 'worker.cjs'), 'exports.activate=async()=>{};');
fs.writeFileSync(
  path.join(stalled, 'index.html'),
  '<!doctype html><html><body>Not ready</body></html>',
);
settings.extensions['fixture.stalled'] = { enabled: true, settings: {} };
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const checks = [];
let app, browser, dock, child;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const until = async (fn, label) => {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(label);
};
let portable;
if (process.argv[2]) {
  portable = path.join(profile, 'AppDock.at365.exe');
  fs.copyFileSync(path.resolve(process.argv[2]), portable);
  assert.equal(hash(portable), hash(path.resolve(process.argv[2])));
}
async function launch(extra = []) {
  if (!portable) {
    app = await electron.launch({
      executablePath: require('electron'),
      args: [root, `--test-profile=${profile}`, ...extra],
      env,
    });
    browser = app.context();
  } else {
    const probe = net.createServer();
    await new Promise((r) => probe.listen(0, '127.0.0.1', r));
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    child = spawn(
      portable,
      [`--test-profile=${profile}`, `--remote-debugging-port=${port}`, ...extra],
      { env, windowsHide: true, stdio: 'ignore' },
    );
    browser = await until(async () => {
      try {
        return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      } catch {}
    }, 'CDP');
    browser = browser.contexts()[0];
  }
  dock = await until(
    () =>
      browser
        .pages()
        .find(
          (p) =>
            p.url().startsWith('appdock://host/index.html') &&
            !p.url().endsWith('/notifications.html'),
        ),
    'host page',
  );
  dock.setDefaultTimeout(10000);
  await until(
    async () =>
      (await dock.evaluate(() => window.dock.snapshot())).shell.active === 'appdock.default-shell',
    'Default Shell ready',
  );
}
const shell = () =>
  until(
    () => browser.pages().find((p) => p.url().includes('/shells/default/index.html')),
    'Default Shell page',
  );
async function save(patch) {
  if (patch.shellProvider) {
    patch = {
      ...patch,
      shellProviders: Object.fromEntries(
        require('../out/main/shared/shell').shellRegions.map((r) => [r.id, patch.shellProvider]),
      ),
    };
    delete patch.shellProvider;
  }
  await dock.evaluate(async (patch) => {
    const s = await window.dock.snapshot();
    await window.dock.saveSettings(
      { ...s.settings.value, host: { ...s.settings.value.host, ...patch } },
      s.settings.revision,
    );
  }, patch);
}
async function close() {
  if (app) {
    await app.close();
    app = undefined;
  } else if (dock && !dock.isClosed()) {
    await dock.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    await until(() => child.exitCode !== null, 'portable stopped');
  }
}
(async () => {
  try {
    await launch();
    let rail = await shell();
    assert.equal(await dock.locator('[data-ribbon-id]').count(), 0);
    assert.equal(await rail.evaluate(() => typeof window.dock), 'undefined');
    assert.equal(await rail.locator('[data-ribbon-id]').count(), 9);
    checks.push('one independent ribbon, public Shell bridge only');
    if (app) {
      await app.evaluate(({ dialog }) => {
        const original = dialog.showMessageBox;
        dialog.showMessageBox = (...args) =>
          args.some((a) => a?.title === 'Default Shell')
            ? Promise.resolve({ response: 0, checkboxChecked: false })
            : original(...args);
      });
      const crashed = rail;
      const cdp = await browser.newCDPSession(rail);
      await cdp.send('Page.crash').catch(() => {});
      rail = await until(
        () =>
          browser
            .pages()
            .find((p) => p !== crashed && p.url().includes('/shells/default/index.html')),
        'Default Shell renderer recovered',
      );
      await rail.getByRole('button', { name: '画像ライブラリー', exact: true }).waitFor();
      checks.push(
        'Default Shell renderer crash reaches native retry and reconnects (dialog response fixture)',
      );
    }
    await dock.locator('.shell-ribbon-slot').focus();
    await rail.waitForFunction(
      () => document.activeElement?.getAttribute('data-ribbon-id') === 'profile',
    );
    await rail.keyboard.press('Tab');
    const startup = await require('./shell-overlay-helper.cjs').startupPage(dock);
    await startup.waitForFunction(
      () => document.hasFocus() && document.activeElement?.tagName === 'BUTTON',
    );
    await rail.getByRole('button', { name: '画像ライブラリー', exact: true }).focus();
    await rail.keyboard.press('Shift+Tab');
    const titlebar = await require('./shell-bars-helper.cjs').barPage(dock, 'titlebar');
    await titlebar.waitForFunction(
      () => document.hasFocus() && document.activeElement?.closest('.window-controls'),
    );
    checks.push('Tab and Shift+Tab cross renderer boundary');
    await rail.getByRole('button', { name: '設定', exact: true }).click();
    const setting = deferred(() => getSettingsPage(dock));
    await setting.getByRole('button', { name: '表示', exact: true }).click();
    await setting.getByLabel('テーマ', { exact: true }).waitFor();
    const oldTheme = await setting.getByLabel('テーマ', { exact: true }).inputValue();
    const newTheme = oldTheme === 'light' ? 'dark' : 'light';
    await setting.getByLabel('テーマ', { exact: true }).selectOption(newTheme);
    await rail.getByRole('button', { name: '画像ライブラリー', exact: true }).click();
    await dock.locator('.library-page').waitFor();
    await rail.getByRole('button', { name: '設定', exact: true }).click();
    assert.equal(await setting.getByLabel('テーマ', { exact: true }).inputValue(), newTheme);
    await settleSettings(setting);
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).settings.value.host.theme === newTheme,
      'save theme',
    );
    checks.push('navigation and immediate settings retained');
    const before = (await dock.evaluate(() => window.dock.snapshot())).settings.revision;
    await rail.evaluate(async () => {
      const m = await window.appdockShell.get();
      const request = { epoch: m.epoch, requestId: 'deduplicate-theme', actionId: 'ribbon.theme' };
      await Promise.all([window.appdockShell.invoke(request), window.appdockShell.invoke(request)]);
    });
    assert.equal((await dock.evaluate(() => window.dock.snapshot())).settings.revision, before + 1);
    checks.push('duplicate action executed once');
    await save({ shellProvider: 'missing.shell' });
    await rail.getByRole('button', { name: '設定', exact: true }).click();
    await until(
      async () =>
        (await setting.getByLabel('リボンのShell', { exact: true }).inputValue()) ===
        'missing.shell',
      'missing provider selection',
    );
    assert.match(
      await setting
        .getByLabel('リボンのShell', { exact: true })
        .locator('option:checked')
        .innerText(),
      /未導入/,
    );
    await setting
      .getByLabel('リボンのShell', { exact: true })
      .selectOption('appdock.default-shell');
    await settleSettings(setting);
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).settings.value.host.shellProviders
          .ribbon === 'appdock.default-shell',
      'missing provider reset',
    );
    checks.push('missing provider is retained and can be replaced from Default Shell settings');
    // Real MCP transport, registration contained entirely in the isolated profile.
    const configFile = path.join(profile, 'config.toml');
    fs.writeFileSync(configFile, '');
    const mcpState = await dock.evaluate(async (file) => {
      await window.dock.automation({ kind: 'selectConfig', file });
      await window.dock.automation({
        kind: 'configure',
        enabled: true,
        allowWrite: false,
        port: 0,
      });
      return (await window.dock.automation({ kind: 'register' })).state;
    }, configFile);
    const headers = parse(fs.readFileSync(configFile, 'utf8')).mcp_servers[mcpState.serverId]
      .http_headers;
    const client = new Client({ name: 'Shell regression', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(mcpState.endpoint), { requestInit: { headers } }),
    );
    const call = async (name, args = {}) => {
      const r = await client.callTool({ name, arguments: args });
      if (r.isError) throw Error(JSON.stringify(r.structuredContent));
      return r.structuredContent;
    };
    let view = await call('appdock_get_ribbon_view');
    assert.equal(view.items.find((i) => i.id === 'logs').enabled, false);
    await dock.evaluate(() => window.dock.automation({ kind: 'setExecution', allowed: true }));
    view = await call('appdock_get_ribbon_view');
    assert.equal(view.items.find((i) => i.id === 'page:fixture.shell:private').enabled, false);
    assert.equal(view.items.find((i) => i.id === 'page:fixture.shell:public').enabled, true);
    assert.equal(view.items.find((i) => i.id === 'theme').enabled, false);
    assert.equal(
      (
        await client.callTool({
          name: 'appdock_invoke_ui_action',
          arguments: {
            epoch: view.epoch,
            requestId: 'private',
            actionId: 'ribbon.page:fixture.shell:private',
          },
        })
      ).isError,
      true,
    );
    await call('appdock_invoke_ui_action', {
      epoch: view.epoch,
      requestId: 'open-public',
      actionId: 'ribbon.page:fixture.shell:public',
    });
    const pageUi = await until(
      () => browser.pages().find((p) => p.url().endsWith('/fixture-shell/page.html')),
      'public page',
    );
    await pageUi.getByLabel('Retained input').fill('retained');
    await call('appdock_invoke_ui_action', {
      epoch: view.epoch,
      requestId: 'logs',
      actionId: 'ribbon.logs',
    });
    await until(
      async () => (await dock.evaluate(() => window.dock.snapshot())).navigation.route === 'logs',
      'MCP navigation',
    );
    await rail.getByRole('button', { name: 'Fixture public', exact: true }).click();
    assert.equal(await pageUi.getByLabel('Retained input').inputValue(), 'retained');
    await dock.evaluate(() => window.dock.executeCommand('fixture.shell.probe'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(external, 'probe.json'))).schemaVersion, 1);
    await dock.evaluate(() => window.dock.automation({ kind: 'setExecution', allowed: false }));
    assert.equal(
      (
        await client.callTool({
          name: 'appdock_invoke_ui_action',
          arguments: { epoch: view.epoch, requestId: 'revoked', actionId: 'ribbon.logs' },
        })
      ).isError,
      true,
    );
    await client.close();
    checks.push(
      'MCP read/execute/write boundaries, private actions denied, public page retained, ordinary Applet API',
    );
    await save({ shellProvider: 'fixture.shell' });
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).shell.active === 'fixture.shell',
      'external ready',
    );
    const replacement = await until(
      () => browser.pages().find((p) => p.url().includes('/fixture-shell/index.html')),
      'replacement page',
    );
    await replacement.getByRole('button', { name: 'ログ', exact: true }).click();
    await until(
      async () => (await dock.evaluate(() => window.dock.snapshot())).navigation.route === 'logs',
      'external action',
    );
    checks.push('external provider uses same loader and API');
    await dock.evaluate(() => window.dock.toggleExtension('fixture.shell', false));
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).shell.active ===
        'appdock.default-shell',
      'disabled Shell fallback',
    );
    await dock.evaluate(() => window.dock.toggleExtension('fixture.shell', true));
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).shell.active === 'fixture.shell',
      're-enabled selected Shell',
    );
    checks.push('intentional disable and re-enable do not mark the provider as failed');
    // Closing the selected provider's renderer exercises recovery with no duplicate host UI.
    const currentReplacement = await until(
      () => browser.pages().find((p) => p.url().includes('/fixture-shell/index.html')),
      're-enabled renderer',
    );
    await currentReplacement
      .evaluate(() =>
        window.appdockShell.connect().then((c) => window.appdockShell.dispose(c.sessionId)),
      )
      .catch((e) => {
        if (!String(e).includes('closed')) throw e;
      });
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).shell.active ===
        'appdock.default-shell',
      'fallback',
    );
    assert.equal(
      (await dock.evaluate(() => window.dock.snapshot())).settings.value.host.shellProviders.ribbon,
      'fixture.shell',
    );
    checks.push('provider failure falls back without overwriting selection');
    await dock.evaluate(() => window.dock.retryShell());
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).shell.active === 'fixture.shell',
      'manual retry',
    );
    await dock.evaluate(() => window.dock.executeCommand('fixture.shell.crash')).catch(() => {});
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).shell.active ===
        'appdock.default-shell',
      'worker crash recovery',
    );
    await dock.evaluate(() => window.dock.retryShell());
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).shell.active === 'fixture.shell',
      'worker restart retry',
    );
    await save({ shellProvider: 'appdock.default-shell' });
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).shell.active ===
        'appdock.default-shell',
      'default restored',
    );
    checks.push('manual retry restarts failed workers and reconnects the selected provider');
    await save({ shellProvider: 'fixture.stalled' });
    await until(
      () => browser.pages().some((p) => p.url().endsWith('/stalled/index.html')),
      'pending Shell',
    );
    await save({ shellProvider: 'appdock.default-shell' });
    await until(
      () => !browser.pages().some((p) => p.url().endsWith('/stalled/index.html')),
      'pending cancelled',
    );
    await save({ shellProvider: 'fixture.stalled' });
    await until(
      async () =>
        String((await dock.evaluate(() => window.dock.snapshot())).shell.error).includes('timeout'),
      'ready timeout',
    );
    assert.equal(
      (await dock.evaluate(() => window.dock.snapshot())).shell.active,
      'appdock.default-shell',
    );
    checks.push('pending switch cancelled and ready timeout falls back');
    rail = await shell();
    await dock.screenshot({ path: path.join(profile, 'host.png') });
    await rail.screenshot({ path: path.join(profile, 'ribbon.png') });
    await close();
    await launch();
    assert.equal(
      (await dock.evaluate(() => window.dock.snapshot())).settings.value.host.shellProviders.ribbon,
      'fixture.stalled',
    );
    assert.ok(!browser.pages().some((p) => p.url().endsWith('/stalled/index.html')));
    checks.push('failed provider is not retried automatically after restart');
    await dock.evaluate(async () => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, ribbon: { ...s.settings.value.ribbon, hidden: ['settings'] } },
        s.settings.revision,
      );
    });
    await close();
    await launch(['--safe-shell']);
    assert.equal((await dock.evaluate(() => window.dock.snapshot())).shell.safeMode, true);
    assert.deepEqual(
      (await dock.evaluate(() => window.dock.snapshot())).settings.value.ribbon.hidden,
      ['settings'],
    );
    await (await shell()).getByRole('button', { name: '設定', exact: true }).waitFor();
    checks.push('safe-shell restart');
    await close();
    fs.writeFileSync(
      path.join(profile, 'checks.json'),
      JSON.stringify(
        { success: true, checks, portableHash: portable ? hash(portable) : null },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ profile, checks }));
  } catch (e) {
    console.error(e);
    fs.writeFileSync(path.join(profile, 'failure.txt'), String(e.stack));
    await close().catch(() => {});
    process.exitCode = 1;
  }
})();
