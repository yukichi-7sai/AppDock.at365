const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, until } = require('./page-test-host.cjs');
const root = path.resolve(__dirname, '..');
const source = process.argv[2] && path.resolve(process.argv[2]);
const profile = fs.mkdtempSync(path.join(root, '.artifacts/accent-color-ui-'));
const defaults = require('../resources/configs/accent-color.json');
const catalog = structuredClone(defaults);
catalog.presets.reverse();
const added = {
  id: 'added-color',
  label: '<追加 & Color>',
  light: { accent: '#654080', soft: '#f2eafa' },
  dark: { accent: '#d0b4ef', soft: '#30243e' },
};
catalog.presets.push(
  added,
  ...Array.from({ length: 5 }, (_, n) => ({ ...added, id: `extra-${n}`, label: `追加 ${n + 2}` })),
);
const correctedPresets = [
  {
    id: 'auto-light',
    label: 'Lightを自動補正',
    light: { accent: '#999999', soft: '#777777', autoContrast: true },
    dark: { accent: '#555555', soft: '#aaaaaa', autoContrast: false },
  },
  {
    id: 'auto-dark',
    label: 'Darkを自動補正',
    light: { accent: '#999999', soft: '#777777', autoContrast: false },
    dark: { accent: '#555555', soft: '#aaaaaa', autoContrast: true },
  },
];
catalog.presets.push(...correctedPresets);
catalog.defaultId = 'amber';
catalog.customLabel = '自分の色 & Custom';
const file = path.join(profile, 'configs/accent-color.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
const write = () => fs.writeFileSync(file, JSON.stringify(catalog));
write();
fs.mkdirSync(path.join(profile, 'translations'));
fs.writeFileSync(
  path.join(profile, 'translations/host_en.json'),
  JSON.stringify({
    'appearance.accent.label': 'Accent color',
  }),
);
const fixture = path.join(profile, 'extensions/fixture.accent');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.accent',
    name: 'Accent fixture',
    version: '1.0.0',
    minimumHostVersion: '0.142.0',
    runtime: 'node',
    entry: 'index.cjs',
    capabilities: ['pages'],
    commands: [{ id: 'fixture.accent.open', title: 'Accent fixture', activateOnExecute: true }],
    pages: [
      {
        id: 'main',
        title: 'Accent fixture',
        source: 'local',
        ui: 'main.html',
        openCommand: 'fixture.accent.open',
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.cjs'),
  "exports.activate=c=>c.commands.register('fixture.accent.open','Accent fixture',()=>c.pages.open('main'));",
);
fs.writeFileSync(
  path.join(fixture, 'main.html'),
  '<!doctype html><meta charset="utf-8"><style>body{background:var(--panel);color:var(--text)}button{background:var(--accent);color:var(--accent-text)}</style><button>Accent fixture</button>',
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, {
  theme: 'light',
  startMinimized: false,
  closeToTray: false,
  soundEnabled: false,
  hardwareAcceleration: false,
});
delete settings.host.accentColor;
settings.updates.checkHostOnStartup = false;
settings.updates.checkAppletsOnStartup = false;
settings.gestures.enabled = false;
settings.keybindings = [];
settings.globalShortcutCommands = [];
settings.extensions['fixture.accent'] = { enabled: true, settings: {} };
const settingsFile = require('./test-settings.cjs').file(profile);
fs.writeFileSync(settingsFile, JSON.stringify(settings));
const result = { source, profile, success: false, checks: [] };
let runtime;
const snapshot = () => runtime.main.evaluate(() => window.dock.snapshot());
const selected = async () => (await snapshot()).settings.value.host.accentColor;
async function start() {
  runtime = await launch(profile, source);
}
async function stop() {
  if (runtime) {
    await runtime.close();
    runtime = undefined;
  }
}
async function appearance() {
  await runtime.main.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  await runtime.main.getByTestId('settings-nav:appearance').click();
  await runtime.main.locator('.accent-palettes button').first().waitFor();
}
async function colors(page, mode, expected) {
  await page.waitForFunction(
    ({ mode, expected }) =>
      document.documentElement.dataset.theme === mode &&
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === expected,
    { mode, expected: expected.accent },
  );
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent-soft').trim(),
    ),
    expected.soft,
  );
}
async function run() {
  try {
    await start();
    assert.equal(await selected(), 'amber');
    await appearance();
    const labels = catalog.presets
      .filter((p) => !p.hidden)
      .map((p) => p.label)
      .concat(catalog.customLabel);
    assert.deepEqual(
      await runtime.main.locator('.accent-palettes button').allTextContents(),
      labels,
    );
    assert.deepEqual(
      await runtime.main.evaluate(() => window.appdockAppearance.accentColors()),
      catalog,
    );
    await runtime.save({ host: { language: 'en' } });
    await until(
      async () =>
        (await selected()) === 'amber' && (await snapshot()).settings.value.host.language === 'en',
      'language save',
    );
    await runtime.main.locator('.accent-palettes[aria-label="Accent color"]').waitFor();
    assert.deepEqual(
      await runtime.main.locator('.accent-palettes button').allTextContents(),
      labels,
    );
    await runtime.save({ host: { language: 'ja' } });
    await runtime.main.locator('.accent-palettes[aria-label="アクセントカラー"]').waitFor();
    await runtime.resize(980, 820);
    await runtime.main.screenshot({ path: path.join(profile, 'catalog-light.png') });
    result.checks.push(
      'JSON count/order/default and literal labels including markup; custom automatically last across language changes',
    );
    await runtime.main.getByRole('button', { name: added.label, exact: true }).click();
    await until(async () => (await selected()) === added.id, 'preset save');
    for (const mode of ['light', 'dark']) {
      await runtime.save({ host: { theme: mode } });
      await colors(runtime.main, mode, added[mode]);
      await colors(await runtime.page('/default/index.html'), mode, added[mode]);
      await runtime.main.evaluate(() => window.dock.executeCommand('fixture.accent.open'));
      const local = await runtime.page('/fixture.accent/main.html');
      await colors(local, mode, added[mode]);
      assert.equal(
        (await local.evaluate(() => window.appdockAppearance.accentColors())).defaultId,
        catalog.defaultId,
      );
      await appearance();
    }
    result.checks.push(
      'added preset is selected and saved; Light/Dark colors agree on host, Shell and local Applet',
    );
    const originalCatalog = fs.readFileSync(file, 'utf8');
    for (const preset of correctedPresets)
      for (const mode of ['light', 'dark']) {
        const tone = preset[mode];
        await runtime.save({
          host: {
            theme: mode,
            accentColor: 'custom',
            customAccentDark: mode === 'dark' ? tone.soft : tone.accent,
            customAccentLight: mode === 'dark' ? tone.accent : tone.soft,
          },
        });
        // Wait for the settings projection before submitting an edit against its revision.
        await runtime.main
          .getByRole('button', { name: catalog.customLabel, exact: true, pressed: true })
          .waitFor();
        const customColors = (
          await runtime.main.evaluate(() => window.appdockAppearance.snapshot())
        ).colors;
        await runtime.main.getByRole('button', { name: preset.label, exact: true }).click();
        await until(
          async () => (await selected()) === preset.id,
          `corrected preset save: ${preset.id}/${mode}`,
        );
        const expected = tone.autoContrast ? customColors : tone;
        await colors(runtime.main, mode, expected);
        await colors(await runtime.page('/default/index.html'), mode, expected);
        await colors(await runtime.page('/fixture.accent/main.html'), mode, expected);
        const resolved = await runtime.main.evaluate(() => window.appdockAppearance.snapshot());
        assert.equal(resolved.palette, preset.id);
        if (tone.autoContrast) {
          assert.deepEqual(resolved.colors, customColors);
          assert.notEqual(resolved.colors.accent, tone.accent);
          assert.notEqual(resolved.colors.soft, tone.soft);
          await runtime.main.screenshot({ path: path.join(profile, `auto-contrast-${mode}.png`) });
        }
        assert.deepEqual(
          await runtime.main.evaluate(() => window.appdockAppearance.accentColors()),
          catalog,
        );
      }
    assert.equal(fs.readFileSync(file, 'utf8'), originalCatalog);
    result.checks.push(
      'per-theme autoContrast matches custom correction on host/Shell/local Applet, preserves disabled tones and raw catalog',
    );
    await runtime.main.getByRole('button', { name: catalog.customLabel, exact: true }).click();
    await runtime.main.locator('.accent-custom-colors').waitFor();
    await until(async () => (await selected()) === 'custom', 'custom selection');
    await runtime.main.getByRole('button', { name: added.label, exact: true }).click();
    await until(async () => (await selected()) === added.id, 'restore added preset');
    result.checks.push(
      'automatically appended custom button uses existing color editor and persistence',
    );
    added.dark.accent = '#cba9f1';
    catalog.customLabel = '再起動後のカスタム';
    write();
    await runtime.main.reload();
    await until(async () => (await snapshot()).startupReady, 'reload');
    assert.equal(
      (await runtime.main.evaluate(() => window.appdockAppearance.accentColors())).customLabel,
      '自分の色 & Custom',
    );
    await stop();
    await start();
    assert.equal(await selected(), added.id);
    await colors(runtime.main, 'dark', added.dark);
    await appearance();
    assert.equal(
      await runtime.main.locator('.accent-palettes button').last().textContent(),
      catalog.customLabel,
    );
    result.checks.push(
      'document reload keeps startup catalog; process restart reloads colors and labels while preserving selection',
    );
    await stop();
    catalog.presets = catalog.presets.filter((p) => p.id !== added.id);
    write();
    await start();
    assert.equal(await selected(), added.id);
    await colors(
      runtime.main,
      'dark',
      catalog.presets.find((p) => p.id === catalog.defaultId).dark,
    );
    await appearance();
    await runtime.main
      .getByText(
        `保存済みの配色「${added.id}」が見つからないため、クッキーを表示しています。選択したIDは保持されています。`,
        { exact: true },
      )
      .waitFor();
    await runtime.save({ host: { overlayShadow: false } });
    await stop();
    assert.equal(JSON.parse(fs.readFileSync(settingsFile)).host.accentColor, added.id);
    catalog.presets.unshift(added);
    write();
    await start();
    assert.equal(await selected(), added.id);
    await colors(runtime.main, 'dark', added.dark);
    result.checks.push(
      'removed selected ID survives another settings save and restores when the same ID returns',
    );
    await stop();
    fs.writeFileSync(file, '{malformed');
    await start();
    assert.deepEqual(
      await runtime.main.evaluate(() => window.appdockAppearance.accentColors()),
      defaults,
    );
    assert.equal(await selected(), added.id);
    assert.equal(fs.readFileSync(file, 'utf8'), '{malformed');
    await colors(
      runtime.main,
      'dark',
      defaults.presets.find((p) => p.id === defaults.defaultId).dark,
    );
    result.checks.push(
      'malformed catalog falls back without modifying the file or losing saved settings',
    );
    result.success = true;
  } finally {
    await stop();
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify(result, null, 2));
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
