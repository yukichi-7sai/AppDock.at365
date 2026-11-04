const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const defaults = require('../resources/configs/accent-color.json');
const { normalizeAccentColors } = require('../out/main/shared/accent-color');
const { readAccentColorFile } = require('../out/main/main/core/accent-color-files');
const root = path.resolve(__dirname, '..');
const fixture = (t) => {
  const dir = fs.mkdtempSync(path.join(root, '.artifacts/accent-color-unit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('catalog accepts arbitrary counts, literal labels and JSON order, with a stable default ID', () => {
  const value = structuredClone(defaults);
  value.presets.reverse();
  value.presets.push(
    ...Array.from({ length: 30 }, (_, n) => ({
      ...value.presets.at(-1),
      id: `extra-${n}`,
      label: `<Extra & ${n}>`,
    })),
  );
  value.customLabel = '自分の色 & Custom';
  assert.deepEqual(normalizeAccentColors(value, defaults), value);
  assert.equal(normalizeAccentColors(value, defaults).defaultId, 'mint');
  assert.deepEqual(normalizeAccentColors(defaults, defaults), defaults);
});

test('invalid catalog data falls back as a whole without mutating defaults or accepting CSS', () => {
  const changes = [
    (v) => {
      v.schemaVersion = 2;
    },
    (v) => {
      v.defaultId = 'missing';
    },
    (v) => {
      v.defaultId = 'sky-blue';
    },
    (v) => {
      v.customLabel = ' ';
    },
    (v) => {
      v.presets = [];
    },
    (v) => {
      v.presets.push(v.presets[0]);
    },
    ...['custom', '', 'bad id', '__proto__', 'constructor', 'prototype'].map((id) => (v) => {
      v.presets[0].id = id;
    }),
    (v) => {
      v.presets[0].label = '';
    },
    (v) => {
      v.presets[0].hidden = 'yes';
    },
    ...['red', '#abc', '#11223344', 'url(https://example.com)', null].map((color) => (v) => {
      v.presets[0].dark.accent = color;
    }),
    (v) => {
      delete v.presets[0].light.soft;
    },
    ...['true', 1, null, {}].flatMap((value) =>
      ['light', 'dark'].map((mode) => (v) => {
        v.presets[0][mode].autoContrast = value;
      }),
    ),
  ];
  for (const change of changes) {
    const value = structuredClone(defaults);
    change(value);
    const result = normalizeAccentColors(value, defaults);
    assert.deepEqual(result, defaults);
    assert.notEqual(result.presets, defaults.presets);
  }
});

test('autoContrast is optional and preserves independent boolean values for each theme', () => {
  for (const light of [undefined, false, true])
    for (const dark of [undefined, false, true]) {
      const value = structuredClone(defaults);
      if (light !== undefined) value.presets[0].light.autoContrast = light;
      if (dark !== undefined) value.presets[0].dark.autoContrast = dark;
      assert.deepEqual(normalizeAccentColors(value, defaults), value);
    }
  for (const preset of defaults.presets)
    for (const mode of ['light', 'dark']) assert.equal(preset[mode].autoContrast, undefined);
});

test('opted-in preset tones share custom correction and preserve raw colors, IDs and disabled modes', (t) => {
  const profile = fixture(t);
  fs.mkdirSync(path.join(profile, 'configs'));
  const catalog = structuredClone(defaults);
  for (const [index, flags] of [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
    [undefined, undefined],
  ].entries()) {
    const tone = (autoContrast) => ({
      accent: '#888888',
      soft: '#777777',
      ...(autoContrast === undefined ? {} : { autoContrast }),
    });
    catalog.presets.push({
      id: `contrast-${index}`,
      label: `Contrast ${index}`,
      light: tone(flags[0]),
      dark: tone(flags[1]),
    });
  }
  catalog.defaultId = 'contrast-0';
  const file = path.join(profile, 'configs/accent-color.json');
  fs.writeFileSync(file, JSON.stringify(catalog));
  const before = fs.readFileSync(file, 'utf8');
  const child = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const assert = require('node:assert/strict');
    const { resolveAppearance } = require('./out/main/shared/appearance');
    const { accentColorCatalog } = require('./out/main/main/core/accent-color-source');
    const themes = require('./resources/configs/theme.json');
    const luminance = hex => hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255)
      .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
      .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
    const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    const original = JSON.stringify(accentColorCatalog);
    for (const preset of accentColorCatalog.presets) for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light', tone = preset[mode];
      for (const edited of [false, true]) {
        const theme = { ...themes[mode], ...(edited ? { background: dark ? '#303030' : '#dddddd', panel: dark ? '#353535' : '#eeeeee', raised: dark ? '#383838' : '#e0e0e0' } : {}) };
        const result = resolveAppearance(preset.id, dark, 19, undefined, theme);
        assert.equal(result.palette, preset.id);
        assert.equal(result.revision, 19);
        if (tone.autoContrast) {
          const custom = dark ? { dark: tone.soft, light: tone.accent } : { dark: tone.accent, light: tone.soft };
          assert.deepEqual(result.colors, resolveAppearance('custom', dark, 19, custom, theme).colors);
          assert.notEqual(result.colors.accent, tone.accent);
          assert.notEqual(result.colors.soft, tone.soft);
          assert(dark ? luminance(result.colors.soft) <= 0.025 : luminance(result.colors.soft) >= 0.8);
          for (const background of [result.colors.soft, theme.background, theme.panel, theme.raised])
            assert(contrast(result.colors.accent, background) >= 4.5);
          assert(contrast(result.colors.accent, result.colors.text) >= 4.5);
          assert(contrast(result.colors.hover, result.colors.text) >= 4.5);
        } else {
          assert.equal(result.colors.accent, tone.accent);
          assert.equal(result.colors.soft, tone.soft);
        }
      }
    }
    for (const dark of [false, true]) {
      assert.deepEqual(resolveAppearance('contrast-3', dark).colors, resolveAppearance('contrast-4', dark).colors);
      assert.deepEqual(resolveAppearance('missing', dark).colors, resolveAppearance('contrast-0', dark).colors);
    }
    assert.equal(JSON.stringify(accentColorCatalog), original);
  `,
      '--',
      '--test-profile=' + profile,
    ],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(child.status, 0, child.stdout + child.stderr);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('file reading supports BOM and leaves missing or malformed files untouched', (t) => {
  const file = path.join(fixture(t), 'accent-color.json');
  assert.deepEqual(readAccentColorFile(file, defaults), defaults);
  assert.equal(fs.existsSync(file), false);
  for (const content of ['{broken', '\uFEFF' + JSON.stringify(defaults)]) {
    fs.writeFileSync(file, content);
    assert.deepEqual(readAccentColorFile(file, defaults), defaults);
    assert.equal(fs.readFileSync(file, 'utf8'), content);
  }
});

test('startup catalog drives defaults, search and API options while missing saved IDs round-trip', (t) => {
  const profile = fixture(t);
  fs.mkdirSync(path.join(profile, 'configs'));
  const catalog = structuredClone(defaults);
  catalog.presets = [
    catalog.presets[2],
    { ...catalog.presets[0], id: 'new-color', label: '新しい & Color' },
  ];
  catalog.defaultId = 'new-color';
  catalog.customLabel = 'Custom literal';
  const file = path.join(profile, 'configs/accent-color.json');
  fs.writeFileSync(file, JSON.stringify(catalog));
  const child = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const { createDefaultSettings, parseSettings } = require('./out/main/shared/settings-schema');
    const { settingsStorageValue } = require('./out/main/shared/settings-storage');
    const { settingsCatalog, applySettingsJson, resetSettingsPage } = require('./out/main/shared/settings-catalog');
    const { hostSettingDefinitions } = require('./out/main/shared/host-settings');
    const { resolveAppearance, defaultCustomAccent, accentChoices } = require('./out/main/shared/appearance');
    const settings = createDefaultSettings();
    assert.equal(settings.host.accentColor, 'new-color');
    assert.deepEqual(defaultCustomAccent, { dark: '#217a65', light: '#e1f3ec' });
    assert.deepEqual(accentChoices.map(p => p.id), ['lavender', 'new-color', 'custom']);
    const options = hostSettingDefinitions.find(d => d.key === 'accentColor').options;
    assert.deepEqual(options.map(p => p.label), ['ワンダーランド', '新しい & Color', 'Custom literal']);
    const page = settingsCatalog([], settings).find(p => p.id === 'appearance');
    assert(page.items.find(item => item.key === 'accentColor').keywords.includes('新しい & Color'));
    const missing = applySettingsJson(settings, page, [], JSON.stringify({ host: { accentColor: 'removed-color' } }));
    assert.equal(parseSettings(settingsStorageValue(missing)).host.accentColor, 'removed-color');
    assert.equal(resolveAppearance(missing.host.accentColor, false).palette, 'new-color');
    assert.equal(resetSettingsPage(missing, page, []).host.accentColor, 'new-color');
    const { accentColorCatalog, accentColorFile } = require('./out/main/main/core/accent-color-source');
    const { SettingsStore } = require('./out/main/main/core/settings');
    const { SettingsCommands } = require('./out/main/main/core/settings-commands');
    const path = require('node:path');
    const store = new SettingsStore(path.join(path.dirname(path.dirname(accentColorFile)), 'api-settings.json'));
    store.load();
    try {
      const commands = new SettingsCommands({ settings: store, applets: () => [], save: (v, r) => store.save(v, r) });
      assert.deepEqual(commands.schema().fields.accentColor.enum, ['lavender', 'new-color', 'custom']);
      commands.execute('appdock.settings.update', { changes: { accentColor: 'lavender' }, expectedRevision: commands.revision() });
      assert.equal(commands.get().values.accentColor, 'lavender');
      const removed = structuredClone(store.value);
      removed.host.accentColor = 'removed-color';
      store.save(removed, store.revision);
      commands.execute('appdock.settings.update', { changes: { showHints: false }, expectedRevision: commands.revision() });
      assert.equal(commands.get().values.accentColor, 'removed-color');
      assert.throws(() => commands.execute('appdock.settings.update', { changes: { accentColor: 'not-in-catalog' }, expectedRevision: commands.revision(), dryRun: true }));
      assert.throws(() => commands.execute('appdock.settings.update', { changes: { accentColor: 'invalid id' }, expectedRevision: commands.revision(), dryRun: true }));
      assert.equal(commands.get().values.accentColor, 'removed-color');
    } finally { store.close(); }
    fs.writeFileSync(accentColorFile, '{}');
    assert.equal(accentColorCatalog.defaultId, 'new-color');
  `,
      '--',
      `--test-profile=${profile}`,
    ],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(child.status, 0, child.stdout + child.stderr);
});
