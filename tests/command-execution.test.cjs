const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fixtures = require('./fixtures/command-conditions.json');
const {
  commandCondition,
  matchesCommandCondition,
  readCommandTarget,
} = require('../out/main/shared/command-conditions');
const { planCommandBatch } = require('../out/main/shared/command-execution');
const { inputExecutionMode } = require('../out/main/shared/input-execution');
const { planKeybindings } = require('../out/main/shared/keybindings');
const { CommandDispatcher } = require('../out/main/main/core/command-dispatcher');
const { InputCaptureManager } = require('../out/main/main/core/gestures');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const normalizeWhen = (when) => commandCondition({ appletIds: [], ...when });
const normalizeRows = (rows) =>
  rows.map((row) => ({
    ...row,
    enabled: row.enabled ?? true,
    when: normalizeWhen(row.when),
  }));

for (const fixture of fixtures.conditions)
  test('shared native condition: ' + fixture.name, () => {
    assert.equal(
      matchesCommandCondition(
        normalizeWhen(fixture.when),
        fixture.context,
        fixture.ownerId,
        fixture.environment,
      ),
      fixture.expected,
    );
  });
for (const fixture of fixtures.selections)
  test('shared native selection: ' + fixture.name, () => {
    const plan = planCommandBatch(
      normalizeRows(fixture.rows),
      fixture.context,
      fixture.catalog,
      fixture.mode,
      fixture.environment,
    );
    assert.deepEqual(plan, { commands: fixture.expectedCommands, rowIds: fixture.expectedRows });
  });
const plan = (commands, mode = 'all') =>
  planCommandBatch(
    normalizeRows(
      commands.map((command, i) => ({ id: 'row.' + i, command, when: { scope: 'global' } })),
    ),
    { host: {} },
    [...new Set(commands)].map((id) => ({ id })),
    mode,
  );

for (const fixture of fixtures.inputExecutionModes)
  test('shared native input mode: ' + fixture.name, () => {
    assert.deepEqual(
      inputExecutionMode(fixture.fallback, fixture.overrides, fixture.input),
      fixture.expected,
    );
  });

for (const mode of fixtures.invalidExecutionModes)
  test('invalid execution selection is rejected: ' + JSON.stringify(mode), () => {
    const { parseCommandExecutionMode } = require('../out/main/shared/command-execution-mode');
    assert.throws(() => parseCommandExecutionMode(mode));
    assert.throws(() => plan(['a'], mode));
  });

test('count fixes the selected batch before failures and cancellation without replacement', async () => {
  const calls = [];
  const dispatcher = new CommandDispatcher(
    async (id) => {
      calls.push(id);
      if (id === 'fail') throw Error('fixture');
    },
    () => {},
  );
  const result = await dispatcher.dispatch(
    'count',
    plan(['fail', 'a', 'tail'], { mode: 'count', count: 2 }),
  );
  assert.equal(result.failed, 1);
  assert.deepEqual(calls, ['fail', 'a']);
  calls.length = 0;
  const cancelled = await dispatcher.dispatch(
    'count',
    plan(['a', 'b', 'tail'], { mode: 'count', count: 2 }),
    {
      valid: () => !calls.length,
    },
  );
  assert.equal(cancelled.cancelled, true);
  assert.deepEqual(calls, ['a']);
});

test('independent presses overlap while each batch preserves every entry and first never falls through failure', async () => {
  const calls = [],
    errors = [];
  let finish;
  const dispatcher = new CommandDispatcher(
    async (id) => {
      calls.push(id);
      if (id === 'a' && calls.length === 1)
        await new Promise((resolve) => {
          finish = resolve;
        });
      if (id === 'fail') throw Error('fixture');
    },
    (error) => errors.push(error),
  );
  const batch = dispatcher.dispatch('keyboard:F1', plan(['a', 'b', 'a']));
  assert.equal((await dispatcher.dispatch('keyboard:F1', plan(['a', 'c'], 'first'))).executed, 1);
  assert.equal((await dispatcher.dispatch('keyboard:F2', plan(['b']))).executed, 1);
  const parallel = await dispatcher.dispatch('gesture:right', plan(['b', 'c']));
  assert.deepEqual(parallel, { executed: 2, failed: 0, busy: 0, cancelled: false });
  assert.deepEqual(calls, ['a', 'a', 'b', 'b', 'c']);
  finish();
  await batch;
  assert.deepEqual(calls, ['a', 'a', 'b', 'b', 'c', 'b', 'a']);
  const firstFailure = await dispatcher.dispatch('keyboard:F3', plan(['fail', 'tail'], 'first'));
  assert.equal(firstFailure.failed, 1);
  assert.equal(calls.includes('tail'), false);
  await dispatcher.dispatch('keyboard:F3', plan(['fail', 'tail']));
  assert.equal(calls.at(-1), 'tail');
  assert.equal(errors.length, 2);
});

test('a fixed plan survives page changes and allows independent input during asynchronous validity', async () => {
  const context = { host: { focused: true, pageId: 'host.settings' } };
  const rows = normalizeRows(
    ['a', 'b'].map((command) => ({
      id: command,
      command,
      when: { scope: 'applets', appletIds: ['host.settings'] },
    })),
  );
  const captured = planCommandBatch(rows, context, [{ id: 'a' }, { id: 'b' }], 'all');
  let reentered = false;
  const calls = [];
  const dispatcher = new CommandDispatcher(async (id) => calls.push(id), assert.fail);
  await dispatcher.dispatch('keyboard:F1', captured, {
    async valid() {
      if (!reentered) {
        reentered = true;
        const nested = await dispatcher.dispatch('gesture:left', plan(['a', 'b']));
        assert.equal(nested.executed, 2);
      }
      return true;
    },
    async execute(id) {
      calls.push(id);
      context.host.pageId = 'host.logs';
      rows.splice(0);
    },
  });
  assert.deepEqual(calls, ['a', 'b', 'a', 'b']);
  assert.equal(Object.isFrozen(captured.commands), true);
});

test('lifetime cancellation and failures leave other inputs usable; shutdown stops the remaining batch', async () => {
  let valid = true,
    stopped = false;
  const calls = [];
  const dispatcher = new CommandDispatcher(
    async (id) => {
      calls.push(id);
      if (id === 'quit') stopped = true;
    },
    assert.fail,
    () => stopped,
  );
  const cancelled = await dispatcher.dispatch('gesture:left', plan(['a', 'b']), {
    valid: async () => valid,
    execute: async (id) => {
      calls.push(id);
      valid = false;
    },
  });
  assert.equal(cancelled.cancelled, true);
  assert.deepEqual(calls, ['a']);
  await dispatcher.dispatch('keyboard:F1', plan(['a', 'b']));
  assert.deepEqual(calls, ['a', 'a', 'b']);
  await assert.rejects(
    dispatcher.dispatch('gesture:left', plan(['a']), {
      valid: async () => {
        throw Error('disconnected');
      },
      execute: assert.fail,
    }),
    /disconnected/,
  );
  assert.equal((await dispatcher.dispatch('keyboard:F2', plan(['a']))).busy, 0);
  assert.equal((await dispatcher.dispatch('keyboard:F3', plan(['quit', 'b']))).cancelled, true);
  assert.equal(calls.at(-1), 'quit');
});

test('key aliases share saved order and first/all; local input cannot execute a global row', () => {
  const rows = [
    {
      id: 'g',
      command: 'global',
      key: 'Ctrl+]',
      enabled: true,
      when: { scope: 'global', appletIds: [] },
    },
    {
      id: 'l',
      command: 'local',
      key: 'Ctrl+OemCloseBrackets',
      enabled: true,
      when: { scope: 'app', appletIds: [] },
    },
  ];
  const catalog = [{ id: 'global' }, { id: 'local' }];
  assert.deepEqual(
    planKeybindings(
      rows,
      rows.map((r) => r.key),
      { appFocused: true },
      catalog,
      true,
    ).commands,
    ['global', 'local'],
  );
  assert.deepEqual(
    planKeybindings(
      rows,
      rows.map((r) => r.key),
      { appFocused: true },
      catalog,
      true,
      'first',
    ).commands,
    ['global'],
  );
  assert.deepEqual(
    planKeybindings(
      rows,
      rows.map((r) => r.key),
      { appFocused: true },
      catalog,
    ).commands,
    ['local'],
  );
});

test('gesture final execution requires exact native selection, target facts and current session/revision', async () => {
  const settings = createDefaultSettings();
  settings.gestures.bindings = ['a', 'b'].map((id) => ({
    id,
    command: id,
    enabled: true,
    gesture: 'move-left',
    when: { scope: 'global', appletIds: [], processes: [] },
  }));
  const context = { appFocused: false, window: '' };
  const calls = [];
  const catalog = ['a', 'b'].map((id) => ({ id, title: id }));
  const settingsKey = () =>
    createHash('sha256')
      .update(
        JSON.stringify([
          require('../out/main/shared/gestures').getGestureSettings(settings),
          catalog,
        ]),
      )
      .digest('hex');
  const manager = new InputCaptureManager(
    'unused',
    () => ({
      settings,
      context,
      commands: catalog,
      recording: false,
    }),
    new CommandDispatcher(assert.fail, assert.fail),
    async (id) => calls.push(id),
    () => {},
    assert.fail,
    {},
  );
  manager.revision = 7;
  manager.peer = { request: async () => true };
  const payload = {
    session: 'live',
    window: '100',
    process: 'probe',
    gesture: 'move-left',
    context: JSON.stringify(context),
    revision: 7,
    settingsKey: settingsKey(),
    rowIds: ['a', 'b'],
    target: { window: '100', processName: 'probe', desktop: false },
  };
  for (const patch of [
    { rowIds: ['b', 'a'] },
    { rowIds: ['a'] },
    { rowIds: ['a', 'a'] },
    { rowIds: ['a', 'unknown'] },
    { target: undefined },
    { target: { ...payload.target, window: '200' } },
    { target: { ...payload.target, processName: 'other' } },
    { revision: 6 },
    { settingsKey: 'old' },
    { context: 'old' },
  ])
    await manager.event('gestures.invoke', { ...payload, ...patch });
  assert.deepEqual(calls, []);
  await manager.event('gestures.invoke', payload);
  assert.deepEqual(calls, ['a', 'b']);
  settings.gestures.executionMode = 'first';
  payload.settingsKey = settingsKey();
  await manager.event('gestures.invoke', payload);
  assert.deepEqual(calls, ['a', 'b']);
  await manager.event('gestures.invoke', { ...payload, rowIds: ['a'] });
  assert.deepEqual(calls, ['a', 'b', 'a']);
  manager.peer.request = async () => false;
  await manager.event('gestures.invoke', { ...payload, rowIds: ['a'] });
  assert.equal(calls.length, 3);
  manager.peer.request = async () => true;
  settings.gestures.enabled = false;
  await manager.event('gestures.invoke', { ...payload, settingsKey: settingsKey(), rowIds: ['a'] });
  assert.equal(calls.length, 3);
  settings.gestures.enabled = true;
  settings.gestures.executionMode = 'all';
  manager.execute = async (id) => {
    calls.push(id);
    settings.gestures.distance++;
  };
  await manager.event('gestures.invoke', { ...payload, settingsKey: settingsKey() });
  assert.deepEqual(calls, ['a', 'b', 'a', 'a']);
  manager.execute = async (id) => {
    calls.push(id);
    settings.commandTriggerOptions.browsers = ['changed-browser'];
  };
  await manager.event('gestures.invoke', { ...payload, settingsKey: settingsKey() });
  assert.deepEqual(
    calls,
    ['a', 'b', 'a', 'a', 'a'],
    'a common browser change cancels the remaining captured batch',
  );
});

test('target validation keeps absent facts unknown and rejects malformed native fields', () => {
  assert.deepEqual(readCommandTarget({ window: '100', desktop: null }), {
    window: '100',
    processName: undefined,
    windowClass: undefined,
    desktop: undefined,
  });
  for (const target of [
    null,
    [],
    { window: '-1' },
    { window: 100 },
    { window: '100', desktop: 0 },
    { window: '100', processName: 'x'.repeat(121) },
    { window: '100', windowClass: 0 },
  ])
    assert.equal(readCommandTarget(target), undefined);
});
