const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const {
  accentPalettes,
  accentChoices,
  legacyAccentPalette,
  defaultCustomAccent,
  resolveAppearance,
} = require('../out/main/shared/appearance');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const {
  settingsCatalog,
  settingsProjection,
  applySettingsJson,
} = require('../out/main/shared/settings-catalog');
const { deviceHostKeys } = require('../out/main/main/core/device-settings');
const luminance = (hex) => {
  const [r, g, b] = hex
    .match(/[a-f\d]{2}/gi)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};
const contrast = (a, b) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
test('all palettes provide readable accent text, soft selections and filled/hovered controls in both themes', () => {
  assert.deepEqual(
    accentChoices.map((palette) => palette.title),
    ['ミント', 'アリス', 'ラベンダー', 'マジカル', 'クッキー', 'カスタム'],
  );
  for (const palette of [...accentPalettes, legacyAccentPalette])
    for (const dark of [false, true]) {
      const { colors } = resolveAppearance(palette.id, dark);
      for (const [a, b] of [
        [colors.accent, colors.soft],
        [colors.accent, colors.text],
        [colors.hover, colors.text],
      ])
        assert(contrast(a, b) >= 4.5, `${palette.id}/${dark}/${a}/${b}`);
    }
  assert.equal(resolveAppearance('alice-blue', false).colors.soft, '#f0f8ff');
});
test('custom tones keep arbitrary saved pairs intact and resolve readable colors for both themes', () => {
  const colors = [
    '#000000',
    '#FFFFFF',
    '#777777',
    '#FF0000',
    '#00FF00',
    '#0000FF',
    '#FFFF00',
    '#6C3A86',
    '#F8ECFF',
  ];
  for (const a of colors)
    for (const b of colors)
      for (const dark of [false, true]) {
        const pair = Object.freeze({ dark: a, light: b });
        const result = resolveAppearance('custom', dark, 23, pair);
        assert.equal(result.palette, 'custom');
        assert.equal(result.revision, 23);
        assert.deepEqual(pair, { dark: a, light: b });
        const { accent, soft, text, hover } = result.colors;
        for (const [x, y] of [
          [accent, soft],
          [accent, text],
          [hover, text],
          [accent, dark ? '#20242f' : '#f0f2f6'],
        ])
          assert(contrast(x, y) >= 4.5, `${a}/${b}/${dark}/${x}/${y}`);
      }
  assert.equal(
    resolveAppearance('custom', false, 0, { dark: '#245f9e', light: '#f0f8ff' }).colors.accent,
    '#245f9e',
  );
  assert.equal(
    resolveAppearance('custom', false, 0, { dark: '#245f9e', light: '#f0f8ff' }).colors.soft,
    '#f0f8ff',
  );
});
test('accent selection defaults to mint, validates exact presets, and participates in device settings and partial JSON', () => {
  const settings = createDefaultSettings();
  delete settings.host.accentColor;
  assert.equal(parseSettings(settings).host.accentColor, 'mint');
  assert(deviceHostKeys.includes('accentColor'));
  for (const invalid of ['unknown', '#f0f8ff', null, 5, {}])
    assert.throws(() =>
      parseSettings({ ...settings, host: { ...settings.host, accentColor: invalid } }),
    );
  const full = parseSettings(settings);
  assert.equal(settingsStorageValue(full, []).host?.accentColor, undefined);
  const page = settingsCatalog([], full).find((p) => p.id === 'appearance');
  const next = applySettingsJson(
    full,
    page,
    [],
    JSON.stringify({ host: { accentColor: 'alice-blue' } }),
  );
  assert.equal(next.host.accentColor, 'alice-blue');
  assert.equal(next.host.theme, 'light');
  assert.equal(settingsProjection(next, page, []).host.accentColor, 'alice-blue');
});
test('custom and legacy colors round-trip without conversion, validate HEX and expose both fields to the appearance page and settings API', () => {
  const settings = createDefaultSettings();
  delete settings.host.customAccentDark;
  delete settings.host.customAccentLight;
  const parsed = parseSettings(settings);
  assert.equal(parsed.host.customAccentDark, defaultCustomAccent.dark);
  assert.equal(parsed.host.customAccentLight, defaultCustomAccent.light);
  for (const key of ['customAccentDark', 'customAccentLight']) {
    assert(deviceHostKeys.includes(key));
    for (const invalid of ['#fff', '#00000000', 'red', '', null, 3, {}])
      assert.throws(
        () => parseSettings({ ...parsed, host: { ...parsed.host, [key]: invalid } }),
        new RegExp(key),
      );
  }
  const page = settingsCatalog([], parsed).find((p) => p.id === 'appearance');
  const next = applySettingsJson(
    parsed,
    page,
    [],
    JSON.stringify({
      host: { accentColor: 'custom', customAccentDark: '#AABBCC', customAccentLight: '#012345' },
    }),
  );
  assert.equal(next.host.customAccentDark, '#AABBCC');
  assert.equal(next.host.customAccentLight, '#012345');
  assert.equal(settingsProjection(next, page, []).host.customAccentLight, '#012345');
  next.host.accentColor = 'mint';
  assert.equal(parseSettings(next).host.customAccentDark, '#AABBCC');
  next.host.accentColor = 'sky-blue';
  assert.equal(parseSettings(next).host.accentColor, 'sky-blue');
  assert.equal(resolveAppearance('sky-blue', false).colors.accent, '#036a91');
  const definitions = require('../out/main/shared/settings-commands').hostSettingDefinitions;
  assert(
    definitions.find((f) => f.key === 'accentColor').options.some((o) => o.value === 'custom'),
  );
  for (const key of ['customAccentDark', 'customAccentLight'])
    assert.equal(definitions.find((f) => f.key === key).automation, true);
});
test('appearance delivery authorizes registered main frames, updates once per change, reloads, and unregisters destroyed surfaces', () => {
  const host = require('../out/main/main/core/appearance-host');
  let palette = 'mint',
    dark = false,
    handler;
  host.configureAppearance(() => resolveAppearance(palette, dark), {
    handle: (_name, fn) => (handler = fn),
  });
  const contents = new EventEmitter();
  contents.mainFrame = { url: 'file:///fixture.html' };
  contents.getURL = () => contents.mainFrame.url;
  contents.isDestroyed = () => false;
  const sent = [];
  const styles = [];
  contents.send = (channel, value) => sent.push({ channel, value });
  contents.insertCSS = async (css) => {
    styles.push(css);
    return 'shared-scrollbars';
  };
  host.registerAppearance(contents, contents.getURL());
  const event = { sender: contents, senderFrame: contents.mainFrame };
  assert.equal(handler(event).palette, 'mint');
  assert.throws(() => handler({ ...event, senderFrame: { url: contents.getURL() } }));
  assert.throws(() => host.registerAppearance(new EventEmitter(), 'https://example.com/'));
  host.refreshAppearance();
  const length = sent.length;
  host.refreshAppearance();
  assert.equal(sent.length, length);
  palette = 'alice-blue';
  dark = true;
  host.refreshAppearance();
  assert.equal(sent.at(-1).value.palette, palette);
  assert.equal(sent.at(-1).value.dark, true);
  contents.emit('dom-ready');
  assert.equal(sent.length, length + 2);
  assert.equal(styles.length, 1);
  assert.equal(styles[0], require('../out/main/shared/appearance').scrollbarCss);
  contents.mainFrame.url = 'file:///other.html';
  assert.throws(() => handler(event));
  const before = sent.length;
  contents.emit('dom-ready');
  palette = 'rose';
  host.refreshAppearance();
  assert.equal(sent.length, before);
  assert.equal(
    styles.length,
    1,
    'remote or different local documents do not receive the shared style',
  );
  contents.emit('destroyed');
  assert.throws(() => handler(event));
});
test('sandboxed preload applies initial colors before updates and ignores stale snapshots, including body-scoped legacy accents', async () => {
  const source = fs.readFileSync(path.resolve('out/main/main/appearance-preload.js'), 'utf8');
  const root = { dataset: {}, style: { setProperty: (k, v) => (root[k] = v) } };
  const body = { style: { setProperty: (k, v) => (body[k] = v) } };
  const ipc = new EventEmitter();
  const initial = resolveAppearance('alice-blue', false, 2);
  ipc.invoke = async () => resolveAppearance('mint', false, 1);
  let api;
  vm.runInNewContext(source, {
    exports: {},
    require: (name) => {
      assert.equal(name, 'electron');
      return {
        ipcRenderer: ipc,
        contextBridge: {
          exposeInMainWorld: (key, value) => {
            assert.equal(key, 'appdockAppearance');
            api = value;
          },
        },
      };
    },
    process: { argv: ['--appdock-appearance=' + encodeURIComponent(JSON.stringify(initial))] },
    document: { documentElement: root, body },
  });
  assert.equal(root['--accent'], '#245f9e');
  assert.equal(body['--accent'], '#245f9e');
  await api.snapshot();
  assert.equal(root.dataset.accent, 'alice-blue');
  let calls = 0;
  const stop = api.onChanged(() => calls++);
  ipc.emit('appearance:changed', {}, initial);
  assert.equal(calls, 0, 'reading or replaying the same revision does not notify subscribers');
  ipc.emit('appearance:changed', {}, resolveAppearance('rose', true, 3));
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root['--accent'], '#f2a6c6');
  stop();
  ipc.emit('appearance:changed', {}, resolveAppearance('mint', false, 4));
  assert.equal(calls, 1);
  for (const name of [
    'preload',
    'shell-preload',
    'shell-bar-preload',
    'overlay-preload',
    'notification-surface-preload',
    'applet-page-preload',
    'web-account-preload',
    'gesture-indicator-preload',
  ])
    assert(
      fs
        .readFileSync(path.resolve('out/main/main', name + '.js'), 'utf8')
        .includes("exposeInMainWorld('appdockAppearance'"),
    );
});
test('host and Default Shell CSS reference canonical accents without redeclaring palette values', () => {
  function visit(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (file.endsWith('.css'))
        assert(
          !/--accent(?:-soft|-text|-hover|-focus)?\s*:\s*#[a-f\d]+/i.test(
            fs.readFileSync(file, 'utf8'),
          ),
          file,
        );
    }
  }
  visit(path.resolve('src/renderer'));
  visit(path.resolve('shells/default'));
});
