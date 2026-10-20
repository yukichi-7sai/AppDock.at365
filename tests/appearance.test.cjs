const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { accentPalettes, resolveAppearance } = require('../out/main/shared/appearance');
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
  assert.equal(accentPalettes.length, 6);
  assert.deepEqual(accentPalettes.map((palette) => palette.title), ['ミント', 'アリス', 'スカイブルー', 'ラベンダー', 'マジカル', 'クッキー']);
  for (const palette of accentPalettes)
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
test('accent selection defaults to mint, validates exact presets, and participates in device settings and partial JSON', () => {
  const settings = createDefaultSettings();
  delete settings.host.accentColor;
  assert.equal(parseSettings(settings).host.accentColor, 'mint');
  assert(deviceHostKeys.includes('accentColor'));
  for (const invalid of ['custom', '#f0f8ff', null, 5, {}])
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
  contents.send = (channel, value) => sent.push({ channel, value });
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
  contents.mainFrame.url = 'file:///other.html';
  assert.throws(() => handler(event));
  const before = sent.length;
  palette = 'rose';
  host.refreshAppearance();
  assert.equal(sent.length, before);
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
    'shell-page-preload',
    'shell-bar-preload',
    'overlay-preload',
    'notification-surface-preload',
    'applet-page-preload',
    'web-account-preload',
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
