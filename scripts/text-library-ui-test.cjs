const { testHostPath } = require('./copy-host.cjs');
const { _electron: electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const root = path.resolve(__dirname, '..'),
  portable = process.argv[2] ? path.resolve(process.argv[2]) : null;
const profile = path.join(root, '.artifacts', 'text-library-ui-' + Date.now());
const directory = path.join(profile, 'data/assets/texts');
fs.mkdirSync(path.join(directory, '定型'), { recursive: true });
fs.mkdirSync(path.join(directory, '移動先'), { recursive: true });
fs.writeFileSync(path.join(directory, 'root.txt'), 'Root document');
const imageDirectory = path.join(profile, 'data/assets/images');
fs.mkdirSync(imageDirectory, { recursive: true });
fs.writeFileSync(
  path.join(imageDirectory, 'preview.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="8"/></svg>',
);
for (let i = 0; i < 140; i++)
  fs.writeFileSync(
    path.join(directory, '定型', `sample-${String(i).padStart(3, '0')}.txt`),
    '本文検索の目印 ' + i,
  );
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.closeToTray = false;
settings.globalShortcutCommands = [];
settings.gestures.enabled = false;
settings.imageLibrary = { groups: [{ id: 'keep', name: '画像専用', images: [] }] };
settings.soundLibrary = { groups: [{ id: 'keep', name: '音専用', files: [] }] };
settings.textLibrary = {
  groups: [
    { id: 'a', name: '定型: あいさつ', files: [{ file: 'root.txt' }] },
    { id: 'b', name: '定型: メール', files: [] },
  ],
};
const settingsFile = require('./test-settings.cjs').file(profile, 'settings.json');
fs.writeFileSync(settingsFile, JSON.stringify(settings));
const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const exe = portable ? testHostPath(profile) : require('electron');
if (portable) {
  require('./copy-host.cjs').copyHost(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
const checks = [],
  errors = [];
let app, host, child;
const until = async (fn, label, timeout = 30000) => {
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
      stream?.on('data', (data) => fs.appendFileSync(path.join(profile, 'electron.log'), data));
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
  host.on('pageerror', (e) => errors.push(String(e)));
  host.setDefaultTimeout(20000);
  await until(
    async () => (await host.evaluate(() => window.dock.snapshot())).startupReady,
    'startup',
  );
  await resize(1360, 950);
}
const model = () => host.evaluate(() => window.dock.pages.get());
const snapshot = () => host.evaluate(() => window.dock.snapshot());
const resize = (width, height) =>
  app.evaluate(
    ({ BrowserWindow }, { width, height }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/'),
      );
      w.setMinimumSize(320, 480);
      w.setSize(width, height);
      w.show();
      w.focus();
    },
    { width, height },
  );

const choose = (page, file, options) =>
  page.getByRole('button', { name: file + 'を選択', exact: true }).click(options);
(async () => {
  try {
    await launch();
    await host.evaluate(() => window.dock.executeCommand('appdock.text-library.open'));
    const page = host.locator('.library-page');
    await page.getByRole('heading', { name: 'テキストライブラリー', exact: true }).waitFor();
    await until(
      async () => (await model())?.content.total === 141 && !(await model()).content.indexing,
      'text index',
    );
    assert(await page.getByRole('button', { name: '選択を解除', exact: true }).isDisabled());
    assert(await page.getByRole('button', { name: '本文を編集', exact: true }).isDisabled());
    const search = page.getByRole('searchbox');
    await search.fill('目印 139');
    await search.press('Enter');
    await until(async () => (await model()).content.total === 1, 'body search');
    assert.equal((await model()).content.items[0].title, '定型/sample-139.txt');
    const selectAll = page.getByRole('button', { name: 'すべて選択', exact: true });
    await selectAll.focus();
    await selectAll.press('Enter');
    await until(async () => (await model()).content.selected === 1, 'select filtered text');
    await until(
      () => page.getByRole('button', { name: '本文を編集', exact: true }).isEnabled(),
      'selected text rendered',
    );
    await page.getByRole('button', { name: '選択を解除', exact: true }).click();
    await until(async () => (await model()).content.selected === 0, 'clear filtered text');
    await until(
      () => page.getByRole('button', { name: '本文をコピー', exact: true }).isDisabled(),
      'cleared text selection rendered',
    );
    checks.push(
      'persistent selection controls select only filtered results by Enter and clear selection',
    );
    await search.fill('');
    await search.press('Enter');
    await until(async () => (await model()).content.total === 141, 'clear search');
    await page.getByRole('button', { name: '新規テキスト', exact: true }).click();
    let dialog = host.getByRole('dialog', { name: '新規テキスト', exact: true });
    await dialog
      .getByRole('textbox', { name: 'ファイル名（.txt）', exact: true })
      .fill('cancelled');
    await dialog.getByRole('textbox', { name: '本文', exact: true }).fill('discard');
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(fs.existsSync(path.join(directory, 'cancelled.txt')), false);
    await page.getByRole('button', { name: '新規テキスト', exact: true }).click();
    dialog = host.getByRole('dialog', { name: '新規テキスト', exact: true });
    await dialog.getByRole('textbox', { name: 'ファイル名（.txt）', exact: true }).fill('あいさつ');
    const body = dialog.getByRole('textbox', { name: '本文', exact: true });
    await body.fill('こんにちは😀');
    await body.press('End');
    await body.press('Enter');
    await body.press('x');
    await body.press('Shift+Enter');
    await body.press('y');
    const createdBody = 'こんにちは😀\nx\ny';
    assert.equal(await body.inputValue(), createdBody);
    assert.equal(fs.existsSync(path.join(directory, 'あいさつ.txt')), false);
    await body.evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
      );
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, repeat: true, bubbles: true }),
      );
    });
    assert(await body.isVisible());
    await body.press('Control+Enter');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(fs.readFileSync(path.join(directory, 'あいさつ.txt'), 'utf8'), createdBody);
    checks.push(
      'body search, cancellation, Japanese multiline text and Ctrl+Enter confirmation; composition and repeat ignored',
    );
    await page.getByRole('button', { name: '本文を編集', exact: true }).click();
    dialog = host.getByRole('dialog', { name: '本文を編集', exact: true });
    await dialog.getByRole('textbox', { name: '本文', exact: true }).fill('discard edit');
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(fs.readFileSync(path.join(directory, 'あいさつ.txt'), 'utf8'), createdBody);
    await page.getByRole('button', { name: '本文を編集', exact: true }).click();
    dialog = host.getByRole('dialog', { name: '本文を編集', exact: true });
    const markup = '<script>window.untrustedTextRan=true</script>\n編集した本文';
    const editBody = dialog.getByRole('textbox', { name: '本文', exact: true });
    const [firstLine, secondLine] = markup.split('\n');
    await editBody.fill(firstLine);
    await editBody.press('End');
    await editBody.press('Enter');
    await host.keyboard.insertText(secondLine);
    assert.equal(await editBody.inputValue(), markup);
    await dialog.getByRole('button', { name: '適用', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '本文を表示', exact: true }).click();
    dialog = host.getByRole('dialog');
    assert.equal(await dialog.locator('pre').textContent(), markup);
    await dialog.locator('pre').press('Control+Enter');
    assert(await dialog.isVisible());
    await host.screenshot({ path: path.join(profile, 'text-preview.png') });
    assert.equal(await host.evaluate(() => window.untrustedTextRan), undefined);
    await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '本文を編集', exact: true }).click();
    dialog = host.getByRole('dialog', { name: '本文を編集', exact: true });
    const draft = dialog.getByRole('textbox', { name: '本文', exact: true });
    const applyEdit = dialog.getByRole('button', { name: '適用', exact: true });
    await draft.fill('unsaved draft');
    const draftBeforeError = await draft.boundingBox();
    const applyBeforeError = await applyEdit.boundingBox();
    fs.writeFileSync(path.join(directory, 'あいさつ.txt'), 'external edit wins');
    await applyEdit.click();
    await dialog
      .getByRole('alert')
      .filter({ hasText: /テキストが変更されました/ })
      .waitFor();
    assert((await draft.boundingBox()).height < draftBeforeError.height, 'error takes draft space');
    assert(Math.abs((await applyEdit.boundingBox()).y - applyBeforeError.y) <= 1, 'stable footer');
    assert.equal(await draft.inputValue(), 'unsaved draft');
    assert.equal(
      fs.readFileSync(path.join(directory, 'あいさつ.txt'), 'utf8'),
      'external edit wins',
    );
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    checks.push(
      'cancelled and saved edits, safe plain-text preview, external conflict retains draft',
    );
    await app.evaluate(({ clipboard }) => {
      global.__textCopied = '';
      clipboard.writeText = (value) => {
        global.__textCopied = value;
      };
    });
    await choose(page, 'root.txt');
    await choose(page, 'あいさつ.txt', { modifiers: ['Control'] });
    await until(async () => (await model()).content.selected === 2, 'multiple selection');
    await page.getByRole('button', { name: '本文をコピー', exact: true }).click();
    await until(
      async () =>
        (await app.evaluate(() => global.__textCopied)) === 'Root document\r\nexternal edit wins',
      'ordered body clipboard',
    );
    checks.push('multiple selection copies bodies in visible order with isolated clipboard');
    await choose(page, 'あいさつ.txt');
    await page.getByRole('button', { name: '移動', exact: true }).click();
    dialog = host.getByRole('dialog');
    await dialog.getByRole('combobox').selectOption('移動先');
    await dialog.getByRole('button', { name: '適用', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await until(() => fs.existsSync(path.join(directory, '移動先/あいさつ.txt')), 'move');
    await choose(page, '移動先/あいさつ.txt', { button: 'right' });
    await host.getByRole('menuitem', { name: 'ファイル名を変更', exact: true }).click();
    dialog = host.getByRole('dialog', { name: 'ファイル名を変更', exact: true });
    await dialog.getByRole('textbox').fill('renamed');
    await dialog.getByRole('button', { name: '適用', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(
      fs.readFileSync(path.join(directory, '移動先/renamed.txt'), 'utf8'),
      'external edit wins',
    );
    const imported = path.join(profile, 'imported.txt');
    fs.writeFileSync(imported, '取り込み本文');
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, imported);
    await page.getByRole('button', { name: 'テキストを取り込む', exact: true }).click();
    await until(
      () => fs.existsSync(path.join(directory, '移動先/imported.txt')),
      'UTF-8 import into current folder',
    );
    assert.equal(
      fs.readFileSync(path.join(directory, '移動先/imported.txt'), 'utf8'),
      '取り込み本文',
    );
    await page.getByRole('button', { name: 'すべてのフォルダー', exact: true }).click();
    checks.push('batch toolbar move, context rename, UTF-8 import into selected folder');
    await page.getByRole('button', { name: 'グループを追加', exact: true }).click();
    dialog = host.getByRole('dialog', { name: 'テキストグループを追加', exact: true });
    await dialog
      .getByRole('textbox', { name: 'テキストグループ名', exact: true })
      .fill('定型: 検証');
    await dialog.getByRole('button', { name: '追加', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '新規テキスト', exact: true }).click();
    dialog = host.getByRole('dialog', { name: '新規テキスト', exact: true });
    await dialog.getByRole('textbox', { name: 'ファイル名（.txt）', exact: true }).fill('empty');
    await dialog.getByRole('button', { name: '適用', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(fs.readFileSync(path.join(directory, 'empty.txt'), 'utf8'), '');
    await until(
      () =>
        JSON.parse(fs.readFileSync(settingsFile))
          .textLibrary.groups.find((g) => g.name === '定型: 検証')
          ?.files.some((r) => r.file === 'empty.txt'),
      'new text joins active group',
    );
    await choose(page, 'empty.txt', { button: 'right' });
    await host.getByRole('menuitem', { name: '複製', exact: true }).click();
    dialog = host.getByRole('dialog', { name: '新規テキスト', exact: true });
    assert.equal(
      await dialog.getByRole('textbox', { name: 'ファイル名（.txt）', exact: true }).inputValue(),
      'empty - コピー',
    );
    await dialog.getByRole('textbox', { name: '本文', exact: true }).fill('複製だけ変更');
    await dialog.getByRole('button', { name: '適用', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(
      fs.readFileSync(path.join(directory, 'empty - コピー.txt'), 'utf8'),
      '複製だけ変更',
    );
    assert.equal(fs.readFileSync(path.join(directory, 'empty.txt'), 'utf8'), '');
    await page.getByRole('button', { name: '削除', exact: true }).click();
    dialog = host.getByRole('dialog', { name: 'テキストを削除', exact: true });
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert(fs.existsSync(path.join(directory, 'empty - コピー.txt')));
    const sourceCard = page.getByRole('button', { name: 'empty.txtを選択', exact: true });
    const folderTarget = page.getByRole('button', { name: '移動先', exact: true });
    await sourceCard.dragTo(folderTarget);
    await until(() => fs.existsSync(path.join(directory, '移動先/empty.txt')), 'text folder drag');
    assert(
      JSON.parse(fs.readFileSync(settingsFile))
        .textLibrary.groups.find((g) => g.name === '定型: 検証')
        .files.some((r) => r.file === '移動先/empty.txt'),
    );
    await page.getByTitle('グループの絞り込みを解除', { exact: true }).click();
    checks.push(
      'localized group editor, empty document, active-group membership, independent duplicate, deletion cancellation and folder drag',
    );
    const slider = page.getByRole('slider', { name: 'カードサイズ', exact: true });
    await slider.focus();
    await slider.press('Home');
    await slider.press('Tab');
    await until(async () => (await model()).content.cardWidth === 40, 'smallest cards');
    const splitter = page.getByRole('separator');
    await splitter.focus();
    await splitter.press('ArrowRight');
    const width = await until(async () => {
      const w = (await model()).content.layout.sidebarWidth;
      return w > 220 ? w : false;
    }, 'sidebar save');
    await until(async () => (await model()).content.remaining === 0, 'automatic continuation');
    await slider.focus();
    await slider.press('End');
    await slider.press('Tab');
    await until(async () => (await model()).content.cardWidth === 360, 'readable preview size');
    await host.screenshot({ path: path.join(profile, 'library-wide.png') });
    await app.evaluate(({ nativeTheme }) => {
      nativeTheme.themeSource = 'dark';
    });
    await until(async () => (await model()).dark === true, 'dark theme');
    await resize(600, 820);
    await host.screenshot({ path: path.join(profile, 'library-narrow-dark.png') });
    assert(await slider.isVisible());
    await resize(1360, 950);
    await app.close();
    app = undefined;
    await launch();
    await host.evaluate(() => window.dock.executeCommand('appdock.text-library.open'));
    await host.getByRole('heading', { name: 'テキストライブラリー', exact: true }).waitFor();
    await until(async () => (await model())?.kind === 'text-library', 'reopened');
    assert.equal((await model()).content.cardWidth, 360);
    assert.equal((await model()).content.layout.sidebarWidth, width);
    for (const key of ['imageLibrary', 'soundLibrary'])
      assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile))[key], settings[key]);
    assert.deepEqual(errors, []);
    checks.push('card sizes, sidebar persistence, auto-load, narrow dark layout and restart');
    for (const width of [1360, 600]) {
      await resize(width, 820);
      const widths = [];
      for (const [command, file] of [
        ['appdock.image-library.open', 'preview.svg'],
        ['appdock.text-library.open', '移動先/renamed.txt'],
      ]) {
        await host.evaluate((id) => window.dock.executeCommand(id), command);
        const opener = host.getByRole('button', { name: file + 'を選択', exact: true });
        await opener.dblclick();
        const preview = host.getByRole('dialog', { name: file, exact: true });
        const close = preview.getByRole('button', { name: '閉じる', exact: true });
        await until(
          () => close.evaluate((el) => el === document.activeElement),
          'preview close focus',
        );
        assert.equal(await close.innerText(), '');
        assert(await close.locator('svg').isVisible());
        const bounds = await preview.boundingBox(),
          button = await close.boundingBox();
        assert(
          button.x > bounds.x + bounds.width / 2 && button.y < bounds.y + bounds.height / 2,
          'close in upper right',
        );
        widths.push(bounds.width);
        await preview.getByRole('heading', { name: file, exact: true }).click();
        assert(await preview.isVisible());
        if (width === 1360) await close.click();
        else await host.mouse.click(bounds.x - 3, bounds.y + bounds.height / 2);
        await preview.waitFor({ state: 'hidden' });
        await until(
          () => opener.evaluate((el) => el === document.activeElement),
          'preview returns focus to its opener',
        );
      }
      assert(Math.abs(widths[0] - widths[1]) <= 1, `preview widths at ${width}px: ${widths}`);
      checks.push(
        `image and text previews at ${width}px: ${widths.join('/')}px, labelled top-right close, backdrop and focus return`,
      );
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { ok: true, portable, sha256: portable ? hash(exe) : null, checks, errors },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ profile, checks }, null, 2));
  } catch (error) {
    if (host) {
      await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
      await host
        .evaluate(async () => ({
          model: await window.dock.pages.get(),
          text: document.body.innerText,
        }))
        .then((value) =>
          fs.writeFileSync(
            path.join(profile, 'failure-state.json'),
            JSON.stringify(value, null, 2),
          ),
        )
        .catch(() => {});
    }
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
