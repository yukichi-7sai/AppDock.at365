const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { launch, until } = require('./page-test-host.cjs');
const { leftDrag, moveCursor } = require('./windows-mouse-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const source = process.argv.slice(2).find((a) => !a.startsWith('--'));
const prototype = process.argv.includes('--prototype');
const profile = fs.mkdtempSync(path.join(root, '.artifacts/input-palette-resize-'));
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.closeToTray = false;
settings.host.textPaletteHistory = false;
settings.host.textPaletteRows = 4;
settings.host.clipboardPaletteRows = 3;
settings.textLibrary = {
  groups: [
    {
      id: require('../out/main/shared/text-library').snippetGroupId,
      name: '定型文',
      files: Array.from({ length: 18 }, (_, i) => ({ file: `${i + 1}.txt` })),
    },
  ],
};
fs.mkdirSync(path.join(profile, 'data/assets/texts'), { recursive: true });
for (let i = 1; i <= 18; i++)
  fs.writeFileSync(path.join(profile, `data/assets/texts/${i}.txt`), `fixture-${i}`);
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
let host,
  panel,
  target,
  focus,
  originalCursor,
  success = false;
const checks = [];
const native = (key) => {
  const cmd = `Add-Type -Path $env:PALETTE_RESIZE_FIXTURE; [PaletteResizeFixture]::${key === 'activate' ? `Activate(${target.handle},${target.pid})` : key === undefined ? `Guard(${target.handle},${target.pid})` : `Press(${target.handle},${target.pid},${focus},${key})`}`;
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(cmd, 'utf16le').toString('base64'),
    ],
    {
      windowsHide: true,
      encoding: 'utf8',
      env: {
        ...process.env,
        PALETTE_RESIZE_FIXTURE: path.join(root, 'tests/fixtures/InputPaletteResize.cs'),
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const snapshot = () =>
  host.app.evaluate(() => {
    const test = globalThis.paletteResizeTest,
      h = test.host;
    return {
      bounds: h?.window?.getBounds(),
      session: h?.active?.id,
      view: h?.active?.view,
      kind: h?.active?.kind,
      selected: h?.active?.selected,
      resizing: !!h?.active?.resizing,
      open: !!h?.active,
      pastes: test.pastes,
      captures: test.captures,
      guide: h?.active?.guide,
    };
  });
async function open(kind = 'snippets') {
  await host.main.bringToFront();
  native('activate');
  await host.main.locator('#palette-resize-editor').focus();
  const point = await host.app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock://host/index.html'),
    );
    const bounds = win.getBounds();
    return screen.dipToScreenPoint({ x: bounds.x + 100, y: bounds.y + 80 });
  });
  const previous = moveCursor(point);
  originalCursor ??= previous;
  focus = native();
  await host.main.evaluate(
    (kind) =>
      window.dock.executeCommand(
        kind === 'snippets' ? 'appdock.text-palette.open' : 'appdock.clipboard-history.open',
      ),
    kind,
  );
  panel = await host.page('/input-palette.html');
  await panel.getByRole('button', { name: 'パレットのサイズを変更', exact: true }).waitFor();
  assert.equal(native(), focus);
}
async function key(code) {
  assert.equal(native(code), focus);
}
async function drag(dx, dy) {
  const before = await snapshot();
  const grip = await panel
    .getByRole('button', { name: 'パレットのサイズを変更', exact: true })
    .boundingBox();
  const start = {
    x: before.bounds.x + grip.x + grip.width / 2,
    y: before.bounds.y + grip.y + grip.height / 2,
  };
  const points = await host.app.evaluate(
    ({ screen }, { start, dx, dy }) => [
      screen.dipToScreenPoint(start),
      screen.dipToScreenPoint({ x: start.x + dx, y: start.y + dy }),
    ],
    { start, dx, dy },
  );
  assert.equal(native(), focus);
  leftDrag(points[0], points[1]);
  await until(async () => !(await snapshot()).resizing, 'resize release');
  assert.equal(native(), focus);
  assert(
    await host.main
      .locator('#palette-resize-editor')
      .evaluate((el) => document.activeElement === el),
  );
  return { before, after: await snapshot() };
}
(async () => {
  try {
    host = await launch(profile, source);
    await host.resize(900, 620);
    if (!prototype) {
      await host.main.evaluate(() =>
        window.dock.executeCommand('appdock.settings.text-palette.open'),
      );
      await settingsPage(host.main);
      for (const [id, field, width] of [
        ['text-palette-width', 'textPaletteWidth', 480],
        ['clipboard-palette-width', 'clipboardPaletteWidth', 420],
      ]) {
        const input = host.main.getByTestId(id);
        assert.equal(await input.inputValue(), '370');
        for (const value of [259, 370.5, width]) {
          await input.fill(String(value));
          await input.press('Enter');
          await settleSettings(host.main);
          assert.equal(
            (await host.main.evaluate(() => window.dock.snapshot())).settings.value.host[field],
            value === width ? width : 370,
          );
        }
        await input.fill('600');
        await input.press('Escape');
        await input.blur();
        assert.equal(await input.inputValue(), String(width));
      }
      checks.push(
        'Independent widths default to 370; invalid minimum/fraction do not save; Enter saves and Escape cancels',
      );
    }
    target = await host.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('appdock://host/index.html'),
      );
      window.setPosition(40, 40);
      return {
        pid: process.pid,
        handle: window.getNativeWindowHandle().readBigUInt64LE().toString(),
      };
    });
    await host.main.evaluate(() => {
      const editor = document.createElement('textarea');
      editor.id = 'palette-resize-editor';
      editor.style.cssText =
        'position:fixed;left:20px;top:20px;width:300px;height:100px;z-index:999999';
      document.body.append(editor);
    });
    await host.app.evaluate(({ app, BrowserWindow }, prototype) => {
      const require = process
        .getBuiltinModule('module')
        .createRequire(app.getAppPath() + '/package.json');
      const { InputPaletteHost } = require(
        app.getAppPath() + '/out/main/main/core/input-palette-host.js',
      );
      const test = (globalThis.paletteResizeTest = { pastes: [], captures: 0, guide: true });
      const originalPublish = InputPaletteHost.prototype.publish;
      test.restore = () => {
        InputPaletteHost.prototype.publish = originalPublish;
        if (test.originalRequest) test.host.input.paletteRequest = test.originalRequest;
      };
      InputPaletteHost.prototype.publish = function (s) {
        if (!test.host) {
          test.host = this;
          if (prototype) this.showGuide = () => test.guide;
          const input = this.input;
          test.originalRequest = input.paletteRequest;
          input.paletteRequest = async function (method, params) {
            if (method === 'capture') test.captures++;
            if (method === 'history')
              return {
                status: 'ok',
                rows: Array.from({ length: 18 }, (_, i) => ({
                  id: `history-${i}`,
                  kind: 'text',
                  preview: `history ${i}`,
                })),
              };
            if (method === 'append') {
              test.body = (test.body ?? '') + params.text;
              return true;
            }
            if (method === 'paste') {
              const text = params.item ?? test.body;
              test.body = '';
              test.pastes.push(text);
              const main = BrowserWindow.getAllWindows().find((w) =>
                w.webContents.getURL().startsWith('appdock://host/index.html'),
              );
              main.webContents.insertText(text);
              return 'verified';
            }
            return test.originalRequest.call(this, method, params);
          };
        }
        return originalPublish.call(this, s);
      };
    }, prototype);
    await open();
    const initial = await snapshot();
    const stationary = await drag(0, 0);
    assert.deepEqual(
      stationary.after.bounds,
      initial.bounds,
      'Clicking grip does not accumulate DPI rounding',
    );
    const vertical = await drag(0, 50);
    assert.equal(
      vertical.after.bounds.width,
      initial.bounds.width,
      'Vertical-only drag preserves width',
    );
    const enlarged = await drag(110, 110);
    fs.writeFileSync(path.join(profile, 'first-resize.json'), JSON.stringify(enlarged, null, 2));
    assert(enlarged.after.bounds.width > initial.bounds.width + 70);
    assert(enlarged.after.bounds.height > initial.bounds.height + 70);
    assert.equal(enlarged.after.pastes.length, 0);
    await panel.screenshot({ path: path.join(profile, 'guide-resized.png') });
    await key(34);
    await until(
      async () => (await snapshot()).selected === 4,
      'PageDown still uses configured rows',
    );
    const size = (await snapshot()).bounds;
    await key(39);
    await until(async () => (await snapshot()).kind === 'history', 'switch to history');
    const history = await snapshot();
    assert(Math.abs(initial.bounds.width - (prototype ? 370 : 480)) <= 1);
    assert(Math.abs(history.bounds.width - (prototype ? 370 : 420)) <= 1);
    await panel.evaluate(({ session, view }) => {
      window.inputPalette.resize(session, view, 'start', 0, 0);
      window.inputPalette.resize(session, view, 'move', 1000, 1000);
    }, initial);
    assert.deepEqual(
      (await snapshot()).bounds,
      history.bounds,
      'Old view cannot resize current palette',
    );
    const largerHistory = await drag(55, 65);
    assert(largerHistory.after.bounds.width > history.bounds.width + 30);
    await key(37);
    await until(async () => (await snapshot()).kind === 'snippets', 'return snippets');
    const restored = await snapshot();
    for (const k of ['width', 'height']) assert(Math.abs(restored.bounds[k] - size[k]) <= 1);
    assert.equal(restored.selected, 4);
    await key(48);
    await until(async () => (await snapshot()).pastes.length === 1, 'real native 0 confirmation');
    assert.equal(await host.main.locator('#palette-resize-editor').inputValue(), 'fixture-10');
    checks.push(
      'OS mouse resize preserves native editor focus; OS PageDown/switch/0 use the captured target; sizes restore independently',
    );
    await open();
    assert.equal((await snapshot()).bounds.width, initial.bounds.width);
    assert.equal((await snapshot()).bounds.height, initial.bounds.height);
    await key(27);
    if (prototype)
      await host.app.evaluate(() => {
        globalThis.paletteResizeTest.guide = false;
      });
    else {
      await host.main.evaluate(() =>
        window.dock.executeCommand('appdock.settings.text-palette.open'),
      );
      await settingsPage(host.main);
      assert.equal(await host.main.getByTestId('text-palette-width').inputValue(), '480');
      assert.equal(await host.main.getByTestId('clipboard-palette-width').inputValue(), '420');
      await host.main.getByRole('switch', { name: '操作ガイドを表示', exact: true }).click();
      await settleSettings(host.main);
    }
    await open();
    assert.equal(await panel.locator('footer span').count(), 0);
    const compact = await snapshot();
    assert.equal(compact.bounds.height, initial.bounds.height - 27);
    await drag(100, 80);
    const small = await drag(-1200, -1200);
    assert(small.after.bounds.width >= 260 && small.after.bounds.height >= 119);
    assert(
      await panel
        .locator('.resize-handle')
        .evaluate(
          (el) =>
            el.getBoundingClientRect().top >=
            document.querySelector('.choices').getBoundingClientRect().bottom,
        ),
      'Handle does not cover rows or scrollbar',
    );
    await host.save({ host: { theme: 'dark' } });
    await panel.screenshot({ path: path.join(profile, 'compact-minimum.png') });
    await drag(5000, 5000);
    const max = await snapshot();
    const area = await host.app.evaluate(
      ({ screen }, bounds) => screen.getDisplayMatching(bounds).workArea,
      max.bounds,
    );
    assert(max.bounds.x >= area.x && max.bounds.y >= area.y);
    assert(max.bounds.x + max.bounds.width <= area.x + area.width + 1);
    assert(max.bounds.y + max.bounds.height <= area.y + area.height + 1);
    await key(35);
    await panel.locator('[data-index="17"][aria-current="true"]').waitFor();
    await key(13);
    await until(
      async () => (await snapshot()).pastes.length === 2,
      'real native Enter confirmation',
    );
    assert.equal(
      await host.main.locator('#palette-resize-editor').inputValue(),
      'fixture-10fixture-18',
    );
    checks.push(
      'Guide OFF retains working handle; minimum and work-area bounds, viewport refresh, End/Enter and close/reopen reset pass',
    );
    assert.equal(
      (await host.main.evaluate(() => window.dock.snapshot())).settings.value.host.textPaletteRows,
      4,
    );
    if (!prototype) {
      assert.equal(
        (await host.main.evaluate(() => window.dock.snapshot())).settings.value.host
          .paletteShowGuide,
        false,
      );
      await host.app.evaluate(() => globalThis.paletteResizeTest.restore());
      await host.close();
      host = await launch(profile, source);
      await host.main.evaluate(() =>
        window.dock.executeCommand('appdock.settings.text-palette.open'),
      );
      await settingsPage(host.main);
      assert.equal(await host.main.getByTestId('text-palette-width').inputValue(), '480');
      assert.equal(await host.main.getByTestId('clipboard-palette-width').inputValue(), '420');
      assert.equal(
        await host.main
          .getByRole('switch', { name: '操作ガイドを表示', exact: true })
          .getAttribute('aria-checked'),
        'false',
      );
      await host.resize(900, 620);
      await host.main.screenshot({ path: path.join(profile, 'settings-narrow.png') });
      for (const id of ['text-palette-width', 'clipboard-palette-width']) {
        const input = host.main.getByTestId(id);
        await input.scrollIntoViewIfNeeded();
        assert(
          await input.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return (
              rect.left >= 0 &&
              rect.right <= innerWidth &&
              rect.top >= 0 &&
              rect.bottom <= innerHeight
            );
          }),
        );
        await host.main.screenshot({ path: path.join(profile, `${id}-narrow.png`) });
      }
      await host.resize(1720, 1000);
      await host.main.screenshot({ path: path.join(profile, 'settings-wide.png') });
      checks.push(
        'Independent initial widths and guide OFF persist after real restart; drag does not rewrite settings; narrow and wide settings remain reachable',
      );
    }
    success = true;
  } finally {
    if (host) {
      fs.writeFileSync(
        path.join(profile, 'diagnostic.json'),
        JSON.stringify(await snapshot().catch(() => ({})), null, 2),
      );
      if (panel && !success)
        await panel.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
      await host.app.evaluate(() => globalThis.paletteResizeTest?.restore()).catch(() => {});
      await host.close();
    }
    if (originalCursor) moveCursor(originalCursor);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { success, source: source ?? 'source', hash: host?.hash, prototype, checks },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ success, checks, profile }));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
