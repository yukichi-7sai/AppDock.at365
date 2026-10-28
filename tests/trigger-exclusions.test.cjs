const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSettings, createDefaultSettings } = require('../out/main/shared/settings-schema');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const {
  parseKeybindings,
  parseKeybindingOptions,
  planKeybindings,
  nativeShortcutInputs,
} = require('../out/main/shared/keybindings');
const { parseGestureBindings, planGestureCommands } = require('../out/main/shared/gestures');
const {
  parseTouchpadGestures,
  planTouchpadCommands,
  nativeTouchpadConditions,
} = require('../out/main/shared/touchpad-gestures');
const {
  commandCondition,
  matchesCommandCondition,
} = require('../out/main/shared/command-conditions');

const binding = (id, excludedProcesses = []) => ({
  id,
  command: 'test.' + id,
  enabled: true,
  key: 'Ctrl+F8',
  gesture: 'move-up',
  when: { scope: 'global', appletIds: [], processes: [], excludedProcesses },
});
const rows = [binding('first', ['ROW.EXE']), binding('second')];
const commands = rows.map((row) => ({ id: row.command }));

test('touchpad exclusions refresh the native payload and invalidate old notices without OS input', async () => {
  const { InputCaptureManager } = require('../out/main/main/core/gestures');
  const settings = createDefaultSettings();
  settings.touchpadGestures.bindings = [{ ...rows[0], gesture: 'three.tap' }];
  const requests = [],
    pressed = [];
  const manager = new InputCaptureManager(
    'unused',
    () => ({
      settings,
      context: { appFocused: false, window: '' },
      commands: [],
      recording: false,
    }),
    {},
    assert.fail,
    () => {},
    assert.fail,
    {
      ownership: async () => {},
      applied: () => {},
      failed: assert.fail,
      pressed: (value) => pressed.push(value),
    },
  );
  manager.peer = {
    request: async (method, payload) => {
      assert.equal(method, 'capture.sync');
      requests.push(payload);
      return payload.shortcuts.map((input) => ({ shortcut: input.shortcut, registered: true }));
    },
  };
  await manager.syncTouchpad(
    [
      {
        shortcut: 'F13',
        blockOriginalInput: true,
        owner: 'touchpad:three.tap',
        touchpadGeneration: 1,
      },
    ],
    ['F13'],
  );
  const before = requests.at(-1);
  assert.deepEqual(before.shortcuts[0].conditions[0].when.excludedProcesses, ['ROW.EXE']);
  settings.touchpadGestures.excludedProcesses = ['base'];
  await manager.refresh();
  const after = requests.at(-1);
  assert(after.shortcutRevision > before.shortcutRevision);
  assert.deepEqual(after.shortcuts[0].environment.excludedProcesses, ['base']);
  const notice = {
    shortcuts: ['F13'],
    window: '1',
    context: '',
    revision: before.shortcutRevision,
    target: { window: '1', processName: 'other' },
  };
  await manager.event('shortcuts.pressed', notice);
  assert.equal(pressed.length, 0);
  await manager.event('shortcuts.pressed', { ...notice, revision: after.shortcutRevision });
  assert.equal(pressed.length, 1);
});

test('exclusions normalize, validate, persist independently and default to empty for old settings', () => {
  for (const parse of [parseKeybindings, parseGestureBindings]) {
    assert.deepEqual(
      parse([
        {
          ...binding('x'),
          when: {
            ...binding('x').when,
            excludedProcesses: [' Notepad.EXE ', 'notepad', 'Editor.exe'],
          },
        },
      ])[0].when.excludedProcesses,
      ['notepad', 'editor'],
    );
    for (const bad of [null, 'notepad', ['C:\\Apps\\note.exe']])
      assert.throws(() =>
        parse([{ ...binding('x'), when: { ...binding('x').when, excludedProcesses: bad } }]),
      );
    assert.throws(() =>
      parse([
        {
          ...binding('x'),
          when: { scope: 'app', appletIds: [], processes: [], excludedProcesses: ['note'] },
        },
      ]),
    );
    const old = binding('old');
    delete old.when.excludedProcesses;
    assert.equal(Object.hasOwn(parse([old])[0].when, 'excludedProcesses'), false);
  }
  for (const bad of [null, 'note', ['C:\\bad.exe']]) {
    assert.throws(() => parseKeybindingOptions({ excludedProcesses: bad }));
    assert.throws(() => parseTouchpadGestures({ excludedProcesses: bad }));
  }
  const original = createDefaultSettings();
  delete original.keybindingOptions.excludedProcesses;
  delete original.touchpadGestures.excludedProcesses;
  const restored = parseSettings(original);
  assert.deepEqual(restored.keybindingOptions.excludedProcesses, []);
  assert.deepEqual(restored.touchpadGestures.excludedProcesses, []);
  restored.keybindingOptions.excludedProcesses = ['key'];
  restored.gestures.excludedProcesses = ['mouse'];
  restored.touchpadGestures.excludedProcesses = ['touch'];
  restored.keybindings = parseKeybindings(rows);
  const roundTrip = parseSettings(settingsStorageValue(restored));
  assert.deepEqual(
    [
      roundTrip.keybindingOptions.excludedProcesses,
      roundTrip.gestures.excludedProcesses,
      roundTrip.touchpadGestures.excludedProcesses,
    ],
    [['key'], ['mouse'], ['touch']],
  );
  assert.deepEqual(roundTrip.keybindings[0].when.excludedProcesses, ['row']);
});

for (const kind of ['keyboard', 'mouse', 'touchpad'])
  for (const mode of ['first', 'all']) {
    test(`${kind} ${mode}: trigger and binding exclusions add without replacing; next eligible row retains order`, () => {
      const settings = createDefaultSettings();
      const dispatch = (processName) => {
        const target = { window: '123', processName, desktop: false };
        const options = { excludedProcesses: ['BASE.exe'], executionMode: mode };
        if (kind === 'keyboard')
          return planKeybindings(
            rows,
            'Ctrl+F8',
            { appFocused: false, target },
            commands,
            true,
            mode,
            options,
          );
        if (kind === 'mouse')
          return planGestureCommands(
            { ...settings.gestures, ...options, bindings: rows },
            'move-up',
            { appFocused: false, window: '' },
            target,
            commands,
          );
        return planTouchpadCommands(
          {
            ...settings.touchpadGestures,
            ...options,
            bindings: rows.map((row) => ({ ...row, gesture: 'three.tap' })),
          },
          'three.tap',
          { host: {}, target },
          commands,
        );
      };
      assert.deepEqual(dispatch('base').commands, []);
      assert.deepEqual(dispatch('RoW.exe').commands, ['test.second']);
      assert.deepEqual(
        dispatch('other').commands,
        mode === 'first' ? ['test.first'] : ['test.first', 'test.second'],
      );
      assert.deepEqual(dispatch(undefined).commands, []);
    });
  }

test('native keyboard projection preserves conditional input ownership before execution selection', () => {
  const settings = { excludedProcesses: ['base'] };
  const projected = nativeShortcutInputs(
    rows,
    commands.map((c) => c.id),
    settings,
  )[0];
  assert.deepEqual(projected.environment.excludedProcesses, ['base']);
  const block = (name) =>
    projected.conditions.some(
      (condition) =>
        condition.blockOriginalInput &&
        matchesCommandCondition(
          commandCondition(condition.when),
          { host: {}, target: { window: '1', processName: name } },
          undefined,
          projected.environment,
        ),
    );
  assert.equal(block('base'), false);
  assert.equal(block('row'), true); // second row still owns this key
  const single = nativeShortcutInputs([rows[0]], ['test.first'], {})[0];
  assert(single.conditions);
  assert.equal(
    matchesCommandCondition(commandCondition(single.conditions[0].when), {
      host: {},
      target: { window: '1', processName: 'row' },
    }),
    false,
  );
  const inheritedOnly = nativeShortcutInputs([binding('plain')], ['test.plain'], settings)[0];
  assert(inheritedOnly.conditions);
});

test('native touchpad preserves dedicated-key ownership except for process exclusions', () => {
  const settings = createDefaultSettings().touchpadGestures;
  settings.bindings = [
    binding('first', ['row']),
    { ...binding('second'), when: { scope: 'owner', appletIds: [], processes: [] } },
    binding('missing'),
    { ...binding('off'), enabled: false },
  ];
  const projection = nativeTouchpadConditions(settings, 'move-up');
  assert.equal(projection.length, 4);
  assert.deepEqual(projection[0].when.excludedProcesses, ['row']);
  const context = { host: { focused: false }, target: { window: '1', processName: 'row' } };
  assert.equal(
    projection.some((c) =>
      matchesCommandCondition(commandCondition(c.when), context, undefined, {
        excludedProcesses: ['row'],
      }),
    ),
    false,
  );
  assert.equal(
    projection.some((c) => matchesCommandCondition(commandCondition(c.when), context)),
    true,
  );
  settings.bindings = [settings.bindings[0]];
  assert.equal(
    nativeTouchpadConditions(settings, 'move-up').some((c) =>
      matchesCommandCondition(commandCondition(c.when), context),
    ),
    false,
  );
});
