const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const {
  accentChoices,
  allAccentPalettes,
  defaultCustomAccent,
  resolveAppearance,
} = require('../out/main/shared/appearance');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const {
  settingsCatalog,
  settingsProjection,
  applySettingsJson,
  resetSettingsPage,
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

test('overlay background defaults to transparent, persists all choices and rejects unknown choices', () => {
  const settings = createDefaultSettings();
  assert.equal(settings.host.overlayBackground, 'transparent');
  assert.equal(settingsStorageValue(settings).host?.overlayBackground, undefined);
  delete settings.host.overlayBackground;
  assert.equal(parseSettings(settings).host.overlayBackground, 'transparent');
  for (const value of ['blur', 'translucent']) {
    settings.host.overlayBackground = value;
    assert.equal(parseSettings(settingsStorageValue(settings)).host.overlayBackground, value);
    const page = settingsCatalog([], settings).find((page) => page.id === 'appearance');
    const applied = applySettingsJson(
      settings,
      page,
      [],
      JSON.stringify({ host: { overlayBackground: value } }),
    );
    assert.equal(applied.host.overlayBackground, value);
    assert.equal(resetSettingsPage(applied, page, []).host.overlayBackground, 'transparent');
  }
  const item = settingsCatalog([], settings)
    .find((page) => page.id === 'appearance')
    .items.find((item) => item.key === 'overlayBackground');
  assert(item);
  assert.deepEqual(
    item.definition.options.map(({ value, label }) => [value, label]),
    [
      ['transparent', '透明'],
      ['translucent', '半透明'],
      ['blur', 'ブラー'],
    ],
  );
  settings.host.overlayBackground = 'gray';
  assert.throws(() => parseSettings(settings));
});

test('shadow preferences default on, persist independently and reset only with their own settings page', () => {
  const keys = ['overlayShadow', 'notificationBannerShadow', 'notificationDesktopShadow'];
  const initial = parseSettings({ schemaVersion: 1 });
  const { hostSettingDefinitions } = require('../out/main/shared/host-settings');
  for (const key of keys) {
    assert.equal(initial.host[key], true);
    assert.equal(settingsStorageValue(initial).host?.[key], undefined);
    assert(deviceHostKeys.includes(key));
    assert.equal(hostSettingDefinitions.find((field) => field.key === key).automation, true);
    const pageId = key === 'overlayShadow' ? 'appearance' : 'notifications';
    const page = settingsCatalog([], initial).find((p) => p.id === pageId);
    assert(page.items.some((item) => item.key === key));
    const next = applySettingsJson(initial, page, [], JSON.stringify({ host: { [key]: false } }));
    const restored = parseSettings(settingsStorageValue(next));
    assert.equal(restored.host[key], false);
    for (const other of keys.filter((other) => other !== key))
      assert.equal(restored.host[other], true);
    assert.equal(restored.host.overlayBackground, initial.host.overlayBackground);
    for (const value of [null, 0, 'false'])
      assert.throws(() => parseSettings({ ...initial, host: { ...initial.host, [key]: value } }));
  }
  const off = parseSettings({
    ...initial,
    host: { ...initial.host, ...Object.fromEntries(keys.map((k) => [k, false])) },
  });
  for (const pageId of ['appearance', 'notifications']) {
    const page = settingsCatalog([], off).find((p) => p.id === pageId);
    const reset = resetSettingsPage(off, page, []);
    assert.equal(reset.host.overlayShadow, pageId === 'appearance');
    assert.equal(reset.host.notificationBannerShadow, pageId === 'notifications');
    assert.equal(reset.host.notificationDesktopShadow, pageId === 'notifications');
  }
});
test('all palettes provide readable accent text, soft selections and filled/hovered controls in both themes', () => {
  const catalog = require('../resources/configs/accent-color.json');
  assert.deepEqual(
    accentChoices.map((p) => p.id),
    [...catalog.presets.filter((p) => !p.hidden).map((p) => p.id), 'custom'],
  );
  for (const palette of allAccentPalettes)
    for (const dark of [false, true]) {
      const { colors } = resolveAppearance(palette.id, dark);
      const [accent, soft] = palette[dark ? 'dark' : 'light'];
      const tone = catalog.presets.find((p) => p.id === palette.id)[dark ? 'dark' : 'light'];
      if (!tone.autoContrast) {
        assert.equal(colors.accent, accent);
        assert.equal(colors.soft, soft);
      }
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
          ...['background', 'panel', 'raised'].map((key) => [accent, result.theme[key]]),
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
test('accent selection defaults to mint, validates IDs, and participates in device settings and partial JSON', () => {
  const settings = createDefaultSettings();
  delete settings.host.accentColor;
  assert.equal(parseSettings(settings).host.accentColor, 'mint');
  assert(deviceHostKeys.includes('accentColor'));
  for (const invalid of ['', 'invalid id', 'constructor', '#f0f8ff', null, 5, {}])
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
  assert.equal(
    resolveAppearance('sky-blue', false).palette,
    require('../resources/configs/accent-color.json').defaultId,
  );
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
  const shadows = {
    overlayShadow: true,
    notificationBannerShadow: true,
    notificationDesktopShadow: true,
  };
  host.configureAppearance(() => ({ ...resolveAppearance(palette, dark), ...shadows }), {
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
  assert.deepEqual(
    handler(event, 'accent-colors'),
    require('../resources/configs/accent-color.json'),
  );
  assert.throws(() =>
    handler({ ...event, senderFrame: { url: contents.getURL() } }, 'accent-colors'),
  );
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
  const { scrollbarCss, placeholderCss } = require('../out/main/shared/appearance');
  assert.equal(styles[0], `${scrollbarCss}\n${placeholderCss}`);
  for (const key of Object.keys(shadows)) {
    const before = sent.length;
    shadows[key] = false;
    host.refreshAppearance();
    assert.equal(sent.length, before + 1);
    assert.equal(sent.at(-1).value[key], false);
    host.refreshAppearance();
    assert.equal(sent.length, before + 1);
  }
  contents.mainFrame.url = 'file:///other.html';
  assert.throws(() => handler(event));
  assert.throws(() => handler(event, 'accent-colors'));
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
  assert.equal(root['--panel'], initial.theme.panel);
  assert.equal(body['--border'], initial.theme.border);
  assert.equal(root['--appdock-overlay-filter'], 'none');
  assert.equal(body['--appdock-overlay-filter'], 'none');
  assert.equal(root['--appdock-overlay-background'], 'transparent');
  assert.equal(body['--accent'], '#245f9e');
  assert.equal(root.dataset.overlayShadow, 'on');
  assert.equal(root.dataset.notificationBannerShadow, 'on');
  assert.equal(root.dataset.notificationDesktopShadow, 'on');
  await api.snapshot();
  assert.equal(root.dataset.accent, 'alice-blue');
  let calls = 0;
  const stop = api.onChanged(() => calls++);
  ipc.emit('appearance:changed', {}, initial);
  assert.equal(calls, 0, 'reading or replaying the same revision does not notify subscribers');
  ipc.emit('appearance:changed', {}, resolveAppearance('rose', true, 3));
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root['--panel'], resolveAppearance('rose', true).theme.panel);
  assert.equal(root['--accent'], '#f2a6c6');
  stop();
  ipc.emit(
    'appearance:changed',
    {},
    {
      ...resolveAppearance('mint', false, 4),
      overlayBackground: 'blur',
      overlayShadow: false,
      notificationBannerShadow: false,
      notificationDesktopShadow: true,
    },
  );
  assert.equal(root['--appdock-overlay-filter'], 'blur(2px)');
  assert.equal(body['--appdock-overlay-filter'], 'blur(2px)');
  assert.equal(root.dataset.overlayShadow, 'off');
  assert.equal(root.dataset.notificationBannerShadow, 'off');
  assert.equal(root.dataset.notificationDesktopShadow, 'on');
  assert.equal(calls, 1);
  for (const [index, dark] of [false, true].entries()) {
    const snapshot = resolveAppearance('mint', dark, 5 + index);
    snapshot.theme.scrim = dark ? '#12345680' : '#abcdef66';
    ipc.emit('appearance:changed', {}, { ...snapshot, overlayBackground: 'translucent' });
    for (const element of [root, body]) {
      assert.equal(element['--appdock-overlay-background'], snapshot.theme.scrim);
      assert.equal(element['--appdock-overlay-filter'], 'none');
    }
  }
  for (const [index, overlayBackground] of ['transparent', 'blur'].entries()) {
    ipc.emit(
      'appearance:changed',
      {},
      {
        ...resolveAppearance('mint', false, 7 + index),
        overlayBackground,
      },
    );
    assert.equal(root['--appdock-overlay-background'], 'transparent');
    assert.equal(body['--appdock-overlay-background'], 'transparent');
    assert.equal(
      root['--appdock-overlay-filter'],
      overlayBackground === 'blur' ? 'blur(2px)' : 'none',
    );
  }
  for (const name of [
    'preload',
    'ribbon-preload',
    'window-bar-preload',
    'overlay-preload',
    'command-palette-preload',
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
