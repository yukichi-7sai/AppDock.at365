const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process'),
  { createHash } = require('node:crypto');
const { _electron: electron, chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', 'notification-desktop-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const ids = { node: 'fixture.notifications.node', native: 'fixture.notifications.native' };
const definition = (typeId = 'message') => ({
  typeId,
  title: typeId === 'message' ? 'Desktop notice' : 'Timed desktop notice',
  description: 'Notification fixture',
  levels: ['info', 'warning', 'error'],
  defaultLevel: 'info',
  defaultEnabled: true,
  canDisable: true,
  disabledControlReason: '',
  allowedTargets: ['banner', 'desktop', 'windows'],
  defaultTargets: typeId === 'message' ? ['banner', 'desktop'] : ['desktop'],
  requiredTargets: [],
  lifetimePolicy: 'userDuration',
  defaultDurationSeconds: typeId === 'message' ? null : 1,
  history: 'persistent',
});
for (const [kind, id] of Object.entries(ids)) {
  const folder = path.join(profile, 'extensions', id);
  fs.mkdirSync(folder, { recursive: true });
  const commands = ['publish', 'action', 'policy', ...(kind === 'node' ? ['timed'] : [])].map(
    (key) => ({ id: id + '.' + key, title: kind + ' ' + key }),
  );
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name: kind === 'native' ? 'Native desktop fixture' : 'Node desktop fixture',
      version: '1.0.0',
      minimumHostVersion: '0.31.1',
      runtime: kind === 'native' ? 'native' : 'node',
      entry: kind === 'native' ? 'NotificationFixture.exe' : 'index.cjs',
      capabilities: ['notifications', 'storage'],
      commands,
      notificationTypes: [definition(), ...(kind === 'node' ? [definition('timed')] : [])],
    }),
  );
  if (kind === 'native')
    fs.cpSync(
      path.join(root, 'tests/fixtures/dotnet/AppDock.Notifications/bin/Release/net10.0'),
      folder,
      { recursive: true },
    );
  else
    fs.writeFileSync(
      path.join(folder, 'index.cjs'),
      "exports.activate=async c=>{let n=0;const id='fixture.notifications.node';c.commands.register(id+'.publish','Publish',async()=>{const k=++n;await c.storage.set('result',await c.notifications.publish({typeId:'message',title:'Desktop node '+k,body:'Node body',dedupeKey:String(k),historyText:{title:'Safe desktop '+k,body:'Safe'},actions:[{key:'run',label:'Node action '+k,command:id+'.action'}]}));});c.commands.register(id+'.action','Action',async()=>{await new Promise(r=>setTimeout(r,150));await c.storage.set('acted',true)});c.commands.register(id+'.policy','Policy',async()=>c.storage.set('policy',await c.notifications.getPolicy('message')));c.commands.register(id+'.timed','Timed',async()=>c.storage.set('timed',await c.notifications.publish({typeId:'timed',title:'Timed desktop',body:'Expires during suppression',historyText:{title:'Timed summary',body:'Safe'}})));};",
    );
}
const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
initial.host.hardwareAcceleration = false;
initial.gestures.enabled = false;
initial.globalShortcutCommands = [];
for (const id of Object.values(ids)) initial.extensions[id] = { enabled: true, settings: {} };
const customId = 'fixture.desktop.shell';
if (!process.argv[2]) {
  const folder = path.join(profile, 'extensions', customId);
  fs.mkdirSync(folder, { recursive: true });
  fs.cpSync(path.join(root, 'out/shells/default'), folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: customId,
      name: 'Desktop Shell fixture',
      version: '1.0.0',
      minimumHostVersion: '0.31.1',
      runtime: 'node',
      entry: 'worker.cjs',
      capabilities: ['shell'],
      shell: { apiVersion: 1, views: { 'notification.desktop': 'notifications.html' } },
    }),
  );
  fs.writeFileSync(path.join(folder, 'worker.cjs'), 'exports.activate=async()=>{};');
  initial.host.shellProviders = { 'notification.desktop': customId };
  initial.extensions[customId] = { enabled: true, settings: {} };
}
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
const hash = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const executable = process.argv[2] ? path.join(profile, 'AppDock.at365.exe') : undefined;
if (executable) {
  fs.copyFileSync(path.resolve(process.argv[2]), executable);
  assert.equal(hash(executable), hash(path.resolve(process.argv[2])));
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await wait(75);
  }
  throw Error(label);
}
let app, browser, child, host, inspectPort;
const pages = () =>
  executable ? browser.contexts().flatMap((c) => c.pages()) : app.context().pages();
const checks = [];
async function main(expression) {
  if (app)
    return app.evaluate(({ BrowserWindow, screen, powerMonitor, webContents }, expression) => {
      const electron = { BrowserWindow, screen, powerMonitor, webContents };
      return eval(expression);
    }, expression);
  return inspect(
    inspectPort,
    '(()=>{const electron=' + electronExpression + ';return (' + expression + ');})()',
  );
}
const desktopWindow =
  "electron.BrowserWindow.getAllWindows().find(w=>w.getTitle()==='AppDock デスクトップ通知')";
const parentWindow =
  "electron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('appdock://host/'))";
async function surface(kind, provider) {
  return until(async () => {
    for (const p of pages().filter((p) => p.url().endsWith('/notifications.html'))) {
      try {
        const c = await p.evaluate(() => window.appdockNotifications.connect());
        if (c.snapshot.surface === kind && (!provider || c.providerAppletId === provider)) {
          p.setDefaultTimeout(12000);
          return p;
        }
      } catch {}
    }
    return null;
  }, kind + ' surface');
}
const command = (id) => host.evaluate((id) => window.dock.executeCommand(id), id);
const storage = (id, key) => {
  const file = path.join(profile, 'data/storage', id, key + '.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null;
};
(async () => {
  let success = false;
  try {
    if (executable) {
      const port = await freePort();
      inspectPort = await freePort();
      child = spawn(
        executable,
        [
          '--test-profile=' + profile,
          '--remote-debugging-port=' + port,
          '--inspect=' + inspectPort,
        ],
        { cwd: profile, windowsHide: true, stdio: 'ignore', env },
      );
      browser = await until(async () => {
        try {
          return await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 });
        } catch {
          return null;
        }
      }, 'portable CDP');
      host = await until(
        () => pages().find((p) => p.url().startsWith('appdock://host/')),
        'host page',
      );
    } else {
      app = await electron.launch({
        executablePath: require('electron'),
        args: [root, '--test-profile=' + profile],
        env,
      });
      host = await app.firstWindow();
    }
    host.setDefaultTimeout(12000);
    for (const p of pages())
      p.on('pageerror', (e) => console.error('RENDERER', p.url(), String(e)));
    await host.waitForFunction(async () => {
      const s = await window.dock.snapshot();
      return (
        s.startupReady &&
        Object.values(
          s.extensions.filter((e) =>
            ['fixture.notifications.node', 'fixture.notifications.native'].includes(e.id),
          ),
        ).every((e) => e.state === 'running')
      );
    });
    await require('./shell-overlay-helper.cjs').startupPage(host);
    assert.equal(await main(desktopWindow + '?.isVisible() ?? false'), false);
    await main(parentWindow + '.focus()');
    const focused = await main('electron.BrowserWindow.getFocusedWindow()?.id');
    await command(ids.node + '.publish');
    await command(ids.native + '.publish');
    let d = await surface('desktop', executable ? 'appdock.default-shell' : customId),
      b = await surface('banner');
    await until(() => main(desktopWindow + '.isVisible()'), 'desktop native visibility');
    assert.equal(await main(desktopWindow + '.isAlwaysOnTop()'), true);
    assert.equal(await main('electron.BrowserWindow.getFocusedWindow()?.id'), focused);
    const dm = (await d.evaluate(() => window.appdockNotifications.connect())).snapshot;
    const bm = (await b.evaluate(() => window.appdockNotifications.connect())).snapshot;
    const native = dm.items.find((i) => i.ownerId === ids.native);
    assert.equal(bm.items.find((i) => i.ownerId === ids.native).id, native.id);
    assert.equal(await d.evaluate(() => typeof window.dock), 'undefined');
    await d.getByRole('button', { name: 'Node action 1', exact: true }).click();
    await until(() => storage(ids.node, 'acted'), 'Node action');
    await d.getByRole('button', { name: 'Native action', exact: true }).click();
    await until(() => storage(ids.native, 'acted'), 'native action');
    checks.push(
      'real Node/.NET notifications share banner/desktop IDs and owned actions; native desktop shows inactive with no host bridge',
    );
    const bounds = await main(
      '(()=>{const w=' +
        desktopWindow +
        ';return {bounds:w.getBounds(),work:electron.screen.getDisplayMatching(w.getBounds()).workArea};})()',
    );
    assert.ok(bounds.bounds.x >= bounds.work.x && bounds.bounds.y >= bounds.work.y);
    assert.ok(bounds.bounds.x + bounds.bounds.width <= bounds.work.x + bounds.work.width);
    assert.ok(bounds.bounds.y + bounds.bounds.height <= bounds.work.y + bounds.work.height);
    for (let n = 0; n < 4; n++) await command(ids.node + '.publish');
    await d.getByRole('button', { name: 'ほか3件を表示', exact: true }).waitFor();
    await d.getByRole('button', { name: 'ほか3件を表示', exact: true }).click();
    assert.equal(await d.getByRole('region').count(), 6);
    await d.screenshot({ path: path.join(profile, 'desktop-dark.png') });
    await main(parentWindow + '.hide()');
    await main(desktopWindow + '.blur()');
    const hiddenFocus = await main('electron.BrowserWindow.getFocusedWindow()?.id');
    await command(ids.node + '.publish');
    await until(() => main(desktopWindow + '.isVisible()'), 'desktop while host hidden');
    assert.equal(await main('electron.BrowserWindow.getFocusedWindow()?.id'), hiddenFocus);
    checks.push(
      'tray work-area bounds, stacked/scrollable cards and independent delivery while the main Window is hidden',
    );
    await main('electron.powerMonitor.emit("lock-screen")');
    await until(
      async () => !(await main(desktopWindow + '?.isVisible() ?? false')),
      'lock suppression',
    );
    await command(ids.node + '.timed');
    await wait(1300);
    assert.equal(await main(desktopWindow + '?.isVisible() ?? false'), false);
    await main('electron.powerMonitor.emit("unlock-screen")');
    await until(
      () => main(desktopWindow + '?.isVisible() ?? false'),
      'unlock resumes manual notifications',
    );
    d = await surface('desktop', executable ? 'appdock.default-shell' : customId);
    const resumed = (await d.evaluate(() => window.appdockNotifications.connect())).snapshot;
    assert.ok(resumed.items.some((i) => i.title === 'Timed desktop'));
    assert.ok(resumed.items.some((i) => i.id === native.id));
    await until(
      async () =>
        !(await d.evaluate(() => window.appdockNotifications.connect())).snapshot.items.some(
          (i) => i.title === 'Timed desktop',
        ),
      'timed notice expires after unlock',
    );
    await main(parentWindow + '.setFullScreen(true)');
    await until(
      async () => !(await main(desktopWindow + '.isVisible()')),
      'full-screen suppression',
    );
    await main(parentWindow + '.setFullScreen(false)');
    await until(() => main(desktopWindow + '.isVisible()'), 'full-screen end');
    checks.push(
      'lock/unlock retains manual IDs and holds timed notices until unlock; real parent full-screen suppression remains independent',
    );
    if (app) {
      const before = (
        await d.evaluate(() => window.appdockNotifications.connect())
      ).snapshot.items.map((i) => i.id);
      await app.evaluate(
        ({ webContents }, customId) =>
          webContents
            .getAllWebContents()
            .find(
              (w) => w.getURL().includes(customId) && w.getURL().endsWith('/notifications.html'),
            )
            .forcefullyCrashRenderer(),
        customId,
      );
      d = await surface('desktop', 'appdock.default-shell');
      assert.deepEqual(
        (await d.evaluate(() => window.appdockNotifications.connect())).snapshot.items.map(
          (i) => i.id,
        ),
        before,
      );
      assert.equal(
        (await host.evaluate(() => window.dock.snapshot())).settings.value.host.shellProviders[
          'notification.desktop'
        ],
        customId,
      );
      checks.push(
        'a desktop-only public Shell crashes to Default Shell without replacing IDs or the other banner surface',
      );
    }
    await d.getByRole('button', { name: /通知センターを開く/ }).click();
    await host.waitForFunction(() =>
      window.dock.snapshot().then((s) => s.navigation.route === 'notifications'),
    );
    assert.equal(await main(parentWindow + '.isVisible()'), true);
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.host.theme = 'light';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await d.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await d.screenshot({ path: path.join(profile, 'desktop-light.png') });
    await host.evaluate(() => window.dock.toggleExtension('fixture.notifications.native', false));
    await until(
      async () =>
        !(await d.evaluate(() => window.appdockNotifications.connect())).snapshot.items.some(
          (i) => i.ownerId === 'fixture.notifications.native',
        ),
      'native stop withdraws',
    );
    const nodeItem = (
      await d.evaluate(() => window.appdockNotifications.connect())
    ).snapshot.items.find((i) => i.ownerId === ids.node);
    await d.getByRole('button', { name: nodeItem.title + 'を閉じる', exact: true }).click();
    b = await surface('banner');
    await until(
      async () =>
        !(await b.evaluate(() => window.appdockNotifications.connect())).snapshot.items.some(
          (i) => i.id === nodeItem.id,
        ),
      'shared dismissal',
    );
    checks.push(
      'desktop center shortcut opens the normal main page; themes, owner-stop and dismissal propagate to all readers',
    );
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.notificationPreferences = {
        overrides: [
          {
            ownerKind: 'applet',
            ownerId: 'fixture.notifications.node',
            typeId: 'message',
            targets: ['banner'],
          },
        ],
      };
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await until(
      () => main(desktopWindow + '===undefined'),
      'desktop window released after final target removed',
    );
    assert.ok(
      (await b.evaluate(() => window.appdockNotifications.connect())).snapshot.items.length > 0,
    );
    await until(
      () =>
        main(
          "process._getActiveHandles().filter(h => h.spawnargs?.includes('--notification-state')).length === 0",
        ),
      'query worker release',
    );
    checks.push(
      'changing targets releases the idle desktop Window and query worker without ending banner notifications',
    );
    if (app) {
      const beforeIds = (
        await b.evaluate(() => window.appdockNotifications.connect())
      ).snapshot.items.map((i) => i.id);
      await host.evaluate(async () => {
        const s = await window.dock.snapshot();
        s.settings.value.notificationPreferences = { overrides: [] };
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      });
      d = await surface('desktop', 'appdock.default-shell');
      assert.deepEqual(
        (await d.evaluate(() => window.appdockNotifications.connect())).snapshot.items.map(
          (i) => i.id,
        ),
        beforeIds,
      );
      await host.evaluate(async () => {
        const s = await window.dock.snapshot();
        s.settings.value.notificationPreferences = {
          overrides: [
            {
              ownerKind: 'applet',
              ownerId: 'fixture.notifications.node',
              typeId: 'message',
              targets: ['banner'],
            },
          ],
        };
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      });
      await until(() => main(desktopWindow + '===undefined'), 'recreated window released');
      await until(
        () =>
          main(
            "process._getActiveHandles().filter(h=>h.spawnargs?.includes('--notification-state')).length===0",
          ),
        'recreated query worker released',
      );
      checks.push(
        'idle recreation retains failed provider suppression and the original notification IDs',
      );
    }
    success = true;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    try {
      if (app) await app.close();
      else if (child?.exitCode === null) {
        await host.evaluate(() => window.dock.executeCommand('appdock.quit'));
        await until(() => child.exitCode !== null, 'portable shutdown');
      }
    } catch (e) {
      console.error('CLOSE', e);
      success = false;
      process.exitCode = 1;
    }
    if (browser) await browser.close().catch(() => {});
    const result = {
      success,
      profile,
      checks,
      mode: executable ? 'portable' : 'source',
      version: require('../package.json').version,
      sha256: executable ? hash(executable) : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
