const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { _electron: electron, chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] ? path.resolve(process.argv[2]) : null;
const profile = path.join(root, '.artifacts', `host-pages-ui-${Date.now()}`);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
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
    commands: [{ id: 'fixture.host-pages.mark', title: 'Record host page mark' }],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'worker.cjs'),
  "exports.activate=async c=>c.commands.register('fixture.host-pages.mark','Record host page mark',()=>c.log.info('host-page-mark')); ",
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.closeToTray = false;
settings.host.soundEnabled = false;
settings.keybindings = [];
settings.extensions['fixture.host-pages'] = { enabled: true, settings: {} };
settings.pinnedCommands = ['fixture.host-pages.mark'];
settings.host.shellProviders = Object.fromEntries(
  ['home', 'logs', 'image-library', 'notifications', 'settings'].map((kind) => [
    'page.' + kind,
    'missing.retired-shell',
  ]),
);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
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
      args: [root, `--test-profile=${profile}`, ...(restore ? ['--restore-view'] : [])],
      env,
    });
  else {
    const exe = path.join(profile, 'AppDock.at365.exe');
    if (!fs.existsSync(exe)) fs.copyFileSync(portable, exe);
    assert.equal(hash(exe), hash(portable));
    const debug = await freePort(),
      inspector = await freePort();
    child = spawn(
      exe,
      [
        `--test-profile=${profile}`,
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
    await open('home');
    await host.getByRole('button', { name: /Record host page mark/ }).click();
    await until(
      async () =>
        (await host.evaluate(() => window.dock.snapshot())).logs.some(
          (l) => l.message === 'host-page-mark',
        ),
      'home command',
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
      'host home executes pinned commands; host logs filter and clear the source without losing search',
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
      for (const kind of ['home', 'logs', 'image-library', 'notifications']) {
        await open(kind);
        await geometry();
        await host.screenshot({ path: path.join(profile, `${kind}-${theme}.png`) });
        const state = await host.evaluate(() => window.dock.snapshot());
        assert.equal(state.shellRegions.regions.length, 7);
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
      'all four pages render within the host in both themes; only seven Shell regions remain and retired page documents never start',
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
      for (const kind of ['home', 'logs', 'image-library', 'notifications']) {
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
    const final = await host.evaluate(() => window.dock.snapshot());
    assert.deepEqual(final.settings.value.host.shellProviders, settings.host.shellProviders);
    assert.equal(hash(original), imageHash);
    assert.deepEqual(errors, []);
    checks.push(
      'restart restores the selected page and preserves retired assignments and original image bytes',
    );
    success = true;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
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
