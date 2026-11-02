const { test } = require('node:test');
const assert = require('node:assert/strict');
const { InputCaptureManager } = require('../out/main/main/core/gestures');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');

const settle = () => new Promise((resolve) => setImmediate(resolve));
function fixture(t) {
  const state = {
    settings: createDefaultSettings(),
    context: { appFocused: true, window: '123' },
    commands: [{ id: 'fixture.run', title: 'Run' }],
    recording: false,
  };
  state.settings.gestures.bindings = [
    {
      id: 'local',
      command: 'fixture.run',
      gesture: 'move-left',
      enabled: true,
      when: { scope: 'app', appletIds: [], processes: [] },
    },
  ];
  let reads = 0;
  const applied = [];
  const manager = new InputCaptureManager(
    'unused',
    () => {
      reads++;
      return state;
    },
    {},
    async () => {},
    () => {},
    () => {},
    { ownership: async () => {}, applied: () => {}, recordingEnded: () => {} },
  );
  manager.peer = {
    closed: false,
    request: async (method, config) => {
      assert.equal(method, 'capture.sync');
      applied.push(structuredClone(config));
      return [];
    },
    close() {},
  };
  t.after(() => manager.close());
  return { manager, state, applied, reads: () => reads };
}

test('idle input capture performs no repeated state reads; changes update local conditions and command availability', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(t);
  await f.manager.start();
  assert.equal(f.applied.at(-1).gestures.rows.length, 1);
  const reads = f.reads();
  t.mock.timers.tick(60000);
  await settle();
  assert.equal(f.reads(), reads);

  f.state.context = { appFocused: false, window: '' };
  for (let i = 0; i < 20; i++) f.manager.requestRefresh();
  await settle();
  assert.equal(f.reads(), reads + 1);
  assert.equal(f.applied.at(-1).gestures.rows.length, 0);

  f.state.context = { appFocused: true, window: '456' };
  f.manager.requestRefresh();
  await settle();
  assert.equal(f.applied.at(-1).gestures.rows[0].window, '456');
  f.state.commands = [];
  f.manager.requestRefresh();
  await settle();
  assert.equal(f.applied.at(-1).gestures.rows.length, 0);
  f.state.commands = [{ id: 'fixture.run', title: 'Renamed' }];
  f.manager.requestRefresh();
  await settle();
  assert.equal(f.applied.at(-1).gestures.rows[0].title, 'Renamed');

  const count = f.applied.length;
  f.manager.requestRefresh();
  await settle();
  assert.equal(f.applied.length, count);
});

test('a change during synchronization is applied afterwards without overlapping native requests', async (t) => {
  const f = fixture(t);
  await f.manager.start();
  let release, entered;
  const ready = new Promise((resolve) => (entered = resolve));
  const wait = new Promise((resolve) => (release = resolve));
  const request = f.manager.peer.request;
  let busy = 0,
    maximum = 0;
  f.manager.peer.request = async (...args) => {
    maximum = Math.max(maximum, ++busy);
    try {
      const result = await request(...args);
      if (args[1].dialogWindow === 'first') {
        entered();
        await wait;
      }
      return result;
    } finally {
      busy--;
    }
  };
  f.state.dialogWindow = 'first';
  f.manager.requestRefresh();
  await ready;
  f.state.dialogWindow = 'latest';
  for (let i = 0; i < 20; i++) f.manager.requestRefresh();
  release();
  await settle();
  assert.equal(maximum, 1);
  assert.equal(f.applied.at(-1).dialogWindow, 'latest');
  assert.equal(f.applied.filter((config) => config.dialogWindow === 'latest').length, 1);
});

test('native recording completion updates capture state and shutdown ignores queued changes', async (t) => {
  const f = fixture(t);
  const pressed = [];
  f.manager.shortcuts.pressed = (event) => pressed.push(event.shortcuts);
  const request = f.manager.peer.request;
  f.manager.peer.request = async (method, config) => {
    await request(method, config);
    return config.shortcuts.map(({ shortcut }) => ({ shortcut, registered: true }));
  };
  await f.manager.syncShortcuts([{ shortcut: 'F21', blockOriginalInput: true }]);
  await f.manager.start();
  const revision = f.applied.at(-1).shortcutRevision;
  await f.manager.record({ token: 'recording', active: true, allowWin: false }, '123');
  assert.equal(f.applied.at(-1).recording.token, 'recording');
  assert.equal(f.applied.at(-1).shortcuts[0].shortcut, 'F21');
  const press = { shortcuts: ['F21'], window: '456', revision, context: '{}' };
  await f.manager.event('shortcuts.pressed', press);
  assert.deepEqual(pressed, []);
  await f.manager.event('shortcuts.recordEnded', { token: 'recording' });
  await f.manager.event('shortcuts.pressed', press);
  assert.deepEqual(pressed, [['F21']]);
  await settle();
  assert.equal(f.applied.at(-1).recording, null);

  const reads = f.reads();
  f.state.dialogWindow = 'closing';
  f.manager.requestRefresh();
  await f.manager.close();
  f.manager.requestRefresh();
  await settle();
  assert.equal(f.reads(), reads);
});

test('session pause reaches native assistance without changing input rules or manual gesture pause', async (t) => {
  const f = fixture(t);
  await f.manager.syncShortcuts([{ shortcut: 'Ctrl+;', blockOriginalInput: true }]);
  await f.manager.start();
  const before = f.applied.at(-1);
  f.manager.setSessionPaused(true);
  await settle();
  const paused = f.applied.at(-1);
  assert.equal(paused.assistancePaused, true);
  assert.deepEqual(paused.shortcuts, before.shortcuts);
  assert.deepEqual(paused.gestures, before.gestures);
  assert.equal(paused.shortcutRevision, before.shortcutRevision);
  const count = f.applied.length;
  f.manager.setSessionPaused(true);
  await settle();
  assert.equal(f.applied.length, count);
  f.manager.togglePause();
  await settle();
  f.manager.setSessionPaused(false);
  await settle();
  assert.equal(f.applied.at(-1).assistancePaused, false);
  assert.equal(f.applied.at(-1).gestures.enabled, false);
  assert.equal(f.manager.paused, true);
});
