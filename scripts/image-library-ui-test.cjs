const { _electron: electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path'),
  zlib = require('node:zlib'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { ribbonPage } = require('./shell-overlay-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const root = path.resolve(__dirname, '..'),
  portable =
    process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : null;
const fixtureRoot = path.join(root, '.artifacts', 'image-library-fixtures');
const profile = path.join(root, '.artifacts', `image-library-ui-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const checks = [],
  errors = [];
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function png(width, height, seed = 1) {
  const crc = (buffer) => {
    let n = 0xffffffff;
    for (const b of buffer) {
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
      rows[i] = (x + seed * 31) % 256;
      rows[i + 1] = (y * 2 + seed * 17) % 256;
      rows[i + 2] = 120;
      rows[i + 3] = 255;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const sample = path.join(profile, 'sample.png'),
  second = path.join(profile, 'second.png');
fs.writeFileSync(sample, png(160, 90));
fs.writeFileSync(second, png(64, 128, 2));
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.closeToTray = false;
settings.globalShortcutCommands = [];
settings.ribbon.order = ['group:photos', 'button:logs', 'settings'];
settings.ribbon.groups = [
  {
    id: 'group:photos',
    title: 'Fixture group',
    icon: 'folder',
    expansion: 'persistent',
    children: ['home'],
  },
];
settings.ribbon.buttons = [
  { id: 'button:logs', title: 'Fixture logs', icon: 'folder', commandId: 'appdock.logs.open' },
];
const profileSource = path.resolve(root, '../Applet.Profile.at365');
function install(id, source) {
  const destination = path.join(profile, 'extensions', id);
  fs.cpSync(source, destination, { recursive: true });
  return destination;
}
const pdir = path.join(profile, 'extensions', 'at365.profile');
fs.mkdirSync(pdir, { recursive: true });
for (const file of ['extension.json', 'index.cjs'])
  fs.copyFileSync(path.join(profileSource, file), path.join(pdir, file));
settings.extensions['at365.profile'] = { enabled: true, settings: { name: 'Profile fixture' } };
install(
  'at365.web-applet',
  path.resolve(root, '../../40.ARTIFACT/Applet.WebApplet.at365/extensions/at365.web-applet'),
);
settings.extensions['at365.web-applet'] = {
  enabled: true,
  settings: {
    items: [
      {
        id: 'site.fixture',
        name: 'Fixture site',
        url: 'https://example.com/',
        enabled: true,
        display: 'page',
        navigation: 'same-origin',
        allowedOrigins: [],
        accountId: 'account.11111111-1111-4111-8111-111111111111',
        icon: 'data:image/png;base64,' + png(32, 32).toString('base64'),
      },
    ],
    shortcutDefaults: [],
  },
};
const accounts = path.join(profile, 'data/web-profiles/at365.web-applet');
fs.mkdirSync(accounts, { recursive: true });
fs.writeFileSync(
  path.join(accounts, 'accounts.json'),
  JSON.stringify({
    schemaVersion: 1,
    accounts: [{ id: 'account.11111111-1111-4111-8111-111111111111', name: 'Fixture' }],
  }),
);
function probe(id, runtime, entry, type, source) {
  const directory = path.join(profile, 'extensions', id);
  fs.mkdirSync(directory, { recursive: true });
  if (source) fs.cpSync(source, directory, { recursive: true });
  const marker = path.join(profile, `${id}.json`);
  fs.writeFileSync(
    path.join(directory, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name: id,
      version: '0.1.0',
      minimumHostVersion: '0.69.0',
      runtime,
      entry,
      ...(type ? { type } : {}),
      capabilities: ['settings', 'registered-images'],
      settings: [
        { key: 'source', title: 'Source', type: 'string' },
        { key: 'marker', title: 'Marker', type: 'string' },
        { key: 'image', title: 'Image', type: 'registered-image', default: null },
      ],
    }),
  );
  settings.extensions[id] = { enabled: true, settings: { source: sample, marker } };
  return { directory, marker };
}
const node = probe('fixture.images-node', 'node', 'index.cjs');
fs.writeFileSync(
  path.join(node.directory, 'index.cjs'),
  `exports.activate=async c=>{const fs=require('node:fs'),crypto=require('node:crypto');const bytes=fs.readFileSync(c.settings.get('source',''));const image=await c.registeredImages.import({filename:'node-original.png',base64:bytes.toString('base64')});await c.registeredImages.import({filename:'unselected.png',base64:bytes.toString('base64')});await c.settings.set('image',image);const file=await c.registeredImages.copyToCache(image);let rejected=false;try{await c.registeredImages.copyToCache({file:'unselected.png'});}catch{rejected=true;}fs.writeFileSync(c.settings.get('marker',''),JSON.stringify({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),rejected}));};`,
);
const dotnet = probe(
  'fixture.images-dotnet',
  'dotnet',
  'AppDock.RegisteredImages.dll',
  'AppDock.RegisteredImages.Probe',
  path.join(fixtureRoot, 'dotnet-fixture'),
);
const nativeApplets = [
  ['Watch', 'at365.watch', { visible: false }],
  ['WindowsTools', 'at365.windows-tools', { autoLockEnabled: false }],
  ['WallpaperSlideshow', 'at365.wallpaper-slideshow', { paused: true, monitors: [] }],
];
for (const [name, id, values] of nativeApplets) {
  const directory = install(id, path.join(fixtureRoot, `native-${name}`));
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, `../Applet.${name}.at365/extension.json`)),
  );
  delete manifest.defaultKeybindings;
  manifest.startupDelaySeconds = 0;
  fs.writeFileSync(path.join(directory, 'extension.json'), JSON.stringify(manifest));
  settings.extensions[id] = { enabled: true, startupDelaySeconds: 0, settings: values };
}
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));

const exe = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) {
  fs.copyFileSync(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
let app, host, rail, libraryPage, libraryNavigation;
let nativePayload;
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
    await new Promise((r) => setTimeout(r, 80));
  }
  throw Error(label + (last ? ': ' + last : ''));
};
const snapshot = () => host.evaluate(() => window.dock.snapshot());
const imageSnapshot = () => host.evaluate(() => window.dock.imageLibrary.snapshot());
async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (!portable)
    app = await electron.launch({
      executablePath: exe,
      args: [root, `--test-profile=${profile}`],
      env,
    });
  else {
    const debug = await freePort(),
      inspector = await freePort();
    const child = spawn(
      exe,
      [
        `--test-profile=${profile}`,
        `--remote-debugging-port=${debug}`,
        `--inspect=127.0.0.1:${inspector}`,
      ],
      { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
    );
    const browser = await until(
      () => chromium.connectOverCDP(`http://127.0.0.1:${debug}`, { timeout: 1000 }),
      'portable CDP',
    );
    const context = browser.contexts()[0];
    app = {
      context: () => context,
      firstWindow: () =>
        until(
          () => context.pages().find((p) => p.url().startsWith('appdock://host/index.html')),
          'host',
        ),
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
  host = await until(
    () =>
      app
        .context()
        .pages()
        .find((page) => page.url().startsWith('appdock://host/index.html')),
    'host',
  );
  host.setDefaultTimeout(15000);
  host.on('pageerror', (e) => errors.push(String(e)));
  app.context().on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock:'),
    );
    w.setSize(1120, 850);
    w.show();
    w.focus();
  });
  rail = await ribbonPage(host);
  await until(async () => (await snapshot()).startupReady, 'startup');
}
async function openLibrary() {
  await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  await settingsPage(host);
  await host
    .locator('.settings-categories')
    .getByRole('button', { name: '画像ライブラリー', exact: true })
    .click();
  libraryNavigation = await host.evaluate(async () => {
    const surface = document.querySelector('.settings-surface[data-settings-connection]');
    return (await window.dock.settingsPage.get(surface.dataset.settingsConnection)).content
      .navigation;
  });
  await host.getByRole('button', { name: '画像ライブラリーを開く', exact: true }).click();
  libraryPage = await until(
    () =>
      app
        .context()
        .pages()
        .find((p) => p.url().endsWith('/image-library.html')),
    'image library page',
  );
  await libraryPage.getByRole('button', { name: 'グループを追加', exact: true }).waitFor();
}
const card = (scope, file) => scope.locator('.image-library-card').filter({ hasText: file });
const libraryCard = (file) => libraryPage.locator('.ad-gallery-card').filter({ hasText: file });
const ok = (dialog) => dialog.getByRole('button', { name: 'OK', exact: true }).click();
async function addGroup(name) {
  await libraryPage.getByRole('button', { name: 'グループを追加', exact: true }).click();
  const d = host.getByRole('dialog', { name: '画像グループを追加', exact: true });
  await d.getByLabel('画像グループ名').fill(name);
  await d.getByLabel('画像グループ名').press('Tab');
  await d.getByRole('button', { name: '追加', exact: true }).click();
  await until(
    async () => (await imageSnapshot()).groups.some((g) => g.name === name),
    'group saved',
  );
}
async function chooseInPicker(file) {
  const d = host.getByRole('dialog', { name: '画像を選択', exact: true });
  await card(d, file).click();
  await d.getByRole('button', { name: '画像を使う', exact: true }).click();
}
(async () => {
  try {
    await launch();
    console.log('GUI started: ' + profile);
    if (portable) {
      nativePayload = await app.evaluate(() => {
        const fs = process.getBuiltinModule('fs'),
          path = process.getBuiltinModule('path'),
          crypto = process.getBuiltinModule('crypto');
        const hash = (file) =>
          crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(process.resourcesPath, file)))
            .digest('hex');
        return {
          sdk: hash('dotnet-host/AppDock.SDK.dll'),
          runtime: hash('dotnet-host/AppDock.Runtime.dll'),
          shell: JSON.parse(
            fs.readFileSync(path.join(process.resourcesPath, 'shells/default/extension.json')),
          ).version,
        };
      });
      assert.equal(nativePayload.shell, (await snapshot()).version);
    }
    for (const [name, id] of nativeApplets) {
      await until(
        async () => (await snapshot()).extensions.find((e) => e.id === id)?.state === 'running',
        name + ' connected',
      );
      assert(
        (await snapshot()).extensions.find((e) => e.id === id).panel,
        name + ' panel displayed',
      );
      const changes =
        id === 'at365.watch'
          ? { showSeconds: false }
          : id === 'at365.windows-tools'
            ? { displayOffSeconds: 7 }
            : { intervalSeconds: 91 };
      await host.evaluate(
        async ({ id, changes }) => {
          const s = await window.dock.snapshot();
          Object.assign(s.settings.value.extensions[id].settings, changes);
          await window.dock.saveSettings(s.settings.value, s.settings.revision);
        },
        { id, changes },
      );
      const saved = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).extensions[id]
        .settings;
      for (const [key, value] of Object.entries(changes)) assert.deepEqual(saved[key], value);
      await host.evaluate((id) => window.dock.toggleExtension(id, false), id);
      await until(
        async () => (await snapshot()).extensions.find((e) => e.id === id)?.state === 'stopped',
        name + ' stopped',
      );
    }
    checks.push(
      'three existing .NET/native Applets connect, display panels, save settings and stop with the new SDK/Runtime',
    );
    await until(
      () => fs.existsSync(node.marker) && fs.existsSync(dotnet.marker),
      'Node and .NET image APIs',
    );
    for (const probe of [node, dotnet]) {
      const result = JSON.parse(fs.readFileSync(probe.marker));
      assert.equal(result.sha256.toLowerCase(), hash(sample));
      assert.equal(result.rejected, true);
      assert(result.file.includes(path.join('cache', 'panel-images')));
    }
    for (const id of ['fixture.images-node', 'fixture.images-dotnet']) {
      const generated = JSON.parse(fs.readFileSync(path.join(profile, `${id}.json`))).file;
      await host.evaluate((id) => window.dock.toggleExtension(id, false), id);
      await until(() => !fs.existsSync(generated), 'stopped image cache released');
    }
    checks.push('Node/.NET import, selected original copy and rejection of unselected images');
    const jpeg = path.join(profile, 'format-original.jpeg');
    const webp = path.join(profile, 'format-original.webp');
    const jpegBytes = await app.evaluate(
      ({ nativeImage }, source) => Array.from(nativeImage.createFromPath(source).toJPEG(85)),
      sample,
    );
    const webpUrl = await host.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const context = canvas.getContext('2d');
      context.fillStyle = '#10ab65';
      context.fillRect(0, 0, 16, 16);
      return canvas.toDataURL('image/webp', 0.85);
    });
    assert(webpUrl.startsWith('data:image/webp;base64,'));
    fs.writeFileSync(jpeg, Buffer.from(jpegBytes));
    fs.writeFileSync(webp, Buffer.from(webpUrl.split(',')[1], 'base64'));
    const files = [sample, second, jpeg, webp];
    await app.evaluate(({ dialog }, files) => {
      global.__imageLibraryFiles = files;
      dialog.showOpenDialog = async () => ({
        canceled: !global.__imageLibraryFiles.length,
        filePaths: global.__imageLibraryFiles.length ? [global.__imageLibraryFiles.shift()] : [],
      });
    }, files);
    await openLibrary();
    console.log('Library opened');
    const navigation = libraryNavigation;
    assert.equal(
      navigation.some((page) => page.id === 'profile'),
      false,
    );
    assert(navigation.some((page) => page.id === 'applet:at365.profile'));
    await libraryPage.getByRole('button', { name: '画像を追加', exact: true }).click();
    await libraryCard('sample.png').waitFor();
    await libraryPage.getByRole('button', { name: '画像を追加', exact: true }).click();
    await libraryCard('second.png').waitFor();
    for (const file of [jpeg, webp]) {
      await libraryPage.getByRole('button', { name: '画像を追加', exact: true }).click();
      await libraryCard(path.basename(file)).waitFor();
      assert.equal(hash(path.join(profile, 'data/assets/images', path.basename(file))), hash(file));
    }
    checks.push('real PNG/JPEG/WebP decoders accept the original files without replacing bytes');
    assert.equal(hash(path.join(profile, 'data/assets/images/sample.png')), hash(sample));
    await addGroup('アイコン');
    await addGroup('背景');
    await libraryPage
      .locator('.library-sidebar nav')
      .first()
      .getByRole('button', { name: /すべて/ })
      .click();
    await libraryCard('sample.png').getByRole('button', { name: 'グループ', exact: true }).click();
    let d = host.getByRole('dialog', { name: '所属グループを編集', exact: true });
    await d.getByLabel('アイコン', { exact: true }).check();
    await d.getByLabel('背景', { exact: true }).check();
    await d.getByRole('button', { name: '適用', exact: true }).click();
    await until(
      async () =>
        (await imageSnapshot()).groups.every((g) => g.images.some((i) => i.file === 'sample.png')),
      'multiple memberships',
    );
    let groups = (await imageSnapshot()).groups;
    await libraryPage.getByRole('button', { name: `${groups[0].name}の操作`, exact: true }).click();
    await libraryPage.getByRole('button', { name: '名前を変更', exact: true }).click();
    d = host.getByRole('dialog', { name: '画像グループの名前を変更', exact: true });
    await d.getByLabel('画像グループ名').fill('ボタン');
    await d.getByLabel('画像グループ名').press('Tab');
    await d.getByRole('button', { name: '適用', exact: true }).click();
    await until(async () => (await imageSnapshot()).groups[0].name === 'ボタン', 'rename');
    await libraryPage.getByRole('button', { name: 'ボタンの操作', exact: true }).click();
    await libraryPage.getByRole('button', { name: 'グループを削除', exact: true }).click();
    d = host.getByRole('dialog', { name: '画像グループを削除', exact: true });
    await d.getByRole('button', { name: '削除', exact: true }).click();
    await until(async () => (await imageSnapshot()).groups.length === 1, 'delete group');
    assert.equal(hash(path.join(profile, 'data/assets/images/sample.png')), hash(sample));
    checks.push(
      'library registration, multiple groups, rename/delete preserve originals and references',
    );
    await libraryPage.screenshot({ path: path.join(profile, 'library.png') });
    await rail.locator('[data-ribbon-id="applet:at365.profile:main"]').click();
    await settingsPage(host);
    await host.getByLabel('ユーザー名', { exact: true }).fill('Hidden profile name');
    await host.getByLabel('ユーザー名', { exact: true }).press('Tab');
    await until(
      async () =>
        (await snapshot()).settings.value.extensions['at365.profile'].settings.name ===
        'Hidden profile name',
      'profile name',
    );
    await host.getByRole('button', { name: 'アバター画像を選択', exact: true }).click();
    await chooseInPicker('sample.png');
    await until(
      async () =>
        (await snapshot()).settings.value.extensions['at365.profile'].settings.avatar?.file ===
        'sample.png',
      'profile avatar',
    );
    const pbutton = rail.locator('[data-ribbon-id="applet:at365.profile:main"]');
    await pbutton.locator('img').waitFor();
    assert.equal(await pbutton.getAttribute('title'), 'プロフィール');
    assert.equal(await pbutton.locator('.rail-label').count(), 0);
    assert(!(await rail.locator('body').innerText()).includes('Hidden profile name'));
    await host.screenshot({ path: path.join(profile, 'profile.png') });
    await rail.screenshot({ path: path.join(profile, 'profile-ribbon.png') });
    const original = path.join(profile, 'data/assets/images/sample.png'),
      delayed = original + '.partial';
    fs.renameSync(original, delayed);
    await until(
      async () =>
        (await imageSnapshot()).images.find((i) => i.ref.file === 'sample.png')?.available ===
        false,
      'missing original',
    );
    assert.equal(await pbutton.locator('img').count(), 1);
    fs.renameSync(delayed, original);
    await until(
      async () =>
        (await imageSnapshot()).images.find((i) => i.ref.file === 'sample.png')?.available === true,
      'late original recovered',
    );
    checks.push('profile settings belong to Applet; image-only ribbon has fixed accessible label');
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await host
      .locator('.settings-categories')
      .getByRole('button', { name: 'リボン', exact: true })
      .click();
    for (const [title, kind, label, file] of [
      ['Fixture group', 'リボングループを編集', 'グループのアイコンの画像を選択', 'sample.png'],
      ['Fixture logs', 'コマンドボタンを編集', 'ボタンのアイコンの画像を選択', 'second.png'],
    ]) {
      await host.getByRole('button', { name: `${title}を編集`, exact: true }).click();
      d = host.getByRole('dialog', { name: kind, exact: true });
      await d
        .locator('.ribbon-icon-modes label')
        .filter({ hasText: /^画像$/ })
        .click();
      await d.getByRole('button', { name: label, exact: true }).click();
      await chooseInPicker(file);
      await d.getByRole('button', { name: '適用', exact: true }).click();
      await d.waitFor({ state: 'hidden' });
    }
    assert.deepEqual((await snapshot()).settings.value.ribbon.groups[0].image, {
      file: 'sample.png',
    });
    assert.deepEqual((await snapshot()).settings.value.ribbon.buttons[0].image, {
      file: 'second.png',
    });
    await rail.locator('[data-ribbon-id="group:photos"] img').waitFor();
    await rail.locator('[data-ribbon-id="button:logs"] img').waitFor();
    checks.push('group and command buttons share library image rendering');
    await rail.locator('[data-ribbon-id="page:at365.web-applet:manage"]').click();
    const web = await until(
      () =>
        app
          .context()
          .pages()
          .find((p) => p.url().includes('/at365.web-applet/web/index.html')),
      'WebApplet manager',
    );
    await web.getByRole('button', { name: 'Fixture siteを編集', exact: true }).click();
    const identity = await web.evaluate(() => {
      window.__pickerIdentity = crypto.randomUUID();
      return window.__pickerIdentity;
    });
    const viewState = () =>
      app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().startsWith('appdock:'),
        );
        const view = window.contentView.children.find((v) =>
          v.children?.some((c) =>
            c.webContents?.getURL().includes('/at365.web-applet/web/index.html'),
          ),
        );
        return view
          ? {
              visible: view.getVisible(),
              id: view.children.find((c) => c.webContents).webContents.id,
            }
          : null;
      });
    const beforeView = await viewState();
    assert.equal(beforeView.visible, true);
    await web.locator('#icon').click();
    await host.getByRole('dialog', { name: '画像を選択', exact: true }).waitFor();
    assert.equal((await viewState()).visible, false);
    await host.screenshot({ path: path.join(profile, 'web-image-picker.png') });
    await chooseInPicker('sample.png');
    await until(async () => (await viewState()).visible, 'Web view restored');
    assert.equal((await viewState()).id, beforeView.id);
    assert.equal(await web.evaluate(() => window.__pickerIdentity), identity);
    await web.locator('#save').click();
    await until(
      async () =>
        (await snapshot()).settings.value.extensions['at365.web-applet'].settings.items[0].image
          ?.file === 'sample.png',
      'Web image saved',
    );
    const row = (await snapshot()).settings.value.extensions['at365.web-applet'].settings.items[0];
    assert(row.icon.startsWith('data:image/png;base64,'));
    const child = (await snapshot()).extensions.find(
      (e) => e.collection?.itemId === 'site.fixture',
    );
    await rail.locator(`[data-ribbon-id="page:${child.id}:main"] img`).waitFor();
    checks.push(
      'WebApplet host picker covers/restores existing local View and preserves legacy icon',
    );
    for (const theme of ['dark', 'light']) {
      await host.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
      }, theme);
      await openLibrary();
      await libraryPage.screenshot({ path: path.join(profile, `${theme}-library.png`) });
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('appdock:'))
        .setSize(820, 760),
    );
    await libraryPage.screenshot({ path: path.join(profile, 'narrow-library.png') });
    const before = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')));
    await app.close();
    app = null;
    await launch();
    const after = (await snapshot()).settings.value;
    assert.deepEqual(
      after.extensions['at365.profile'].settings,
      before.extensions['at365.profile'].settings,
    );
    assert.deepEqual(after.imageLibrary, before.imageLibrary);
    await rail.locator('[data-ribbon-id="applet:at365.profile:main"] img').waitFor();
    assert(
      (await imageSnapshot()).images.some(
        (image) => image.ref.file === 'format-original.webp' && image.available,
      ),
    );
    await until(
      () =>
        app.evaluate(
          ({ BrowserWindow }) =>
            !BrowserWindow.getAllWindows().some((window) =>
              window.webContents.getURL().startsWith('data:text/html'),
            ),
        ),
      'image decoder retired after restart',
    );
    checks.push(
      'dark/light, narrow layout and real process restart retain groups and Applet image references',
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
          nativePayload,
          checks,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ passed: true, profile, checks }, null, 2));
  } catch (error) {
    fs.writeFileSync(
      path.join(profile, 'failure.json'),
      JSON.stringify({ error: String(error.stack ?? error), checks, errors }, null, 2),
    );
    await host?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    console.error(error);
    process.exitCode = 1;
  } finally {
    await app?.close().catch(() => {});
  }
})();
