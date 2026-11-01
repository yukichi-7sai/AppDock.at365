const { _electron: electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { ribbonPage } = require('./shell-overlay-helper.cjs');
const root = path.resolve(__dirname, '..'),
  portable = process.argv[2] ? path.resolve(process.argv[2]) : null;
const profile = path.join(root, '.artifacts', 'image-folders-svg-ui-' + Date.now());
const directory = path.join(profile, 'data/assets/images');
fs.mkdirSync(path.join(directory, '素材/空'), { recursive: true });
const original = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12 12 3 21 12 12 21Z"/></svg>',
);
fs.writeFileSync(path.join(directory, '素材/heart.svg'), original);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.closeToTray = false;
settings.host.soundEnabled = false;
settings.globalShortcutCommands = [];
settings.imageLibrary = {
  groups: [{ id: 'icons', name: 'アイコン', images: [{ file: '素材/heart.svg' }] }],
};
settings.ribbon.order = ['group:icons', 'settings'];
settings.ribbon.bottom = ['theme', 'notifications'];
settings.ribbon.groups = [
  {
    id: 'group:icons',
    title: 'SVG fixture',
    icon: 'folder',
    expansion: 'persistent',
    children: ['logs'],
  },
];
fs.writeFileSync(
  require('./test-settings.cjs').file(profile, 'settings.json'),
  JSON.stringify(settings),
);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const exe = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) {
  require('./copy-host.cjs').copyHost(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
const checks = [],
  errors = [],
  colors = [];
let app, host, child;
const until = async (fn, label, timeout = 60000) => {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  throw Error(label + (last ? ': ' + last : ''));
};
async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (!portable) {
    app = await electron.launch({
      executablePath: exe,
      args: [root, '--test-profile=' + profile],
      env,
    });
    for (const stream of [app.process().stdout, app.process().stderr])
      stream?.on('data', (chunk) => fs.appendFileSync(path.join(profile, 'electron.log'), chunk));
  } else {
    const port = await freePort(),
      inspector = await freePort();
    child = spawn(
      exe,
      [
        '--test-profile=' + profile,
        '--remote-debugging-port=' + port,
        '--inspect=127.0.0.1:' + inspector,
      ],
      { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
    );
    const browser = await until(
      () => chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 }),
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
  app.context().on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));
  host = await until(
    () =>
      app
        .context()
        .pages()
        .find((p) => p.url().startsWith('appdock://host/index.html')),
    'host',
  );
  host.setDefaultTimeout(20000);
  await until(async () => (await snapshot()).startupReady, 'startup');
  await resize(1360, 950);
}
const snapshot = () => host.evaluate(() => window.dock.snapshot());
const library = () => host.evaluate(() => window.dock.imageLibrary.snapshot());
const model = () => host.evaluate(() => window.dock.pages.get());
const resize = (width, height) =>
  app.evaluate(
    ({ BrowserWindow }, { width, height }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock:'),
      );
      w.setSize(width, height);
      w.show();
      w.focus();
    },
    { width, height },
  );
const open = async () => {
  await host.evaluate(() => window.dock.executeCommand('appdock.image-library.open'));
  await host.getByTestId('library-folder').waitFor();
};
const card = (scope, name) => scope.locator('.ad-gallery-card').filter({ hasText: name });
async function folderDialog(button, input) {
  await host.getByRole('button', { name: button, exact: true }).click();
  const dialog = host.getByRole('dialog', { name: button, exact: true });
  if (input !== undefined) await dialog.getByLabel('フォルダーのパス').fill(input);
  return dialog;
}
async function choose(cancel) {
  await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  await host
    .locator('.settings-categories')
    .getByRole('button', { name: 'リボン', exact: true })
    .click();
  await host.getByRole('button', { name: 'SVG fixtureを編集', exact: true }).click();
  const parent = host.getByRole('dialog', { name: 'リボングループを編集', exact: true });
  await parent
    .locator('.ribbon-icon-modes label')
    .filter({ hasText: /^画像$/ })
    .click();
  await parent.getByRole('button', { name: /グループのアイコンの画像を(選択|変更)/ }).click();
  const picker = host.getByRole('dialog', { name: '画像を選択', exact: true });
  await picker.getByLabel('フォルダー', { exact: true }).selectOption('エクスプローラー');
  await card(picker, 'heart.svg').locator('.ad-gallery-image').click();
  await picker.getByRole('button', { name: '画像を使う', exact: true }).click();
  await picker.waitFor({ state: 'hidden' });
  await parent.getByRole('button', { name: cancel ? 'キャンセル' : '適用', exact: true }).click();
  await parent.waitFor({ state: 'hidden' });
}
(async () => {
  try {
    await launch();
    await open();
    assert((await library()).folders.includes('素材/空'));
    await until(async () => await card(host, 'heart.svg').locator('img').count(), 'SVG thumbnail');
    const preview = await host.evaluate(async () => {
      const id = await window.dock.imageLibrary.createImageSession();
      try {
        return await window.dock.imageLibrary.preview({ file: '素材/heart.svg' }, true, id);
      } finally {
        await window.dock.imageLibrary.releaseImageSession(id);
      }
    });
    assert(preview.startsWith('data:image/png;base64,'));
    checks.push('nested Explorer files and original SVG preview render through PNG');
    let d = await folderDialog('フォルダーを作成', '移動先');
    await d.getByRole('button', { name: '適用', exact: true }).click();
    await d.waitFor({ state: 'hidden' });
    await host.getByTestId('library-folder').selectOption('*');
    await card(host, 'heart.svg').getByRole('checkbox').check();
    d = await folderDialog('選択画像を移動');
    await d.getByLabel('保存先').selectOption('移動先');
    await d.getByRole('button', { name: '適用', exact: true }).click();
    await d.waitFor({ state: 'hidden' });
    assert(fs.existsSync(path.join(directory, '移動先/heart.svg')));
    await until(
      async () => (await library()).groups[0].images[0].file === '移動先/heart.svg',
      'group move',
    );
    fs.renameSync(path.join(directory, '移動先'), path.join(directory, 'エクスプローラー'));
    await until(
      async () => (await library()).groups[0].images[0].file === 'エクスプローラー/heart.svg',
      'external folder move',
    );
    await host.getByTestId('library-folder').selectOption('素材/空');
    d = await folderDialog('フォルダー名・場所を変更', '素材/空の変更');
    await d.getByRole('button', { name: '適用', exact: true }).click();
    await d.waitFor({ state: 'hidden' });
    d = await folderDialog('空のフォルダーを削除');
    await d.getByRole('button', { name: '適用', exact: true }).click();
    await d.waitFor({ state: 'hidden' });
    assert(!fs.existsSync(path.join(directory, '素材/空の変更')));
    checks.push(
      'create, move, rename and empty-delete update disk; unique group membership follows external move',
    );
    await choose(true);
    assert.equal((await snapshot()).settings.value.ribbon.groups[0].image ?? null, null);
    await choose(false);
    const selected = (await snapshot()).settings.value.ribbon.groups[0].image;
    assert.match(selected.file, /^@assigned\/[a-f0-9]{64}\.svg$/);
    const stored = path.join(profile, 'data/assets/assigned-images', selected.file.split('/')[1]);
    assert.deepEqual(fs.readFileSync(stored), original);
    fs.writeFileSync(
      path.join(directory, 'エクスプローラー/heart.svg'),
      original.toString().replace('21 12', '18 12'),
    );
    await open();
    await until(
      async () => (await library()).images.some((e) => e.ref.file === 'エクスプローラー/heart.svg'),
      'content changed',
    );
    fs.renameSync(
      path.join(directory, 'エクスプローラー/heart.svg'),
      path.join(directory, 'エクスプローラー/renamed.svg'),
    );
    await until(
      async () => (await library()).images.some((e) => e.ref.file.endsWith('/renamed.svg')),
      'file rename',
    );
    fs.unlinkSync(path.join(directory, 'エクスプローラー/renamed.svg'));
    assert.deepEqual(fs.readFileSync(stored), original);
    checks.push(
      'parent cancellation leaves settings unchanged; applied copy preserves bytes after source edit, rename and deletion',
    );
    let rail = await ribbonPage(host);
    const icon = rail.locator('[data-ribbon-id="group:icons"] .ribbon-svg-icon');
    await icon.waitFor();
    for (const theme of ['dark', 'light']) {
      await host.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
      }, theme);
      await until(async () => (await model()).dark === (theme === 'dark'), 'theme');
      const color = await icon.evaluate((e) => ({
        mask: getComputedStyle(e).maskImage,
        color: getComputedStyle(e).backgroundColor,
        parent: getComputedStyle(e.parentElement).color,
      }));
      assert.equal(color.color, color.parent);
      assert(color.mask.includes('data:image/png'));
      colors.push({ theme, ...color });
      await rail.screenshot({ path: path.join(profile, theme + '-ribbon.png') });
      await host.screenshot({ path: path.join(profile, theme + '-library.png') });
    }
    assert.notEqual(colors[0].color, colors[1].color);
    await rail.locator('[data-ribbon-id="group:icons"]').click();
    assert.equal(
      await icon.evaluate((e) => getComputedStyle(e).backgroundColor),
      await icon.evaluate((e) => getComputedStyle(e.parentElement).color),
    );
    checks.push('SVG mask follows light/dark and group state using the ribbon foreground color');
    await resize(820, 760);
    const headerActions = host.locator('.library-header-actions');
    assert.equal(
      await headerActions.getByRole('button', { name: '画像を追加', exact: true }).count(),
      1,
    );
    assert.equal(
      await headerActions
        .getByRole('button', { name: 'アイコンセットを取り込む', exact: true })
        .count(),
      1,
    );
    await host.screenshot({ path: path.join(profile, 'narrow-library.png') });
    assert(
      await host.getByRole('button', { name: 'アイコンセットを取り込む', exact: true }).isVisible(),
    );
    await host.getByRole('button', { name: 'アイコンセットを取り込む', exact: true }).click();
    d = host.getByRole('dialog', { name: 'アイコンセットを取り込む', exact: true });
    assert.equal(await d.getByLabel('アイコンセット', { exact: true }).inputValue(), 'lucide');
    const started = Date.now();
    await d.getByRole('button', { name: '取り込む', exact: true }).click();
    await d.getByRole('progressbar').waitFor();
    await until(
      async () => Number(await d.getByRole('progressbar').getAttribute('value')) >= 120,
      'live progress before cancellation',
      120000,
    );
    await host.screenshot({ path: path.join(profile, 'lucide-progress.png') });
    assert(await d.getByRole('button', { name: '取り込みを取消', exact: true }).isEnabled());
    await d.getByRole('button', { name: '取り込みを取消', exact: true }).click();
    await d.waitFor({ state: 'hidden' });
    await until(
      async () => (await model()).content.message.includes('取り消しました'),
      'cancel result',
    );
    const partial = await library();
    const partialGroups = partial.groups.filter((g) => g.id.startsWith('icon-set-lucide-'));
    assert(partialGroups.length > 0);
    for (const group of partialGroups)
      for (const image of group.images) assert(fs.existsSync(path.join(directory, image.file)));
    checks.push(
      'modal shows live progress; cancellation stays responsive and retains completed images and classifications',
    );
    await app.evaluate(({ app }) => {
      const require = process
        .getBuiltinModule('module')
        .createRequire(app.getAppPath() + '/package.json');
      const { RegisteredImages } = require(
        app.getAppPath() + '/out/main/main/core/registered-images.js',
      );
      const add = RegisteredImages.prototype.addWithResult;
      RegisteredImages.prototype.addWithResult = async function (bytes, name) {
        const result = await add.call(this, bytes, name);
        if (name === 'Lucide Icon/zap.svg') {
          RegisteredImages.prototype.addWithResult = add;
          throw Error('fixture: failure after original write');
        }
        return result;
      };
    });
    await host.getByRole('button', { name: 'アイコンセットを取り込む', exact: true }).click();
    await d.getByRole('button', { name: '取り込む', exact: true }).click();
    await d.getByRole('progressbar').waitFor();
    await until(
      async () => {
        const m = await model();
        return !m.content.busy && m.content.message?.includes('追加');
      },
      'Lucide import',
      900000,
    );
    const imported = (await library()).images.filter((e) => e.ref.file.startsWith('Lucide Icon/'));
    assert(imported.length > 512);
    await d.waitFor({ state: 'hidden' });
    assert((await model()).content.message.includes('失敗 1件'));
    assert(fs.existsSync(path.join(directory, 'Lucide Icon/zap.svg')));
    assert(
      !(await library()).groups.some((group) =>
        group.images.some((image) => image.file === 'Lucide Icon/zap.svg'),
      ),
    );
    const retry = host.getByRole('button', { name: '取り込みを再試行', exact: true });
    await retry.waitFor();
    await host.screenshot({ path: path.join(profile, 'lucide-failed-retry.png') });
    await app.evaluate(({ app }) => {
      const require = process
        .getBuiltinModule('module')
        .createRequire(app.getAppPath() + '/package.json');
      const { RegisteredImages } = require(
        app.getAppPath() + '/out/main/main/core/registered-images.js',
      );
      const add = RegisteredImages.prototype.addWithResult;
      globalThis.__retryFiles = [];
      RegisteredImages.prototype.addWithResult = async function (bytes, name) {
        globalThis.__retryFiles.push(name);
        return add.call(this, bytes, name);
      };
      const fetch = globalThis.fetch;
      globalThis.__retryDownloads = 0;
      globalThis.fetch = (...args) => {
        if (
          String(args[0]).includes('registry.npmjs.org/lucide-static') ||
          String(args[0]).includes('codeload.github.com/lucide-icons/')
        )
          globalThis.__retryDownloads++;
        return fetch(...args);
      };
    });
    await retry.click();
    await until(
      async () => {
        const c = (await model()).content;
        return !c.busy && c.message.includes('失敗 0件');
      },
      'retry completion',
      120000,
    );
    await d.waitFor({ state: 'hidden' });
    const retryWork = await app.evaluate(() => ({
      files: globalThis.__retryFiles,
      downloads: globalThis.__retryDownloads,
    }));
    assert.deepEqual(retryWork.files, ['Lucide Icon/zap.svg']);
    assert.equal(retryWork.downloads, 0);
    assert((await model()).content.message.includes('登録済み 1件'));
    assert((await model()).content.message.includes('失敗 0件'));
    assert.equal(await retry.count(), 0);
    assert(
      (await library()).groups.some((group) =>
        group.images.some((image) => image.file === 'Lucide Icon/zap.svg'),
      ),
    );
    checks.push(
      'post-write import failure retries only the failed original offline and applies categories without processing successful images',
    );
    const grouped = (await library()).groups;
    const time = grouped.find((g) => g.name === 'Lucide: Time & calendar');
    assert(time);
    for (const name of ['alarm-clock', 'alarm-clock-check', 'alarm-check'])
      assert(
        time.images.some((image) => image.file === `Lucide Icon/${name}.svg`),
        name,
      );
    for (const group of grouped)
      assert.equal(
        new Set(group.images.map((image) => image.file.toLowerCase())).size,
        group.images.length,
      );
    assert(grouped.some((g) => g.id === 'icons' && g.name === 'アイコン'));
    assert(
      imported.every((image) =>
        grouped.some((group) => group.images.some((ref) => ref.file === image.ref.file)),
      ),
    );
    checks.push(
      `official categories, inherited categories and aliases: ${grouped.length - 1} groups; reimport preserves existing group and deduplicates memberships`,
    );
    checks.push(
      `official Lucide GUI import: ${imported.length} SVGs, ${Date.now() - started} ms, no failures`,
    );
    await host.screenshot({ path: path.join(profile, 'lucide-imported.png') });
    await resize(1250, 900);
    const timeButton = host
      .locator('[data-gallery-group]')
      .filter({ hasText: 'Lucide: Time & calendar' });
    await timeButton.click();
    await until(
      async () => (await model()).content.total === time.images.length,
      'category filter',
    );
    await until(
      async () =>
        card(host, 'Lucide Icon/alarm-check.svg')
          .locator('img')
          .evaluateAll((images) =>
            images.some((image) => image.complete && image.naturalWidth > 0),
          ),
      'category thumbnail',
    );
    await host.screenshot({ path: path.join(profile, 'lucide-category.png') });
    checks.push(
      'import button is beside image-add; automatic category filters work at wide and narrow widths',
    );
    await app.close();
    app = null;
    await launch();
    assert.deepEqual((await snapshot()).settings.value.ribbon.groups[0].image, selected);
    rail = await ribbonPage(host);
    await rail.locator('[data-ribbon-id="group:icons"] .ribbon-svg-icon').waitFor();
    assert.deepEqual(fs.readFileSync(stored), original);
    assert.deepEqual((await library()).groups, grouped);
    checks.push('isolated restart restores assigned SVG independently of original files');
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
          colors,
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
    await host?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    console.error(error);
    process.exitCode = 1;
  } finally {
    await app?.close().catch(() => {});
  }
})().then(() => console.log(JSON.stringify({ profile, checks, errors }, null, 2)));
