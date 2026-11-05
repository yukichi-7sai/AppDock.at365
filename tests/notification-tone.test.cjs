const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { parseNotificationPreferences } = require('../out/main/shared/notification-types');
const { NotificationToneService } = require('../out/main/main/core/notification-tone');
const { NotificationService } = require('../out/main/main/core/notification-service');
const { TypedNotifications } = require('../out/main/main/core/typed-notifications');
const { NotificationAvailability } = require('../out/main/main/core/notification-availability');
const { AudioPlaybackQueue } = require('../out/main/main/core/audio-playback');
const file = '@library/@assigned/' + 'a'.repeat(64) + '.wav';
const owner = { ownerKind: 'applet', ownerId: 'fixture.tone' };
const type = {
  typeId: 'message',
  title: 'Message',
  description: '',
  levels: ['info'],
  defaultLevel: 'info',
  allowedTargets: ['banner', 'desktop', 'windows'],
  defaultTargets: [],
  requiredTargets: [],
  lifetimePolicy: 'userDuration',
  defaultDurationSeconds: null,
  history: 'session',
};
const tick = () => new Promise(setImmediate);
async function until(check) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error('Timed out');
}
function setup(t, extra = {}) {
  const settings = createDefaultSettings();
  settings.notificationPreferences = {
    sound: { file, name: 'Chime' },
    overrides: [{ ...owner, typeId: 'message', sound: true }],
  };
  let generation = 'run1',
    ready = true,
    accepts = true,
    queued;
  const applet = {
    id: owner.ownerId,
    state: 'running',
    displayName: 'Fixture',
    capabilities: ['notifications'],
    notificationTypes: [type],
  };
  const played = [],
    reads = [],
    failures = [];
  const service = new NotificationService();
  const availability = new NotificationAvailability({
    query: async () => accepts,
    close() {},
    failed() {},
  });
  const queue = new AudioPlaybackQueue(async (request) => {
    request.beforePlay?.();
    if (request.signal.aborted) return;
    played.push(request.bytes.toString());
    await extra.player?.(request);
  });
  const tone = new NotificationToneService({
    settings: () => settings,
    applets: () => [applet],
    generation: () => generation,
    ready: () => ready,
    service,
    availability,
    read: async (ref) => {
      reads.push(ref);
      return extra.read ? extra.read(ref) : Buffer.from('chime');
    },
    play: (request) => queue.play(request),
    failed: (id, code) => failures.push(code),
    startMs: extra.startMs,
  });
  const typed = new TypedNotifications(service, {
    settings: () => settings,
    applets: () => [applet],
    generation: () => generation,
    changed() {},
    policyChanged() {},
    published: (event) => {
      if (service.isPaused()) queued = tone.publish(event);
    },
    presented: (event) => {
      queued = tone.publish(event);
    },
  });
  t.after(async () => {
    tone.dispose();
    typed.dispose();
    service.dispose();
    availability.dispose();
    await queue.close();
  });
  return {
    settings,
    played,
    reads,
    failures,
    tone,
    typed,
    service,
    queue,
    availability,
    publish: (dedupeKey = 'one', rest = {}) =>
      typed.publish(
        owner,
        'message',
        { title: 'Title', body: 'Body', level: 'info', dedupeKey, ...rest },
        generation,
      ),
    queued: () => queued,
    ready: (value) => {
      ready = value;
      tone.reconcile();
    },
    stop: () => {
      generation = undefined;
      tone.reconcile();
      typed.reconcile();
    },
    suppress: async (value) => {
      accepts = !value;
      await availability.check();
    },
  };
}
test('sound preferences are optional, preserve unknown types and reject unsafe or incomplete selection', () => {
  assert.deepEqual(parseNotificationPreferences(undefined), { overrides: [] });
  const value = {
    sound: { file, name: 'Chime' },
    overrides: [{ ...owner, typeId: 'message', sound: true }],
  };
  assert.deepEqual(parseNotificationPreferences(value), value);
  for (const sound of [
    null,
    { file },
    { file: 'C:\\private.wav', name: 'bad' },
    { file, name: '' },
    { file, name: 'x', extra: 1 },
  ])
    assert.throws(() => parseNotificationPreferences({ ...value, sound }));
  assert.throws(() =>
    parseNotificationPreferences({ overrides: [{ ...value.overrides[0], sound: 'true' }] }),
  );
});
test('sound is independent of visual targets, plays once per episode and suppresses the Windows sound', async (t) => {
  const f = setup(t);
  const first = f.publish();
  await until(() => f.played.length === 1);
  assert.equal(f.service.windowsOptions(first.notificationId).silent, true);
  f.publish('one', { body: 'Updated', restartTimer: true });
  f.settings.notificationPreferences.overrides[0].targets = ['banner', 'windows'];
  f.typed.reconcile();
  await tick();
  assert.deepEqual(f.played, ['chime']);
  f.typed.end(owner, first.notificationId, 'run1');
  f.publish();
  await until(() => f.played.length === 2);
});
test('default OFF, no selection and global mute do not replay old notices when enabled', async (t) => {
  for (const mode of ['default', 'none', 'mute']) {
    const f = setup(t);
    if (mode === 'default') delete f.settings.notificationPreferences.overrides[0].sound;
    if (mode === 'none') delete f.settings.notificationPreferences.sound;
    if (mode === 'mute') f.settings.host.soundEnabled = false;
    const first = f.publish();
    await tick();
    assert.equal(f.reads.length, 0);
    if (mode !== 'mute') assert.equal(f.service.windowsOptions(first.notificationId).silent, false);
    f.settings.host.soundEnabled = true;
    f.settings.notificationPreferences.sound = { file, name: 'Chime' };
    f.settings.notificationPreferences.overrides[0].sound = true;
    f.tone.reconcile();
    f.publish('one');
    await tick();
    assert.equal(f.played.length, 0);
    f.publish('new');
    await until(() => f.played.length === 1);
  }
});
test('sound admission precedes speech bytes in the shared FIFO even while file reading waits', async (t) => {
  let read;
  const f = setup(t, {
    read: () =>
      new Promise((resolve) => {
        read = resolve;
      }),
  });
  f.publish();
  const speech = f
    .queued()
    .then(() => f.queue.play({ bytes: Buffer.from('speech'), playbackTimeoutMs: 1000 }));
  await until(() => read);
  assert.equal(f.played.length, 0);
  read(Buffer.from('chime'));
  await speech;
  assert.deepEqual(f.played, ['chime', 'speech']);
});
test('lock holds new notices, discards resolved ones and starts only surviving notices on unlock', async (t) => {
  const f = setup(t);
  f.service.setPaused(true);
  const ended = f.publish('ended');
  f.publish('live');
  f.typed.end(owner, ended.notificationId, 'run1');
  await tick();
  assert.equal(f.played.length, 0);
  f.service.setPaused(false);
  await until(() => f.played.length === 1);
});

test('global mute while locked discards deferred sound even when re-enabled before unlock', async (t) => {
  const f = setup(t);
  f.service.setPaused(true);
  f.publish();
  f.settings.host.soundEnabled = false;
  f.tone.reconcile();
  f.settings.host.soundEnabled = true;
  f.tone.reconcile();
  f.service.setPaused(false);
  await tick();
  assert.equal(f.played.length, 0);
});
test('type OFF, source stop, resolved notice, missing selection, lock and global mute cancel pending reads', async (t) => {
  for (const reason of ['off', 'stop', 'end', 'none', 'lock', 'mute']) {
    let read;
    const f = setup(t, {
      read: () =>
        new Promise((resolve) => {
          read = resolve;
        }),
    });
    const notice = f.publish();
    await until(() => read);
    if (reason === 'off') f.settings.notificationPreferences.overrides[0].sound = false;
    if (reason === 'stop') f.stop();
    if (reason === 'end') f.typed.end(owner, notice.notificationId, 'run1');
    if (reason === 'none') delete f.settings.notificationPreferences.sound;
    if (reason === 'lock') f.availability.setPaused(true);
    if (reason === 'mute') f.settings.host.soundEnabled = false;
    f.tone.reconcile();
    await f.queued();
    read(Buffer.from('chime'));
    await tick();
    assert.equal(f.played.length, 0, reason);
    assert.equal(f.failures.length, 0, reason);
  }
});
test('active playback is canceled on OFF without replay, while natural visual expiry does not cancel it', async (t) => {
  let signal;
  const f = setup(t, {
    player: (request) =>
      new Promise((resolve) => {
        signal = request.signal;
        signal.addEventListener('abort', resolve, { once: true });
      }),
  });
  const notice = f.publish();
  await until(() => signal);
  f.service.end('applet.' + owner.ownerId, notice.notificationId, 'expired');
  assert.equal(signal.aborted, false);
  f.settings.notificationPreferences.overrides[0].sound = false;
  f.tone.reconcile();
  assert.equal(signal.aborted, true);
  f.settings.notificationPreferences.overrides[0].sound = true;
  f.tone.reconcile();
  await tick();
  assert.equal(f.played.length, 1);
});
test('OS suppression, start expiry and failures release the speech barrier without retrying or recursive notices', async (t) => {
  const blocked = setup(t);
  blocked.availability.setBlocked('fullscreen', true);
  blocked.publish();
  await blocked.queued();
  blocked.availability.setBlocked('fullscreen', false);
  await tick();
  assert.equal(blocked.played.length, 0);
  const expired = setup(t, { startMs: 20 });
  expired.ready(false);
  expired.publish();
  await expired.queued();
  expired.ready(true);
  await tick();
  assert.equal(expired.played.length, 0);
  const failed = setup(t, {
    read: async () => {
      throw Error('private file');
    },
  });
  failed.publish();
  await failed.queued();
  failed.tone.reconcile();
  assert.deepEqual(failed.failures, ['NOTIFICATION_SOUND_FAILED']);
  assert.equal(failed.service.list().length, 1);
});
