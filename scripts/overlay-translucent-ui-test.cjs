const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { launch, until } = require('./page-test-host.cjs');
const root = path.resolve(__dirname, '..');
const source = process.argv[2] && path.resolve(process.argv[2]);
const profile = fs.mkdtempSync(path.join(root, '.artifacts/overlay-translucent-ui-'));
const defaults = require('../resources/configs/theme.json');
const theme = structuredClone(defaults);
theme.light.scrim = '#17345166';
theme.dark.scrim = '#6181a380';
const themeFile = path.join(profile, 'configs/theme.json');
fs.mkdirSync(path.dirname(themeFile), { recursive: true });
fs.writeFileSync(themeFile, JSON.stringify(theme));
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, {
  startMinimized: false,
  closeToTray: false,
  soundEnabled: false,
  hardwareAcceleration: false,
});
settings.updates.checkHostOnStartup = false;
settings.updates.checkAppletsOnStartup = false;
settings.gestures.enabled = false;
settings.keybindings = [];
settings.globalShortcutCommands = [];
settings.customCommands = {
  version: 2,
  items: [
    {
      id: randomUUID(),
      typeId: 'appdock.input.sendKeys',
      owner: { kind: 'host' },
      title: 'Overlay fixture',
      description: '',
      configVersion: 1,
      config: { keys: 'Enter' },
      enabled: true,
      automation: false,
    },
  ],
};
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
const sample = path.join(profile, 'overlay-sample.svg');
fs.writeFileSync(
  sample,
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#507aa2"/><circle cx="120" cy="80" r="45" fill="#def1ea"/></svg>',
);
const result = { success: false, profile, checks: [] };
let runtime;
const host = () => runtime.main;
const save = (hostSettings) => runtime.save({ host: hostSettings });
async function settingsPage(id) {
  await host().evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  await host()
    .getByTestId('settings-nav:' + id)
    .click();
}
async function editor() {
  await settingsPage('custom-commands');
  await host().getByRole('button', { name: 'Overlay fixtureを編集', exact: true }).click();
  const dialog = host().locator('dialog.settings-modal');
  await dialog.getByTestId('settings-dialog-confirm').waitFor();
  return dialog;
}
async function palette() {
  await host().evaluate(() => {
    void window.dock.openCommandPalette({ requestId: crypto.randomUUID(), mode: 'execute' });
  });
  const page = await runtime.page('/command-palette/index.html');
  await page.locator('.command-palette').waitFor();
  return page;
}
async function closePalette(page) {
  await page.mouse.click(5, 5);
  await until(() => require('./shell-overlay-helper.cjs').overlayClosed(page), 'palette closes');
}
async function backdrop(locator, mode, hex, pseudo = true) {
  await until(async () => {
    const style = await locator.evaluate((el, pseudo) => {
      const s = getComputedStyle(el, pseudo ? '::backdrop' : null);
      return { color: s.backgroundColor, filter: s.backdropFilter };
    }, pseudo);
    const channels = style.color.match(/[\d.]+/g).map(Number);
    const expected =
      mode === 'translucent'
        ? [1, 3, 5]
            .map((i) => parseInt(hex.slice(i, i + 2), 16))
            .concat(parseInt(hex.slice(7, 9), 16) / 255)
        : [0, 0, 0, 0];
    return (
      expected.every((value, i) => Math.abs(value - channels[i]) < 0.005) &&
      style.filter === (pseudo && mode === 'blur' ? 'blur(2px)' : 'none')
    );
  }, 'backdrop uses selected mode and external scrim');
}
async function closeDialog(dialog) {
  await host().keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
}
async function captureWindow(name) {
  const handle = await runtime.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('appdock://host/'));
    if (window.isMinimized()) window.restore();
    window.show();
    return window.getNativeWindowHandle().readBigUInt64LE().toString();
  });
  await host().evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  require('node:child_process').execFileSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'capture-test-window.ps1'),
    '-WindowHandle', handle, '-OutputFile', path.join(profile, name + '.png'),
  ], { windowsHide: true });
}
async function run() {
  try {
    runtime = await launch(profile, source);
    await runtime.resize(1200, 850);
    await settingsPage('appearance');
    const choice = host().getByRole('combobox', {
      name: 'ダイアログ・パレットの背景',
      exact: true,
    });
    assert.deepEqual(await choice.locator('option').allTextContents(), [
      '透明',
      '半透明',
      'ブラー',
    ]);
    await choice.selectOption('translucent');
    await until(
      async () =>
        (await host().evaluate(() => window.dock.snapshot())).settings.value.host
          .overlayBackground === 'translucent',
      'UI saves translucent',
    );
    result.checks.push('appearance UI exposes and saves translucent');
    for (const mode of ['light', 'dark']) {
      await save({ theme: mode, overlayBackground: 'translucent' });
      const dialog = await editor();
      const input = dialog.getByRole('textbox', { name: '名前', exact: true });
      await input.fill('Unsaved overlay input');
      for (const background of ['translucent', 'transparent', 'blur', 'translucent']) {
        await save({ overlayBackground: background });
        await backdrop(dialog, background, theme[mode].scrim);
        assert.equal(await input.inputValue(), 'Unsaved overlay input');
      }
      const area = await host().locator('.shell > main').boundingBox();
      await host().mouse.click(area.x + 3, area.y + 3);
      assert(await dialog.isVisible(), 'editing backdrop preserves the draft');
      await host().screenshot({ path: path.join(profile, mode + '-edited-dialog.png') });
      await closeDialog(dialog);
      const page = await palette();
      for (const background of ['translucent', 'blur', 'transparent', 'translucent']) {
        await save({ overlayBackground: background });
        await backdrop(page.locator('.modal-backdrop'), background, theme[mode].scrim, false);
        await host().waitForFunction(
          (blur) =>
            getComputedStyle(document.querySelector('main')).filter ===
            (blur ? 'blur(2px)' : 'none'),
          background === 'blur',
        );
        assert(
          await page.evaluate(() =>
            [document.documentElement, document.body, document.getElementById('root')].every(
              (el) => getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)',
            ),
          ),
        );
      }
      await page.screenshot({ path: path.join(profile, mode + '-edited-palette.png') });
      await closePalette(page);
      result.checks.push(
        `${mode}: edited scrim on dialog and palette, live mode changes, input retention and dismissal`,
      );
    }
    await runtime.app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, sample);
    await host().evaluate(() => window.dock.executeCommand('appdock.image-library.open'));
    await host().locator('header').getByRole('button', { name: '画像を追加', exact: true }).click();
    const card = host().locator('.ad-gallery-card').filter({ hasText: 'overlay-sample.svg' });
    await card.waitFor();
    for (const mode of ['light', 'dark']) {
      await save({ theme: mode, overlayBackground: 'translucent' });
      await card.locator('.ad-gallery-image').dblclick();
      const preview = host().getByRole('dialog', { name: 'overlay-sample.svg', exact: true });
      await preview.waitFor();
      await until(
        () => preview.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0),
        'preview decoded',
      );
      for (const background of ['translucent', 'transparent', 'blur', 'translucent']) {
        await save({ overlayBackground: background });
        await backdrop(preview, background, theme[mode].scrim);
      }
      await host().screenshot({ path: path.join(profile, mode + '-preview.png') });
      const area = await host().locator('.shell > main').boundingBox();
      await host().mouse.click(area.x + 3, area.y + 3);
      await preview.waitFor({ state: 'detached' });
    }
    result.checks.push(
      'image preview uses the same external scrim in both themes and closes on background click',
    );
    await runtime.close();
    runtime = undefined;
    fs.writeFileSync(themeFile, JSON.stringify(defaults));
    runtime = await launch(profile, source);
    assert.equal(
      (await host().evaluate(() => window.dock.snapshot())).settings.value.host.overlayBackground,
      'translucent',
    );
    for (const mode of ['light', 'dark']) {
      await save({ theme: mode });
      const dialog = await editor();
      await backdrop(dialog, 'translucent', defaults[mode].scrim);
      await captureWindow(mode + '-default-dialog');
      await closeDialog(dialog);
      const page = await palette();
      await backdrop(page.locator('.modal-backdrop'), 'translucent', defaults[mode].scrim, false);
      await captureWindow(mode + '-default-palette');
      await closePalette(page);
    }
    result.checks.push(
      'real restart preserves the choice and reads changed scrim; default light/dark visuals',
    );
    result.success = true;
  } catch (error) {
    result.error = String(error.stack || error);
    if (runtime)
      await host()
        .screenshot({ path: path.join(profile, 'failure.png') })
        .catch(() => {});
    process.exitCode = 1;
  } finally {
    if (runtime) await runtime.close();
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
}
void run();
