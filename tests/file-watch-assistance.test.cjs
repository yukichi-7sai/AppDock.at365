const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  FileWatchAssistance,
  defaultFileWatchAssistanceOptions,
} = require('../out/main/main/core/file-watch-assistance');

const flush = () => new Promise(setImmediate);
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
class Clock {
  time = 0n;
  pending = new Map();
  history = [];
  maximumPending = 0;
  now = () => this.time;
  schedule = (callback, delay) => {
    assert.ok(Number.isInteger(delay) && delay >= 1 && delay <= 2147483647);
    const task = { callback, delay, at: this.time + BigInt(delay) * 1_000_000n };
    this.history.push(task);
    this.pending.set(task, task);
    this.maximumPending = Math.max(this.maximumPending, this.pending.size);
    return { cancel: () => this.pending.delete(task) };
  };
  async tick(milliseconds) {
    const end = this.time + BigInt(Math.round(milliseconds * 1_000_000));
    let turns = 0;
    while (true) {
      const next = [...this.pending.values()]
        .filter((task) => task.at <= end)
        .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))[0];
      if (!next) break;
      assert.ok(++turns < 25000, 'Timer activity must make progress.');
      this.time = next.at;
      this.pending.delete(next);
      next.callback();
      await flush();
    }
    this.time = end;
    await flush();
  }
  get milliseconds() {
    return Number(this.time) / 1_000_000;
  }
}
function fixture(t, failed) {
  const clock = new Clock();
  const errors = [];
  const service = new FileWatchAssistance({
    clock,
    failed: failed ?? ((error) => errors.push(error)),
  });
  t.after(() => service.dispose());
  return {
    clock,
    errors,
    service,
    enable(intervalSeconds = 2) {
      service.configure({ enabled: true, intervalSeconds });
      service.start();
    },
  };
}

test('default off, the startup gate and an empty registry create no periodic work', async (t) => {
  const f = fixture(t);
  let calls = 0;
  assert.deepEqual(defaultFileWatchAssistanceOptions, { enabled: false, intervalSeconds: 300 });
  assert.ok(Object.isFrozen(defaultFileWatchAssistanceOptions));
  f.service.register('one', async () => calls++);
  f.service.start();
  await f.clock.tick(600000);
  assert.equal(calls, 0);
  assert.equal(f.clock.pending.size, 0);
  const g = fixture(t);
  g.service.register('one', async () => calls++);
  g.service.configure({ enabled: true, intervalSeconds: 2 });
  await g.clock.tick(10000);
  assert.equal(calls, 0);
  g.service.start();
  await g.clock.tick(1999);
  assert.equal(calls, 0);
  await g.clock.tick(1);
  assert.equal(calls, 1);
  const empty = fixture(t);
  empty.enable();
  await empty.clock.tick(10000);
  assert.equal(empty.clock.pending.size, 0);
});

test('the default interval is five minutes when only enabling the service', async (t) => {
  const f = fixture(t);
  let calls = 0;
  f.service.register('one', async () => calls++);
  f.enable(defaultFileWatchAssistanceOptions.intervalSeconds);
  await f.clock.tick(299999);
  assert.equal(calls, 0);
  await f.clock.tick(1);
  assert.equal(calls, 1);
});

test('checks run in registration order and the next delay begins after all checks settle', async (t) => {
  const f = fixture(t);
  const first = deferred(),
    second = deferred();
  const calls = [];
  f.service.register('first', async () => {
    calls.push(['first', f.clock.milliseconds]);
    await first.promise;
  });
  f.service.register('second', async () => {
    calls.push(['second', f.clock.milliseconds]);
    await second.promise;
  });
  f.enable();
  await f.clock.tick(2000);
  await f.clock.tick(1000);
  assert.deepEqual(calls, [['first', 2000]]);
  assert.equal(f.clock.pending.size, 0);
  first.resolve();
  await flush();
  assert.deepEqual(calls, [
    ['first', 2000],
    ['second', 3000],
  ]);
  await f.clock.tick(2000);
  assert.equal(f.clock.pending.size, 0);
  second.resolve();
  await flush();
  await f.clock.tick(1999);
  assert.equal(calls.length, 2);
  await f.clock.tick(1);
  assert.deepEqual(calls.slice(2), [
    ['first', 7000],
    ['second', 7000],
  ]);
  assert.equal(f.clock.maximumPending, 1);
});

test('synchronous and asynchronous check failures and reporter failures do not stop later checks', async (t) => {
  const reported = [];
  const f = fixture(t, async (error) => {
    reported.push(error.message);
    throw Error('report unavailable');
  });
  let healthy = 0;
  f.service.register('sync', () => {
    throw Error('sync failure');
  });
  f.service.register('async', async () => {
    throw Error('async failure');
  });
  f.service.register('healthy', async () => healthy++);
  f.enable();
  await f.clock.tick(4000);
  assert.deepEqual(reported, ['sync failure', 'async failure', 'sync failure', 'async failure']);
  assert.equal(healthy, 2);
});

test('a synchronous reporter exception is isolated too', async (t) => {
  const f = fixture(t, () => {
    throw Error('report failed');
  });
  let calls = 0;
  f.service.register('broken', async () => {
    throw Error('read failed');
  });
  f.service.register('next', async () => calls++);
  f.enable();
  await f.clock.tick(2000);
  assert.equal(calls, 1);
});

test('turning off during a wait cancels it and re-enabling starts a fresh delay', async (t) => {
  const f = fixture(t);
  let calls = 0;
  f.service.register('one', async () => calls++);
  f.enable();
  await f.clock.tick(1500);
  f.service.configure({ enabled: false, intervalSeconds: 2 });
  assert.equal(f.clock.pending.size, 0);
  await f.clock.tick(10000);
  f.enable();
  await f.clock.tick(1999);
  assert.equal(calls, 0);
  await f.clock.tick(1);
  assert.equal(calls, 1);
});

test('off then on while a check runs abandons that round and still waits for the real completion', async (t) => {
  const f = fixture(t),
    active = deferred();
  const calls = [];
  let signal;
  f.service.register('first', async (context) => {
    signal = context.signal;
    calls.push('first');
    await active.promise;
  });
  f.service.register('second', async () => calls.push('second'));
  f.enable();
  await f.clock.tick(2000);
  f.service.configure({ enabled: false, intervalSeconds: 2 });
  f.enable();
  await f.clock.tick(10000);
  assert.equal(signal.aborted, false);
  assert.deepEqual(calls, ['first']);
  assert.equal(f.clock.pending.size, 0);
  active.resolve();
  await flush();
  assert.deepEqual(calls, ['first']);
  await f.clock.tick(1999);
  assert.equal(calls.length, 1);
  await f.clock.tick(1);
  assert.deepEqual(calls, ['first', 'first', 'second']);
});

test('a check may turn its own service off without starting the rest of the round', async (t) => {
  const f = fixture(t);
  let later = 0;
  f.service.register('settings', async () => {
    f.service.configure({ enabled: false, intervalSeconds: 2 });
  });
  f.service.register('images', async () => later++);
  f.enable();
  await f.clock.tick(20000);
  assert.equal(later, 0);
  assert.equal(f.clock.pending.size, 0);
});

test('changing the interval during a wait restarts the wait at the new duration', async (t) => {
  const f = fixture(t);
  let calls = 0;
  f.service.register('one', async () => calls++);
  f.enable(10);
  await f.clock.tick(9000);
  f.service.configure({ enabled: true, intervalSeconds: 3 });
  await f.clock.tick(2999);
  assert.equal(calls, 0);
  await f.clock.tick(1);
  assert.equal(calls, 1);
  assert.equal(f.clock.maximumPending, 1);
});

test('changing the interval during a round applies after its final check', async (t) => {
  const f = fixture(t),
    active = deferred();
  let calls = 0;
  f.service.register('one', async () => {
    calls++;
    await active.promise;
  });
  f.enable();
  await f.clock.tick(2000);
  f.service.configure({ enabled: true, intervalSeconds: 5 });
  await f.clock.tick(3000);
  active.resolve();
  await flush();
  await f.clock.tick(4999);
  assert.equal(calls, 1);
  await f.clock.tick(1);
  assert.equal(calls, 2);
});

test('repeated starts and equal configuration values never postpone a scheduled check', async (t) => {
  const f = fixture(t);
  let calls = 0;
  f.service.register('one', async () => calls++);
  f.enable();
  for (let i = 0; i < 4; i++) {
    await f.clock.tick(500);
    f.enable();
  }
  assert.equal(calls, 1);
  assert.equal(f.clock.maximumPending, 1);
});

test('registrations added during a round run next time and removed pending entries are skipped', async (t) => {
  const f = fixture(t),
    active = deferred();
  const calls = [];
  f.service.register('first', async () => {
    calls.push('first');
    await active.promise;
  });
  const remove = f.service.register('removed', async () => calls.push('removed'));
  f.enable();
  await f.clock.tick(2000);
  f.service.register('added', async () => calls.push('added'));
  remove();
  active.resolve();
  await flush();
  assert.deepEqual(calls, ['first']);
  await f.clock.tick(2000);
  assert.deepEqual(calls, ['first', 'first', 'added']);
});

test('changes to a nonempty registry during a wait do not reset its deadline', async (t) => {
  const f = fixture(t);
  const calls = [];
  f.service.register('first', async () => calls.push('first'));
  f.enable();
  await f.clock.tick(1500);
  const remove = f.service.register('temporary', async () => calls.push('temporary'));
  f.service.register('second', async () => calls.push('second'));
  remove();
  await f.clock.tick(500);
  assert.deepEqual(calls, ['first', 'second']);
});

test('removing the last registration cancels waiting and an old disposer cannot remove its replacement', async (t) => {
  const f = fixture(t);
  const calls = [];
  const remove = f.service.register('same', async () => calls.push('old'));
  f.enable();
  await f.clock.tick(1000);
  remove();
  assert.equal(f.clock.pending.size, 0);
  await f.clock.tick(10000);
  f.service.register('same', async () => calls.push('new'));
  remove();
  await f.clock.tick(1999);
  assert.deepEqual(calls, []);
  await f.clock.tick(1);
  assert.deepEqual(calls, ['new']);
});

test('unregistering active work aborts its signal but keeps the execution slot until it settles', async (t) => {
  const f = fixture(t),
    active = deferred();
  let oldSignal,
    next = 0;
  const remove = f.service.register('same', async ({ signal }) => {
    oldSignal = signal;
    await active.promise;
  });
  f.enable();
  await f.clock.tick(2000);
  remove();
  f.service.register('same', async () => next++);
  assert.equal(oldSignal.aborted, true);
  await f.clock.tick(10000);
  assert.equal(next, 0);
  assert.equal(f.clock.pending.size, 0);
  active.reject(Error('cancelled read'));
  await flush();
  await f.clock.tick(1999);
  assert.equal(next, 0);
  await f.clock.tick(1);
  assert.equal(next, 1);
  assert.deepEqual(f.errors, []);
});

test('disposing while waiting rejects new registrations and cannot be restarted', async (t) => {
  const f = fixture(t);
  let calls = 0;
  const remove = f.service.register('one', async () => calls++);
  f.enable();
  const queued = f.clock.history[0].callback;
  f.service.dispose();
  f.service.dispose();
  remove();
  f.enable();
  assert.throws(() => f.service.register('new', async () => {}), /disposed/);
  queued();
  await f.clock.tick(10000);
  assert.equal(calls, 0);
  assert.equal(f.clock.pending.size, 0);
});

test('disposing during a check aborts it and ignores late errors without starting other checks', async (t) => {
  const f = fixture(t),
    active = deferred();
  let signal,
    later = 0;
  f.service.register('first', async (context) => {
    signal = context.signal;
    await active.promise;
  });
  f.service.register('second', async () => later++);
  f.enable();
  await f.clock.tick(2000);
  f.service.dispose();
  assert.equal(signal.aborted, true);
  active.reject(Error('late shutdown failure'));
  await flush();
  await f.clock.tick(10000);
  assert.equal(later, 0);
  assert.deepEqual(f.errors, []);
  assert.equal(f.clock.pending.size, 0);
});

test('a callback already queued from a cancelled timer cannot start an extra round', async (t) => {
  const f = fixture(t);
  let calls = 0;
  f.service.register('one', async () => calls++);
  f.enable(10);
  const queued = f.clock.history[0].callback;
  f.service.configure({ enabled: true, intervalSeconds: 2 });
  queued();
  await f.clock.tick(2000);
  assert.equal(calls, 1);
  assert.equal(f.clock.maximumPending, 1);
});

test('invalid settings leave the current wait intact and caller mutation cannot alter settings', async (t) => {
  const f = fixture(t);
  let calls = 0;
  f.service.register('one', async () => calls++);
  const options = { enabled: true, intervalSeconds: 2 };
  f.service.configure(options);
  f.service.start();
  options.enabled = false;
  options.intervalSeconds = 999;
  for (const invalid of [
    null,
    {},
    { enabled: 1, intervalSeconds: 2 },
    ...[1.999, 0, -2, NaN, Infinity, '2'].map((intervalSeconds) => ({
      enabled: true,
      intervalSeconds,
    })),
  ]) {
    assert.throws(() => f.service.configure(invalid), /Invalid/);
  }
  await f.clock.tick(2000);
  assert.equal(calls, 1);
});

test('duplicate and invalid registrations cannot replace an existing check or expose its ID', async (t) => {
  const f = fixture(t);
  const id = 'private/path/owner';
  let calls = 0;
  f.service.register(id, async () => calls++);
  assert.throws(
    () => f.service.register(id, async () => {}),
    (error) => /Duplicate/.test(error.message) && !error.message.includes(id),
  );
  for (const invalid of ['', '  ', null])
    assert.throws(() => f.service.register(invalid, async () => {}), /Invalid/);
  assert.throws(() => f.service.register('bad-callback', null), /Invalid/);
  f.enable();
  await f.clock.tick(2000);
  assert.equal(calls, 1);
});

test('fractional seconds and submillisecond fractions never run before the requested wait', async (t) => {
  for (const seconds of [2.5, 2.0005]) {
    const f = fixture(t);
    let calls = 0;
    f.service.register('one', async () => calls++);
    f.enable(seconds);
    await f.clock.tick(Math.ceil(seconds * 1000) - 1);
    assert.equal(calls, 0);
    await f.clock.tick(1);
    assert.equal(calls, 1);
  }
});

test('long waits are split without executing checks on intermediate timer completions', async (t) => {
  const f = fixture(t);
  let calls = 0;
  f.service.register('one', async () => calls++);
  f.enable(2147489);
  await f.clock.tick(2147483647);
  assert.equal(calls, 0);
  assert.equal(f.clock.pending.size, 1);
  await f.clock.tick(5352);
  assert.equal(calls, 0);
  await f.clock.tick(1);
  assert.equal(calls, 1);
  assert.equal(f.clock.maximumPending, 1);
});

test('very large finite intervals do not overflow to a short native timeout', async (t) => {
  const f = fixture(t);
  let calls = 0;
  f.service.register('one', async () => calls++);
  f.enable(Number.MAX_VALUE);
  await f.clock.tick(2147483647);
  assert.equal(calls, 0);
  assert.equal(f.clock.pending.size, 1);
  assert.equal(f.clock.history.at(-1).delay, 2147483647);
});

test('late timer delivery runs only one round and resumes from its completion', async (t) => {
  const f = fixture(t);
  let calls = 0;
  f.service.register('one', async () => calls++);
  f.enable();
  const task = [...f.clock.pending.values()][0];
  f.clock.pending.delete(task);
  f.clock.time = 600_000_000_000n;
  task.callback();
  await flush();
  assert.equal(calls, 1);
  await f.clock.tick(1999);
  assert.equal(calls, 1);
  await f.clock.tick(1);
  assert.equal(calls, 2);
});

test('the native clock runs a registered check and disposal aborts its registration', async () => {
  const service = new FileWatchAssistance({
    failed: (error) => {
      throw error;
    },
  });
  let signal;
  try {
    await new Promise((resolve, reject) => {
      const guard = setTimeout(() => reject(Error('Native assistance did not run.')), 10000);
      service.register('one', async (context) => {
        signal = context.signal;
        clearTimeout(guard);
        service.dispose();
        resolve();
      });
      service.configure({ enabled: true, intervalSeconds: 2 });
      service.start();
    });
    assert.equal(signal.aborted, true);
  } finally {
    service.dispose();
  }
});

test('native assistance timers do not prevent an otherwise idle process from exiting', () => {
  const modulePath = require.resolve('../out/main/main/core/file-watch-assistance');
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const { FileWatchAssistance } = require(process.argv[1]);
    const service = new FileWatchAssistance({ failed() {} });
    service.register('one', async () => {});
    service.configure({ enabled: true, intervalSeconds: 300 });
    service.start();
    console.log('ready');
  `,
      modulePath,
    ],
    { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000, windowsHide: true },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'ready');
});
