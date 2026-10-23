const { settleSettings } = require('./settings-immediate-helper.cjs');
const { _electron: electron } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `ribbon-layout-${Date.now()}`);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.globalShortcutCommands = [];
settings.extensions['at365.gmail'] = { enabled: false, settings: { notifications: false } };
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
fs.cpSync(
  path.resolve(root, '../../40.ARTIFACT/Applet.Gmail.at365/Applet.Gmail.at365'),
  path.join(profile, 'extensions', 'Applet.Gmail.at365'),
  { recursive: true },
);
let app, dock, rail;
const checks = [];
const until = async (fn, label) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(label);
};
const button = (label) =>
  (['設定', '画像ライブラリー', 'Applet', 'ログ'].includes(label) ? rail : dock).getByRole(
    'button',
    {
      name: label,
      exact: true,
    },
  );
const ribbonIds = (group) =>
  rail
    .locator(`.ribbon-${group} [data-ribbon-id]`)
    .evaluateAll((elements) => elements.map((element) => element.dataset.ribbonId));
const save = async () => {
  await settleSettings(dock);
  const revision = await rail.evaluate(async () => (await window.appdockShell.get()).revision);
  await rail.waitForFunction(
    (r) => Number(document.querySelector('.activity-rail')?.dataset.revision) >= r,
    revision,
  );
};
async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: process.argv[2] ? path.resolve(process.argv[2]) : require('electron'),
    args: [...(process.argv[2] ? [] : [root]), `--test-profile=${profile}`],
    env,
  });
  dock = require('./settings-aware-page.cjs').settingsAwarePage(await app.firstWindow());
  dock.setDefaultTimeout(15000);
  await require('./shell-overlay-helper.cjs').startupPage(dock);
  await until(() => {
    rail = app
      .context()
      .pages()
      .find((p) => p.url().includes('/shells/default/index.html'));
    return !!rail;
  }, 'Shell page');
  await rail.locator('[data-ribbon-id="image-library"]').waitFor();
  await app.evaluate(({ app }) =>
    app.on('session-created', (session) => {
      if (!session.isPersistent()) return;
      session.protocol.handle(
        'https',
        () =>
          new Response(
            '<!doctype html><title>Offline Gmail</title><main role="main"><table><tr class="zA zE"><td class="yW"><span name="Fixture">Fixture</span></td><td><span class="bog" data-legacy-thread-id="first">未読fixture</span></td></tr></table></main>',
            { headers: { 'content-type': 'text/html; charset=utf-8' } },
          ),
      );
    }),
  );
}
(async () => {
  try {
    await launch();
    assert.ok(!(await ribbonIds('top')).includes('page:at365.gmail:gmail'));
    await dock.evaluate(() => window.dock.toggleExtension('at365.gmail', true));
    await until(
      async () => (await ribbonIds('top')).includes('page:at365.gmail:gmail'),
      'Enabled Gmail ribbon',
    );
    assert.deepEqual(await ribbonIds('bottom'), ['theme', 'profile']);
    assert.ok((await ribbonIds('top')).includes('page:at365.gmail:gmail'));
    await button('設定').click();
    assert.equal(await dock.getByRole('button', { name: 'AppDockのキー', exact: true }).count(), 0);
    assert.equal(await dock.locator('.settings-applet-list').count(), 0);
    await dock
      .locator('.settings-categories')
      .getByRole('button', { name: 'ショートカットキー', exact: true })
      .click();
    assert.equal(await dock.locator('.shortcut-group').count(), 0);
    assert.ok(
      (await dock.locator('.shortcuts-editor [data-shortcut-command^="appdock."]').count()) > 0,
    );
    await dock
      .locator('.settings-categories')
      .getByRole('button', { name: 'リボン', exact: true })
      .click();
    await dock
      .getByRole('region', { name: '上寄せのリボン設定', exact: true })
      .getByRole('button', { name: '＋ 区切り線', exact: true })
      .click();
    await dock
      .getByRole('region', { name: '下寄せのリボン設定', exact: true })
      .getByRole('button', { name: '＋ 区切り線', exact: true })
      .click();
    const separatorIds = (await dock.evaluate(() => window.dock.snapshot())).settings.value.ribbon
      .separators;
    const separatorRow = (id) => dock.locator(`[data-ribbon-setting="${id}"]`);
    await dock.getByLabel('Gmailの配置', { exact: true }).selectOption('bottom');
    await separatorRow(separatorIds[0])
      .getByLabel('区切り線の配置', { exact: true })
      .selectOption('bottom');
    await separatorRow(separatorIds[0])
      .getByLabel('区切り線の配置', { exact: true })
      .selectOption('top');
    await separatorRow(separatorIds[0])
      .getByRole('button', { name: '区切り線を上へ', exact: true })
      .click();
    await separatorRow(separatorIds[1])
      .getByRole('button', { name: '区切り線を削除', exact: true })
      .click();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL() === 'appdock://host/index.html')
        .webContents.setZoomFactor(0.65),
    );
    const gmailRow = dock.locator('[data-ribbon-setting="page:at365.gmail:gmail"]');
    await gmailRow
      .locator('.drag-handle')
      .dragTo(dock.locator('[data-ribbon-setting="image-library"] .drag-handle'));
    assert.equal(await dock.getByLabel('Gmailの配置', { exact: true }).inputValue(), 'top');
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL() === 'appdock://host/index.html')
        .webContents.setZoomFactor(1),
    );
    await dock.getByLabel('Gmailの配置', { exact: true }).selectOption('bottom');
    await save();
    const persisted = (await dock.evaluate(() => window.dock.snapshot())).settings.value.ribbon;
    assert.equal(persisted.separators.length, 1);
    assert.ok(persisted.bottom.includes('page:at365.gmail:gmail'));
    assert.ok(!persisted.bottom.includes(persisted.separators[0]));
    assert.equal(await rail.locator('.ribbon-top [role="separator"]').count(), 1);
    assert.equal(
      await rail.locator('.ribbon-bottom [data-ribbon-id="page:at365.gmail:gmail"]').count(),
      1,
    );
    const topBottom = await rail.evaluate(() => ({
      top: document.querySelector('.ribbon-top').getBoundingClientRect().bottom,
      bottom: document.querySelector('.ribbon-bottom').getBoundingClientRect().top,
    }));
    assert.ok(topBottom.bottom - topBottom.top >= 12);
    await dock.screenshot({ path: path.join(profile, 'ribbon-layout.png') });
    checks.push(
      'Host shortcuts renamed and first in Applet settings; separator add/delete/move; cross-group drag; per-group ordering; real top/bottom placement',
    );

    await rail
      .locator('.activity-rail')
      .getByRole('button', { name: 'Gmail', exact: true })
      .click();
    let gmailUi;
    await until(() => {
      gmailUi = app
        .context()
        .pages()
        .find((page) => page.url().endsWith('/web/index.html'));
      return !!gmailUi;
    }, 'Gmail UI');
    gmailUi.setDefaultTimeout(15000);
    await until(
      async () =>
        (await gmailUi.evaluate(() => window.webAccounts.snapshot())).accounts[0].data?.pending ===
        1,
      'Gmail baseline',
    );
    assert.equal(
      await gmailUi.locator('.header-note,.section,.account-switcher,.status').count(),
      0,
    );
    assert.equal(
      await gmailUi.getByRole('button', { name: '次のアカウント', exact: true }).count(),
      0,
    );
    assert.equal(
      await gmailUi.getByRole('button', { name: '前のアカウント', exact: true }).count(),
      0,
    );
    const aligned = () =>
      gmailUi.evaluate(() => ({
        account: document.querySelector('.accounts .account').getBoundingClientRect().top,
        main: document.querySelector('main').getBoundingClientRect().top,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
    let geometry = await aligned();
    assert.equal(geometry.account, geometry.main);
    assert.equal(geometry.main, 130);
    assert.equal(geometry.overflow, false);
    await gmailUi.screenshot({ path: path.join(profile, 'gmail-inbox.png') });
    await gmailUi.getByRole('button', { name: /^新着一覧/ }).click();
    geometry = await aligned();
    assert.equal(geometry.account, 130);
    assert.equal(geometry.main, 146);
    await gmailUi.getByRole('button', { name: '受信トレイ', exact: true }).click();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL() === 'appdock://host/index.html')
        .setContentSize(900, 640),
    );
    await until(
      async () => (await aligned()).account === (await aligned()).main,
      'Compact alignment',
    );
    assert.equal((await aligned()).overflow, false);
    await gmailUi.screenshot({ path: path.join(profile, 'gmail-compact.png') });
    checks.push(
      'Gmail duplicated status/count/switch controls removed; spacer aligns first account with web/content in full and compact sizes; unread monitoring intact',
    );

    await app.close();
    app = null;
    const restartSettings = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')));
    restartSettings.extensions['at365.gmail'].enabled = false;
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(restartSettings));
    await launch();
    assert.equal(await rail.locator('[data-ribbon-id="page:at365.gmail:gmail"]').count(), 0);
    await dock.evaluate(() => window.dock.toggleExtension('at365.gmail', true));
    await until(
      async () => (await ribbonIds('bottom')).includes('page:at365.gmail:gmail'),
      'Restored enabled Gmail placement',
    );
    assert.deepEqual(
      (await dock.evaluate(() => window.dock.snapshot())).settings.value.ribbon,
      persisted,
    );
    assert.equal(await rail.locator('.ribbon-top [role="separator"]').count(), 1);
    assert.ok((await ribbonIds('bottom')).includes('page:at365.gmail:gmail'));
    await button('設定').click();
    await dock
      .locator('.settings-categories')
      .getByRole('button', { name: 'リボン', exact: true })
      .click();
    await separatorRow(separatorIds[0])
      .getByRole('button', { name: '区切り線を削除', exact: true })
      .click();
    await save();
    const deleted = (await dock.evaluate(() => window.dock.snapshot())).settings.value.ribbon;
    assert.equal(deleted.separators.length, 0);
    for (const ids of [deleted.order, deleted.hidden, deleted.bottom])
      assert.ok(!ids.includes(persisted.separators[0]));
    assert.equal(await rail.locator('.activity-rail [role="separator"]').count(), 0);
    await button('このページを既定値に戻す').click();
    await dock
      .getByRole('dialog', { name: 'このページを既定値に戻す', exact: true })
      .getByRole('button', { name: '既定値に戻す', exact: true })
      .click();
    await save();
    assert.deepEqual(await ribbonIds('bottom'), ['theme', 'profile']);
    checks.push(
      'Restart retains placement and separators; deletion clears every reference; default reset restores bottom utilities',
    );
    assert.deepEqual(
      (await dock.evaluate(() => window.dock.snapshot())).logs.filter(
        (log) => log.level === 'error',
      ),
      [],
    );
    await app.close();
    app = null;
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: true, checks }, null, 2),
    );
    console.log(JSON.stringify({ ok: true, profile, checks }));
  } catch (error) {
    console.error(error);
    if (rail && !rail.isClosed())
      fs.writeFileSync(
        path.join(profile, 'shell-failure.json'),
        JSON.stringify(
          await rail.evaluate(async () => ({
            view: await window.appdockShell.get(),
            html: document.body.innerHTML,
          })),
          null,
          2,
        ),
      );
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: false, checks, error: String(error) }, null, 2),
    );
    if (app) {
      try {
        await dock.screenshot({ path: path.join(profile, 'failure.png') });
      } catch {}
      await app.close().catch(() => {});
    }
    process.exitCode = 1;
  }
})();
