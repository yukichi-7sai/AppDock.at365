const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  NativeDirectoryWatchService,
  useDirectoryWatchService,
} = require('../out/main/main/core/directory-watch');
const { observeFile } = require('../out/main/main/core/file-observer');
const { RegisteredAssets } = require('../out/main/main/core/registered-assets');
const { safeDirectoryAsync, sameDirectoryPath } = require('../out/main/main/core/library-files');
const executable = path.resolve('.artifacts/dotnet-host/file-watch/AppDock.FileWatchHost.exe');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check) {
  const deadline = Date.now() + 10000; // Test failure bound, not a product timeout.
  while (!(await check())) {
    assert(Date.now() < deadline, 'native watch did not settle');
    await delay(20);
  }
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.resolve('.artifacts/directory-watch-'));
  const errors = [];
  const service = new NativeDirectoryWatchService(executable, (error) => errors.push(error));
  useDirectoryWatchService(service);
  t.after(() => {
    service.close();
    useDirectoryWatchService(undefined);
  });
  return { root, service, errors };
}

test('native directory subscriptions receive create, nested rename and delete independently', async (t) => {
  const f = await fixture(t);
  const first = [],
    second = [];
  const a = f.service.watch(f.root, true, (kind, name) => first.push({ kind, name }));
  const b = f.service.watch(f.root, true, (kind, name) => second.push({ kind, name }));
  a.on('error', (error) => assert.fail(error));
  b.on('error', (error) => assert.fail(error));
  await Promise.all([a.ready, b.ready]);
  await fs.mkdir(path.join(f.root, 'nested'));
  await fs.writeFile(path.join(f.root, 'nested/one.txt'), 'one');
  await until(
    () =>
      first.some((e) => e.name === 'nested\\one.txt') &&
      second.some((e) => e.name === 'nested\\one.txt'),
  );
  a.close();
  const count = first.length;
  await fs.rename(path.join(f.root, 'nested/one.txt'), path.join(f.root, 'nested/two.txt'));
  await until(() => second.some((e) => e.name === 'nested\\two.txt'));
  second.length = 0;
  await fs.unlink(path.join(f.root, 'nested/two.txt'));
  await until(() => second.some((e) => e.kind === 'rename' && e.name === 'nested\\two.txt'));
  assert.equal(first.length, count);
  assert.deepEqual(f.errors, []);
  b.close();
});

test('settings observer connects through native ancestor watching with assistance disabled', async (t) => {
  const f = await fixture(t);
  const attempts = t.mock.method(f.service, 'watch');
  const accepted = [],
    errors = [];
  const file = path.join(f.root, 'late/deeper/settings.json');
  const observer = observeFile(
    file,
    (text) => accepted.push(text),
    (error) => errors.push(error),
  );
  t.after(() => observer.close());
  await until(() =>
    [...f.service.registrations.values()].some((e) => e.ready && e.directory === f.root),
  );
  const initialAttempts = attempts.mock.callCount();
  await delay(400); // Observe beyond the existing 100 ms reception debounce.
  assert.equal(
    attempts.mock.callCount(),
    initialAttempts,
    'missing parents must not cause retry polling',
  );
  await fs.mkdir(path.join(f.root, 'late'));
  await until(() =>
    [...f.service.registrations.values()].some(
      (e) => e.ready && e.directory === path.join(f.root, 'late'),
    ),
  );
  await fs.mkdir(path.dirname(file));
  await until(() =>
    [...f.service.registrations.values()].some(
      (e) => e.ready && e.directory === path.dirname(file),
    ),
  );
  await fs.writeFile(file, '{"value":1}');
  await until(() => accepted.includes('{"value":1}'));
  await fs.writeFile(file, '{"value":2}');
  await until(() => accepted.includes('{"value":2}'));
  assert.deepEqual(f.errors, []);
});

test('library remains writable after watcher loss and shared reconciliation reconnects it', async (t) => {
  const f = await fixture(t);
  const external = path.join(f.root, 'external');
  await fs.mkdir(external);
  await fs.writeFile(path.join(external, 'one.txt'), 'original');
  const checks = new Map();
  const assistance = {
    register(id, check) {
      checks.set(id, check);
      return () => checks.delete(id);
    },
  };
  const policy = {
    media: 'text',
    assignedDirectory: 'assigned-texts',
    maxBytes: Number.MAX_SAFE_INTEGER,
    format: () => 'txt',
    validate: async () => ({ width: 0, height: 0, thumbnail: '', circle: '' }),
  };
  const library = new RegisteredAssets(path.join(f.root, 'data'), policy, () => {}, assistance);
  t.after(() => library.stop());
  library.configureSources([{ id: 'unc', name: 'External', path: external, access: 'read-write' }]);
  await library.refreshRoots(['@external:unc']);
  assert.equal(library.sources[0].canWrite, true);
  const originalChild = f.service.child;
  originalChild.kill();
  await until(() => f.errors.length > 0);
  assert.equal(library.sources[0].available, true);
  assert.equal(library.sources[0].canWrite, true);
  assert.equal(
    (await library.read({ file: '@external:unc/one.txt' })).bytes.toString(),
    'original',
  );
  for (const check of checks.values()) await check({ signal: new AbortController().signal });
  assert.notEqual(f.service.child, originalChild);
  await fs.writeFile(path.join(external, 'arrived.txt'), 'arrival');
  await until(() => library.entry({ file: '@external:unc/arrived.txt' })?.available);
});

test('UNC root equivalence accepts trailing separators while rejecting redirection', async (t) => {
  assert(sameDirectoryPath('\\\\KAGUYA\\XX.TEMP', '\\\\kaguya\\xx.temp\\'));
  assert(!sameDirectoryPath('\\\\KAGUYA\\XX.TEMP', '\\\\KAGUYA\\elsewhere'));
  const root = '\\\\KAGUYA\\XX.TEMP\\';
  t.mock.method(fs, 'realpath', async () => '\\\\KAGUYA\\xx.temp');
  t.mock.method(fs, 'lstat', async () => ({
    isDirectory: () => true,
    isSymbolicLink: () => false,
  }));
  assert.equal(await safeDirectoryAsync(root, ''), root);
  t.mock.method(fs, 'lstat', async () => ({ isDirectory: () => true, isSymbolicLink: () => true }));
  await assert.rejects(safeDirectoryAsync(root, ''));
});

test('actual root loss becomes unavailable and explicit reconciliation restores the same registration', async (t) => {
  const f = await fixture(t);
  const external = path.join(f.root, 'external');
  const missing = path.join(f.root, 'disconnected');
  await fs.mkdir(external);
  const library = new RegisteredAssets(path.join(f.root, 'data'), {
    media: 'text',
    assignedDirectory: 'assigned-texts',
    maxBytes: Number.MAX_SAFE_INTEGER,
    format: () => 'txt',
    validate: async () => ({ width: 0, height: 0, thumbnail: '', circle: '' }),
  });
  t.after(() => library.stop());
  library.configureSources([
    { id: 'external', name: 'External', path: external, access: 'read-write' },
  ]);
  await library.refreshRoots(['@external:external']);
  assert(library.sources[0].available);
  await fs.rename(external, missing);
  f.service.child.kill();
  await until(() => library.sources[0].available === false);
  assert.equal(library.sources[0].id, 'external');
  assert.equal(library.sources[0].canWrite, false);
  await fs.rename(missing, external);
  await library.refreshRoots(['@external:external']);
  assert.equal(library.sources[0].available, true);
  assert.equal(library.sources[0].canWrite, true);
});

test('UNC root watch events are interpreted as root-relative, not parent-relative', async (t) => {
  const { EventEmitter } = require('node:events');
  const native = require('node:fs');
  const root = '\\\\KAGUYA\\XX.TEMP\\';
  let callback;
  t.mock.method(fs, 'realpath', async () => '\\\\KAGUYA\\xx.temp');
  t.mock.method(fs, 'lstat', async () => ({ isSymbolicLink: () => false }));
  t.mock.method(native, 'watch', (_directory, _options, listener) => {
    callback = listener;
    return Object.assign(new EventEmitter(), { close() {} });
  });
  const library = new RegisteredAssets(root, { media: 'text', external: true });
  const requests = [];
  library.watching = true;
  library.requestRefresh = (files) => requests.push(files);
  await library.connectWatch();
  callback('rename', 'arrived.txt');
  assert.deepEqual(requests, [['arrived.txt']]);
  library.stop();
});
