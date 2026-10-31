const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const nativeFs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { RegisteredImages } = require('../out/main/main/core/registered-images');
const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
async function until(predicate) {
  const end = Date.now() + 5000;
  while (!predicate()) {
    assert(Date.now() < end, 'image watcher did not reconcile');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function fixture(t, { missing = false, assistance } = {}) {
  const base = await fs.mkdtemp(path.resolve('.artifacts/file-watch-images-'));
  const directory = path.join(base, 'images');
  if (!missing) await fs.mkdir(directory);
  let decodes = 0;
  const images = new RegisteredImages(
    directory,
    () => {
      decodes++;
      throw Error('Unexpected decode');
    },
    () => {},
    assistance,
  );
  t.after(() => images.stop());
  return { images, directory, decodes: () => decodes };
}
function fakeWatch(t) {
  const callbacks = new Map();
  const watchers = new Map();
  t.mock.method(nativeFs, 'watch', (directory, callback) => {
    callbacks.set(directory, callback);
    const watcher = Object.assign(new EventEmitter(), { close() {} });
    watchers.set(directory, watcher);
    return watcher;
  });
  const event = (directory, name) => callbacks.get(directory)('rename', name);
  event.fail = (directory) => watchers.get(directory).emit('error', Error('watch interrupted'));
  return event;
}

test('a late ancestor recovery cannot replace a newer connection to the image root', async (t) => {
  const event = fakeWatch(t);
  const f = await fixture(t);
  await fs.writeFile(path.join(f.directory, 'one.png'), bytes);
  await f.images.watch();
  let release,
    blocked = false;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const realpath = fs.realpath;
  t.mock.method(fs, 'realpath', async (directory, ...args) => {
    if (directory === path.dirname(f.directory)) {
      blocked = true;
      await gate;
      throw Object.assign(Error('Obsolete watch failure'), { code: 'EACCES' });
    }
    return realpath(directory, ...args);
  });
  event.fail(f.directory);
  await until(() => blocked);
  await f.images.refresh();
  release();
  await new Promise(setImmediate);
  const previous = f.images.entry({ file: 'one.png' }).generation;
  await fs.writeFile(path.join(f.directory, 'one.png'), Buffer.concat([bytes, Buffer.from([2])]));
  event(f.directory, 'one.png');
  await until(() => f.images.entry({ file: 'one.png' }).generation !== previous);
  assert.equal(f.images.error, undefined);
});

test('native watching discovers an initially absent image root while assistance is off', async (t) => {
  const f = await fixture(t, { missing: true });
  await f.images.watch();
  await fs.mkdir(f.directory);
  await fs.writeFile(path.join(f.directory, 'arrived.png'), bytes);
  await until(() => f.images.entry({ file: 'arrived.png' })?.available);
  assert.equal(f.decodes(), 0);
});

test('image startup registers one shared check and no independent interval; stopping releases it', async (t) => {
  fakeWatch(t);
  t.mock.method(global, 'setInterval', () => {
    throw Error('Independent image polling');
  });
  const checks = [];
  let released = 0;
  const f = await fixture(t, {
    assistance: {
      register(id, check) {
        checks.push({ id, check });
        return () => released++;
      },
    },
  });
  await fs.writeFile(path.join(f.directory, 'one.png'), bytes);
  await f.images.watch();
  assert.equal(checks.length, 1);
  assert.equal(f.images.list().length, 1);
  await fs.writeFile(path.join(f.directory, 'two.png'), bytes);
  await checks[0].check();
  assert.equal(f.images.list().length, 2);
  assert.equal(f.decodes(), 0);
  f.images.stop();
  assert.equal(released, 1);
});

test('a named image event checks only that file and preserves other indexed images', async (t) => {
  const event = fakeWatch(t);
  const f = await fixture(t);
  await fs.writeFile(path.join(f.directory, 'one.png'), bytes);
  await fs.writeFile(path.join(f.directory, 'two.png'), bytes);
  await f.images.watch();
  const previous = f.images.entry({ file: 'one.png' }).generation;
  const lstat = fs.lstat,
    readdir = fs.readdir;
  let otherReads = 0,
    enumerations = 0;
  t.mock.method(fs, 'lstat', async (file, ...args) => {
    if (file === path.join(f.directory, 'two.png')) otherReads++;
    return lstat(file, ...args);
  });
  t.mock.method(fs, 'readdir', async (directory, ...args) => {
    if (directory === f.directory) enumerations++;
    return readdir(directory, ...args);
  });
  await fs.writeFile(path.join(f.directory, 'one.png'), Buffer.concat([bytes, Buffer.from([2])]));
  event(f.directory, 'one.png');
  await until(() => f.images.entry({ file: 'one.png' }).generation !== previous);
  assert.equal(otherReads, 0);
  assert.equal(enumerations, 0);
  assert.equal(f.images.entry({ file: 'two.png' }).available, true);
  await fs.unlink(path.join(f.directory, 'one.png'));
  event(f.directory, 'one.png');
  await until(() => f.images.entry({ file: 'one.png' }).state === 'missing');
});

test('an event arriving after directory enumeration is reconciled after the current scan', async (t) => {
  const event = fakeWatch(t);
  const f = await fixture(t);
  await f.images.watch();
  const readdir = fs.readdir;
  let release,
    blocked = false;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  t.mock.method(fs, 'readdir', async (directory, ...args) => {
    const entries = await readdir(directory, ...args);
    if (directory === f.directory && !blocked) {
      blocked = true;
      await gate;
    }
    return entries;
  });
  const scan = f.images.refresh();
  await until(() => blocked);
  await fs.writeFile(path.join(f.directory, 'late.png'), bytes);
  event(f.directory, 'late.png');
  release();
  await scan;
  await until(() => f.images.entry({ file: 'late.png' })?.available);
  assert.equal(f.decodes(), 0);
});
