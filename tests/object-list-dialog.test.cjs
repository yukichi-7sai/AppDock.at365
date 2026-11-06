const { siblingManifest } = require('./fixtures/sibling-manifest.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const {
  parseSettingDefinitions,
  validateSettingValue,
} = require('../out/main/shared/setting-definitions');
const {
  objectFieldValue,
  normalizeObject,
  setObjectField,
} = require('../out/main/shared/object-list');
const { SettingsStore } = require('../out/main/main/core/settings');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const manifest = siblingManifest('Applet.WebApplet.at365');
test('declarative lists validate columns, nested paths and option sources', () => {
  const fields = parseSettingDefinitions(manifest.settings);
  assert.equal(fields[0].list.titleKey, 'name');
  assert.throws(() => validateSettingValue(fields[0], [{ id: 'same' }, { id: 'same' }]));
  assert.throws(() => validateSettingValue(fields[0], [{}]));
  for (const patch of [
    { columns: ['missing'] },
    { enabledKey: 'url' },
    { idKey: 'enabled' },
    { titleKey: 'missing' },
    { showIndex: 'yes' },
  ]) {
    const item = structuredClone(manifest.settings[0]);
    Object.assign(item.list, patch);
    assert.throws(() => parseSettingDefinitions([item]));
  }
  for (const propertyPath of [['__proto__', 'polluted'], [], ['when', 'constructor']]) {
    const item = structuredClone(manifest.settings[1]);
    item.fields[3].propertyPath = propertyPath;
    assert.throws(() => parseSettingDefinitions([item]));
  }
  const scope = fields[1].fields.find((f) => f.key === 'scope');
  const row = { when: { scope: 'owner', appletIds: ['test.page'] }, private: 'retained' };
  const next = normalizeObject(row, fields[1].fields);
  setObjectField(next, scope, 'global');
  assert.equal(row.when.scope, 'owner');
  assert.equal(objectFieldValue(next, scope), 'global');
  assert.deepEqual(next.when.appletIds, ['test.page']);
  assert.equal(next.private, 'retained');
  validateSettingValue(fields[1], [next]);
});

test('numbered monitor lists migrate legacy rows on edit and still reject conflicting saves', (t) => {
  const manifest = siblingManifest('Applet.WallpaperSlideshow.at365');
  const definition = parseSettingDefinitions(manifest.settings).find(
    (field) => field.key === 'monitors',
  );
  assert.equal(definition.list.showIndex, true);
  const rows = [{ Folder: 'C:/Images', Mode: 4, PaddingBottom: 40, private: 'keep' }];
  const next = rows.map((row) => normalizeObject(row, definition.fields));
  assert.deepEqual(next[0].Folders, ['C:/Images']);
  assert.equal(next[0].Mode, 'Tile');
  assert.equal(next[0].Folder, undefined);
  assert.equal(next[0].private, 'keep');
  validateSettingValue(definition, next);
  const root = path.resolve('.artifacts/list-unit');
  fs.mkdirSync(root, { recursive: true });
  const store = new SettingsStore(
    path.join(fs.mkdtempSync(path.join(root, 'legacy-')), 'settings.json'),
  );
  store.load();
  t.after(() => store.close());
  const settings = structuredClone(store.value);
  settings.extensions[manifest.id] = {
    enabled: false,
    settings: { monitors: JSON.stringify(rows), private: 'unchanged' },
  };
  store.save(settings, store.revision);
  const commands = new SettingsCommands({
    settings: store,
    applets: () => [],
    save: (v, r) => store.save(v, r),
  });
  commands.replaceOwnList(manifest, 'monitors', next, rows);
  assert.deepEqual(store.value.extensions[manifest.id].settings.monitors, next);
  assert.equal(store.value.extensions[manifest.id].settings.private, 'unchanged');
  assert.throws(() => commands.replaceOwnList(manifest, 'monitors', [], rows), /変更/);
});
test('grouped list saves preserve other settings and reject stale or undeclared edits', (t) => {
  const root = path.resolve('.artifacts/list-unit');
  fs.mkdirSync(root, { recursive: true });
  const folder = fs.mkdtempSync(path.join(root, 'case-'));
  const store = new SettingsStore(path.join(folder, 'settings.json'));
  store.load();
  t.after(() => store.close());
  const definition = manifest.settings[1],
    before = structuredClone(definition.default);
  const settings = structuredClone(store.value);
  settings.extensions[manifest.id] = {
    enabled: true,
    settings: { shortcutDefaults: before, private: 'retained' },
  };
  store.save(settings, store.revision);
  const commands = new SettingsCommands({
    settings: store,
    applets: () => [],
    save: (v, r) => store.save(v, r),
  });
  const next = structuredClone(before);
  next[0].key = 'Ctrl+F5';
  commands.replaceOwnList(manifest, 'shortcutDefaults', next, before);
  assert.equal(store.value.extensions[manifest.id].settings.private, 'retained');
  assert.throws(
    () => commands.replaceOwnList(manifest, 'shortcutDefaults', before, before),
    /変更/,
  );
  assert.throws(() => commands.replaceOwnList(manifest, 'private', [], []), /宣言/);
  assert.equal(store.value.extensions[manifest.id].settings.shortcutDefaults[0].key, 'Ctrl+F5');
});
