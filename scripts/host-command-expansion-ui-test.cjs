const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launch, until } = require('./page-test-host.cjs');
const { file } = require('./test-settings.cjs');
const { overlayPage } = require('./shell-overlay-helper.cjs');
const profile = path.resolve('.artifacts', `host-command-expansion-ui-${Date.now()}`);
const portable = process.argv[2] && path.resolve(process.argv[2]);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, {
  closeToTray: false,
  hardwareAcceleration: false,
  soundEnabled: false,
  zoomFactor: 1,
});
Object.assign(settings.updates, {
  hostSource: '',
  checkHostOnAboutOpen: false,
  checkHostOnStartup: false,
  checkAppletsOnStartup: false,
});
settings.trayMenu = [];
fs.writeFileSync(file(profile), JSON.stringify(settings));
const checks = [];
let host;
const execute = (id) => host.main.evaluate((id) => window.dock.executeCommand(id), id);
const state = () => host.main.evaluate(() => window.dock.snapshot());
const windowState = () =>
  host.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock://host/index.html'),
    );
    return { visible: w.isVisible(), minimized: w.isMinimized(), maximized: w.isMaximized() };
  });
async function instrument() {
  await host.app.evaluate(({ app, Menu, net }) => {
    const read = process
      .getBuiltinModule('module')
      .createRequire(app.getAppPath() + '/package.json');
    globalThis.commandFixture = { writes: [], menus: [] };
    // Keep this isolated UI test independent of external services and Windows startup/touchpad settings.
    net.fetch = async () => {
      throw Error('External networking is disabled in this fixture');
    };
    const { WindowsLaunch } = read('./out/main/main/core/windows-launch.js');
    WindowsLaunch.prototype.save = async function (next, previous, validate, commit) {
      validate();
      globalThis.commandFixture.writes.push({
        next: { startAtLogon: next.startAtLogon, runAsAdministrator: next.runAsAdministrator },
      });
      return commit();
    };
    const { TouchpadBridgeManager } = read('./out/main/main/core/touchpad-bridge.js');
    TouchpadBridgeManager.prototype.afterLocalEdit = async function (before) {
      globalThis.commandFixture.touchpadBefore = before.touchpadGestures.enabled;
    };
    TouchpadBridgeManager.prototype.reconcile = async function () {};
    const { InputCaptureManager } = read('./out/main/main/core/gestures.js');
    InputCaptureManager.prototype.touchpadRequest = async () => {
      throw Error('Native touchpad access disabled');
    };
    const { NotificationService } = read('./out/main/main/core/notification-service.js');
    const pause = NotificationService.prototype.setPaused;
    NotificationService.prototype.setPaused = function (value) {
      globalThis.commandFixture.notifications = this;
      return pause.call(this, value);
    };
    const build = Menu.buildFromTemplate;
    Menu.buildFromTemplate = function (template) {
      globalThis.commandFixture.menu = template;
      return build.call(this, template);
    };
  });
}
async function checkMenu(title) {
  return host.app.evaluate((_electron, title) => {
    const rows = globalThis.commandFixture.menu ?? [];
    return rows.some(
      (row) => Array.isArray(row.submenu) && row.submenu.some((item) => item.label === title),
    );
  }, title);
}
(async () => {
  try {
    host = await launch(profile, portable);
    await instrument();
    await execute('appdock.open');
    await execute('appdock.ribbon.expand');
    assert.equal((await state()).ribbonDisplayMode, 'expanded');
    await execute('appdock.settings.ribbonExpandOnHover.on');
    await execute('appdock.ribbon.expand');
    assert.equal((await state()).settings.value.host.ribbonExpandOnHover, false);
    assert.equal((await state()).ribbonDisplayMode, 'expanded');
    await execute('appdock.ribbon.collapse');
    assert.equal((await state()).ribbonDisplayMode, 'compact');
    await execute('appdock.ribbon.toggle');
    assert.equal((await state()).ribbonDisplayMode, 'expanded');
    checks.push('ribbon explicit modes, toggle and atomic hover-off');

    for (const theme of ['dark', 'light', 'system']) {
      await execute(`appdock.theme.${theme}`);
      assert.equal((await state()).settings.value.host.theme, theme);
    }
    await execute('appdock.theme.light');
    await execute('appdock.theme.toggle');
    assert.equal((await state()).settings.value.host.theme, 'dark');
    await execute('appdock.zoom.in');
    assert.equal((await state()).settings.value.host.zoomFactor, 1.1);
    await execute('appdock.zoom.out');
    assert.equal((await state()).settings.value.host.zoomFactor, 1);
    await host.save({ host: { zoomFactor: 2 } });
    await execute('appdock.zoom.in');
    assert.equal((await state()).settings.value.host.zoomFactor, 2);
    await host.save({ host: { zoomFactor: 0.5 } });
    await execute('appdock.zoom.out');
    assert.equal((await state()).settings.value.host.zoomFactor, 0.5);
    await execute('appdock.zoom.reset');
    checks.push('theme and display zoom save with upper and lower bounds');

    for (const [id, predicate] of [
      ['hide', (s) => !s.visible],
      ['toggle', (s) => s.visible && !s.minimized],
      ['minimize', (s) => s.minimized],
      ['toggle', (s) => s.visible && !s.minimized],
      ['maximize', (s) => s.maximized],
      ['restore', (s) => !s.maximized && !s.minimized],
      ['toggleMaximize', (s) => s.maximized],
      ['toggleMaximize', (s) => !s.maximized],
    ]) {
      await execute(`appdock.window.${id}`);
      await until(async () => predicate(await windowState()), `window ${id}`);
    }
    checks.push('hide/show, minimize, maximize/restore operate the real host window');

    const baseline = (await state()).settings.value;
    for (const [prefix, title] of [
      ['gestures', 'マウスジェスチャー'],
      ['shortcuts', 'キージェスチャー'],
      ['touchpadGestures', 'タッチパッドジェスチャー'],
      ['input', 'すべてのジェスチャー'],
    ]) {
      assert.equal((await execute(`appdock.${prefix}.pause`)).paused, true);
      assert(await checkMenu(`${title}を再開`), `resume remains reachable: ${prefix}`);
      assert.deepEqual((await state()).settings.value, baseline);
      assert.equal((await execute(`appdock.${prefix}.resume`)).paused, false);
    }
    await execute('appdock.gestures.pause');
    await execute('appdock.input.pause');
    await execute('appdock.input.resume');
    assert(await checkMenu('マウスジェスチャーを再開'));
    await execute('appdock.gestures.resume');
    checks.push(
      'all four pause controls keep settings, preserve individual pause and expose tray recovery',
    );

    const pause = await execute('appdock.notifications.pause30Minutes');
    assert(pause.paused && pause.until > Date.now() + 29 * 60 * 1000);
    assert(await checkMenu('通知の休止を解除'));
    const suppressed = await host.app.evaluate(() => {
      const service = globalThis.commandFixture.notifications;
      service.upsert('test.host-commands', {
        level: 'info',
        title: 'Command fixture',
        body: 'Notification pause check',
        lifetime: { type: 'manual' },
        dismissible: true,
        targets: ['banner'],
        history: 'session',
      });
      return {
        paused: service.isPaused(),
        visible: service.targetItems('banner').length,
        retained: service.activeCount,
      };
    });
    assert(suppressed.paused && suppressed.visible === 0 && suppressed.retained >= 1);
    assert.equal((await execute('appdock.notifications.resume')).paused, false);
    assert(
      await host.app.evaluate(
        () => globalThis.commandFixture.notifications.targetItems('banner').length > 0,
      ),
    );
    await host.app.evaluate(({ powerMonitor }) => powerMonitor.emit('lock-screen'));
    await execute('appdock.notifications.pause30Minutes');
    await execute('appdock.notifications.resume');
    assert(await host.app.evaluate(() => globalThis.commandFixture.notifications.isPaused()));
    await host.app.evaluate(({ powerMonitor }) => powerMonitor.emit('unlock-screen'));
    assert(!(await host.app.evaluate(() => globalThis.commandFixture.notifications.isPaused())));
    await execute('appdock.audio.stopAll');
    assert.equal((await state()).settings.value.host.soundEnabled, false);
    checks.push(
      'notification surfaces suppress and resume while retaining center entries and lock suppression; stop-audio keeps settings',
    );

    for (const key of ['paletteShowGuide', 'textPaletteHistory', 'hardwareAcceleration']) {
      await execute(`appdock.settings.${key}.off`);
      assert.equal((await state()).settings.value.host[key], false);
      await execute(`appdock.settings.${key}.on`);
      assert.equal((await state()).settings.value.host[key], true);
      await execute(`appdock.settings.${key}.toggle`);
      assert.equal((await state()).settings.value.host[key], false);
    }
    const { hostToggleSettings } = require('../out/main/shared/host-toggle-settings');
    for (const field of hostToggleSettings) {
      for (const action of ['on', 'off']) {
        await execute(`appdock.settings.${field.key}.${action}`);
        assert.equal(
          (await state()).settings.value[field.section][field.property],
          action === 'on',
          field.key,
        );
      }
    }
    const routes = await host.app.evaluate(() => ({
      count: globalThis.commandFixture.writes.length,
      touchpadBefore: globalThis.commandFixture.touchpadBefore,
    }));
    assert(routes.count >= 26);
    assert.equal(routes.touchpadBefore, true);
    checks.push(
      'ordinary and specialized switches persist through shared save, startup and touchpad lifecycle boundaries (OS writes stubbed)',
    );

    await execute('appdock.commands.search');
    const palette = await overlayPage(host.main);
    await palette.getByRole('combobox').fill('ホバーによる自動拡大をOFF');
    await palette.getByRole('option').filter({ hasText: 'リボンを大きくする' }).waitFor();
    await palette.screenshot({ path: path.join(profile, 'command-descriptions.png') });
    await palette.getByRole('combobox').press('Escape');
    checks.push('localized command descriptions are displayed and searchable');

    await execute('appdock.shortcuts.pause');
    await execute('appdock.notifications.pause30Minutes');
    const saved = (await state()).settings.value;
    await host.close();
    host = undefined;
    host = await launch(profile, portable);
    await instrument();
    assert.deepEqual((await state()).settings.value, saved);
    assert.equal((await execute('appdock.shortcuts.togglePause')).paused, true);
    assert.equal((await execute('appdock.notifications.togglePause')).paused, true);
    await execute('appdock.shortcuts.resume');
    await execute('appdock.notifications.resume');
    assert.equal((await state()).ribbonDisplayMode, 'expanded');
    checks.push('saved settings and ribbon size survive process restart; temporary pauses reset');
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: true, profile, portable, hash: host.hash, checks }, null, 2),
    );
    console.log(JSON.stringify({ ok: true, profile, checks }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), String(error.stack ?? error));
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (host) await host.close();
  }
})();
