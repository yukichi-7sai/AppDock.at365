const { settleSettings } = require('./settings-immediate-helper.cjs');
const { _electron: electron, chromium } = require('playwright');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { spawn } = require('node:child_process'),
  net = require('node:net'),
  { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', 'notification-settings-' + Date.now());
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
        "';c.commands.register(id+'.publish','Publish',async()=>c.storage.set('result',await c.notifications.publish({typeId:'message',title:'Node notification',body:'Node body',historyText:{title:'Safe node',body:'Safe'},dedupeKey:'episode',restartTimer:true,actions:[{key:'act',label:'Node action',command:id+'.action'}]})));c.commands.register(id+'.action','Action',async()=>c.storage.set('acted',true));c.commands.register(id+'.policy','Policy',async()=>c.storage.set('policy',await c.notifications.getPolicy('message')));c.notifications.onChanged(async()=>c.storage.set('changed',true));c.commands.register(id+'.bad','Bad',async()=>{let rejects=0;for(const input of [{typeId:'missing',title:'Bad',body:'Bad'},{typeId:'message',title:'Bad',body:'Bad',targets:['windows']},{typeId:'message',title:'Bad',body:'Bad',actions:[{key:'foreign',label:'Foreign',command:'fixture.notifications.native.action'}]}])try{await c.notifications.publish(input)}catch{rejects++}await c.storage.set('rejected',rejects)});c.commands.register(id+'.foreign','Foreign',async()=>{const foreign=require('node:fs').readFileSync(require('node:path').join(__dirname,'foreign.txt'),'utf8');let denied=false;try{await c.notifications.end(foreign)}catch{denied=true}await c.storage.set('foreignDenied',denied)});};",
    );
}
const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
// Exercise both themes independently of the product's initial theme.
initial.host.theme = 'dark';
initial.host.hardwareAcceleration = false;
initial.globalShortcutCommands = [];
for (const [kind, id] of Object.entries(ids))
  initial.extensions[id] = { enabled: kind !== 'stopped', settings: {} };
initial.notificationPreferences = {
  overrides: [
    { ownerKind: 'applet', ownerId: 'not.installed', typeId: 'retained', enabled: false },
    // Command-result banners must not crowd the Applet notices under test out of the viewport.
    {
      ownerKind: 'host',
      ownerId: 'information',
      typeId: 'operation-completed',
      durationSeconds: 1,
    },
  ],
};
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
  host.on('pageerror', (e) => console.error('RENDERER', String(e)));
  host.setDefaultTimeout(12000);
  await host.waitForFunction(async () => {
    const s = await window.dock?.snapshot();
    return (
      s?.startupReady &&
      s.extensions
        .filter(
          (e) => e.id === 'fixture.notifications.node' || e.id === 'fixture.notifications.native',
        )
        .every((e) => e.state === 'running')
    );
  });
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
  for (const card of await p.locator('.notification-setting-card').all())
    if (!(await card.evaluate((e) => e.open))) await card.locator(':scope > summary').click();
  const delivery = p
    .locator('details')
    .filter({ has: p.getByRole('heading', { name: '通知の受け取り方', exact: true }) });
  if (!(await delivery.evaluate((e) => e.open))) await delivery.locator(':scope > summary').click();
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
    let p = await settingsPage();
    assert.equal(
      await p.getByRole('switch', { name: '旧方式の通知を通知', exact: true }).count(),
      0,
    );
    assert.equal(
      await p.getByRole('switch', { name: '未保存の変更を通知', exact: true }).count(),
      0,
    );
    await p.getByRole('heading', { name: 'Stopped notice', exact: true }).waitFor();
    assert.equal(await p.getByRole('switch', { name: /noticeを通知$/ }).count(), 0);
    await p.locator('summary').filter({ hasText: '現在利用できない種類' }).click();
    await p.getByText('not.installed / retained', { exact: true }).waitFor();
    assert.equal(
      await p.getByLabel('Node noticeのデスクトップ通知', { exact: true }).isDisabled(),
      false,
    );
    assert.equal(
      await p.getByLabel('Node noticeのWindows通知', { exact: true }).isDisabled(),
      false,
    );
    checks.push(
      'static catalog includes host types without obsolete settings warning, stopped Applet and retained unknown types; desktop and Windows enabled',
    );
    await command(ids.node + '.publish');
    await command(ids.native + '.publish');
    await command(ids.native + '.policy');
    assert.equal(storage(ids.native, 'policy').lifetime.milliseconds, 60000);
    let b = await banner();
    await b.getByRole('button', { name: 'Node action', exact: true }).click();
    await b.getByRole('button', { name: 'Native action', exact: true }).click();
    assert.equal(storage(ids.node, 'acted'), true);
    assert.equal(storage(ids.native, 'acted'), true);
    const nativeId = storage(ids.native, 'result').notificationId;
    checks.push('real Node and .NET API publish accepted banners; owned command actions execute');
    p = await settingsPage();
    await p.getByLabel('Node noticeの通知センターのみ', { exact: true }).check();
    await save(p);
    await command(ids.node + '.publish');
    assert.equal(storage(ids.node, 'result').status, 'accepted');
    b = await banner();
    await until(
      async () => !(await b.getByRole('button', { name: 'Node action', exact: true }).count()),
      'center-only banner withdrawn',
    );
    const nativeRegions = await b
      .getByRole('region', { name: 'Native notification', exact: true })
      .count();
    assert.equal(nativeRegions, 1);
    checks.push(
      'center-only keeps notifications accepted without banners and preserves other owners',
    );
    p = await settingsPage();
    await p.getByLabel('Node noticeのバナー', { exact: true }).check();
    await p.getByLabel('Node noticeの表示時間', { exact: true }).fill('5');
    await save(p);
    b = await banner();
    await command(ids.node + '.publish');
    await b.getByRole('button', { name: 'Node action', exact: true }).waitFor();
    await until(
      async () => !(await b.getByRole('button', { name: 'Node action', exact: true }).count()),
      'timed expiry',
    );
    p = await settingsPage();
    await p.getByLabel('Node noticeの表示時間', { exact: true }).fill('');
    await save(p);
    b = await banner();
    await command(ids.node + '.publish');
    await command(ids.node + '.policy');
    assert.equal(storage(ids.node, 'policy').lifetime.type, 'manual');
    await b.getByRole('button', { name: 'Node action', exact: true }).waitFor();
    await new Promise((r) => setTimeout(r, 5600));
    assert.equal(await b.getByRole('button', { name: 'Node action', exact: true }).count(), 1);
    checks.push(
      'positive seconds expire; explicit empty duration is manual and survives former deadline',
    );
    await command(ids.node + '.bad');
    assert.equal(storage(ids.node, 'rejected'), 3);
    fs.writeFileSync(path.join(profile, 'extensions', ids.node, 'foreign.txt'), nativeId);
    await command(ids.node + '.foreign');
    assert.equal(storage(ids.node, 'foreignDenied'), true);
    const stale = await b.evaluate(() =>
      window.appdockNotifications.connect().then((c) => {
        const i = c.snapshot.items.find((i) => i.ownerId === 'fixture.notifications.node');
        return {
          notificationId: i.id,
          revision: i.revision,
          type: 'invoke',
          actionId: i.actions[0].id,
          requestId: 'after-stop',
        };
      }),
    );
    await host.evaluate((id) => window.dock.toggleExtension(id, false), ids.node);
    assert.equal(
      await b.evaluate(
        (req) =>
          window.appdockNotifications.act(req).then(
            () => false,
            () => true,
          ),
        stale,
      ),
      true,
    );
    checks.push(
      'undeclared type, caller lifetime/target bypass and foreign actions/end rejected; stopped generation cannot execute',
    );
    p = await settingsPage();
    await p.getByLabel('Native noticeの表示時間', { exact: true }).fill('0');
    await settleSettings(p);
    await p.getByRole('alert').waitFor();
    assert.equal(await p.getByLabel('Native noticeの表示時間', { exact: true }).inputValue(), '0');
    assert.equal(
      saved().notificationPreferences.overrides.some((r) => r.ownerId === ids.native),
      false,
    );
    await p.getByLabel('Native noticeの表示時間', { exact: true }).fill('');
    await save(p);
    assert.equal(
      await p.getByRole('switch', { name: 'Appletからの通知を許可', exact: true }).count(),
      0,
    );
    await command(ids.native + '.publish');
    assert.equal(storage(ids.native, 'result').status, 'accepted');
    await until(() => storage(ids.native, 'changed') === true, 'native policy event');
    await until(() => storage(ids.node, 'changed') === true, 'node policy event');
    checks.push(
      'invalid form remains local and never persists; notifications remain accepted and policy subscriptions work for both SDKs',
    );
    await p.getByLabel('設定を検索', { exact: true }).fill('Stopped notice');
    await p.getByRole('option').filter({ hasText: 'Stopped notice' }).click();
    await until(
      () =>
        p
          .locator('[data-setting-item]')
          .evaluateAll((nodes) => nodes.some((n) => n.classList.contains('setting-highlight'))),
      'search anchor',
    );
    await p.getByLabel('設定を検索', { exact: true }).fill('');
    const nodeCard = p
      .locator('.notification-setting-card')
      .filter({ has: p.getByRole('heading', { name: 'Node notice', exact: true }) });
    assert.equal(await p.getByRole('button', { name: '既定に戻す', exact: true }).count(), 0);
    await nodeCard.getByLabel('Node noticeの表示時間', { exact: true }).fill('12');
    await save(p);
    assert.equal(
      saved().notificationPreferences.overrides.find((r) => r.ownerId === ids.node).durationSeconds,
      12,
    );
    await host.evaluate((id) => window.dock.toggleExtension(id, true), ids.node);
    await command(ids.node + '.policy');
    assert.equal(storage(ids.node, 'policy').durationSeconds, 12);
    p = await settingsPage();
    await p.screenshot({ path: path.join(profile, 'notifications-dark.png') });
    await p
      .locator('.settings-categories')
      .getByRole('button', { name: '表示', exact: true })
      .click();
    await p.getByLabel('テーマ', { exact: true }).selectOption('light');
    await save(p);
    p = await settingsPage();
    await p.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await p.screenshot({ path: path.join(profile, 'notifications-light.png') });
    checks.push(
      'search reaches a stable kind anchor, reset buttons are absent, individual edits preserve other kinds, both themes render',
    );
    await close();
    await launch();
    p = await settingsPage();
    assert.equal(await p.getByLabel('Native noticeの表示時間', { exact: true }).inputValue(), '');
    assert.equal(await p.getByLabel('Node noticeの表示時間', { exact: true }).inputValue(), '12');
    await p.locator('summary').filter({ hasText: '現在利用できない種類' }).click();
    await p.getByText('not.installed / retained', { exact: true }).waitFor();
    const historyFile = path.join(profile, 'data/notifications/history.json');
    await until(
      () =>
        fs.existsSync(historyFile) &&
        JSON.parse(fs.readFileSync(historyFile, 'utf8')).entries.some(
          (i) => i.typeId === 'message' && i.status === 'interrupted',
        ),
      'typed safe history restart',
    );
    assert.equal(fs.readFileSync(historyFile, 'utf8').includes('Node body'), false);
    checks.push(
      'shared preferences and safe type history survive restart; old callbacks and inactive events do not replay',
    );
    success = true;
  } catch (e) {
    console.error(e);
    for (const page of pages())
      console.error(
        'PAGE',
        page.url(),
        await page
          .locator('body')
          .innerText()
          .catch(() => ''),
      );
    console.error(
      'HOSTDOM',
      await host.evaluate(() => ({
        main: document.querySelector('main')?.outerHTML?.slice(0, 6000),
        hidden: document.querySelector('.settings-page')?.hidden,
        slots: [...document.querySelectorAll('.host-page-slot')].map((e) => ({
          rect: e.getBoundingClientRect().toJSON(),
          html: e.outerHTML,
        })),
      })),
    );
    console.error(
      'HOSTSTATE',
      await host
        .evaluate(() => window.dock.snapshot())
        .then((s) => ({ route: s.navigation.route, shell: s.shell, logs: s.logs.slice(-5) }))
        .catch(() => null),
    );
    process.exitCode = 1;
    try {
      await (
        await require('./settings-host-helper.cjs').settingsPage(host)
      ).screenshot({ path: path.join(profile, 'failure.png') });
    } catch {}
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
      portable: portable ? { path: portable, sha256: hash(portable) } : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
