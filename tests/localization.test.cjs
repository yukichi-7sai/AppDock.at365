const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHostI18n, hostText } = require('../out/main/shared/i18n');
const { hostLanguages } = require('../out/main/shared/host-language');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const {
  settingsCatalog,
  settingsProjection,
  settingsJsonProjection,
  applySettingsJson,
  searchSettings,
} = require('../out/main/shared/settings-catalog');
const {
  initialDeviceSettings,
  parseDeviceSettings,
  deviceSettingsStorageValue,
  deviceHostKeys,
} = require('../out/main/main/core/device-settings');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { hostSettingDefinitions } = require('../out/main/shared/settings-commands');
const resources = require('../src/shared/locales/ja/host.json');

test('Japanese resources initialize synchronously, ship in main output, and remain isolated', () => {
  assert.deepEqual(require('../out/main/shared/locales/ja/host.json'), resources);
  const instance = createHostI18n();
  assert.equal(instance.isInitialized, true);
  for (const [key, value] of Object.entries(resources)) {
    assert.equal(typeof value, 'string', key);
    assert.ok(value.trim(), key);
    assert.equal(instance.exists(key), true, key);
  }
  instance.addResource('ja', 'host', 'language.label', '試験用の文言');
  assert.equal(instance.t('language.label'), '試験用の文言');
  assert.equal(createHostI18n().t('language.label'), '表示言語');
  assert.equal(hostText('language.label'), '表示言語');
});

test('interpolation preserves user names, resource-looking strings, and external text verbatim', () => {
  for (const name of [
    '表示',
    'pages.general.title',
    '{{name}} $t(language.ja)',
    '<b>& "command"</b>',
    '日本語 / English',
  ]) {
    assert.equal(hostText('appearance.shell.active', { name }), `使用先: ${name}`);
    assert.equal(hostText('settings.moved', { name }), `${name}へ移動しました。`);
  }
});

test('missing language uses Japanese without mutating input; unsupported values are rejected', () => {
  assert.deepEqual(hostLanguages, ['ja']);
  const old = createDefaultSettings();
  delete old.host.language;
  const before = JSON.stringify(old);
  assert.equal(parseSettings(old).host.language, 'ja');
  assert.equal(JSON.stringify(old), before);
  const device = initialDeviceSettings('TEST');
  delete device.host.language;
  assert.equal(parseDeviceSettings(device, 'TEST').host.language, 'ja');
  for (const invalid of ['en', '', 'ja-JP', null, 1]) {
    assert.throws(
      () => parseSettings({ ...old, host: { ...old.host, language: invalid } }),
      /host.language/,
    );
    assert.throws(
      () => parseDeviceSettings({ ...device, host: { ...device.host, language: invalid } }, 'TEST'),
      /host.language/,
    );
  }
  assert.equal(deviceSettingsStorageValue(initialDeviceSettings('TEST')).host.language, undefined);
});

test('language participates in appearance search, public settings definition, projection and reset', () => {
  const value = createDefaultSettings();
  value.host.theme = 'dark';
  const catalog = settingsCatalog([], value);
  const page = catalog.find((p) => p.id === 'appearance');
  assert.equal(page.items[0].key, 'language');
  assert.equal(page.items[0].title, '表示言語');
  assert.ok(searchSettings(catalog, '日本語').some((item) => item.id === 'appearance/language'));
  assert.equal(settingsProjection(value, page, []).host.language, 'ja');
  assert.equal(settingsJsonProjection(value, page, []).host.language, undefined);
  const reset = applySettingsJson(value, page, [], '{}');
  assert.equal(reset.host.language, 'ja');
  assert.equal(reset.host.theme, 'light');
  assert.throws(
    () => applySettingsJson(value, page, [], '{"host":{"language":"en"}}'),
    /host.language/,
  );
  const definition = hostSettingDefinitions.find((d) => d.key === 'language');
  assert.equal(definition.type, 'select');
  assert.equal(definition.default, 'ja');
  assert.deepEqual(definition.options, [{ value: 'ja', label: '日本語' }]);
  assert.ok(deviceHostKeys.includes('language'));
});

test('saving Japanese remains PC-local and preserves user commands, groups and shared bytes', (t) => {
  const parent = path.resolve('.artifacts/localization-unit');
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, 'case-'));
  const value = createDefaultSettings();
  delete value.host.language;
  value.ribbon.groups = [
    {
      id: 'group:custom',
      title: 'pages.general.title {{name}}',
      icon: 'folder',
      expansion: 'persistent',
      children: ['logs'],
    },
  ];
  value.ribbon.order = ['group:custom', 'settings'];
  value.customCommands = {
    version: 2,
    items: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        typeId: 'appdock.process.start',
        owner: { kind: 'host' },
        description: '',
        title: 'language.ja $t(language.ja)',
        configVersion: 1,
        config: {},
        enabled: true,
        automation: false,
      },
    ],
  };
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify(value));
  const before = fs.readFileSync(file, 'utf8');
  const store = new DeviceSettingsStore(file, path.join(dir, 'local'), 'LOCALIZATION');
  t.after(() => store.close());
  store.load();
  const next = structuredClone(store.value);
  next.host.language = 'ja';
  next.host.showHints = false;
  store.save(next, store.revision);
  store.reload();
  assert.equal(store.value.host.language, 'ja');
  assert.equal(store.value.ribbon.groups[0].title, value.ribbon.groups[0].title);
  assert.equal(store.value.customCommands.items[0].title, value.customCommands.items[0].title);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(JSON.parse(fs.readFileSync(store.device.file, 'utf8')).host?.language, undefined);
});

test('localized settings views and owned diagnostic modules do not reintroduce inline Japanese', () => {
  const parser = require('prettier/plugins/typescript').parsers.typescript;
  const files = [
    'src/renderer/settings/SettingsForm.tsx',
    'src/renderer/settings/AccentColorPicker.tsx',
    'src/renderer/settings/SettingsPage.tsx',
    'src/renderer/settings/SettingsIndex.tsx',
    'src/renderer/settings-ui/SettingsColorPicker.tsx',
    'src/main/core/settings-health.ts',
    'src/main/core/settings-health-notifications.ts',
    'src/main/core/windows-launch.ts',
    'src/main/core/shell-provider-registry.ts',
  ];
  for (const file of files) {
    const ast = parser.parse(fs.readFileSync(path.resolve(file), 'utf8'), { filepath: file });
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      const text =
        node.type === 'TemplateElement'
          ? node.value.cooked
          : ['Literal', 'JSXText'].includes(node.type)
            ? node.value
            : null;
      if (typeof text === 'string')
        assert.doesNotMatch(text, /[ぁ-んァ-ヶ一-龯]/, `${file}:${node.loc?.start.line}`);
      for (const [key, child] of Object.entries(node))
        if (!['loc', 'range', 'comments', 'tokens', 'raw'].includes(key)) visit(child);
    }
    visit(ast);
  }
});
