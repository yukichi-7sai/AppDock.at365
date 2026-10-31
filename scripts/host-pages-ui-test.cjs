const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { _electron: electron, chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const root = path.resolve(__dirname, '..');
const logsFallback = process.argv.includes('--logs-fallback');
const logsOnly = process.argv.includes('--logs-only') || logsFallback;
const executable = process.argv
  .slice(2)
  .find((arg) => !['--logs-only', '--logs-fallback'].includes(arg));
const portable = executable ? path.resolve(executable) : null;
const profile = path.join(
  root,
  '.artifacts',
  `${logsFallback ? 'log-page-fallback' : logsOnly ? 'log-page' : 'host-pages'}-ui-${Date.now()}`,
);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const logStorage = logsOnly
  ? {
      shared: path.join(profile, 'data/logs', require('node:os').hostname()),
      fallback: path.join(profile, 'local/logs'),
      other: path.join(profile, 'data/logs', require('node:os').hostname() + '-OTHER'),
      fallbackMode: logsFallback,
    }
  : undefined;
if (logStorage) {
  const old =
    JSON.stringify({
      time: '2026-01-01T00:00:00Z',
      level: 'info',
      source: 'old.fixture',
      message: 'existing-log-retained',
    }) + '\n';
  for (const directory of [logStorage.fallback, logStorage.other]) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'host.log'), old);
  }
  logStorage.old = old;
  if (logsFallback) fs.mkdirSync(path.join(logStorage.shared, 'host.log'), { recursive: true });
}
fs.mkdirSync(path.join(profile, 'extensions/fixture.host-pages'), { recursive: true });
const fixture = path.join(profile, 'extensions/fixture.host-pages');
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.host-pages',
    name: 'Host page fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'worker.cjs',
    capabilities: ['pages', ...(logsOnly ? ['appdock-api'] : [])],
    pages: [
      {
        id: 'main',
        title: 'Recovery fixture',
        source: 'local',
        ui: 'page.html',
        openCommand: 'fixture.host-pages.open',
      },
    ],
    commands: [
      { id: 'fixture.host-pages.mark', title: 'Record host page mark' },
      { id: 'fixture.host-pages.open', title: 'Open recovery fixture', activateOnExecute: true },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'worker.cjs'),
  logsOnly
    ? `exports.activate=async c=>{c.commands.register('fixture.host-pages.mark','Record host page mark',async()=>{
      await c.log.debug('log-fixture-debug: startup stage');
      await c.log.info('log-fixture-info: ready');
      await c.appdock.call('system.getInfo');
      try { await c.appdock.call('fixture.invalid', { privateValue: 'must-not-appear-in-audit' }); }
      catch(e) { if(e.code!=='INVALID_ARGUMENT') throw e; }
    });};`
    : "exports.activate=async c=>{c.commands.register('fixture.host-pages.mark','Record host page mark',()=>c.log.info('host-page-mark'));c.commands.register('fixture.host-pages.open','Open recovery fixture',()=>c.pages.open('main'));};",
);
fs.writeFileSync(
  path.join(fixture, 'page.html'),
  '<!doctype html><title>Recovery fixture</title><h1>Recovery fixture</h1>',
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.closeToTray = false;
settings.host.soundEnabled = false;
settings.imageLibrary = {
  groups: [{ id: 'focus-group', name: 'Focus group', images: [{ file: 'preview.png' }] }],
};
settings.keybindings = [];
settings.extensions['fixture.host-pages'] = { enabled: true, settings: {} };
settings.pinnedCommands = ['fixture.host-pages.mark'];
settings.ribbon.order = ['home', 'image-library', 'settings'];
settings.keybindings = [
  {
    id: 'retired-home',
    command: 'fixture.host-pages.mark',
    key: 'Ctrl+F12',
    enabled: true,
    when: { scope: 'applets', appletIds: ['host:home'] },
  },
];
settings.host.shellProviders = Object.fromEntries(
  ['home', 'logs', 'image-library', 'notifications', 'settings'].map((kind) => [
    'page.' + kind,
    'missing.retired-shell',
  ]),
);
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
const images = path.join(profile, 'data/assets/images');
fs.mkdirSync(images, { recursive: true });
const original = path.join(images, 'preview.png');
const pngChunk = (name, bytes) => {
  const data = Buffer.concat([Buffer.from(name), bytes]);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, data, checksum]);
};
const pngHeader = Buffer.alloc(13);
pngHeader.writeUInt32BE(8);
pngHeader.writeUInt32BE(8, 4);
pngHeader[8] = 8;
pngHeader[9] = 6;
const pixels = Buffer.alloc(8 * 33, 180);
for (let row = 0; row < 8; row++) pixels[row * 33] = 0;
fs.writeFileSync(
  original,
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', pngHeader),
    pngChunk('IDAT', require('node:zlib').deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]),
);
const imageHash = hash(original);
const checks = [],
  errors = [];
let app, host, child, browser;
async function until(fn, label) {
  const end = Date.now() + 60000;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw Error(label + (last ? ': ' + last : ''));
}
async function launch(restore = false) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (!portable)
    app = await electron.launch({
      executablePath: require('electron'),
      args: [
        root,
        `--test-profile=${profile}`,
        ...(logsOnly ? [`--test-local-state=${path.join(profile, 'local')}`] : []),
        ...(restore ? ['--restore-view'] : []),
      ],
      env,
    });
  else {
    const exe = path.join(profile, 'AppDock.at365.exe');
    if (!fs.existsSync(exe)) require('./copy-host.cjs').copyHost(portable, exe);
    assert.equal(hash(exe), hash(portable));
    const debug = await freePort(),
      inspector = await freePort();
    child = spawn(
      exe,
      [
        `--test-profile=${profile}`,
        ...(logsOnly ? [`--test-local-state=${path.join(profile, 'local')}`] : []),
        `--remote-debugging-port=${debug}`,
        `--inspect=127.0.0.1:${inspector}`,
        ...(restore ? ['--restore-view'] : []),
      ],
      { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
    );
    browser = await until(
      () => chromium.connectOverCDP(`http://127.0.0.1:${debug}`, { timeout: 1000 }),
      'CDP',
    );
    app = {
      context: () => browser.contexts()[0],
      evaluate: (fn, arg) =>
        inspect(
          inspector,
          `(${fn.toString()})(${electronExpression},${JSON.stringify(arg) ?? 'undefined'})`,
        ),
      close: async () => {
        await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
        await until(() => child.exitCode !== null, 'shutdown');
        await browser.close();
      },
    };
  }
  app.context().on('page', (page) => page.on('pageerror', (e) => errors.push(String(e))));
  host = await until(
    () =>
      app
        .context()
        .pages()
        .find((p) => p.url().startsWith('appdock://host/index.html')),
    'host',
  );
  host.on('pageerror', (e) => errors.push(String(e)));
  host.setDefaultTimeout(15000);
  await until(
    async () => (await host.evaluate(() => window.dock.snapshot())).startupReady,
    'startup',
  );
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock:'),
    );
    w.setSize(1280, 900);
    w.show();
    w.focus();
  });
}
const model = () => host.evaluate(() => window.dock.pages.get());
async function defaultPage() {
  await host.locator('.about-page').waitFor();
  const state = await host.evaluate(() => window.dock.snapshot());
  assert.equal(state.navigation.route, 'settings');
  assert.equal(
    await host.evaluate(async () => (await window.dock.settingsEditing()).pageId),
    'about',
  );
}
async function seedRestore(route, category = 'appearance') {
  await host.evaluate(
    ({ route, category }) => {
      localStorage.setItem('appdock.restart-view.page', JSON.stringify(route));
      localStorage.setItem('appdock.restart-view.category', JSON.stringify(category));
    },
    { route, category },
  );
}
async function open(kind) {
  await host.evaluate((kind) => window.dock.navigate(kind), kind);
  await until(async () => (await model())?.kind === kind, 'host page ' + kind);
  await host.locator(`.host-page-slot[data-page="${kind}"] > section`).waitFor();
}
async function geometry() {
  const result = await host.locator('.host-page-slot').evaluate((slot) => {
    const page = slot.querySelector(':scope > section'),
      s = slot.getBoundingClientRect(),
      p = page.getBoundingClientRect();
    return {
      slot: { x: s.x, y: s.y, width: s.width, height: s.height },
      page: { x: p.x, y: p.y, width: p.width, height: p.height },
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  assert(result.slot.height > 100 && result.page.height > 100, JSON.stringify(result));
  assert(
    result.page.x >= result.slot.x - 1 && result.page.y >= result.slot.y - 1,
    JSON.stringify(result),
  );
  assert(result.page.height <= result.slot.height + 1, JSON.stringify(result));
  assert(
    result.page.width <= result.slot.width + 1 && result.overflow <= 1,
    JSON.stringify(result),
  );
}
(async () => {
  let success = false;
  try {
    await launch();
    if (logsOnly) {
      await require('./log-page-ui-check.cjs')({
        app,
        host,
        profile,
        model,
        open,
        until,
        geometry,
        checks,
        logStorage,
      });
      assert.deepEqual(errors, []);
      success = true;
      return;
    }
    await defaultPage();
    const ribbon = await require('./shell-overlay-helper.cjs').ribbonPage(host);
    assert.equal(await ribbon.locator('[data-ribbon-id="home"]').count(), 0);
    await assert.rejects(() => host.evaluate(() => window.dock.navigate('home')), /Unknown route/);
    await assert.rejects(() =>
      host.evaluate(() => window.dock.pages.open({ id: 'retired', kind: 'home' })),
    );
    await host.evaluate(() => window.dock.executeCommand('appdock.commands.search'));
    const palette = await require('./shell-overlay-helper.cjs').overlayPage(host);
    const pin = palette.locator('[data-command-id="fixture.host-pages.mark"]');
    await pin.locator('.pin-badge').waitFor();
    await require('./shell-overlay-helper.cjs').closingAction(
      pin.locator('.palette-execute').click(),
    );
    await until(
      async () =>
        (await host.evaluate(() => window.dock.snapshot())).logs.some(
          (l) => l.message === 'host-page-mark',
        ),
      'palette command',
    );
    await open('logs');
    await host.getByLabel('ログを検索', { exact: true }).fill('host-page-mark');
    await host.getByLabel('ログのApplet', { exact: true }).selectOption('fixture.host-pages');
    await until(
      async () => (await model()).content.filters.source === 'fixture.host-pages',
      'source',
    );
    await host.getByLabel('Appletの絞り込みを解除', { exact: true }).click();
    await until(async () => (await model()).content.filters.source === '', 'clear source');
    assert.equal((await model()).content.filters.text, 'host-page-mark');
    checks.push(
      'startup selects version information, home is absent and rejected; palette pins execute and logs retain their filters',
    );
    await open('image-library');
    const previewButton = host.getByRole('button', { name: 'preview.pngを拡大', exact: true });
    await previewButton.click();
    const dialog = host.getByRole('dialog', { name: 'preview.png', exact: true });
    await dialog.waitFor();
    assert.equal(await host.evaluate(() => document.querySelector('.library-page').inert), true);
    const pageId = (await model()).id;
    await assert.rejects(
      () =>
        host.evaluate(
          (id) => window.dock.pages.act({ id, type: 'gallery', command: 'select-all' }),
          pageId,
        ),
      /dialog/,
    );
    await dialog.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await until(
      () => previewButton.evaluate((button) => document.activeElement === button),
      'preview focus restored',
    );
    checks.push(
      'preview is a shared host modal; background actions are blocked and Escape restores the original button',
    );
    for (const mode of ['keyboard', 'close-button', 'backdrop']) {
      if (mode === 'keyboard') await previewButton.press('Enter');
      else await previewButton.click();
      await dialog.waitFor();
      if (mode === 'keyboard') await dialog.press('Escape');
      else if (mode === 'close-button')
        await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
      else {
        const bounds = await host.locator('.shell > main').boundingBox();
        await host.mouse.click(bounds.x + 3, bounds.y + 3);
      }
      await dialog.waitFor({ state: 'detached' });
      await until(
        () => previewButton.evaluate((button) => document.activeElement === button),
        'preview focus after ' + mode,
      );
    }
    checks.push(
      'preview returns focus after keyboard activation, close button and backdrop dismissal',
    );
    const addGroup = host.getByRole('button', { name: 'グループを追加', exact: true });
    await addGroup.click();
    const addDialog = host.getByRole('dialog', { name: '画像グループを追加', exact: true });
    await addDialog.getByLabel('画像グループ名').fill('Cancelled group');
    await addDialog.press('Escape');
    await addDialog.waitFor({ state: 'detached' });
    await until(
      () => addGroup.evaluate((button) => document.activeElement === button),
      'group editor focus',
    );
    assert(
      !(await host.evaluate(() => window.dock.imageLibrary.snapshot())).groups.some(
        (group) => group.name === 'Cancelled group',
      ),
    );
    checks.push('image group editor cancels without saving and returns to its opener');
    const menuButton = host.getByRole('button', { name: 'Focus groupの操作', exact: true });
    for (const [item, title] of [
      ['名前を変更', '画像グループの名前を変更'],
      ['画像を並べ替え', '画像を並べ替え'],
    ]) {
      await menuButton.click();
      await host.getByRole('menuitem', { name: item, exact: true }).click();
      const groupDialog = host.getByRole('dialog', { name: title, exact: true });
      await groupDialog.waitFor();
      await groupDialog.press('Escape');
      await groupDialog.waitFor({ state: 'detached' });
      await until(
        () => menuButton.evaluate((button) => document.activeElement === button),
        'group menu opener focus',
      );
    }
    checks.push('group rename and image ordering return to the surviving menu trigger');
    for (const theme of ['light', 'dark']) {
      await host.evaluate(async (theme) => {
        const state = await window.dock.snapshot();
        state.settings.value.host.theme = theme;
        await window.dock.saveSettings(state.settings.value, state.settings.revision);
      }, theme);
      await until(
        () => host.evaluate((theme) => document.documentElement.dataset.theme === theme, theme),
        'theme',
      );
      await host.evaluate(() => window.dock.navigate(null));
      await defaultPage();
      await host.screenshot({ path: path.join(profile, `startup-${theme}.png`) });
      for (const kind of ['logs', 'image-library', 'notifications']) {
        await open(kind);
        await geometry();
        await host.screenshot({ path: path.join(profile, `${kind}-${theme}.png`) });
        const state = await host.evaluate(() => window.dock.snapshot());
        assert(!state.shellRegions.regions.some((r) => r.region.startsWith('page.')));
        assert(
          !app
            .context()
            .pages()
            .some((p) => /\/(home|logs|image-library|notification-center)\.html$/.test(p.url())),
        );
        assert.equal(await host.evaluate(() => typeof window.appdockPage), 'undefined');
      }
    }
    checks.push(
      'version information and all three host pages render in both themes; retired page Shell regions and documents never start',
    );
    for (const zoom of [1, 1.5, 2]) {
      await app.evaluate(({ BrowserWindow }, zoom) => {
        const w = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().startsWith('appdock:'),
        );
        w.setMinimumSize(320, 360);
        w.setSize(680, 620);
        w.webContents.setZoomFactor(zoom);
      }, zoom);
      for (const kind of ['logs', 'image-library', 'notifications']) {
        await open(kind);
        await geometry();
      }
    }
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock:'),
      );
      w.webContents.setZoomFactor(1);
      w.setSize(1280, 900);
    });
    checks.push('host pages fit narrow windows at 100/150/200 percent CSS zoom');
    await open('logs');
    const before = (await model()).id;
    await host.locator('.logs-page').evaluate((page) => (window.__hostPageElement = page));
    await host.evaluate(() => {
      void window.dock.executeCommand('appdock.commands.search');
    });
    const overlay = await require('./shell-overlay-helper.cjs').overlayPage(host);
    await require('./shell-overlay-helper.cjs').closingAction(overlay.keyboard.press('Escape'));
    await until(
      async () => !(await host.evaluate(() => window.dock.snapshot())).overlay.active,
      'overlay closed',
    );
    assert.equal((await model()).id, before);
    assert(await host.locator('.logs-page').evaluate((page) => window.__hostPageElement === page));
    checks.push(
      'the retained command-palette Shell opens over the host page without recreating its DOM or connection',
    );
    await open('notifications');
    await app.close();
    app = null;
    await launch(true);
    await until(async () => (await model())?.kind === 'notifications', 'restore view');
    checks.push('restart restores a selected host page');
    await host.evaluate(() => window.dock.navigate(null));
    await defaultPage();
    await host.evaluate(async () => {
      const current = await window.dock.settingsEditing();
      await window.dock.editSettings({
        sessionId: current.sessionId,
        editRevision: current.editRevision,
        operationId: crypto.randomUUID(),
        action: { type: 'select-page', pageId: 'appearance' },
      });
    });
    await host.getByLabel('テーマ', { exact: true }).waitFor();
    await app.close();
    app = null;
    await launch(true);
    await host.getByLabel('テーマ', { exact: true }).waitFor();
    checks.push('restart restores the settings category');
    await app.close();
    app = null;
    await launch();
    await defaultPage();
    checks.push('ordinary startup ignores the previous settings category');
    for (const route of ['home', 'invalid:route', 'page:missing:main']) {
      await seedRestore(route);
      await app.close();
      app = null;
      await launch(true);
      await defaultPage();
      checks.push(`restoration of ${route} returns to version information`);
    }
    await host.evaluate(async () => {
      const current = await window.dock.settingsEditing();
      await window.dock.editSettings({
        sessionId: current.sessionId,
        editRevision: current.editRevision,
        operationId: crypto.randomUUID(),
        action: { type: 'select-page', pageId: 'appearance' },
      });
    });
    await host.getByLabel('テーマ', { exact: true }).waitFor();
    await host.evaluate(() => window.dock.executeCommand('fixture.host-pages.open'));
    await until(
      async () =>
        (await host.evaluate(() => window.dock.snapshot())).navigation.route ===
        'page:fixture.host-pages:main',
      'selected Applet',
    );
    await until(
      () =>
        host.evaluate(
          () =>
            document.querySelector('.shell')?.getAttribute('data-route') ===
              'page:fixture.host-pages:main' &&
            localStorage.getItem('appdock.restart-view.page') ===
              JSON.stringify('page:fixture.host-pages:main'),
        ),
      'Applet renderer selection persisted',
    );
    await app.close();
    app = null;
    await launch(true);
    await until(
      async () =>
        (await host.evaluate(() => window.dock.snapshot())).navigation.route ===
        'page:fixture.host-pages:main',
      'restored Applet',
    );
    await until(
      () =>
        app
          .context()
          .pages()
          .some((p) => p.url().includes('page.html')),
      'Applet contents',
    );
    checks.push('restart restores a running local Applet');
    await host.evaluate(() =>
      window.dock.executeCommand('appdock.applets.fixture.host-pages.disable'),
    );
    await defaultPage();
    checks.push('stopping the selected Applet returns to version information');
    await seedRestore('page:fixture.host-pages:main');
    await app.close();
    app = null;
    await launch(true);
    await defaultPage();
    checks.push(
      'a disabled Applet is not enabled by restoration and returns to version information',
    );
    const final = await host.evaluate(() => window.dock.snapshot());
    assert.equal(final.version, require('../package.json').version);
    assert.equal(
      final.extensions.find((a) => a.id === 'appdock.default-shell').version,
      final.version,
    );
    assert.deepEqual(final.settings.value.host.shellProviders, settings.host.shellProviders);
    assert.deepEqual(final.settings.value.ribbon.order, settings.ribbon.order);
    assert.deepEqual(final.settings.value.keybindings, settings.keybindings);
    assert.deepEqual(final.settings.value.pinnedCommands, settings.pinnedCommands);
    assert.equal(hash(original), imageHash);
    assert.deepEqual(errors, []);
    checks.push(
      'restart restores the selected page and preserves retired assignments and original image bytes',
    );
    success = true;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    if (host)
      await host
        .evaluate(async () => ({
          snapshot: await window.dock.snapshot(),
          route: localStorage.getItem('appdock.restart-view.page'),
        }))
        .then((state) =>
          fs.writeFileSync(
            path.join(profile, 'failure-state.json'),
            JSON.stringify(state, null, 2),
          ),
        )
        .catch(() => {});
    await host?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
  } finally {
    await app?.close().catch((error) => {
      console.error(error);
      success = false;
      process.exitCode = 1;
    });
    const result = {
      success,
      version: require('../package.json').version,
      portable: !!portable,
      executable: portable,
      sha256: portable ? hash(portable) : null,
      profile,
      checks,
      errors,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})();
