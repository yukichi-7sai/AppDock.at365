const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const {
  settingsCatalog,
  settingsProjection,
  applySettingsJson,
} = require('../out/main/shared/settings-catalog');
const { planKeybindings, nativeShortcutInputs } = require('../out/main/shared/keybindings');
const { planGestureCommands } = require('../out/main/shared/gestures');
const { planTouchpadCommands } = require('../out/main/shared/touchpad-gestures');
const { applyBindingSettings } = require('../out/main/shared/binding-order');
const { inputExecutionMode } = require('../out/main/shared/input-execution');
const fixture = () => {
  const settings = createDefaultSettings();
  const rows = ['disabled', 'a', 'duplicate', 'b', 'unavailable'].map((id) => ({
    id,
    command: id === 'duplicate' ? 'a' : id,
    enabled: id !== 'disabled',
    when: { scope: 'global', appletIds: [], processes: [] },
  }));
  settings.keybindings = rows.map((row) => ({ ...row, key: 'Ctrl+F8' }));
  settings.gestures.bindings = rows.map((row) => ({ ...row, gesture: 'move-up' }));
  settings.touchpadGestures.bindings = rows.map((row) => ({ ...row, gesture: 'three.tap' }));
  return settings;
};
const stores = [
  ['keybindingOptions', 'Ctrl+F8'],
  ['gestures', 'move-up'],
  ['touchpadGestures', 'three.tap'],
];
const commands = ['disabled', 'a', 'b'].map((id) => ({ id }));
const target = { window: '1', processName: 'editor', desktop: false };
const plans = {
  keybindingOptions: (s) =>
    planKeybindings(
      s.keybindings,
      'Ctrl+F8',
      { appFocused: false, target },
      commands,
      true,
      s.keybindingOptions.executionMode,
      s.keybindingOptions,
    ),
  gestures: (s) =>
    planGestureCommands(
      s.gestures,
      'move-up',
      { appFocused: false, window: '1' },
      target,
      commands,
    ),
  touchpadGestures: (s) =>
    planTouchpadCommands(s.touchpadGestures, 'three.tap', { host: {}, target }, commands),
};
for (const [store, input] of stores) {
  test(`${store}: per-input first/all overrides, inheritance and exclusions share selection`, () => {
    const s = fixture(),
      value = s[store];
    value.executionMode = 'first';
    assert.deepEqual(plans[store](s).commands, ['a']);
    value.inputExecutionModes[input] = 'all';
    assert.deepEqual(plans[store](s).commands, ['a', 'b']);
    value.executionMode = 'all';
    value.inputExecutionModes[input] = 'first';
    assert.deepEqual(plans[store](s).commands, ['a']);
    delete value.inputExecutionModes[input];
    assert.deepEqual(plans[store](s).commands, ['a', 'b']);
    value.inputExecutionModes[input] = 'all';
    value.excludedProcesses = ['editor'];
    assert.deepEqual(plans[store](s).commands, []);
  });
  test(`${store}: overrides round trip and legacy omissions inherit`, () => {
    const s = fixture();
    s[store].inputExecutionModes[input] = 'first';
    const restored = parseSettings(settingsStorageValue(s));
    assert.deepEqual(restored[store].inputExecutionModes, { [input]: 'first' });
    delete s[store].inputExecutionModes;
    assert.deepEqual(parseSettings(s)[store].inputExecutionModes, {});
    for (const invalid of [
      null,
      [],
      { [input]: 'inherit' },
      { [input]: 'invalid' },
      { invalid: 'all' },
    ]) {
      s[store].inputExecutionModes = invalid;
      assert.throws(() => parseSettings(s));
    }
  });
}
test('key normalization rejects duplicate identities; input maps stay independent and reset with combined page', () => {
  const s = fixture();
  s.keybindingOptions.inputExecutionModes = { 'ctrl+f8': 'first' };
  for (const [store, input] of stores.slice(1)) s[store].inputExecutionModes[input] = 'all';
  const normalized = parseSettings(s);
  assert.deepEqual(normalized.keybindingOptions.inputExecutionModes, { 'Ctrl+F8': 'first' });
  const page = settingsCatalog([], normalized).find((page) => page.id === 'command-triggers');
  const projected = settingsProjection(normalized, page, []);
  for (const [store, input] of stores)
    assert.equal(
      projected[store].inputExecutionModes[input],
      store === 'keybindingOptions' ? 'first' : 'all',
    );
  const defaults = settingsProjection(createDefaultSettings(), page, []);
  const reset = applySettingsJson(normalized, page, [], JSON.stringify(defaults));
  for (const [store] of stores) assert.deepEqual(reset[store].inputExecutionModes, {});
  s.keybindingOptions.inputExecutionModes = { 'ctrl+f8': 'all', 'Ctrl+F8': 'first' };
  assert.throws(() => parseSettings(s));
});
test('keyboard aliases keep one batch and native input ownership ignores execution overrides', () => {
  assert.equal(inputExecutionMode('all', {}, ['Ctrl+]', 'Ctrl+OemCloseBrackets']), 'all');
  assert.equal(
    inputExecutionMode('all', { 'Ctrl+]': 'first' }, ['Ctrl+OemCloseBrackets', 'Ctrl+]']),
    'first',
  );
  const s = fixture();
  const before = nativeShortcutInputs(
    s.keybindings,
    commands.map((c) => c.id),
    s.keybindingOptions,
  );
  s.keybindingOptions.inputExecutionModes = { 'Ctrl+F8': 'first' };
  assert.deepEqual(
    nativeShortcutInputs(
      s.keybindings,
      commands.map((c) => c.id),
      s.keybindingOptions,
    ),
    before,
  );
});
test('mode and order apply atomically; unrelated concurrent groups survive and same-group changes conflict', () => {
  const original = [
    { id: 'a', input: 'x' },
    { id: 'z', input: 'y' },
    { id: 'b', input: 'x' },
  ];
  const ordered = [original[2], original[1], original[0]];
  const live = [original[0], { ...original[1], extra: true }, original[2]];
  const input = (row) => row.input,
    label = (value) => value;
  const merged = applyBindingSettings(
    live,
    original,
    ordered,
    { y: 'first' },
    {},
    { x: 'all' },
    input,
    label,
  );
  assert.deepEqual(merged.bindings, [original[2], live[1], original[0]]);
  assert.deepEqual(merged.inputExecutionModes, { y: 'first', x: 'all' });
  assert.throws(() =>
    applyBindingSettings(live, original, ordered, { x: 'first' }, {}, { x: 'all' }, input, label),
  );
  assert.throws(() =>
    applyBindingSettings(live.slice(1), original, original, {}, {}, { x: 'first' }, input, label),
  );
  assert.deepEqual(
    applyBindingSettings(
      original,
      original,
      original,
      { x: 'all', y: 'first' },
      { x: 'all' },
      {},
      input,
      label,
    ).inputExecutionModes,
    { y: 'first' },
  );
  assert.deepEqual(
    original.map((row) => row.id),
    ['a', 'z', 'b'],
  );
});
