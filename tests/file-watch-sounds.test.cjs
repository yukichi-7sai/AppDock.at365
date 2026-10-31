const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const native = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { RegisteredSounds } = require('../out/main/main/core/registered-sounds');
const { WebAccountController } = require('../out/main/main/core/web-accounts');
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert(Date.now() < deadline, 'sound watch did not settle');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
async function fixture(t, { fake = true, unavailable = false } = {}) {
  const directory = await fs.mkdtemp(path.resolve('.artifacts/file-watch-sounds-'));
  const files = [],
    failures = [],
    jobs = new Map();
  let event,
    watcher,
    attempts = 0,
    releases = 0;
  if (fake)
    t.mock.method(native, 'watch', (_directory, callback) => {
      attempts++;
      if (unavailable) throw Error('Unavailable watch');
      event = callback;
      watcher = Object.assign(new EventEmitter(), { close() {} });
      return watcher;
    });
  t.mock.method(global, 'setInterval', () => {
    throw Error('Independent polling');
  });
  const sounds = new RegisteredSounds(directory);
  const observer = sounds.watch(
    (value) => files.push(value),
    () => failures.push('failed'),
    {
      register(id, check) {
        assert(!jobs.has(id));
        jobs.set(id, check);
        return () => {
          jobs.delete(id);
          releases++;
        };
      },
    },
  );
  t.after(() => observer.close());
  return {
    directory,
    sounds,
    observer,
    files,
    failures,
    jobs,
    event: (name) => event('rename', name),
    fail: () => watcher.emit('error', Error('Interrupted watch')),
    attempts: () => attempts,
    releases: () => releases,
  };
}

test('sound startup and native arrival/removal work without periodic assistance or audio reads', async (t) => {
  const f = await fixture(t, { fake: false });
  await fs.writeFile(path.join(f.directory, 'first.WAV'), 'not decoded by indexing');
  await f.observer.check();
  assert.deepEqual(f.files.at(-1), ['first.WAV']);
  await fs.writeFile(path.join(f.directory, 'arrived.wav'), 'not decoded by indexing');
  await until(() => f.files.at(-1).includes('arrived.wav'));
  await fs.unlink(path.join(f.directory, 'first.WAV'));
  await until(() => !f.files.at(-1).includes('first.WAV'));
  await assert.rejects(f.sounds.resolve('arrived.wav'));
  assert.equal(f.jobs.size, 1);
});

test('OFF has no repeated scans; the shared check discovers a missed filename and awaits real enumeration', async (t) => {
  const f = await fixture(t);
  await f.observer.check();
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let enumerations = 0,
    release;
  const readdir = fs.readdir;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  t.mock.method(fs, 'readdir', async (...args) => {
    enumerations++;
    await gate;
    return readdir(...args);
  });
  t.mock.timers.tick(600000);
  await new Promise(setImmediate);
  assert.equal(enumerations, 0);
  await fs.writeFile(path.join(f.directory, 'missed.wav'), 'filename only');
  let completed = false;
  const checking = [...f.jobs.values()][0]({ signal: new AbortController().signal }).then(() => {
    completed = true;
  });
  while (!enumerations) await new Promise(setImmediate);
  assert.equal(completed, false);
  release();
  await checking;
  assert.deepEqual(f.files.at(-1), ['missed.wav']);
});

test('a native event after enumeration is retained without overlapping sound scans', async (t) => {
  const f = await fixture(t);
  await f.observer.check();
  const readdir = fs.readdir;
  let release,
    blocked = false,
    active = 0,
    maximum = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  t.mock.method(fs, 'readdir', async (...args) => {
    active++;
    maximum = Math.max(maximum, active);
    try {
      const entries = await readdir(...args);
      if (!blocked) {
        blocked = true;
        await gate;
      }
      return entries;
    } finally {
      active--;
    }
  });
  const checking = f.observer.check();
  await until(() => blocked);
  await fs.writeFile(path.join(f.directory, 'late.wav'), 'filename only');
  f.event('late.wav');
  release();
  await checking;
  await until(() => f.files.at(-1).includes('late.wav'));
  assert.equal(maximum, 1);
});

test('watch errors do not auto-enable polling or a short retry loop, and explicit checking reconnects', async (t) => {
  const f = await fixture(t);
  await f.observer.check();
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  f.fail();
  assert.deepEqual(f.failures, ['failed']);
  t.mock.timers.tick(600000);
  await new Promise(setImmediate);
  assert.equal(f.attempts(), 1);
  await f.observer.check();
  assert.equal(f.attempts(), 2);
});

test('unavailable watching preserves initial and assisted listing; closing releases one registration', async (t) => {
  const f = await fixture(t, { unavailable: true });
  await f.observer.check();
  assert.deepEqual(f.files.at(-1), []);
  await fs.writeFile(path.join(f.directory, 'received.wav'), 'filename only');
  await [...f.jobs.values()][0]({ signal: new AbortController().signal });
  assert.deepEqual(f.files.at(-1), ['received.wav']);
  assert.deepEqual(f.failures, ['failed']);
  f.observer.close();
  f.observer.close();
  assert.equal(f.jobs.size, 0);
  assert.equal(f.releases(), 1);
});

test('closing while enumeration is pending rejects late publication and does not remove sound files', async (t) => {
  const f = await fixture(t);
  await f.observer.check();
  const readdir = fs.readdir;
  let release,
    blocked = false;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  t.mock.method(fs, 'readdir', async (...args) => {
    blocked = true;
    await gate;
    return readdir(...args);
  });
  await fs.writeFile(path.join(f.directory, 'preserved.wav'), 'preserved');
  const checking = f.observer.check();
  await until(() => blocked);
  const published = f.files.length;
  f.observer.close();
  release();
  await checking;
  assert.equal(f.files.length, published);
  assert.equal(await fs.readFile(path.join(f.directory, 'preserved.wav'), 'utf8'), 'preserved');
});

test('repeated Web account reads initialize sounds once and retain a single assistance registration', async () => {
  let scans = 0,
    watches = 0;
  const fake = {
    initializing: Promise.resolve(),
    disposed: false,
    services: { assistance: {} },
    state: { accounts: [] },
    sounds: {
      watch(_accept, _failed, assistance) {
        assert.equal(assistance, fake.services.assistance);
        watches++;
        return {
          async check() {
            scans++;
          },
          close() {},
        };
      },
    },
  };
  await Promise.all([
    WebAccountController.prototype.start.call(fake),
    WebAccountController.prototype.start.call(fake),
  ]);
  await WebAccountController.prototype.start.call(fake);
  assert.equal(watches, 1);
  assert.equal(scans, 1);
});
