const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WindowBars } = require('../out/main/main/core/window-bars');
function fixture() {
  const state = {
    dark: false,
    version: '1.0.0',
    paletteKey: 'Ctrl+K',
    maximized: false,
    runningApplets: 2,
    update: { busy: false, blocked: false, phase: '', cancellable: false },
  };
  const calls = [];
  let execute = async (operation) => calls.push(operation);
  const bars = new WindowBars({ state: () => state, run: (operation) => execute(operation) });
  const action = (region, operation, requestId = 'request') => ({
    sessionId: 'current',
    requestId,
    actionId: bars.snapshot(region).actions[operation],
  });
  return { bars, state, calls, action, execute: (fn) => (execute = fn) };
}
test('bar snapshots advance only with state changes, preserve opaque actions, and copy public update progress', () => {
  const f = fixture();
  const first = f.bars.snapshot('titlebar');
  assert.equal(f.bars.snapshot('titlebar').revision, first.revision);
  f.state.maximized = true;
  const next = f.bars.snapshot('titlebar');
  assert(next.revision > first.revision);
  assert.deepEqual(next.actions, first.actions);
  assert(!next.actions.update);
  assert(!f.bars.snapshot('statusbar').actions.close);
  next.update.busy = true;
  assert.equal(f.state.update.busy, false);
});
test('stale sessions, unknown operations, wrong region and malformed request IDs never execute', () => {
  const f = fixture();
  const request = f.action('titlebar', 'close');
  for (const invalid of [
    null,
    { ...request, sessionId: 'old' },
    { ...request, requestId: '' },
    { ...request, actionId: 'close' },
  ])
    assert.throws(() => f.bars.invoke('titlebar', 'current', invalid));
  assert.throws(() => f.bars.invoke('statusbar', 'current', request), /unavailable/);
  assert.deepEqual(f.calls, []);
});
test('duplicate requests share the same in-flight and completed result; conflicting reuse is refused', async () => {
  const f = fixture();
  let finish,
    count = 0;
  f.execute(() => {
    count++;
    return new Promise((resolve) => (finish = resolve));
  });
  const request = f.action('titlebar', 'maximize');
  const first = f.bars.invoke('titlebar', 'current', request);
  assert.equal(f.bars.invoke('titlebar', 'current', request), first);
  assert.throws(
    () =>
      f.bars.invoke('titlebar', 'current', {
        ...request,
        actionId: f.action('titlebar', 'close').actionId,
      }),
    /Conflicting/,
  );
  await new Promise(setImmediate);
  finish('done');
  assert.equal(await first, 'done');
  assert.equal(await f.bars.invoke('titlebar', 'current', request), 'done');
  assert.equal(count, 1);
});
test('update and cancellation follow current service availability rather than old snapshots', async () => {
  const f = fixture();
  const update = f.action('statusbar', 'update');
  f.state.update.blocked = true;
  assert.throws(() => f.bars.invoke('statusbar', 'current', update), /unavailable/);
  f.state.update.blocked = false;
  await f.bars.invoke('statusbar', 'current', update);
  f.state.update.busy = true;
  f.state.update.cancellable = true;
  const cancel = f.action('statusbar', 'cancel', 'cancel');
  f.state.update.cancellable = false;
  assert.throws(() => f.bars.invoke('statusbar', 'current', cancel), /unavailable/);
  assert.deepEqual(f.calls, ['update']);
});
test('a failed request is not rerun and a replacement View gets an independent session', async () => {
  const f = fixture();
  let count = 0;
  f.execute(async () => {
    count++;
    throw Error('fixture failure');
  });
  const request = f.action('titlebar', 'minimize');
  await assert.rejects(f.bars.invoke('titlebar', 'current', request), /fixture failure/);
  await assert.rejects(f.bars.invoke('titlebar', 'current', request), /fixture failure/);
  assert.equal(count, 1);
  f.bars.disconnect('current');
  await assert.rejects(
    f.bars.invoke('titlebar', 'replacement', { ...request, sessionId: 'replacement' }),
    /fixture failure/,
  );
  assert.equal(count, 2);
});

test('availability is checked again before execution and completed receipts expire after two minutes', async () => {
  const f = fixture();
  const pending = f.bars.invoke('statusbar', 'current', f.action('statusbar', 'update'));
  f.state.update.blocked = true;
  await assert.rejects(pending, /no longer available/);
  assert.deepEqual(f.calls, []);
  const request = f.action('titlebar', 'maximize', 'expiry');
  const original = Date.now;
  let time = 1000;
  Date.now = () => time;
  try {
    await f.bars.invoke('titlebar', 'current', request);
    time += 120001;
    await f.bars.invoke('titlebar', 'current', request);
    assert.deepEqual(f.calls, ['maximize', 'maximize']);
  } finally {
    Date.now = original;
  }
});
