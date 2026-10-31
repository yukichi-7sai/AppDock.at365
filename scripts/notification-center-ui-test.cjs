const { settleSettings } = require('./settings-immediate-helper.cjs');
const { _electron: electron, chromium } = require('playwright');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { spawn } = require('node:child_process'),
  net = require('node:net'),
  { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', 'notification-center-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const ids = {
  node: 'fixture.notifications.node',
  native: 'fixture.notifications.native',
  stopped: 'fixture.notifications.stopped',
};
const definition = (title) => ({
  typeId: 'message',
  title,
  description: '通知設定の検証用です。',
  levels: ['info', 'warning'],
  defaultLevel: 'info',
  defaultEnabled: true,
  canDisable: true,
  disabledControlReason: '',
  allowedTargets: ['banner', 'desktop', 'windows'],
  defaultTargets: ['banner'],
  requiredTargets: [],
  lifetimePolicy: 'userDuration',
  defaultDurationSeconds: 60,
  history: 'persistent',
});
for (const [kind, id] of Object.entries(ids)) {
  const folder = path.join(profile, 'extensions', id);
  fs.mkdirSync(folder, { recursive: true });
  const commands = [
    'publish',
    'action',
    'policy',
    ...(kind === 'node' ? ['bad', 'foreign'] : []),
  ].map((key) => ({ id: id + '.' + key, title: kind + ' ' + key }));
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name:
        kind === 'native'
          ? 'Native notifications'
          : kind === 'node'
            ? 'Node notifications'
            : 'Stopped notifications',
      version: '1.0.0',
      minimumHostVersion: '0.30.0',
      runtime: kind === 'native' ? 'native' : 'node',
      entry: kind === 'native' ? 'NotificationFixture.exe' : 'index.cjs',
      capabilities: ['notifications', 'storage'],
      commands,
      notificationTypes: [
        definition(
          kind === 'native' ? 'Native notice' : kind === 'node' ? 'Node notice' : 'Stopped notice',
        ),
      ],
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
      "exports.activate=async c=>{const id='" +
        id +
        "';c.commands.register(id+'.publish','Publish',async()=>c.storage.set('result',await c.notifications.publish({typeId:'message',title:'Node notification',body:'Node body',historyText:{title:'Safe node',body:'Safe'},dedupeKey:'episode',actions:[{key:'act',label:'Node action',command:id+'.action'}]})));c.commands.register(id+'.action','Action',async()=>{await new Promise(r=>setTimeout(r,50));await c.storage.set('acted',true)});c.commands.register(id+'.policy','Policy',async()=>c.storage.set('policy',await c.notifications.getPolicy('message')));c.notifications.onChanged(async()=>c.storage.set('changed',true));c.commands.register(id+'.bad','Bad',async()=>{let rejects=0;for(const input of [{typeId:'missing',title:'Bad',body:'Bad'},{typeId:'message',title:'Bad',body:'Bad',targets:['windows']},{typeId:'message',title:'Bad',body:'Bad',actions:[{key:'foreign',label:'Foreign',command:'fixture.notifications.native.action'}]}])try{await c.notifications.publish(input)}catch{rejects++}await c.storage.set('rejected',rejects)});c.commands.register(id+'.foreign','Foreign',async()=>{const foreign=require('node:fs').readFileSync(require('node:path').join(__dirname,'foreign.txt'),'utf8');let denied=false;try{await c.notifications.end(foreign)}catch{denied=true}await c.storage.set('foreignDenied',denied)});};",
    );
}
const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
initial.host.hardwareAcceleration = false;
initial.host.notifications = false;
initial.globalShortcutCommands = [];
for (const [kind, id] of Object.entries(ids))
  initial.extensions[id] = { enabled: kind !== 'stopped', settings: {} };
initial.notificationPreferences = {
  overrides: [
    { ownerKind: 'applet', ownerId: 'not.installed', typeId: 'retained', enabled: false },
  ],
};
initial.notificationPreferences.overrides.push(
  { ownerKind: 'applet', ownerId: ids.node, typeId: 'message', targets: [], durationSeconds: null },
  {
    ownerKind: 'applet',
    ownerId: ids.native,
    typeId: 'message',
    targets: [],
    durationSeconds: null,
  },
  { ownerKind: 'host', ownerId: 'updates', typeId: 'applied', durationSeconds: null },
  {
    ownerKind: 'host',
    ownerId: 'errors',
    typeId: 'operation-failed',
    targets: [],
    durationSeconds: null,
  },
);
const notificationDir = path.join(profile, 'data', 'notifications');
fs.mkdirSync(notificationDir, { recursive: true });
const now = Date.now();
const records = Array.from({ length: 121 }, (_, n) => ({
  id: 'seed-' + n,
  revision: 1,
  source: 'host.seed',
  level: n % 2 ? 'warning' : 'info',
  title: 'Seed history ' + n,
  body: 'Safe seed summary',
  status: n === 120 ? 'active' : 'resolved',
  createdAt: now - n * 1000,
  updatedAt: now - n * 1000,
  endedAt: now - n * 1000,
  read: false,
  targets: [],
  delivery: {},
}));
fs.writeFileSync(
  path.join(notificationDir, 'history.json'),
  JSON.stringify({ schemaVersion: 1, entries: records }),
);
fs.writeFileSync(
  path.join(profile, 'data', 'update-result.json'),
  JSON.stringify({ ok: true, time: new Date().toISOString(), message: '更新を適用しました。' }),
);

fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(initial));
const hash = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const portable = process.argv[2] ? path.join(profile, 'AppDock.at365.exe') : undefined;
if (portable) {
  require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), portable);
  assert.equal(hash(portable), hash(path.resolve(process.argv[2])));
}
const originalHistory = fs.readFileSync(path.join(notificationDir, 'history.json'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app, browser, child, host;
const checks = [];
async function until(fn, why) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error(why);
}
const pages = () => (portable ? browser.contexts().flatMap((c) => c.pages()) : browser.pages());
async function launch() {
  if (!portable) {
    app = await electron.launch({
      executablePath: require('electron'),
      args: [root, '--test-profile=' + profile],
      env,
    });
    browser = app.context();
    host = require('./settings-aware-page.cjs').settingsAwarePage(await app.firstWindow());
  } else {
    const probe = net.createServer();
    await new Promise((r) => probe.listen(0, '127.0.0.1', r));
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    child = spawn(portable, ['--test-profile=' + profile, '--remote-debugging-port=' + port], {
      cwd: profile,
      env,
      windowsHide: true,
      stdio: 'ignore',
    });
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
  }
  for (const page of pages())
    page.on('pageerror', (e) => console.error('RENDERER', page.url(), String(e)));
  const ctx = portable ? browser.contexts()[0] : browser;
  ctx.on('page', (page) => {
    page.on('pageerror', (e) => console.error('RENDERER', page.url(), String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') console.error('CONSOLE', page.url(), m.text());
    });
  });
  host.setDefaultTimeout(12000);
  await until(
    () =>
      host.evaluate(async () => {
        const s = await window.dock.snapshot();
        return (
          s.startupReady &&
          s.extensions
            .filter(
              (e) =>
                e.id === 'fixture.notifications.node' || e.id === 'fixture.notifications.native',
            )
            .every((e) => e.state === 'running')
        );
      }),
    'host and notification fixtures ready',
  );
  await require('./shell-overlay-helper.cjs').startupPage(host);
  await host.waitForFunction(
    () => document.querySelector('.shell')?.getAttribute('data-route') === 'settings',
  );
}
const command = (id) => host.evaluate((id) => window.dock.executeCommand(id), id);
const storage = (id, key) => {
  const f = path.join(profile, 'data/storage', id, key + '.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};
const saved = () => JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), 'utf8'));
async function settingsPage() {
  await host.evaluate(() => window.dock.navigate('settings'));
  const p = await require('./settings-host-helper.cjs').settingsPage(host);
  await p
    .locator('.settings-categories')
    .getByRole('button', { name: '通知', exact: true })
    .click();
  await p.getByRole('heading', { name: '通知', level: 1, exact: true }).waitFor();
  return p;
}
async function save(p) {
  await settleSettings(p);
  await until(
    () =>
      p.evaluate(() =>
        window.dock.settingsPage
          .get(document.querySelector('.settings-surface').dataset.settingsConnection)
          .then((m) => !m.content.editing.pending),
      ),
    'saved model',
  );
}
async function banner() {
  await host.evaluate(() => window.dock.navigate(null));
  const p = await until(
    () => pages().find((p) => p.url().endsWith('/shells/default/notifications.html')),
    'banner',
  );
  return p;
}
async function close() {
  if (!portable) {
    if (app) await app.close();
    app = null;
  } else {
    if (child?.exitCode === null) {
      await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
      await until(() => child.exitCode !== null, 'portable close');
    }
    await browser?.close();
  }
}
(async () => {
  let success = false;
  try {
    await launch();
    const notice = await banner();
    await notice.getByText('更新を適用しました', { exact: true }).waitFor();
    assert.equal(await host.getByLabel('更新のお知らせ').count(), 0);
    assert.equal((await host.evaluate(() => window.dock.snapshot())).updates.completion, undefined);
    checks.push(
      'updater result is a typed banner, not a statusbar completion; Applet global switch does not gate host updates',
    );
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, host: { ...s.settings.value.host, notifications: true } },
        s.settings.revision,
      );
    });
    await command(ids.node + '.publish');
    await command(ids.native + '.publish');
    const openCenter = async () => {
      await command('appdock.notifications.open');
      const p = host;
      await p.getByRole('heading', { name: '通知センター', exact: true }).waitFor();
      return p;
    };
    let center = await openCenter();
    const model = () => center.evaluate(() => window.dock.pages.get());
    const tab = async (name) => {
      await center.getByRole('button', { name: new RegExp('^' + name + ' ') }).click();
      await until(
        async () =>
          (await model()).content.filters.tab === (name === '履歴' ? 'history' : 'active'),
        'center tab',
      );
    };
    const card = (title) =>
      center.locator('.center-card').filter({ has: center.getByText(title, { exact: true }) });
    await card('Node notification').waitFor();
    await card('Native notification').waitFor();
    const idsActive = (await model()).content.items.map((i) => i.id);
    assert.equal(new Set(idsActive).size, 3);
    assert.equal(
      (await notice.evaluate(() => window.appdockNotifications.connect())).snapshot.items.length,
      1,
    );
    await card('Node notification')
      .getByRole('button', { name: 'Node action', exact: true })
      .click();
    await until(() => storage(ids.node, 'acted') === true, 'Node action');
    await card('Native notification')
      .getByRole('button', { name: 'Native action', exact: true })
      .click();
    await until(() => storage(ids.native, 'acted') === true, 'native action');
    checks.push(
      'real Node/.NET center-only active notifications retain owned actions and stay out of banner',
    );
    const rail = await until(
      () => pages().find((p) => p.url().endsWith('/shells/default/index.html')),
      'ribbon',
    );
    const badge = rail.locator('[data-ribbon-id="notifications"] .ribbon-badge');
    const expectBadge = async (count) => {
      await until(async () => {
        const item = (await rail.evaluate(() => window.appdockShell.get())).items.find(
          (i) => i.id === 'notifications',
        );
        return count ? item?.badge?.description === 'アクティブな通知: ' + count : !item?.badge;
      }, 'active count badge ' + count);
      if (count)
        await until(async () => (await badge.innerText()) === String(count), 'rendered badge');
      else assert.equal(await badge.count(), 0);
    };
    await expectBadge(3);
    await command(ids.node + '.publish'); // Same dedupe key updates one notification.
    await expectBadge(3);
    const toggleMode = async () =>
      rail.evaluate(async () => {
        const m = await window.appdockShell.get();
        await window.appdockShell.invoke({
          epoch: m.epoch,
          requestId: crypto.randomUUID(),
          actionId: m.items.find((i) => i.id === 'ribbon-display-mode').actionId,
        });
      });
    await toggleMode();
    await expectBadge(3);
    await toggleMode();
    assert.equal(await center.getByTestId('notification-center').getByRole('checkbox').count(), 0);
    assert.equal(await center.getByRole('button', { name: /既読|履歴.*削除/ }).count(), 0);
    assert.equal('unreadCount' in (await model()).content, false);
    assert.ok((await model()).content.items.every((i) => !('read' in i)));
    assert.equal(await center.getByText(/今回の起動中の通知です/).count(), 1);
    await tab('履歴');
    assert.equal((await model()).content.historyCount, 0);
    assert.deepEqual(fs.readFileSync(path.join(notificationDir, 'history.json')), originalHistory);
    await expectBadge(3);
    checks.push(
      'old disk history is ignored and untouched; no read/delete/selection UI; center navigation and dedupe do not decrement active badge; both ribbon modes use the badge',
    );
    await tab('アクティブ');
    await center.getByRole('button', { name: 'Node notificationを閉じる', exact: true }).click();
    await until(
      async () => !(await model()).content.items.some((i) => i.title === 'Node notification'),
      'Node closed',
    );
    await tab('履歴');
    await until(
      async () => (await model()).content.items.some((i) => i.title === 'Safe node'),
      'safe ended content',
    );
    assert.equal(await center.getByText('Node body', { exact: true }).count(), 0);
    assert.equal(await card('Safe node').getByRole('button').count(), 0);
    await expectBadge(2);
    await center.getByTestId('notification-search').fill('Safe node');
    await until(async () => (await model()).content.total === 1, 'session history search');
    await center.getByTestId('notification-search').fill('');
    await center.getByLabel('通知の状態', { exact: true }).selectOption('dismissed');
    await until(async () => (await model()).content.total === 1, 'dismissed session history');
    await center.getByLabel('通知の状態', { exact: true }).selectOption('all');
    await tab('アクティブ');
    // New arrivals do not change search focus, and model updates preserve view scroll.
    const list = center.locator('.notification-list');
    await list.evaluate((e) => {
      e.scrollTop = 30;
    });
    await center.getByLabel('通知を検索', { exact: true }).focus();
    await command(ids.node + '.publish');
    await until(
      async () => (await model()).content.items.some((i) => i.title === 'Node notification'),
      'new episode',
    );
    assert.equal(
      await center
        .getByLabel('通知を検索', { exact: true })
        .evaluate((e) => document.activeElement === e),
      true,
    );
    checks.push(
      'dismiss removes exactly one active badge count and retains safe session history without actions; search/state filters and new-arrival focus remain usable',
    );
    await expectBadge(3);
    for (const theme of ['dark', 'light']) {
      await host.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
      }, theme);
      await until(
        () => center.evaluate((theme) => document.documentElement.dataset.theme === theme, theme),
        'theme',
      );
      await center.screenshot({ path: path.join(profile, 'center-' + theme + '.png') });
    }
    checks.push('host notification center renders both themes in the root renderer');
    // Invalid gallery size is rejected before saving; its error and the update have distinct host owners.
    await assert.rejects(host.evaluate(() => window.dock.imageLibrary.saveGalleryWidth(-1)));
    await until(
      async () => (await model()).content.items.some((i) => i.ownerId === 'errors'),
      'host error notification',
    );
    const sourceFilter = center.getByLabel('通知の発行元', { exact: true });
    assert.equal(await sourceFilter.locator('option', { hasText: /^AppDock$/ }).count(), 1);
    await sourceFilter.selectOption('host');
    await until(async () => (await model()).content.total === 2, 'grouped host notifications');
    assert.deepEqual(
      new Set((await model()).content.items.map((i) => i.ownerId)),
      new Set(['updates', 'errors']),
    );
    await center.screenshot({ path: path.join(profile, 'source-appdock.png') });
    const error = (await model()).content.items.find((i) => i.ownerId === 'errors');
    await center.getByRole('button', { name: error.title + 'を閉じる', exact: true }).click();
    await tab('履歴');
    await until(async () => (await model()).content.total === 1, 'host history filter');
    assert.equal((await model()).content.items[0].ownerId, 'errors');
    await tab('アクティブ');
    await sourceFilter.selectOption('applet.' + ids.node);
    await until(async () => (await model()).content.total === 1, 'applet source filter');
    assert.equal((await model()).content.items[0].ownerId, ids.node);
    await sourceFilter.selectOption('');
    checks.push(
      'one AppDock source includes update/error owners in active and history; Applet filtering stays independent',
    );
    // A retired page assignment must stay inert and preserve ordinary Shell operation.
    if (!portable) {
      const p = path.join(profile, 'extensions/fixture.center');
      fs.mkdirSync(p, { recursive: true });
      // Installed before restart below, so discovery never starts an Applet merely for history.
      fs.writeFileSync(path.join(p, 'worker.cjs'), 'exports.activate=async()=>{};');
      fs.writeFileSync(
        path.join(p, 'notification-center.html'),
        '<!doctype html><p>Retired page Shell must never start</p>',
      );
      fs.writeFileSync(
        path.join(p, 'extension.json'),
        JSON.stringify({
          apiVersion: 1,
          id: 'fixture.center',
          name: 'Center Shell',
          version: '1.0.0',
          runtime: 'node',
          entry: 'worker.cjs',
          minimumHostVersion: '0.31.0',
          capabilities: ['shell'],
          shell: { apiVersion: 1, views: { 'page.notifications': 'notification-center.html' } },
        }),
      );
      await host.evaluate(async () => {
        const state = await window.dock.snapshot();
        state.settings.value.extensions['fixture.center'] = { enabled: true, settings: {} };
        state.settings.value.host.shellProviders = { 'page.notifications': 'fixture.center' };
        await window.dock.saveSettings(state.settings.value, state.settings.revision);
      });
    }
    await close();
    await launch();
    center = await openCenter();
    assert.equal(
      (await model()).content.items.some((i) => i.ownerId === 'updates'),
      false,
    );
    await tab('履歴');
    await center.getByLabel('通知を検索', { exact: true }).fill('Native');
    assert.equal((await model()).content.historyCount, 0);
    assert.equal((await model()).content.activeCount, 0);
    const restartRail = await until(
      () => pages().find((p) => p.url().endsWith('/shells/default/index.html')),
      'restarted ribbon',
    );
    assert.equal(
      await restartRail.locator('[data-ribbon-id="notifications"] .ribbon-badge').count(),
      0,
    );
    assert.deepEqual(fs.readFileSync(path.join(notificationDir, 'history.json')), originalHistory);
    assert.equal(
      await center.getByRole('button', { name: 'Native action', exact: true }).count(),
      0,
    );
    checks.push(
      'restart discards active and ended session notifications, badge is absent at zero, old history file stays untouched and update receipt prevents replay',
    );
    if (!portable) {
      assert.equal(center, host);
      assert(!pages().some((p) => p.url().includes('/fixture.center/')));
      assert(
        !(await host.evaluate(() => window.dock.snapshot())).shellRegions.regions.some((r) =>
          r.region.startsWith('page.'),
        ),
      );
      assert.equal(
        (await host.evaluate(() => window.dock.snapshot())).settings.value.host.shellProviders[
          'page.notifications'
        ],
        'fixture.center',
      );
      assert.equal((await model()).content.filters.text, 'Native');
      checks.push('retired center assignment is preserved without loading a page Shell');
    }
    success = true;
  } catch (e) {
    console.error(e);
    for (const p of pages())
      console.error(
        'PAGE',
        p.url(),
        await p
          .locator('body')
          .innerText()
          .catch(() => ''),
      );
    process.exitCode = 1;
  } finally {
    await close().catch((e) => {
      console.error(e);
      success = false;
      process.exitCode = 1;
    });
    const result = {
      success,
      profile,
      checks,
      version: require('../package.json').version,
      portable: !!portable,
      sha256: portable ? hash(portable) : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
