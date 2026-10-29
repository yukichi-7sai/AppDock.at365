const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { settingsPage, waitForHost } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const { overlayPage, closingAction } = require('./shell-overlay-helper.cjs');

module.exports = async ({
  host,
  state,
  save,
  assign,
  launch,
  close,
  main,
  capture,
  barPage,
  checks,
}) => {
  const command = (id) => host().evaluate((id) => window.dock.executeCommand(id), id);
  const open = async () => {
    await command('appdock.settings.statusbar.open');
    await settingsPage(host());
    await host().getByTestId('settings-page:statusbar').waitFor();
    await settleSettings(host());
  };
  const toggle = () => host().getByRole('switch', { name: 'ステータスバーの表示', exact: true });
  const shown = async (visible) => {
    await waitForHost(
      host(),
      async (visible) => {
        const snapshot = await window.dock.snapshot();
        const bar = snapshot.shellRegions.regions.find((bar) => bar.region === 'statusbar');
        const slot = document.querySelector('.shell-bar-slot[data-region="statusbar"]');
        const bottom = document.querySelector('.shell > main').getBoundingClientRect().bottom;
        return (
          snapshot.settings.value.host.showStatusBar === visible &&
          bar.visible === visible &&
          !!slot === visible &&
          (visible ? bottom < innerHeight : Math.abs(bottom - innerHeight) < 1)
        );
      },
      visible,
    );
    await settleSettings(host());
  };
  const connection = (page) => page.evaluate(() => window.appdockBar.connect());
  const nativeVisible = (session) =>
    main(async ({ BrowserWindow }, session) => {
      const window = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().startsWith('appdock://host/'),
      );
      for (const view of window.contentView.children) {
        if (!view.webContents) continue;
        try {
          const current = await view.webContents.executeJavaScript('window.appdockBar?.connect()');
          if (current?.sessionId === session) return view.getVisible();
        } catch {}
      }
      throw Error('Native bar View was not found');
    }, session);

  await open();
  const ids = await host()
    .getByTestId('settings-host-pages')
    .locator('button')
    .evaluateAll((buttons) => buttons.map((button) => button.dataset.testid));
  assert.equal(ids[ids.indexOf('settings-nav:ribbon') + 1], 'settings-nav:statusbar');
  assert.equal(await toggle().getAttribute('aria-checked'), 'true');
  await shown(true);
  let status = await barPage(host(), 'statusbar');
  let original = await connection(status);
  assert.equal(await status.getByRole('button', { name: 'コマンドパレット' }).count(), 0);
  assert.equal(await nativeVisible(original.sessionId), true);
  checks.push(
    'index follows ribbon; default visibility on; default Shell has no bottom palette button',
  );

  await toggle().click();
  await shown(false);
  assert.equal(await nativeVisible(original.sessionId), false);
  const rejected = await status.evaluate(
    async ({ sessionId, actionId, requestId }) => {
      try {
        await window.appdockBar.invoke({ sessionId, actionId, requestId });
        return false;
      } catch {
        return true;
      }
    },
    {
      sessionId: original.sessionId,
      actionId: original.snapshot.actions.palette,
      requestId: randomUUID(),
    },
  );
  assert.equal(rejected, true);
  await capture('hidden-light');
  checks.push(
    'UI off saves immediately; native View and Tab entry disappear; body fills space; hidden action rejected',
  );

  const title = await barPage(host(), 'titlebar');
  await title.getByRole('button', { name: 'コマンドを検索' }).click();
  const palette = await overlayPage(host());
  await closingAction(palette.keyboard.press('Escape'));
  await open();
  const search = host().getByRole('combobox', { name: '設定を検索', exact: true });
  await search.fill('ステータスバーの表示');
  await host()
    .getByRole('option', { name: /ステータスバーの表示/ })
    .click();
  await toggle().waitFor();
  await search.fill('');
  checks.push(
    'title palette remains usable while hidden; settings search reaches the visibility switch',
  );

  await command('appdock.settings.showStatusBar.on');
  await shown(true);
  assert.equal((await connection(status)).sessionId, original.sessionId);
  await capture('visible-light');
  await status.getByRole('button', { name: 'AppDockを更新', exact: true }).focus();
  await command('appdock.settings.showStatusBar.off');
  await shown(false);
  await host().waitForFunction(() => document.hasFocus());
  checks.push(
    'generated commands share saved state; showing reuses session; hiding focused bar returns focus to host',
  );

  await close();
  await launch();
  await open();
  await shown(false);
  assert.equal(await toggle().getAttribute('aria-checked'), 'false');
  checks.push('off survives process shutdown and relaunch');

  await host().getByRole('button', { name: 'このページを既定値に戻す', exact: true }).click();
  const dialog = host().getByTestId('settings-dialog');
  await dialog.waitFor();
  await dialog.getByTestId('settings-dialog-confirm').click();
  await dialog.waitFor({ state: 'hidden' });
  await shown(true);
  const saved = await host().evaluate(async () => (await window.dock.snapshot()).settings.value);
  assert.equal(saved.host.soundEnabled, false);
  assert.equal(saved.gestures.enabled, false);
  checks.push('page reset restores on and preserves unrelated settings');

  await assign({ statusbar: 'fixture.bars-b' });
  await waitForHost(host(), async () => {
    const current = (await window.dock.snapshot()).shellRegions.regions.find(
      (bar) => bar.region === 'statusbar',
    );
    return current.boundProvider === 'fixture.bars-b' && current.ready && current.visible;
  });
  status = await barPage(host(), 'statusbar');
  original = await connection(status);
  await save({ theme: 'dark' });
  await main(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().startsWith('appdock://host/'))
      .setSize(760, 720),
  );
  await command('appdock.settings.showStatusBar.toggle');
  await shown(false);
  assert.equal(await nativeVisible(original.sessionId), false);
  assert.equal((await state('statusbar')).configuredProvider, 'fixture.bars-b');
  await capture('hidden-dark-narrow');
  await command('appdock.settings.showStatusBar.toggle');
  await shown(true);
  assert.equal((await connection(status)).sessionId, original.sessionId);
  assert.equal(await nativeVisible(original.sessionId), true);
  await capture('visible-dark-narrow');
  await host().getByLabel('ステータスバーに移動', { exact: true }).focus();
  await status.waitForFunction(() => document.hasFocus());
  await status.keyboard.press('Control+p');
  await closingAction((await overlayPage(host())).keyboard.press('Escape'));
  checks.push(
    'custom Shell hides and reappears with its assignment/session; dark narrow UI and palette shortcut remain usable',
  );

  await command('appdock.settings.showStatusBar.off');
  await shown(false);
  await host().evaluate(() => window.dock.toggleExtension('fixture.bars-b', false));
  await waitForHost(host(), async () => {
    const current = (await window.dock.snapshot()).shellRegions.regions.find(
      (bar) => bar.region === 'statusbar',
    );
    return current.boundProvider === 'appdock.default-shell' && current.ready && !current.visible;
  });
  await command('appdock.settings.showStatusBar.on');
  await shown(true);
  assert.equal((await state('statusbar')).configuredProvider, 'fixture.bars-b');
  checks.push(
    'provider disable while hidden falls back without flashing; showing retains saved provider selection',
  );
};
