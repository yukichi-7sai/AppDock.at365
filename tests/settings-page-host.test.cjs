const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SettingsPageHost } = require('../out/main/main/core/settings-page-host');
function fixture() {
  let route = 'settings',
    flush = async () => {},
    disposed = [],
    changes = [],
    activity = [];
  const host = new SettingsPageHost({
    allowed: (r) => r.route === route,
    flush: () => flush(),
    changed: (c) => changes.push(c),
    activeChanged: () => activity.push(host.isOpen()),
    create: (r) => ({
      isCurrent: () => true,
      snapshot: () => ({ id: r.id, revision: 1 }),
      act: async (a) => ({ model: { id: r.id }, result: a.operationId }),
      dispose: () => disposed.push(r.id),
    }),
  });
  return {
    host,
    disposed,
    changes,
    activity,
    route: (r) => (route = r),
    flush: (f) => (flush = f),
  };
}
const request = { id: 'untrusted-id', route: 'settings', kind: 'settings', context: 'full' };

test('active settings surface tracks opening, replacement, stale cleanup and navigation', async () => {
  const f = fixture();
  assert.equal(f.host.isOpen(), false);
  const first = await f.host.open(request);
  assert.equal(f.host.isOpen(), true);
  assert.deepEqual(f.activity, [true]);
  const second = await f.host.open(request);
  assert.deepEqual(f.activity, [true, false, true]);
  f.host.close(first.connectionId);
  assert.equal(f.host.isOpen(), true);
  assert.deepEqual(f.activity, [true, false, true]);
  f.route('home');
  assert.equal(f.host.isOpen(), false);
  f.host.close(second.connectionId);
  assert.equal(f.host.isOpen(), false);
  assert.deepEqual(f.activity, [true, false, true, false]);
});
test('replacement invalidates stale calls and stale cleanup cannot close the new settings page', async () => {
  const f = fixture();
  const old = await f.host.open(request);
  assert.notEqual(old.connectionId, request.id);
  const next = await f.host.open(request);
  assert.notEqual(next.connectionId, old.connectionId);
  assert.throws(() => f.host.get(old.connectionId), /古く/);
  await assert.rejects(f.host.act(old.connectionId, {}), /古く/);
  f.host.close(old.connectionId);
  assert.equal(f.host.get(next.connectionId).id, next.connectionId);
  f.route('home');
  assert.throws(() => f.host.get(next.connectionId), /古く/);
  f.host.close(next.connectionId);
  assert.deepEqual(f.disposed, [old.connectionId, next.connectionId]);
});
test('failed drain keeps the existing connection and a route change during open cannot replace it', async () => {
  const f = fixture();
  const old = await f.host.open(request);
  f.flush(async () => {
    throw Error('flush failed');
  });
  await assert.rejects(f.host.open(request), /flush failed/);
  assert.equal(f.host.get(old.connectionId).id, old.connectionId);
  let release;
  f.flush(() => new Promise((r) => (release = r)));
  const opening = f.host.open(request);
  f.route('home');
  release();
  await assert.rejects(opening, /対象が変わり/);
  assert.deepEqual(f.disposed, []);
  f.route('settings');
  f.host.refresh();
  assert.equal(f.changes[0].connectionId, old.connectionId);
});
test('closing the window invalidates an open waiting for renderer input', async () => {
  const f = fixture();
  await f.host.open(request);
  let release;
  f.flush(() => new Promise((r) => (release = r)));
  const pending = f.host.open(request);
  f.host.dispose();
  release();
  await assert.rejects(pending, /対象が変わり/);
  assert.throws(() => f.host.get('anything'), /古く/);
});
