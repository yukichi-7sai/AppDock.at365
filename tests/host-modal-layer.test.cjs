const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { SurfaceBlur } = require('../out/main/main/core/surface-blur');
const { HostModalLayer } = require('../out/main/main/core/host-modal-layer');
const flush = () => new Promise(setImmediate);
function fixture() {
  const pending = [],
    removed = [];
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    insertCSS: (css, options) => new Promise((resolve) => pending.push({ css, options, resolve })),
    removeInsertedCSS: async (key) => {
      removed.push(key);
    },
  });
  return { blur: new SurfaceBlur(contents), contents, pending, removed };
}
test('close while inserting removes the late style, and repeated requests do not accumulate styles', async () => {
  const f = fixture();
  f.blur.setActive(true);
  f.blur.setActive(true);
  assert.equal(f.pending.length, 1);
  assert.equal(f.pending[0].options.cssOrigin, 'author');
  f.blur.setActive(false);
  f.pending[0].resolve('late');
  await flush();
  assert.deepEqual(f.removed, ['late']);
  for (let i = 0; i < 50; i++) {
    f.blur.setActive(true);
    f.pending.at(-1).resolve(String(i));
    await flush();
    f.blur.setActive(false);
    await flush();
  }
  assert.equal(f.removed.length, 51);
  assert.equal(new Set(f.removed).size, 51);
});
test('navigation rejects the old style and reapplies only for the current page', async () => {
  const f = fixture();
  f.blur.setActive(true);
  f.contents.emit('did-start-loading');
  f.contents.emit('did-finish-load');
  f.pending[0].resolve('previous-document');
  f.pending[1].resolve('current-document');
  await flush();
  assert.deepEqual(f.removed, ['previous-document']);
  f.blur.setActive(false);
  await flush();
  assert.deepEqual(f.removed, ['previous-document', 'current-document']);
});
test('host modal state resets on reload, renderer exit and window close without touching native views', () => {
  let changes = 0;
  const window = Object.assign(new EventEmitter(), { webContents: new EventEmitter() });
  const state = new HostModalLayer(window, () => changes++);
  for (const event of ['did-start-loading', 'render-process-gone', 'closed']) {
    state.setActive(true);
    state.setActive(true);
    assert(state.isActive);
    (event === 'closed' ? window : window.webContents).emit(event);
    assert(!state.isActive);
  }
  assert.equal(changes, 6);
});
