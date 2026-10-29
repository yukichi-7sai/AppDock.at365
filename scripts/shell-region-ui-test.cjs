const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  net = require('node:net');
const { _electron: electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', 'shell-region-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const { shellRegions, defaultShellId } = require('../out/main/shared/shell');
const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
initial.host.hardwareAcceleration = false;
initial.host.closeToTray = false;
initial.gestures.enabled = false;
initial.keybindings = [];
const ids = {
  a: 'fixture.region-a',
  b: 'fixture.region-b',
  n: 'fixture.region-native',
  partial: 'fixture.region-partial',
};
const notificationType = {
  typeId: 'notice',
  title: 'Mixed Shell notice',
  description: 'Fixture',
  levels: ['info'],
  defaultLevel: 'info',
  defaultEnabled: true,
  canDisable: true,
  disabledControlReason: '',
  allowedTargets: ['banner', 'desktop'],
  defaultTargets: ['banner', 'desktop'],
  requiredTargets: [],
  lifetimePolicy: 'userDuration',
  defaultDurationSeconds: null,
  history: 'persistent',
};
for (const [key, id] of Object.entries(ids)) {
  const folder = path.join(profile, 'extensions', id);
  fs.cpSync(path.join(root, 'out/shells/default'), folder, { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(folder, 'extension.json')));
  m.id = id;
  m.name = id;
  m.version = '1.0.0';
  m.minimumHostVersion = require('../package.json').version;
  if (key === 'partial') m.shell = { apiVersion: 1, views: { ribbon: 'index.html' } };
  m.commands = ['probe', 'normal', 'visible', 'resolved'].map((action) => ({
    id: id + '.' + action,
    title: action,
    automation: true,
    ...(action === 'visible'
      ? { aliases: [id + '.old-visible'], shellRequirement: { region: 'ribbon', state: 'visible' } }
      : action === 'resolved'
        ? {
            shellRequirement: {
              region: key === 'partial' ? 'ribbon' : 'statusbar',
              state: 'resolved',
            },
          }
        : {}),
  }));
  if (key === 'a') {
    m.capabilities.push('notifications');
    m.notificationTypes = [notificationType];
    m.commands.push({ id: id + '.notice', title: 'notice' }, { id: id + '.crash', title: 'crash' });
    fs.writeFileSync(
      path.join(folder, 'worker.cjs'),
      `const fs=require('node:fs'),path=require('node:path');exports.activate=async c=>{const id='${id}';let count=0;c.shell.onChanged(s=>fs.writeFileSync(path.join(__dirname,'state.json'),JSON.stringify(s)));fs.writeFileSync(path.join(__dirname,'activation.json'),JSON.stringify(await c.shell.getState()));for(const action of ['probe','normal','visible','resolved'])c.commands.register(id+'.'+action,action,async()=>{fs.writeFileSync(path.join(__dirname,'command.json'),JSON.stringify({action,count:++count,state:await c.shell.getState()}));});c.commands.register(id+'.notice','notice',async()=>fs.writeFileSync(path.join(__dirname,'notice.json'),JSON.stringify(await c.notifications.publish({typeId:'notice',title:'Mixed notification',body:'Retained notification',historyText:{title:'Safe mixed notification',body:'Safe'}}))));c.commands.register(id+'.crash','crash',()=>process.exit(1));};`,
    );
  } else if (key === 'b') {
    m.runtime = 'dotnet';
    m.entry = 'AppDock.ShellProbe.dll';
    m.type = 'AppDock.ShellProbe.ShellProbe';
    require('./copy-host.cjs').copyHost(
      path.join(
        root,
        'tests/fixtures/dotnet/AppDock.ShellProbe/bin/Release/net10.0/AppDock.ShellProbe.dll',
      ),
      path.join(folder, m.entry),
    );
  } else if (key === 'n') {
    m.runtime = 'native';
    m.entry = 'AppDock.ShellProbe.Native.exe';
    delete m.type;
    fs.cpSync(
      path.join(root, 'tests/fixtures/dotnet/AppDock.ShellProbe.Native/bin/Release/net10.0'),
      folder,
      { recursive: true },
    );
  } else
    fs.writeFileSync(
      path.join(folder, 'worker.cjs'),
      `exports.activate=async c=>{for(const action of ['probe','normal','visible','resolved'])c.commands.register('${id}.'+action,action,()=>{});};`,
    );
  fs.writeFileSync(path.join(folder, 'extension.json'), JSON.stringify(m));
  initial.extensions[id] = { enabled: true, settings: {} };
}
initial.host.shellProviders = {
  ribbon: ids.a,
  statusbar: ids.b,
  'overlay.command-palette': ids.a,
  'notification.banner': ids.a,
  'notification.desktop': ids.b,
  titlebar: ids.b,
  'future.panel': 'missing.future',
};
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
const checks = [],
  env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const hash = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
let executable, app, browser, host, child;
if (process.argv[2]) {
  executable = path.join(profile, 'AppDock.at365.exe');
  require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), executable);
  assert.equal(hash(executable), hash(path.resolve(process.argv[2])));
}
const pages = () => (app ? app.context().pages() : browser.contexts().flatMap((c) => c.pages()));
async function until(fn, label, ms = 25000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await new Promise((r) => setTimeout(r, 75));
  }
  throw Error(label);
}
const snap = () => host.evaluate(() => window.dock.snapshot());
const state = async (region) =>
  (await snap()).shellRegions.regions.find((r) => r.region === region);
const bound = async (region, id) =>
  until(
    async () => {
      const s = await state(region);
      return s.ready && s.boundProvider === id && s;
    },
    'bound ' + region + ' ' + id,
  );
async function page(region, id) {
  await bound(region, id);
  return until(
    async () => {
      for (const p of pages()) {
        try {
          const name =
            region === 'ribbon'
              ? 'appdockShell'
              : region === 'overlay.command-palette'
                ? 'appdockOverlay'
                : ['titlebar', 'statusbar'].includes(region)
                  ? 'appdockBar'
                  : region.startsWith('notification.')
                    ? 'appdockNotifications'
                    : 'appdockPage';
          const c = await p.evaluate((name) => window[name]?.connect(), name);
          if (c?.providerAppletId === id) {
            if (['titlebar', 'statusbar'].includes(region) && c.snapshot.region !== region)
              continue;
            if (region.startsWith('notification.') && c.snapshot.surface !== region.split('.')[1])
              continue;
            if (region.startsWith('page.') && c.snapshot.kind !== region.slice(5)) continue;
            return p;
          }
        } catch {}
      }
    },
    'page ' + region + ' ' + id,
  );
}
async function assign(patch) {
  await host.evaluate(async (patch) => {
    const s = await window.dock.snapshot();
    await window.dock.saveSettings(
      {
        ...s.settings.value,
        host: {
          ...s.settings.value.host,
          shellProviders: { ...s.settings.value.host.shellProviders, ...patch },
        },
      },
      s.settings.revision,
    );
  }, patch);
}
async function enabled(id, value) {
  await host.evaluate(
    async ({ id, value }) => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        {
          ...s.settings.value,
          extensions: {
            ...s.settings.value.extensions,
            [id]: { ...s.settings.value.extensions[id], enabled: value },
          },
        },
        s.settings.revision,
      );
    },
    { id, value },
  );
}
async function execute(id) {
  return host.evaluate((id) => window.dock.executeCommand(id), id);
}
async function openPalette() {
  await execute('appdock.commands.search');
  return require('./shell-overlay-helper.cjs').overlayPage(host);
}
async function closePalette(p) {
  await p.keyboard.press('Escape').catch(() => {});
  await until(async () => !(await snap()).overlay.active, 'dismissed palette');
}
async function launch(args = []) {
  if (executable) {
    app = await require('./electron-test-launcher.cjs').launchTestHost({
      executablePath: executable,
      portable: true,
      args: [`--test-profile=${profile}`, ...args],
      env,
    });
  } else
    app = await electron.launch({
      executablePath: require('electron'),
      args: [root, `--test-profile=${profile}`, ...args],
      env,
    });
  host = await until(
    () => pages().find((p) => p.url().startsWith('appdock://host/index.html')),
    'host',
  );
  host.setDefaultTimeout(10000);
  await until(async () => (await snap()).startupReady, 'startup');
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(
      (w) => w.webContents.getURL() === 'appdock://host/index.html',
    );
    w.show();
    w.focus();
  });
}
async function close() {
  if (app) {
    await app.close();
    app = undefined;
  } else if (host && !host.isClosed()) {
    await execute('appdock.quit').catch(() => {});
    await until(() => child.exitCode !== null, 'shutdown');
    await browser.close();
  }
}
(async () => {
  try {
    await launch();
    await host.evaluate(() => window.dock.navigate(null));
    await bound('ribbon', ids.a);
    await bound('statusbar', ids.b);
    assert((await snap()).extensions.find((e) => e.id === ids.n).state === 'running');
    const logs = (await snap()).logs;
    for (const id of [ids.b, ids.n])
      assert(logs.some((l) => l.source === id && l.message.startsWith('shell-activate:')));
    const activation = JSON.parse(
      fs.readFileSync(path.join(profile, 'extensions', ids.a, 'activation.json')),
    );
    assert.equal(
      activation.regions.some((r) => r.ready),
      false,
    );
    assert(!JSON.stringify(activation).includes(ids.b));
    await execute(ids.a + '.normal');
    await execute(ids.b + '.resolved');
    await assert.rejects(() => execute(ids.a + '.resolved'));
    await execute(ids.a + '.old-visible');
    checks.push(
      'A ribbon and B statusbar mix; Node/.NET/native activation reads own state before Views; normal, resolved, visible and alias conditions share final execution guard',
    );
    const ribbonBefore = await page('ribbon', ids.a);
    await assign({ statusbar: ids.a });
    await bound('statusbar', ids.a);
    assert.equal(await page('ribbon', ids.a), ribbonBefore);
    await execute(ids.a + '.resolved');
    await assign({ statusbar: ids.b });
    await bound('statusbar', ids.b);
    let palette = await openPalette();
    await execute(ids.a + '.visible');
    assert((await snap()).overlay.active);
    await assign({ 'overlay.command-palette': ids.b });
    assert.equal(
      (await snap()).shellRegions.regions.some((r) => r.region === 'overlay.command-palette'),
      false,
    );
    await closePalette(palette);
    palette = await openPalette();
    assert(palette.url().endsWith('/command-palette/index.html'));
    await closePalette(palette);
    await assign({ 'overlay.command-palette': ids.a });
    palette = await openPalette();
    await assign({ 'overlay.command-palette': ids.b });
    await enabled(ids.a, false);
    assert((await snap()).overlay.active);
    await closePalette(palette);
    await bound('ribbon', defaultShellId);
    await bound('statusbar', ids.b);
    assert.equal((await snap()).settings.value.host.shellProviders.ribbon, ids.a);
    await enabled(ids.a, true);
    await bound('ribbon', ids.a);
    palette = await openPalette();
    assert(palette.url().endsWith('/command-palette/index.html'));
    await closePalette(palette);
    checks.push(
      'independent assignment preserves other Views; retired palette assignment is inert; body palette keeps ribbon commands operable; Shell disable leaves host palette active and re-enable restores configured ribbon',
    );
    await assign({ statusbar: ids.partial });
    await bound('statusbar', defaultShellId);
    assert.match((await state('statusbar')).reason, /提供/);
    assert.equal((await snap()).settings.value.host.shellProviders['statusbar'], ids.partial);
    await assign({ statusbar: ids.b });
    await bound('statusbar', ids.b);
    await host.evaluate(() => window.dock.navigate('settings'));
    const settingsPage = await require('./settings-host-helper.cjs').settingsPage(host);
    assert.equal(await settingsPage.getByLabel('設定のShell', { exact: true }).count(), 0);
    await settingsPage.screenshot({ path: path.join(profile, 'appearance.png') });
    await assign({ 'page.settings': ids.a });
    assert.equal((await snap()).settings.value.host.shellProviders['page.settings'], ids.a);
    assert.equal(
      (await snap()).shellRegions.regions.some((r) => r.region === 'page.settings'),
      false,
    );
    assert.equal(
      pages().some((p) => p.url().endsWith('/settings.html')),
      false,
    );
    assert.equal(
      (await snap()).settings.value.host.shellProviders['future.panel'],
      'missing.future',
    );
    checks.push('settings remains host owned while retired and unknown assignments are preserved');
    await execute(ids.a + '.notice');
    await bound('notification.banner', ids.a);
    await bound('notification.desktop', ids.b);
    const banner = await page('notification.banner', ids.a);
    const noticeBefore = await banner.evaluate(() =>
      window.appdockNotifications.connect().then((c) => c.snapshot),
    );
    await assign({ 'notification.banner': ids.b });
    await bound('notification.banner', ids.b);
    assert.equal((await state('notification.desktop')).boundProvider, ids.b);
    const noticeAfter = await (
      await page('notification.banner', ids.b)
    ).evaluate(() => window.appdockNotifications.connect().then((c) => c.snapshot));
    assert.deepEqual(
      noticeAfter.items.map((i) => i.id),
      noticeBefore.items.map((i) => i.id),
    );
    await host.evaluate(() => window.dock.navigate('notifications'));
    let center = host;
    await center.getByLabel('通知を検索', { exact: true }).waitFor();
    await center.getByLabel('通知を検索', { exact: true }).fill('Safe');
    await until(
      async () =>
        (await center.evaluate(() => window.dock.pages.get())).content.filters.text === 'Safe',
      'center filter',
    );
    await assign({ titlebar: ids.a });
    await bound('titlebar', ids.a);
    center = host;
    assert.equal(
      (await center.evaluate(() => window.dock.pages.get())).content.filters.text,
      'Safe',
    );
    await host.evaluate(() => window.dock.navigate(null));
    await bound('statusbar', ids.b);
    if (app) {
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
          .hide(),
      );
      await until(async () => (await state('ribbon')).visible === false, 'host hidden');
      await bound('notification.desktop', ids.b);
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
          .show(),
      );
    }
    checks.push(
      'banner and desktop use independent providers without recreating notification IDs; host center filter survives unrelated titlebar provider swap; desktop binding survives main hiding',
    );
    if (app) {
      await app.evaluate(({ webContents }) => {
        const wc = webContents
          .getAllWebContents()
          .find((c) => c.getURL().includes('/fixture.region-a/index.html'));
        wc.forcefullyCrashRenderer();
      });
      await bound('ribbon', defaultShellId);
      await bound('statusbar', ids.b);
      assert.equal((await state('titlebar')).resolvedProvider, ids.a);
      checks.push(
        'renderer failure suppresses ribbon only and leaves B statusbar and A titlebar resolved',
      );
    }
    await assign({ ribbon: ids.n });
    await bound('ribbon', ids.n);
    await execute(ids.n + '.visible');
    await assign({ ribbon: ids.a });
    if (app) await host.evaluate(() => window.dock.retryShell());
    await bound('ribbon', ids.a);
    await execute(ids.a + '.crash').catch(() => {});
    await bound('ribbon', defaultShellId);
    await bound('statusbar', ids.b);
    assert.equal((await state('notification.banner')).boundProvider, ids.b);
    await enabled(ids.a, false);
    await enabled(ids.a, true);
    await bound('ribbon', defaultShellId);
    await host.evaluate(() => window.dock.retryShell());
    await bound('ribbon', ids.a);
    checks.push(
      'native Shell worker commands observe their own bound state; worker failure recovers only dependent regions, failure suppression survives enable cycle, retry restores without enabling another Applet',
    );
    await close();
    await launch(['--safe-shell']);
    await host.evaluate(() => window.dock.navigate(null));
    await bound('ribbon', defaultShellId);
    await bound('statusbar', defaultShellId);
    assert.equal((await snap()).settings.value.host.shellProviders.ribbon, ids.a);
    checks.push('safe launch uses bundled Default while preserving all assignments');
    await host.screenshot({ path: path.join(profile, 'host.png') });
    await close();
    const result = {
      success: true,
      profile,
      mode: executable ? 'portable' : 'source',
      checks,
      sha256: executable ? hash(executable) : null,
    };
    fs.writeFileSync(path.join(profile, 'checks.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error);
    fs.writeFileSync(path.join(profile, 'failure.txt'), String(error.stack));
    await close().catch(() => {});
    process.exitCode = 1;
  }
})();
