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
const profile = path.join(root, '.artifacts', `shell-overlay-${Date.now()}`);
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
manifest.shell = { apiVersion: 1, views: { 'overlay.command-palette': 'overlay.html' } };
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
    shell: { apiVersion: 1, ui: 'index.html' },
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
  require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), portable);
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
const ribbonDir = path.join(profile, 'extensions', 'ribbon-only');
fs.cpSync(path.join(root, 'out/shells/default'), ribbonDir, { recursive: true });
const ribbonManifest = {
  ...manifest,
  id: 'fixture.ribbon',
  name: 'Ribbon only',
  shell: { apiVersion: 1, ribbonSchemaVersion: 3, views: { ribbon: 'index.html' } },
  pages: [],
  commands: [{ id: 'fixture.ribbon.mark', title: 'Mark from Shell' }],
  capabilities: ['shell', 'settings', 'pages'],
  settings: [{ key: 'compact', title: 'Compact', type: 'boolean', default: false }],
};
fs.writeFileSync(path.join(ribbonDir, 'extension.json'), JSON.stringify(ribbonManifest));
fs.writeFileSync(
  path.join(ribbonDir, 'worker.cjs'),
  `const fs=require('fs'),path=require('path');exports.activate=async c=>{c.commands.register('fixture.ribbon.mark','Mark from Shell',async()=>{await c.settings.set('compact',true);fs.writeFileSync(path.join(__dirname,'marked.txt'),'yes');});};`,
);
settings.extensions[ribbonManifest.id] = { enabled: true, settings: {} };
const stalledManifest = JSON.parse(fs.readFileSync(path.join(stalled, 'extension.json')));
stalledManifest.shell = { apiVersion: 1, views: { 'overlay.command-palette': 'index.html' } };
fs.writeFileSync(path.join(stalled, 'extension.json'), JSON.stringify(stalledManifest));
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const palette = () => require('./shell-overlay-helper.cjs').overlayPage(dock);
const { closingAction } = require('./shell-overlay-helper.cjs');
async function open() {
  await dock.evaluate(() => window.dock.executeCommand('appdock.commands.search'));
  return palette();
}
async function dismiss(p) {
  await closingAction(p.keyboard.press('Escape'));
  await until(() => p.isClosed(), 'overlay disposed');
  await until(
    async () => !(await dock.evaluate(() => window.dock.snapshot())).overlay.active,
    'modal released',
  );
}
(async () => {
  try {
    await launch();
    assert.equal(browser.pages().filter((p) => p.url().endsWith('/overlay.html')).length, 0);
    let p = await open();
    assert.equal(await dock.locator('.command-palette').count(), 0);
    assert.equal(await p.evaluate(() => typeof window.dock), 'undefined');
    assert.equal(await p.evaluate(() => typeof window.require), 'undefined');
    const input = p.getByRole('combobox');
    await input.fill('appdock.logs.open');
    await p.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox');
    await input.press('Shift+Tab');
    assert.notEqual(await p.evaluate(() => document.activeElement?.tagName), 'BODY');
    await input.focus();
    await input.evaluate((el) =>
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
      ),
    );
    assert.equal((await dock.evaluate(() => window.dock.snapshot())).navigation.route, 'settings');
    await p.keyboard.press('Control+,');
    assert.equal((await dock.evaluate(() => window.dock.snapshot())).navigation.route, 'settings');
    await closingAction(input.press('Enter'));
    await until(
      async () => (await dock.evaluate(() => window.dock.snapshot())).navigation.route === 'logs',
      'palette execution',
    );
    await until(() => p.isClosed(), 'executed palette destroyed');
    checks.push(
      'lazy independent Default Shell palette; host has no duplicate; IME, Tab, shortcut suppression and execution',
    );
    p = await open();
    await p.getByRole('combobox').fill('appdock.logs.open');
    await p.getByRole('button', { name: 'ログを開くをピン留め', exact: true }).click();
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).settings.value.pinnedCommands.includes(
          'appdock.logs.open',
        ),
      'pin saved',
    );
    await dismiss(p);
    await dock.evaluate(() => window.dock.executeCommand('fixture.shell.public'));
    const retained = await until(
      () => browser.pages().find((p) => p.url().endsWith('/fixture-shell/page.html')),
      'retained Applet',
    );
    await retained.getByLabel('Retained input').fill('retained across overlay');
    await retained.getByLabel('Retained input').focus();
    p = await open();
    if (app) {
      const order = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].contentView.children.map((v) => v.webContents?.getURL()),
      );
      assert.ok(order.at(-1).endsWith('/overlay.html'));
    }
    await dismiss(p);
    assert.equal(
      await retained.getByLabel('Retained input').inputValue(),
      'retained across overlay',
    );
    await retained.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'Retained input',
    );
    checks.push('pin persists; overlay layers above Applet view; page input and focus retained');
    await dock.evaluate(() => {
      window.selection = undefined;
      void window.dock
        .openCommandPalette({
          requestId: 'choose-test',
          mode: 'select',
          commandIds: ['fixture.shell.probe'],
        })
        .then((r) => (window.selection = r));
    });
    p = await palette();
    await p.getByRole('combobox').fill('fixture.shell.probe');
    await closingAction(p.locator('.palette-execute').click());
    await dock.waitForFunction(() => window.selection?.status === 'selected');
    assert.equal(fs.existsSync(path.join(external, 'probe.json')), false);
    checks.push('selection returns ID without executing the command');
    await dock.evaluate(() => window.dock.navigate(null));
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).navigation.route === 'settings',
      'owner returned to default page',
    );
    await save({ shellProvider: 'fixture.ribbon' });
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).shell.active === 'fixture.ribbon',
      'ribbon-only selected',
    );
    const rail = await until(
      () => browser.pages().find((p) => p.url().endsWith('/ribbon-only/index.html')),
      'ribbon-only renderer',
    );
    await rail.evaluate(async () => {
      window.shellSettingsChanged = false;
      window.appdockShell.onSettingsChanged(async () => {
        const settings = await window.appdockShell.getSettings();
        window.shellSettingsChanged = settings.compact === true;
        document.body.dataset.compact = String(settings.compact);
      });
      await window.appdockShell.executeCommand('fixture.ribbon.mark');
    });
    await rail.waitForFunction(
      () => window.shellSettingsChanged && document.body.dataset.compact === 'true',
    );
    assert.equal(fs.readFileSync(path.join(ribbonDir, 'marked.txt'), 'utf8'), 'yes');
    assert.equal(
      await rail.evaluate(() =>
        window.appdockShell.executeCommand('fixture.shell.probe').then(
          () => false,
          () => true,
        ),
      ),
      true,
    );
    p = await open();
    assert.ok(p.url().includes('/shells/default/'));
    await p.getByRole('combobox').fill('fixture.ribbon.mark');
    await p.locator('.palette-execute').waitFor();
    await dismiss(p);
    checks.push(
      'ribbon-only Shell provides and invokes its ordinary commands; other owner denied; default palette fallback',
    );
    await save({ shellProvider: 'fixture.shell' });
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).shell.active ===
        'appdock.default-shell',
      'palette-only leaves default ribbon',
    );
    assert.equal((await dock.evaluate(() => window.dock.snapshot())).shell.error, null);
    p = await open();
    assert.ok(p.url().endsWith('/fixture-shell/overlay.html'));
    await p.evaluate(() => window.appdockOverlay.executeCommand('fixture.shell.probe'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(external, 'probe.json'))).schemaVersion, 1);
    const cdp = await browser.newCDPSession(p);
    await cdp.send('Page.crash').catch(() => {});
    const fallback = await until(
      () =>
        browser.pages().find((v) => v !== p && v.url().includes('/shells/default/overlay.html')),
      'overlay crash fallback',
    );
    await fallback.locator('.command-palette').waitFor();
    assert.equal(
      (await dock.evaluate(() => window.dock.snapshot())).shell.active,
      'appdock.default-shell',
    );
    await dismiss(fallback);
    await dock.evaluate(() => window.dock.retryShell());
    p = await open();
    assert.ok(p.url().endsWith('/fixture-shell/overlay.html'));
    await dock.evaluate(() => window.dock.toggleExtension('fixture.shell', false));
    const disabled = await until(
      () =>
        browser.pages().find((v) => v !== p && v.url().includes('/shells/default/overlay.html')),
      'disable fallback',
    );
    await disabled.locator('.command-palette').waitFor();
    await dismiss(disabled);
    await dock.evaluate(() => window.dock.toggleExtension('fixture.shell', true));
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).extensions.find(
          (e) => e.id === 'fixture.shell',
        )?.state === 'running',
      're-enabled',
    );
    p = await open();
    assert.ok(p.url().endsWith('/fixture-shell/overlay.html'));
    await dismiss(p);
    checks.push(
      'palette-only and normal pages/commands coexist; renderer failure recovers only overlay; retry and intentional disable/re-enable',
    );
    await save({ shellProvider: 'fixture.stalled' });
    await dock.evaluate(() => window.dock.executeCommand('appdock.commands.search'));
    await until(
      () => browser.pages().some((v) => v.url().endsWith('/stalled/index.html')),
      'pending overlay',
    );
    await dock.evaluate(() => window.dock.executeCommand('appdock.commands.search'));
    await until(
      () => !browser.pages().some((v) => v.url().endsWith('/stalled/index.html')),
      'cancel pending overlay',
    );
    p = await open();
    assert.ok(p.url().includes('/shells/default/'));
    await dismiss(p);
    checks.push('pending overlay cancels; readiness timeout falls back without damaging ribbon');
    await save({ shellProvider: 'appdock.default-shell' });
    if (app)
      await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.unmaximize();
        window.setSize(900, 640);
      });
    for (const theme of ['dark', 'light']) {
      await save({ theme });
      p = await open();
      if (!app) await p.setViewportSize({ width: 900, height: 640 });
      await p.getByRole('combobox').fill('appdock');
      await p.screenshot({ path: path.join(profile, `palette-${theme}.png`) });
      assert.equal(
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      assert.equal(
        await p
          .locator('.command-palette')
          .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
        true,
      );
      await dismiss(p);
    }
    checks.push(
      `two themes at 900x640 (${app ? 'native Window' : 'emulated viewport'}); palette fits without horizontal overflow`,
    );
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
