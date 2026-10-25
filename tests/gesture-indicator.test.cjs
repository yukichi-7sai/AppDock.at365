const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readGestureIndicatorNotice } = require('../out/main/shared/gesture-indicator');
const { InputCaptureManager } = require('../out/main/main/core/gestures');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  { EventEmitter } = require('node:events');
const notice = () => ({
  visible: true,
  revision: 7,
  x: -1500,
  y: 400,
  process: 'sample.exe',
  directions: ['right', 'up'],
  captions: ['<button>そのまま</button>'],
  opacity: 0.45,
  style: 'pill',
  captionRows: 4,
});
test('indicator notices accept bounded presentation data and reject malformed input', () => {
  const input = notice(),
    parsed = readGestureIndicatorNotice(input);
  assert.deepEqual(parsed, input);
  input.captions[0] = 'changed';
  assert.equal(parsed.captions[0], '<button>そのまま</button>');
  assert.deepEqual(readGestureIndicatorNotice({ visible: false, revision: 7, secret: 'omitted' }), {
    visible: false,
    revision: 7,
  });
  for (const changes of [
    { visible: 'true' },
    { revision: -1 },
    { revision: 1.5 },
    { x: Infinity },
    { y: NaN },
    { x: 2147483648 },
    { directions: [] },
    { directions: ['up', 'down', 'left'] },
    { directions: ['diagonal'] },
    { captions: [] },
    { captions: Array(5).fill('a') },
    { captions: ['a'.repeat(8193)] },
    { process: 'a'.repeat(261) },
    { opacity: 0 },
    { opacity: 2 },
    { style: 'unknown' },
    { captionRows: 5 },
    { captionRows: -1 },
  ])
    assert.equal(
      readGestureIndicatorNotice({ ...notice(), ...changes }),
      undefined,
      JSON.stringify(changes),
    );
});
test('web indicator ignores stale revisions and hides when paused or recording', async () => {
  const state = { recording: false },
    shown = [],
    hidden = [];
  const manager = new InputCaptureManager(
    'unused',
    () => state,
    {},
    async () => {},
    () => {},
    () => {},
    {},
  );
  manager.revision = 7;
  manager.indicator = {
    show: (m) => shown.push(m),
    hide: () => hidden.push(true),
  };
  await manager.event('gestures.indicator', notice());
  assert.equal(shown.length, 1);
  await manager.event('gestures.indicator', { ...notice(), revision: 6 });
  assert.equal(shown.length, 1);
  await manager.event('gestures.indicator', { ...notice(), captions: [3] });
  assert.equal(shown.length, 1);
  manager.paused = true;
  await manager.event('gestures.indicator', notice());
  assert.equal(hidden.length, 1);
  manager.paused = false;
  state.recording = true;
  await manager.event('gestures.indicator', notice());
  assert.equal(hidden.length, 2);
  state.recording = false;
  await manager.event('gestures.indicator', { visible: false, revision: 7 });
  assert.equal(hidden.length, 3);
  manager.stopped = true;
  await manager.event('gestures.indicator', notice());
  assert.equal(shown.length, 1);
});
test('display lifetime does not reconfigure or cancel input capture', async () => {
  const settings = createDefaultSettings();
  settings.gestures.bindings = [
    {
      id: 'a',
      command: 'sample.run',
      gesture: 'move-right',
      enabled: true,
      when: { scope: 'global', appletIds: [], processes: [] },
    },
  ];
  const payloads = [],
    hidden = [];
  const manager = new InputCaptureManager(
    'unused',
    () => ({
      settings,
      context: { appFocused: true, window: '123' },
      commands: [{ id: 'sample.run', title: 'Run' }],
      recording: false,
    }),
    {},
    async () => {},
    () => {},
    () => {},
    { ownership: async () => {}, applied: () => {} },
  );
  manager.peer = {
    closed: false,
    request: async (_method, payload) => {
      payloads.push(payload);
      return [];
    },
    close() {
      this.closed = true;
    },
  };
  const indicator = { show: () => {}, hide: () => hidden.push(true) };
  manager.indicator = indicator;
  await manager.sync();
  manager.indicator = undefined;
  await manager.sync();
  manager.indicator = indicator;
  await manager.sync();
  assert.equal(payloads.length, 1);
  for (const key of ['indicatorUseWeb', 'indicatorAccent', 'indicatorDark'])
    assert.equal(key in payloads[0].gestures, false);
  assert.equal(hidden.length, 1);
  await manager.close();
  assert.equal(hidden.length, 2);
});
test('failed or stalled display initialization reports once without blocking host startup', async () => {
  for (const mode of ['failed', 'stalled']) {
    let instance;
    const failures = [],
      handlers = new Map();
    class FakeWindow extends EventEmitter {
      constructor() {
        super();
        instance = this;
        this.destroyed = false;
        this.webContents = new EventEmitter();
        Object.assign(this.webContents, {
          setZoomMode() {},
          setZoomFactor() {},
          setWindowOpenHandler() {},
          session: { setPermissionRequestHandler() {} },
          getURL: () => 'file:///indicator.html',
        });
      }
      setIgnoreMouseEvents() {}
      loadURL() {
        return mode === 'failed'
          ? Promise.reject(Error('fixture load failed'))
          : new Promise(() => {});
      }
      isDestroyed() {
        return this.destroyed;
      }
      destroy() {
        this.destroyed = true;
        this.emit('closed');
      }
    }
    const exports = {};
    vm.runInNewContext(
      fs.readFileSync(path.resolve('out/main/main/core/gesture-indicator-host.js'), 'utf8'),
      {
        exports,
        require: (name) =>
          name === 'electron'
            ? {
                BrowserWindow: FakeWindow,
                ipcMain: {
                  handle: (name, fn) => handlers.set(name, fn),
                  on() {},
                  removeHandler() {},
                  removeListener() {},
                },
                screen: {},
              }
            : name === './appearance-host'
              ? { appearanceArguments: () => [], registerAppearance() {} }
              : { hostText: (key) => key },
        setTimeout: (fn) => setTimeout(fn, 5),
        clearTimeout,
      },
    );
    const host = new exports.GestureIndicatorHost({
      url: 'file:///indicator.html',
      preload: 'fixture',
      failed: (message) => failures.push(message),
    });
    await host.initialize();
    assert.equal(host.available(), false);
    assert.equal(instance.destroyed, true);
    assert.equal(failures.length, 1);
    assert.throws(() =>
      handlers.get('gesture-indicator:connect')({
        sender: instance.webContents,
        senderFrame: undefined,
      }),
    );
    host.dispose();
  }
});
