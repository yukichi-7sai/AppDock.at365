const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HostStartupTimingRecorder } = require('../out/main/main/core/host-startup-timing');

test('startup intervals retain nested wall times without summing overlapping work', () => {
  let now = 20;
  const r = new HostStartupTimingRecorder(() => now);
  const outer = r.begin('modules');
  now = 25;
  const inner = r.begin('settings');
  r.measure('settingsRead', () => {
    now = 32;
  });
  inner();
  now = 40;
  outer();
  r.mark('shown');
  now = 45;
  r.mark('ready');
  r.finish();
  const s = r.snapshot();
  assert.equal(s.processEntryMs, 20);
  assert.equal(s.elapsedMs, 25);
  assert.deepEqual(
    s.phases.map((p) => [p.id, p.startMs, p.durationMs, p.state]),
    [
      ['modules', 0, 20, 'ended'],
      ['settings', 5, 7, 'ended'],
    ],
  );
  assert.deepEqual(s.milestones, { shown: 20, ready: 25 });
  assert.equal(s.work[0].calls, 1);
  assert.equal(s.work[0].totalMs, 7);
});
test('startup measurement preserves failures and records repeated work', async () => {
  let now = 0;
  const r = new HostStartupTimingRecorder(() => now);
  const error = Error('fixture');
  assert.throws(
    () =>
      r.phase('settings', () =>
        r.measure('settingsRead', () => {
          now = 3;
          throw error;
        }),
      ),
    (e) => e === error,
  );
  await assert.rejects(
    r.phaseAsync('launch', async () => {
      now = 9;
      throw error;
    }),
    (e) => e === error,
  );
  r.measure('settingsRead', () => {
    now = 11;
  });
  r.finish();
  assert.deepEqual(
    r.snapshot().phases.map((p) => p.state),
    ['error', 'error'],
  );
  assert.deepEqual(r.snapshot().work[0], { id: 'settingsRead', calls: 2, totalMs: 5, maxMs: 3 });
});
test('completed records cannot collect later interaction or expose mutable state', () => {
  let now = 0;
  const r = new HostStartupTimingRecorder(() => now);
  r.countOnce('sharedBytes', 100);
  r.countOnce('sharedBytes', 200);
  r.count('readBytes', 100, true);
  r.count('readBytes', 200, true);
  r.finish();
  const original = r.snapshot();
  assert.equal(original.counts.sharedBytes, 100);
  assert.equal(original.counts.readBytes, 300);
  now = 100;
  r.mark('shown');
  r.count('commandCount', 99);
  assert.equal(
    r.measure('commandState', () => 42),
    42,
  );
  const s = r.snapshot();
  s.counts.sharedBytes = 0;
  s.milestones.shown = 999;
  s.phases.push({});
  assert.deepEqual(r.snapshot(), original);
  assert.equal(r.active, false);
});
test('finishing an interrupted async phase seals its record without cancelling its work', async () => {
  let now = 0,
    resolve;
  const r = new HostStartupTimingRecorder(() => now);
  const work = r.phaseAsync(
    'images',
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  now = 5;
  r.finish();
  const snapshot = r.snapshot();
  assert.equal(snapshot.phases[0].state, 'error');
  now = 10;
  resolve('done');
  assert.equal(await work, 'done');
  assert.deepEqual(r.snapshot(), snapshot);
});
