const { _electron, chromium } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { waitForHost } = require('./settings-host-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'dialog-blur-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
initial.host.closeToTray = false;
initial.host.startMinimized = false;
initial.host.hardwareAcceleration = false;
initial.host.soundEnabled = false;
initial.updates.checkHostOnStartup = false;
initial.updates.checkAppletsOnStartup = false;
initial.globalShortcutCommands = [];
initial.keybindings = [];
initial.gestures.enabled = false;
const fixture = path.join(profile, 'extensions', 'fixture.blur');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.blur',
    name: 'Blur fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
    capabilities: ['pages'],
    commands: [{ id: 'fixture.blur.open', title: 'Open blur fixture', activateOnExecute: true }],
    pages: [
      {
        id: 'main',
        title: 'Blur fixture',
        source: 'local',
        ui: 'page.html',
        openCommand: 'fixture.blur.open',
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.js'),
  "exports.activate = async c => c.commands.register('fixture.blur.open', 'Open blur fixture', () => c.pages.open('main')); ",
);
fs.writeFileSync(
  path.join(fixture, 'page.html'),
  '<!doctype html><html><body><h1>Blur fixture</h1><input aria-label="Retained input"></body></html>',
);
initial.extensions['fixture.blur'] = { enabled: true, settings: {} };
initial.customCommands = {
  version: 2,
  items: [
    {
      id: randomUUID(),
      typeId: 'appdock.input.sendKeys',
      owner: { kind: 'host' },
      title: 'Dialog fixture',
      description: '',
      configVersion: 1,
      config: { keys: 'Enter' },
      enabled: true,
      automation: false,
    },
  ],
};
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
const result = { success: false, profile, checks: [], timings: [] };
let app, host, context, browser, child, mainPort;
const until = async (fn, label) => {
  const end = Date.now() + 30000;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (e) {
      last = e;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error(label + (last ? ': ' + last.message : ''));
};
const main = (fn, arg) =>
  app
    ? app.evaluate(fn, arg)
    : inspect(
        mainPort,
        `(${fn.toString()})(${electronExpression},${JSON.stringify(arg) ?? 'undefined'})`,
      );
const native = () =>
  main(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock://host/'),
    );
    return w.contentView.children
      .filter(
        (v) =>
          v.webContents &&
          /\/(index|bars)\.html$/.test(v.webContents.getURL()) &&
          !v.webContents.getURL().endsWith('/command-palette/index.html') &&
          !v.webContents.getURL().startsWith('appdock://host/'),
      )
      .map((v) => ({ id: v.webContents.id, visible: v.getVisible(), bounds: v.getBounds() }));
  });
async function openEditor() {
  await host.getByRole('button', { name: 'Dialog fixtureを編集', exact: true }).click();
  await host.locator('dialog.settings-modal').waitFor();
  await host.locator('[data-testid="settings-dialog-confirm"]').waitFor({ state: 'visible' });
}
async function palette() {
  await host.evaluate(() => {
    void window.dock.openCommandPalette({ requestId: crypto.randomUUID(), mode: 'execute' });
  });
  return until(async () => {
    const p = context.pages().find((p) => p.url().endsWith('/command-palette/index.html'));
    return p && (await p.locator('.command-palette').isVisible()) && p;
  }, 'palette ready');
}
async function closePalette(p, background = false) {
  await p.waitForFunction(() => document.activeElement === document.querySelector('input'));
  if (background) await p.mouse.click(5, 5);
  else await p.keyboard.press('Escape').catch(() => {});
  await until(() => require('./shell-overlay-helper.cjs').overlayClosed(p), 'palette closed');
  await host.waitForFunction(() => !document.querySelector('.shell[data-palette-open="true"]'));
}
(async () => {
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    if (process.argv[2]) {
      const executable = path.join(profile, 'AppDock.at365.exe');
      require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), executable);
      const port = await freePort();
      mainPort = await freePort();
      child = spawn(
        executable,
        [`--test-profile=${profile}`, `--remote-debugging-port=${port}`, `--inspect=${mainPort}`],
        { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
      );
      browser = await until(
        () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
        'CDP',
      );
      context = browser.contexts()[0];
    } else {
      app = await _electron.launch({ args: [root, `--test-profile=${profile}`], cwd: root, env });
      context = app.context();
    }
    host = await until(
      () => context.pages().find((p) => p.url().startsWith('appdock://host/')),
      'host',
    );
    host.setDefaultTimeout(12000);
    await waitForHost(host, async () => (await window.dock.snapshot()).startupReady);
    await main(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
    });
    await host.evaluate(() => window.dock.navigate('settings'));
    await host
      .locator('.settings-categories')
      .getByRole('button', { name: 'カスタムコマンド', exact: true })
      .click();
    await host.getByRole('button', { name: 'Dialog fixtureを編集', exact: true }).waitFor();
    const before = await until(async () => {
      const v = await native();
      return v.length === 3 && v.every((v) => v.visible) && v;
    }, 'Shell ready');
    await main(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      globalThis.__dialogAudit = { captures: 0, hides: 0 };
      for (const v of w.contentView.children.filter(
        (v) => v.webContents && !v.webContents.getURL().startsWith('appdock://host/'),
      )) {
        const capture = v.webContents.capturePage.bind(v.webContents),
          visible = v.setVisible.bind(v);
        v.webContents.capturePage = (...args) => {
          globalThis.__dialogAudit.captures++;
          return capture(...args);
        };
        v.setVisible = (value) => {
          if (!value) globalThis.__dialogAudit.hides++;
          return visible(value);
        };
      }
    });
    const cdp = await context.newCDPSession(host);
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.host.overlayBackground,
      'transparent',
    );
    await openEditor();
    assert.equal(
      await host
        .locator('dialog:modal')
        .evaluate((el) => getComputedStyle(el, '::backdrop').backdropFilter),
      'none',
    );
    await host.keyboard.press('Escape');
    await host.locator('dialog.settings-modal').waitFor({ state: 'detached' });
    const defaultPalette = await palette();
    assert.equal(await host.locator('main').evaluate((el) => getComputedStyle(el).filter), 'none');
    await closePalette(defaultPalette);
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, host: { ...s.settings.value.host, overlayBackground: 'blur' } },
        s.settings.revision,
      );
    });
    await host.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--appdock-overlay-filter')
          .trim() === 'blur(2px)',
    );
    result.checks.push(
      'fresh settings default to transparent for dialogs and palette before explicitly enabling blur',
    );
    // The first portal installs React's shared event delegation on document.body.
    for (let i = 0; i < 3; i++) {
      await openEditor();
      await host.keyboard.press('Escape');
      await host.locator('dialog.settings-modal').waitFor({ state: 'detached' });
    }
    await cdp.send('HeapProfiler.collectGarbage');
    const counters = await cdp.send('Memory.getDOMCounters');
    for (let i = 0; i < 40; i++) {
      const start = performance.now();
      await openEditor();
      const d = host.locator('dialog.settings-modal');
      const name = d.getByRole('textbox', { name: '名前', exact: true });
      await name.fill(`Unsaved dialog ${i}`);
      if (i === 0) {
        const geometry = await d.evaluate((el) => {
          const r = el.getBoundingClientRect(),
            p = document.querySelector('.shell > main').getBoundingClientRect();
          const style = getComputedStyle(el, '::backdrop');
          return {
            dialog: r.toJSON(),
            page: p.toJSON(),
            blur: style.backdropFilter,
            color: style.backgroundColor,
            insets: [style.top, style.right, style.bottom, style.left],
          };
        });
        result.geometry = geometry;
        assert.equal(geometry.blur, 'blur(2px)');
        assert.equal(geometry.color, 'rgba(0, 0, 0, 0)');
        assert(
          geometry.dialog.x >= geometry.page.x && geometry.dialog.right <= geometry.page.right + 1,
        );
        assert(
          geometry.dialog.y >= geometry.page.y &&
            geometry.dialog.bottom <= geometry.page.bottom + 1,
        );
        assert(Math.abs(parseFloat(geometry.insets[3]) - geometry.page.x) < 1);
        assert(Math.abs(parseFloat(geometry.insets[0]) - geometry.page.y) < 1);
        await host.keyboard.press('Tab');
        assert(await d.evaluate((el) => el.contains(document.activeElement)));
      }
      await host.mouse.click(result.geometry.page.x + 3, result.geometry.page.y + 3);
      assert(await d.isVisible(), 'background click must keep the edit dialog open');
      assert.equal(await name.inputValue(), `Unsaved dialog ${i}`);
      if (i % 2) await host.keyboard.press('Escape');
      else await d.getByTestId('settings-dialog-cancel').click();
      await d.waitFor({ state: 'detached' });
      result.timings.push(performance.now() - start);
    }
    await cdp.send('HeapProfiler.collectGarbage');
    result.dom = { before: counters, after: await cdp.send('Memory.getDOMCounters') };
    assert(result.dom.after.nodes <= counters.nodes + 30, JSON.stringify(result.dom));
    assert.deepEqual(await native(), before);
    assert.equal(
      await host
        .locator('[data-host-modal-backdrop], [data-host-modal-surface], [data-host-modal-pending]')
        .count(),
      0,
    );
    assert.deepEqual(await main(() => globalThis.__dialogAudit), { captures: 0, hides: 0 });
    result.checks.push(
      '40 edit/cancel cycles: background clicks preserve unsaved input, Cancel and Escape close, body-only 2px blur, focus containment, no captures or Shell hiding, no retained DOM growth',
    );
    await openEditor();
    await main(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      w.setMinimumSize(480, 360);
      w.setSize(640, 500);
    });
    await host.waitForFunction(() => {
      const d = document.querySelector('dialog.settings-modal').getBoundingClientRect();
      const p = document.querySelector('.shell > main').getBoundingClientRect();
      return d.x >= p.x && d.right <= p.right + 1 && d.y >= p.y && d.bottom <= p.bottom + 1;
    });
    await host.screenshot({ path: path.join(profile, 'narrow-dialog.png') });
    await host.keyboard.press('Escape');
    await host.locator('dialog.settings-modal').waitFor({ state: 'detached' });
    await main(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
        .setSize(1280, 840),
    );
    result.checks.push('narrow window keeps the card and backdrop inside the body');
    const title = await until(async () => {
      for (const p of context.pages().filter((p) => p.url().endsWith('/bars.html')))
        if (
          (await p.evaluate(async () => (await window.appdockBar.connect()).snapshot.region)) ===
          'titlebar'
        )
          return p;
    }, 'titlebar');
    await openEditor();
    await title.evaluate(async () => {
      const c = await window.appdockBar.connect();
      await window.appdockBar.invoke({
        sessionId: c.sessionId,
        requestId: crypto.randomUUID(),
        actionId: c.snapshot.actions.maximize,
      });
    });
    await title.evaluate(async () => {
      const c = await window.appdockBar.connect();
      await window.appdockBar.invoke({
        sessionId: c.sessionId,
        requestId: crypto.randomUUID(),
        actionId: c.snapshot.actions.maximize,
      });
    });
    await host.keyboard.press('Escape');
    await host.locator('dialog.settings-modal').waitFor({ state: 'detached' });
    let p = await palette();
    const reusedPalette = p;
    const initialSession = await p.evaluate(() => window.appdockPalette.connect());
    assert.equal(
      await host.locator('main').evaluate((el) => getComputedStyle(el).filter),
      'blur(2px)',
    );
    assert.equal(
      await p.locator('.modal-backdrop').evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgba(0, 0, 0, 0)',
    );
    await until(async () => {
      const area = await host.locator('main').boundingBox();
      const paletteBounds = await main(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
          .contentView.children.find((v) =>
            v.webContents?.getURL().endsWith('/command-palette/index.html'),
          )
          .getBounds(),
      );
      result.paletteGeometry = { area, paletteBounds };
      return (
        Math.abs(area.x - paletteBounds.x) < 2 && Math.abs(area.width - paletteBounds.width) < 2
      );
    }, 'palette follows the completed native maximize/restore layout');
    await closePalette(p, true);
    for (let i = 0; i < 15; i++) {
      p = await palette();
      assert.equal(p, reusedPalette, 'palette reuses its renderer after closing');
      assert.equal(
        await p.getByRole('combobox').inputValue(),
        '',
        'search resets for each session',
      );
      const session = await p.evaluate(() => window.appdockPalette.connect());
      assert.notEqual(session.sessionId, initialSession.sessionId);
      await p.getByRole('combobox').fill('temporary search');
      await closePalette(p);
    }
    assert(!p.isClosed(), 'reusable renderer remains alive while hidden');
    result.checks.push(
      'palette retains one renderer while clearing search and rotating its connection',
    );
    assert.deepEqual(
      (await native()).map((v) => [v.id, v.visible]),
      before.map((v) => [v.id, v.visible]),
    );
    result.checks.push(
      'titlebar remains usable during a dialog; palette is body-sized, blurs the host body without captures, dismisses on background click and cleans up across 16 cycles',
    );
    await openEditor();
    const ribbon = context
      .pages()
      .find((p) => p.url().endsWith('/index.html') && !p.url().startsWith('appdock://host/'));
    await ribbon.getByRole('button', { name: 'ログ', exact: true }).click();
    await host.locator('dialog.settings-modal').waitFor({ state: 'detached' });
    await waitForHost(host, async () => (await window.dock.snapshot()).navigation.route === 'logs');
    result.checks.push('ribbon navigation is allowed and dismisses the previous page dialog');
    for (const theme of ['dark', 'light']) {
      await host.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
        await window.dock.navigate('settings');
      }, theme);
      await host
        .locator('.settings-categories')
        .getByRole('button', { name: 'カスタムコマンド', exact: true })
        .click();
      await openEditor();
      assert.equal(
        await host
          .locator('dialog.settings-modal')
          .evaluate((el) => getComputedStyle(el, '::backdrop').backdropFilter),
        'blur(2px)',
      );
      await host.screenshot({ path: path.join(profile, theme + '-dialog.png') });
      await host.keyboard.press('Escape');
      await host.locator('dialog.settings-modal').waitFor({ state: 'detached' });
    }
    await host.evaluate(() => window.dock.executeCommand('fixture.blur.open'));
    const body = await until(
      () => context.pages().find((p) => p.url().endsWith('/fixture.blur/page.html')),
      'native body',
    );
    await body.getByLabel('Retained input').fill('retained');
    await until(
      () =>
        main(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows().find((w) =>
            w.webContents.getURL().startsWith('appdock://host/'),
          );
          return w.contentView.children.some((v) =>
            v.children.some((c) => c.webContents?.getURL().endsWith('/fixture.blur/page.html')),
          );
        }),
      'native body attached before adding a nested view',
    );
    await main(async ({ BrowserWindow, WebContentsView }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      const parent = w.contentView.children.find((v) =>
        v.children.some((c) => c.webContents?.getURL().endsWith('/fixture.blur/page.html')),
      );
      const view = new WebContentsView({
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
        },
      });
      await view.webContents.loadURL(
        'data:text/html,<html><body><input aria-label="Nested input"></body></html>',
      );
      parent.addChildView(view);
      view.setBounds({ x: 120, y: 120, width: 400, height: 200 });
      globalThis.__nestedBlurView = { parent, view };
    });
    const nested = await until(
      () => context.pages().find((p) => p.url().startsWith('data:text/html,')),
      'nested body',
    );
    await nested.getByLabel('Nested input').fill('nested retained');
    await main(({ webContents }) => {
      globalThis.__blurAudit = [];
      const wc = webContents
        .getAllWebContents()
        .find((w) => w.getURL().endsWith('/fixture.blur/page.html'));
      for (const name of ['insertCSS', 'removeInsertedCSS']) {
        const original = wc[name].bind(wc);
        wc[name] = async (...args) => {
          try {
            const value = await original(...args);
            globalThis.__blurAudit.push({ name, args, value });
            return value;
          } catch (e) {
            globalThis.__blurAudit.push({ name, error: String(e) });
            throw e;
          }
        };
      }
    });
    for (let i = 0; i < 10; i++) {
      p = await palette();
      await body.waitForFunction(
        () => getComputedStyle(document.documentElement).filter === 'blur(2px)',
      );
      await nested.waitForFunction(
        () => getComputedStyle(document.documentElement).filter === 'blur(2px)',
      );
      await closePalette(p, i === 0);
      try {
        await body.waitForFunction(
          () => getComputedStyle(document.documentElement).filter === 'none',
          null,
          { timeout: 3000 },
        );
      } catch (e) {
        result.blurAudit = await main(() => globalThis.__blurAudit);
        result.remainingFilter = await body.evaluate(
          () => getComputedStyle(document.documentElement).filter,
        );
        throw e;
      }
      await nested.waitForFunction(
        () => getComputedStyle(document.documentElement).filter === 'none',
      );
    }
    const background = async (value) => {
      await host.evaluate(async (overlayBackground) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, overlayBackground } },
          s.settings.revision,
        );
      }, value);
    };
    p = await palette();
    await background('transparent');
    await body.waitForFunction(() => getComputedStyle(document.documentElement).filter === 'none');
    await nested.waitForFunction(
      () => getComputedStyle(document.documentElement).filter === 'none',
    );
    await host.waitForFunction(
      () => getComputedStyle(document.querySelector('main')).filter === 'none',
    );
    await background('blur');
    await body.waitForFunction(
      () => getComputedStyle(document.documentElement).filter === 'blur(2px)',
    );
    await nested.waitForFunction(
      () => getComputedStyle(document.documentElement).filter === 'blur(2px)',
    );
    await closePalette(p);
    result.checks.push(
      'background choice applies live to host, Applet and nested body without replacing input',
    );
    assert.equal(await body.getByLabel('Retained input').inputValue(), 'retained');
    assert.equal(await nested.getByLabel('Nested input').inputValue(), 'nested retained');
    await main(() => {
      const { parent, view } = globalThis.__nestedBlurView;
      parent.removeChildView(view);
      view.webContents.close();
      delete globalThis.__nestedBlurView;
    });
    assert(context.pages().includes(body));
    result.checks.push(
      'both themes blur without dimming; native Applet body is blurred with temporary CSS, retaining input and renderer across 10 palette cycles',
    );
    await host.evaluate(() => window.dock.navigate('settings'));
    await host.getByTestId('settings-nav:appearance').click();
    const backgroundChoice = host.getByRole('combobox', {
      name: 'ダイアログ・パレットの背景',
      exact: true,
    });
    await backgroundChoice.selectOption('transparent');
    assert.deepEqual(await backgroundChoice.locator('option').allTextContents(), [
      '透明',
      'ブラー',
    ]);
    await until(
      async () =>
        (await host.evaluate(() => window.dock.snapshot())).settings.value.host
          .overlayBackground === 'transparent',
      'background preference saved',
    );
    await host.getByTestId('settings-nav:custom-commands').click();
    await openEditor();
    await host.waitForFunction(
      () =>
        getComputedStyle(document.querySelector('dialog:modal'), '::backdrop').backdropFilter ===
        'none',
    );
    await host.keyboard.press('Escape');
    await host.locator('dialog.settings-modal').waitFor({ state: 'detached' });
    await host.getByTestId('settings-nav:appearance').click();
    await backgroundChoice.selectOption('blur');
    result.checks.push('appearance UI saves transparent background and common dialogs honor it');
    result.audit = await main(() => globalThis.__dialogAudit);
    assert.equal(result.audit.captures, 0);
    result.success = true;
  } catch (error) {
    result.error = String(error.stack || error);
    result.native = await native().catch(() => []);
    process.exitCode = 1;
    if (host) await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
  } finally {
    if (host)
      await host
        .evaluate(() => {
          void window.dock.executeCommand('appdock.quit');
        })
        .catch(() => {});
    if (app) await app.close().catch(() => {});
    if (child) await until(() => child.exitCode !== null, 'exit').catch(() => {});
    if (browser) await browser.close().catch(() => {});
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})();
