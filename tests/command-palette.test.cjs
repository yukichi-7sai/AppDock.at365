const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CommandPaletteSession } = require('../out/main/main/core/command-palette');
const { shellView } = require('../out/main/shared/shell');
function fixture(request = {}, execute) {
  const state = {
    commands: ['a', 'b', 'c'].map((id) => ({ id, title: id, extension: 'test', available: true })),
    pins: ['a', 'missing', 'b'],
    executed: [],
    changes: 0,
    closed: 0,
  };
  const session = new CommandPaletteSession(
    { requestId: 'test', mode: 'execute', ...request },
    {
      commands: () => state.commands,
      pins: () => state.pins,
      shortcuts: () => ({}),
      dark: () => false,
      savePins: (ids) => {
        state.pins = ids;
      },
      execute:
        execute ??
        (async (id) => {
          state.executed.push(id);
        }),
      changed: () => state.changes++,
    },
  );
  session.onClosed(() => state.closed++);
  return { state, session, act: (action) => session.act({ id: session.id, ...action }) };
}
test('selection restricts catalog, retains missing choices and never executes or saves pins', async () => {
  const f = fixture({ mode: 'select', commandIds: ['b', 'missing'], pins: ['b'] });
  f.state.commands[1].available = false;
  assert.deepEqual(
    f.session.snapshot().content.commands.map((c) => c.id),
    ['b', 'missing'],
  );
  await assert.rejects(f.act({ type: 'choose', commandId: 'a' }), /no longer/);
  await assert.rejects(f.act({ type: 'togglePin', commandId: 'b' }), /Selection/);
  await f.act({ type: 'choose', commandId: 'b' });
  assert.deepEqual(await f.session.result, { status: 'selected', commandId: 'b' });
  assert.deepEqual(f.state.executed, []);
  assert.deepEqual(f.state.pins, ['a', 'missing', 'b']);
});
test('execution rechecks availability and rejects stale or duplicate in-flight actions', async () => {
  let release,
    count = 0;
  const f = fixture({}, async () => {
    count++;
    await new Promise((r) => (release = r));
  });
  const r = f.session.snapshot().revision;
  assert.equal(f.session.snapshot().revision, r);
  f.state.commands[0].available = false;
  assert.ok(f.session.snapshot().revision > r);
  await assert.rejects(f.act({ type: 'choose', commandId: 'a' }), /unavailable/);
  const pending = f.act({ type: 'choose', commandId: 'b' });
  await assert.rejects(f.act({ type: 'choose', commandId: 'b' }), /in progress/);
  await assert.rejects(f.session.act({ id: 'old', type: 'dismiss' }), /Stale/);
  release();
  await pending;
  assert.equal(count, 1);
  assert.deepEqual(await f.session.result, { status: 'executed', commandId: 'b' });
  await assert.rejects(f.act({ type: 'choose', commandId: 'c' }), /Stale/);
});
test('pin operations use current state, preserve hidden pins and selection order', async () => {
  const f = fixture();
  f.session.snapshot();
  f.state.pins.push('c');
  await f.act({ type: 'movePin', commandId: 'b', direction: -1, visibleIds: ['a', 'b'] });
  assert.deepEqual(f.state.pins, ['b', 'missing', 'a', 'c']);
  await f.act({ type: 'togglePin', commandId: 'c' });
  assert.deepEqual(f.state.pins, ['b', 'missing', 'a']);
  await assert.rejects(
    f.act({ type: 'movePin', commandId: 'b', direction: 0, visibleIds: [] }),
    /Invalid/,
  );
});
test('failure stays open with error; cancel resolves once even during execution', async () => {
  const f = fixture({}, async () => {
    throw Error('fixture failed');
  });
  await f.act({ type: 'choose', commandId: 'a' });
  assert.equal(f.session.snapshot().content.error, 'fixture failed');
  assert.equal(f.session.snapshot().content.busy, false);
  f.session.cancel('owner-closed');
  f.session.cancel('again');
  assert.deepEqual(await f.session.result, { status: 'cancelled', reason: 'owner-closed' });
  assert.equal(f.state.closed, 1);
  let release;
  const g = fixture({}, async () => new Promise((r) => (release = r)));
  const pending = g.act({ type: 'choose', commandId: 'a' });
  g.session.cancel('replaced');
  release();
  await pending;
  assert.equal((await g.session.result).status, 'cancelled');
  assert.equal(g.state.closed, 1);
});
test('partial Shell view lookup preserves legacy ribbon and does not require other regions', () => {
  assert.equal(shellView({ ui: 'old.html' }, 'ribbon'), 'old.html');
  assert.equal(shellView({ ui: 'old.html', views: { ribbon: 'new.html' } }, 'ribbon'), 'new.html');
  assert.equal(
    shellView({ views: { 'overlay.command-palette': 'palette.html' } }, 'ribbon'),
    undefined,
  );
  assert.equal(shellView({ ui: 'old.html' }, 'overlay.command-palette'), undefined);
  assert.equal(
    shellView({ views: { 'overlay.command-palette': 'old.html' } }, 'overlay.command-palette'),
    undefined,
  );
});

test('initial command selection is exact, does not execute and permits known unavailable commands', async () => {
  const f = fixture({ initialCommandId: 'b' });
  assert.equal(f.session.snapshot().content.initialCommandId, 'b');
  assert.deepEqual(f.state.executed, []);
  f.state.commands[1].available = false;
  await assert.rejects(f.act({ type: 'choose', commandId: 'b' }), /unavailable/);
  for (const id of ['missing', '__proto__', ' a'])
    assert.throws(() => fixture({ initialCommandId: id }));
  f.state.commands[1].hidden = true;
  await assert.rejects(f.act({ type: 'choose', commandId: 'b' }), /no longer/);
  assert.deepEqual(f.state.executed, []);
});
