const { _electron: electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'settings-layout-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const hash = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const initial = createDefaultSettings();
assert.equal(initial.host.theme, 'light');
assert.equal('notifications' in initial.host, false);
assert.equal(initial.gestures.enabled, true);
const explicit = structuredClone(initial);
explicit.host.theme = 'dark';
explicit.host.notifications = false;
explicit.gestures.enabled = false;
assert.equal(parseSettings(explicit).host.theme, 'dark');
assert.equal('notifications' in parseSettings(explicit).host, false);
assert.equal(parseSettings(explicit).gestures.enabled, false);
initial.globalShortcutCommands = [];
initial.notificationPreferences = {
  overrides: [
    {
      ownerKind: 'host',
      ownerId: 'information',
      typeId: 'operation-completed',
      durationSeconds: 1,
    },
  ],
};
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
const portable = process.argv[2] ? path.join(profile, 'AppDock.at365.exe') : undefined;
if (portable) {
  fs.copyFileSync(path.resolve(process.argv[2]), portable);
  assert.equal(hash(portable), hash(path.resolve(process.argv[2])));
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app, context, browser, child, host;
const checks = [];
async function until(fn, label) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 75));
  }
  throw Error(label);
}
async function page(category) {
  await host.evaluate(() => window.dock.navigate('settings'));
  const p = await require('./settings-host-helper.cjs').settingsPage(host);
  p.setDefaultTimeout(15000);
  const title = {
    appearance: '表示',
    general: '一般',
    notifications: '通知',
    tts: 'TTS',
    gestures: 'マウスジェスチャー',
  }[category];
  await p.locator('.settings-categories').getByRole('button', { name: title, exact: true }).click();
  await p.getByRole('heading', { name: title, level: 1, exact: true }).waitFor();
  await until(
    () =>
      p.evaluate(
        (category) =>
          window.dock.settingsPage
            .get(document.querySelector('.settings-surface').dataset.settingsConnection)
            .then((m) => m.content.page.id === category),
        category,
      ),
    category,
  );
  return p;
}
const section = (p, title) =>
  p.locator('.settings-section').filter({
    has: p
      .locator(':scope > summary h2, :scope > header h2')
      .filter({ hasText: new RegExp('^' + title + '$') }),
  });
async function capture(p, name) {
  await p.screenshot({ path: path.join(profile, name + '.png'), fullPage: true });
}
async function save(p) {
  await require('./settings-immediate-helper.cjs').settleSettings(p);
}
(async () => {
  let ok = false;
  try {
    if (portable) {
      const probe = net.createServer();
      await new Promise((r) => probe.listen(0, '127.0.0.1', r));
      const port = probe.address().port;
      await new Promise((r) => probe.close(r));
      child = spawn(portable, ['--test-profile=' + profile, '--remote-debugging-port=' + port], {
        env,
        cwd: profile,
        windowsHide: true,
        stdio: 'ignore',
      });
      browser = await until(async () => {
        try {
          return await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 });
        } catch {}
      }, 'CDP');
      context = browser.contexts()[0];
    } else {
      app = await electron.launch({
        executablePath: require('electron'),
        args: [root, '--test-profile=' + profile],
        env,
      });
      context = app.context();
    }
    host = await until(
      () => context.pages().find((p) => p.url().startsWith('appdock://host/')),
      'host',
    );
    await host.waitForFunction(async () => (await window.dock?.snapshot())?.startupReady);
    await require('./shell-overlay-helper.cjs').startupPage(host);
    let p = await page('appearance');
    const cards = p.locator('.settings-form > .settings-section');
    assert.equal(await cards.count(), 2);
    assert.deepEqual(await cards.locator(':scope > header h2').allTextContents(), [
      '共通',
      'Shellの変更',
    ]);
    assert.equal(await cards.first().getByLabel('テーマ', { exact: true }).inputValue(), 'light');
    assert.equal(await p.getByRole('heading', { name: 'Shell', exact: true }).count(), 0);
    await capture(p, 'appearance');
    await p.getByLabel('テーマ', { exact: true }).selectOption('dark');
    await save(p);
    await p.getByLabel('テーマ', { exact: true }).selectOption('light');
    await save(p);
    checks.push('common theme/hint card precedes Shell selection; theme saves immediately');
    p = await page('general');
    const sound = p.getByRole('switch', { name: '音の再生', exact: true });
    assert.equal(
      await p.locator('.settings-form').getByRole('switch').first().getAttribute('aria-label'),
      '音の再生',
    );
    assert.equal(await sound.getAttribute('aria-checked'), 'true');
    await sound.click();
    await save(p);
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.host.soundEnabled,
      false,
    );
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.soundEnabled.on'));
    await until(
      () => sound.getAttribute('aria-checked').then((v) => v === 'true'),
      'command reflects in sound switch',
    );
    checks.push(
      'sound switch is first in general; saves immediately and generated ON command reflects in UI',
    );
    assert.deepEqual(
      await p.locator('.settings-form > .settings-section > header h2').allTextContents(),
      ['ウィンドウ', 'スタートアップ', '設定ファイル'],
    );
    assert.equal(await p.getByText('旧PC専用データ', { exact: true }).count(), 0);
    await p.getByRole('switch', { name: '閉じるとトレイに収納', exact: true }).waitFor();
    await p.getByRole('switch', { name: '起動時にトレイに収納', exact: true }).waitFor();
    await capture(p, 'general');
    checks.push('general card order, window labels, startup status, removed legacy section');
    p = await page('notifications');
    assert.equal(await section(p, '通知の受け取り方').evaluate((e) => e.open), false);
    assert.deepEqual(
      (
        await p
          .locator(
            '.notification-settings > .settings-section > summary h2, .notification-settings > .settings-section > header h2',
          )
          .allTextContents()
      ).slice(0, 4),
      ['通知の受け取り方', '読み上げ', 'MCP Event', 'AppDock'],
    );
    const notices = p.locator('.notification-setting-card');
    assert.ok((await notices.count()) >= 3);
    assert.ok(
      await notices.evaluateAll((els) => els.every((e) => e.tagName === 'DETAILS' && !e.open)),
    );
    await capture(p, 'notifications-collapsed');
    await section(p, '通知の受け取り方').locator(':scope > summary').click();
    assert.equal(
      await p.getByRole('switch', { name: 'Appletからの通知を許可', exact: true }).count(),
      0,
    );
    assert.equal(await p.getByRole('switch', { name: /通知を通知$/ }).count(), 0);
    assert.match(
      await section(p, 'エラー通知').locator(':scope > summary').innerText(),
      /バナー・デスクトップ通知.*閉じるまで表示.*読み上げ: OFF/,
    );
    await section(p, 'エラー通知').locator(':scope > summary').click();
    await p.getByLabel('エラー通知の表示時間', { exact: true }).fill('12');
    await p.getByLabel('エラー通知の表示時間', { exact: true }).press('Enter');
    await save(p);
    assert.equal(await p.getByLabel('エラー通知のバナー', { exact: true }).isDisabled(), true);
    assert.equal(
      await p.getByLabel('エラー通知の通知センターのみ', { exact: true }).isDisabled(),
      true,
    );
    await p.getByLabel('エラー通知を読み上げる', { exact: true }).check();
    await save(p);
    await section(p, 'エラー通知').locator(':scope > summary').click();
    assert.match(
      await section(p, 'エラー通知').locator(':scope > summary').innerText(),
      /表示時間: 12秒.*読み上げ: ON/,
    );
    await capture(p, 'notifications-summary');
    await section(p, 'エラー通知').locator(':scope > summary').click();
    await p.getByLabel('エラー通知を読み上げる', { exact: true }).uncheck();
    await save(p);
    await capture(p, 'notifications-expanded');
    assert.equal(await section(p, '警告通知').evaluate((e) => e.open), false);
    checks.push(
      'notification order, default collapsed cards, independent expansion and immediate preference saves',
    );
    p = await page('tts');
    await p.getByRole('heading', { name: 'TTS接続先', exact: true }).waitFor();
    await capture(p, 'tts');
    p = await page('gestures');
    const gesture = section(p, '動作設定');
    assert.equal(await gesture.evaluate((e) => e.open), false);
    const contained = p.getByRole('switch', {
      name: 'マウスジェスチャーを有効にする',
      exact: true,
      includeHidden: true,
    });
    assert.equal(await contained.evaluate((e) => !!e.closest('details')), true);
    assert.equal(await contained.isVisible(), false);
    await capture(p, 'gestures-collapsed');
    await gesture.locator(':scope > summary').click();
    await p.getByRole('heading', { name: '動作設定', exact: true }).waitFor();
    const enabled = p.getByRole('switch', { name: 'マウスジェスチャーを有効にする', exact: true });
    assert.equal(await enabled.getAttribute('aria-checked'), 'true');
    await enabled.click();
    await save(p);
    await enabled.click();
    await save(p);
    await capture(p, 'gestures-expanded');
    checks.push(
      'TTS label; gesture toggle inside top collapsed common options card; enabled setting saves',
    );
    await gesture.locator(':scope > summary').click();
    const search = p.getByRole('combobox', { name: '設定を検索', exact: true });
    await search.fill('移動距離');
    await p.getByRole('option', { name: /移動距離/ }).click();
    await until(() => gesture.evaluate((e) => e.open), 'search opens gesture card');
    await search.fill('警告通知');
    await p.getByRole('option', { name: /警告通知/ }).click();
    await until(
      () => section(p, '警告通知').evaluate((e) => e.open),
      'search opens notification card',
    );
    checks.push('search reveals collapsed gesture and notification settings');
    const saved = (await host.evaluate(() => window.dock.snapshot())).settings.value;
    assert.equal(saved.host.theme, 'light');
    assert.equal('notifications' in saved.host, false);
    assert.ok(saved.notificationPreferences.overrides.every((r) => !('enabled' in r)));
    assert.equal(saved.gestures.enabled, true);
    assert.ok(
      saved.notificationPreferences.overrides.some(
        (r) => r.ownerId === 'errors' && r.durationSeconds === 12,
      ),
    );
    ok = true;
  } finally {
    if (app) await app.close();
    else if (child) {
      await host?.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
      await until(() => child.exitCode !== null, 'shutdown');
      await browser?.close();
    }
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { ok, checks, portable: !!portable, executableSha256: portable ? hash(portable) : null },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ ok, profile, checks }));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
