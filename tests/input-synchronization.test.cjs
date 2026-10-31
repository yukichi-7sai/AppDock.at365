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
      return { ...state, recording: state.recording || manager.recordingActive };
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
  await f.manager.start();
  await f.manager.record({ token: 'recording', active: true, allowWin: false }, '123');
  assert.equal(f.applied.at(-1).recording.token, 'recording');
  await f.manager.event('shortcuts.recordEnded', { token: 'recording' });
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
