const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const childProcess = require('node:child_process');
const { SettingsStore } = require('../out/main/main/core/settings');
const { ExtensionManager } = require('../out/main/main/core/extensions');
const { JsonLinePeer } = require('../out/main/main/core/rpc');

function fixture(t, delay = 0) {
  const root = path.resolve('.artifacts/applet-startup-unit');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const folder = path.join(dir, 'extensions/fixture');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'index.cjs'), '');
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: 'test.timing',
      name: 'Timing',
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.cjs',
      startupDelaySeconds: delay,
    }),
  );
  const settings = new SettingsStore(path.join(dir, 'settings.json'));
  settings.load();
  const children = [];
  const f = { clock: 0, activate: async () => ({ commands: [] }) };
  t.mock.method(performance, 'now', () => f.clock);
  t.mock.method(childProcess, 'spawn', () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stdin: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null,
      signalCode: null,
      kill() {
        this.exitCode = 0;
        queueMicrotask(() => this.emit('exit', 0, null));
        return true;
      },
    });
    child.remote = new JsonLinePeer(child.stdin, child.stdout, (method) =>
      method === 'activate' ? f.activate(child) : null,
    );
    children.push(child);
    return child;
  });
  const manager = new ExtensionManager({
    roots: [path.dirname(folder)],
    settings,
    nodeExecutable: process.execPath,
    nodeWorker: 'unused',
    api: async () => null,
    log: () => {},
  });
  t.after(async () => {
    await manager.shutdown();
    settings.close();
    for (const child of children) {
      child.remote.close();
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  manager.discover();
  return Object.assign(f, {
    manager,
    settings,
    item: manager.items.get('test.timing'),
    snapshot: () => manager.snapshot()[0],
  });
}

function expectedTiming(durationMs, outcome, validated = outcome === 'success') {
  return {
    durationMs,
    outcome,
    phases: [
      { phase: 'prepare', durationMs: 0 },
      { phase: 'process', durationMs: 0 },
      { phase: 'activate', durationMs },
      ...(validated ? [{ phase: 'validate', durationMs: 0 }] : []),
    ],
  };
}

test('phase boundaries account for host preparation, launch request, response wait and validation', async (t) => {
  const f = fixture(t);
  f.manager.on('changed', () => {
    if (f.item.state === 'starting' && f.item.startupMeasurement?.phase === 'prepare')
      f.clock += 15;
  });
  const spawn = childProcess.spawn;
  t.mock.method(childProcess, 'spawn', (...args) => {
    f.clock += 20;
    return spawn(...args);
  });
  f.activate = async () => {
    f.clock += 50;
    return { commands: [] };
  };
  Object.defineProperty(f.item.manifest, 'settings', {
    configurable: true,
    get() {
      f.clock += 5;
      return [];
    },
  });
  await f.manager.reconcile();
  const timing = f.snapshot().startupTiming;
  assert.deepEqual(timing, {
    durationMs: 90,
    outcome: 'success',
    phases: [
      { phase: 'prepare', durationMs: 15 },
      { phase: 'process', durationMs: 20 },
      { phase: 'activate', durationMs: 50 },
      { phase: 'validate', durationMs: 5 },
    ],
  });
  assert.equal(
    timing.phases.reduce((sum, phase) => sum + phase.durationMs, 0),
    timing.durationMs,
  );
  timing.phases[0].durationMs = 999;
  assert.equal(f.snapshot().startupTiming.phases[0].durationMs, 15);
});

test('delay and stopped time are excluded; restart replaces the memory-only measurement', async (t) => {
  const f = fixture(t, 60);
  const settingsBefore = fs.readFileSync(f.settings.file, 'utf8');
  await f.manager.reconcile();
  assert.equal(f.snapshot().state, 'waiting');
  assert.equal(f.snapshot().startupTiming, undefined);
  f.clock = 60000;
  f.activate = async () => {
    assert.equal(f.snapshot().state, 'starting');
    assert.equal(f.snapshot().startupTiming, undefined);
    f.clock += 325;
    return { commands: [] };
  };
  await f.manager.restart('test.timing', true);
  assert.deepEqual(f.snapshot().startupTiming, expectedTiming(325, 'success'));
  const copy = f.snapshot().startupTiming;
  copy.durationMs = 99;
  assert.equal(f.snapshot().startupTiming.durationMs, 325);
  f.clock += 10000;
  await f.manager.stop(f.item);
  assert.equal(f.snapshot().startupTiming.durationMs, 325);
  f.clock += 10000;
  f.activate = async () => {
    f.clock += 80;
    return { commands: [] };
  };
  await f.manager.restart('test.timing', true);
  assert.deepEqual(f.snapshot().startupTiming, expectedTiming(80, 'success'));
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), settingsBefore);
});

test('failed activation has its own duration; retry and a later runtime crash preserve the correct attempt', async (t) => {
  const f = fixture(t);
  f.activate = async () => {
    f.clock += 1200;
    throw Error('fixture activation failed');
  };
  await f.manager.reconcile();
  assert.equal(f.snapshot().state, 'error');
  assert.deepEqual(f.snapshot().startupTiming, expectedTiming(1200, 'error'));
  f.activate = async () => {
    assert.equal(f.snapshot().startupTiming, undefined);
    f.clock += 50;
    return { commands: [] };
  };
  await f.manager.restart('test.timing', true);
  f.clock += 50000;
  f.item.child.emit('error', Error('later runtime failure'));
  assert.equal(f.snapshot().state, 'error');
  assert.deepEqual(f.snapshot().startupTiming, expectedTiming(50, 'success'));
});

test('process failure finishes measurement before the activation RPC settles', async (t) => {
  const f = fixture(t);
  let release, activating;
  const ready = new Promise((resolve) => (activating = resolve));
  f.activate = () => {
    activating();
    return new Promise((resolve) => (release = resolve));
  };
  const pending = f.manager.reconcile();
  await ready;
  f.clock = 25;
  f.item.child.emit('error', Error('process failure'));
  assert.deepEqual(f.snapshot().startupTiming, expectedTiming(25, 'error'));
  f.clock = 9000;
  release({ commands: [] });
  await pending;
  assert.deepEqual(f.snapshot().startupTiming, expectedTiming(25, 'error'));
});

test('activation registration must validate before a startup is successful', async (t) => {
  const f = fixture(t);
  f.activate = async () => {
    f.clock += 10;
    return { commands: [{ id: 'another.applet.command', title: 'Invalid' }] };
  };
  await f.manager.reconcile();
  assert.equal(f.snapshot().state, 'error');
  assert.deepEqual(f.snapshot().startupTiming, expectedTiming(10, 'error', true));
});

test('startup gate covers reconciliation, direct restart, delayed scheduling and command activation', async (t) => {
  const f = fixture(t, 60);
  let released = false;
  f.manager.startAllowed = () => released;
  f.item.manifest.commands = [{ id: 'test.timing.run', title: 'Run', activateOnExecute: true }];
  assert.equal(f.manager.canActivateForCommand(f.item, 'test.timing.run'), false);
  await f.manager.reconcile();
  await f.manager.restart('test.timing', true);
  assert.equal(f.snapshot().state, 'stopped');
  assert.equal(f.item.startTimer, undefined);
  assert.equal(f.item.child, null);
  assert.equal(f.snapshot().startupTiming, undefined);
  f.clock = 5000;
  released = true;
  assert.equal(f.manager.canActivateForCommand(f.item, 'test.timing.run'), true);
  f.activate = async () => {
    f.clock += 40;
    return { commands: [] };
  };
  await f.manager.restart('test.timing', true);
  assert.deepEqual(f.snapshot().startupTiming, expectedTiming(40, 'success'));
});

test('quitting during one activation prevents the next queued worker from starting', async (t) => {
  const f = fixture(t);
  const other = { ...f.item, manifest: { ...f.item.manifest, id: 'test.other' } };
  f.manager.items.set('test.other', other);
  let release, activating;
  const ready = new Promise((resolve) => (activating = resolve));
  f.activate = async () => {
    activating();
    await new Promise((resolve) => (release = resolve));
    return { commands: [] };
  };
  const starting = f.manager.reconcile();
  await ready;
  const stopping = f.manager.shutdown();
  release();
  await Promise.all([starting, stopping]);
  assert.equal(other.child, null);
  assert.equal(other.startupTiming, undefined);
  assert.equal(other.state, 'stopped');
});
