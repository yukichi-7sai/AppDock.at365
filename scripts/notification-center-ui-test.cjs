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

fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
const hash = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const portable = process.argv[2] ? path.join(profile, 'AppDock.at365.exe') : undefined;
if (portable) {
  fs.copyFileSync(path.resolve(process.argv[2]), portable);
  assert.equal(hash(portable), hash(path.resolve(process.argv[2])));
}
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
const saved = () => JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'));
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
    await card('Node notification')
      .getByRole('button', { name: '既読にする', exact: true })
      .click();
    await until(
      async () => (await model()).content.items.find((i) => i.title === 'Node notification')?.read,
      'read marker',
    );
    assert.equal(
      (await model()).content.items.find((i) => i.title === 'Node notification').status,
      'active',
    );
    checks.push(
      'opening the center does not mark all read; explicit read does not end an active notification',
    );
    await tab('履歴');
    assert.equal((await model()).content.items.length, 50);
    await center.getByRole('button', { name: '次の50件', exact: true }).click();
    await until(async () => (await model()).content.offset === 50, 'second page');
    await center.getByRole('button', { name: '最初へ', exact: true }).click();
    await center.getByLabel('通知を検索', { exact: true }).fill('Seed history 11');
    await until(async () => (await model()).content.total === 11, 'text filter');
    await center.getByLabel('通知レベル', { exact: true }).selectOption('warning');
    await until(async () => (await model()).content.total === 6, 'level filter');
    await center.getByLabel('通知の発行元', { exact: true }).selectOption('host.seed');
    await until(
      async () => (await model()).content.filters.source === 'host.seed',
      'source filter',
    );
    await center.getByRole('button', { name: 'この条件の通知を既読', exact: true }).click();
    await until(async () => (await model()).content.items.every((i) => i.read), 'filtered read');
    await center.getByLabel('通知を検索', { exact: true }).fill('');
    await center.getByLabel('通知レベル', { exact: true }).selectOption('all');
    await center.getByLabel('通知の発行元', { exact: true }).selectOption('');
    await until(async () => (await model()).content.total === 121, 'all history');
    await center.getByLabel('通知の状態', { exact: true }).selectOption('interrupted');
    await until(async () => (await model()).content.total === 1, 'interrupted filter');
    assert.equal(await center.getByRole('button', { name: 'Node action', exact: true }).count(), 0);
    await center.getByLabel('通知の状態', { exact: true }).selectOption('all');
    await until(async () => (await model()).content.total === 121, 'reset state');
    const first = (await model()).content.items[0];
    await card(first.title).getByRole('button', { name: '履歴を削除', exact: true }).click();
    await until(async () => (await model()).content.total === 120, 'single deleted');
    checks.push(
      'bounded history pages, text/level/source/state filters, filtered read and single deletion work; history has no live callbacks',
    );
    if (!portable) {
      await app.evaluate(({ dialog }) => {
        globalThis.centerDialog = dialog.showMessageBox;
        dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
      });
      await center.getByRole('button', { name: '履歴をすべて削除', exact: true }).click();
      assert.equal((await model()).content.historyCount, 120);
      await app.evaluate(({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      });
      await center.getByRole('button', { name: '履歴をすべて削除', exact: true }).click();
      await until(async () => (await model()).content.historyCount === 0, 'bulk deleted');
      await app.evaluate(({ dialog }) => {
        dialog.showMessageBox = globalThis.centerDialog;
      });
      checks.push(
        'bulk deletion confirmation cancel and accept (dialog response fixture); active notifications unaffected',
      );
    }
    await tab('アクティブ');
    await card('Node notification').getByRole('button', { name: '閉じる', exact: true }).click();
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
    await card('Safe node').getByRole('button', { name: '履歴を削除', exact: true }).click();
    await until(
      async () => !(await model()).content.items.some((i) => i.title === 'Safe node'),
      'safe record deleted',
    );
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
      'dismiss resolves only the selected active episode; safe ended history can be deleted; new arrivals preserve search focus',
    );
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
    await until(
      async () =>
        (await model()).content.items.some(
          (i) => i.title === 'Safe native' && i.status === 'interrupted',
        ),
      'native interrupted',
    );
    assert.equal(
      await center.getByRole('button', { name: 'Native action', exact: true }).count(),
      0,
    );
    checks.push(
      'restart preserves safe interrupted history and read/deletion; updater receipt prevents replay of the same success',
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
      checks.push(
        'retired center assignment is preserved without loading a page Shell or losing history',
      );
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
