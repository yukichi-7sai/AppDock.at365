const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const { CommandPaletteSession } = require('../out/main/main/core/command-palette');

function fixture(t) {
  const file = path.resolve(__dirname, '../out/main/main/core/overlay-host.js');
  const actualRequire = createRequire(file),
    handlers = new Map(),
    views = [],
    timers = new Map();
  let timerId = 0,
    requestId = 0;
  const provider = {
    id: 'fixture.shell',
    version: '1.0.0',
    generation: 'first',
    folder: 'fixture',
    enabled: true,
    shell: { views: { 'overlay.command-palette': 'overlay.html' } },
  };
  const failed = [];
  const registry = {
    observe() {},
    touch() {},
    retry() {},
    fail(...args) {
      failed.push(args);
    },
    resolve: () => ({ provider }),
    usable: (_, binding) =>
      provider.enabled &&
      binding.provider === provider.id &&
      binding.version === provider.version &&
      binding.generation === provider.generation,
  };
  const window = Object.assign(new EventEmitter(), {
    webContents: Object.assign(new EventEmitter(), {
      getZoomFactor: () => 1,
      isDestroyed: () => false,
      focus() {},
    }),
    isDestroyed: () => false,
    isFocused: () => true,
    isVisible: () => true,
    isMinimized: () => false,
    getContentSize: () => [1000, 800],
    contentView: {
      children: [],
      addChildView(view) {
        if (!this.children.includes(view)) this.children.push(view);
      },
      removeChildView(view) {
        this.children = this.children.filter((v) => v !== view);
      },
    },
  });
  const createShellView = () => {
    const wc = Object.assign(new EventEmitter(), {
      closed: false,
      url: 'file:///fixture/overlay.html',
      mainFrame: { url: 'file:///fixture/overlay.html' },
      isDestroyed() {
        return this.closed;
      },
      getURL() {
        return this.url;
      },
      loadURL: async () => {},
      messages: [],
      send(...args) {
        this.messages.push(args);
      },
      focus() {},
      setZoomFactor() {},
      close() {
        this.closed = true;
        this.emit('destroyed');
      },
    });
    const view = {
      webContents: wc,
      visible: false,
      setVisible(value) {
        this.visible = value;
      },
      setBounds() {},
      setBackgroundColor() {},
    };
    views.push(view);
    return { view, url: wc.url };
  };
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(file, 'utf8'),
    {
      module,
      exports: module.exports,
      require: (id) =>
        id === 'electron'
          ? {
              ipcMain: {
                handle: (name, fn) => handlers.set(name, fn),
                removeHandler: (name) => handlers.delete(name),
              },
              webContents: { getFocusedWebContents: () => window.webContents },
            }
          : id === './shell-view'
            ? { createShellView, shellViewUrl: () => 'file:///fixture/overlay.html' }
            : actualRequire(id),
      setTimeout: (fn) => {
        const id = ++timerId;
        timers.set(id, fn);
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
    { filename: file },
  );
  const host = new module.exports.OverlayHost({
    window,
    preload: 'preload',
    registry,
    providers: () => [provider],
    route: () => 'settings',
    execute: async () => {},
    settings: () => ({}),
    changed() {},
    failed() {},
  });
  t.after(() => host.dispose());
  host.viewport({ x: 0, y: 40, width: 1000, height: 720 });
  const session = () =>
    new CommandPaletteSession(
      { requestId: 'request-' + ++requestId, mode: 'select' },
      {
        commands: () => [],
        pins: () => [],
        shortcuts: () => ({}),
        dark: () => false,
        savePins() {},
        execute: async () => {},
        changed() {},
      },
    );
  const invoke = (name, view, ...args) =>
    handlers.get('overlay:' + name)(
      { sender: view.webContents, senderFrame: view.webContents.mainFrame },
      ...args,
    );
  const ready = (view, reusable = true) => {
    const connection = invoke('connect', view);
    invoke(
      'ready',
      view,
      connection.sessionId,
      reusable ? { reusable: true, modelId: connection.snapshot.id } : undefined,
    );
    return connection;
  };
  return { host, views, provider, failed, session, invoke, ready };
}

test('reusable palettes keep one hidden renderer, rotate sessions and reject old callbacks', async (t) => {
  const f = fixture(t),
    first = f.session();
  f.host.open(first);
  const view = f.views[0],
    old = f.ready(view);
  first.cancel('dismissed');
  assert.equal(view.visible, false);
  assert.equal(view.webContents.closed, false);
  assert.equal(view.webContents.messages.at(-1)[0], 'overlay:suspended');
  assert.throws(() => f.invoke('connect', view));
  for (let i = 0; i < 15; i++) {
    const session = f.session();
    f.host.open(session);
    assert.equal(f.views.length, 1);
    assert.equal(view.visible, false);
    assert.throws(() =>
      f.invoke('ready', view, old.sessionId, { reusable: true, modelId: old.snapshot.id }),
    );
    const next = f.ready(view);
    assert.notEqual(next.sessionId, old.sessionId);
    assert.equal(view.visible, true);
    await assert.rejects(
      Promise.resolve().then(() => f.invoke('act', view, { id: old.snapshot.id, type: 'dismiss' })),
    );
    session.cancel('dismissed');
  }
  f.host.dispose();
  assert(view.webContents.closed);
});

test('legacy renderers are destroyed and changed or disabled providers retire cached renderers', (t) => {
  const f = fixture(t);
  let session = f.session();
  f.host.open(session);
  f.ready(f.views[0], false);
  session.cancel('done');
  assert(f.views[0].webContents.closed);
  session = f.session();
  f.host.open(session);
  f.ready(f.views[1]);
  session.cancel('done');
  f.provider.generation = 'second';
  f.host.refresh();
  assert(f.views[1].webContents.closed);
  session = f.session();
  f.host.open(session);
  f.ready(f.views[2]);
  session.cancel('done');
  f.provider.enabled = false;
  f.host.refresh();
  assert(f.views[2].webContents.closed);
});

test('a hidden renderer crash is retired without opening an overlay', (t) => {
  const f = fixture(t),
    session = f.session();
  f.host.open(session);
  const view = f.views[0];
  f.ready(view);
  session.cancel('done');
  view.webContents.emit('render-process-gone');
  assert(view.webContents.closed);
  assert.equal(f.host.active, false);
  assert.equal(f.failed.length, 1);
});
