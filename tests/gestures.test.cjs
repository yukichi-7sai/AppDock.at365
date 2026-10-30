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
  gestureConditionLabel,
  gestureTitle,
} = require('../out/main/shared/gestures');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { ShortcutDispatcher } = require('../out/main/main/core/shortcut-dispatcher');
const { InputCaptureManager } = require('../out/main/main/core/gestures');
const row = (id, scope = 'global', command = 'test.run') => ({
  id,
  command,
  gesture: 'move-left',
  enabled: true,
  when: { scope, appletIds: [], processes: [] },
});

test('two-step movements preserve legacy bindings, reject invalid paths and keep separate execution groups', () => {
  const legacy = row('legacy');
  const pairs = ['up', 'down', 'left', 'right'].flatMap((first) =>
    ['up', 'down', 'left', 'right']
      .filter((second) => first !== second)
      .map((second) => ({ ...row(`${first}-${second}`), gesture: `move-${first}-${second}` })),
  );
  const settings = { ...defaultGestures(), bindings: [legacy, ...pairs] };
  assert.deepEqual(
    parseSettings({ ...createDefaultSettings(), gestures: settings }).gestures,
    settings,
  );
  assert.deepEqual(
    groupGestureBindings(settings.bindings).map((g) => g.gesture),
    ['move-left', ...pairs.map((r) => r.gesture)],
  );
  assert.equal(gestureTitle('move-up'), '移動: 上');
  assert.equal(gestureTitle('move-down'), '移動: 下');
  assert.equal(gestureTitle('move-left'), '移動: 左');
  assert.equal(gestureTitle('move-right'), '移動: 右');
  assert.equal(gestureTitle('move-right-up'), '移動: 右, 上');
  assert.equal(gestureTitle('move-up-down'), '移動: 上, 下');
  assert.equal(gestureTitle('click-left'), 'クリック: 左');
  assert.equal(gestureTitle('click-middle'), 'クリック: 中');
  assert.equal(gestureTitle('wheel-up'), 'ホイール: 上');
  assert.equal(gestureTitle('wheel-down'), 'ホイール: 下');
  assert.equal(gestureTitle('key:F1'), 'キー: F1');
  for (const gesture of [
    'move-up-up',
    'move-up-down-left',
    'move-right-diagonal',
    'move-up-',
    'move-',
  ])
    assert.throws(() => parseGestures({ ...settings, bindings: [{ ...legacy, gesture }] }));
});

test('no-action preview defaults on for old settings and preserves an explicit off value', () => {
  const old = defaultGestures();
  assert.equal(old.indicatorShowNoAction, true);
  delete old.indicatorShowNoAction;
  assert.equal(parseGestures(old).indicatorShowNoAction, true);
  for (const indicatorPosition of [
    'gesture-start',
    'cursor-follow',
    'window-center',
    'monitor-center',
    'none',
  ]) {
    const parsed = parseGestures({ ...old, indicatorPosition, indicatorShowNoAction: false });
    assert.equal(parsed.indicatorShowNoAction, false);
    assert.equal(parsed.indicatorPosition, indicatorPosition);
    assert.equal(parsed.indicatorOpacity, old.indicatorOpacity);
  }
  for (const indicatorShowNoAction of [null, 0, 'false'])
    assert.throws(() => parseGestures({ ...old, indicatorShowNoAction }));
});

test('indicator designs default older settings to compact and retain every explicit design while hidden', () => {
  const legacy = defaultGestures();
  assert.equal(legacy.indicatorStyle, 'compact');
  delete legacy.indicatorStyle;
  assert.equal(parseGestures(legacy).indicatorStyle, 'compact');
  assert.equal(Object.hasOwn(legacy, 'indicatorStyle'), false);
  for (const indicatorStyle of ['compact', 'pill', 'ring', 'classic']) {
    const input = {
      ...legacy,
      indicatorStyle,
      indicatorPosition: 'none',
      indicatorOpacity: 0.65,
      indicatorShowNoAction: false,
      bindings: [row('retained')],
    };
    const parsed = parseSettings({ ...createDefaultSettings(), gestures: input }).gestures;
    assert.deepEqual(parsed, input);
    assert.equal(
      parseGestures({ ...parsed, indicatorPosition: 'gesture-start' }).indicatorStyle,
      indicatorStyle,
    );
  }
  for (const indicatorStyle of [null, '', 'unknown', 'Compact', 0, false, {}])
    assert.throws(() => parseGestures({ ...legacy, indicatorStyle }));
});

test('desktop options preserve old settings and validate scope-specific exclusions', () => {
  const old = defaultGestures();
  delete old.activateOnStart;
  assert.equal(parseGestures(old).activateOnStart, false);
  assert.equal(defaultGestures().activateOnStart, false);
  const desktop = row('desktop', 'desktop');
  const global = row('global');
  global.when.excludeDesktop = true;
  const exe = row('exe', 'exe');
  exe.when.processes = ['Explorer.exe'];
  exe.when.excludeDesktop = true;
  const parsed = parseGestures({
    ...old,
    activateOnStart: true,
    indicatorPosition: 'monitor-center',
    bindings: [desktop, global, exe],
  });
  assert.equal(parsed.activateOnStart, true);
  assert.equal(parsed.indicatorPosition, 'monitor-center');
  assert.deepEqual(parsed.bindings[2].when.processes, ['explorer']);
  assert.equal(gestureConditionLabel(desktop.when), 'デスクトップ');
  assert.equal(gestureConditionLabel(global.when), 'Windows全体（デスクトップを除外）');
  assert.equal(gestureConditionLabel(exe.when), 'Explorer.exe（デスクトップを除外）');
  for (const when of [
    { ...desktop.when, excludeDesktop: true },
    { ...global.when, excludeDesktop: 'true' },
    { ...row('browser', 'browser').when, excludeDesktop: true },
  ])
    assert.throws(() => parseGestures({ ...old, bindings: [{ ...desktop, when }] }));
  assert.throws(() => parseGestures({ ...old, activateOnStart: 1 }));
});

test('activation can keep local hooks available without authorizing inactive assignments', () => {
  const settings = {
    ...defaultGestures(),
    bindings: [row('desktop', 'desktop'), row('local', 'app')],
  };
  const commands = [{ id: 'test.run', title: 'Run' }];
  const context = { appFocused: false, window: '' };
  assert.deepEqual(
    nativeGestureRows(settings, context, commands).map((r) => r.id),
    ['desktop'],
  );
  const pending = nativeGestureRows(settings, context, commands, true);
  assert.equal(pending.find((r) => r.id === 'local').window, '-1');
  assert.deepEqual(
    nativeGestureRows(settings, context, commands).map((r) => r.id),
    ['desktop'],
  );
});

test('activation preparation synchronizes focus and keeps mouse gestures during key recording', async () => {
  const state = { context: { appFocused: false, window: '' }, recording: false };
  const manager = new InputCaptureManager(
    'unused',
    () => state,
    {},
    async () => {},
    () => {},
    () => {},
    {},
  );
  let synced = 0;
  manager.refresh = async () => {
    synced++;
  };
  const preparing = manager.event('gestures.prepare', { window: '123', hostWindow: true });
  setTimeout(() => {
    state.context = { appFocused: true, window: '123' };
  }, 15);
  assert.equal(await preparing, true);
  assert.equal(synced, 1);
  manager.paused = true;
  assert.equal(await manager.event('gestures.prepare', { window: '123', hostWindow: true }), false);
  manager.paused = false;
  state.recording = true;
  assert.equal(await manager.event('gestures.prepare', { window: '123', hostWindow: true }), true);
  assert.equal(synced, 2);
});

test('gesture foreground transfer prepares before showing and only activates a live invocation', async () => {
  const manager = new InputCaptureManager(
    'unused',
    () => ({}),
    {},
    async () => {},
    () => {},
    () => {},
    {},
  );
  const events = [];
  manager.peer = {
    closed: false,
    request: async (method, params) => {
      events.push([method, params]);
      return true;
    },
  };
  const invocation = { session: 'live', window: '100' };
  assert.equal(await manager.activateGesture(invocation, '200', () => events.push('show')), false);
  assert.deepEqual(events, ['show']);
  events.length = 0;
  const controller = new AbortController();
  manager.active.set('live', controller);
  assert.equal(await manager.activateGesture(invocation, '100', () => events.push('show')), false);
  assert.deepEqual(events, ['show']);
  events.length = 0;
  assert.equal(await manager.activateGesture(invocation, '200', () => events.push('show')), true);
  assert.deepEqual(events, [
    ['gestures.prepareActivation', { session: 'live', source: '100', window: '200' }],
    'show',
    ['gestures.activate', { session: 'live', source: '100', window: '200' }],
  ]);
  events.length = 0;
  manager.peer.request = async () => false;
  assert.equal(await manager.activateGesture(invocation, '200', () => events.push('show')), false);
  assert.deepEqual(events, ['show']);
  events.length = 0;
  manager.peer.request = async () => {
    throw Error('disconnected');
  };
  await assert.rejects(
    manager.activateGesture(invocation, '200', () => events.push('show')),
    /disconnected/,
  );
  assert.deepEqual(events, ['show']);
  controller.abort();
  events.length = 0;
  assert.equal(await manager.activateGesture(invocation, '200', () => events.push('show')), false);
  assert.deepEqual(events, ['show']);
});

test('native foreground replaces stale Electron focus before activation preparation', async () => {
  let foreground;
  const manager = new InputCaptureManager(
    'unused',
    (window) => {
      foreground = window;
      return {
        context:
          window === undefined || window === '123'
            ? { appFocused: true, window: '123' }
            : { appFocused: false, window: '' },
        recording: false,
      };
    },
    {},
    async () => {},
    () => {},
    () => {},
    {},
  );
  let synced = 0;
  manager.refresh = async () => {
    manager.state();
    synced++;
  };
  await manager.event('capture.foreground', { window: '456' });
  assert.equal(foreground, '456');
  assert.equal(await manager.event('gestures.prepare', { window: '456', hostWindow: false }), true);
  await manager.event('capture.foreground', { window: '123' });
  assert.equal(await manager.event('gestures.prepare', { window: '123', hostWindow: true }), true);
  await manager.event('capture.foreground', { window: '0' });
  assert.equal(foreground, '0');
  const before = synced;
  for (const window of [null, 456, '', '-1', 'unexpected', '1'.repeat(21)])
    await manager.event('capture.foreground', { window });
  assert.equal(synced, before);
  assert.equal(foreground, '0');
  manager.stopped = true;
  await manager.event('capture.foreground', { window: '123' });
  assert.equal(synced, before);
});

test('activation synchronization uses a bounded key unchanged by focus but changed by settings', async () => {
  const state = {
    settings: {
      gestures: {
        ...defaultGestures(),
        activateOnStart: true,
        bindings: Array.from({ length: 2000 }, (_, i) => row('many-' + i, 'app')),
      },
    },
    context: { appFocused: false, window: '' },
    commands: [{ id: 'test.run', title: 'Run' }],
    recording: false,
  };
  const payloads = [];
  const manager = new InputCaptureManager(
    'unused',
    () => state,
    {},
    async () => {},
    () => {},
    () => {},
    {
      ownership: async () => {},
      applied: () => {},
    },
  );
  manager.peer = {
    closed: false,
    request: async (method, payload) => {
      payloads.push(payload);
      return [];
    },
  };
  await manager.sync();
  assert.match(payloads[0].gestures.settingsKey, /^[a-f0-9]{64}$/);
  assert(Buffer.byteLength(JSON.stringify(payloads[0])) < 1024 * 1024);
  state.context = { appFocused: true, window: '123' };
  await manager.sync();
  assert.equal(payloads[1].gestures.settingsKey, payloads[0].gestures.settingsKey);
  state.settings.gestures.distance++;
  await manager.sync();
  assert.notEqual(payloads[2].gestures.settingsKey, payloads[0].gestures.settingsKey);
});

test('dialog navigation and key recording do not pause or cancel mouse and touchpad input', async () => {
  const state = {
    settings: createDefaultSettings(),
    context: { appFocused: true, window: '123' },
    commands: [{ id: 'test.run', title: 'Run' }],
    recording: false,
    dialogWindow: '',
  };
  state.settings.gestures.bindings = [row('mouse')];
  const payloads = [],
    presses = [];
  const manager = new InputCaptureManager(
    'unused',
    () => state,
    {},
    async () => {},
    () => {},
    assert.fail,
    { ownership: async () => {}, applied() {}, pressed: (press) => presses.push(press) },
  );
  manager.peer = {
    closed: false,
    request: async (method, payload) => {
      payloads.push(payload);
      return payload.shortcuts.map(({ shortcut }) => ({
        shortcut,
        registered: true,
        inputKeys: [shortcut],
      }));
    },
  };
  manager.inputs = ['Enter', 'Ctrl+Enter', 'F8'].map((shortcut) => ({
    shortcut,
    blockOriginalInput: true,
  }));
  manager.touchpadInputs = [
    { shortcut: 'Ctrl+Shift+F9', owner: 'touchpad:three-tap', blockOriginalInput: true },
  ];
  await manager.sync();
  const revision = manager.revision,
    active = new AbortController();
  manager.active.set('ongoing', active);
  state.dialogWindow = '123';
  await manager.sync();
  assert.equal(active.signal.aborted, false);
  assert.equal(manager.revision, revision);
  assert.equal(payloads.at(-1).gestures.enabled, true);
  assert.deepEqual(payloads.at(-1).dialogShortcuts, [
    'Tab',
    'Escape',
    'Enter',
    'Up',
    'Down',
    'Left',
    'Right',
  ]);
  const press = (key, window = '123') =>
    manager.event('shortcuts.pressed', {
      shortcuts: [key],
      window,
      context: '{}',
      revision: manager.shortcutRevision,
      target: { window, processName: 'fixture' },
    });
  await press('Enter');
  await press('Ctrl+Enter');
  await press('Enter', '456');
  assert.deepEqual(
    presses.map((p) => p.shortcuts),
    [['Ctrl+Enter'], ['Enter']],
  );
  state.recording = true;
  await manager.sync();
  assert.equal(active.signal.aborted, false);
  assert.equal(manager.revision, revision);
  assert.equal(payloads.at(-1).gestures.enabled, true);
  assert.deepEqual(
    payloads.at(-1).shortcuts.map((s) => s.shortcut),
    ['Ctrl+Shift+F9'],
  );
  await press('F8');
  await press('Ctrl+Shift+F9');
  assert.deepEqual(presses.at(-1).shortcuts, ['Ctrl+Shift+F9']);
  state.recording = false;
  state.dialogWindow = '';
  await manager.sync();
  await press('Enter');
  assert.deepEqual(presses.at(-1).shortcuts, ['Enter']);
});

test('indicator payload keeps design and localized captions without tracking the renderer palette', async (t) => {
  const {
    appearanceSnapshot,
    configureAppearance,
  } = require('../out/main/main/core/appearance-host');
  const { resolveAppearance } = require('../out/main/shared/appearance');
  const original = appearanceSnapshot();
  let appearance = resolveAppearance('lavender', false);
  configureAppearance(() => appearance, { handle() {} });
  t.after(() => configureAppearance(() => original, { handle() {} }));
  const state = {
    settings: createDefaultSettings(),
    context: { appFocused: false, window: '' },
    commands: [{ id: 'test.run', title: 'User {{title}}' }],
    recording: false,
  };
  state.settings.gestures.bindings = [row('styled')];
  const payloads = [];
  const manager = new InputCaptureManager(
    'unused',
    () => state,
    {},
    async () => {},
    () => {},
    () => {},
    { ownership: async () => {}, applied() {} },
  );
  manager.peer = {
    closed: false,
    request: async (method, payload) => {
      payloads.push(payload);
      return [];
    },
  };
  for (const indicatorStyle of ['compact', 'pill', 'ring', 'classic']) {
    state.settings.gestures.indicatorStyle = indicatorStyle;
    await manager.sync();
    const payload = payloads.at(-1).gestures;
    assert.equal(payload.indicatorStyle, indicatorStyle);
    assert.equal('indicatorDark' in payload, false);
    assert.equal('indicatorAccent' in payload, false);
    assert.equal(payload.indicatorNoActionText, 'アクション無し');
    assert.equal(payload.indicatorMoreText, 'ほか {count} 件');
    assert.equal(payload.rows[0].title, 'User {{title}}');
  }
  const previous = payloads.at(-1).gestures;
  appearance = resolveAppearance('rose', true);
  await manager.sync();
  const changed = payloads.at(-1).gestures;
  assert.equal(payloads.length, 4, 'appearance change does not interrupt input capture');
  assert.equal(
    changed.settingsKey,
    previous.settingsKey,
    'appearance does not rewrite binding identity',
  );
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
test('gesture and keyboard dispatch preserve independent inputs, order and cancellation', async () => {
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
  assert.deepEqual(called, ['test.a', 'test.a', 'test.b']);
});
