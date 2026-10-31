const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { waitForHost, settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const { assertKeyboardFocus, assertReadableText } = require('./ui-usability-helper.cjs');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'settings-controls-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
initial.host.hardwareAcceleration = false;
initial.host.soundEnabled = false;
initial.keybindings = [];
initial.gestures.enabled = false;
initial.touchpadGestures.enabled = false;
initial.updates.checkHostOnStartup = false;
initial.updates.checkAppletsOnStartup = false;
const fixtureId = 'fixture.banner-position';
const fixtureFolder = path.join(profile, 'extensions', fixtureId);
fs.mkdirSync(fixtureFolder, { recursive: true });
fs.writeFileSync(
  path.join(fixtureFolder, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: fixtureId,
    name: 'Banner position fixture',
    version: '1.0.0',
    minimumHostVersion: '0.31.1',
    runtime: 'node',
    entry: 'index.cjs',
    capabilities: ['notifications'],
    commands: ['publish', 'end'].map((key) => ({ id: fixtureId + '.' + key, title: key })),
    notificationTypes: [
      {
        typeId: 'probe',
        title: 'Position probe',
        description: 'Isolated notification',
        levels: ['info'],
        defaultLevel: 'info',
        allowedTargets: ['banner'],
        defaultTargets: ['banner'],
        requiredTargets: [],
        lifetimePolicy: 'userDuration',
        history: 'session',
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixtureFolder, 'index.cjs'),
  `exports.activate=async c=>{
  const ids=[];
  c.commands.register('${fixtureId}.publish','Publish',async()=>{
    const result=await c.notifications.publish({typeId:'probe',title:'Position probe '+(ids.length+1),body:'Banner position and measured height'});
    if(result.status==='accepted')ids.push(result.notificationId);
  });
  c.commands.register('${fixtureId}.end','End',async()=>{for(const id of ids)await c.notifications.end(id,'resolved');});
};`,
);
initial.extensions[fixtureId] = { enabled: true, settings: {} };
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(initial));

const source = process.argv[2] && path.resolve(process.argv[2]);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const executablePath = source ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (source) {
  require('./copy-host.cjs').copyHost(source, executablePath);
  assert.equal(hash(executablePath), hash(source));
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const checks = [],
  errors = [];
let app,
  host,
  success = false;

(async () => {
  try {
    app = await launchTestHost({
      executablePath,
      portable: !!source,
      env,
      args: [
        ...(source ? [] : [root]),
        '--test-profile=' + profile,
        '--test-local-state=' + path.join(profile, 'local'),
      ],
    });
    const deadline = Date.now() + 30000;
    while (!host && Date.now() < deadline) {
      host = app
        .context()
        .pages()
        .find((page) => page.url().startsWith('appdock://host/'));
      if (!host) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert(host, 'host page');
    host.setDefaultTimeout(15000);
    host.on('pageerror', (error) => errors.push(error.message));
    await waitForHost(host, async () => (await window.dock?.snapshot())?.startupReady);
    const saved = () => host.evaluate(async () => (await window.dock.snapshot()).settings.value);
    const open = async (id) => {
      await host.evaluate((id) => window.dock.executeCommand(`appdock.settings.${id}.open`), id);
      await settingsPage(host);
      await host.getByTestId('settings-page:' + id).waitFor();
      await settleSettings(host);
      if (id === 'notifications') {
        const delivery = host.getByTestId('notification-delivery');
        if (!(await delivery.evaluate((element) => element.open)))
          await delivery.locator(':scope > summary').click();
        const banner = host.getByTestId('notification-banner');
        if (!(await banner.evaluate((element) => element.open)))
          await banner.locator(':scope > summary').click();
      }
    };
    const section = (title) =>
      host.locator('.settings-section').filter({
        has: host.getByRole('heading', { name: title, level: 2, exact: true }),
      });

    await open('general');
    const sound = host.getByRole('switch', { name: '音の再生', exact: true });
    await sound.click();
    await settleSettings(host);
    assert.equal((await saved()).host.soundEnabled, true);
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.soundEnabled.off'));
    await host.waitForFunction(
      () =>
        document
          .querySelector('[role="switch"][aria-label="音の再生"]')
          ?.getAttribute('aria-checked') === 'false',
    );
    assert.equal((await saved()).host.soundEnabled, false);
    checks.push('sound edits save immediately and generated commands update the same control');

    await open('notifications');
    await waitForHost(host, async () =>
      (await window.dock.snapshot()).extensions.some(
        (entry) => entry.id === 'fixture.banner-position' && entry.state === 'running',
      ),
    );
    await host.evaluate(() => window.dock.executeCommand('fixture.banner-position.publish'));
    const banner = await (async () => {
      const end = Date.now() + 15000;
      while (Date.now() < end) {
        const page = app
          .context()
          .pages()
          .find((page) => page.url().endsWith('/notifications.html'));
        if (page) return page;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw Error('banner ready');
    })();
    await banner.getByRole('region', { name: 'Position probe 1', exact: true }).waitFor();
    const session = (await banner.evaluate(() => window.appdockNotifications.connect())).sessionId;
    const nativeBounds = () =>
      app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().startsWith('appdock://host/'),
        );
        const view = window.contentView.children.find((v) =>
          v.webContents?.getURL().endsWith('/notifications.html'),
        );
        return {
          ...view.getBounds(),
          content: window.getContentSize(),
          zoom: window.webContents.getZoomFactor(),
        };
      });
    for (const position of [
      'top-center',
      'bottom-center',
      'top-right',
      'bottom-right',
      'top-left',
      'bottom-left',
    ]) {
      await host.getByTestId('notification-banner-position').selectOption(position);
      await settleSettings(host);
      assert.equal((await saved()).host.notificationBannerPosition, position);
      await waitForHost(
        host,
        async () =>
          (await window.dock.snapshot()).settings.value.host.notificationBannerPosition !==
          undefined,
      );
      const deadline = Date.now() + 10000;
      let rect;
      while (Date.now() < deadline) {
        rect = await nativeBounds();
        const expectedX = position.endsWith('-left')
          ? 16 * rect.zoom
          : position.endsWith('-right')
            ? rect.content[0] - rect.width - 16 * rect.zoom
            : (rect.content[0] - rect.width) / 2;
        const expectedY = position.startsWith('bottom-')
          ? rect.content[1] - rect.height - 48 * rect.zoom
          : 48 * rect.zoom;
        if (Math.abs(rect.x - expectedX) <= 1 && Math.abs(rect.y - expectedY) <= 1) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const bottom = position.startsWith('bottom-');
      assert(
        Math.abs((bottom ? rect.content[1] - rect.y - rect.height : rect.y) - 48 * rect.zoom) <= 1,
      );
      if (position.endsWith('-left')) assert(Math.abs(rect.x - 16 * rect.zoom) <= 1);
      if (position.endsWith('-right'))
        assert(Math.abs(rect.content[0] - rect.x - rect.width - 16 * rect.zoom) <= 1);
      if (position.endsWith('-center'))
        assert(Math.abs(rect.x + rect.width / 2 - rect.content[0] / 2) <= 1);
      assert.equal(
        (await banner.evaluate(() => window.appdockNotifications.connect())).sessionId,
        session,
      );
    }
    const beforeGrowth = await nativeBounds();
    await host.evaluate(() => window.dock.executeCommand('fixture.banner-position.publish'));
    await banner.getByRole('region', { name: 'Position probe 2', exact: true }).waitFor();
    let afterGrowth;
    const growDeadline = Date.now() + 10000;
    do {
      afterGrowth = await nativeBounds();
      if (afterGrowth.height > beforeGrowth.height) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() < growDeadline);
    assert(afterGrowth.height > beforeGrowth.height);
    assert.equal(afterGrowth.y + afterGrowth.height, beforeGrowth.y + beforeGrowth.height);
    await host.screenshot({ path: path.join(profile, 'banner-bottom-left.png') });
    await host.evaluate(() => window.dock.executeCommand('fixture.banner-position.end'));
    const raw = JSON.parse(
      fs.readFileSync(require('./test-settings.cjs').file(profile, `settings-${require('node:os').hostname()}.json`)),
    );
    assert.equal(raw.host.notificationBannerPosition, 'bottom-left');
    await host.reload();
    await waitForHost(host, async () => (await window.dock?.snapshot())?.startupReady);
    await open('notifications');
    assert.equal(
      await host.getByTestId('notification-banner-position').inputValue(),
      'bottom-left',
    );
    checks.push(
      'six banner positions save and move the existing native surface; bottom growth stays anchored; page reload restores selection',
    );

    const preferencesBeforeCenter = (await saved()).notificationPreferences;
    await host.evaluate(() => {
      window.notificationCenterTransitionAlerts = [];
      window.notificationCenterTransitionObserver = new MutationObserver(() => {
        for (const element of document.querySelectorAll('.settings-status-area [role="alert"]')) {
          const text = element.textContent.trim();
          if (text) window.notificationCenterTransitionAlerts.push(text);
        }
      });
      window.notificationCenterTransitionObserver.observe(document.documentElement, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
    await host.getByRole('button', { name: '通知センターを開く', exact: true }).click();
    await host.getByRole('heading', { name: '通知センター', exact: true }).waitFor();
    assert.deepEqual(
      await host.evaluate(() => {
        window.notificationCenterTransitionObserver.disconnect();
        return window.notificationCenterTransitionAlerts;
      }),
      [],
      'opening the notification center never flashes a settings error',
    );
    assert.deepEqual((await saved()).notificationPreferences, preferencesBeforeCenter);
    await open('notifications');
    checks.push('notification center navigation preserves preferences without a transient error');

    const holdMcpStatus = (failure = false) =>
      app.evaluate(({ app }, fail) => {
        const require = process
          .getBuiltinModule('module')
          .createRequire(app.getAppPath() + '/package.json');
        const { AutomationService } = require(
          app.getAppPath() + '/out/main/main/core/automation.js',
        );
        const original = AutomationService.prototype.action;
        globalThis.mcpLoadingOriginal = original;
        globalThis.mcpLoadingReleases = [];
        AutomationService.prototype.action = async function (action) {
          if (action?.kind === 'status') {
            await new Promise((resolve) => globalThis.mcpLoadingReleases.push(resolve));
            if (fail) throw Error('Fixture MCP status failure');
          }
          return original.call(this, action);
        };
      }, failure);
    const releaseMcpStatus = () =>
      app.evaluate(({ app }) => {
        if (!globalThis.mcpLoadingOriginal) return;
        const require = process
          .getBuiltinModule('module')
          .createRequire(app.getAppPath() + '/package.json');
        const { AutomationService } = require(
          app.getAppPath() + '/out/main/main/core/automation.js',
        );
        AutomationService.prototype.action = globalThis.mcpLoadingOriginal;
        for (const release of globalThis.mcpLoadingReleases.splice(0)) release();
      });
    const openMcp = async () => {
      await open('notifications');
      await host
        .getByRole('group', { name: 'MCP連携設定', exact: true })
        .getByRole('button', { name: '設定を開く', exact: true })
        .click();
      await host.getByTestId('settings-page:codex').waitFor();
    };
    const reloadMcp = host.getByRole('button', { name: '連携状態を再読み込み', exact: true });
    const mcpReady = () => host.getByLabel('Codexの設定ファイル', { exact: true }).waitFor();
    try {
      await holdMcpStatus();
      await host.evaluate(() => {
        window.mcpLoadingTimes = { mounted: 0, shown: [] };
        window.mcpLoadingObserver = new MutationObserver(() => {
          if (!document.querySelector('[data-testid="settings-page:codex"]')) return;
          const times = window.mcpLoadingTimes;
          if (!times.mounted) times.mounted = performance.now();
          if (
            Array.from(document.querySelectorAll('button')).some(
              (button) => button.textContent.trim() === '連携状態を再読み込み',
            )
          )
            times.shown.push(performance.now());
        });
        window.mcpLoadingObserver.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      });
      await openMcp();
      await releaseMcpStatus();
      await mcpReady();
      assert.deepEqual(
        await host.evaluate(() => window.mcpLoadingTimes.shown),
        [],
        'fast MCP status never inserts a transient reload button',
      );
      await open('notifications');
      await holdMcpStatus();
      await host.evaluate(() => {
        window.mcpLoadingTimes = { mounted: 0, shown: [] };
      });
      await openMcp();
      await reloadMcp.waitFor();
      const times = await host.evaluate(() => window.mcpLoadingTimes);
      assert(times.shown[0] - times.mounted >= 950, 'MCP reload waits one second while loading');
      fs.writeFileSync(
        path.join(profile, 'mcp-loading-timing.json'),
        JSON.stringify({ delayMs: times.shown[0] - times.mounted }, null, 2),
      );
      await host.screenshot({ path: path.join(profile, 'mcp-status-loading.png') });
      await releaseMcpStatus();
      await mcpReady();
      assert.equal(await reloadMcp.count(), 0, 'completed MCP status removes the loading button');
      await open('notifications');
      await holdMcpStatus(true);
      await openMcp();
      await releaseMcpStatus();
      await host.getByRole('alert').filter({ hasText: 'Fixture MCP status failure' }).waitFor();
      assert(
        await reloadMcp.isVisible(),
        'failed status offers retry without waiting for the timer',
      );
      await reloadMcp.click();
      await mcpReady();
      await host
        .getByRole('alert')
        .filter({ hasText: 'Fixture MCP status failure' })
        .waitFor({ state: 'hidden' });
      await open('notifications');
      await holdMcpStatus();
      await openMcp();
      await open('notifications');
      await releaseMcpStatus();
      assert.equal(
        await reloadMcp.count(),
        0,
        'leaving pending MCP status keeps the selected page',
      );
      await host.getByTestId('settings-page:notifications').waitFor();
      checks.push(
        'MCP status avoids fast-load flicker, delays reload, preserves failure retry and allows leaving',
      );
    } finally {
      await releaseMcpStatus();
      await host.evaluate(() => window.mcpLoadingObserver?.disconnect());
    }

    for (const { theme, width } of [
      { theme: 'light', width: 1280 },
      { theme: 'dark', width: 760 },
    ]) {
      await open('appearance');
      await host.getByLabel('テーマ', { exact: true }).selectOption(theme);
      await settleSettings(host);
      await host.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      assert.equal((await saved()).host.theme, theme);
      await host.setViewportSize({ width, height: 840 });
      await open('notifications');
      const card = section('通知の受け取り方');
      const summary = card.locator(':scope > summary');
      if (await card.evaluate((element) => element.open)) await summary.click();
      const before = (await saved()).notificationPreferences;
      await summary.focus();
      await summary.press('Enter');
      assert(await card.evaluate((element) => element.open), 'Enter expands notification settings');
      await assertKeyboardFocus(summary);
      await assertReadableText(
        summary.getByRole('heading', { name: '通知の受け取り方', exact: true }),
      );
      await summary.press('Space');
      assert(
        !(await card.evaluate((element) => element.open)),
        'Space collapses notification settings',
      );
      await summary.click();
      assert(await card.evaluate((element) => element.open), 'disclosure row is clickable');
      assert.deepEqual(
        (await saved()).notificationPreferences,
        before,
        'disclosure never saves preferences',
      );
      const edit = host.getByRole('button', { name: 'AppDockのエラー通知を編集', exact: true });
      await edit.focus();
      await edit.press('Enter');
      const notificationDialog = host.getByRole('dialog');
      await notificationDialog.waitFor();
      assert(
        await notificationDialog.getByLabel('エラー通知のバナー', { exact: true }).isEnabled(),
      );
      assert(
        await notificationDialog.getByLabel('エラー通知のバナー', { exact: true }).isChecked(),
      );
      await notificationDialog.getByLabel('エラー通知のバナー', { exact: true }).uncheck();
      assert(
        await notificationDialog
          .getByLabel('エラー通知の通知センターのみ', { exact: true })
          .isChecked(),
      );
      await host.screenshot({ path: path.join(profile, `${theme}-${width}-controls.png`) });
      await notificationDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
      await notificationDialog.waitFor({ state: 'hidden' });
      assert(await edit.evaluate((element) => element === document.activeElement));
      assert.deepEqual((await saved()).notificationPreferences, before);
      checks.push(
        `${theme}/${width}: keyboard expansion, focus, row click and optional notification destination cancel`,
      );
    }
    await host.getByRole('button', { name: 'AppDockのエラー通知を編集', exact: true }).click();
    const notificationBefore = (await saved()).notificationPreferences;
    await host.getByLabel('エラー通知の表示時間', { exact: true }).fill('12');
    await host.getByLabel('エラー通知の表示時間', { exact: true }).press('Enter');
    assert.deepEqual(
      (await saved()).notificationPreferences,
      notificationBefore,
      'notification draft stays local',
    );
    await host.getByRole('dialog').getByTestId('settings-dialog-confirm').click();
    await host.getByRole('dialog').waitFor({ state: 'hidden' });
    await settleSettings(host);
    const notification = (await saved()).notificationPreferences.overrides.find(
      (row) => row.ownerId === 'errors',
    );
    assert.equal(notification.durationSeconds, 12);
    const notificationRow = host
      .getByRole('row')
      .filter({ has: host.getByText('エラー通知', { exact: true }) });
    assert.match(await notificationRow.innerText(), /12秒/);
    checks.push('notification draft saves only on OK and the list reflects its saved value');
    for (const title of ['エラー通知', '警告通知', 'インフォメーション通知']) {
      await host.getByRole('button', { name: `AppDockの${title}を編集`, exact: true }).click();
      const dialog = host.getByRole('dialog');
      await dialog.getByLabel(`${title}の通知センターのみ`, { exact: true }).check();
      await dialog.getByTestId('settings-dialog-confirm').click();
      await dialog.waitFor({ state: 'hidden' });
      await settleSettings(host);
      await host.getByRole('button', { name: `AppDockの${title}を編集`, exact: true }).click();
      assert(await dialog.getByLabel(`${title}の通知センターのみ`, { exact: true }).isChecked());
      await dialog.getByLabel(`${title}のデスクトップ通知`, { exact: true }).check();
      await dialog.getByTestId('settings-dialog-confirm').click();
      await dialog.waitFor({ state: 'hidden' });
      await settleSettings(host);
    }
    const storedTypes = (await saved()).notificationPreferences.overrides.filter((row) =>
      ['errors', 'warnings', 'information'].includes(row.ownerId),
    );
    assert.equal(storedTypes.length, 3);
    assert(storedTypes.every((row) => JSON.stringify(row.targets) === '["desktop"]'));
    checks.push(
      'all three host notification types persist center-only and desktop-only destinations without adding banners',
    );

    await open('general');
    const search = host.getByRole('combobox', { name: '設定を検索', exact: true });
    await search.fill('移動距離');
    await host.getByRole('option', { name: /移動距離/ }).click();
    await host.getByTestId('settings-page:gestures').waitFor();
    assert.equal((await saved()).gestures.enabled, false, 'search never enables input hooks');
    await search.fill('');
    checks.push('search reaches the selected setting without changing input ownership');

    await host.setViewportSize({ width: 1280, height: 840 });
    await open('ai');
    await host.getByRole('button', { name: 'AIサーバーを追加', exact: true }).click();
    const dialog = host.getByRole('dialog');
    const before = (await saved()).ai;
    await dialog.getByLabel('AI接続の名前', { exact: true }).fill('Control probe');
    await dialog.getByLabel('AIのAPIのURL', { exact: true }).fill('http://127.0.0.1:1/v1');
    await dialog.getByLabel('AIの既定の出力トークン上限', { exact: true }).fill('16384');
    await dialog.getByLabel('AIの既定の待ち時間（秒）', { exact: true }).fill('120');
    assert.deepEqual((await saved()).ai, before, 'dialog edits remain local before OK');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const persisted = (await saved()).ai;
    const connection = persisted.connections.find((row) => row.name === 'Control probe');
    assert(connection);
    assert.equal(connection.defaultMaxOutputTokens, 16384);
    assert.equal(connection.defaultTimeoutSeconds, 120);
    assert.equal(connection.baseUrl, 'http://127.0.0.1:1/v1');
    await host.getByRole('button', { name: 'Control probeの設定', exact: true }).click();
    assert.equal(
      await dialog.getByLabel('AIの既定の待ち時間（秒）', { exact: true }).inputValue(),
      '120',
    );
    await dialog.getByLabel('AIのTemperature', { exact: true }).fill('0.7');
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual((await saved()).ai, persisted, 'cancel discards local edits');
    checks.push(
      'AI dialog keeps drafts local, saves on OK, restores values and discards on cancel',
    );
    await app.close();
    app = await launchTestHost({
      executablePath,
      portable: !!source,
      env,
      args: [
        ...(source ? [] : [root]),
        '--test-profile=' + profile,
        '--test-local-state=' + path.join(profile, 'local'),
      ],
    });
    const restartDeadline = Date.now() + 30000;
    host = undefined;
    while (!host && Date.now() < restartDeadline) {
      host = app
        .context()
        .pages()
        .find((page) => page.url().startsWith('appdock://host/'));
      if (!host) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert(host);
    await waitForHost(host, async () => (await window.dock?.snapshot())?.startupReady);
    await open('notifications');
    assert.equal(
      await host.getByTestId('notification-banner-position').inputValue(),
      'bottom-left',
    );
    assert.deepEqual(
      (await saved()).notificationPreferences.overrides,
      JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile, 'settings.json'))).notificationPreferences
        .overrides,
    );
    assert(
      (await saved()).notificationPreferences.overrides
        .filter((row) => ['errors', 'warnings', 'information'].includes(row.ownerId))
        .every((row) => JSON.stringify(row.targets) === '["desktop"]'),
    );
    checks.push(
      'process restart restores the saved banner position and all three optional destinations',
    );
    assert.deepEqual(errors, []);
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack || String(error));
    console.error(error);
    process.exitCode = 1;
    if (host) await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
  } finally {
    if (app)
      await app.close().catch((error) => {
        errors.push(error.message);
        success = false;
        process.exitCode = 1;
      });
    const result = {
      success,
      checks,
      errors,
      profile,
      source: source || 'development build',
      executableSha256: source ? hash(executablePath) : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
