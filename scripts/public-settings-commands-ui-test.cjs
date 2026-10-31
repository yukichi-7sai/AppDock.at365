const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { settingsPageCommands } = require('../out/main/shared/settings-navigation');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'public-settings-commands-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const sourceExe = path.resolve(process.argv[2]);
const executable = path.join(profile, 'AppDock.at365.exe');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
require('./copy-host.cjs').copyHost(sourceExe, executable);
assert.equal(hash(executable), hash(sourceExe));
const caller = 'test.command-api';
const stopped = 'test.stopped-settings';
const exchange = path.join(profile, 'api.json');
const answer = path.join(profile, 'answer.json');
for (const [id, name] of [
  [caller, 'API caller'],
  [stopped, 'Stopped settings'],
]) {
  const folder = path.join(profile, 'extensions', id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name,
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.cjs',
      capabilities: id === caller ? ['appdock-api'] : [],
      commands: id === caller ? [{ id: caller + '.call', title: 'Call shared API' }] : [],
    }),
  );
  fs.writeFileSync(
    path.join(folder, 'index.cjs'),
    id === caller
      ? `
    const fs = require('node:fs');
    exports.activate = async c => c.commands.register('${caller}.call','Call shared API',async()=>{
      const request = JSON.parse(fs.readFileSync(${JSON.stringify(exchange)},'utf8'));
      try { fs.writeFileSync(${JSON.stringify(answer)}, JSON.stringify({ok:true,value:await c.appdock.call(request.method,request.params)})); }
      catch(e) { fs.writeFileSync(${JSON.stringify(answer)}, JSON.stringify({ok:false,code:e.code,message:e.message})); }
    });
  `
      : "exports.activate = async () => { throw Error('Disabled Applet was started'); };",
  );
}
const updateSource = path.join(profile, 'update-source');
fs.mkdirSync(updateSource);
const manifest = JSON.parse(
  fs.readFileSync(path.join(profile, 'extensions', stopped, 'extension.json')),
);
manifest.version = '2.0.0';
fs.writeFileSync(path.join(updateSource, 'extension.json'), JSON.stringify(manifest));
require('./copy-host.cjs').copyHost(
  path.join(profile, 'extensions', stopped, 'index.cjs'),
  path.join(updateSource, 'index.cjs'),
);
const settings = createDefaultSettings();
settings.host.soundEnabled = false;
settings.host.hardwareAcceleration = false;
settings.gestures.enabled = false;
settings.keybindings = [];
settings.extensions[caller] = { enabled: true, settings: {} };
settings.extensions[stopped] = { enabled: false, settings: {}, updateSource };
settings.updates.hostSource = path.dirname(sourceExe);
settings.notificationPreferences ??= { overrides: [] };
settings.notificationPreferences.overrides.push({
  ownerKind: 'host',
  ownerId: 'updates',
  typeId: 'available',
  targets: ['banner'],
});
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
const checks = [],
  failures = [];
let host,
  browser,
  child,
  success = false,
  output = '';
async function until(fn, label, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    await new Promise((r) => setTimeout(r, 75));
  }
  throw Error('Timed out: ' + label);
}
async function api(method, params = {}) {
  fs.writeFileSync(exchange, JSON.stringify({ method, params }));
  if (fs.existsSync(answer)) fs.unlinkSync(answer);
  await host.evaluate((id) => window.dock.executeCommand(id), caller + '.call');
  const reply = JSON.parse(fs.readFileSync(answer));
  assert.equal(reply.ok, true, JSON.stringify(reply));
  return reply.value;
}
const snapshot = () => host.evaluate(() => window.dock.snapshot());
async function selected(id) {
  await settingsPage(host);
  await until(
    () =>
      host.evaluate(async (id) => {
        const surface = document.querySelector('.settings-surface[data-settings-connection]');
        if (!surface) return false;
        const model = await window.dock.settingsPage.get(surface.dataset.settingsConnection);
        return model.content.page.id === id;
      }, id),
    'settings page ' + id,
  );
}
(async () => {
  try {
    const port = await freePort(),
      mainPort = await freePort();
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(
      executable,
      [
        '--test-profile=' + profile,
        '--test-local-state=' + path.join(profile, 'local'),
        '--remote-debugging-port=' + port,
        '--inspect=' + mainPort,
      ],
      { cwd: profile, env, windowsHide: true, stdio: 'pipe' },
    );
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    browser = await until(
      () => chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 }),
      'CDP',
    );
    host = await until(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().startsWith('appdock://host/index.html')),
      'host',
    );
    host.setDefaultTimeout(15000);
    host.on('pageerror', (e) => failures.push(e.message));
    await until(async () => {
      const s = await snapshot();
      return s.startupReady && s.extensions.find((a) => a.id === caller)?.state === 'running';
    }, 'startup');
    assert.equal((await snapshot()).version, require('../package.json').version);
    assert.equal(
      await inspect(
        mainPort,
        "JSON.parse(process.getBuiltinModule('fs').readFileSync(process.resourcesPath+'/shells/default/extension.json','utf8')).version",
      ),
      require('../package.json').version,
    );
    const baseline = (await snapshot()).settings.value;
    const commands = (await api('commands.list')).commands;
    const tray = (await api('tray.get')).assignableCommands;
    const pages = settingsPageCommands((await snapshot()).extensions);
    for (const command of pages) {
      assert.equal(commands.filter((c) => c.id === command.id && c.available).length, 1);
      assert.equal(
        tray.filter((c) => c.id === command.id && c.available && c.menuAllowed).length,
        1,
      );
      await api('commands.execute', { id: command.id });
      await selected(command.pageId);
    }
    checks.push(
      'shared Applet API lists and opens every settings index page, retaining legacy IDs',
    );
    assert.equal((await snapshot()).extensions.find((a) => a.id === stopped).enabled, false);
    assert.equal((await snapshot()).extensions.find((a) => a.id === stopped).state, 'stopped');
    checks.push('opening disabled Applet settings does not enable or start it');
    checks.push('all generated settings commands are available for tray assignment');
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.shortcuts.open'));
    await selected('shortcuts');
    await host.evaluate(() => window.dock.executeCommand('appdock.ribbon.settings.open'));
    await selected('ribbon');
    await host.evaluate(() => window.dock.executeCommand('appdock.updates.open'));
    await selected('about');
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await selected('about');
    checks.push(
      'local execution shares navigation; generic settings command preserves selected page',
    );
    await api('commands.execute', { id: 'appdock.updates.check' });
    const checked = (await snapshot()).updates;
    assert.equal(checked.results.find((r) => r.id === stopped).status, 'available');
    assert.equal(checked.results.length, 3);
    assert.equal(checked.busy, false);
    assert.equal((await snapshot()).extensions.find((a) => a.id === stopped).version, '1.0.0');
    await host.evaluate(() => window.dock.executeCommand('appdock.notifications.open'));
    const notification = await until(async () => {
      const model = await host.evaluate(() => window.dock.pages.get());
      return (
        model?.kind === 'notifications' &&
        model.content.items.find((n) => n.ownerId === 'updates' && n.typeId === 'available')
      );
    }, 'typed available notification');
    assert.equal(notification.typeTitle, '更新のお知らせ');
    assert(notification.actions.some((a) => a.label === '更新画面を開く'));
    await host.screenshot({ path: path.join(profile, 'update-notification.png') });
    checks.push(
      'check command checks host and disabled Applets without installing and uses typed update notification',
    );
    await inspect(
      mainPort,
      `globalThis.updateScopes=[]; const r=process.getBuiltinModule('module').createRequire(process.resourcesPath+'/app.asar/package.json'); const P=r('./out/main/main/core/portable-updates.js').PortableUpdates; const original=P.prototype.install; P.prototype.install=async function(scope){globalThis.updateScopes.push(scope);return original.call(this,scope)}; globalThis.confirmed=[]; ${electronExpression}.dialog.showMessageBox=async (...args)=>{globalThis.confirmed.push(args.at(-1).detail);return {response:1}}; true`,
    );
    await api('commands.execute', { id: 'appdock.updates.installHost' });
    const hostCheck = (await snapshot()).updates.results.find((r) => r.id === stopped).checkedAt;
    assert.equal(hostCheck, checked.results.find((r) => r.id === stopped).checkedAt);
    await api('commands.execute', { id: 'appdock.updates.installAll' });
    await host.evaluate(() => window.dock.executeCommand('appdock.updates.open'));
    await selected('about');
    await host.getByRole('button', { name: 'AppDockを更新', exact: true }).click();
    await until(
      async () => (await inspect(mainPort, 'globalThis.updateScopes.length')) === 3,
      'host command dispatch',
    );
    await until(async () => !(await snapshot()).updates.busy, 'host button');
    await host.getByRole('button', { name: 'AppDockとAppletをすべて更新', exact: true }).click();
    await until(
      async () => (await inspect(mainPort, 'globalThis.updateScopes.length')) === 4,
      'all command dispatch',
    );
    await until(async () => !(await snapshot()).updates.busy, 'all button');
    assert.deepEqual(await inspect(mainPort, 'globalThis.updateScopes'), [
      'host',
      'all',
      'host',
      'all',
    ]);
    const confirmations = await inspect(mainPort, 'globalThis.confirmed');
    assert.equal(confirmations.length, 2);
    assert(confirmations.every((names) => names.includes('Stopped settings')));
    assert.equal((await snapshot()).extensions.find((a) => a.id === stopped).version, '1.0.0');
    checks.push(
      'public update commands and both settings buttons use identical scopes and preserve confirmation/cancel',
    );
    assert.deepEqual((await snapshot()).settings.value, baseline);
    assert.deepEqual(failures, []);
    await host.screenshot({ path: path.join(profile, 'update-buttons.png') });
    success = true;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
    fs.writeFileSync(path.join(profile, 'error.txt'), e.stack || String(e));
    if (host) await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
  } finally {
    if (host) await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (child) {
      try {
        await until(() => child.exitCode !== null, 'shutdown');
      } catch {
        child.kill();
        success = false;
        process.exitCode = 1;
      }
    }
    if (browser) await browser.close();
    fs.writeFileSync(path.join(profile, 'process.log'), output);
    const result = {
      success,
      checks,
      profile,
      version: require('../package.json').version,
      sha256: hash(sourceExe),
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
