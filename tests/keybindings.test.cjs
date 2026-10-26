const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSettings, createDefaultSettings } = require('../out/main/shared/settings-schema');
const {
  getKeybindings,
  parseKeybindings,
  resolveKeybindings,
  withKeybindings,
  safePageShortcut,
  parseKeybindingDefaults,
  initializeExtensionDefaults,
  initializeCollectionDefaults,
  resetAppletKeybindings,
  moveKeybindingWithinKey,
  keybindingGroups,
  appendKeybinding,
  applyKeybindingOrder,
  changeKeybindingKey,
  changeKeybindingCommand,
} = require('../out/main/shared/keybindings');
const { ShortcutDispatcher } = require('../out/main/main/core/shortcut-dispatcher');
const { GlobalHotKeyManager } = require('../out/main/main/core/global-hotkeys');
const {
  defaultKeybindingOptions,
  parseKeybindingOptions,
  getKeybindingOptions,
} = require('../out/main/shared/keybindings');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const { defaultCommandTriggerOptions } = require('../out/main/shared/command-trigger-options');

test('shortcut options default to all, validate explicit values and retain local future fields', () => {
  const defaults = {
    executionMode: 'all',
    excludedProcesses: [],
  };
  assert.deepEqual(defaultKeybindingOptions(), defaults);
  assert.deepEqual(getKeybindingOptions({}), { ...defaults, ...defaultCommandTriggerOptions() });
  assert.deepEqual(parseKeybindingOptions({}), defaults);
  assert.deepEqual(parseKeybindingOptions({ executionMode: 'first', future: false }), {
    ...defaults,
    executionMode: 'first',
    future: false,
  });
  for (const value of [
    null,
    [],
    false,
    { executionMode: null },
    { executionMode: 'unknown' },
    { executionMode: 0 },
  ])
    assert.throws(() => parseKeybindingOptions(value));
  const old = createDefaultSettings();
  delete old.keybindingOptions;
  assert.equal(parseSettings(old).keybindingOptions.executionMode, 'all');
  assert.equal(settingsStorageValue(parseSettings(old)).keybindingOptions, undefined);
  old.keybindingOptions = { executionMode: 'first' };
  old.gestures.executionMode = 'all';
  assert.equal(parseSettings(old).keybindingOptions.executionMode, 'first');
  assert.deepEqual(settingsStorageValue(parseSettings(old)).keybindingOptions, {
    executionMode: 'first',
  });
  assert.equal(parseSettings(old).gestures.executionMode, 'all');
});
test('external shortcut conditions normalize and match captured targets through the common planner', () => {
  const {
    planKeybindings,
    nativeShortcutInputs,
    keybindingConditionLabel,
  } = require('../out/main/shared/keybindings');
  const make = (id, scope, extras = {}) => ({
    ...row(id, 'test.' + id, scope),
    when: { scope, appletIds: [], ...extras },
  });
  const bindings = parseKeybindings([
    make('miss', 'exe', { processes: ['other'] }),
    make('exe', 'exe', { processes: ['CHROME.EXE', 'chrome'], excludeDesktop: true }),
    make('browser', 'browser'),
    make('desktop', 'desktop'),
    make('global', 'global', { excludeDesktop: true }),
  ]);
  assert.deepEqual(bindings[1].when.processes, ['chrome']);
  const available = bindings.map((r) => ({ id: r.command }));
  const context = {
    appFocused: false,
    target: {
      window: '42',
      processName: 'Chrome.EXE',
      windowClass: 'Chrome_WidgetWin_1',
      desktop: false,
    },
  };
  const environment = { browsers: ['chrome'], requireChromiumWindowClass: true };
  assert.deepEqual(
    planKeybindings(bindings, 'Ctrl+F12', context, available, true, 'all', environment).commands,
    ['test.exe', 'test.browser', 'test.global'],
  );
  assert.deepEqual(
    planKeybindings(bindings, 'Ctrl+F12', context, available, true, 'first', environment).commands,
    ['test.exe'],
  );
  assert.deepEqual(
    planKeybindings(bindings, 'Ctrl+F12', context, available, false, 'all', environment).commands,
    [],
  );
  assert.deepEqual(
    planKeybindings(
      bindings,
      'Ctrl+F12',
      { appFocused: false },
      available,
      true,
      'all',
      environment,
    ).commands,
    [],
  );
  assert.deepEqual(
    planKeybindings(
      bindings,
      'Ctrl+F12',
      { appFocused: false, target: { ...context.target, desktop: true } },
      available,
      true,
      'all',
      environment,
    ).commands,
    ['test.browser', 'test.desktop'],
  );
  const input = nativeShortcutInputs(
    bindings,
    available.map((c) => c.id),
    environment,
  )[0];
  assert.equal(input.conditions.length, 5);
  assert.equal(input.blockOriginalInput, true);
  assert.equal(
    keybindingConditionLabel(bindings[1].when, undefined, []),
    'chrome（デスクトップを除外）',
  );
  for (const when of [
    { scope: 'exe', appletIds: [] },
    { scope: 'browser', appletIds: [], processes: ['chrome'] },
    { scope: 'desktop', appletIds: [], excludeDesktop: true },
    { scope: 'exe', appletIds: [], processes: ['../bad'] },
  ])
    assert.throws(() => parseKeybindings([{ ...row('invalid', 'test.run'), when }]));
  const old = [row('old', 'test.run')];
  assert.deepEqual(parseKeybindings(old), old);
  const settings = createDefaultSettings();
  settings.commandTriggerOptions = {
    browsers: ['FIREFOX.EXE'],
    requireChromiumWindowClass: true,
  };
  assert.deepEqual(parseSettings(settings).commandTriggerOptions.browsers, ['firefox']);
  assert.equal(parseSettings(settings).gestures.requireChromiumWindowClass, undefined);
  function defaultsForTest() {
    return defaultKeybindingOptions();
  }
});
const row = (id, command, scope = 'app', appletIds = []) => ({
  id,
  command,
  key: 'Ctrl+F12',
  enabled: true,
  when: { scope, appletIds },
});

test('same-key moves cross providers, retain other-key slots and control dispatch order', () => {
  const rows = [
    row('a1', 'a.first'),
    { ...row('other', 'b.other'), key: 'F2' },
    row('b1', 'b.first'),
    row('a2', 'a.second'),
  ];
  const moved = moveKeybindingWithinKey(rows, 'a2', 'a1');
  assert.deepEqual(
    moved.map((r) => r.id),
    ['a2', 'other', 'a1', 'b1'],
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ['a1', 'other', 'b1', 'a2'],
  );
  assert.equal(moveKeybindingWithinKey(rows, 'a1', 'other'), rows);
  assert.equal(moveKeybindingWithinKey(rows, 'missing', 'a1'), rows);
  assert.deepEqual(
    resolveKeybindings(
      moved,
      'Ctrl+F12',
      { appFocused: true },
      rows.map((r) => ({ id: r.command })),
    ),
    ['a.second', 'a.first', 'b.first'],
  );
  assert.deepEqual(parseKeybindings(moved), moved);
});
test('group rendering and key changes preserve IDs, dispatch order, conditions and other keys', () => {
  const rows = [
    row('a', 'test.a', 'owner'),
    { ...row('b', 'test.b'), key: 'F10' },
    row('c', 'test.c'),
    { ...row('d', 'test.d'), key: 'F2' },
  ];
  assert.deepEqual(
    keybindingGroups(rows).map(([key, members]) => [key, members.map((r) => r.id)]),
    [
      ['Ctrl+F12', ['a', 'c']],
      ['F2', ['d']],
      ['F10', ['b']],
    ],
  );
  const added = appendKeybinding(rows, row('e', 'test.e'));
  assert.deepEqual(
    added.map((r) => r.id),
    ['a', 'b', 'c', 'e', 'd'],
  );
  const changed = changeKeybindingKey(rows, 'a', 'f2');
  assert.deepEqual(
    changed.map((r) => r.id),
    ['b', 'c', 'd', 'a'],
  );
  assert.deepEqual(changed[3], { ...rows[0], key: 'F2' });
  assert.equal(changeKeybindingKey(rows, 'a', 'ctrl+f12'), rows);
  assert.equal(changeKeybindingKey(rows, 'missing', 'F1'), rows);
  assert.deepEqual(appendKeybinding(rows, { ...row('new', 'test.n'), key: 'F1' }).at(-1).id, 'new');
});
test('changing a command preserves binding identity and explicit conditions, resolves owner for host', () => {
  const binding = row('stable', 'test.a', 'owner');
  assert.deepEqual(changeKeybindingCommand(binding, { id: 'test.b', extensionId: 'test' }), {
    ...binding,
    command: 'test.b',
  });
  assert.deepEqual(changeKeybindingCommand(binding, { id: 'appdock.open', extensionId: null }), {
    ...binding,
    command: 'appdock.open',
    when: { scope: 'app', appletIds: [] },
  });
  for (const scope of ['global', 'app', 'pages', 'applets']) {
    const source = row('stable', 'test.a', scope, scope === 'applets' ? ['test.other'] : []);
    assert.deepEqual(
      changeKeybindingCommand(source, { id: 'appdock.open', extensionId: null }).when,
      source.when,
    );
  }
});
test('order panel merges unrelated edits and preserves other key slots atomically', () => {
  const original = [row('a', 'a'), { ...row('x', 'x'), key: 'F2' }, row('b', 'b')];
  const edited = moveKeybindingWithinKey(original, 'b', 'a');
  const current = original.map((r) => (r.id === 'x' ? { ...r, enabled: false } : r));
  current.push({ ...row('new', 'new'), key: 'F3' });
  const result = applyKeybindingOrder(current, original, edited);
  assert.deepEqual(
    result.map((r) => r.id),
    ['b', 'x', 'a', 'new'],
  );
  assert.equal(result[1], current[1]);
  assert.deepEqual(
    resolveKeybindings(result, 'Ctrl+F12', { appFocused: true }, [{ id: 'a' }, { id: 'b' }]),
    ['b', 'a'],
  );
  assert.deepEqual(
    original.map((r) => r.id),
    ['a', 'x', 'b'],
  );
});
test('order panel refuses changed, removed, added or reordered members of an edited key', () => {
  const original = [row('a', 'a'), row('b', 'b')];
  const edited = moveKeybindingWithinKey(original, 'b', 'a');
  for (const current of [
    [original[0]],
    [...original, row('c', 'c')],
    [...original].reverse(),
    original.map((r) => ({ ...r, enabled: false })),
    original.map((r) => ({ ...r, when: { scope: 'global', appletIds: [] } })),
  ])
    assert.throws(() => applyKeybindingOrder(current, original, edited), /変更されました/);
  assert.throws(
    () => applyKeybindingOrder(original, original, [original[0], original[0]]),
    /変更されました/,
  );
});
test('new settings round-trip beyond legacy limits and include bindings in the size limit', () => {
  const keybindings = Array.from({ length: 501 }, (_, i) =>
    row(`r.${i}`, `test.command.${i}`, 'global'),
  );
  const parsed = parseSettings({ ...createDefaultSettings(), keybindings });
  assert.deepEqual(parseSettings(parsed), parsed);
  const appletIds = Array.from({ length: 100 }, (_, i) => `applet.${i}.${'x'.repeat(160)}`);
  assert.throws(
    () =>
      parseSettings({
        ...createDefaultSettings(),
        keybindings: Array.from({ length: 100 }, (_, i) =>
          row(`r.${i}`, 'test.command', 'applets', appletIds),
        ),
      }),
    /1MB/,
  );
});
test('legacy settings remain readable; new bindings are authoritative and allow shared keys', () => {
  const legacy = createDefaultSettings();
  assert.equal(
    getKeybindings(legacy).some((r) => r.command.startsWith('at365.')),
    false,
  );
  const rows = [
    row('one', 'test.one', 'applets', ['gmail', 'web.1']),
    row('two', 'test.two', 'global'),
  ];
  const settings = parseSettings({ ...legacy, keybindings: rows });
  assert.deepEqual(settings.keybindings, rows);
  assert.deepEqual(settings.shortcuts, { 'test.one': ['Ctrl+F12'], 'test.two': ['Ctrl+F12'] });
  assert.deepEqual(parseSettings(settings), settings);
  assert.deepEqual(parseSettings({ ...settings, keybindings: [] }).shortcuts, {});
  assert.deepEqual(parseSettings(withKeybindings(legacy, rows)).keybindings, rows);
});
test('Applet manifest defaults are scoped to declared commands and applied only on first discovery', () => {
  const defaults = parseKeybindingDefaults(
    [
      {
        command: 'at365.gmail.nextAccount',
        key: 'Ctrl+Tab',
        enabled: true,
        when: { scope: 'owner', appletIds: [] },
      },
      {
        command: 'at365.gmail.nextAccount',
        key: 'Ctrl+Shift+Tab',
        enabled: false,
        when: { scope: 'owner', appletIds: [] },
      },
    ],
    ['at365.gmail.nextAccount'],
  );
  assert.throws(
    () =>
      parseKeybindingDefaults(
        [{ ...defaults[0], command: 'appdock.quit' }],
        ['at365.gmail.nextAccount'],
      ),
    /自身の登録コマンド/,
  );
  const applets = [{ id: 'at365.gmail', defaultKeybindings: defaults }];
  const first = initializeExtensionDefaults(createDefaultSettings(), applets);
  assert.deepEqual(
    getKeybindings(first)
      .filter((r) => r.command === 'at365.gmail.nextAccount')
      .map((r) => [r.key, r.enabled, r.when.scope]),
    [
      ['Ctrl+Tab', true, 'owner'],
      ['Ctrl+Shift+Tab', false, 'owner'],
    ],
  );
  const cleared = withKeybindings(
    first,
    getKeybindings(first).filter((r) => r.command !== 'at365.gmail.nextAccount'),
  );
  assert.deepEqual(initializeExtensionDefaults(cleared, applets), cleared);
  const previouslyInstalled = createDefaultSettings();
  previouslyInstalled.extensions['at365.gmail'] = { enabled: true, settings: {} };
  assert.equal(
    getKeybindings(initializeExtensionDefaults(previouslyInstalled, applets)).some(
      (r) => r.command === 'at365.gmail.nextAccount',
    ),
    false,
  );
});
test('new collection pages copy current template without changing existing bindings', () => {
  const parent = require('../../Applet.WebApplet.at365/extension.json');
  const initializeWebAppletDefaults = (value, prior) =>
    initializeCollectionDefaults(value, prior, [parent]);
  const previous = createDefaultSettings();
  const oldId = 'web.00000000-0000-0000-0000-000000000001';
  const newId = 'web.00000000-0000-0000-0000-000000000002';
  const makeItem = (id) => ({
    id,
    name: 'Test',
    url: 'https://example.com/',
    accountId: 'account.00000000-0000-0000-0000-000000000001',
    enabled: true,
    display: 'page',
    navigation: 'same-origin',
    allowedOrigins: [],
    icon: '',
  });
  const previousItems = [makeItem(oldId)];
  previous.migrations = { webApplet: { version: 1, owner: parent.id, ids: [oldId, newId] } };
  previous.extensions[parent.id] = {
    enabled: true,
    settings: {
      items: previousItems,
      shortcutDefaults: structuredClone(
        parent.settings.find((f) => f.key === 'shortcutDefaults').default,
      ),
    },
  };
  const changed = structuredClone(previous);
  changed.extensions[parent.id].settings.items.push(makeItem(newId));
  changed.extensions[parent.id].settings.shortcutDefaults[0].key = 'Ctrl+F5';
  changed.extensions[parent.id].settings.shortcutDefaults[1].enabled = false;
  changed.extensions[parent.id].settings.shortcutDefaults[2].when = {
    scope: 'applets',
    appletIds: ['test.defaults'],
  };
  const result = initializeWebAppletDefaults(changed, previous);
  assert.equal(
    getKeybindings(result).some((r) => r.command.startsWith(oldId + '.')),
    false,
  );
  assert.deepEqual(
    getKeybindings(result)
      .filter((r) => r.command.startsWith(newId + '.'))
      .map((r) => [r.command, r.key, r.enabled, r.when.scope]),
    [
      [`${newId}.reload`, 'Ctrl+F5', true, 'owner'],
      [`${newId}.back`, 'Alt+Left', false, 'owner'],
      [`${newId}.forward`, 'Alt+Right', true, 'applets'],
    ],
  );
  assert.deepEqual(
    getKeybindings(result).find((row) => row.command === `${newId}.forward`).when.appletIds,
    ['test.defaults'],
  );
  assert.deepEqual(initializeWebAppletDefaults(result, result), result);
});
test('resetting one Applet restores its declared defaults and preserves other Applets', () => {
  const settings = withKeybindings(createDefaultSettings(), [
    row('gmail-custom', 'at365.gmail.nextAccount', 'global'),
    row('other', 'at365.watch.toggle', 'global'),
  ]);
  const next = resetAppletKeybindings(settings, {
    id: 'at365.gmail',
    runtime: 'node',
    commands: [{ id: 'at365.gmail.nextAccount' }],
    defaultKeybindings: [
      {
        command: 'at365.gmail.nextAccount',
        key: 'Ctrl+Tab',
        enabled: true,
        when: { scope: 'owner', appletIds: [] },
      },
    ],
  });
  assert.deepEqual(
    getKeybindings(next).map((r) => [r.command, r.key, r.when.scope]),
    [
      ['at365.watch.toggle', 'Ctrl+F12', 'global'],
      ['at365.gmail.nextAccount', 'Ctrl+Tab', 'owner'],
    ],
  );
});
test('invalid and unknown conditions fail closed; unknown applet and command IDs are retained', () => {
  for (const when of [
    { scope: 'unknown', appletIds: [] },
    { scope: 'applets', appletIds: [] },
    { scope: 'app', appletIds: ['test'] },
    { scope: 'global', appletIds: [], extra: true },
  ])
    assert.throws(() => parseKeybindings([{ ...row('x', 'test.one'), when }]));
  assert.throws(() => parseKeybindings([row('x', 'test.one'), row('x', 'test.two')]));
  assert.equal(
    parseKeybindings([row('x', 'missing.command', 'applets', ['missing.applet'])]).length,
    1,
  );
});
test('scopes, multi-applet OR, ordering, disabled/unavailable commands and deduplication', () => {
  const rows = [
    row('a', 'test.a', 'global'),
    row('b', 'test.b'),
    row('c', 'test.c', 'pages'),
    row('d', 'test.d', 'applets', ['gmail', 'web.1']),
    row('e', 'test.b'),
    { ...row('f', 'test.f'), enabled: false },
    row('g', 'missing.command'),
  ];
  const available = ['test.a', 'test.b', 'test.c', 'test.d', 'test.f'].map((id) => ({ id }));
  const resolve = (context, global = false) =>
    resolveKeybindings(rows, 'Ctrl+F12', context, available, global);
  assert.deepEqual(resolve({ appFocused: false }, true), ['test.a']);
  assert.deepEqual(resolve({ appFocused: true }), ['test.b']);
  assert.deepEqual(resolve({ appFocused: true, appletId: 'gmail' }), [
    'test.b',
    'test.c',
    'test.d',
  ]);
  assert.deepEqual(resolve({ appFocused: true, appletId: 'web.1' }, true), [
    'test.a',
    'test.b',
    'test.c',
    'test.d',
  ]);
  assert.deepEqual(resolve({ appFocused: true, appletId: 'other' }), ['test.b', 'test.c']);
  assert.deepEqual(resolve({ appFocused: false, appletId: 'gmail' }), []);
});
test('owner scope uses registered ownership, follows current catalog and fails closed without an owner', () => {
  const rows = [row('a', 'unrelated.command', 'owner'), row('b', 'appdock.test', 'owner')];
  assert.deepEqual(parseKeybindings(rows), rows);
  const resolve = (context, owner = 'gmail', global = false) =>
    resolveKeybindings(
      rows,
      'Ctrl+F12',
      context,
      [
        { id: 'unrelated.command', extensionId: owner },
        { id: 'appdock.test', extensionId: null },
      ],
      global,
    );
  assert.deepEqual(resolve({ appFocused: true, appletId: 'gmail' }), ['unrelated.command']);
  assert.deepEqual(resolve({ appFocused: true, appletId: 'web.1' }), []);
  assert.deepEqual(resolve({ appFocused: false, appletId: 'gmail' }), []);
  assert.deepEqual(resolve({ appFocused: true }), []);
  assert.deepEqual(resolve({ appFocused: true, appletId: 'gmail' }, undefined, true), [
    'unrelated.command',
  ]);
  assert.deepEqual(resolve({ appFocused: true, appletId: 'gmail' }, null), []);
  assert.deepEqual(resolve({ appFocused: true, appletId: 'web.1' }, 'web.1'), [
    'unrelated.command',
  ]);
  assert.deepEqual(
    resolveKeybindings(rows, 'Ctrl+F12', { appFocused: true, appletId: 'gmail' }, []),
    [],
  );
  assert.throws(() => parseKeybindings([row('a', 'unrelated.command', 'owner', ['gmail'])]));
});
test('batch captures commands, reserves against re-entry, continues after failure and stops at shutdown', async () => {
  const calls = [],
    errors = [];
  let finish,
    stopped = false;
  const dispatcher = new ShortcutDispatcher(
    async (id) => {
      calls.push(id);
      if (id === 'a') await new Promise((r) => (finish = r));
      if (id === 'b') throw Error('test');
      if (id === 'quit') stopped = true;
    },
    (e) => errors.push(e),
    () => stopped,
  );
  const first = dispatcher.dispatch('F1', ['a', 'b', 'c', 'b']);
  await dispatcher.dispatch('F1', ['a', 'b']);
  await dispatcher.dispatch('F2', ['b']);
  assert.deepEqual(calls, ['a']);
  finish();
  await first;
  assert.deepEqual(calls, ['a', 'b', 'c']);
  assert.equal(errors.length, 1);
  await dispatcher.dispatch('F1', ['quit', 'c']);
  assert.equal(calls.at(-1), 'quit');
});
test('one OS registration per key; common dispatch receives each press only once', async () => {
  const keys = [],
    presses = [];
  const manager = new GlobalHotKeyManager(
    {
      sync: async (list) => {
        keys.push(list);
        return list.map((shortcut) => ({ shortcut, registered: true }));
      },
      close: async () => {},
    },
    async (key) => presses.push(key),
    () => {},
    assert.fail,
  );
  await manager.sync(
    {
      ...createDefaultSettings(),
      keybindings: [row('a', 'test.a', 'global'), row('b', 'test.b', 'global')],
    },
    ['test.a', 'test.b'],
  );
  assert.deepEqual(keys, [['Ctrl+F12']]);
  assert.equal(manager.statuses.length, 2);
  await manager.pressed('Ctrl+F12');
  assert.deepEqual(presses, ['Ctrl+F12']);
  await manager.sync({ ...createDefaultSettings(), keybindings: [] }, []);
  await manager.pressed('Ctrl+F12');
  assert.equal(presses.length, 1);
  await manager.close();
});
test('page typing policy preserves ordinary text, navigation and IME keys', () => {
  for (const key of ['a', 'Tab', 'Enter', 'Backspace', 'Process'])
    assert.equal(safePageShortcut({ key, control: false, alt: false }), false);
  for (const key of ['F1', 'F24', 'Pause'])
    assert.equal(safePageShortcut({ key, control: false, alt: false }), true);
  assert.equal(safePageShortcut({ key: 'r', control: true, alt: false }), true);
});
