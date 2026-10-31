const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const { hostSettingDefinitions } = require('../out/main/shared/host-settings');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const {
  settingsCatalog,
  settingsJsonProjection,
  applySettingsJson,
  resetSettingsPage,
} = require('../out/main/shared/settings-catalog');

test('general JSON and page reset include assistance values while preserving another page', () => {
  const current = createDefaultSettings();
  current.host.theme = 'dark';
  const page = settingsCatalog([], current).find((page) => page.id === 'general');
  const edited = parseSettings(
    applySettingsJson(
      current,
      page,
      [],
      JSON.stringify({
        host: {
          fileWatchAssistanceEnabled: true,
          fileWatchAssistanceIntervalSeconds: 2.5,
        },
      }),
    ),
  );
  const json = settingsJsonProjection(edited, page, []);
  assert.equal(json.host.fileWatchAssistanceEnabled, true);
  assert.equal(json.host.fileWatchAssistanceIntervalSeconds, 2.5);
  const reset = parseSettings(resetSettingsPage(edited, page, []));
  assert.equal(reset.host.fileWatchAssistanceEnabled, false);
  assert.equal(reset.host.fileWatchAssistanceIntervalSeconds, 300);
  assert.equal(reset.host.theme, 'dark');
});

test('assistance defaults, sparse storage and public field metadata share the ordinary settings contract', () => {
  const settings = createDefaultSettings();
  assert.equal(settings.host.fileWatchAssistanceEnabled, false);
  assert.equal(settings.host.fileWatchAssistanceIntervalSeconds, 300);
  const stored = settingsStorageValue(settings);
  assert.equal(stored.host?.fileWatchAssistanceEnabled, undefined);
  assert.equal(stored.host?.fileWatchAssistanceIntervalSeconds, undefined);
  const fields = hostSettingDefinitions.filter((field) =>
    field.key.startsWith('fileWatchAssistance'),
  );
  assert.equal(fields.length, 2);
  assert(fields.every((field) => field.pageId === 'general' && field.automation));
  assert.equal(fields.find((field) => field.type === 'number').minimum, 2);
});

test('settings validation rejects invalid intervals while retaining fractional values and an OFF interval', () => {
  for (const interval of [1.999, 0, -1, null, '2', NaN, Infinity]) {
    const settings = createDefaultSettings();
    settings.host.fileWatchAssistanceIntervalSeconds = interval;
    assert.throws(() => parseSettings(settings));
  }
  const settings = createDefaultSettings();
  settings.host.fileWatchAssistanceIntervalSeconds = 2.5;
  assert.equal(parseSettings(settings).host.fileWatchAssistanceIntervalSeconds, 2.5);
  settings.host.fileWatchAssistanceEnabled = 'true';
  assert.throws(() => parseSettings(settings));
});

test('general-page device storage preserves assistance values through reload without modifying shared values', (t) => {
  const root = fs.mkdtempSync(path.resolve('.artifacts/file-watch-settings-'));
  const file = path.join(root, 'data/settings.json');
  let store = new DeviceSettingsStore(file, path.join(root, 'local'), 'TEST');
  store.load();
  t.after(() => store.close());
  const shared = fs.readFileSync(file);
  store.save(
    {
      ...store.value,
      host: {
        ...store.value.host,
        fileWatchAssistanceEnabled: true,
        fileWatchAssistanceIntervalSeconds: 2.5,
      },
    },
    store.revision,
  );
  assert.equal(store.settingScope(['host', 'fileWatchAssistanceEnabled']), 'device');
  assert(fs.readFileSync(file).equals(shared));
  store.close();
  store = new DeviceSettingsStore(file, path.join(root, 'local'), 'TEST');
  store.load();
  assert.equal(store.value.host.fileWatchAssistanceEnabled, true);
  assert.equal(store.value.host.fileWatchAssistanceIntervalSeconds, 2.5);
  store.save(
    { ...store.value, host: { ...store.value.host, fileWatchAssistanceEnabled: false } },
    store.revision,
  );
  assert.equal(store.value.host.fileWatchAssistanceIntervalSeconds, 2.5);
});
