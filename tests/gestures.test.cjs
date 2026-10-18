const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  defaultGestures,
  parseGestures,
  nativeGestureRows,
  initializeGestureDefaults,
  groupGestureBindings,
  moveGestureBinding,
  applyGestureBinding,
  applyGestureOrder,
} = require('../out/main/shared/gestures');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { ShortcutDispatcher } = require('../out/main/main/core/shortcut-dispatcher');
const row = (id, scope = 'global', command = 'test.run') => ({
  id,
  command,
  gesture: 'move-left',
  enabled: true,
  when: { scope, appletIds: [], processes: [] },
});

test('gesture editor preserves condition-only order, appends new inputs and rejects stale edits', () => {
  const rows = [row('a'), { ...row('key'), gesture: 'key:A' }, row('b')];
  const changed = { ...rows[0], enabled: false };
  assert.deepEqual(
    applyGestureBinding(rows, changed, rows[0]).map((r) => r.id),
    ['a', 'key', 'b'],
  );
  assert.deepEqual(
    applyGestureBinding(rows, row('c')).map((r) => r.id),
    ['a', 'key', 'b', 'c'],
  );
  const moved = applyGestureBinding(rows, { ...rows[0], gesture: 'key:A' }, rows[0]);
  assert.deepEqual(
    moved.map((r) => r.id),
    ['key', 'a', 'b'],
  );
  assert.throws(
    () => applyGestureBinding([changed, ...rows.slice(1)], rows[0], rows[0]),
    /変更されました/,
  );
  assert.throws(() => applyGestureBinding(rows.slice(1), rows[0], rows[0]), /変更されました/);
});
test('gesture order merges unrelated changes but rejects changed members of an edited group', () => {
  const rows = [row('a'), { ...row('key'), gesture: 'key:A' }, row('b')];
  const ordered = moveGestureBinding(rows, 'b', 'a');
  const current = rows.map((r) => (r.id === 'key' ? { ...r, enabled: false } : r));
  const merged = applyGestureOrder(current, rows, ordered);
  assert.deepEqual(
    merged.map((r) => r.id),
    ['b', 'key', 'a'],
  );
  assert.equal(merged[1], current[1]);
  for (const live of [
    rows.slice(1),
    [...rows, row('extra')],
    rows.map((r) => (r.id === 'a' ? { ...r, enabled: false } : r)),
    ordered,
  ])
    assert.throws(() => applyGestureOrder(live, rows, ordered), /変更されました/);
  assert.deepEqual(
    rows.map((r) => r.id),
    ['a', 'key', 'b'],
  );
});
test('gesture groups preserve local execution order without moving unrelated assignments', () => {
  const rows = [
    row('a'),
    { ...row('key'), gesture: 'key:A' },
    row('b'),
    { ...row('right'), gesture: 'move-right' },
    { ...row('modified'), gesture: 'key:Ctrl+A' },
  ];
  const moved = moveGestureBinding(rows, 'b', 'a');
  assert.deepEqual(
    moved.map((r) => r.id),
    ['b', 'key', 'a', 'right', 'modified'],
  );
  assert.deepEqual(
    groupGestureBindings(moved).map((g) => [g.gesture, g.bindings.map((r) => r.id)]),
    [
      ['move-left', ['b', 'a']],
      ['move-right', ['right']],
      ['key:A', ['key']],
      ['key:Ctrl+A', ['modified']],
    ],
  );
  assert.equal(moveGestureBinding(rows, 'a', 'key'), rows);
  assert.deepEqual(
    rows.map((r) => r.id),
    ['a', 'key', 'b', 'right', 'modified'],
  );
});
test('missing host gestures use defaults without reading or rewriting Applet settings', () => {
  const settings = createDefaultSettings();
  delete settings.gestures;
  settings.extensions['at365.web-browser-tools'] = {
    enabled: true,
    settings: {
      'gestures.enabled': false,
      'gestures.left': 'none',
      'gestures.up': 'new-tab',
      browserProcesses: 'Firefox.exe, msedge',
      requireChromiumWindowClass: false,
      'gestures.distance': 80,
      'gestures.wheel-delay-ms': 250,
      'gestures.indicator-position': 'browser-center',
      'gestures.indicator-opacity': 0.8,
    },
  };
  const parsed = parseSettings(settings);
  assert.deepEqual(parsed.gestures, defaultGestures());
  assert.deepEqual(parsed.extensions, settings.extensions);
  assert.deepEqual(
    initializeGestureDefaults(settings, [
      { id: 'at365.web-browser-tools', defaultGestureBindings: [row('default')] },
    ]).gestures,
    defaultGestures(),
  );
  settings.extensions['at365.web-browser-tools'].settings['gestures.distance'] = 'obsolete';
  assert.deepEqual(parseSettings(settings).gestures, defaultGestures());
  parsed.gestures = {
    ...defaultGestures(),
    enabled: false,
    distance: 90,
    bindings: [row('saved')],
  };
  assert.deepEqual(parseSettings(parsed).gestures, parsed.gestures);
  parsed.gestures.bindings = [];
  assert.deepEqual(parseSettings(parsed).gestures.bindings, []);
});
test('gesture validation rejects right-click, malformed scopes, paths and invalid bounds', () => {
  for (const patch of [
    { distance: 4 },
    { distance: 501 },
    { wheelDelayMs: -1 },
    { indicatorOpacity: 0 },
    { executionMode: 'unknown' },
    { executionMode: null },
    { browsers: ['C:\\bad.exe'] },
    { bindings: [row('same'), row('same')] },
    { bindings: [{ ...row('r'), gesture: 'click-right' }] },
    { bindings: [row('r', 'exe')] },
    { bindings: [row('r', 'unknown')] },
  ])
    assert.throws(() => parseGestures({ ...defaultGestures(), ...patch }));
  assert.equal(
    parseGestures({ ...defaultGestures(), bindings: [{ ...row('r'), gesture: 'key:ctrl+a' }] })
      .bindings[0].gesture,
    'key:Ctrl+A',
  );
});

test('gesture execution mode defaults old settings to all and preserves hidden indicator settings', () => {
  const legacy = defaultGestures();
  delete legacy.executionMode;
  assert.equal(parseGestures(legacy).executionMode, 'all');
  assert.equal(
    parseSettings({ ...createDefaultSettings(), gestures: legacy }).gestures.executionMode,
    'all',
  );
  const settings = {
    ...legacy,
    executionMode: 'first',
    indicatorPosition: 'none',
    indicatorOpacity: 0.7,
  };
  assert.deepEqual(parseGestures(settings), settings);
  assert.equal(
    parseGestures({ ...settings, indicatorPosition: 'gesture-start' }).indicatorOpacity,
    0.7,
  );
});
test('local gesture scopes require the real active page and owner; external scopes retain native process gates', () => {
  const settings = {
    ...defaultGestures(),
    bindings: ['global', 'browser', 'exe', 'app', 'pages', 'owner', 'applets'].map((scope) =>
      row(scope, scope),
    ),
  };
  settings.bindings.find((r) => r.id === 'exe').when.processes = ['notepad'];
  settings.bindings.find((r) => r.id === 'applets').when.appletIds = ['test'];
  const commands = [{ id: 'test.run', title: 'Run', extensionId: 'test' }];
  const foreground = { appFocused: true, appletId: 'test', window: '123' };
  assert.equal(nativeGestureRows(settings, foreground, commands).length, 7);
  assert.equal(nativeGestureRows(settings, { appFocused: false, window: '' }, commands).length, 3);
  assert.equal(nativeGestureRows(settings, foreground, []).length, 0);
  assert.equal(
    nativeGestureRows(settings, foreground, commands).find((r) => r.id === 'app').window,
    '123',
  );
});
test('manifest gesture defaults apply once and preserve existing users and deleted assignments', () => {
  const manifest = { id: 'test', defaultGestureBindings: [row('default')] };
  let settings = initializeGestureDefaults(createDefaultSettings(), [manifest]);
  assert.equal(settings.gestures.bindings.length, 1);
  settings.gestures.bindings = [];
  assert.equal(initializeGestureDefaults(settings, [manifest]).gestures.bindings.length, 0);
  const existing = createDefaultSettings();
  existing.extensions.test = { enabled: false, settings: {} };
  assert.equal(initializeGestureDefaults(existing, [manifest]).gestures.bindings.length, 0);
  const sharedIds = initializeGestureDefaults(createDefaultSettings(), [
    manifest,
    { ...manifest, id: 'other' },
  ]);
  assert.equal(new Set(sharedIds.gestures.bindings.map((row) => row.id)).size, 2);
  assert.doesNotThrow(() => parseGestures(sharedIds.gestures));
});
test('gesture and keyboard dispatch share reservations, order, cancellation and deduplication', async () => {
  const called = [];
  let valid = true;
  const dispatcher = new ShortcutDispatcher(
    async (id) => called.push(id),
    () => {},
  );
  await dispatcher.dispatch('gesture:left', ['test.a', 'test.a', 'test.b'], {
    valid: async () => valid,
    execute: async (id) => {
      called.push(id);
      await dispatcher.dispatch('Ctrl+A', ['test.a', 'test.b']);
      valid = false;
    },
  });
  assert.deepEqual(called, ['test.a']);
});
