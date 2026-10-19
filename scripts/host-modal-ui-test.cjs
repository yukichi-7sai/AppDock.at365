const { _electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs'),
  path = require('node:path');
const assert = require('node:assert/strict');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { waitForHost } = require('./settings-host-helper.cjs');
const { closingAction } = require('./shell-overlay-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `host-modal-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.closeToTray = false;
settings.globalShortcutCommands = [];
settings.customCommands = {
  version: 2,
  items: [
    {
      id: randomUUID(),
      typeId: 'appdock.input.sendKeys',
      owner: { kind: 'host' },
      title: 'Modal custom',
      description: '',
      configVersion: 1,
      config: { keys: 'Enter' },
      enabled: true,
      automation: false,
    },
  ],
};
const shellFolder = path.join(profile, 'extensions', 'fixture.modal-shell');
fs.cpSync(path.join(root, 'out/shells/default'), shellFolder, { recursive: true });
const shellManifest = JSON.parse(fs.readFileSync(path.join(shellFolder, 'extension.json')));
shellManifest.id = 'fixture.modal-shell';
shellManifest.name = 'Modal Shell';
shellManifest.shell = { apiVersion: 1, ribbonSchemaVersion: 2, views: { ribbon: 'index.html' } };
fs.writeFileSync(path.join(shellFolder, 'extension.json'), JSON.stringify(shellManifest));
settings.extensions[shellManifest.id] = { enabled: true, settings: {} };
settings.keybindings = [
  {
    id: 'modal.key',
    command: 'appdock.restart',
    key: 'Ctrl+F8',
    enabled: true,
    when: { scope: 'app', appletIds: [] },
  },
];
settings.gestures.bindings = [
  {
    id: 'modal.gesture',
    command: 'appdock.restart',
    gesture: 'move-left',
    enabled: true,
    when: { scope: 'app', appletIds: [], processes: [] },
  },
];
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const result = { profile, success: false, checks: [], samples: [] };
let app, browser, context, host, child, mainPort;
const until = async (fn, label) => {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
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
const ribbonState = () =>
  main(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock://host/'),
    );
    const v = w.contentView.children.find((v) => v.webContents?.getURL().endsWith('/index.html'));
    return { id: v.webContents.id, visible: v.getVisible(), bounds: v.getBounds() };
  });
const capture = async (name, all = false) => {
  const captured = await main(async ({ BrowserWindow, desktopCapturer }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock://host/'),
    );
    const size = w.getSize();
    const source = (
      await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: size[0], height: size[1] },
      })
    ).find((s) => s.id === w.getMediaSourceId());
    const image = source.thumbnail;
    const x = Math.round((3 * image.getSize().width) / size[0]);
    const pixels = [180, 10, size[1] - 10].map((y, index) =>
      [
        ...image
          .crop({
            x: index === 0 ? x : Math.round(((size[0] - 20) * image.getSize().width) / size[0]),
            y: Math.round((y * image.getSize().height) / size[1]),
            width: 1,
            height: 1,
          })
          .toBitmap(),
      ].slice(0, 3),
    );
    return {
      image: image.toPNG().toString('base64'),
      pixel: pixels[0],
      pixels,
    };
  });
  fs.writeFileSync(path.join(profile, name + '.png'), Buffer.from(captured.image, 'base64'));
  return all ? captured.pixels : captured.pixel;
};
(async () => {
  try {
    if (process.argv[2]) {
      const executable = path.join(profile, 'AppDock.at365.exe');
      fs.copyFileSync(path.resolve(process.argv[2]), executable);
      result.executableSha256 = hash(executable);
      assert.equal(result.executableSha256, hash(path.resolve(process.argv[2])));
      const port = await freePort();
      mainPort = await freePort();
      child = spawn(
        executable,
        [`--test-profile=${profile}`, `--remote-debugging-port=${port}`, `--inspect=${mainPort}`],
        { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
      );
      browser = await until(
        () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
        'portable CDP',
      );
      context = browser.contexts()[0];
    } else {
      app = await _electron.launch({
        executablePath: require('electron'),
        args: [root, `--test-profile=${profile}`],
        env,
      });
      context = app.context();
    }
    host = await until(
      () => context.pages().find((p) => p.url().startsWith('appdock://host/')),
      'host',
    );
    host.setDefaultTimeout(10000);
    await waitForHost(host, async () => (await window.dock.snapshot()).startupReady);
    await host.evaluate(() => window.dock.navigate('settings'));
    await host.locator('.settings-categories').waitFor();
    const select = (name) =>
      host.locator('.settings-categories').getByRole('button', { name, exact: true }).click();
    const dialog = () => host.locator('dialog.settings-modal');
    for (const theme of ['light', 'dark']) {
      await host.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
      }, theme);
      for (const [category, id] of [
        ['ショートカット', 'modal.key'],
        ['マウスジェスチャー', 'modal.gesture'],
        ['カスタムコマンド', null],
      ]) {
        await select(category);
        const before = await until(async () => {
          const state = await ribbonState();
          return state.visible && state;
        }, 'ribbon ready before modal');
        const normal = await capture(`${theme}-${id || 'custom'}-normal`);
        const opener = id
          ? host.locator(`[data-binding-id="${id}"] .applet-shortcut-edit`)
          : host.getByRole('button', { name: 'Modal customを編集', exact: true });
        await opener.click();
        await dialog().waitFor();
        await host.locator('[data-host-modal-backdrop]').waitFor();
        await until(async () => !(await ribbonState()).visible, 'native ribbon covered');
        await host.waitForTimeout(150);
        const dimmed = await capture(`${theme}-${id || 'custom'}-modal`);
        // Native dialog backdrop is #080b1266 (BGRA channels are reversed here).
        const expected = normal.map((value, i) => Math.round(value * 0.6 + [18, 11, 8][i] * 0.4));
        assert(
          dimmed.every((v, i) => Math.abs(v - expected[i]) <= 5),
          JSON.stringify({ normal, dimmed, expected }),
        );
        assert.equal((await ribbonState()).id, before.id);
        await host.keyboard.press('Tab');
        assert(await dialog().evaluate((el) => el.contains(document.activeElement)));
        if (theme === 'light' && id === 'modal.key') {
          await main(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()
              .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
              .setSize(700, 650),
          );
          await until(async () => {
            const bounds = (await ribbonState()).bounds;
            return host
              .locator('[data-host-modal-surface]')
              .first()
              .evaluate(
                (el, height) => Math.abs(el.getBoundingClientRect().height - height) < 2,
                bounds.height,
              );
          }, 'resized modal background');
          assert(!(await ribbonState()).visible);
          await capture('narrow-shortcut-modal');
          await main(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()
              .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
              .setSize(1280, 840),
          );
          result.checks.push(
            'resize retains the same ribbon renderer and refreshes the covered image',
          );
        }
        await dialog().getByRole('button', { name: 'キャンセル', exact: true }).click();
        await until(async () => (await ribbonState()).visible, 'ribbon restored');
        assert.equal(await host.locator('[data-host-modal-backdrop]').count(), 0);
        assert.equal((await ribbonState()).id, before.id);
        assert(await opener.evaluate((el) => document.activeElement === el));
        result.samples.push({ theme, category, normal, dimmed, expected });
      }
    }
    result.checks.push(
      'all three dialogs dim the composited native ribbon in both themes; Tab, cancel, focus return and renderer identity preserved',
    );
    await host.evaluate(() => {
      void window.dock.openCommandPalette({ requestId: crypto.randomUUID(), mode: 'execute' });
    });
    const palette = await until(
      () => context.pages().find((p) => p.url().endsWith('/overlay.html')),
      'palette',
    );
    await palette.locator('.command-palette').waitFor();
    assert((await ribbonState()).visible);
    await capture('command-palette');
    await closingAction(palette.keyboard.press('Escape'));
    await until(
      () => !context.pages().some((p) => p.url().endsWith('/overlay.html')),
      'palette dismissed',
    );
    await main(({ app }) => {
      const require = process
        .getBuiltinModule('module')
        .createRequire(app.getAppPath() + '/package.json');
      const { HostModalLayer } = require('./out/main/main/core/host-modal-layer.js');
      const original = HostModalLayer.prototype.register;
      globalThis.__modalFixture = { HostModalLayer, original, surfaces: [] };
      HostModalLayer.prototype.register = function (view) {
        globalThis.__modalFixture.layer = this;
        return original.call(this, view);
      };
    });
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.host.shellProviders.ribbon = 'fixture.modal-shell';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await waitForHost(
      host,
      async () => (await window.dock.snapshot()).shell.active === 'fixture.modal-shell',
    );
    await select('ショートカット');
    await main(async ({ BrowserWindow, WebContentsView }) => {
      const fixture = globalThis.__modalFixture;
      fixture.HostModalLayer.prototype.register = fixture.original;
      if (!fixture.layer) throw Error('New Shell did not register with the shared modal layer');
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      const [width, height] = w.getContentSize();
      for (const [name, color, bounds] of [
        ['titlebar', '#5080c0', { x: 0, y: 0, width, height: 43 }],
        ['statusbar', '#906080', { x: 0, y: height - 28, width, height: 28 }],
      ]) {
        const view = new WebContentsView({
          webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
        });
        const registration = fixture.layer.register(view);
        w.contentView.addChildView(view);
        view.setBounds(bounds);
        await view.webContents.loadURL(
          'data:text/html,' +
            encodeURIComponent(`<body style="margin:0;background:${color}">${name}</body>`),
        );
        registration.setVisible(true);
        fixture.surfaces.push({ name, view, registration });
      }
    });
    const multiNormal = await capture('multi-shell-normal', true);
    const externalRibbon = await ribbonState();
    await host.locator('[data-binding-id="modal.key"] .applet-shortcut-edit').click();
    await until(async () => !(await ribbonState()).visible, 'custom Shell covered');
    assert.equal((await ribbonState()).id, externalRibbon.id);
    await until(
      () => main(() => globalThis.__modalFixture.surfaces.every((s) => !s.view.getVisible())),
      'all registered surfaces covered',
    );
    assert.equal(await host.locator('[data-host-modal-surface]').count(), 3);
    await host.waitForTimeout(150);
    const multiDimmed = await capture('multi-shell-modal', true);
    for (let i = 0; i < multiNormal.length; i++) {
      const expected = multiNormal[i].map((value, c) =>
        Math.round(value * 0.6 + [18, 11, 8][c] * 0.4),
      );
      assert(
        multiDimmed[i].every((value, c) => Math.abs(value - expected[c]) <= 5),
        JSON.stringify({ i, expected, actual: multiDimmed[i] }),
      );
    }
    result.multiSamples = { normal: multiNormal, dimmed: multiDimmed };
    await main(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      globalThis.__modalFixture.minimum = w.getMinimumSize();
      w.setMinimumSize(480, 360);
      w.setSize(640, 500);
      for (const s of globalThis.__modalFixture.surfaces) {
        s.view.setBounds({
          x: 0,
          y: s.name === 'titlebar' ? 0 : 472,
          width: 640,
          height: s.name === 'titlebar' ? 43 : 28,
        });
        s.registration.setVisible(true);
      }
    });
    await host.waitForFunction(() => {
      const images = [...document.querySelectorAll('[data-host-modal-surface]')];
      return images.length === 3 && images.some((image) => image.getBoundingClientRect().y === 472);
    });
    const overlap = await dialog().boundingBox();
    assert(
      overlap.x < 76 && overlap.y < 43 && overlap.y + overlap.height > 472,
      JSON.stringify(overlap),
    );
    await capture('multi-shell-narrow');
    await capture('custom-shell-modal');
    await main(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      w.contentView.children
        .find((v) => v.webContents?.getURL().includes('/fixture.modal-shell/'))
        .webContents.forcefullyCrashRenderer();
    });
    await waitForHost(
      host,
      async () => (await window.dock.snapshot()).shell.active === 'appdock.default-shell',
    );
    await until(async () => {
      const state = await ribbonState();
      return state.id !== externalRibbon.id && !state.visible;
    }, 'fallback Shell remains covered');
    await dialog().getByRole('button', { name: 'キャンセル', exact: true }).click();
    await until(async () => (await ribbonState()).visible, 'fallback restored');
    assert(await main(() => globalThis.__modalFixture.surfaces.every((s) => s.view.getVisible())));
    result.checks.push(
      'ribbon, fixture titlebar and fixture statusbar share the same registry; all three dim, resize, remain behind the dialog and restore together',
    );
    result.checks.push(
      'custom Shell is covered without renderer replacement; failure falls back beneath the same dialog and restores on close',
    );
    await main(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      for (const s of globalThis.__modalFixture.surfaces) {
        s.registration.dispose();
        w.contentView.removeChildView(s.view);
        s.view.webContents.close();
      }
      globalThis.__modalFixture.surfaces = [];
      w.setMinimumSize(...globalThis.__modalFixture.minimum);
      w.setSize(1280, 840);
    });
    await host.locator('[data-binding-id="modal.key"] .applet-shortcut-edit').click();
    await until(async () => !(await ribbonState()).visible, 'covered before reload');
    await host.reload();
    await waitForHost(host, async () => (await window.dock.snapshot()).startupReady);
    await until(async () => (await ribbonState()).visible, 'reload restores ribbon');
    result.checks.push(
      'command palette keeps its native overlay; reloading with an open dialog restores the ribbon',
    );
    result.success = true;
  } catch (e) {
    result.error = String(e.stack || e);
    process.exitCode = 1;
  } finally {
    if (host)
      await host
        .evaluate(() => {
          void window.dock.executeCommand('appdock.quit');
        })
        .catch(() => {});
    if (child) await until(() => child.exitCode !== null, 'portable exit').catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (app) await app.close().catch(() => {});
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ profile, ...result, samples: result.samples.length }, null, 2));
  }
})();
