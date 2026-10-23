const { _electron: electron, chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const { resolveAppearance } = require('../out/main/shared/appearance');
const portable = process.argv[2] && path.resolve(process.argv[2]);
const profile = path.join(root, '.artifacts', 'notification-colors-' + Date.now());
const hash = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const levels = ['info', 'warning', 'error'];
const ids = ['fixture.notification.colors', 'fixture.notifications.native'];
const definition = (level, typeId = level) => ({
  typeId,
  title: 'Level ' + level,
  description: 'Notification level fixture',
  levels,
  defaultLevel: level,
  defaultEnabled: true,
  canDisable: true,
  disabledControlReason: '',
  allowedTargets: ['banner', 'desktop'],
  defaultTargets: ['banner', 'desktop'],
  requiredTargets: [],
  lifetimePolicy: 'userDuration',
  defaultDurationSeconds: null,
  history: 'persistent',
});
fs.mkdirSync(profile, { recursive: true });
for (const [index, id] of ids.entries()) {
  const folder = path.join(profile, 'extensions', id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name: 'Notification colors ' + index,
      version: '1.0.0',
      minimumHostVersion: '0.31.1',
      runtime: index ? 'native' : 'node',
      entry: index ? 'NotificationFixture.exe' : 'index.cjs',
      capabilities: ['notifications', 'storage'],
      commands: (index ? ['publish', 'action', 'policy'] : ['publish', 'override', 'action']).map(
        (key) => ({ id: id + '.' + key, title: key }),
      ),
      notificationTypes: index
        ? [definition('warning', 'message')]
        : levels.map((l) => definition(l)),
    }),
  );
  if (index)
    fs.cpSync(
      path.join(root, 'tests/fixtures/dotnet/AppDock.Notifications/bin/Release/net10.0'),
      folder,
      { recursive: true },
    );
  else
    fs.writeFileSync(
      path.join(folder, 'index.cjs'),
      `exports.activate=async c=>{
    const id=${JSON.stringify(id)};
    c.commands.register(id+'.action','Action',async()=>c.storage.set('acted',true));
    const publish=(typeId,level)=>c.notifications.publish({typeId,...(level?{level}:{}),title:'Level '+typeId,body:'共通の通知配色を確認します。',historyText:{title:'Level '+typeId,body:'保存された通知です。'},actions:[{key:'action',label:'確認する',command:id+'.action',primary:true}]});
    c.commands.register(id+'.publish','Publish',async()=>{for(const l of ['info','warning','error'])await publish(l)});
    c.commands.register(id+'.override','Override',async()=>publish('info','error'));
  };`,
    );
}
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.checkForUpdatesOnStartup = false;
settings.host.theme = 'dark';
settings.host.accentColor = 'alice-blue';
settings.keybindings = [];
settings.globalShortcutCommands = [];
settings.gestures.enabled = false;
for (const id of ids) settings.extensions[id] = { enabled: true, settings: {} };
settings.notificationPreferences = {
  overrides: [
    { ownerKind: 'host', ownerId: 'information', typeId: 'operation-completed', enabled: false },
  ],
};
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const exe = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) {
  fs.copyFileSync(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await pause(80);
  }
  throw Error(label);
}
let app, browser, child, host;
const checks = [],
  styles = [];
const pages = () => (portable ? browser.contexts().flatMap((c) => c.pages()) : app.windows());
const command = (id) => host.evaluate((id) => window.dock.executeCommand(id), id);
async function surface(kind) {
  return until(async () => {
    for (const p of pages().filter((p) => p.url().endsWith('/notifications.html'))) {
      const m = (await p.evaluate(() => window.appdockNotifications.connect())).snapshot;
      if (m.surface === kind && m.items.length) return p;
    }
  }, kind);
}
async function dismiss(b) {
  await b.evaluate(async () => {
    const { snapshot } = await window.appdockNotifications.connect();
    for (const n of snapshot.items)
      await window.appdockNotifications.act({
        notificationId: n.id,
        revision: n.revision,
        type: 'dismiss',
        requestId: crypto.randomUUID(),
      });
  });
}
function contrast(a, b) {
  const luminance = (s) =>
    s
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
async function inspectColors(page, selector, theme, kind) {
  await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, theme);
  await page.locator(selector).last().waitFor();
  const rows = await page.locator(selector).evaluateAll((cards) =>
    cards.map((card) => {
      const c = getComputedStyle(card),
        label = card.querySelector('.notification-level,.center-card-level'),
        body = card.querySelector('.notification-copy p,.notification-body'),
        muted = card.querySelector('.muted'),
        button = card.querySelector('button');
      const bs = button && getComputedStyle(button);
      return {
        level: ['info', 'warning', 'error'].find((l) => card.classList.contains('level-' + l)),
        bg: c.backgroundColor,
        text: c.color,
        border: c.borderLeftColor,
        label: getComputedStyle(label).color,
        body: getComputedStyle(body).color,
        muted: muted && getComputedStyle(muted).color,
        button: bs && { text: bs.color, bg: bs.backgroundColor },
      };
    }),
  );
  assert.deepEqual(rows.map((r) => r.level).sort(), [...levels].sort());
  for (const row of rows) {
    assert.equal(row.border, row.label);
    for (const color of [row.text, row.body, row.label, row.muted].filter(Boolean))
      assert(contrast(color, row.bg) >= 4.5, `${kind} ${theme} ${row.level} text contrast`);
    if (row.button)
      assert(contrast(row.button.text, row.button.bg) >= 4.5, `${kind} ${theme} button contrast`);
    if (row.level === 'info') {
      assert.equal(row.bg, theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(25, 27, 35)');
      const accent = resolveAppearance('alice-blue', theme === 'dark').colors.accent;
      const rgb = accent.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16));
      assert.equal(row.border, `rgb(${rgb.join(', ')})`);
    }
  }
  styles.push({ theme, kind, rows });
  await page.screenshot({ path: path.join(profile, kind + '-' + theme + '.png') });
}
async function main() {
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const args = [
    ...(portable ? [] : [root]),
    '--test-profile=' + profile,
    '--test-local-state=' + path.join(profile, 'local-state'),
    '--remote-debugging-port=' + port,
  ];
  if (portable) {
    child = spawn(exe, args, { cwd: profile, env, windowsHide: true, stdio: 'ignore' });
    browser = await until(
      () => chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 }),
      'CDP',
    );
  } else app = await electron.launch({ executablePath: exe, args, env, timeout: 45000 });
  host = await until(() => pages().find((p) => p.url().startsWith('appdock://host/')), 'host');
  await until(async () => {
    const s = await host.evaluate(() => window.dock.snapshot());
    return (
      s.startupReady &&
      ids.every((id) => s.extensions.some((e) => e.id === id && e.state === 'running'))
    );
  }, 'fixtures running');
  await require('./shell-overlay-helper.cjs').startupPage(host);
  await command(ids[0] + '.publish');
  const banner = await surface('banner'),
    desktop = await surface('desktop');
  const model = (await banner.evaluate(() => window.appdockNotifications.connect())).snapshot;
  for (const level of levels)
    assert.equal(model.items.find((i) => i.typeId === level).level, level);
  await command('appdock.notifications.open');
  const center = await until(
    () => pages().find((p) => p.url().endsWith('/notification-center.html')),
    'center',
  );
  for (const theme of ['dark', 'light']) {
    await host.evaluate(async (theme) => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, host: { ...s.settings.value.host, theme } },
        s.settings.revision,
      );
    }, theme);
    await inspectColors(banner, '.notification-card', theme, 'banner');
    await inspectColors(desktop, '.notification-card', theme, 'desktop');
    await inspectColors(center, '.center-card', theme, 'center');
  }
  checks.push(
    'manifest defaults select all three levels; shared colors and readable text/buttons in banner, desktop and center in both themes',
  );
  await banner.locator('.level-info button.primary').click();
  await until(
    () => fs.existsSync(path.join(profile, 'local-state/storage', ids[0], 'acted.json')),
    'owned action',
  );
  checks.push('information primary action remains executable');
  await dismiss(banner);
  await command(ids[0] + '.override');
  await until(async () => {
    const m = (await banner.evaluate(() => window.appdockNotifications.connect())).snapshot;
    return m.items.length === 1 && m.items[0].level === 'error';
  }, 'explicit override');
  await banner.locator('.level-error').waitFor();
  await dismiss(banner);
  await command(ids[1] + '.publish');
  await until(async () => {
    const m = (await banner.evaluate(() => window.appdockNotifications.connect())).snapshot;
    return m.items.length === 1 && m.items[0].level === 'warning';
  }, 'native default');
  await banner.locator('.level-warning').waitFor();
  checks.push(
    'explicit Node level overrides its default; real .NET publication inherits registered warning level',
  );
  await dismiss(banner);
  await command('appdock.settings.open');
  const p = await require('./settings-host-helper.cjs').settingsPage(host);
  await p
    .locator('.settings-categories')
    .getByRole('button', { name: '通知', exact: true })
    .click();
  await p.locator('.notification-settings').waitFor();
  assert.equal(await p.getByRole('button', { name: '既定に戻す', exact: true }).count(), 0);
  await p
    .locator('.notification-setting-card')
    .filter({ has: p.getByRole('heading', { name: 'インフォメーション通知', exact: true }) })
    .locator('summary')
    .click();
  await p.getByLabel('インフォメーション通知の表示時間', { exact: true }).fill('8');
  await p.getByLabel('インフォメーション通知の表示時間', { exact: true }).press('Tab');
  await require('./settings-immediate-helper.cjs').settleSettings(p);
  await until(
    () =>
      JSON.parse(
        fs.readFileSync(path.join(profile, 'settings.json')),
      ).notificationPreferences.overrides.some(
        (r) => r.ownerId === 'information' && r.durationSeconds === 8,
      ),
    'saved duration',
  );
  await p.screenshot({ path: path.join(profile, 'settings.png') });
  checks.push('reset buttons removed; per-type duration still saves immediately');
}
(async () => {
  let ok = false;
  try {
    await main();
    ok = true;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (host && !host.isClosed()) await command('appdock.quit').catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (app) await app.close().catch(() => {});
    if (child)
      await until(() => child.exitCode !== null, 'portable exit').catch((e) => {
        console.error(e);
        ok = false;
        process.exitCode = 1;
      });
    const result = {
      ok,
      profile,
      mode: portable ? 'portable' : 'source',
      version: require('../package.json').version,
      exeHash: portable ? hash(exe) : undefined,
      checks,
      styles,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
