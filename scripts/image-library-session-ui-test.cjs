const { _electron: electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path'),
  zlib = require('node:zlib'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] ? path.resolve(process.argv[2]) : null;
const profile = path.join(root, '.artifacts', `image-library-session-ui-${Date.now()}`);
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
const observations = [];
(async () => {
  try {
    await launch();
    await open();
    await until(async () => (await model()).content.total === 77, 'library loaded');
    for (let i = 0; i < 6; i++) {
      await card('image-000.png')
        .getByRole('checkbox')
        .setChecked(i % 2 === 0);
      await until(
        async () => (await model()).content.selected === (i % 2 === 0 ? 1 : 0),
        'checkbox selection',
      );
      assert.deepEqual(await page.locator('.library-status [role=alert]').allTextContents(), []);
    }
    await page.getByRole('button', { name: /すべて選択/ }).click();
    await until(async () => (await model()).content.selected === 77, 'select all after checkbox');
    await page.getByRole('button', { name: '選択を解除', exact: true }).click();
    await until(
      async () => (await model()).content.selected === 0,
      'clear selection after checkbox',
    );
    observations.push({
      phase: 'checkbox',
      alerts: await page.locator('.library-status [role=alert]').allTextContents(),
      shell: (await host.evaluate(() => window.dock.snapshot())).shellRegions,
    });
    checks.push(
      'checkbox selection and subsequent selection commands remain usable without a modal',
    );
    const hostCdp = await app.context().newCDPSession(host);
    await hostCdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    await page.getByRole('button', { name: 'グループを追加', exact: true }).click();
    const ordinaryDialog = host.getByRole('dialog', { name: '画像グループを追加', exact: true });
    await ordinaryDialog.waitFor();
    await until(
      () => ordinaryDialog.evaluate((el) => getComputedStyle(el).opacity === '1'),
      'dialog without host focus emulation',
    );
    await ordinaryDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await until(
      async () =>
        host.evaluate(
          () =>
            !!document.querySelector('.library-page') && !document.querySelector('dialog:modal'),
        ),
      'ordinary dialog restores page',
    );
    checks.push('host dialog opens with browser automation focus emulation disabled');
    await app.evaluate(async ({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock:'),
      ).webContents;
      await wc.executeJavaScriptInIsolatedWorld(999, [
        {
          code: `window.__modalFrames = [];
          window.__modalRaf = window.requestAnimationFrame;
          window.requestAnimationFrame = callback => (window.__modalFrames.push(callback), window.__modalFrames.length);
          true;`,
        },
      ]);
    });
    await page.getByRole('button', { name: 'グループを追加', exact: true }).click();
    const frameDialog = host.getByRole('dialog', { name: '画像グループを追加', exact: true });
    await frameDialog.waitFor();
    // A covered host renderer may not receive animation frames. Preparing its
    // modal must not wait for a frame before hiding the native page that covers it.
    await host.locator('[data-host-modal-backdrop]').waitFor({ state: 'attached' });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const frameState = await host.evaluate(() => ({
      pending: document.documentElement.hasAttribute('data-host-modal-pending'),
      opacity: getComputedStyle(document.querySelector('dialog:modal')).opacity,
      backdrop: !!document.querySelector('[data-host-modal-backdrop]'),
    }));
    observations.push({ phase: 'host-frames-paused', ...frameState, surfaces: await modalState() });
    assert.equal(
      frameState.pending,
      false,
      'modal presentation must not wait for host animation frames',
    );
    assert.equal(frameState.opacity, '1');
    await host.screenshot({ path: path.join(profile, 'host-frames-paused-dialog.png') });
    await frameDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await until(
      async () =>
        host.evaluate(
          () =>
            !!document.querySelector('.library-page') && !document.querySelector('dialog:modal'),
        ),
      'frame-independent dialog restores page',
    );
    await card('image-000.png')
      .getByRole('button', { name: 'image-000.pngを拡大', exact: true })
      .click();
    const framePreview = host.getByRole('dialog', { name: 'image-000.png', exact: true });
    await until(
      () => framePreview.evaluate((el) => getComputedStyle(el).opacity === '1'),
      'preview with paused host animation frames',
    );
    await until(
      async () =>
        host.evaluate(
          () =>
            !!document.querySelector('dialog:modal') &&
            document.querySelector('.library-page').inert,
        ),
      'frame-independent preview covers page',
    );
    await host.screenshot({ path: path.join(profile, 'host-frames-paused-preview.png') });
    await framePreview.getByRole('button', { name: '閉じる', exact: true }).click();
    await until(
      async () =>
        host.evaluate(
          () =>
            !!document.querySelector('.library-page') && !document.querySelector('dialog:modal'),
        ),
      'frame-independent preview restores page',
    );
    await app.evaluate(async ({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock:'),
      ).webContents;
      await wc.executeJavaScriptInIsolatedWorld(999, [
        {
          code: `window.requestAnimationFrame = window.__modalRaf;
          const callbacks = window.__modalFrames;
          delete window.__modalRaf; delete window.__modalFrames;
          callbacks.forEach(callback => callback(performance.now()));`,
        },
      ]);
    });
    await hostCdp.detach();
    checks.push('paused host animation frames do not hide dialogs or trap page input');
    for (const mode of ['capture', 'decode']) {
      await app.evaluate(({ BrowserWindow }, mode) => {
        for (const w of BrowserWindow.getAllWindows())
          for (const view of w.contentView.children) {
            const wc = view.webContents;
            if (!wc) continue;
            wc.__galleryCapture = wc.capturePage.bind(wc);
            wc.capturePage = async () => {
              if (mode === 'capture') throw Error('fixture: capture failed');
              return { toDataURL: () => 'data:image/png;base64,broken' };
            };
          }
      }, mode);
      await page.getByRole('button', { name: 'グループを追加', exact: true }).click();
      const fallbackDialog = host.getByRole('dialog', { name: '画像グループを追加', exact: true });
      await fallbackDialog.waitFor();
      await until(
        () =>
          host.evaluate(() => !document.documentElement.hasAttribute('data-host-modal-pending')),
        'fallback dialog prepared',
      );
      const failureSurfaces = await modalState();
      observations.push({ phase: `${mode}-failed`, surfaces: failureSurfaces });
      assert(
        failureSurfaces.filter((v) => /\/(index|bars)\.html/.test(v.url)).every((v) => !v.visible),
        'capture failure must hide native surfaces so the host dialog can receive input',
      );
      await host.screenshot({ path: path.join(profile, `${mode}-failure-dialog.png`) });
      await fallbackDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
      await until(
        async () =>
          host.evaluate(
            () =>
              !!document.querySelector('.library-page') && !document.querySelector('dialog:modal'),
          ),
        'fallback restores page',
      );
      await app.evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows())
          for (const view of w.contentView.children) {
            const wc = view.webContents;
            if (!wc?.__galleryCapture) continue;
            wc.capturePage = wc.__galleryCapture;
            delete wc.__galleryCapture;
          }
      });
      checks.push(
        `${mode} failure still exposes the host dialog and restores native surfaces on close`,
      );
    }
    // A native modal can become active before the scroll handler's rAF reaches main.
    await page.evaluate(() => {
      const scroll = document.querySelector('.library-scroll');
      scroll.scrollTop = 500;
      [...document.querySelectorAll('button')]
        .find((b) => b.textContent.includes('グループを追加'))
        .click();
    });
    const dialog = host.getByRole('dialog', { name: '画像グループを追加', exact: true });
    await dialog.waitFor();
    await until(
      async () =>
        host.evaluate(
          () =>
            !!document.querySelector('dialog:modal') &&
            document.querySelector('.library-page').inert,
        ),
      'modal covers library',
    );
    await page.evaluate(() =>
      document.querySelector('.library-scroll').dispatchEvent(new Event('scroll')),
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    const alertsDuringModal = await page.locator('.library-status [role=alert]').allTextContents();
    observations.push({ phase: 'modal', alerts: alertsDuringModal });
    const snapshot = (await model()).content;
    const background = await action('select-all').then(
      () => ({ allowed: true }),
      (error) => ({ error: String(error) }),
    );
    assert.match(background.error, /dialog/, 'background edits must still be blocked');
    const invalid = await action('anchor', { anchor: { id: 'foreign-image', offset: 0 } }).then(
      () => ({ allowed: true }),
      (error) => ({ error: String(error) }),
    );
    assert(invalid.error, 'foreign anchors must be rejected');
    const image = await action('image', { assetId: snapshot.items[0].assetId, edge: 512 });
    assert.match(image, /^data:image/, 'read-only image fetch remains allowed under modal');
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await until(
      async () =>
        host.evaluate(
          () =>
            !!document.querySelector('.library-page') && !document.querySelector('dialog:modal'),
        ),
      'library resumes',
    );
    const alertsAfterModal = await page.locator('.library-status [role=alert]').allTextContents();
    observations.push({ phase: 'after-modal', alerts: alertsAfterModal });
    assert.deepEqual(
      alertsDuringModal,
      [],
      'scroll bookkeeping must not display Page session is not bound',
    );
    assert.deepEqual(alertsAfterModal, []);
    assert.equal((await model()).content.selected, 0);
    assert.equal((await imageSnapshot()).groups.length, 3);
    await card('image-000.png').getByRole('checkbox').check();
    await until(async () => (await model()).content.selected === 1, 'checkbox after modal');
    await page.getByRole('searchbox', { name: 'ファイル名で検索' }).fill('image-00');
    await until(async () => (await model()).content.total === 10, 'search after checkbox');
    await page.getByRole('searchbox', { name: 'ファイル名で検索' }).fill('');
    await until(async () => (await model()).content.total === 77, 'search cleared');
    assert.deepEqual(await page.locator('.library-status [role=alert]').allTextContents(), []);
    checks.push(
      'scroll notification during native modal succeeds without enabling background edits or accepting foreign IDs',
    );
    await page.locator('.library-scroll').evaluate((e) => {
      e.scrollTop = 800;
    });
    await until(async () => !!(await model()).content.anchor, 'scroll anchor saved');
    const anchor = (await model()).content.anchor;
    await host.evaluate(() => window.dock.navigate(null));
    await until(
      () =>
        host
          .locator('.library-page')
          .count()
          .then((n) => !n),
      'previous host page unmounted',
    );
    await open();
    await card('image-001.png').getByRole('checkbox').check();
    await until(async () => (await model()).content.selected === 1, 'checkbox after reopen');
    assert.deepEqual(await page.locator('.library-status [role=alert]').allTextContents(), []);
    assert((await model()).content.anchor);
    observations.push({
      phase: 'reopen',
      anchorBefore: anchor,
      anchorAfter: (await model()).content.anchor,
    });
    checks.push('returning to a scrolled library restores its view without an unbound operation');
    // Leave a real interval between modal activation and covering the native page.
    // Slower capture/compositing must not let a second click submit another dialog.
    await app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows())
        for (const view of w.contentView.children) {
          const wc = view.webContents;
          if (!wc || wc.__galleryCapture) continue;
          wc.__galleryCapture = wc.capturePage.bind(wc);
          wc.capturePage = async (...args) => {
            await new Promise((resolve) => setTimeout(resolve, 350));
            return wc.__galleryCapture(...args);
          };
        }
    });
    await card('image-000.png')
      .getByRole('button', { name: 'image-000.pngを拡大', exact: true })
      .dblclick({ delay: 75 });
    const preview = host.getByRole('dialog', { name: 'image-000.png', exact: true });
    await preview.waitFor();
    await until(
      async () =>
        host.evaluate(
          () =>
            !!document.querySelector('dialog:modal') &&
            document.querySelector('.library-page').inert,
        ),
      'delayed preview covers library',
    );
    await host.screenshot({ path: path.join(profile, 'double-click-dialog.png') });
    await preview.getByRole('button', { name: '閉じる', exact: true }).click();
    await until(
      async () =>
        host.evaluate(
          () =>
            !!document.querySelector('.library-page') && !document.querySelector('dialog:modal'),
        ),
      'preview double click returns',
    );
    const alertsAfterDoubleClick = await page
      .locator('.library-status [role=alert]')
      .allTextContents();
    observations.push({ phase: 'double-click', alerts: alertsAfterDoubleClick });
    assert.deepEqual(
      alertsAfterDoubleClick,
      [],
      'double click must not submit an action while the modal opens',
    );
    for (let i = 0; i < 6; i++) {
      await page
        .locator('.library-sidebar > nav')
        .first()
        .getByRole('button')
        .nth(i % 2 ? 0 : 1)
        .click();
      await until(
        async () => (await model()).content.group === (i % 2 ? 'all' : 'unfiled'),
        'switch after preview',
      );
    }
    assert.deepEqual(await page.locator('.library-status [role=alert]').allTextContents(), []);
    checks.push(
      'double click during delayed modal capture and subsequent group switching remain usable',
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          portable: !!portable,
          runtimeShell: (await host.evaluate(() => window.dock.snapshot())).extensions.find(
            (e) => e.id === 'appdock.default-shell',
          )?.version,
          sha256: portable ? hash(portable) : null,
          checks,
          observations,
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
        { error: String(error.stack ?? error), checks, observations, errors },
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
})().then(() => console.log(JSON.stringify({ profile, checks, observations, errors }, null, 2)));
