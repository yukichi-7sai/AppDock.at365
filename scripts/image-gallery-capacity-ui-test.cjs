const { _electron: electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path'),
  zlib = require('node:zlib'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { ribbonPage } = require('./shell-overlay-helper.cjs');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] ? path.resolve(process.argv[2]) : null;
const profile = path.join(root, '.artifacts', `image-gallery-capacity-ui-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const checks = [],
  errors = [];
function png(w, h, seed = 1, alpha = 255) {
  const crc = (data) => {
    let n = 0xffffffff;
    for (const b of data) {
      n ^= b;
      for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
    }
    return (n ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, bytes) => {
    const type = Buffer.from(name),
      size = Buffer.alloc(4),
      end = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length);
    end.writeUInt32BE(crc(Buffer.concat([type, bytes])));
    return Buffer.concat([size, type, bytes, end]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      rows[i] = (seed * 47 + (x / w) * 80) % 256;
      rows[i + 1] = (seed * 23 + (y / h) * 80) % 256;
      rows[i + 2] = 140;
      rows[i + 3] = alpha;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const images = path.join(profile, 'data/assets/images');
fs.mkdirSync(images, { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.closeToTray = false;
settings.host.soundEnabled = false;
settings.globalShortcutCommands = [];
// Real PNG files with distinct content hashes; large landscape and portrait sources.
const samples = [png(2048, 1280, 1), png(1280, 2048, 2), png(1600, 1600, 3, 150)];
const refs = Array.from({ length: 512 }, (_, i) => ({
  file: `image-${String(i).padStart(3, '0')}.png`,
}));
for (const [i, ref] of refs.entries()) {
  const sample = samples[i % 3],
    text = Buffer.from(`Fixture\0${i}`),
    chunk = Buffer.alloc(text.length + 12);
  chunk.writeUInt32BE(text.length);
  chunk.write('tEXt', 4);
  text.copy(chunk, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  fs.writeFileSync(
    path.join(images, ref.file),
    Buffer.concat([sample.subarray(0, -12), chunk, sample.subarray(-12)]),
  );
}
settings.imageLibrary = {
  groups: Array.from({ length: 64 }, (_, i) => ({
    id: `group-${i}`,
    name: `グループ${String(i).padStart(2, '0')}`,
    images: i < 8 ? refs : [],
  })),
};
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
const originals = Object.fromEntries(
  refs.map((ref) => [ref.file, hash(path.join(images, ref.file))]),
);
const measurements = [];
const exe = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) {
  require('./copy-host.cjs').copyHost(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
let app, host, page, child;
const until = async (fn, label) => {
  const end = Date.now() + 60000;
  let last;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 70));
  }
  throw Error(label + (last ? ': ' + last : ''));
};
async function launch(restore = false) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (!portable)
    app = await electron.launch({
      executablePath: exe,
      args: [root, `--test-profile=${profile}`, ...(restore ? ['--restore-view'] : [])],
      env,
    });
  else {
    const debug = await freePort(),
      inspector = await freePort();
    child = spawn(
      exe,
      [
        `--test-profile=${profile}`,
        ...(restore ? ['--restore-view'] : []),
        `--remote-debugging-port=${debug}`,
        `--inspect=127.0.0.1:${inspector}`,
      ],
      { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
    );
    const browser = await until(
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
        await host?.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
        await until(() => child.exitCode !== null, 'shutdown');
        await browser.close();
      },
    };
  }
  app.context().on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));
  host = await until(
    () =>
      app
        .context()
        .pages()
        .find((p) => p.url().startsWith('appdock://host/index.html')),
    'host',
  );
  host.setDefaultTimeout(15000);
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock:'),
    );
    w.setSize(1360, 950);
    w.show();
    w.focus();
  });
  await until(
    async () => (await host.evaluate(() => window.dock.snapshot())).startupReady,
    'startup',
  );
}
async function open() {
  await host.evaluate(() => window.dock.executeCommand('appdock.image-library.open'));
  page = host;
  page.setDefaultTimeout(15000);
  await page.locator('.ad-gallery-card').first().waitFor();
}
const model = () => page.evaluate(async () => await window.dock.pages.get());
const imageSnapshot = () => host.evaluate(() => window.dock.imageLibrary.snapshot());
const card = (name) =>
  page.locator('.ad-gallery-card').filter({ has: page.locator('h3', { hasText: name }) });
const action = async (command, fields = {}) =>
  page.evaluate(
    async ({ command, fields }) => {
      const snapshot = await window.dock.pages.get();
      return window.dock.pages.act({ id: snapshot.id, type: 'gallery', command, ...fields });
    },
    { command, fields },
  );
const modalState = () =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock:'),
    );
    return w.contentView.children
      .filter((v) => v.webContents)
      .map((v) => ({
        url: v.webContents.getURL(),
        visible: v.getVisible(),
        focused: v.webContents.isFocused(),
      }));
  });
async function theme(value) {
  await host.evaluate(async (theme) => {
    const s = await window.dock.snapshot();
    await window.dock.saveSettings(
      { ...s.settings.value, host: { ...s.settings.value.host, theme } },
      s.settings.revision,
    );
  }, value);
  await until(async () => (await model()).dark === (value === 'dark'), 'theme');
}
(async () => {
  try {
    await launch();
    await open();
    await until(async () => (await model()).content.total === 512, '512 images indexed');
    const sharedHash = hash(require('./test-settings.cjs').file(profile, 'settings.json'));
    let current = (await model()).content;
    assert.equal(current.groups.length, 66);
    assert.equal(current.items.length, 64);
    assert.equal(current.items[0].labels.length, 8);
    assert(!JSON.stringify(current).includes('base64'));
    await page.getByRole('button', { name: /すべて選択/ }).click();
    await until(
      async () => (await model()).content.selected === 512,
      'select all including unloaded',
    );
    for (let count = 128; count <= 512; count += 64) {
      await page.getByRole('button', { name: /さらに表示/ }).click();
      await until(async () => (await model()).content.items.length === count, `load ${count}`);
    }
    assert.equal(await page.locator('.ad-gallery-card').count(), 512);
    assert.equal((await model()).content.selected, 512);
    checks.push('512 real PNGs, 64 groups, 4096 memberships, select all and 64-item increments');
    for (const position of [0, 0.25, 0.5, 0.75, 1, 0.5, 0]) {
      await page.locator('.library-scroll').evaluate((e, fraction) => {
        e.scrollTop = (e.scrollHeight - e.clientHeight) * fraction;
      }, position);
      await until(
        async () =>
          page.locator('.ad-gallery-card').evaluateAll((cards) => {
            const scroll = document.querySelector('.library-scroll').getBoundingClientRect();
            const visible = cards.filter((c) => {
              const r = c.getBoundingClientRect();
              return r.bottom > scroll.top && r.top < scroll.bottom;
            });
            return (
              visible.length > 0 && visible.every((c) => c.querySelector('img').naturalWidth > 0)
            );
          }),
        'visible large images decoded',
      );
      const metrics = await page.locator('.ad-gallery-card').evaluateAll((cards) => {
        const sources = cards
          .map((c) => c.querySelector('img'))
          .filter((img) => img.hasAttribute('src'));
        return {
          cards: cards.length,
          decoded: sources.length,
          decodedPixelBytes: sources.reduce(
            (sum, img) => sum + img.naturalWidth * img.naturalHeight * 4,
            0,
          ),
          retainedSourceBytes: sources.reduce(
            (sum, img) => sum + img.getAttribute('src').length * 2,
            0,
          ),
        };
      });
      assert(metrics.decoded < 48, JSON.stringify(metrics));
      assert(metrics.decodedPixelBytes < 64 * 1024 * 1024, JSON.stringify(metrics));
      measurements.push({ position, ...metrics });
    }
    const memory = await app.evaluate(async ({ app }) =>
      app.getAppMetrics().map(({ type, memory }) => ({ type, memory })),
    );
    measurements.push({ processMemory: memory });
    checks.push(
      'scrolling releases decoded offscreen surfaces; decoded dimensions/source bytes and process memory recorded',
    );
    const slider = page.getByRole('slider', { name: '画像サイズ' });
    await slider.focus();
    await slider.press('End');
    await until(async () => (await model()).content.cardWidth === 360, 'End saves maximum');
    await slider.press('Home');
    await until(async () => (await model()).content.cardWidth === 180, 'Home saves minimum');
    assert.equal((await model()).content.selected, 512);
    assert.equal((await model()).content.items.length, 512);
    assert.equal(await slider.evaluate((e) => e === document.activeElement), true);
    const search = page.getByRole('searchbox');
    await search.fill('image-50');
    await search.press('Enter');
    await until(async () => (await model()).content.total === 10, 'keyboard search');
    await search.fill('');
    await search.press('Enter');
    await until(async () => (await model()).content.total === 512, 'clear search');
    assert.equal(hash(require('./test-settings.cjs').file(profile, 'settings.json')), sharedHash);
    for (const mode of ['light', 'dark']) {
      await theme(mode);
      await page.screenshot({ path: path.join(profile, `${mode}.png`) });
    }
    checks.push(
      'maximum catalogue retains loaded count/selection through keyboard sizing and search',
    );
    for (const [file, expected] of Object.entries(originals))
      assert.equal(hash(path.join(images, file)), expected);
    const appPath = await app.evaluate(({ app }) => app.getAppPath());
    const bundleUrl = require('node:url').pathToFileURL(
      path.join(appPath, 'out/ui/image-gallery/image-gallery.js'),
    ).href;
    const componentPage = await require('./gallery-component-helper.cjs').galleryComponentPage(
      app,
      host,
      profile,
    );
    const race = await componentPage.evaluate(async (bundleUrl) => {
      const { mountImageGallery } = await import(bundleUrl);
      const wait = async (condition) => {
        for (let i = 0; i < 300; i++) {
          if (condition()) return;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw Error('controlled image request timed out');
      };
      const box = document.createElement('div'),
        grid = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:999;background:white;overflow:auto';
      box.append(grid);
      document.body.append(box);
      const source =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNn8AAAAASUVORK5CYII=';
      const requests = [];
      const gallery = mountImageGallery(grid, {
        scrollElement: box,
        image: (assetId) => new Promise((resolve) => requests.push({ assetId, resolve })),
        select() {},
        activate() {},
        action() {},
      });
      const items = Array.from({ length: 128 }, (_, i) => ({
        id: `item-${i}`,
        assetId: `asset-${i}`,
        title: `Image ${i}`,
        detail: '',
        labels: [],
        state: 'ready',
        actions: [],
      }));
      gallery.setModel({ items, cardWidth: 260, fit: 'contain', selection: 'none', empty: '' });
      await wait(() => requests.length === 3);
      const first = requests.splice(0);
      box.scrollTop = box.scrollHeight;
      // Allow the real IntersectionObserver to report the first cards leaving its margin.
      await new Promise((resolve) => setTimeout(resolve, 150));
      for (const request of first) request.resolve(source);
      await wait(() => requests.length === 3);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const offscreenSources = [...grid.querySelectorAll('article')]
        .slice(0, 3)
        .filter((c) => c.querySelector('img').hasAttribute('src')).length;
      box.scrollTop = 0;
      await new Promise((resolve) => setTimeout(resolve, 150));
      for (const request of requests.splice(0)) request.resolve(source);
      await wait(() => requests.length === 3);
      for (const request of requests.splice(0)) request.resolve(source);
      await wait(() =>
        [...grid.querySelectorAll('article')]
          .slice(0, 3)
          .every((c) => c.querySelector('img').hasAttribute('src')),
      );
      const restoredSources = [...grid.querySelectorAll('article')]
        .slice(0, 3)
        .filter((c) => c.querySelector('img').hasAttribute('src')).length;
      const pending = requests.splice(0);
      gallery.dispose();
      for (const request of pending) request.resolve(source);
      await new Promise((resolve) => setTimeout(resolve, 30));
      const childrenAfterDispose = grid.childElementCount;
      box.remove();
      return { offscreenSources, restoredSources, childrenAfterDispose };
    }, bundleUrl);
    measurements.push({ lateResponse: race });
    assert.equal(
      race.offscreenSources,
      0,
      'late image replies must not repopulate offscreen cards',
    );
    assert.equal(race.restoredSources, 3, 'returning to visible cards must request fresh images');
    assert.equal(race.childrenAfterDispose, 0);
    checks.push('late replies after scrolling/disposal cannot retain offscreen decoded images');
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          portable: !!portable,
          executable: portable,
          sha256: portable ? hash(portable) : null,
          checks,
          measurements,
          errors,
        },
        null,
        2,
      ),
    );
    console.log('PASS');
  } catch (error) {
    fs.writeFileSync(
      path.join(profile, 'failure.json'),
      JSON.stringify(
        { error: String(error.stack ?? error), checks, measurements, errors },
        null,
        2,
      ),
    );
    await page?.screenshot({ path: path.join(profile, 'failure-page.png') }).catch(() => {});
    console.error(error);
    process.exitCode = 1;
  } finally {
    await app?.close().catch(() => {});
  }
})().then(() => console.log(JSON.stringify({ profile, checks, measurements, errors }, null, 2)));
