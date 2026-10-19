const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { HostModalLayer } = require('../out/main/main/core/host-modal-layer');

function fixture() {
  const captures = [],
    messages = [];
  const window = Object.assign(new EventEmitter(), {
    webContents: Object.assign(new EventEmitter(), {
      getZoomFactor: () => 2,
      send: (channel, model) => messages.push({ channel, ...model }),
    }),
    contentView: { children: [] },
    isDestroyed: () => false,
  });
  const layer = new HostModalLayer(window);
  const add = (id, visible = true) => {
    const view = {
      bounds: { x: 0, y: id * 86, width: 152, height: 1000 },
      visible: false,
      getBounds() {
        return { ...this.bounds };
      },
      setVisible(value) {
        this.visible = value;
      },
      webContents: {
        id,
        isDestroyed: () => false,
        capturePage: (...args) =>
          new Promise((resolve, reject) => captures.push({ id, resolve, reject, args })),
      },
    };
    window.contentView.children.push(view);
    const registration = layer.register(view);
    registration.setVisible(visible);
    return { view, registration };
  };
  const flush = () => new Promise(setImmediate);
  const complete = async (...items) => {
    for (const item of items.length ? items : captures.filter((c) => !c.done)) {
      item.done = true;
      item.resolve({ toDataURL: () => 'data:image/png;base64,' + item.id });
    }
    await flush();
  };
  const ready = () => layer.ready(messages.at(-1).revision);
  return { layer, window, captures, messages, add, complete, ready, flush };
}

test('all registered surfaces are decoded together before native views are covered, in native stacking order', async () => {
  const f = fixture(),
    ribbon = f.add(1),
    title = f.add(2),
    hidden = f.add(3, false);
  f.window.contentView.children.reverse();
  f.layer.setActive(true);
  assert(ribbon.registration.blocked);
  assert(ribbon.view.visible && title.view.visible && !hidden.view.visible);
  assert.equal(f.captures.length, 2);
  assert.deepEqual(f.captures[0].args, [undefined, { stayHidden: true, stayAwake: true }]);
  await f.complete(f.captures[0]);
  assert.equal(f.messages.length, 0);
  await f.complete();
  assert.deepEqual(
    f.messages[0].surfaces.map((s) => s.id),
    [2, 1],
  );
  assert.deepEqual(f.messages[0].surfaces[1].bounds, { x: 0, y: 43, width: 76, height: 500 });
  assert.equal(f.ready(), true);
  assert(!ribbon.view.visible && !title.view.visible);
  f.layer.setActive(false);
  assert(ribbon.view.visible && title.view.visible && !hidden.view.visible);
  assert(!ribbon.registration.blocked);
});

test('closing during capture rejects late images and acknowledgements', async () => {
  const f = fixture(),
    surface = f.add(1);
  f.layer.setActive(true);
  f.layer.setActive(false);
  await f.complete();
  assert.equal(f.layer.ready(2), false);
  assert.equal(f.messages.length, 0);
  assert(surface.view.visible);
});

test('resize and surface replacement invalidate earlier captures and keep new surfaces behind the dialog', async () => {
  const f = fixture(),
    old = f.add(1);
  f.layer.setActive(true);
  await f.complete();
  const oldRevision = f.messages[0].revision;
  f.ready();
  old.view.bounds.height = 800;
  old.registration.setVisible(true);
  const pending = f.captures.at(-1);
  old.registration.dispose();
  f.window.contentView.children = [];
  const replacement = f.add(2);
  assert(!replacement.view.visible);
  assert.equal(f.layer.ready(oldRevision), false);
  await f.complete(pending);
  await f.complete();
  assert.deepEqual(
    f.messages.at(-1).surfaces.map((s) => s.id),
    [2],
  );
  f.ready();
  f.layer.setActive(false);
  assert(replacement.view.visible);
});

test('a surface hidden while a dialog is open stays hidden after dismissal', async () => {
  const f = fixture(),
    first = f.add(1),
    second = f.add(2);
  f.layer.setActive(true);
  await f.complete();
  f.ready();
  second.registration.setVisible(false);
  await f.complete();
  f.ready();
  assert.deepEqual(
    f.messages.at(-1).surfaces.map((s) => s.id),
    [1],
  );
  f.layer.setActive(false);
  assert(first.view.visible && !second.view.visible);
});

test('renderer reload and exit restore every registered surface', async () => {
  for (const event of ['did-start-loading', 'render-process-gone']) {
    const f = fixture(),
      first = f.add(1),
      second = f.add(2);
    f.layer.setActive(true);
    await f.complete();
    f.ready();
    f.window.webContents.emit(event);
    assert(first.view.visible && second.view.visible);
  }
});

test('failed capture or decode releases presentation without hiding native surfaces; retry still works', async () => {
  const f = fixture(),
    first = f.add(1),
    second = f.add(2);
  f.layer.setActive(true);
  f.captures[0].done = true;
  f.captures[0].reject(Error('closed'));
  await f.complete();
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].failed, true);
  assert.equal(f.layer.ready(f.messages[0].revision, false), true);
  assert(first.view.visible && second.view.visible);
  f.layer.layout();
  await f.complete();
  assert.equal(f.messages.at(-1).failed, undefined);
  assert.equal(f.layer.ready(f.messages.at(-1).revision, false), true);
  assert(first.view.visible && second.view.visible);
  f.ready();
  assert(!first.view.visible && !second.view.visible);
});
