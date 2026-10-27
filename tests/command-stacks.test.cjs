const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCommandStack,
  validateStackGraph,
  commandStackTypeId,
  expandStackCommand,
  stackConditionPaths,
} = require('../out/main/shared/command-stacks');
const {
  triggerStacks,
  applyTriggerStack,
  sortTriggerStacksForDisplay,
} = require('../out/main/shared/trigger-stacks');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { getKeybindings, nativeShortcutInputs } = require('../out/main/shared/keybindings');
const { nativeGestureRows, defaultGestures } = require('../out/main/shared/gestures');
const { planCommandBatch } = require('../out/main/shared/command-execution');
const {
  commandCondition,
  matchesCommandCondition,
} = require('../out/main/shared/command-conditions');
const { CommandDispatcher } = require('../out/main/main/core/command-dispatcher');
const row = (id, command = id, scope = 'global', extra = {}) => ({
  id,
  command,
  enabled: true,
  when: { scope, appletIds: [], ...extra },
});
const stack = (entries, executionMode = 'all') => ({ executionMode, entries });
const definition = (id, config) => ({
  id,
  typeId: commandStackTypeId,
  owner: { kind: 'host' },
  title: id,
  configVersion: 1,
  config,
  enabled: true,
  automation: false,
});
const context = {
  host: { focused: false },
  target: { window: '1', processName: 'notepad', desktop: false, browser: false },
};

test('stack validation enforces conditions, bounded graph, cycles and future fields', () => {
  assert.deepEqual(
    parseCommandStack(
      stack([row('one', 'x', 'applets', { appletIds: ['host:settings', 'page:test:main'] })]),
    ).entries[0].when.appletIds,
    ['host:settings', 'page:test:main'],
  );
  for (const bad of [
    stack([row('x'), row('x')]),
    stack([row('x', 'x', 'exe')]),
    { ...stack([]), wait: 10 },
    stack([row('x', 'x', 'applets', { appletIds: ['host:missing'] })]),
  ])
    assert.throws(() => parseCommandStack(bad));
  assert.throws(() =>
    validateStackGraph([definition('a', stack([row('self', 'appdock.custom.a')]))]),
  );
  assert.throws(() =>
    validateStackGraph([
      definition('a', stack([row('b', 'appdock.custom.b')])),
      definition('b', stack([row('a', 'appdock.custom.a')])),
    ]),
  );
  const chain = Array.from({ length: 9 }, (_, i) =>
    definition('s' + i, stack([row('next', i === 8 ? 'leaf' : 'appdock.custom.s' + (i + 1))])),
  );
  assert.throws(() => validateStackGraph(chain));
  assert.doesNotThrow(() => validateStackGraph(chain.slice(1)));
  const huge = [
    definition('inner', stack(Array.from({ length: 256 }, (_, i) => row('r' + i, 'leaf')))),
    definition(
      'outer',
      stack(Array.from({ length: 8 }, (_, i) => row('r' + i, 'appdock.custom.inner'))),
    ),
  ];
  assert.throws(() => validateStackGraph(huge));
});

test('nested first/all resolves a fixed context, skips empty candidates and preserves repeated leaf entries', () => {
  const catalog = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
    { id: 'off', available: false },
    { id: 'empty', stack: stack([row('no', 'off')]) },
    { id: 'inner', stack: stack([row('host', 'c', 'app'), row('a'), row('b')], 'first') },
    { id: 'outer', stack: stack([row('empty'), row('inner'), row('again', 'a'), row('b')]) },
  ];
  const rows = [row('trigger', 'outer'), row('last', 'c')].map((r) => ({
    ...r,
    when: commandCondition(r.when),
  }));
  const plan = planCommandBatch(rows, context, catalog, 'first');
  assert.deepEqual(plan, {
    commands: ['a', 'a', 'b'],
    rowIds: ['trigger'],
    stackIds: ['outer', 'inner'],
  });
  catalog[0].available = false;
  assert.deepEqual(plan.commands, ['a', 'a', 'b']);
  assert.deepEqual(planCommandBatch(rows, context, catalog, 'all').commands, ['b', 'b', 'c']);
  const cyclic = new Map(
    [{ id: 'loop', stack: stack([row('self', 'loop')]) }].map((c) => [c.id, c]),
  );
  assert.deepEqual(expandStackCommand('loop', cyclic, context).commands, []);
});

test('independent stacks overlap and each stops on revocation without reselecting first', async () => {
  const calls = [];
  const releases = [];
  let available = true;
  const dispatcher = new CommandDispatcher(
    async (id) => {
      calls.push(id);
      if (id === 'a') await new Promise((resolve) => releases.push(resolve));
    },
    () => {},
    () => false,
    () => available,
  );
  const plan = { commands: ['a', 'b'], rowIds: ['one'], stackIds: ['stack'] };
  const run = dispatcher.dispatch('key', plan);
  const parallel = dispatcher.dispatch('mouse', plan);
  assert.deepEqual(calls, ['a', 'a']);
  available = false;
  releases.forEach((release) => release());
  assert.equal((await run).cancelled, true);
  assert.equal((await parallel).cancelled, true);
  assert.deepEqual(calls, ['a', 'a']);
  available = true;
  assert.equal(
    (await dispatcher.dispatch('mouse', { commands: ['b'], rowIds: ['one'], stackIds: ['stack'] }))
      .executed,
    1,
  );
});

test('trigger stacks are the single persisted assignment source and share conflict checked edits', () => {
  let settings = createDefaultSettings();
  settings.keybindings = [];
  const initial = {
    kind: 'gestures',
    input: 'move-up',
    executionMode: 'first',
    entries: [row('first', 'a'), row('second', 'b')],
  };
  settings = applyTriggerStack(settings, initial);
  const raw = settingsStorageValue(settings);
  assert.equal(raw.gestures?.bindings, undefined);
  assert.equal(raw.keybindings, undefined);
  assert.equal(raw.shortcuts, undefined);
  assert.deepEqual(raw.triggerStacks.items, [
    {
      ...initial,
      entries: initial.entries.map((r) => ({ ...r, when: { ...r.when, processes: [] } })),
    },
  ]);
  const restored = parseSettings(raw);
  const before = triggerStacks(restored, 'gestures')[0];
  assert.deepEqual(getKeybindings(restored), []);
  const next = applyTriggerStack(
    restored,
    { ...before, input: 'move-down', entries: before.entries.toReversed() },
    before,
  );
  assert.deepEqual(
    triggerStacks(next, 'gestures')[0].entries.map((r) => r.command),
    ['b', 'a'],
  );
  assert.throws(() => applyTriggerStack(next, before, before));
  assert.throws(() => applyTriggerStack(next, triggerStacks(next, 'gestures')[0]));
  assert.equal(
    triggerStacks(applyTriggerStack(next, null, triggerStacks(next, 'gestures')[0])).length,
    0,
  );
  assert.deepEqual(triggerStacks(parseSettings(settingsStorageValue(next))), triggerStacks(next));
});

test('trigger list order follows picker catalogs without changing command execution order', () => {
  for (const [kind, inputs, expected] of [
    [
      'shortcuts',
      ['Ctrl+F10', 'Down', 'Alt+A', 'Ctrl+A', 'A', '9', 'Up', 'Ctrl+F2', 'Tab'],
      ['A', 'Ctrl+A', 'Alt+A', '9', 'Tab', 'Up', 'Down', 'Ctrl+F2', 'Ctrl+F10'],
    ],
    [
      'gestures',
      ['key:Down', 'wheel-down', 'move-down', 'move-up-right', 'click-left', 'key:Up', 'move-up'],
      ['move-up', 'move-down', 'move-up-right', 'click-left', 'wheel-down', 'key:Up', 'key:Down'],
    ],
    [
      'touchpad-gestures',
      ['four.right', 'three.down', 'four.tap', 'three.tap', 'three.up'],
      ['three.tap', 'three.up', 'three.down', 'four.tap', 'four.right'],
    ],
  ]) {
    const original = inputs.map((input, index) => ({
      kind,
      input,
      executionMode: 'first',
      entries: index ? [row(input + '-b', 'b'), row(input + '-a', 'a')] : [],
    }));
    const before = structuredClone(original);
    const sorted = sortTriggerStacksForDisplay(original);
    assert.deepEqual(
      sorted.map((value) => value.input),
      expected,
    );
    assert.deepEqual(original, before);
    for (const value of sorted)
      assert.equal(
        value,
        original.find((item) => item.input === value.input),
      );
  }
});

test('native preflight receives nested owner conditions, including branches that cannot run', () => {
  const catalog = [
    { id: 'a', title: 'A', extensionId: 'owner' },
    { id: 'stack', title: 'Stack', stack: stack([row('a', 'a', 'owner')]) },
  ];
  const expected = [[{ when: { scope: 'owner', appletIds: [] }, ownerId: 'owner' }]];
  assert.deepEqual(stackConditionPaths('stack', new Map(catalog.map((c) => [c.id, c]))), expected);
  const key = nativeShortcutInputs(
    [{ ...row('key', 'stack'), key: 'Ctrl+Alt+K' }],
    ['stack'],
    {},
    catalog,
  )[0];
  assert.deepEqual(key.conditions[0].stackConditions, expected);
  const gesture = nativeGestureRows(
    { ...defaultGestures(), bindings: [{ ...row('gesture', 'stack'), gesture: 'move-up' }] },
    { appFocused: false, window: '' },
    catalog,
  )[0];
  assert.deepEqual(gesture.stackConditions, expected);
});

for (const fixture of require('./fixtures/command-conditions.json').stackConditions ?? [])
  test('shared native stack preflight: ' + fixture.name, () =>
    assert.equal(
      fixture.paths === null ||
        fixture.paths.some((path) =>
          path.every((term) =>
            matchesCommandCondition(
              commandCondition({ appletIds: [], ...term.when }),
              fixture.context,
              term.ownerId,
              fixture.environment,
            ),
          ),
        ),
      fixture.expected,
    ),
  );
