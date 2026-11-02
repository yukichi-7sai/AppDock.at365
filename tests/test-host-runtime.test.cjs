const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { TestHostRuntime } = require('../scripts/test-host-runtime.cjs');
const { copyHost } = require('../scripts/copy-host.cjs');
const artifacts = path.resolve(__dirname, '../.artifacts');

function fixture(t, processes = () => []) {
  const root = fs.mkdtempSync(path.join(artifacts, 'test-host-runtime-unit-'));
  const source = path.join(root, 'source');
  fs.mkdirSync(path.join(source, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(source, 'AppDock.at365.exe'), 'exe-version-1');
  fs.writeFileSync(path.join(source, 'resources/app.asar'), 'app-version-1');
  fs.writeFileSync(
    path.join(source, 'appdock-host.json'),
    JSON.stringify({ entries: ['AppDock.at365.exe', 'appdock-host.json', 'resources'] }),
  );
  const runtime = new TestHostRuntime(root, processes);
  t.after(() => {
    runtime.close();
    assert.equal(path.dirname(root), artifacts);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, source, runtime, exe: path.join(source, 'AppDock.at365.exe') };
}

test('two profiles use one executable and keep settings, data and immutable copy evidence apart', (t) => {
  const { root, source, runtime, exe } = fixture(t);
  const a = path.join(root, 'run-a');
  const b = path.join(root, 'run-b');
  fs.mkdirSync(path.join(a, 'data'), { recursive: true });
  fs.writeFileSync(path.join(a, 'data/settings.json'), 'saved-settings');
  const first = runtime.executable(a);
  runtime.copy(exe, copyHost);
  const evidence = fs.readFileSync(path.join(a, 'test-runtime.json'), 'utf8');
  assert.equal(runtime.executable(a), first);
  assert.equal(runtime.executable(b), first);
  fs.writeFileSync(path.join(source, 'resources/app.asar'), 'app-version-2');
  runtime.copy(exe, copyHost);
  assert.equal(fs.readFileSync(path.join(a, 'data/settings.json'), 'utf8'), 'saved-settings');
  assert.equal(fs.readFileSync(path.join(a, 'test-runtime.json'), 'utf8'), evidence);
  assert.notEqual(fs.readFileSync(path.join(b, 'test-runtime.json'), 'utf8'), evidence);
  for (const profile of [a, b]) {
    assert.equal(fs.existsSync(path.join(profile, 'AppDock.at365.exe')), false);
    assert.equal(fs.existsSync(path.join(profile, 'resources')), false);
    assert.equal(fs.existsSync(path.join(profile, 'appdock-host.json')), true);
  }
  assert.equal(
    fs.readFileSync(path.join(runtime.host, 'resources/app.asar'), 'utf8'),
    'app-version-2',
  );
});

test('unchanged complete distribution is reused, while damaged or missing resources are repaired', (t) => {
  const { root, runtime, exe } = fixture(t);
  runtime.executable(path.join(root, 'run'));
  let copies = 0;
  const copy = (...args) => {
    copies++;
    copyHost(...args);
  };
  runtime.copy(exe, copy);
  runtime.copy(exe, copy);
  assert.equal(copies, 1);
  const asar = path.join(runtime.host, 'resources/app.asar');
  fs.writeFileSync(asar, 'damaged');
  runtime.copy(exe, copy);
  assert.equal(copies, 2);
  fs.unlinkSync(asar);
  runtime.copy(exe, copy);
  assert.equal(copies, 3);
  assert.equal(fs.readFileSync(asar, 'utf8'), 'app-version-1');
});

test('another runner cannot replace the leased executable and can proceed after release', (t) => {
  const { root, runtime, exe } = fixture(t);
  runtime.copy(exe, copyHost);
  const second = new TestHostRuntime(root, () => []);
  t.after(() => second.close());
  assert.throws(() => second.copy(exe, copyHost), /owned by PID/);
  runtime.close();
  second.copy(exe, copyHost);
  assert.equal(second.path, runtime.path);
});

test('an orphaned AppDock process prevents refresh even without a live runner lease', (t) => {
  let running = [];
  const { source, runtime, exe } = fixture(t, () => running);
  runtime.copy(exe, copyHost);
  const previous = fs.readFileSync(runtime.path);
  running = [4321];
  fs.writeFileSync(exe, 'exe-version-2');
  assert.throws(() => runtime.copy(exe, copyHost), /still running/);
  assert.deepEqual(fs.readFileSync(runtime.path), previous);
  runtime.close();
  assert.throws(() => runtime.copy(exe, copyHost), /still running/);
  assert.equal(fs.existsSync(runtime.lock), false);
  assert.equal(fs.readFileSync(path.join(source, 'resources/app.asar'), 'utf8'), 'app-version-1');
});

test('a terminated runner lease is recovered only after checking its runtime processes', (t) => {
  const { runtime, exe } = fixture(t);
  const child = spawnSync(process.execPath, ['-e', ''], { windowsHide: true });
  assert.equal(child.status, 0);
  fs.mkdirSync(runtime.directory, { recursive: true });
  fs.writeFileSync(runtime.lock, JSON.stringify({ pid: child.pid, token: 'terminated' }));
  runtime.copy(exe, copyHost);
  assert.equal(JSON.parse(fs.readFileSync(runtime.lock)).pid, process.pid);
});

test('a source manifest cannot erase profile data or traverse outside the shared host', (t) => {
  const { source, runtime, exe } = fixture(t);
  runtime.copy(exe, copyHost);
  const previous = fs.readFileSync(runtime.path);
  for (const entry of ['data', 'settings.json', '.', '..', '.. ', '../outside', 'C:outside']) {
    fs.writeFileSync(
      path.join(source, 'appdock-host.json'),
      JSON.stringify({ entries: ['AppDock.at365.exe', entry] }),
    );
    assert.throws(() => runtime.copy(exe, copyHost), /Unsafe host fixture manifest/);
    assert.deepEqual(fs.readFileSync(runtime.path), previous);
  }
});

test('unexpected runtime data is preserved and blocks both reuse and replacement', (t) => {
  const { runtime, exe } = fixture(t);
  runtime.copy(exe, copyHost);
  fs.mkdirSync(path.join(runtime.host, 'data'));
  fs.writeFileSync(path.join(runtime.host, 'data/keep.txt'), 'keep');
  assert.throws(() => runtime.copy(exe, copyHost), /Unexpected file/);
  assert.equal(fs.readFileSync(path.join(runtime.host, 'data/keep.txt'), 'utf8'), 'keep');
});

test('runtime junctions are rejected without following or removing their target', (t) => {
  const { root, runtime, exe } = fixture(t);
  const outside = path.join(root, 'protected');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  fs.mkdirSync(runtime.directory);
  fs.symlinkSync(outside, runtime.host, 'junction');
  assert.throws(() => runtime.copy(exe, copyHost), /reparse point/);
  assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
});

test('profiles cannot store settings in or outside the managed runtime area', (t) => {
  const { root, runtime } = fixture(t);
  for (const profile of [
    root,
    runtime.directory,
    runtime.host,
    path.join(runtime.host, 'nested'),
    path.dirname(root),
  ])
    assert.throws(() => runtime.executable(profile), /Test profile must be separate/);
});

test('partial copy failures fail verification and the next preparation repairs the runtime', (t) => {
  const { runtime, exe } = fixture(t);
  assert.throws(
    () =>
      runtime.copy(exe, (source, destination) => {
        copyHost(source, destination);
        fs.writeFileSync(destination, 'incomplete');
      }),
    /copy hash mismatch/,
  );
  runtime.copy(exe, copyHost);
  assert.equal(fs.readFileSync(runtime.path, 'utf8'), 'exe-version-1');
});
