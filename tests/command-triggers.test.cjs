const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const {
  settingsCatalog,
  settingsProjection,
  applySettingsJson,
  searchSettings,
} = require('../out/main/shared/settings-catalog');
const {
  commandTriggerBindings,
  commandTriggerEnablement,
  commandTriggerBinding,
  commandTriggerInput,
  applyCommandTrigger,
  deleteCommandTrigger,
} = require('../out/main/shared/command-triggers');

test('whole-method display states stay independent and never change saved binding flags', () => {
  const value = createDefaultSettings();
  assert.equal(commandTriggerEnablement(value).shortcuts, true);
  value.keybindingOptions.enabled = false;
  value.gestures.enabled = false;
  value.touchpadGestures.enabled = true;
  const before = commandTriggerBindings(value);
  assert.deepEqual(commandTriggerEnablement(value), {
    shortcuts: false,
    gestures: false,
    'touchpad-gestures': true,
  });
  assert.deepEqual(commandTriggerBindings(value), before);
});

test('key switch JSON and form reset preserve assignments and other method settings', () => {
  const { resetSettingsPage } = require('../out/main/shared/settings-catalog');
  const value = createDefaultSettings();
  value.keybindingOptions.enabled = false;
  value.gestures.enabled = false;
  const page = settingsCatalog([], value).find((page) => page.id === 'shortcuts');
  const projected = settingsProjection(value, page, []);
  assert.equal(projected.keybindingOptions.enabled, false);
  const reset = resetSettingsPage(value, page, [], 'form');
  assert.equal(reset.keybindingOptions.enabled, true);
  assert.deepEqual(commandTriggerBindings(reset), commandTriggerBindings(value));
  assert.equal(reset.gestures.enabled, false);
  const commandPage = settingsCatalog([], value).find((page) => page.id === 'command-triggers');
  const triggerReset = resetSettingsPage(value, commandPage, [], 'shortcuts');
  assert.equal(triggerReset.keybindingOptions.enabled, false);
});

function fixture() {
  const value = createDefaultSettings();
  const common = { id: 'same-id', command: 'fixture.command', enabled: false };
  value.keybindings = [{ ...common, key: 'Ctrl+F8', when: { scope: 'app', appletIds: [] } }];
  value.gestures.bindings = [
    { ...common, gesture: 'move-down', when: { scope: 'global', appletIds: [], processes: [] } },
    {
      ...common,
      id: 'mouse-second',
      gesture: 'move-up',
      when: { scope: 'app', appletIds: [], processes: [] },
    },
  ];
  value.touchpadGestures.bindings = [
    { ...common, gesture: 'four.right', when: { scope: 'global', appletIds: [], processes: [] } },
    {
      ...common,
      id: 'touchpad-second',
      gesture: 'three.tap',
      when: { scope: 'app', appletIds: [], processes: [] },
    },
  ];
  value.gestures.distance = 87;
  value.gestures.executionMode = 'first';
  value.commandTriggerOptions.browsers = ['custom-browser'];
  value.touchpadGestures.connections['three.tap'] = { key: 'F13', modifiers: ['Ctrl'] };
  return value;
}
test('combined view namespaces identities and preserves each saved execution array', () => {
  const settings = fixture();
  const before = structuredClone(settings);
  const rows = commandTriggerBindings(settings);
  assert.equal(rows.length, 5);
  assert.equal(new Set(rows.map((row) => row.id)).size, 5);
  assert.equal(new Set(rows.map(commandTriggerInput)).size, 5);
  assert.deepEqual(
    rows.filter((row) => row.kind === 'touchpad-gestures').map((row) => row.binding.gesture),
    ['three.tap', 'four.right'],
  );
  assert.deepEqual(settings, before);
});
test('editing an overlapping ID changes only its source and keeps the stored ID', () => {
  for (const kind of ['shortcuts', 'gestures', 'touchpad-gestures']) {
    const settings = fixture();
    const original = commandTriggerBindings(settings).find((row) => row.kind === kind);
    const edited = structuredClone(original);
    edited.binding.enabled = true;
    edited.enabled = true;
    const saved = applyCommandTrigger(settings, edited, original);
    assert.equal(
      commandTriggerBindings(saved).find((row) => row.id === original.id).binding.id,
      original.binding.id,
    );
    const expected = structuredClone(settings);
    const source =
      kind === 'shortcuts'
        ? expected.keybindings
        : expected[kind === 'gestures' ? 'gestures' : 'touchpadGestures'].bindings;
    source.find((row) => row.id === original.binding.id).enabled = true;
    // Key edits also refresh the existing legacy shortcut projection.
    if (kind === 'shortcuts') {
      assert.deepEqual(saved.gestures, expected.gestures);
      assert.deepEqual(saved.touchpadGestures, expected.touchpadGestures);
      assert.deepEqual(saved.keybindings, expected.keybindings);
    } else assert.deepEqual(saved, expected);
  }
});
test('addition uses the existing same-input insertion order without persisting view metadata', () => {
  const settings = fixture();
  settings.keybindings.push({ ...settings.keybindings[0], id: 'other-key', key: 'Ctrl+F9' });
  const saved = applyCommandTrigger(
    settings,
    commandTriggerBinding('shortcuts', {
      ...settings.keybindings[0],
      id: 'added',
      command: 'fixture.second',
    }),
  );
  assert.deepEqual(
    saved.keybindings.map((row) => row.id),
    ['same-id', 'added', 'other-key'],
  );
  assert(!saved.keybindings.some((row) => 'kind' in row || 'binding' in row));
  assert.deepEqual(saved.gestures, settings.gestures);
});
test('deletion preserves equal IDs belonging to the other trigger kinds', () => {
  const settings = fixture();
  const row = commandTriggerBindings(settings).find(
    (row) => row.kind === 'gestures' && row.binding.id === 'same-id',
  );
  const saved = deleteCommandTrigger(settings, row);
  assert.deepEqual(
    saved.gestures.bindings.map((row) => row.id),
    ['mouse-second'],
  );
  assert.deepEqual(saved.keybindings, settings.keybindings);
  assert.deepEqual(saved.touchpadGestures, settings.touchpadGestures);
});
test('stale edit/delete fail while unrelated concurrent edits survive', () => {
  const settings = fixture();
  const original = commandTriggerBindings(settings).find((row) => row.kind === 'gestures');
  const edited = structuredClone(original);
  edited.binding.gesture = 'move-right';
  settings.touchpadGestures.bindings[0].enabled = true;
  assert.deepEqual(
    applyCommandTrigger(settings, edited, original).touchpadGestures,
    settings.touchpadGestures,
  );
  settings.gestures.bindings.find((row) => row.id === original.binding.id).enabled = true;
  assert.throws(() => applyCommandTrigger(settings, edited, original), /別の場所で変更/);
  assert.throws(() => deleteCommandTrigger(settings, original), /別の場所で変更/);
});
test('new page edits only the three binding stores and cannot overwrite trigger options', () => {
  const settings = fixture();
  const pages = settingsCatalog([], settings);
  const page = pages.find((page) => page.id === 'command-triggers');
  assert(page);
  assert(searchSettings(pages, 'コマンドトリガー').some((item) => item.pageId === page.id));
  const projection = settingsProjection(settings, page, []);
  assert.equal(projection.commandTriggerOptions, undefined);
  assert.deepEqual(Object.keys(projection.gestures), ['bindings', 'inputExecutionModes']);
  assert.deepEqual(Object.keys(projection.touchpadGestures), ['bindings', 'inputExecutionModes']);
  projection.gestures.bindings[0].enabled = true;
  const saved = applySettingsJson(settings, page, [], JSON.stringify(projection));
  assert.equal(saved.gestures.bindings[0].enabled, true);
  assert.equal(saved.gestures.distance, 87);
  assert.deepEqual(saved.commandTriggerOptions.browsers, ['custom-browser']);
  assert.deepEqual(saved.touchpadGestures.connections, settings.touchpadGestures.connections);
  assert.equal(saved.gestures.executionMode, 'first');
  assert.throws(() =>
    applySettingsJson(
      settings,
      page,
      [],
      JSON.stringify({ ...projection, gestures: { ...projection.gestures, distance: 1 } }),
    ),
  );
  assert.doesNotThrow(() => parseSettings(saved));
  for (const id of ['shortcuts', 'gestures', 'touchpad-gestures'])
    assert(
      pages.some((page) => page.id === id),
      'existing page remains available',
    );
});
