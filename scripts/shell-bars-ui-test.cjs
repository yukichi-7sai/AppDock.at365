const { _electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { leftDrag } = require('./windows-mouse-helper.cjs');
const { createHash } = require('node:crypto');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { barPage } = require('./shell-bars-helper.cjs');
const { closingAction, overlayPage } = require('./shell-overlay-helper.cjs');
const root = path.resolve(__dirname, '..');
const notificationsOnly = process.argv.includes('--notifications-only');
const visibilityOnly = process.argv.includes('--visibility-only');
const portable = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const profile = path.join(
  root,
  '.artifacts',
  `${visibilityOnly ? 'statusbar-visibility' : 'shell-bars'}-${Date.now()}`,
);
fs.mkdirSync(profile, { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.closeToTray = false;
if (visibilityOnly) {
  settings.host.soundEnabled = false;
  settings.gestures.enabled = false;
  settings.touchpadGestures.enabled = false;
}
settings.globalShortcutCommands = [];
settings.updates.checkHostOnStartup = settings.updates.checkAppletsOnStartup = false;
settings.updates.checkHostOnAboutOpen = false;
if (notificationsOnly) {
  const id = 'fixture.bell';
  const folder = path.join(profile, 'extensions', id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name: 'Notification bell fixture',
      version: '1.0.0',
      minimumHostVersion: '0.100.0',
      runtime: 'node',
      entry: 'index.cjs',
      capabilities: ['notifications'],
      commands: ['publish', 'end', 'timed'].map((key) => ({ id: id + '.' + key, title: key })),
      notificationTypes: ['message', 'timed'].map((typeId) => ({
        typeId,
        title: typeId,
        description: 'Notification bell fixture',
        levels: ['info'],
        defaultLevel: 'info',
        allowedTargets: ['banner'],
        defaultTargets: [],
        requiredTargets: [],
        lifetimePolicy: 'userDuration',
        defaultDurationSeconds: typeId === 'timed' ? 3 : null,
        history: 'session',
      })),
    }),
  );
  fs.writeFileSync(
    path.join(folder, 'index.cjs'),
    `exports.activate = async c => {
      let current;
      const publish = typeId => c.notifications.publish({
        typeId, title: 'Bell notification', body: 'Notification bell fixture', dedupeKey: typeId,
      });
      c.commands.register('fixture.bell.publish', 'Publish', async () => {
        current = (await publish('message')).notificationId;
      });
      c.commands.register('fixture.bell.end', 'End', async () => c.notifications.end(current));
      c.commands.register('fixture.bell.timed', 'Timed', async () => publish('timed'));
    };`,
  );
  settings.extensions[id] = { enabled: true, settings: {} };
}
const hostFeed = path.join(profile, 'host-feed.json');
fs.writeFileSync(
  hostFeed,
  JSON.stringify({
    schemaVersion: 1,
    kind: 'host',
    id: 'host',
    version: require('../package.json').version,
    payload: { file: 'unused.exe', size: 1, sha256: '0'.repeat(64), format: 'exe' },
  }),
);
settings.updates.hostSource = hostFeed;
for (const [id, views] of [
  ['fixture.bars-a', { titlebar: 'bars.html', statusbar: 'bars.html' }],
  ['fixture.bars-b', { statusbar: 'bars.html' }],
  ['fixture.bars-stalled', { titlebar: 'stalled.html' }],
]) {
  const folder = path.join(profile, 'extensions', id);
  fs.cpSync(path.join(root, 'out/shells/default'), folder, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'extension.json')));
  Object.assign(manifest, {
    id,
    name: id,
    version: '1.0.0',
    minimumHostVersion: '0.64.0',
    shell: { apiVersion: 1, views },
  });
  fs.writeFileSync(path.join(folder, 'extension.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(folder, 'stalled.html'), '<!doctype html><body>Not ready</body>');
  settings.extensions[id] = { enabled: true, settings: { fixture: id } };
}
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const result = { profile, notificationsOnly, visibilityOnly, success: false, checks: [] };
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let app, browser, context, host, child, mainPort, title, status;
const until = async (fn, label, timeout = 30000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw Error(label);
};
const main = (fn, arg) =>
  app
    ? app.evaluate(fn, arg)
    : inspect(
        mainPort,
        `(${fn.toString()})(${electronExpression},${JSON.stringify(arg) ?? 'undefined'})`,
      );
const state = (region) =>
  host.evaluate(
    async (region) =>
      (await window.dock.snapshot()).shellRegions.regions.find((r) => r.region === region),
    region,
  );
const assigned = async (region, provider) =>
  until(async () => {
    const current = await state(region);
    return current.boundProvider === provider && current.ready && current;
  }, `${region} provider ${provider}`);
const save = (patch) =>
  host.evaluate(async (patch) => {
    const s = await window.dock.snapshot();
    await window.dock.saveSettings(
      { ...s.settings.value, host: { ...s.settings.value.host, ...patch } },
      s.settings.revision,
    );
  }, patch);
const assign = async (providers) => {
  const current = await host.evaluate(
    async () => (await window.dock.snapshot()).settings.value.host.shellProviders,
  );
  await save({ shellProviders: { ...current, ...providers } });
};
const capture = async (name) => {
  const image = await main(async ({ BrowserWindow, desktopCapturer }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock://host/'),
    );
    const [width, height] = w.getSize();
    const source = (
      await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width, height } })
    ).find((s) => s.id === w.getMediaSourceId());
    return source.thumbnail.toPNG().toString('base64');
  });
  fs.writeFileSync(path.join(profile, name + '.png'), Buffer.from(image, 'base64'));
};
async function launch(extra = []) {
  if (portable) {
    const executable = path.join(profile, 'AppDock.at365.exe');
    if (!fs.existsSync(executable))
      require('./copy-host.cjs').copyHost(path.resolve(portable), executable);
    result.executableSha256 = hash(executable);
    assert.equal(result.executableSha256, hash(path.resolve(portable)));
    const port = await freePort();
    mainPort = await freePort();
    child = spawn(
      executable,
      [
        `--test-profile=${profile}`,
        `--test-local-state=${path.join(profile, 'local')}`,
        `--remote-debugging-port=${port}`,
        `--inspect=${mainPort}`,
        ...extra,
      ],
      { cwd: profile, env, windowsHide: false, stdio: 'ignore' },
    );
    browser = await until(
      () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
      'portable CDP',
    );
    context = browser.contexts()[0];
  } else {
    app = await _electron.launch({
      executablePath: require('electron'),
      args: [
        root,
        `--test-profile=${profile}`,
        `--test-local-state=${path.join(profile, 'local')}`,
        ...extra,
      ],
      env,
    });
    context = app.context();
  }
  host = await until(
    () => context.pages().find((p) => p.url().startsWith('appdock://host/')),
    'host',
  );
  host.setDefaultTimeout(15000);
  await until(
    () => host.evaluate(async () => (await window.dock.snapshot()).startupReady),
    'startup',
  );
  title = await barPage(host, 'titlebar');
  status = await barPage(host, 'statusbar');
}
async function close() {
  if (host && !host.isClosed())
    await host
      .evaluate(() => {
        void window.dock.executeCommand('appdock.quit');
      })
      .catch(() => {});
  if (child) await until(() => child.exitCode !== null, 'portable exit');
  if (browser) await browser.close().catch(() => {});
  if (app) await app.close().catch(() => {});
  app = browser = child = undefined;
}
(async () => {
  try {
    await launch();
    if (visibilityOnly) {
      await require('./statusbar-visibility-checks.cjs')({
        host: () => host,
        state,
        save,
        assign,
        launch,
        close,
        main,
        capture,
        barPage,
        profile,
        checks: result.checks,
      });
      result.success = true;
      return;
    }
    if (notificationsOnly) {
      await until(
        async () =>
          (await host.evaluate(() => window.dock.snapshot())).extensions.some(
            (e) => e.id === 'fixture.bell' && e.state === 'running',
          ),
        'notification fixture ready',
      );
      const command = (id) => host.evaluate((id) => window.dock.executeCommand(id), id);
      await command('appdock.notifications.open');
      await until(
        async () => (await host.evaluate(() => window.dock.pages.get()))?.kind === 'notifications',
        'center ready',
      );
      // Remove startup warnings in this isolated profile before checking exact notification counts.
      await host.evaluate(async () => {
        const model = await window.dock.pages.get();
        for (const item of model.content.items.filter(
          (item) => item.status === 'active' && item.dismissible,
        ))
          await window.dock.pages.action({
            id: model.id,
            type: 'notifications',
            action: {
              type: 'act',
              request: {
                notificationId: item.id,
                revision: item.revision,
                requestId: crypto.randomUUID(),
                type: 'dismiss',
              },
            },
          });
      });
      const bell = title.getByTestId('notification-center');
      const count = async (expected) => {
        await until(
          async () => (await bell.getAttribute('aria-label'))?.includes(`アクティブ ${expected}件`),
          'bell explanation',
        );
        assert.equal(await bell.getAttribute('data-active'), expected ? 'true' : null);
      };
      await count(0);
      assert.equal(await host.evaluate(() => typeof window.dock.focusNotifications), 'undefined');
      await command('appdock.logs.open');
      await bell.click();
      await until(
        async () => (await host.evaluate(() => window.dock.pages.get()))?.kind === 'notifications',
        'empty bell opens center',
      );
      result.checks.push('empty bell opens the center and removed banner focus entry is absent');
      for (const theme of ['light', 'dark']) {
        await save({ theme });
        await title.waitForFunction(
          (theme) => document.documentElement.dataset.theme === theme,
          theme,
        );
        const normalColor = await bell.evaluate((button) => getComputedStyle(button).color);
        await command('fixture.bell.publish');
        await count(1);
        const activeColor = await bell.evaluate((button) => getComputedStyle(button).color);
        assert.notEqual(activeColor, normalColor);
        await command('fixture.bell.publish');
        await count(1);
        await command('appdock.logs.open');
        await bell.click();
        await host
          .getByRole('button', { name: 'Bell notificationを閉じる', exact: true })
          .waitFor();
        await count(1);
        await capture('bell-active-' + theme);
        await host.getByRole('button', { name: 'Bell notificationを閉じる', exact: true }).click();
        await count(0);
        assert.equal(await bell.evaluate((button) => getComputedStyle(button).color), normalColor);
        await command('fixture.bell.publish');
        await count(1);
        await command('fixture.bell.end');
        await count(0);
        result.checks.push(
          theme +
            ': center-only notification colors the bell; dedupe/open retain count; dismiss/resolve restore normal color',
        );
      }
      await command('fixture.bell.timed');
      await count(1);
      await count(0);
      result.checks.push('timed notification expiry restores the normal bell');
      await host.evaluate(async () => {
        const s = await window.dock.snapshot();
        s.settings.value.notificationPreferences ??= { overrides: [] };
        s.settings.value.notificationPreferences.overrides.push({
          ownerKind: 'applet',
          ownerId: 'fixture.bell',
          typeId: 'message',
          targets: ['banner'],
        });
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      });
      await command('fixture.bell.publish');
      await count(1);
      const banner = await until(
        () => context.pages().find((page) => page.url().endsWith('/notifications.html')),
        'banner',
      );
      await banner.getByRole('region', { name: 'Bell notification', exact: true }).waitFor();
      assert.equal(
        await banner.evaluate(() => typeof window.appdockNotifications.onFocus),
        'undefined',
      );
      await command('appdock.logs.open');
      await bell.click();
      await until(
        async () => (await host.evaluate(() => window.dock.pages.get()))?.kind === 'notifications',
        'bell opens center with banner',
      );
      await until(
        async () =>
          (await main(({ webContents }) => webContents.getFocusedWebContents()?.getURL())) ===
          host.url(),
        'center receives native focus',
      );
      await count(1);
      await host.evaluate(() => window.dock.toggleExtension('fixture.bell', false));
      await count(0);
      result.checks.push(
        'visible banner does not receive bell focus; removed notification focus event is absent; owner stop clears count',
      );
      result.success = true;
      return;
    }
    const defaultId = 'appdock.default-shell';
    assert.equal(await host.locator('header.titlebar, footer.statusbar').count(), 0);
    assert.equal(await title.evaluate(() => typeof window.dock), 'undefined');
    assert.equal(await status.evaluate(() => typeof require), 'undefined');
    const initialStatus = await status.evaluate(() => window.appdockBar.connect());
    assert(initialStatus.snapshot.runningApplets >= 3);
    await status.getByRole('button', { name: 'AppDockを更新', exact: true }).click();
    if (!portable) {
      await status.getByRole('alert').waitFor();
      await host.evaluate(() => window.dock.checkUpdates());
    }
    await until(
      () =>
        host.evaluate(async () => {
          const s = await window.dock.snapshot();
          return !s.updates.busy && s.updates.results.some((r) => r.id === 'host');
        }),
      'host update check completes',
    );
    assert(
      (await host.evaluate(() => window.dock.snapshot())).updates.results.some(
        (r) => r.id === 'host',
      ),
    );
    assert.equal(
      await title.evaluate(async () => {
        const c = await window.appdockBar.connect();
        try {
          await window.appdockBar.invoke({
            sessionId: 'old',
            requestId: crypto.randomUUID(),
            actionId: c.snapshot.actions.close,
          });
          return false;
        } catch {
          return true;
        }
      }),
      true,
    );
    assert.equal(
      await title.evaluate(async () => {
        try {
          await window.appdockBar.executeCommand('appdock.quit');
          return false;
        } catch {
          return true;
        }
      }),
      true,
    );
    result.checks.push(
      'independent public-only bar renderers, current state, host update action, stale-session and foreign-command rejection',
    );
    await title.getByTestId('notification-center').click();
    await until(
      async () => (await host.evaluate(() => window.dock.pages.get()))?.kind === 'notifications',
      'notification button opens the notification center',
    );
    for (const page of [title, status]) {
      if (page === title) await page.getByRole('button', { name: 'コマンドを検索' }).click();
      else {
        assert.equal(await page.getByRole('button', { name: 'コマンドパレット' }).count(), 0);
        await host.locator('[data-region="statusbar"]').focus();
        await page.waitForFunction(() => document.hasFocus());
        await page.keyboard.press('Control+p');
      }
      const palette = await overlayPage(host);
      await closingAction(palette.keyboard.press('Escape'));
      await until(async () => !(await state('overlay.command-palette')).visible, 'palette closed');
      await page.waitForFunction(() => document.hasFocus());
      await page.keyboard.press('Control+p');
      await closingAction((await overlayPage(host)).keyboard.press('Escape'));
      await until(
        async () => !(await state('overlay.command-palette')).visible,
        'keyboard palette closed',
      );
    }
    await title.getByRole('button', { name: '閉じる', exact: true }).focus();
    await title.keyboard.press('Tab');
    await until(
      () =>
        context
          .pages()
          .find((p) => p.url().endsWith('/index.html') && p !== host)
          ?.evaluate(() => document.hasFocus()),
      'title to ribbon focus',
    );
    await host.locator('[data-region="statusbar"]').focus();
    await status.waitForFunction(() => document.hasFocus());
    await status.getByRole('button', { name: 'AppDockを更新', exact: true }).focus();
    await status.keyboard.press('Tab');
    await title.waitForFunction(() => document.hasFocus());
    result.checks.push(
      'notification button opens the center; title palette button and shortcuts from both bars restore focus; Tab crosses title/ribbon/body/status boundaries',
    );
    await title.getByRole('button', { name: '最大化', exact: true }).click();
    await title.getByRole('button', { name: '元に戻す', exact: true }).waitFor();
    await title.getByRole('button', { name: '元に戻す', exact: true }).click();
    await title.getByRole('button', { name: '最小化', exact: true }).click();
    await until(
      () =>
        main(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
            .isMinimized(),
        ),
      'minimized',
    );
    await main(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      w.restore();
      w.show();
      w.focus();
      w.setBounds({ x: 80, y: 80, width: 1000, height: 720 });
    });
    await title.waitForFunction(
      () =>
        innerWidth === 1000 &&
        getComputedStyle(document.querySelector('.titlebar')).webkitAppRegion === 'drag',
    );
    const drag = await main(({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      const before = w.getBounds();
      return {
        before,
        from: screen.dipToScreenPoint({ x: before.x + 230, y: before.y + 20 }),
        to: screen.dipToScreenPoint({ x: before.x + 310, y: before.y + 70 }),
      };
    });
    result.drag = drag;
    leftDrag(drag.from, drag.to);
    const after = await until(async () => {
      const bounds = await main(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
          .getBounds(),
      );
      return bounds.x !== drag.before.x && bounds;
    }, 'native titlebar drag moves the window');
    result.drag = { before: drag.before, after };
    result.checks.push(
      'native minimize/maximize/restore and real Windows mouse dragging through the Shell titlebar',
    );
    if (process.argv.includes('--controls-only')) {
      await closingAction(title.getByRole('button', { name: '閉じる', exact: true }).click());
      await until(() => host.isClosed(), 'close button closes the host window');
      result.checks.push('close button closes the host window');
      result.scope = 'controls';
      result.success = true;
      return;
    }
    await host.evaluate(() => {
      const modal = document.createElement('dialog');
      modal.id = 'bar-modal-fixture';
      modal.style.cssText =
        'position:fixed;inset:0;margin:0;width:100vw;max-width:none;height:100vh;max-height:none;border:0;padding:0';
      const button = document.createElement('button');
      button.textContent = 'Modal native click';
      button.style.cssText = 'position:absolute;left:240px;top:5px;width:180px;height:30px';
      button.onclick = () => {
        document.body.dataset.barModalClicked = 'true';
        modal.close();
        modal.remove();
      };
      modal.append(button);
      document.body.append(modal);
      modal.showModal();
    });
    await until(
      async () =>
        !(await state('titlebar')).visible &&
        (await host.locator('[data-host-modal-surface]').count()) === 3,
      'all bar surfaces covered',
    );
    for (const page of [title, status])
      assert.equal(
        await page.evaluate(async () => {
          const c = await window.appdockBar.connect();
          try {
            await window.appdockBar.invoke({
              sessionId: c.sessionId,
              requestId: crypto.randomUUID(),
              actionId: c.snapshot.actions.palette,
            });
            return false;
          } catch {
            return true;
          }
        }),
        true,
      );
    const covered = await main(({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      const before = w.getBounds();
      return {
        before,
        from: screen.dipToScreenPoint({ x: before.x + 180, y: before.y + 20 }),
        to: screen.dipToScreenPoint({ x: before.x + 260, y: before.y + 60 }),
        click: screen.dipToScreenPoint({ x: before.x + 300, y: before.y + 20 }),
      };
    });
    leftDrag(covered.from, covered.to);
    assert.deepEqual(
      await main(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
          .getBounds(),
      ),
      covered.before,
    );
    leftDrag(covered.click);
    await host.waitForFunction(() => document.body.dataset.barModalClicked === 'true');
    result.checks.push(
      'hidden titlebar has no native drag hit area; a real mouse click reaches the modal over the titlebar',
    );
    for (const theme of ['light', 'dark']) {
      await save({ theme });
      await title.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      await status.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      for (const [width, zoom] of [
        [1280, 1],
        [900, 1],
        [1000, 1.25],
      ]) {
        await main(
          ({ BrowserWindow }, { width, zoom }) => {
            const w = BrowserWindow.getAllWindows().find((w) =>
              w.webContents.getURL().startsWith('appdock://host/'),
            );
            w.setSize(width, 720);
            w.webContents.setZoomFactor(zoom);
          },
          { width, zoom },
        );
        await until(async () => {
          const bounds = await main(({ BrowserWindow }) => {
            const w = BrowserWindow.getAllWindows().find((w) =>
              w.webContents.getURL().startsWith('appdock://host/'),
            );
            return w.contentView.children
              .filter((v) => v.webContents?.getURL().endsWith('/bars.html'))
              .map((v) => ({ bounds: v.getBounds(), zoom: v.webContents.getZoomFactor() }));
          });
          return (
            bounds.length === 2 && bounds.every((v) => v.bounds.width === width && v.zoom === zoom)
          );
        }, 'bar bounds follow host zoom');
        assert(await title.getByRole('button', { name: '閉じる', exact: true }).isVisible());
        await capture(`${theme}-${width}-zoom-${zoom}`);
      }
    }
    await main(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
        .webContents.setZoomFactor(1),
    );
    result.checks.push(
      'light/dark and 900/1280px plus 125% zoom preserve bar bounds and window controls',
    );
    await host.evaluate(() => window.dock.navigate('settings'));
    await host.getByLabel('タイトルバーのShell', { exact: true }).selectOption('fixture.bars-a');
    await assigned('titlebar', 'fixture.bars-a');
    await assigned('statusbar', defaultId);
    await host.getByLabel('ステータスバーのShell', { exact: true }).selectOption('fixture.bars-b');
    await assigned('statusbar', 'fixture.bars-b');
    title = await barPage(host, 'titlebar');
    status = await barPage(host, 'statusbar');
    assert.equal(
      (await title.evaluate(() => window.appdockBar.getSettings())).fixture,
      'fixture.bars-a',
    );
    const retainedStatus = await status.evaluate(() => window.appdockBar.connect());
    await title.getByRole('button', { name: 'コマンドを検索' }).click();
    await closingAction((await overlayPage(host)).keyboard.press('Escape'));
    await main(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
        .contentView.children.find((v) =>
          v.webContents?.getURL().includes('/fixture.bars-a/bars.html'),
        )
        .webContents.forcefullyCrashRenderer(),
    );
    await assigned('titlebar', defaultId);
    const recoveredTitle = await barPage(host, 'titlebar');
    const oldDefaultSession = (await recoveredTitle.evaluate(() => window.appdockBar.connect()))
      .sessionId;
    await main(({ dialog, BrowserWindow }) => {
      globalThis.__barDialogFixture = { original: dialog.showMessageBox, count: 0 };
      dialog.showMessageBox = (...args) => {
        if (args.some((arg) => arg?.title === 'Default Shell')) {
          globalThis.__barDialogFixture.count++;
          return Promise.resolve({ response: 0, checkboxChecked: false });
        }
        return globalThis.__barDialogFixture.original(...args);
      };
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      w.contentView.children
        .find(
          (v) =>
            v.webContents?.getURL().includes('/shells/default/bars.html') && v.getBounds().y === 0,
        )
        .webContents.forcefullyCrashRenderer();
    });
    await until(async () => {
      try {
        return (
          (await (await barPage(host, 'titlebar')).evaluate(() => window.appdockBar.connect()))
            .sessionId !== oldDefaultSession
        );
      } catch {
        return false;
      }
    }, 'Default titlebar native retry');
    assert.equal(
      await main(({ dialog }) => {
        dialog.showMessageBox = globalThis.__barDialogFixture.original;
        return globalThis.__barDialogFixture.count;
      }),
      1,
    );
    assert.equal(
      (await status.evaluate(() => window.appdockBar.connect())).sessionId,
      retainedStatus.sessionId,
    );
    assert.equal((await state('titlebar')).configuredProvider, 'fixture.bars-a');
    result.checks.push(
      'settings select independent providers; external public bridge works; renderer failure restores only titlebar and retains status session',
    );
    await host.evaluate(() => window.dock.restartExtension('fixture.bars-b'));
    await assigned('statusbar', 'fixture.bars-b');
    await host.evaluate(() => window.dock.toggleExtension('fixture.bars-b', false));
    await assigned('statusbar', defaultId);
    await host.evaluate(() => window.dock.toggleExtension('fixture.bars-b', true));
    await assigned('statusbar', 'fixture.bars-b');
    await assign({ titlebar: 'fixture.bars-b' });
    await assigned('titlebar', defaultId);
    assert.match((await state('titlebar')).reason, /提供していません/);
    await assign({ titlebar: 'fixture.bars-stalled' });
    await until(
      async () => (await state('titlebar')).pendingProvider === 'fixture.bars-stalled',
      'pending title',
    );
    assert((await state('titlebar')).ready);
    await until(
      async () => /故障/.test((await state('titlebar')).reason),
      'ready deadline fallback',
      18000,
    );
    await assigned('titlebar', defaultId);
    result.checks.push(
      'disable/re-enable/restart, unprovided region and ready deadline retain assignments and recover per region',
    );
    await assign({ titlebar: 'fixture.bars-a' });
    const retry = host
      .getByLabel('タイトルバーのShell')
      .locator('..')
      .getByRole('button', { name: 'この領域を再試行', exact: true });
    await retry.click();
    await assigned('titlebar', 'fixture.bars-a');
    await close();
    await launch(['--safe-shell']);
    await assigned('titlebar', defaultId);
    await assigned('statusbar', defaultId);
    assert.equal((await state('titlebar')).configuredProvider, 'fixture.bars-a');
    await close();
    await launch();
    await assigned('titlebar', 'fixture.bars-a');
    await assigned('statusbar', 'fixture.bars-b');
    result.checks.push(
      'explicit per-region retry, safe launch and subsequent normal launch preserve saved providers',
    );
    title = await barPage(host, 'titlebar');
    await closingAction(title.getByRole('button', { name: '閉じる', exact: true }).click());
    await until(() => host.isClosed(), 'close button closes the host window');
    result.success = true;
  } catch (error) {
    result.error = String(error.stack || error);
    process.exitCode = 1;
  } finally {
    await close().catch(() => {});
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})();
