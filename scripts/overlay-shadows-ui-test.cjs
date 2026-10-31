const fs = require('node:fs'),
  path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { waitForHost, settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const { overlayPage } = require('./shell-overlay-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `overlay-shadows-ui-${Date.now()}`);
const fixtureId = 'fixture.overlay-shadows';
const folder = path.join(profile, 'extensions', fixtureId);
fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(
  path.join(folder, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: fixtureId,
    name: 'Overlay shadow fixture',
    version: '1.0.0',
    minimumHostVersion: '0.31.1',
    runtime: 'node',
    entry: 'index.cjs',
    capabilities: ['notifications'],
    commands: [{ id: fixtureId + '.publish', title: 'Shadow probe' }],
    notificationTypes: [
      {
        typeId: 'probe',
        title: 'Shadow probe',
        description: 'Isolated presentation fixture',
        levels: ['info'],
        defaultLevel: 'info',
        allowedTargets: ['banner', 'desktop'],
        defaultTargets: ['banner', 'desktop'],
        requiredTargets: [],
        lifetimePolicy: 'userDuration',
        defaultDurationSeconds: null,
        history: 'session',
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(folder, 'index.cjs'),
  `exports.activate=async c=>{c.commands.register('${fixtureId}.publish','Shadow probe',async()=>c.notifications.publish({typeId:'probe',title:'影の表示を確認',body:'バナーとデスクトップ通知の影を個別に切り替えます。'}));};`,
);
const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(initial.host, {
  hardwareAcceleration: false,
  soundEnabled: false,
  closeToTray: false,
  theme: 'dark',
});
initial.keybindings = [];
initial.keybindingOptions.enabled = false;
initial.gestures.enabled = false;
initial.touchpadGestures.enabled = false;
initial.updates.checkHostOnStartup = false;
initial.updates.checkAppletsOnStartup = false;
initial.extensions[fixtureId] = { enabled: true, settings: {} };
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(initial));
const source = process.argv[2] && path.resolve(process.argv[2]);
const exe = source ? path.join(profile, 'AppDock.at365.exe') : require('electron');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (source) {
  require('./copy-host.cjs').copyHost(source, exe);
  assert.equal(hash(exe), hash(source));
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app, host;
const checks = [],
  errors = [];
async function start() {
  app = await launchTestHost({
    executablePath: exe,
    portable: !!source,
    args: [
      ...(source ? [] : [root]),
      `--test-profile=${profile}`,
      `--test-local-state=${path.join(profile, 'local')}`,
    ],
    env,
  });
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    host = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('appdock://host/'));
    if (host) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert(host);
  host.setDefaultTimeout(15000);
  host.on('pageerror', (error) => errors.push(error.message));
  await waitForHost(host, async () => (await window.dock.snapshot()).startupReady);
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock://host/'),
    );
    w.setSize(1100, 900);
    w.show();
    w.focus();
  });
}
async function editHost(patch) {
  await host.evaluate(async (patch) => {
    const s = await window.dock.snapshot();
    await window.dock.saveSettings(
      { ...s.settings.value, host: { ...s.settings.value.host, ...patch } },
      s.settings.revision,
    );
  }, patch);
}
const saved = () => host.evaluate(async () => (await window.dock.snapshot()).settings.value.host);
async function openSettings(page) {
  await host.evaluate((id) => window.dock.executeCommand(`appdock.settings.${id}.open`), page);
  await settingsPage(host);
  await host.getByTestId('settings-page:' + page).waitFor();
  await settleSettings(host);
}
async function expand(id) {
  const section = host.getByTestId(id);
  if (!(await section.evaluate((el) => el.open))) {
    const summary = section.locator(':scope > summary');
    await summary.focus();
    await summary.press('Enter');
  }
}
async function switchTo(label, key, value) {
  const button = host.getByRole('switch', { name: label, exact: true });
  if ((await button.getAttribute('aria-checked')) !== String(value)) {
    await button.focus();
    await button.press('Space');
  }
  await settleSettings(host);
  assert.equal((await saved())[key], value);
}
async function expectShadow(page, selector, on) {
  await page.waitForFunction(
    ({ selector, on }) => {
      const el = document.querySelector(selector);
      return el && (getComputedStyle(el).boxShadow !== 'none') === on;
    },
    { selector, on },
  );
}
async function openPalette() {
  await host.evaluate(() => window.dock.executeCommand('appdock.commands.search'));
  const page = await overlayPage(host);
  await page.getByRole('combobox').fill('appdock.settings.appearance.open');
  return page;
}
async function closePalette(page) {
  await page.keyboard.press('Escape');
  await waitForHost(host, async () => !(await window.dock.snapshot()).overlay.active);
}
async function notificationPages() {
  const result = {};
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    for (const page of app
      .context()
      .pages()
      .filter((p) => p.url().endsWith('/notifications.html'))) {
      const state = await page
        .evaluate(() => window.appdockNotifications.connect())
        .catch(() => null);
      if (state?.snapshot.items.some((item) => item.title === '影の表示を確認'))
        result[state.snapshot.surface || 'banner'] = page;
    }
    if (result.banner && result.desktop) {
      for (const page of Object.values(result))
        await page.getByRole('region', { name: '影の表示を確認', exact: true }).waitFor();
      return result;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error('Notification surfaces did not become ready');
}
async function notificationIdentity(page) {
  return page.evaluate(async () => {
    const { sessionId, snapshot } = await window.appdockNotifications.connect();
    return {
      sessionId,
      items: snapshot.items.map(({ id, createdAt, expiresAt }) => ({ id, createdAt, expiresAt })),
    };
  });
}
(async () => {
  try {
    await start();
    await openSettings('appearance');
    await host
      .getByRole('switch', { name: 'ダイアログ・パレットの影', exact: true })
      .scrollIntoViewIfNeeded();
    await host.screenshot({ path: path.join(profile, 'appearance-dark.png') });
    await switchTo('ダイアログ・パレットの影', 'overlayShadow', false);
    let palette = await openPalette();
    await expectShadow(palette, '.command-palette', false);
    assert.notEqual(
      await palette
        .locator('.palette-command.highlighted')
        .first()
        .evaluate((el) => getComputedStyle(el).boxShadow),
      'none',
    );
    await palette.screenshot({ path: path.join(profile, 'palette-off-dark.png') });
    await editHost({ overlayShadow: true });
    await expectShadow(palette, '.command-palette', true);
    await palette.screenshot({ path: path.join(profile, 'palette-on-dark.png') });
    await closePalette(palette);
    await host.getByRole('button', { name: 'このページを既定値に戻す', exact: true }).click();
    const dialog = host.getByRole('dialog');
    await dialog.waitFor();
    await expectShadow(host, 'dialog:modal', true);
    await editHost({ overlayShadow: false });
    await expectShadow(host, 'dialog:modal', false);
    await host.screenshot({ path: path.join(profile, 'dialog-off-dark.png') });
    await host.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal((await saved()).overlayShadow, false);
    checks.push(
      'appearance switch persists; open palette and dialog update immediately; selection marker and Escape cancellation retained',
    );

    await host.evaluate((id) => window.dock.executeCommand(id + '.publish'), fixtureId);
    const surfaces = await notificationPages();
    const identity = {
      banner: await notificationIdentity(surfaces.banner),
      desktop: await notificationIdentity(surfaces.desktop),
    };
    await expectShadow(surfaces.banner, '.notification-card', true);
    await expectShadow(surfaces.desktop, '.notification-card', true);
    await openSettings('notifications');
    await expand('notification-delivery');
    assert.equal(await host.getByTestId('notification-banner').evaluate((el) => el.open), false);
    assert.equal(await host.getByTestId('notification-desktop').evaluate((el) => el.open), false);
    await expand('notification-banner');
    await expand('notification-desktop');
    await switchTo('バナーの影', 'notificationBannerShadow', false);
    await expectShadow(surfaces.banner, '.notification-card', false);
    await expectShadow(surfaces.desktop, '.notification-card', true);
    await switchTo('デスクトップ通知の影', 'notificationDesktopShadow', false);
    await expectShadow(surfaces.desktop, '.notification-card', false);
    await switchTo('バナーの影', 'notificationBannerShadow', true);
    await expectShadow(surfaces.banner, '.notification-card', true);
    await expectShadow(surfaces.desktop, '.notification-card', false);
    assert.deepEqual(await notificationIdentity(surfaces.banner), identity.banner);
    assert.deepEqual(await notificationIdentity(surfaces.desktop), identity.desktop);
    assert.equal((await saved()).overlayShadow, false);
    await host.getByTestId('notification-banner-position').selectOption('bottom-left');
    await settleSettings(host);
    assert.equal((await saved()).notificationBannerPosition, 'bottom-left');
    await host.screenshot({ path: path.join(profile, 'notifications-dark.png') });
    await surfaces.banner.screenshot({ path: path.join(profile, 'banner-on.png') });
    await surfaces.desktop.screenshot({ path: path.join(profile, 'desktop-off.png') });
    checks.push(
      'independent banner/desktop switches and position work under keyboard-expandable sections without replacing notification IDs, lifetimes or sessions',
    );

    await editHost({ theme: 'light' });
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      w.setMinimumSize(400, 500);
      w.setSize(560, 850);
    });
    await host.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await host
      .getByRole('switch', { name: 'デスクトップ通知の影', exact: true })
      .scrollIntoViewIfNeeded();
    await host.screenshot({ path: path.join(profile, 'notifications-narrow-light.png') });
    await expectShadow(surfaces.banner, '.notification-card', true);
    await expectShadow(surfaces.desktop, '.notification-card', false);
    await openSettings('general');
    const search = host.getByRole('combobox', { name: '設定を検索', exact: true });
    await search.fill('デスクトップ通知の影');
    await host.getByRole('option', { name: /デスクトップ通知の影/ }).click();
    await host.getByRole('switch', { name: 'デスクトップ通知の影', exact: true }).waitFor();
    assert.equal(await host.getByTestId('notification-desktop').evaluate((el) => el.open), true);
    await search.fill('');
    checks.push('light narrow layout and search reveal the shadow field through folded sections');
    const expected = await saved();
    await app.close();
    app = null;
    await start();
    const restored = await saved();
    for (const key of [
      'overlayShadow',
      'notificationBannerShadow',
      'notificationDesktopShadow',
      'notificationBannerPosition',
    ])
      assert.equal(restored[key], expected[key]);
    palette = await openPalette();
    await expectShadow(palette, '.command-palette', false);
    await closePalette(palette);
    await host.evaluate((id) => window.dock.executeCommand(id + '.publish'), fixtureId);
    const restarted = await notificationPages();
    await expectShadow(restarted.banner, '.notification-card', true);
    await expectShadow(restarted.desktop, '.notification-card', false);
    await editHost({ overlayShadow: true, notificationDesktopShadow: true });
    await expectShadow(restarted.desktop, '.notification-card', true);
    checks.push(
      'all three preferences and banner position survive restart; initial surface paint follows persisted state and ON restores the shadow',
    );
    assert.deepEqual(errors, []);
    await app.close();
    app = null;
    fs.writeFileSync(
      path.join(profile, 'checks.json'),
      JSON.stringify({ success: true, checks, hostHash: hash(exe) }, null, 2),
    );
    console.log(JSON.stringify({ profile, checks }));
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack || String(error));
    await host?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app)
      await app.close().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  }
})();
