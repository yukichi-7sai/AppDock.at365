const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NotificationAvailability } = require('../out/main/main/core/notification-availability');
const turn = () => new Promise(setImmediate);
function fixture(t, query = async () => true) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const calls = [],
    failures = [];
  let closes = 0;
  const availability = new NotificationAvailability({
    query: () => {
      calls.push(true);
      return query();
    },
    close: () => closes++,
    failed: () => failures.push(true),
  });
  t.after(() => availability.dispose());
  return { availability, calls, failures, closes: () => closes };
}

test('eligibility checks are lazy, shared and scheduled sixty seconds after completion', async (t) => {
  let release;
  const f = fixture(
    t,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  t.mock.timers.tick(600000);
  assert.equal(f.calls.length, 0);
  f.availability.use('desktop', true);
  f.availability.use('speech', true);
  t.mock.timers.tick(120000);
  assert.equal(f.calls.length, 1, 'slow checks never overlap');
  release(true);
  await turn();
  t.mock.timers.tick(59999);
  assert.equal(f.calls.length, 1);
  t.mock.timers.tick(1);
  assert.equal(f.calls.length, 2);
  f.availability.use('desktop', false);
  assert.equal(f.closes(), 0);
  f.availability.use('speech', false);
  assert.equal(f.closes(), 1);
  release(true);
  await turn();
  assert.equal(f.availability.status(), 'unknown');
  t.mock.timers.tick(600000);
  assert.equal(f.calls.length, 2);
});

test('new deliveries recheck cached permission, but cannot advance a known suppression deadline', async (t) => {
  let allowed = true;
  const f = fixture(t, async () => allowed);
  f.availability.use('desktop', true);
  await turn();
  assert.equal(f.availability.status(), 'allowed');
  allowed = false;
  f.availability.prepareDelivery();
  assert.equal(f.availability.status(), 'unknown', 'new content cannot use stale permission');
  await turn();
  assert.equal(f.availability.status(), 'blocked');
  allowed = true;
  for (let i = 0; i < 3; i++) {
    t.mock.timers.tick(19999);
    f.availability.prepareDelivery();
    await turn();
  }
  assert.equal(f.calls.length, 2);
  assert.equal(f.availability.status(), 'blocked');
  t.mock.timers.tick(3);
  await turn();
  assert.equal(f.availability.status(), 'allowed');
  assert.equal(f.calls.length, 3);
});

test('lock cancels queries and timers, rejects stale results and respects other blocking reasons', async (t) => {
  const releases = [];
  const f = fixture(t, () => new Promise((resolve) => releases.push(resolve)));
  f.availability.use('desktop', true);
  f.availability.setPaused(true);
  releases[0](true);
  await turn();
  assert.equal(f.availability.status(), 'blocked');
  f.availability.prepareDelivery();
  f.availability.retry();
  t.mock.timers.tick(600000);
  assert.equal(f.calls.length, 1);
  f.availability.setBlocked('fullscreen', true);
  f.availability.setPaused(false);
  assert.equal(f.calls.length, 1);
  f.availability.setBlocked('fullscreen', false);
  assert.equal(f.calls.length, 2);
  releases[1](true);
  await turn();
  assert.equal(f.availability.status(), 'allowed');
  f.availability.setPaused(true);
  t.mock.timers.tick(600000);
  assert.equal(f.calls.length, 2, 'a completed query leaves no timer while paused');
  f.availability.setPaused(false);
  assert.equal(f.calls.length, 3, 'resume can query immediately without an extra cooldown');
});

test('query failure stops automatic work until an explicit retry', async (t) => {
  let fail = true;
  const f = fixture(t, async () => {
    if (fail) throw Error('query unavailable');
    return true;
  });
  f.availability.use('desktop', true);
  await turn();
  assert.equal(f.availability.status(), 'failed');
  f.availability.prepareDelivery();
  f.availability.setPaused(true);
  f.availability.setPaused(false);
  t.mock.timers.tick(600000);
  assert.equal(f.calls.length, 1);
  assert.equal(f.failures.length, 1);
  fail = false;
  f.availability.retry();
  await turn();
  assert.equal(f.availability.status(), 'allowed');
  assert.equal(f.calls.length, 2);
});
