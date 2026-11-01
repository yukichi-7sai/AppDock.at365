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
const profile = path.join(root, '.artifacts', 'image-library-workspace-ui-' + Date.now());
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

fs.mkdirSync(path.join(directory, 'Lucide Icon'), { recursive: true });
for (let i = 0; i < 200; i++)
  fs.writeFileSync(
    path.join(directory, 'Lucide Icon/icon-' + String(i).padStart(3, '0') + '.svg'),
    original,
  );
settings.imageLibrary.groups.push(
  {
    id: 'lucide-a',
    name: 'Lucide: Arrows',
    images: [{ file: 'Lucide Icon/icon-000.svg' }, { file: 'Lucide Icon/icon-001.svg' }],
  },
  { id: 'lucide-b', name: 'Lucide: Shapes', images: [{ file: 'Lucide Icon/icon-000.svg' }] },
);

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
      w.setMinimumSize(320, 480);
      w.setSize(width, height);
      w.show();
      w.focus();
    },
    { width, height },
  );

(async () => {
  try {
    await launch();
    await host.evaluate(() => window.dock.executeCommand('appdock.image-library.open'));
    await host.locator('.library-page .ad-gallery-card').first().waitFor();
    await until(async () => (await model()).content.total === 201, 'catalogue');
    const page = host.locator('.library-page');
    const first = page.locator('.ad-gallery-card').first();
    await first.locator('.ad-gallery-image').click();
    await until(async () => (await model()).content.selected === 1, 'click selection');
    assert.equal(await host.getByRole('dialog').count(), 0);
    await page
      .locator('.ad-gallery-card')
      .nth(2)
      .locator('.ad-gallery-image')
      .click({ modifiers: ['Shift'] });
    await until(async () => (await model()).content.selected === 3, 'shift range');
    await first.locator('[data-action="membership"]').click();
    const add = host.getByRole('dialog', { name: 'グループに追加', exact: true });
    await add.waitFor();
    assert((await add.innerText()).includes('3枚'));
    await add.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await until(async () => (await page.getAttribute('inert')) === null, 'dialog released');
    await page.getByRole('button', { name: 'すべて選択（201枚）', exact: true }).click();
    await until(async () => (await model()).content.selected === 201, 'all including unrendered');
    await first.click({ button: 'right' });
    const menu = host.getByRole('menu', { name: '201枚を選択', exact: true });
    await menu.waitFor();
    assert(
      await menu
        .getByRole('menuitem', { name: '画像をコピー（1枚・PNG）', exact: true })
        .isDisabled(),
    );
    await menu.press('Escape');
    await until(
      () => first.locator('.ad-gallery-image').evaluate((e) => e === document.activeElement),
      'context focus',
    );
    checks.push(
      'click/Shift selection; card action and right-click include all 201 selected images',
    );
    await page.getByRole('button', { name: '選択を解除', exact: true }).click();
    await first.click({ button: 'right' });
    const one = host.getByRole('menu', { name: '1枚を選択', exact: true });
    await one.getByRole('menuitem', { name: 'ファイル名を変更', exact: true }).click();
    const rename = host.getByRole('dialog', { name: 'ファイル名を変更', exact: true });
    await rename.waitFor();
    await rename.getByRole('textbox').fill('renamed');
    await rename.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await rename.waitFor({ state: 'hidden' });
    await until(async () => (await page.getAttribute('inert')) === null, 'rename cancel released');
    assert(fs.existsSync(path.join(directory, 'Lucide Icon/icon-000.svg')));
    await first.locator('.ad-gallery-image').focus();
    await host.keyboard.press('F2');
    await rename.waitFor();
    await rename.getByRole('textbox').fill('renamed');
    await rename.getByRole('button', { name: '適用', exact: true }).click();
    await rename.waitFor({ state: 'hidden' });
    await until(async () => (await page.getAttribute('inert')) === null, 'rename save released');
    await until(
      () => fs.existsSync(path.join(directory, 'Lucide Icon/renamed.svg')),
      'rename saved',
    );
    assert(!fs.existsSync(path.join(directory, 'Lucide Icon/icon-000.svg')));
    const value = JSON.parse(fs.readFileSync(require('./test-settings.cjs').file(profile), 'utf8'));
    assert(
      value.imageLibrary.groups.some((g) =>
        g.images.some((r) => r.file === 'Lucide Icon/renamed.svg'),
      ),
    );
    checks.push('rename cancel/save preserves bytes and memberships');

    await page.getByRole('button', { name: 'すべて選択（201枚）', exact: true }).click();
    await until(async () => (await model()).content.selected === 201, 'copy targets');
    const nativeClipboard = process.env.APPDOCK_TEST_NATIVE_CLIPBOARD === '1';
    const canRestoreClipboard =
      nativeClipboard &&
      (await app.evaluate(async ({ clipboard, ClipboardItem }) => {
        const values = await clipboard.read();
        if (values.some((item) => item.types.includes('text/uri-list'))) return false;
        const backup = [];
        for (const item of values) {
          const data = {};
          for (const type of item.types) {
            const payload = await item.getType(type);
            if (payload instanceof Blob && !payload.size) return false;
            data[type] = payload;
          }
          if (Object.keys(data).length) backup.push(new ClipboardItem(data));
        }
        global.__libraryClipboardBackup = backup;
        return true;
      }));
    if (canRestoreClipboard) {
      try {
        await page.getByRole('button', { name: '操作', exact: false }).last().click();
        await host.getByRole('menuitem', { name: 'パスをコピー', exact: true }).click();
        await until(
          async () =>
            !(await model()).content.busy && (await model()).content.message.includes('201枚'),
          'paths copied',
        );
        const pathCount = await app.evaluate(async ({ clipboard }, directory) => {
          const text = await clipboard.readText();
          const paths = text.split('\r\n');
          if (
            !paths.every((p) => p.startsWith(directory + process.getBuiltinModule('node:path').sep))
          )
            throw Error('Unexpected clipboard paths');
          global.__libraryClipboardText = text;
          return paths.length;
        }, directory);
        assert.equal(pathCount, 201);
        await page.getByRole('button', { name: '操作', exact: false }).last().click();
        await host.getByRole('menuitem', { name: 'ファイルをコピー', exact: true }).click();
        await until(async () => !(await model()).content.busy, 'native files copied');
        assert.equal((await model()).content.error, '');
        const fileCount = await app.evaluate(({}, directory) => {
          const ps = process
            .getBuiltinModule('node:path')
            .join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
          const script =
            'Add-Type -AssemblyName System.Windows.Forms; ConvertTo-Json -Compress -InputObject @([Windows.Forms.Clipboard]::GetFileDropList())';
          const paths = JSON.parse(
            process
              .getBuiltinModule('node:child_process')
              .execFileSync(ps, ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], {
                encoding: 'utf8',
                windowsHide: true,
              })
              .trim(),
          );
          if (
            !paths.every((p) => p.startsWith(directory + process.getBuiltinModule('node:path').sep))
          )
            throw Error('Unexpected native clipboard paths');
          return paths.length;
        }, directory);
        assert.equal(fileCount, 201);
        await page.getByRole('button', { name: '選択を解除', exact: true }).click();
        await first.locator('.ad-gallery-image').click();
        await until(async () => (await model()).content.selected === 1, 'image copy target');
        await first.click({ button: 'right' });
        await host.getByRole('menuitem', { name: '画像をコピー（1枚・PNG）', exact: true }).click();
        await until(
          async () =>
            !(await model()).content.busy && (await model()).content.message.includes('1枚'),
          'image copied',
        );
        const png = await app.evaluate(async ({ clipboard, nativeImage }) => {
          const items = await clipboard.read(),
            item = items.find((i) => i.types.includes('image/png'));
          if (!item) throw Error('PNG clipboard missing');
          const bytes = Buffer.from(await (await item.getType('image/png')).arrayBuffer());
          global.__libraryClipboardPng = bytes;
          return nativeImage.createFromBuffer(bytes).getSize();
        });
        assert.deepEqual(png, { width: 24, height: 24 });
        checks.push(
          'native Windows clipboard: 201 files via FileDropList, 201 paths, SVG as 24px PNG',
        );
      } finally {
        await app.evaluate(async ({ clipboard }, directory) => {
          // Restore the captured clipboard only while it still contains this test's output.
          let owned = false;
          const items = await clipboard.read();
          for (const item of items) {
            if (item.types.includes('text/plain')) {
              const value = await clipboard.readText();
              owned ||=
                value.length > 0 &&
                value
                  .split('\r\n')
                  .every((p) =>
                    p.startsWith(directory + process.getBuiltinModule('node:path').sep),
                  );
            }
            if (item.types.includes('image/png') && global.__libraryClipboardPng)
              owned ||= Buffer.from(await (await item.getType('image/png')).arrayBuffer()).equals(
                global.__libraryClipboardPng,
              );
            if (item.types.includes('text/uri-list')) {
              const ps = process
                .getBuiltinModule('node:path')
                .join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
              const script =
                'Add-Type -AssemblyName System.Windows.Forms; ConvertTo-Json -Compress -InputObject @([Windows.Forms.Clipboard]::GetFileDropList())';
              const paths = JSON.parse(
                process
                  .getBuiltinModule('node:child_process')
                  .execFileSync(ps, ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], {
                    encoding: 'utf8',
                    windowsHide: true,
                  })
                  .trim(),
              );
              owned ||=
                paths.length > 0 &&
                paths.every((p) =>
                  p.startsWith(directory + process.getBuiltinModule('node:path').sep),
                );
            }
          }
          if (owned) {
            if (global.__libraryClipboardBackup.length)
              await clipboard.write(global.__libraryClipboardBackup);
            else clipboard.clear();
          }
          delete global.__libraryClipboardBackup;
          delete global.__libraryClipboardText;
          delete global.__libraryClipboardPng;
        }, directory);
      }
    } else
      checks.push(
        nativeClipboard
          ? 'native clipboard skipped: current clipboard cannot be restored losslessly'
          : 'native clipboard not requested (APPDOCK_TEST_NATIVE_CLIPBOARD=1)',
      );

    await page.getByRole('button', { name: '選択を解除', exact: true }).click();
    await first.locator('.ad-gallery-image').click();
    await page
      .locator('.ad-gallery-card')
      .nth(1)
      .locator('.ad-gallery-image')
      .click({ modifiers: ['Control'] });
    await until(async () => (await model()).content.selected === 2, 'bulk edit selection');
    await first.locator('.ad-gallery-image').press('Shift+F10');
    await host.getByRole('menuitem', { name: 'プレビュー', exact: true }).click();
    const preview = host.getByRole('dialog');
    const firstPreview = await preview.getByRole('heading').innerText();
    await preview.getByRole('button', { name: '次の画像', exact: true }).click();
    assert.notEqual(await preview.getByRole('heading').innerText(), firstPreview);
    await preview.getByRole('button', { name: '閉じる', exact: true }).click();
    await until(async () => (await page.getAttribute('inert')) === null, 'preview released');
    await first.locator('.ad-gallery-image').press('F2');
    await rename.waitFor();
    assert.equal(await rename.getByRole('textbox').count(), 2);
    await rename.getByRole('textbox').nth(0).fill('aa-batch-one');
    await rename.getByRole('textbox').nth(1).fill('aa-batch-two');
    await rename.getByRole('button', { name: '適用', exact: true }).click();
    await rename.waitFor({ state: 'hidden' });
    await until(async () => (await page.getAttribute('inert')) === null, 'bulk rename released');
    for (const name of ['one', 'two'])
      assert(fs.existsSync(path.join(directory, `Lucide Icon/aa-batch-${name}.svg`)));
    await page.getByRole('button', { name: 'フォルダーを作成', exact: true }).click();
    let folderDialog = host.getByRole('dialog', { name: 'フォルダーを作成', exact: true });
    await folderDialog.getByLabel('フォルダーのパス').fill('移動テスト');
    await folderDialog.getByRole('button', { name: '適用', exact: true }).click();
    await folderDialog.waitFor({ state: 'hidden' });
    await until(async () => (await page.getAttribute('inert')) === null, 'folder create released');
    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'すべてのフォルダー', exact: true })
      .click();
    const batchCards = page.locator('.ad-gallery-card').filter({ hasText: 'aa-batch-' });
    await batchCards.nth(0).locator('.ad-gallery-image').click();
    await batchCards
      .nth(1)
      .locator('.ad-gallery-image')
      .click({ modifiers: ['Control'] });
    await page.getByRole('button', { name: '移動', exact: true }).click();
    folderDialog = host.getByRole('dialog', { name: '選択画像を移動', exact: true });
    await folderDialog.getByLabel('保存先').selectOption('移動テスト');
    await folderDialog.getByRole('button', { name: '適用', exact: true }).click();
    await folderDialog.waitFor({ state: 'hidden' });
    await until(async () => (await page.getAttribute('inert')) === null, 'folder move released');
    await until(async () => (await model()).content.total === 2, 'move navigates to destination');
    await app.evaluate(({ shell }, directory) => {
      global.__libraryOpened = [];
      shell.openPath = async (file) => {
        global.__libraryOpened.push(file);
        return '';
      };
      shell.trashItem = async (file) => {
        const fs = process.getBuiltinModule('node:fs/promises'),
          path = process.getBuiltinModule('node:path');
        if (!file.startsWith(directory + path.sep)) throw Error('Outside test images');
        const target = path.join(directory, '../recycled');
        await fs.mkdir(target, { recursive: true });
        await fs.rename(file, path.join(target, path.basename(file)));
      };
    }, directory);
    await page.getByRole('button', { name: 'フォルダーを開く', exact: true }).click();
    await until(
      async () => (await app.evaluate(() => global.__libraryOpened)).length === 1,
      'Explorer destination',
    );
    assert.deepEqual(await app.evaluate(() => global.__libraryOpened), [
      path.join(directory, '移動テスト'),
    ]);
    await page.getByRole('button', { name: '移動テストの操作', exact: true }).click();
    await host.getByRole('menuitem', { name: 'フォルダー名・場所を変更', exact: true }).click();
    folderDialog = host.getByRole('dialog', { name: 'フォルダー名・場所を変更', exact: true });
    await folderDialog.getByLabel('フォルダーのパス').fill('変更テスト');
    await folderDialog.getByRole('button', { name: '適用', exact: true }).click();
    await folderDialog.waitFor({ state: 'hidden' });
    await until(async () => (await page.getAttribute('inert')) === null, 'folder rename released');
    await page.getByRole('button', { name: 'すべて選択（2枚）', exact: true }).click();
    await first.locator('[data-action="delete-image"]').click();
    const deletion = host.getByRole('dialog', { name: '画像を削除', exact: true });
    await deletion.waitFor();
    assert.equal(await deletion.getByRole('listitem').count(), 2);
    await deletion.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await until(async () => (await page.getAttribute('inert')) === null, 'delete cancel released');
    assert.equal(fs.readdirSync(path.join(directory, '変更テスト')).length, 2);
    await first.locator('[data-action="delete-image"]').click();
    await deletion.getByRole('button', { name: '削除', exact: true }).click();
    await deletion.waitFor({ state: 'hidden' });
    await until(async () => (await page.getAttribute('inert')) === null, 'bulk delete released');
    assert.equal(fs.readdirSync(path.join(directory, '変更テスト')).length, 0);
    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'すべてのフォルダー', exact: true })
      .click();
    await until(async () => (await model()).content.total === 199, 'remaining images');
    checks.push(
      'keyboard menu and multiple preview; bulk rename/move/delete cancel/save; folder rename and Explorer path (isolated shell adapter)',
    );
    const scroller = page.locator('.library-scroll');
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await until(async () => (await model()).content.items.length > 64, 'scroll loads next batch');
    await page.getByRole('slider', { name: '画像サイズ' }).press('Home');
    await until(async () => (await model()).content.cardWidth === 40, 'smallest size saved');
    await until(async () => (await model()).content.remaining === 0, 'auto fill viewport');
    await page.screenshot({ path: path.join(profile, 'compact.png') });
    const dimensions = await page
      .locator('.ad-gallery-image img')
      .first()
      .evaluate((e) => ({ width: e.clientWidth, height: e.clientHeight }));
    assert(dimensions.width >= 23 && dimensions.width <= 26, JSON.stringify(dimensions));
    await page.getByRole('button', { name: /Lucide\s*2/, exact: false }).click();
    const afterCollapse = await model();
    assert(afterCollapse.content.layout.collapsedGroups.includes('Lucide'));
    const splitter = page.getByRole('separator', { name: 'フォルダー・グループエリアの幅' });
    await splitter.focus();
    await splitter.press('ArrowRight');
    await until(async () => (await model()).content.layout.sidebarWidth === 228, 'splitter saved');
    checks.push('24px images; auto pagination fills viewport; prefix and width saved');
    await resize(640, 700);
    await until(() => page.getAttribute('data-narrow').then((v) => v === 'true'), 'narrow layout');
    await page.getByRole('button', { name: 'フォルダーとグループ', exact: true }).click();
    await host.locator('.library-sidebar:popover-open').waitFor();
    await host.screenshot({ path: path.join(profile, 'narrow-navigation.png') });
    await host.keyboard.press('Escape');
    await resize(1360, 950);
    await until(() => page.getAttribute('data-narrow').then((v) => v === 'false'), 'wide layout');
    assert.equal((await model()).content.layout.sidebarWidth, 228);
    await until(
      async () => (await page.locator('.ad-gallery-image img[src]').count()) === 199,
      'all small thumbnails decoded',
    );
    assert.equal((await model()).content.sizeError, '');
    await page.screenshot({ path: path.join(profile, 'wide.png') });
    await app.close();
    app = null;
    await launch();
    await host.evaluate(() => window.dock.executeCommand('appdock.image-library.open'));
    await host.locator('.library-page .ad-gallery-card').first().waitFor();
    const restored = (await model()).content;
    assert.equal(restored.cardWidth, 40);
    assert.equal(restored.layout.sidebarWidth, 228);
    assert(restored.layout.collapsedGroups.includes('Lucide'));
    checks.push('narrow navigation and restart retain desktop width, size and collapsed prefix');
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { ok: true, checks, errors, executable: exe, executableHash: hash(exe) },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ profile, checks }, null, 2));
  } catch (error) {
    if (host) await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: false, checks, errors, error: String(error.stack || error) }, null, 2),
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    await app?.close().catch(() => {});
  }
})();
