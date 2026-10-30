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
test('web indicator ignores stale revisions, respects pause and remains visible during key recording', async () => {
  const state = { recording: false, settings: createDefaultSettings() },
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
    show: (m, followCursor) => shown.push({ model: m, followCursor }),
    hide: () => hidden.push(true),
  };
  await manager.event('gestures.indicator', notice());
  assert.equal(shown.length, 1);
  assert.equal(shown[0].followCursor, false);
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
  assert.equal(hidden.length, 1);
  assert.equal(shown.length, 2);
  state.recording = false;
  await manager.event('gestures.indicator', { visible: false, revision: 7 });
  assert.equal(hidden.length, 2);
  manager.stopped = true;
  await manager.event('gestures.indicator', notice());
  assert.equal(shown.length, 2);
  manager.stopped = false;
  state.settings.gestures.indicatorPosition = 'cursor-follow';
  await manager.event('gestures.indicator', notice());
  assert.equal(shown[2].followCursor, true);
  assert.deepEqual(shown[2].model, readGestureIndicatorNotice(notice()));
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
async function indicatorHostFixture(t) {
  const handlers = new Map(),
    listeners = new Map(),
    sent = [];
  let window,
    cursor = { x: 100, y: 100 },
    conversions = 0;
  class FakeWindow extends EventEmitter {
    constructor() {
      super();
      window = this;
      this.bounds = { x: 0, y: 0, width: 1, height: 1 };
      this.moves = [];
      this.visible = false;
      this.destroyed = false;
      this.promotions = 0;
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, {
        mainFrame: {},
        setZoomMode() {},
        setZoomFactor() {},
        setWindowOpenHandler() {},
        session: { setPermissionRequestHandler() {} },
        getURL: () => 'file:///indicator.html',
        send: (...args) => sent.push(args),
      });
    }
    setIgnoreMouseEvents() {}
    async loadURL() {
      handlers.get('gesture-indicator:connect')(event());
    }
    isDestroyed() {
      return this.destroyed;
    }
    isVisible() {
      return this.visible;
    }
    getBounds() {
      return this.bounds;
    }
    setBounds(bounds) {
      this.bounds = bounds;
      this.moves.push(bounds);
    }
    showInactive() {
      this.visible = true;
    }
    setAlwaysOnTop() {
      this.promotions++;
    }
    hide() {
      this.visible = false;
    }
    destroy() {
      this.destroyed = true;
      this.emit('closed');
    }
  }
  const event = () => ({ sender: window.webContents, senderFrame: window.webContents.mainFrame });
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
                on: (name, fn) => listeners.set(name, fn),
                removeHandler: (name) => handlers.delete(name),
                removeListener: (name) => listeners.delete(name),
              },
              screen: {
                getCursorScreenPoint: () => cursor,
                screenToDipPoint: ({ x, y }) => {
                  conversions++;
                  return { x: x / 2, y: y / 2 };
                },
                getDisplayNearestPoint: ({ x }) => ({
                  id: x < 0 ? 2 : 1,
                  scaleFactor: x < 0 ? 2 : 1,
                  bounds:
                    x < 0
                      ? { x: -800, y: 0, width: 800, height: 600 }
                      : { x: 0, y: 0, width: 1920, height: 1080 },
                }),
              },
            }
          : name === './appearance-host'
            ? { appearanceArguments: () => [], registerAppearance() {} }
            : { hostText: (key) => key },
      setTimeout,
      clearTimeout,
    },
  );
  const host = new exports.GestureIndicatorHost({
    url: 'file:///indicator.html',
    preload: 'fixture',
    failed() {},
  });
  await host.initialize();
  t.after(() => host.dispose());
  return {
    host,
    window,
    sent,
    handlers,
    conversions: () => conversions,
    cursor: (point) => {
      cursor = point;
    },
    tick: (sequence = host.sequence, changes = {}) =>
      listeners.get('gesture-indicator:follow')?.({ ...event(), ...changes }, sequence),
    measured: (sequence, width = 200, height = 100) =>
      listeners.get('gesture-indicator:measured')(event(), { sequence, width, height }),
    frame: () => handlers.get('gesture-indicator:connect')(event()),
  };
}
test('cursor following starts after measurement and moves without content updates or repeated promotion', async (t) => {
  const f = await indicatorHostFixture(t);
  f.host.show(notice(), true);
  assert.equal(f.frame().followCursor, true);
  f.tick();
  assert.equal(f.window.moves.length, 0, 'frame before measurement cannot show or move the window');
  f.measured(f.frame().sequence - 1);
  assert.equal(f.window.visible, false);
  f.measured(f.frame().sequence);
  assert.deepEqual({ ...f.window.bounds }, { x: 116, y: 116, width: 200, height: 100 });
  const sent = f.sent.length;
  f.tick();
  assert.equal(f.window.moves.length, 1, 'stationary cursor does not move the window');
  f.cursor({ x: 200, y: 150 });
  f.tick(f.frame().sequence - 1);
  f.tick(String(f.frame().sequence));
  f.tick(f.frame().sequence, { sender: {} });
  f.tick(f.frame().sequence, { senderFrame: null });
  assert.equal(
    f.window.moves.length,
    1,
    'stale or unauthorized frame requests do not move the window',
  );
  f.tick();
  assert.deepEqual({ ...f.window.bounds }, { x: 216, y: 166, width: 200, height: 100 });
  assert.equal(f.sent.length, sent, 'no rendering IPC for position-only updates');
  assert.equal(f.window.promotions, 1);
  assert.equal(f.conversions(), 0, 'cursor DIP coordinates are not converted twice');
});
test('following stays inside the current display, including negative coordinates and a larger panel', async (t) => {
  const f = await indicatorHostFixture(t);
  f.host.show(notice(), true);
  f.measured(f.frame().sequence);
  f.cursor({ x: 1919, y: 1079 });
  f.tick();
  assert.deepEqual({ ...f.window.bounds }, { x: 1720, y: 980, width: 200, height: 100 });
  f.cursor({ x: -780, y: 590 });
  f.tick();
  assert.deepEqual({ ...f.window.bounds }, { x: -764, y: 500, width: 200, height: 100 });
  f.measured(f.frame().sequence, 1000, 700);
  assert.deepEqual({ ...f.window.bounds }, { x: -800, y: 0, width: 800, height: 600 });
  f.cursor({ x: 100, y: 100 });
  f.tick();
  assert.deepEqual({ ...f.window.bounds }, { x: 116, y: 116, width: 1000, height: 700 });
});
test('hide, fixed placement, renderer failure and close stop cursor tracking and reject stale sizing', async (t) => {
  const f = await indicatorHostFixture(t);
  f.host.show(notice(), true);
  f.measured(f.frame().sequence);
  const oldSequence = f.frame().sequence;
  f.host.hide();
  f.measured(oldSequence);
  f.tick();
  assert.equal(f.frame().followCursor, false);
  assert.equal(f.window.visible, false);
  f.host.show(notice());
  f.measured(f.frame().sequence);
  f.cursor({ x: 600, y: 600 });
  f.tick();
  assert.deepEqual({ ...f.window.bounds }, { x: -800, y: 150, width: 200, height: 100 });
  f.host.show(notice(), true);
  f.measured(f.frame().sequence);
  f.window.webContents.emit('render-process-gone');
  f.tick();
  assert.equal(f.host.available(), false);
  const g = await indicatorHostFixture(t);
  g.host.show(notice(), true);
  g.measured(g.frame().sequence);
  g.window.destroy();
  g.tick();
  assert.equal(g.host.available(), false);
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
