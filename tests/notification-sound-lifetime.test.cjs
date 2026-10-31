const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getEventListeners } = require('node:events');
const { NotificationSounds } = require('../out/main/main/core/notification-sounds');
const turn = () => new Promise((resolve) => setImmediate(resolve));
const failed = () => assert.fail('cancellation must not report playback failure');

test('a sound waiting for file data performs no periodic lifetime checks and owner stop cancels immediately', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let release,
    reads = 0,
    plays = 0;
  const owner = new AbortController();
  const sounds = new NotificationSounds({
    read: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    play: async () => {
      plays++;
    },
  });
  t.after(() => sounds.dispose());
  sounds.enqueue(
    'old',
    () => {
      reads++;
      return true;
    },
    failed,
    owner.signal,
  );
  const checks = reads;
  t.mock.timers.tick(60000);
  await turn();
  assert.equal(reads, checks);
  owner.abort();
  assert.equal(sounds.active.controller.signal.aborted, true);
  release(Buffer.from('old'));
  await turn();
  assert.equal(plays, 0);
  assert.equal(getEventListeners(owner.signal, 'abort').length, 0);
});

test('owner stop cancels active and queued sounds while preserving another owner and FIFO', async (t) => {
  const old = new AbortController(),
    other = new AbortController(),
    events = [];
  const sounds = new NotificationSounds({
    read: async (file) => Buffer.from(file),
    play: async (bytes, signal, before) => {
      before();
      events.push('play:' + bytes);
      if (bytes.toString() === 'old')
        await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    },
  });
  t.after(() => sounds.dispose());
  sounds.enqueue('old', () => true, failed, old.signal);
  sounds.enqueue('discarded', () => true, failed, old.signal);
  sounds.enqueue('other', () => true, failed, other.signal);
  await turn();
  assert.deepEqual(events, ['play:old']);
  old.abort();
  await turn();
  assert.deepEqual(events, ['play:old', 'play:other']);
  assert.equal(getEventListeners(old.signal, 'abort').length, 0);
  assert.equal(getEventListeners(other.signal, 'abort').length, 0);
});

test('paused sounds share one owner listener and stop removes all pending sounds without reading', async () => {
  const owner = new AbortController();
  const sounds = new NotificationSounds({
    read: async () => assert.fail('must remain paused'),
    play: failed,
  });
  sounds.setPaused(true);
  for (let i = 0; i < 32; i++) sounds.enqueue(String(i), () => true, failed, owner.signal);
  assert.equal(getEventListeners(owner.signal, 'abort').length, 1);
  owner.abort();
  assert.equal(sounds.pending.length, 0);
  assert.equal(getEventListeners(owner.signal, 'abort').length, 0);
  sounds.setPaused(false);
  await turn();
  sounds.dispose();
});

test('mute during a delayed read cannot detach the listener of a new sound after unmuting', async () => {
  let release;
  const owner = new AbortController(),
    events = [];
  const sounds = new NotificationSounds({
    read: (file) =>
      file === 'old'
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve(Buffer.from(file)),
    play: async (bytes, signal, before) => {
      before();
      if (!signal.aborted) events.push(String(bytes));
    },
  });
  sounds.enqueue('old', () => true, failed, owner.signal);
  sounds.setPaused(true);
  sounds.setEnabled(false);
  sounds.setEnabled(true);
  sounds.enqueue('new', () => true, failed, owner.signal);
  assert.equal(getEventListeners(owner.signal, 'abort').length, 1);
  release(Buffer.from('old'));
  await turn();
  assert.equal(getEventListeners(owner.signal, 'abort').length, 1);
  owner.abort();
  sounds.setPaused(false);
  await turn();
  assert.deepEqual(events, []);
  assert.equal(getEventListeners(owner.signal, 'abort').length, 0);
  sounds.dispose();
});

test('lock before playback preserves owner cancellation through requeue and rejects stopped owners', async () => {
  let release;
  const owner = new AbortController();
  const sounds = new NotificationSounds({
    read: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    play: failed,
  });
  sounds.enqueue('locked', () => true, failed, owner.signal);
  sounds.setPaused(true);
  release(Buffer.alloc(0));
  await turn();
  assert.equal(sounds.pending.length, 1);
  assert.equal(getEventListeners(owner.signal, 'abort').length, 1);
  owner.abort();
  sounds.enqueue('stopped', () => true, failed, owner.signal);
  assert.equal(sounds.pending.length, 0);
  sounds.dispose();
});
