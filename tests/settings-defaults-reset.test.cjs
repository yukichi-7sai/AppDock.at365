const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const {
  settingsCatalog,
  settingsProjection,
  settingsJsonProjection,
  applySettingsJson,
} = require('../out/main/shared/settings-catalog');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const {
  fillSettingDefaults,
  omitSettingDefaults,
} = require('../out/main/shared/settings-defaults');
const {
  initialDeviceSettings,
  parseDeviceSettings,
} = require('../out/main/main/core/device-settings');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { SettingsInputSession } = require('../out/main/main/core/settings-input-session');

const applet = {
  id: 'fixture.defaults',
  displayName: 'Defaults',
  runtime: 'node',
  startupDelaySeconds: 5,
  pages: [{ id: 'main', title: 'Main', defaultDisplay: 'window' }],
  settings: [
    { key: 'interval', type: 'number', title: 'Interval', default: 60 },
    { key: 'switch', type: 'boolean', title: 'Switch', default: true },
    { key: 'items', type: 'string-list', title: 'Items', default: ['one'] },
  ],
};
const applets = [applet];
function fixture(t) {
  const root = path.resolve('.artifacts/settings-defaults-reset');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const initial = createDefaultSettings();
  initial.extensions[applet.id] = {
    enabled: false,
    settings: { interval: 60, unknown: 'keep' },
    updateSource: 'github:custom/source',
  };
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify(initial));
  const store = new DeviceSettingsStore(
    file,
    path.join(dir, 'local'),
    'PC-RESET',
    () => [],
    () => applets,
  );
  store.load();
  t.after(() => store.close());
  return { store, file };
}
const disk = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const page = (value, id) => settingsCatalog(applets, value).find((p) => p.id === id);

test('shortcut options participate in sparse page JSON and reset independently of gestures', () => {
  const saved = createDefaultSettings();
  saved.keybindingOptions = { executionMode: 'first' };
  saved.gestures.executionMode = 'first';
  const shortcutPage = page(saved, 'shortcuts');
  assert.equal(shortcutPage.title, 'キージェスチャー');
  assert.equal(
    shortcutPage.items.some((item) => item.key === 'keybindings'),
    false,
  );
  const projected = settingsJsonProjection(saved, shortcutPage, applets);
  assert.deepEqual(projected.keybindingOptions, { executionMode: 'first' });
  const reset = applySettingsJson(saved, shortcutPage, applets, '{}');
  assert.equal(reset.keybindingOptions.executionMode, 'all');
  assert.equal(reset.gestures.executionMode, 'first');
  assert.equal(settingsJsonProjection(reset, shortcutPage, applets).keybindingOptions, undefined);
  assert.throws(() =>
    applySettingsJson(
      saved,
      shortcutPage,
      applets,
      JSON.stringify({ keybindingOptions: { executionMode: 'invalid' } }),
    ),
  );
});

test('sparse JSON round trips host settings; false, zero, empty arrays and unknown leaves remain meaningful', () => {
  const value = createDefaultSettings();
  value.host.soundEnabled = false;
  value.host.future = 'keep';
  value.updates.startupDelaySeconds = 0;
  value.ribbon.bottom = [];
  const stored = settingsStorageValue(value);
  assert.equal(stored.host.theme, undefined);
  assert.equal(stored.host.soundEnabled, false);
  assert.equal(stored.host.future, 'keep');
  assert.equal(stored.updates.startupDelaySeconds, 0);
  assert.deepEqual(stored.ribbon.bottom, []);
  assert.deepEqual(parseSettings(stored), parseSettings(value));
  assert.equal(fillSettingDefaults({}, { option: 2 }).option, 2);
  assert.deepEqual(omitSettingDefaults({ x: { b: 2, a: 1 } }, { x: { a: 1, b: 2 } }), undefined);
  assert.throws(() => parseSettings({ schemaVersion: 1, host: { theme: null } }));
  assert.throws(() => parseDeviceSettings({}, 'PC-RESET'));
});

test('every host JSON page accepts an empty object and displays an empty default projection', () => {
  const current = createDefaultSettings();
  current.host.theme = 'dark';
  current.host.accentColor = 'custom';
  current.host.customAccentDark = '#123456';
  current.host.customAccentLight = '#FEDCBA';
  current.host.soundEnabled = false;
  current.extensions['missing.owner'] = { enabled: false, settings: { keep: 9 } };
  for (const p of settingsCatalog([], current).filter((p) => p.json)) {
    const reset = applySettingsJson(current, p, [], '{}');
    assert.deepEqual(settingsJsonProjection(reset, p, []), {}, p.id);
    assert.deepEqual(reset.extensions['missing.owner'], current.extensions['missing.owner']);
    if (p.id !== 'appearance') assert.equal(reset.host.theme, 'dark');
  }
});

test('page reset includes the relocated update source while retaining enabled state and unknown pages', () => {
  const current = createDefaultSettings();
  current.extensions[applet.id] = {
    enabled: false,
    settings: { interval: 120, unknown: 1 },
    startupDelaySeconds: 9,
    pages: { main: { display: 'page' }, missing: { display: 'page' } },
    updateSource: 'github:custom/source',
  };
  const p = page(current, 'applet:' + applet.id);
  const reset = applySettingsJson(current, p, applets, '{}');
  assert.deepEqual(reset.extensions[applet.id].settings, {});
  assert.equal(reset.extensions[applet.id].startupDelaySeconds, undefined);
  assert.deepEqual(reset.extensions[applet.id].pages, { missing: { display: 'page' } });
  assert.equal(reset.extensions[applet.id].enabled, false);
  assert.equal(reset.extensions[applet.id].updateSource, undefined);
  assert.equal(current.extensions[applet.id].updateSource, 'github:custom/source');
  assert.deepEqual(settingsJsonProjection(reset, p, applets), {});
  assert.throws(
    () => applySettingsJson(current, p, applets, '{"host":{"theme":"dark"}}'),
    /変更できない/,
  );
});

test('reading old full files does not rewrite them, and resetting defaults never regenerates keys after restart', (t) => {
  const { store, file } = fixture(t);
  const original = fs.readFileSync(file, 'utf8');
  store.reload();
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  let next = structuredClone(store.value);
  next.host.theme = 'dark';
  store.save(next, store.revision);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  next = structuredClone(store.value);
  next.host.theme = 'light';
  store.save(next, store.revision);
  assert.equal(disk(store.device.file).host.theme, undefined);
  store.reload();
  assert.equal(store.value.host.theme, 'light');
  assert.equal(disk(store.device.file).host.theme, undefined);
  const oldDevice = initialDeviceSettings('PC-RESET');
  assert.deepEqual(
    parseDeviceSettings({ schemaVersion: 1, machineName: 'PC-RESET' }, 'PC-RESET'),
    oldDevice,
  );
});

test('local Applet defaults stay independent from shared values and future declared defaults take effect', (t) => {
  const { store } = fixture(t);
  store.setLocalSettings(applet.id, true, store.revision);
  let next = structuredClone(store.value);
  next.extensions[applet.id].settings.interval = 120;
  store.save(next, store.revision);
  next = structuredClone(store.value);
  next.extensions[applet.id].settings.interval = 60;
  store.save(next, store.revision);
  assert.equal(
    disk(store.device.file).extensions[applet.id].configuration.settings.interval,
    undefined,
  );
  const shared = disk(store.shared.file);
  shared.extensions[applet.id].settings.interval = 300;
  fs.writeFileSync(store.shared.file, JSON.stringify(shared));
  store.reload();
  assert.equal(store.value.extensions[applet.id].settings.interval, undefined);
  const { SettingsCommands } = require('../out/main/main/core/settings-commands');
  const commands = new SettingsCommands({
    settings: store,
    applets: () => [
      {
        ...applet,
        settings: [
          { key: 'interval', title: 'Interval', type: 'number', default: 90, automation: true },
        ],
      },
    ],
    save: (v, r) => store.save(v, r),
  });
  assert.equal(commands.get(applet.id).values.interval, 90);
});

for (const disposition of ['keep', 'clear', 'share'])
  test('OFF choice ' + disposition + ' preserves boundaries and restart state', (t) => {
    const { store, file } = fixture(t);
    store.setLocalSettings(applet.id, true, store.revision);
    let next = structuredClone(store.value);
    next.extensions[applet.id].settings = { interval: 120, items: [] };
    next.extensions[applet.id].startupDelaySeconds = 7;
    store.save(next, store.revision);
    const before = fs.readFileSync(file, 'utf8');
    store.setLocalSettings(applet.id, false, store.revision, undefined, disposition);
    assert.equal(store.localSettings(applet.id), false);
    assert.equal(store.value.extensions[applet.id].enabled, false);
    assert.equal(store.value.extensions[applet.id].updateSource, 'github:custom/source');
    if (disposition === 'share') {
      assert.deepEqual(disk(file).extensions[applet.id].settings, { interval: 120, items: [] });
      assert.equal(disk(file).extensions[applet.id].startupDelaySeconds, 7);
    } else assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.equal(
      !!disk(store.device.file).extensions[applet.id].configuration,
      disposition === 'keep',
    );
    store.reload();
    store.setLocalSettings(applet.id, true, store.revision);
    const { SettingsCommands } = require('../out/main/main/core/settings-commands');
    const commands = new SettingsCommands({
      settings: store,
      applets: () => [
        {
          ...applet,
          settings: applet.settings.map((field) => ({
            ...field,
            automation: field.key === 'interval',
          })),
        },
      ],
      save: (v, r) => store.save(v, r),
    });
    assert.equal(commands.get(applet.id).values.interval, disposition === 'clear' ? 60 : 120);
  });

test('share failure rolls back both sparse files and the selected mode; stale revisions cannot clear', (t) => {
  const { store, file } = fixture(t);
  store.setLocalSettings(applet.id, true, store.revision);
  const next = structuredClone(store.value);
  next.extensions[applet.id].settings.interval = 123;
  store.save(next, store.revision);
  const beforeShared = fs.readFileSync(file, 'utf8');
  const beforeDevice = fs.readFileSync(store.device.file, 'utf8');
  const save = store.device.save;
  store.device.save = () => {
    throw Error('injected save failure');
  };
  assert.throws(
    () => store.setLocalSettings(applet.id, false, store.revision, undefined, 'share'),
    /injected/,
  );
  store.device.save = save;
  assert.equal(fs.readFileSync(file, 'utf8'), beforeShared);
  assert.equal(fs.readFileSync(store.device.file, 'utf8'), beforeDevice);
  assert.equal(store.localSettings(applet.id), true);
  assert.throws(
    () => store.setLocalSettings(applet.id, false, store.revision - 1, undefined, 'clear'),
    /変更/,
  );
});

test('reset operation checks confirmation revision and saves through the existing input session', async () => {
  let snapshot = { value: createDefaultSettings(), revision: 1 };
  snapshot.value.host.theme = 'dark';
  const session = new SettingsInputSession({
    current: () => snapshot,
    scope: () => 'device',
    applets: () => [],
    changed() {},
    save: async (value, revision, resetPage) => {
      assert.equal(revision, snapshot.revision);
      assert.equal(resetPage.id, 'appearance');
      return (snapshot = { value, revision: revision + 1 });
    },
  });
  const state = session.snapshot();
  const request = {
    sessionId: state.sessionId,
    editRevision: state.editRevision,
    operationId: crypto.randomUUID(),
    action: {
      type: 'reset-page',
      pageId: 'appearance',
      before: session.jsonProjection(),
      revision: 0,
      storageScope: 'device',
    },
  };
  await assert.rejects(session.act(request), /変更/);
  await session.act({
    ...request,
    operationId: crypto.randomUUID(),
    action: { ...request.action, revision: 1 },
  });
  assert.deepEqual(session.jsonProjection(), {});
  assert.equal(snapshot.value.host.theme, 'light');
});

test('registered child pages inherit field defaults, retain registration identity and follow future defaults', () => {
  const { PageCollectionManager } = require('../out/main/main/core/page-collections');
  const { restoreSettingsCollections } = require('../out/main/shared/settings-storage');
  const { validateCollectionRecords } = require('../out/main/shared/page-collections');
  const parent = {
    ...applet,
    id: 'fixture.collection',
    pageCollections: [
      {
        key: 'rows',
        source: 'local',
        ui: 'main.html',
        fields: [
          { key: 'name', type: 'string', title: 'Name' },
          {
            key: 'display',
            type: 'select',
            title: 'Display',
            options: [
              { value: 'page', label: 'Page' },
              { value: 'window', label: 'Window' },
            ],
          },
        ],
      },
    ],
    settings: [
      {
        key: 'rows',
        type: 'object-list',
        title: 'Rows',
        default: [],
        fields: [
          { key: 'id', type: 'string', title: 'ID' },
          { key: 'name', type: 'string', title: 'Name', default: 'New' },
          { key: 'enabled', type: 'boolean', title: 'Enabled', default: true },
          {
            key: 'display',
            type: 'select',
            title: 'Display',
            default: 'page',
            options: [
              { value: 'page', label: 'Page' },
              { value: 'window', label: 'Window' },
            ],
          },
        ],
      },
    ],
  };
  const current = createDefaultSettings();
  current.extensions[parent.id] = {
    enabled: false,
    settings: {
      rows: [
        { id: 'one', name: 'Edited', enabled: true, display: 'window', opaque: { keep: true } },
        { id: 'two', name: 'Other', enabled: false, display: 'page' },
      ],
    },
  };
  const manager = new PageCollectionManager({
    settings: () => current,
    parents: () => [parent],
    localRoot: 'unused',
    sharedRoot: 'unused',
    changed() {},
    failed() {},
    openLocal: async () => {},
  });
  const children = manager.snapshot();
  assert.equal(children[0].settings[0].default, 'New');
  const all = [parent, ...children];
  const p = settingsCatalog(all, current).find((p) => p.owner === children[0].id);
  const reset = applySettingsJson(current, p, all, '{}');
  assert.deepEqual(settingsJsonProjection(reset, p, all), {});
  const raw = settingsStorageValue(reset, [parent]);
  const rows = raw.extensions[parent.id].settings.rows;
  assert.deepEqual(rows[0], { id: 'one', opaque: { keep: true } });
  assert.deepEqual(rows[1], { id: 'two', name: 'Other', enabled: false });
  const source = parseSettings(raw);
  const beforeRestore = JSON.stringify(source);
  const restored = restoreSettingsCollections(source, [parent]);
  assert.equal(JSON.stringify(source), beforeRestore);
  assert.doesNotThrow(() =>
    validateCollectionRecords(
      parent.pageCollections[0],
      restored.extensions[parent.id].settings.rows,
    ),
  );
  parent.settings[0].fields.find((field) => field.key === 'name').default = 'Next version';
  assert.equal(
    restoreSettingsCollections(parseSettings(raw), [parent]).extensions[parent.id].settings.rows[0]
      .name,
    'Next version',
  );
});

test('restoring an old full configuration accepts the canonical sparse state on the next edit', (t) => {
  const { store, file } = fixture(t);
  const original = fs.readFileSync(file, 'utf8');
  const legacy = path.join(path.dirname(file), 'legacy-full.json');
  fs.writeFileSync(legacy, original);
  fs.writeFileSync(file, '{broken');
  assert.throws(() => store.reload(), /不正/);
  const plan = store.prepareRecovery(legacy, 'shared');
  store.restoreRecovery(plan);
  assert.equal(disk(file).extensions[applet.id].settings.interval, undefined);
  const next = structuredClone(store.value);
  next.host.theme = 'dark';
  assert.doesNotThrow(() => store.save(next, store.revision));
  assert.equal(store.value.host.theme, 'dark');
});

test('legacy command maps keep explicit empty assignments while omitted maps follow current defaults', () => {
  const value = createDefaultSettings();
  const command = Object.keys(value.shortcuts)[0];
  value.shortcuts[command] = [];
  const raw = settingsStorageValue(value);
  assert.deepEqual(parseSettings(raw).shortcuts, value.shortcuts);
  assert.deepEqual(parseSettings(raw).shortcuts[command], []);
  assert.deepEqual(
    parseSettings({ schemaVersion: 1 }).shortcuts,
    createDefaultSettings().shortcuts,
  );
});
