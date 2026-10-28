const fs = require('node:fs'),
  path = require('node:path'),
  zlib = require('node:zlib'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { freePort } = require('./electron-main-helper.cjs');
const { waitForHost } = require('./settings-host-helper.cjs');
const { ribbonPage } = require('./shell-overlay-helper.cjs');
const { copyHost } = require('./copy-host.cjs');
const root = path.resolve(__dirname, '..'),
  source = process.argv[2] && path.resolve(process.argv[2]);
const profile = path.join(root, '.artifacts', 'lazy-images-ui-' + Date.now());
const images = path.join(profile, 'data/assets/images');
fs.mkdirSync(images, { recursive: true });
function png(width, height) {
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
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * (width * 4 + 1) + 1 + x * 4;
      rows[i] = 30;
      rows[i + 1] = 130;
      rows[i + 2] = 190;
      rows[i + 3] = 255;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
fs.writeFileSync(path.join(images, 'a-visible.png'), png(32, 24));
fs.writeFileSync(path.join(images, 'b-collapsed.png'), png(32, 24));
for (let i = 0; i < 100; i++)
  fs.writeFileSync(path.join(images, `z-unused-${String(i).padStart(3, '0')}.png`), png(32, 24));
// An unused WebP must not create the offscreen decoder at startup, even if unreadable.
fs.writeFileSync(path.join(images, 'zz-unused.webp'), Buffer.from('RIFFunusedWEBP'));
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, {
  closeToTray: false,
  startMinimized: false,
  hardwareAcceleration: false,
  soundEnabled: false,
});
settings.globalShortcutCommands = [];
settings.keybindings = [];
settings.gestures.enabled = false;
settings.touchpadGestures.enabled = false;
settings.keybindingDefaultsInitialized = ['appdock.default-shell'];
settings.gestureDefaultsInitialized = ['appdock.default-shell'];
Object.assign(settings.updates, {
  checkHostOnStartup: false,
  checkHostOnAboutOpen: false,
  checkAppletsOnStartup: false,
});
settings.ribbon.order = ['button:visible', 'group:deferred', 'image-library', 'settings'];
settings.ribbon.buttons = [
  {
    id: 'button:visible',
    title: 'Visible image',
    icon: 'folder',
    commandId: 'appdock.noop',
    image: { file: 'a-visible.png' },
  },
  {
    id: 'button:deferred',
    title: 'Deferred image',
    icon: 'folder',
    commandId: 'appdock.noop',
    image: { file: 'b-collapsed.png' },
  },
];
settings.ribbon.groups = [
  {
    id: 'group:deferred',
    title: 'Deferred group',
    icon: 'folder',
    expansion: 'persistent',
    children: ['button:deferred'],
  },
];
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const exe = source ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (source) copyHost(source, exe);
const until = async (fn, label) => {
  const end = Date.now() + 60000;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  throw Error(label + (last ? ': ' + last : ''));
};
let child, browser, host;
const result = { success: false, profile, mode: source ? 'fixed' : 'source', checks: [] };
(async () => {
  try {
    const port = await freePort(),
      env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(
      exe,
      [
        ...(source ? [] : [root]),
        `--test-profile=${profile}`,
        `--test-local-state=${path.join(profile, 'local')}`,
        `--remote-debugging-port=${port}`,
      ],
      { cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    child.stderr.on('data', (data) => fs.appendFileSync(path.join(profile, 'process.log'), data));
    browser = await until(
      () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
      'CDP',
    );
    host = await until(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().startsWith('appdock://host/')),
      'host',
    );
    await waitForHost(
      host,
      async () => !!window.dock && (await window.dock.snapshot()).startupReady,
    );
    const snapshot = () => host.evaluate(() => window.dock.imageLibrary.snapshot());
    await until(
      async () =>
        (await snapshot()).images.find((e) => e.ref.file === 'a-visible.png')?.width === 32,
      'visible ribbon image',
    );
    const startup = await snapshot();
    assert.equal(startup.images.length, 103);
    assert.equal(startup.images.filter((e) => e.width > 0).length, 1);
    assert.equal(startup.images.find((e) => e.ref.file === 'b-collapsed.png').width, 0);
    assert.equal(startup.images.find((e) => e.ref.file === 'zz-unused.webp').available, true);
    assert.equal(
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .some((p) => p.url().startsWith('data:')),
      false,
    );
    result.checks.push(
      '103 files indexed; only the visible ribbon image decoded; closed group and unused WebP remain unloaded',
    );
    const rail = await ribbonPage(host);
    await rail.locator('[data-ribbon-id="group:deferred"]').click();
    await until(
      async () =>
        (await snapshot()).images.find((e) => e.ref.file === 'b-collapsed.png')?.width === 32,
      'expanded group image',
    );
    assert.equal((await snapshot()).images.filter((e) => e.width > 0).length, 2);
    result.checks.push('opening the group loads its image without loading unrelated files');
    await host.evaluate(() => window.dock.executeCommand('appdock.image-library.open'));
    await until(
      async () => (await snapshot()).images.filter((e) => e.width > 0).length > 2,
      'visible gallery cards',
    );
    const gallery = await snapshot();
    assert(gallery.images.filter((e) => e.width > 0).length < 103);
    const target = gallery.images.find((e) => e.ref.file === 'z-unused-099.png');
    assert.equal(target.width, 0);
    const content = await host.evaluate(
      ({ ref, generation }) => window.dock.imageLibrary.galleryImage(ref, generation, 512),
      { ref: target.ref, generation: target.generation },
    );
    assert(content.startsWith('data:image/png;base64,'));
    assert.equal((await snapshot()).images.find((e) => e.ref.file === target.ref.file).width, 32);
    result.checks.push(
      'gallery loads visible cards and requested derivatives while unrequested files stay undecoded',
    );
    const webp = await host.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      canvas.getContext('2d').fillRect(0, 0, 16, 16);
      return canvas.toDataURL('image/webp');
    });
    fs.writeFileSync(
      path.join(images, 'zz-unused.webp'),
      Buffer.from(webp.split(',')[1], 'base64'),
    );
    const webpResult = await host.evaluate(() =>
      window.dock.imageLibrary.preview({ file: 'zz-unused.webp' }),
    );
    assert(webpResult.startsWith('data:image/png;base64,'));
    assert.equal((await snapshot()).images.find((e) => e.ref.file === 'zz-unused.webp').width, 16);
    result.checks.push('WebP decoder is created only for an explicit image request');
    fs.writeFileSync(path.join(images, 'a-visible.png'), png(48, 24));
    await until(
      async () =>
        (await snapshot()).images.find((e) => e.ref.file === 'a-visible.png')?.width === 48,
      'replacement image',
    );
    await host.screenshot({ path: path.join(profile, 'gallery.png') });
    result.checks.push('visible replacement updates the file generation and display metadata');
    result.success = true;
  } catch (error) {
    result.error = String(error.stack || error);
    process.exitCode = 1;
  } finally {
    if (host) await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (child?.exitCode === null)
      await until(() => child.exitCode !== null, 'shutdown').catch(() => child.kill());
    await browser?.close().catch(() => {});
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})();
