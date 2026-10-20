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
const profile = path.join(root, '.artifacts', `image-gallery-ui-${Date.now()}`);
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
for (let i = 0; i < 75; i++)
  fs.writeFileSync(
    path.join(images, `image-${String(i).padStart(3, '0')}.png`),
    png(i % 3 === 0 ? 160 : 640, i % 3 === 0 ? 320 : 400, i, i === 2 ? 100 : 255),
  );
const longName = '長いファイル名と透過画像の表示を確認するためのサンプル画像です.png';
fs.writeFileSync(path.join(images, longName), png(600, 600, 4, 150));
const source = path.join(profile, '追加する画像.png');
fs.writeFileSync(source, png(900, 600, 5));
const bad = path.join(profile, '不正な画像.png');
fs.writeFileSync(bad, 'invalid');
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.closeToTray = false;
settings.host.soundEnabled = false;
settings.globalShortcutCommands = [];
settings.imageLibrary = {
  groups: [
    { id: 'photos', name: '写真', images: [{ file: 'image-000.png' }, { file: 'image-001.png' }] },
    { id: 'icons', name: 'アイコン', images: [{ file: 'image-000.png' }] },
    { id: 'missing', name: '読取待ち', images: [{ file: 'missing.png' }] },
  ],
};
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const exe = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) {
  fs.copyFileSync(portable, exe);
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
  page = await until(
    () =>
      app
        .context()
        .pages()
        .find((p) => p.url().endsWith('/image-library.html')),
    'gallery',
  );
  page.setDefaultTimeout(15000);
  await page.locator('.ad-gallery-card').first().waitFor();
}
const model = () => page.evaluate(async () => (await window.appdockPage.connect()).snapshot);
const imageSnapshot = () => host.evaluate(() => window.dock.imageLibrary.snapshot());
const card = (name) =>
  page.locator('.ad-gallery-card').filter({ has: page.locator('h3', { hasText: name }) });
const action = async (command, fields = {}) =>
  page.evaluate(
    async ({ command, fields }) => {
      const { snapshot } = await window.appdockPage.connect();
      return window.appdockPage.act({ id: snapshot.id, type: 'gallery', command, ...fields });
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
    const rail = await ribbonPage(host);
    await rail.locator('[data-ribbon-id="image-library"]').click();
    await open();
    await until(
      async () => (await model()).content.total === 77,
      'all files and missing membership',
    );
    await until(
      async () => (await page.locator('.ad-gallery-image img[src]').count()) > 3,
      'decoded gallery',
    );
    assert.equal((await model()).content.items.length, 64);
    assert.equal((await model()).content.items[0].title, 'image-000.png');
    assert.equal(await page.locator('.library-sidebar').isVisible(), true);
    checks.push('ribbon and command entry, left groups, lazy decoded images and 64-item page');
    const originalHash = hash(path.join(images, 'image-000.png'));
    const settingsHash = hash(path.join(profile, 'settings.json'));
    await card('image-000.png').getByRole('checkbox').check();
    await page.evaluate(() => {
      window.__firstCard = document.querySelector('.ad-gallery-card');
    });
    const slider = page.getByRole('slider', { name: '画像サイズ' });
    await slider.focus();
    await slider.press('End');
    await until(async () => (await model()).content.cardWidth === 360, 'width saved');
    assert.equal(
      await page.evaluate(() => window.__firstCard === document.querySelector('.ad-gallery-card')),
      true,
    );
    assert.equal((await model()).content.selected, 1);
    assert.equal(await slider.evaluate((e) => document.activeElement === e), true);
    await slider.press('Home');
    await until(async () => (await model()).content.cardWidth === 180, 'min saved');
    assert.equal(hash(path.join(profile, 'settings.json')), settingsHash);
    assert.equal(hash(path.join(images, 'image-000.png')), originalHash);
    await page.getByRole('button', { name: /すべて選択/ }).click();
    await until(async () => (await model()).content.selected === 77, 'all including unloaded');
    await page.getByRole('button', { name: /さらに表示/ }).click();
    assert.equal((await model()).content.items.length, 77);
    await page.locator('.library-scroll').evaluate((e) => {
      e.scrollTop = 1300;
    });
    await until(async () => !!(await model()).content.anchor, 'anchor saved');
    const anchor = (await model()).content.anchor;
    await slider.focus();
    await slider.press('ArrowRight');
    await until(async () => (await model()).content.cardWidth === 200, 'resize');
    const afterAnchor = (await model()).content.anchor;
    assert.equal(afterAnchor.id, anchor.id);
    checks.push(
      'slider keyboard, stable DOM/focus, all-match selection, anchor and unchanged shared data',
    );
    await action('query', { value: 'image-00' });
    assert.equal((await model()).content.total, 10);
    assert.equal((await model()).content.selected, 0);
    await action('query', { value: '' });
    await page.getByRole('button', { name: 'グループを追加', exact: true }).click();
    let d = host.getByRole('dialog', { name: '画像グループを追加', exact: true });
    await d.waitFor();
    await until(
      async () =>
        (await modalState())
          .filter((v) => /\/(image-library|index|bars)\.html/.test(v.url))
          .every((v) => !v.visible),
      'native surfaces hidden',
    );
    await assert.rejects(action('select-all'), /bound/);
    await host.screenshot({ path: path.join(profile, 'modal.png') });
    await d.getByLabel('画像グループ名').fill('新しいグループ');
    await d.getByRole('button', { name: '追加', exact: true }).click();
    await until(
      async () => (await imageSnapshot()).groups.some((g) => g.name === '新しいグループ'),
      'group saved',
    );
    await until(
      async () =>
        (await modalState()).some((v) => v.url.endsWith('/image-library.html') && v.visible),
      'gallery restored',
    );
    await action('group', { groupId: 'all' });
    await card('image-000.png').getByRole('button', { name: 'グループ', exact: true }).click();
    d = host.getByRole('dialog', { name: '所属グループを編集', exact: true });
    await d.getByLabel('新しいグループ', { exact: true }).check();
    await d.getByRole('button', { name: '適用', exact: true }).click();
    await until(
      async () =>
        (await imageSnapshot()).groups.find((g) => g.name === '新しいグループ').images.length === 1,
      'membership',
    );
    await card('image-000.png').getByRole('button', { name: '拡大', exact: true }).click();
    d = host.getByRole('dialog', { name: 'image-000.png', exact: true });
    await d.locator('img').waitFor();
    await d.getByRole('button', { name: '閉じる', exact: true }).click();
    await until(
      async () =>
        (await modalState()).some((v) => v.url.endsWith('/image-library.html') && v.visible),
      'preview closed',
    );
    checks.push(
      'shared host dialogs, native body/bar backdrop, blocked background actions and preview',
    );
    await app.evaluate(
      ({ dialog }, files) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
      },
      [source, bad, path.join(images, 'image-000.png')],
    );
    await page.getByRole('button', { name: '画像を追加', exact: true }).click();
    await until(
      async () =>
        !(await model()).content.busy && (await model()).content.message.includes('失敗 1枚'),
      'partial import',
    );
    assert.equal(hash(path.join(images, path.basename(source))), hash(source));
    assert.equal(hash(path.join(images, 'image-000.png')), originalHash);
    assert.equal((await model()).content.selected, 2);
    await page.getByRole('button', { name: 'グループに追加', exact: true }).click();
    d = host.getByRole('dialog', { name: 'グループに追加', exact: true });
    await d.getByLabel('追加先グループ').selectOption('photos');
    await d.getByRole('button', { name: '適用', exact: true }).click();
    await until(
      async () =>
        (await imageSnapshot()).groups
          .find((g) => g.id === 'photos')
          .images.some((i) => i.file === path.basename(source)),
      'batch add',
    );
    const photoGroup = (await model()).content.groups.find((g) => g.title === '写真');
    await action('group', { groupId: photoGroup.id });
    await page.getByRole('button', { name: /すべて選択/ }).click();
    await page.getByRole('button', { name: 'このグループから外す' }).click();
    d = host.getByRole('dialog', { name: 'グループから外す', exact: true });
    await d.getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.equal((await imageSnapshot()).groups.find((g) => g.id === 'photos').images.length, 3);
    await page.getByRole('button', { name: 'このグループから外す' }).click();
    d = host.getByRole('dialog', { name: 'グループから外す', exact: true });
    await d.getByRole('button', { name: '外す', exact: true }).click();
    await until(
      async () => !(await imageSnapshot()).groups.find((g) => g.id === 'photos').images.length,
      'batch remove',
    );
    assert.equal(hash(path.join(images, path.basename(source))), hash(source));
    checks.push(
      'multi-file import partial success/reuse, batch add/remove/cancel preserve originals',
    );
    await action('group', { groupId: 'all' });
    await action('reload');
    await action('select', { imageId: (await model()).content.items[0].id, selected: true });
    const beforeRoute = (await model()).content;
    await host.evaluate(() => window.dock.navigate('home'));
    await until(() => page.isClosed(), 'old view released');
    await open();
    assert.equal((await model()).content.selected, beforeRoute.selected);
    assert.equal((await model()).content.cardWidth, beforeRoute.cardWidth);
    await assert.rejects(action('image', { assetId: beforeRoute.items[0].assetId, edge: 512 }));
    await action('clear');
    checks.push('navigation retains view state and invalidates previous session asset IDs');
    for (const t of ['light', 'dark']) {
      await theme(t);
      await action('width', { value: 260, commit: true });
      await until(
        async () => (await page.locator('.ad-gallery-image img[src]').count()) > 3,
        'images for screenshot',
      );
      await page.screenshot({ path: path.join(profile, `${t}.png`) });
      const geometry = await page.locator('.ad-gallery-card').evaluateAll((cards) =>
        cards.slice(0, 6).map((c) => ({
          top: c.getBoundingClientRect().top,
          bottom: c.querySelector('.ad-gallery-actions').getBoundingClientRect().bottom,
          width: c.querySelector('.ad-gallery-image').getBoundingClientRect().width,
          height: c.querySelector('.ad-gallery-image').getBoundingClientRect().height,
        })),
      );
      for (const a of geometry) {
        assert(Math.abs(a.width / a.height - 1.6) < 0.02);
        for (const b of geometry)
          if (Math.abs(a.top - b.top) < 1) assert(Math.abs(a.bottom - b.bottom) < 1);
      }
    }
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock:'),
      );
      w.setMinimumSize(320, 480);
      w.setSize(396, 850);
    });
    await until(
      async () => !(await page.locator('.library-sidebar').isVisible()),
      'responsive groups',
    );
    assert(await page.locator('.library-mobile-groups').isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(profile, 'narrow.png') });
    checks.push('light/dark and narrow responsive layout, 16:10 images and aligned card footers');
    // Source-level scaling exercises CSS layout; it is not physical mixed-DPI verification.
    for (const zoom of [1.5, 2]) {
      await app.evaluate(({ BrowserWindow }, zoom) => {
        const w = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().startsWith('appdock:'),
        );
        w.setSize(1000, 950);
        w.webContents.setZoomFactor(zoom);
      }, zoom);
      await until(
        async () => await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'zoom overflow',
      );
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock:'))
        .webContents.setZoomFactor(1),
    );
    await action('width', { value: 340, commit: true });
    const stateBefore = (await imageSnapshot()).groups;
    await app.close();
    app = null;
    await launch(true);
    await until(
      async () =>
        (await host.evaluate(() => window.dock.snapshot())).navigation.route === 'image-library',
      'restored gallery route',
    );
    await open();
    assert.equal((await model()).content.cardWidth, 340);
    assert.deepEqual((await imageSnapshot()).groups, stateBefore);
    assert.equal(hash(path.join(images, 'image-000.png')), originalHash);
    checks.push(
      '150/200 percent CSS scaling, process restart restores PC-local width and shared groups',
    );
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await until(() => host.locator('.settings-categories').isVisible(), 'settings');
    await host
      .locator('.settings-categories')
      .getByRole('button', { name: '画像ライブラリー', exact: true })
      .click();
    await host.getByRole('button', { name: '画像ライブラリーを開く', exact: true }).click();
    await open();
    checks.push('settings category links to the page without duplicate gallery management');
    const appPath = await app.evaluate(({ app }) => app.getAppPath());
    const bundleUrl = require('node:url').pathToFileURL(
      path.join(appPath, 'out/ui/image-gallery/image-gallery.js'),
    ).href;
    const common = await page.evaluate(async (bundleUrl) => {
      const { mountImageGallery, mountGallerySizeControl } = await import(bundleUrl);
      const box = document.createElement('div');
      box.style.cssText =
        'position:fixed;inset:0;background:var(--bg);z-index:999;padding:20px;overflow:auto';
      const grid = document.createElement('div'),
        size = document.createElement('div');
      box.append(size, grid);
      document.body.append(box);
      const events = [];
      const source =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNn8AAAAASUVORK5CYII=';
      const view = mountImageGallery(grid, {
        scrollElement: box,
        image: async () => source,
        select: (id) => events.push('select:' + id),
        activate: (id) => events.push('preview:' + id),
        action: (id, action) => events.push(action + ':' + id),
      });
      const item = {
        id: 'stable',
        assetId: 'asset',
        title: '<b>安全な表示名</b>',
        detail: 'test',
        labels: [],
        state: 'ready',
        selected: false,
        actions: [
          { id: 'open', title: '開く' },
          { id: 'delete', title: '削除' },
        ],
      };
      view.setModel({ items: [item], cardWidth: 260, fit: 'cover', selection: 'none', empty: '' });
      const original = grid.firstChild;
      grid.querySelector('.ad-gallery-image').click();
      grid.querySelector('[data-action=delete]').click();
      view.setModel({
        items: [item],
        cardWidth: 180,
        fit: 'contain',
        selection: 'single',
        empty: '',
      });
      grid.querySelector('.ad-gallery-image').click();
      const same = original === grid.firstChild;
      const textOnly =
        !grid.querySelector('b') && grid.querySelector('h3').textContent === item.title;
      const values = [];
      const control = mountGallerySizeControl(size, {
        value: 260,
        change: (v) => values.push(v),
        commit: (v) => events.push('width:' + v),
      });
      const input = size.querySelector('input');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      input.value = '360';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'End', bubbles: true }));
      view.dispose();
      control.dispose();
      box.remove();
      return { same, textOnly, events, values };
    }, bundleUrl);
    assert.deepEqual(common, {
      same: true,
      textOnly: true,
      events: ['preview:stable', 'delete:stable', 'select:stable', 'width:360'],
      values: [360],
    });
    checks.push(
      'standalone public bundle supports history/picker modes, stable keys, text escaping and size commit',
    );
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
      JSON.stringify({ error: String(error.stack ?? error), checks, errors }, null, 2),
    );
    await page?.screenshot({ path: path.join(profile, 'failure-page.png') }).catch(() => {});
    await host?.screenshot({ path: path.join(profile, 'failure-host.png') }).catch(() => {});
    console.error(error);
    process.exitCode = 1;
  } finally {
    await app?.close().catch(() => {});
  }
})().then(() => console.log(JSON.stringify({ profile, checks, errors }, null, 2)));
