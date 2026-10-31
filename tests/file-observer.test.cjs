const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { observeFile } = require('../out/main/main/core/file-observer');
const fileReader = require('../out/main/main/core/file-reader');
const { FileWatchAssistance } = require('../out/main/main/core/file-watch-assistance');

function fixture(t, { watchUnavailable = false } = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 1000000 });
  t.mock.method(performance, 'now', () => Date.now());
  const f = {
    text: '{"value":1}',
    stat: { dev: 1n, ino: 2n, mode: 3n, size: 11n, mtimeNs: 4n, ctimeNs: 5n, birthtimeNs: 6n },
    reads: 0,
    stats: 0,
    watchAttempts: 0,
    active: 0,
    maximumActive: 0,
    accepted: [],
    errors: [],
    watcher: Object.assign(new EventEmitter(), { close() {} }),
  };
  f.assistance = new FileWatchAssistance({
    failed: (error) => f.errors.push(error.message),
    clock: {
      now: () => BigInt(Date.now()) * 1_000_000n,
      schedule(callback, delay) {
        const timer = setTimeout(callback, delay);
        return { cancel: () => clearTimeout(timer) };
      },
    },
  });
  f.enable = () => {
    f.assistance.configure({ enabled: true, intervalSeconds: 2 });
    f.assistance.start();
  };
  t.mock.method(fs, 'watch', (_folder, listener) => {
    f.watchAttempts++;
    if (watchUnavailable) throw Error('watch unavailable');
    f.event = listener;
    return f.watcher;
  });
  t.mock.method(fs.promises, 'stat', async () => {
    f.stats++;
    if (f.error) throw f.error;
    return { ...f.stat, isFile: () => true };
  });
  t.mock.method(fileReader, 'readObservedFile', async () => {
    f.reads++;
    f.active++;
    f.maximumActive = Math.max(f.maximumActive, f.active);
    try {
      return f.read ? await f.read() : f.text;
    } finally {
      f.active--;
    }
  });
  t.mock.method(fs, 'readFileSync', () => {
    throw Error('Synchronous observer read');
  });
  t.mock.method(fs, 'statSync', () => {
    throw Error('Synchronous observer stat');
  });
  f.observer = observeFile(
    'settings.json',
    (text) => {
      JSON.parse(text);
      f.accepted.push(text);
      f.onAccept?.(text);
    },
    (error) => f.errors.push(error.message),
    f.assistance,
  );
  f.tick = async (ms) => {
    t.mock.timers.tick(ms);
    await new Promise(setImmediate);
  };
  f.start = async () => {
    await f.tick(100);
    await f.tick(180);
  };
  f.check = async () => {
    const pending = f.observer.check();
    await f.tick(0);
    await f.tick(180);
    await pending;
  };
  t.after(() => {
    f.observer.close();
    f.assistance.dispose();
  });
  return f;
}

test('disabled assistance performs no periodic metadata or content reads after initial reception', async (t) => {
  const f = fixture(t);
  await f.start();
  assert.deepEqual(f.accepted, [f.text]);
  assert.equal(f.reads, 2);
  const stats = f.stats;
  await f.tick(600000);
  assert.equal(f.stats, stats);
  assert.equal(f.reads, 2);
  assert.equal(f.accepted.length, 1);
});

test('watch events read same-size same-metadata edits and wait for stable bytes', async (t) => {
  const f = fixture(t);
  await f.start();
  f.text = '{"value":2}';
  f.event('change', 'settings.json');
  await f.tick(100);
  assert.equal(f.accepted.length, 1);
  await f.tick(179);
  assert.equal(f.accepted.length, 1);
  await f.tick(1);
  assert.deepEqual(f.accepted, ['{"value":1}', f.text]);
});

test('unavailable native watching never automatically enables assistance or a retry loop', async (t) => {
  const f = fixture(t, { watchUnavailable: true });
  await f.start();
  assert.deepEqual(f.accepted, [f.text]);
  assert.deepEqual(f.errors, ['watch unavailable']);
  f.text = '{"value":2}';
  f.stat.ctimeNs++;
  await f.tick(60000);
  assert.equal(f.accepted.length, 1);
  assert.equal(f.reads, 2);
  f.enable();
  await f.tick(2000);
  await f.tick(180);
  assert.equal(f.accepted.at(-1), f.text);
  const reads = f.reads;
  await f.tick(2000);
  assert.equal(f.reads, reads + 1);
  assert.deepEqual(f.errors, ['watch unavailable']);
});

test('a runtime watcher error waits for explicit reconciliation instead of a short retry loop', async (t) => {
  const f = fixture(t);
  await f.start();
  f.watcher.emit('error', Error('watch interrupted'));
  assert.deepEqual(f.errors, ['watch interrupted']);
  const attempts = f.watchAttempts;
  const reads = f.reads;
  await f.tick(600000);
  assert.equal(f.watchAttempts, attempts);
  assert.equal(f.reads, reads);
  f.text = '{"value":2}';
  f.enable();
  await f.tick(2000);
  await f.tick(180);
  assert.equal(f.watchAttempts, attempts + 1);
  assert.equal(f.accepted.at(-1), f.text);
});

test('enabled shared assistance recovers missed events and replacement identity', async (t) => {
  const f = fixture(t);
  await f.start();
  f.enable();
  for (const key of ['ctimeNs', 'ino']) {
    f.text = key === 'ctimeNs' ? '{"value":2}' : '{"value":3}';
    f.stat[key]++;
    await f.tick(2000);
    await f.tick(180);
    assert.equal(f.accepted.at(-1), f.text);
  }
});

test('each enabled shared check reads content even when all metadata is preserved', async (t) => {
  const f = fixture(t);
  await f.start();
  f.enable();
  f.text = '{"value":2}';
  await f.tick(2000);
  assert.equal(f.accepted.length, 1);
  await f.tick(180);
  assert.equal(f.accepted.at(-1), f.text);
});

test('shared reconciliation waits for stable acceptance before another registered check starts', async (t) => {
  const f = fixture(t);
  await f.start();
  const later = [];
  f.assistance.register('later', async () => later.push(f.accepted.at(-1)));
  f.text = '{"value":2}';
  f.enable();
  await f.tick(2000);
  assert.deepEqual(later, []);
  await f.tick(179);
  assert.deepEqual(later, []);
  await f.tick(1);
  assert.deepEqual(later, [f.text]);
});

test('overlapping events serialize reads and discard an older in-flight result', async (t) => {
  const f = fixture(t);
  await f.start();
  let resolve;
  f.read = () =>
    new Promise((r) => {
      resolve = r;
    });
  f.event('change', 'settings.json');
  await f.tick(100);
  f.text = '{"value":2}';
  f.event('change', 'settings.json');
  await f.tick(100);
  f.read = undefined;
  resolve('{"value":1}');
  await f.tick(0);
  await f.tick(180);
  assert.equal(f.maximumActive, 1);
  assert.equal(f.accepted.filter((text) => text === '{"value":1}').length, 1);
  assert.equal(f.accepted.at(-1), f.text);
});

test('missing and invalid files keep the previous value and can recover identical valid bytes', async (t) => {
  const f = fixture(t);
  await f.start();
  const original = f.text;
  f.error = Error('temporarily missing');
  await f.check();
  await f.check();
  assert.deepEqual(f.errors, ['temporarily missing']);
  assert.equal(f.accepted.length, 1);
  f.error = undefined;
  f.text = '{invalid';
  await f.check();
  await f.tick(180);
  assert.equal(f.accepted.length, 1);
  f.text = original;
  await f.check();
  await f.tick(180);
  assert.equal(f.accepted.length, 2);
  assert.equal(f.accepted.at(-1), original);
});

test('close ignores outstanding reads and oversize files are rejected', async (t) => {
  const f = fixture(t);
  await f.start();
  f.stat.size = BigInt(4 * 1024 * 1024 + 1);
  await f.check();
  assert.equal(f.errors.length, 1);
  assert.equal(f.reads, 2);
  f.stat.size = 11n;
  let resolve;
  f.read = () =>
    new Promise((r) => {
      resolve = r;
    });
  const pending = f.observer.check();
  await f.tick(0);
  f.observer.close();
  resolve('{"value":2}');
  await pending;
  assert.equal(f.accepted.length, 1);
  assert.equal(f.errors.length, 1);
});

test('acknowledged owner content is not reapplied and a later external revert is still delivered', async (t) => {
  const f = fixture(t);
  await f.start();
  const original = f.text;
  f.text = '{"value":2}';
  f.observer.invalidate(f.text);
  await f.tick(100);
  assert.deepEqual(f.accepted, [original]);
  f.text = original;
  f.event('change', 'settings.json');
  await f.tick(100);
  await f.tick(180);
  assert.deepEqual(f.accepted, [original, original]);
});

test('a save performed by an acceptance callback supersedes that callback result', async (t) => {
  const f = fixture(t);
  await f.start();
  f.onAccept = () => {
    f.onAccept = undefined;
    f.text = '{"value":3}';
    f.stat.ctimeNs++;
    f.observer.invalidate(f.text);
  };
  f.text = '{"value":2}';
  f.event('change', 'settings.json');
  await f.tick(100);
  await f.tick(180);
  assert.deepEqual(f.accepted, ['{"value":1}', '{"value":2}']);
  f.text = '{"value":2}';
  f.event('change', 'settings.json');
  await f.tick(100);
  await f.tick(180);
  assert.deepEqual(f.accepted, ['{"value":1}', '{"value":2}', '{"value":2}']);
});

test('a superseded read error cannot report a failure after an owner save', async (t) => {
  const f = fixture(t);
  await f.start();
  let reject;
  f.read = () =>
    new Promise((_resolve, fail) => {
      reject = fail;
    });
  f.event('change', 'settings.json');
  await f.tick(100);
  f.text = '{"value":2}';
  f.observer.invalidate(f.text);
  f.read = undefined;
  reject(Error('Obsolete file lock'));
  await f.tick(0);
  await f.tick(100);
  assert.deepEqual(f.errors, []);
  assert.deepEqual(f.accepted, ['{"value":1}']);
});
