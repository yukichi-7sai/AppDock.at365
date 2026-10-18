const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  HomePageSession,
  HomeCommandExecution,
  parseHomePageRequest,
} = require('../out/main/main/core/home-page');
function fixture() {
  const state = {
    applets: [
      {
        id: 'a',
        displayName: 'A',
        description: 'Description',
        state: 'running',
        runtime: 'node',
        version: '1.0',
        folder: 'secret',
        settings: [{ key: 'secret' }],
      },
      { id: 'b', displayName: 'B', state: 'error', runtime: 'web', version: '2.0' },
      { id: 'builtin', sourceKind: 'builtin', state: 'running' },
    ],
    commands: [
      { id: 'a.run', title: 'Run', extension: 'A', available: true },
      { id: 'b.run', title: 'Stopped', extension: 'B', available: false },
    ],
    pins: ['b.run', 'missing', 'a.run'],
    dark: true,
    executions: [],
    opened: [],
    navigated: [],
    changed: 0,
    execute: async () => {},
  };
  const request = { id: 'home', kind: 'home', route: 'home', appletOrder: ['b', 'a'] };
  const execution = new HomeCommandExecution({
    execute: async (id) => {
      state.executions.push(id);
      await state.execute();
    },
    changed: () => state.changed++,
    completed: (result) => {
      state.result = result;
    },
  });
  const options = {
    applets: () => state.applets,
    commands: () => state.commands,
    pins: () => state.pins,
    dark: () => state.dark,
    changed: () => state.changed++,
    execution,
    navigate: async (id) => state.navigated.push(id),
    openApplet: (id) => state.opened.push(id),
  };
  const session = new HomePageSession(request, options);
  const invoke = (id) => session.act({ id: 'home', type: 'invoke', actionId: id });
  return { state, session, request, invoke, execution, options };
}
test('home projects counts, saved pins and shared draft order without exposing host data', () => {
  const { state, session, request, execution } = fixture();
  const first = session.snapshot();
  assert.deepEqual(first.content.stats, { running: 1, errors: 1, applets: 2, commands: 2 });
  assert.deepEqual(
    first.content.pins.map((p) => p.id),
    ['b.run', 'a.run'],
  );
  assert.deepEqual(
    first.content.applets.map((a) => a.id),
    ['b', 'a'],
  );
  assert.equal(first.content.pins[0].available, false);
  assert(!JSON.stringify(first).includes('secret'));
  assert.equal(session.snapshot().revision, first.revision);
  session.update({ ...request, appletOrder: ['a', 'unknown', 'a'] });
  assert.deepEqual(
    session.snapshot().content.applets.map((a) => a.id),
    ['a', 'b'],
  );
  state.dark = false;
  state.applets[1].state = 'running';
  state.commands[0].title = 'Renamed';
  state.pins = ['a.run'];
  const next = session.snapshot();
  assert(next.revision > first.revision);
  assert.equal(next.content.stats.running, 2);
  assert.equal(next.content.pins[0].title, 'Renamed');
  assert.equal(next.dark, false);
  session.dispose();
  execution.dispose();
});
test('home rejects stale, removed, unissued and newly unavailable operations', async () => {
  const { state, session, invoke, execution } = fixture();
  const pin = session.snapshot().content.pins[1].actionId;
  await assert.rejects(session.act({ id: 'old', type: 'invoke', actionId: pin }), /Stale/);
  await assert.rejects(invoke('a.run'), /no longer/);
  await assert.rejects(session.act({ id: 'home', type: 'open-directory' }), /Unknown/);
  state.commands[0].available = false;
  await assert.rejects(invoke(pin), /unavailable/);
  state.commands[0].available = true;
  state.pins = [];
  await assert.rejects(invoke(pin), /no longer/);
  const card = session.snapshot().content.applets[0].actionId;
  state.applets = state.applets.filter((a) => a.id !== 'b');
  await assert.rejects(invoke(card), /no longer/);
  assert.deepEqual(state.executions, []);
  session.dispose();
  execution.dispose();
});
test('controller survives presentation reconnect, guards in-flight execution and reports results', async () => {
  const { state, session, invoke, execution } = fixture();
  let finish;
  state.execute = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pin = session.snapshot().content.pins[1].actionId;
  const pending = invoke(pin);
  assert.equal(session.snapshot().content.busy, true);
  await assert.rejects(invoke(pin), /in progress/);
  await invoke(session.snapshot().content.applets[0].actionId);
  assert.deepEqual(state.opened, ['b']);
  state.commands.push(
    ...['appdock.commands.search', 'appdock.logs.open', 'appdock.applets.open'].map((id) => ({
      id,
      available: true,
    })),
  );
  for (const id of Object.values(session.snapshot().content.actions)) await invoke(id);
  assert.deepEqual(state.navigated, [
    'appdock.commands.search',
    'appdock.logs.open',
    'appdock.applets.open',
  ]);
  assert.equal(session.snapshot().content.busy, true);
  assert.equal(state.executions.length, 1);
  assert.equal(session.snapshot().content.pins[1].actionId, pin);
  finish();
  await pending;
  assert.equal(session.snapshot().content.busy, false);
  assert.equal(session.snapshot().content.message, '');
  state.execute = async () => {
    throw Error('Fixture failure');
  };
  await invoke(pin);
  assert.equal(session.snapshot().content.error, 'Fixture failure');
  await invoke(session.snapshot().content.applets[0].actionId);
  assert.deepEqual(state.opened, ['b', 'b']);
  session.dispose();
  execution.dispose();
  await assert.rejects(invoke(pin), /Stale/);
});
test('home validates input projection and disposal during an accepted command', async () => {
  const { session, request, state, invoke, execution } = fixture();
  for (const value of [
    null,
    {},
    { ...request, route: 'settings' },
    { ...request, appletOrder: {} },
    { ...request, appletOrder: [null] },
  ])
    assert.throws(() => parseHomePageRequest(value), /Invalid/);
  const input = parseHomePageRequest({ ...request, settings: { secret: true } });
  assert.deepEqual(Object.keys(input).sort(), ['appletOrder', 'id', 'kind', 'route']);
  let finish;
  state.execute = () =>
    new Promise((r) => {
      finish = r;
    });
  const pending = invoke(session.snapshot().content.pins[1].actionId);
  session.dispose();
  execution.dispose();
  const changes = state.changed;
  finish();
  await pending;
  assert.equal(state.changed, changes);
});
test('page remount cannot bypass pending execution and completion outlives the old view', async () => {
  const { state, session, request, invoke, execution, options } = fixture();
  let finish;
  state.execute = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = invoke(session.snapshot().content.pins[1].actionId);
  session.dispose();
  const next = new HomePageSession({ ...request, id: 'next' }, options);
  const model = next.snapshot();
  assert.equal(model.content.busy, true);
  await assert.rejects(
    next.act({ id: 'next', type: 'invoke', actionId: model.content.pins[1].actionId }),
    /in progress/,
  );
  finish();
  await pending;
  assert.equal(state.executions.length, 1);
  assert.equal(next.snapshot().content.message, '');
  assert.deepEqual(state.result, { message: '', error: '' });
  next.dispose();
  execution.dispose();
});
