const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const childProcess = require('node:child_process');
const { SettingsStore } = require('../out/main/main/core/settings');
const { ExtensionManager } = require('../out/main/main/core/extensions');
const { JsonLinePeer } = require('../out/main/main/core/rpc');

test('late events from a process that exceeded the stop timeout do not affect its replacement', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-generation-'));
  const folder = path.join(dir, 'extensions', 'fixture');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'index.cjs'), '');
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: 'test.generation',
      name: 'Generation',
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.cjs',
    }),
  );
  const settings = new SettingsStore(path.join(dir, 'settings.json'));
  settings.load();
  const children = [];
  t.mock.method(childProcess, 'spawn', () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stdin: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null,
      signalCode: null,
      killCalls: 0,
      kill() {
        this.killCalls++;
        return true;
      },
    });
    child.remote = new JsonLinePeer(child.stdin, child.stdout, async (method) =>
      method === 'activate' ? { commands: [] } : null,
    );
    children.push(child);
    return child;
  });
  const timeout = global.setTimeout;
  t.mock.method(global, 'setTimeout', (callback, delay, ...args) =>
    timeout(callback, delay === 2000 ? 0 : delay, ...args),
  );
  const logs = [];
  const manager = new ExtensionManager({
    roots: [path.dirname(folder)],
    settings,
    nodeExecutable: process.execPath,
    nodeWorker: 'unused',
    api: async () => null,
    log: (...args) => logs.push(args),
  });
  t.after(async () => {
    await manager.shutdown();
    for (const child of children) {
      child.remote.close();
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  manager.discover();
  await manager.reconcile();
  const item = manager.items.get('test.generation');
  const oldChild = item.child;
  const oldSoundLifetime = item.soundLifetime;
  assert.equal(oldSoundLifetime.signal.aborted, false);
  await manager.restart(item.manifest.id, true);
  const newChild = item.child;
  const newPeer = item.peer;
  const generation = item.runtimeSession;
  assert.notEqual(newChild, oldChild);
  assert.equal(oldSoundLifetime.signal.aborted, true);
  assert.notEqual(item.soundLifetime, oldSoundLifetime);
  assert.equal(item.soundLifetime.signal.aborted, false);
  assert.equal(item.state, 'running');
  const logCount = logs.length;
  oldChild.emit('error', new Error('late process error'));
  oldChild.stderr.write('late process output');
  oldChild.emit('exit', 1, null);
  assert.equal(item.child, newChild);
  assert.equal(item.peer, newPeer);
  assert.equal(item.runtimeSession, generation);
  assert.equal(newPeer.closed, false);
  assert.equal(newChild.killCalls, 0);
  assert.equal(item.state, 'running');
  assert.equal(item.error, null);
  assert.equal(logs.length, logCount);
  newChild.emit('error', new Error('current process error'));
  assert.equal(item.state, 'error');
  assert.equal(item.error, 'current process error');
  assert.equal(item.soundLifetime.signal.aborted, true);
});
