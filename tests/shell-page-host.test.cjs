const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire, wrap } = require('node:module');
const { EventEmitter } = require('node:events');

function fixture() {
  const handlers = new Map();
  const filename = require.resolve('../out/main/main/core/shell-page-host');
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInThisContext(wrap(fs.readFileSync(filename, 'utf8')), { filename })(
    module.exports,
    (id) =>
      id === 'electron'
        ? { ipcMain: { handle: (name, fn) => handlers.set(name, fn) } }
        : localRequire(id),
    module,
    filename,
    path.dirname(filename),
  );
  const state = { route: 'image-library', usable: true };
  const window = Object.assign(new EventEmitter(), { webContents: new EventEmitter() });
  const host = new module.exports.ShellPageHost({
    window,
    registry: { observe() {}, usable: () => state.usable },
    route: () => state.route,
  });
  let calls = 0;
  const current = {
    id: 'controller',
    route: 'image-library',
    kind: 'image-library',
    passive: (action) => action.command === 'anchor',
    snapshot: () => ({ id: 'controller' }),
    act: () => ++calls,
  };
  const contents = { mainFrame: {}, getURL: () => 'file:///fixture/image-library.html' };
  const surface = {
    view: { webContents: contents },
    url: contents.getURL(),
    session: 'session',
    ready: true,
    modal: { blocked: false },
  };
  host.current = current;
  host.surface = surface;
  const event = { sender: contents, senderFrame: contents.mainFrame };
  const act = (command = 'select') => handlers.get('shell-page:act')(event, { command });
  return {
    host,
    state,
    current,
    surface,
    event,
    act,
    connect: () => handlers.get('shell-page:connect')(event),
    get calls() {
      return calls;
    },
  };
}

test('page actions distinguish each binding failure without forwarding rejected requests', () => {
  const cases = [
    [
      'session-closed',
      (f) => {
        f.host.surface = undefined;
      },
    ],
    [
      'session-closed',
      (f) => {
        f.host.current = undefined;
      },
    ],
    [
      'provider-unavailable',
      (f) => {
        f.state.usable = false;
      },
    ],
    [
      'route-changed',
      (f) => {
        f.state.route = 'home';
      },
    ],
    [
      'sender-mismatch',
      (f) => {
        f.event.sender = {};
      },
    ],
    [
      'frame-mismatch',
      (f) => {
        f.event.senderFrame = {};
      },
    ],
    [
      'document-changed',
      (f) => {
        f.surface.url = 'file:///different.html';
      },
    ],
    [
      'page-not-ready',
      (f) => {
        f.surface.ready = false;
      },
    ],
    [
      'modal-active',
      (f) => {
        f.surface.modal.blocked = true;
      },
    ],
  ];
  for (const [reason, invalidate] of cases) {
    const f = fixture();
    invalidate(f);
    assert.throws(f.act, { message: `Page session is not bound (${reason})` });
    assert.equal(f.calls, 0);
  }
  const f = fixture();
  assert.equal(f.act(), 1);
});

test('passive modal operations retain readiness, sender, provider and route validation', () => {
  const f = fixture();
  f.surface.modal.blocked = true;
  assert.equal(f.connect().sessionId, 'session');
  assert.equal(f.act('anchor'), 1);
  assert.throws(() => f.act('select'), /modal-active/);
  f.surface.ready = false;
  assert.throws(() => f.act('anchor'), /page-not-ready/);
  f.surface.ready = true;
  f.event.senderFrame = {};
  assert.throws(() => f.act('anchor'), /frame-mismatch/);
  f.event.senderFrame = f.event.sender.mainFrame;
  f.state.usable = false;
  assert.throws(() => f.act('anchor'), /provider-unavailable/);
  f.state.usable = true;
  f.state.route = 'home';
  assert.throws(() => f.act('anchor'), /route-changed/);
  assert.equal(f.calls, 1);
});
