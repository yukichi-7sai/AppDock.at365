const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeTheme, themeColorNames } = require('../out/main/shared/theme');
const { readThemeFile } = require('../out/main/main/core/theme-files');
const { resolveAppearance } = require('../out/main/shared/appearance');
const defaults = require('../resources/configs/theme.json');
const luminance = (color) =>
  color
    .slice(1)
    .match(/../g)
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
    .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test('distributed theme has complete readable base colors in both modes, without accent presets', () => {
  assert.deepEqual(Object.keys(defaults).sort(), ['dark', 'light', 'schemaVersion']);
  for (const mode of ['light', 'dark']) {
    const theme = defaults[mode];
    assert.deepEqual(Object.keys(theme).sort(), [...themeColorNames].sort());
    for (const [name, color] of Object.entries(theme))
      assert.match(color, ['shadow', 'scrim'].includes(name) ? /^#[a-f\d]{8}$/i : /^#[a-f\d]{6}$/i);
    for (const background of ['background', 'panel', 'raised', 'rail', 'sidebar'])
      for (const foreground of ['text', 'muted', 'error', 'warning', 'success'])
        assert(
          contrast(theme[foreground], theme[background]) >= 4.5,
          `${mode}/${foreground}/${background}`,
        );
    const appearance = resolveAppearance('mint', mode === 'dark');
    assert(contrast(appearance.theme.error, appearance.theme.onError) >= 4.5);
  }
  assert.deepEqual(require('../out/main/shared/theme-defaults.json'), defaults);
});

test('partial/invalid theme edits fall back per color and cannot inject CSS or new keys', () => {
  const edited = {
    schemaVersion: 1,
    light: {
      panel: '#AbCdEf',
      text: 'red; background: url(https://example.invalid)',
      border: '#ffffff00',
      extra: '#123456',
    },
    dark: { warning: 42, shadow: '#12345678' },
  };
  const snapshot = JSON.stringify(defaults);
  const result = normalizeTheme(edited, defaults);
  assert.equal(result.light.panel, '#abcdef');
  assert.equal(result.light.text, defaults.light.text);
  assert.equal(result.light.border, defaults.light.border);
  assert.equal(result.dark.warning, defaults.dark.warning);
  assert.equal(result.dark.shadow, '#12345678');
  assert.equal(result.light.extra, undefined);
  for (const invalid of [null, [], 'bad', { schemaVersion: 2 }, { light: edited.light }])
    assert.deepEqual(normalizeTheme(invalid, defaults), defaults);
  assert.equal(JSON.stringify(defaults), snapshot);
});

test('missing, unreadable and malformed files keep UI defaults without rewriting user edits', (t) => {
  const folder = fs.mkdtempSync(path.resolve('.artifacts/theme-file-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'theme.json');
  assert.deepEqual(readThemeFile(file, defaults), defaults);
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(readThemeFile(folder, defaults), defaults);
  fs.writeFileSync(file, '{invalid');
  assert.deepEqual(readThemeFile(file, defaults), defaults);
  assert.equal(fs.readFileSync(file, 'utf8'), '{invalid');
  fs.writeFileSync(
    file,
    '\uFEFF' + JSON.stringify({ schemaVersion: 1, light: { panel: '#f8f8f8' } }),
  );
  assert.equal(readThemeFile(file, defaults).light.panel, '#f8f8f8');
});

test('custom accent readability follows edited theme surfaces without changing saved colors', () => {
  for (const dark of [false, true]) {
    const theme = {
      ...defaults[dark ? 'dark' : 'light'],
      background: dark ? '#303030' : '#dddddd',
      panel: dark ? '#353535' : '#eeeeee',
      raised: dark ? '#383838' : '#e0e0e0',
    };
    const pair = Object.freeze({ dark: '#777777', light: '#888888' });
    const { colors } = resolveAppearance('custom', dark, 0, pair, theme);
    for (const background of ['background', 'panel', 'raised'])
      assert(contrast(colors.accent, theme[background]) >= 4.5);
    assert.deepEqual(pair, { dark: '#777777', light: '#888888' });
  }
});
