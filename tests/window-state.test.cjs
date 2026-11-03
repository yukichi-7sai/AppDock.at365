const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  WindowStateStore,
  parseWindowState,
  fitWindowState,
  restoreWindowBounds,
} = require('../out/main/main/core/window-state.js');
const area = { x: 0, y: 0, width: 1920, height: 1040 };
const state = { bounds: { x: 100, y: 120, width: 1300, height: 700 }, maximized: false };
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-window-'));
  const errors = [];
  const file = path.join(dir, 'window-state.json');
  const store = new WindowStateStore(file, (error) => errors.push(error));
  t.after(() => {
    store.flush();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const window = Object.assign(new EventEmitter(), {
    visible: true,
    minimized: false,
    maximized: false,
    bounds: { ...state.bounds },
    isDestroyed: () => false,
    isVisible() {
      return this.visible;
    },
    isMinimized() {
      return this.minimized;
    },
    isFullScreen: () => false,
    isMaximized() {
      return this.maximized;
    },
    getNormalBounds() {
      return { ...this.bounds };
    },
  });
  return { store, file, errors, window };
}
test('normal bounds survive restart, maximize, minimize and tray close', (t) => {
  const { store, file, window, errors } = fixture(t);
  assert.equal(store.load([area]), undefined);
  store.track(window);
  window.emit('move');
  window.maximized = true;
  window.emit('maximize');
  window.minimized = true;
  window.maximized = false;
  window.bounds = { x: -32000, y: -32000, width: 160, height: 28 };
  window.emit('resize');
  window.emit('close');
  window.visible = false;
  window.emit('move');
  store.flush();
  const restored = new WindowStateStore(file, assert.fail).load([area]);
  assert.deepEqual(restored, { ...state, maximized: true });
  assert.deepEqual(errors, []);
});
test('unmaximize and resize replace previous maximized state', (t) => {
  const { store, window, file } = fixture(t);
  store.track(window);
  window.maximized = true;
  window.emit('maximize');
  window.maximized = false;
  window.bounds.width = 1200;
  window.emit('unmaximize');
  window.emit('close');
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), { bounds: window.bounds, maximized: false });
});
test('hidden startup preserves saved maximum state', (t) => {
  const { store, window, file } = fixture(t);
  fs.writeFileSync(file, JSON.stringify({ ...state, maximized: true }));
  store.load([area]);
  window.visible = false;
  store.track(window);
  window.emit('resize');
  window.emit('close');
  assert.equal(JSON.parse(fs.readFileSync(file)).maximized, true);
});
test('negative monitor coordinates survive and disconnected monitor recovery preserves the saved size', () => {
  const left = { x: -1920, y: 0, width: 1920, height: 1040 };
  const onLeft = { bounds: { ...state.bounds, x: -1800 }, maximized: true };
  assert.deepEqual(fitWindowState(onLeft, [area, left]), onLeft);
  assert.equal(fitWindowState(onLeft, [area]).bounds.x, 0);
  const small = { x: 40, y: 30, width: 800, height: 580 };
  assert.deepEqual(fitWindowState(state, [small]).bounds, {
    ...state.bounds,
    x: small.x,
    y: small.y,
  });
});
test('the minimum is fixed while a smaller work area only changes the restored position', () => {
  const old = { bounds: { x: 100, y: 120, width: 900, height: 620 }, maximized: false };
  assert.deepEqual(fitWindowState(old, [area]), old);
  assert.deepEqual(
    fitWindowState({ ...old, bounds: { ...old.bounds, width: 500, height: 400 } }, [area]),
    old,
  );
  const large = { bounds: { x: 9999, y: 9999, width: 1720, height: 1000 }, maximized: true };
  for (const workArea of [
    { x: 0, y: 0, width: 960, height: 500 },
    { x: -1280, y: 0, width: 1280, height: 600 },
    { x: 1920, y: 0, width: 1100, height: 900 },
  ]) {
    const restored = fitWindowState(large, [workArea]);
    assert.deepEqual(restored, {
      ...large,
      bounds: { ...large.bounds, x: workArea.x, y: workArea.y },
    });
  }
  assert.deepEqual(fitWindowState(large, []), large);
});
test('invalid geometry and broken JSON fall back without preventing startup', (t) => {
  for (const value of [
    null,
    {},
    { ...state, maximized: 'yes' },
    { ...state, bounds: { ...state.bounds, width: -1 } },
    { ...state, bounds: { ...state.bounds, x: Infinity } },
  ]) {
    assert.throws(() => parseWindowState(value));
  }
  const { store, file, errors } = fixture(t);
  fs.writeFileSync(file, '{broken');
  assert.equal(store.load([area]), undefined);
  assert.equal(errors.length, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});
test('write failures are reported without throwing from a window event', (t) => {
  const { store, file, window, errors } = fixture(t);
  fs.mkdirSync(file);
  store.track(window);
  assert.doesNotThrow(() => window.emit('close'));
  assert.equal(errors.length, 1);
});

for (const deleted of [false, true])
  test(`a window move resumes after an external position ${deleted ? 'deletion' : 'change'} without retrying the rejected save`, (t) => {
    const { store, file, window, errors } = fixture(t);
    store.load([area]);
    store.track(window);
    window.emit('move');
    store.flush();
    const incoming = { ...state, bounds: { ...state.bounds, x: 500 } };
    if (deleted) fs.unlinkSync(file);
    else fs.writeFileSync(file, JSON.stringify(incoming));
    window.bounds.x = 200;
    window.emit('move');
    store.flush();
    store.flush();
    if (deleted) assert.equal(fs.existsSync(file), false);
    else assert.deepEqual(JSON.parse(fs.readFileSync(file)), incoming);
    assert.deepEqual(errors, [], 'a recovered conflict is not a final save failure');
    window.bounds.x = 300;
    window.emit('move');
    store.flush();
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), {
      bounds: window.bounds,
      maximized: false,
    });
    assert.deepEqual(errors, []);
  });

for (const invalid of [
  '{broken',
  JSON.stringify({ ...state, bounds: { ...state.bounds, width: -1 } }),
])
  test('a failed conflict reload protects invalid window state until repaired', (t) => {
    const { store, file, window, errors } = fixture(t);
    store.load([area]);
    store.track(window);
    window.emit('move');
    store.flush();
    fs.writeFileSync(file, invalid);
    window.bounds.x = 200;
    window.emit('move');
    store.flush();
    assert.equal(errors.length, 1);
    assert(
      !(errors[0] instanceof require('../out/main/main/core/settings').SettingsConflictError),
      'report the reload failure',
    );
    window.bounds.x = 300;
    window.emit('move');
    store.flush();
    assert.equal(errors.length, 2);
    assert.equal(fs.readFileSync(file, 'utf8'), invalid);
    fs.writeFileSync(file, JSON.stringify(state));
    store.flush();
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), state);
    window.bounds.x = 400;
    window.emit('move');
    store.flush();
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), {
      bounds: window.bounds,
      maximized: false,
    });
    assert.equal(errors.length, 2);
  });

test('fractional DPI rounding does not grow bounds on each restart', () => {
  let actual;
  const window = {
    getMinimumSize: () => [900, 620],
    setBounds(bounds) {
      actual = { ...bounds, width: bounds.width + 1 };
    },
    getNormalBounds() {
      return actual;
    },
  };
  restoreWindowBounds(window, state.bounds);
  assert.deepEqual(actual, state.bounds);
  restoreWindowBounds(window, actual);
  assert.deepEqual(actual, state.bounds);
});

test('DPI compensation at the fixed minimum preserves the saved size and minimum', () => {
  const bounds = { x: 0, y: 0, width: 900, height: 620 };
  let minimum = [900, 620];
  let actual;
  const window = {
    getMinimumSize: () => [...minimum],
    setMinimumSize: (width, height) => {
      minimum = [width, height];
    },
    setBounds(requested) {
      actual = {
        ...requested,
        width: Math.max(minimum[0], requested.width) + 2,
        height: Math.max(minimum[1], requested.height) + 1,
      };
    },
    getNormalBounds: () => actual,
  };
  restoreWindowBounds(window, bounds);
  assert.deepEqual(actual, bounds);
  assert.deepEqual(minimum, [900, 620]);
});

test('first show records bounds even if immediately minimized', (t) => {
  const { store, file, window } = fixture(t);
  store.track(window);
  window.emit('show');
  window.minimized = true;
  window.emit('close');
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), state);
});
