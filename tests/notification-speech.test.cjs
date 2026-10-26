const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const {
  parseNotificationPreferences,
  resolveNotificationSpeech,
} = require('../out/main/shared/notification-types');
const { NotificationService } = require('../out/main/main/core/notification-service');
const { TypedNotifications } = require('../out/main/main/core/typed-notifications');
const { NotificationSpeechService } = require('../out/main/main/core/notification-speech');
const { NotificationAvailability } = require('../out/main/main/core/notification-availability');
const { TtsService } = require('../out/main/main/core/tts-service');
const wait = async (f) => {
  for (let i = 0; i < 400; i++) {
    if (f()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error('timeout');
};
const wave = () => {
  const b = Buffer.alloc(204);
  b.write('RIFF');
  b.writeUInt32LE(196, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(160, 40);
  return b;
};
const owner = { ownerKind: 'applet', ownerId: 'fixture.speech' };
const definition = {
  typeId: 'message',
  title: 'Message',
  description: 'fixture',
  levels: ['info'],
  defaultLevel: 'info',
  defaultEnabled: true,
  canDisable: true,
  disabledControlReason: '',
  allowedTargets: ['banner', 'desktop', 'windows'],
  defaultTargets: [],
  requiredTargets: [],
  lifetimePolicy: 'userDuration',
  defaultDurationSeconds: 1,
  history: 'none',
};
function setup(t, extra = {}) {
  const dir = fs.mkdtempSync(path.resolve('.artifacts/notification-speech-unit-'));
  const settings = createDefaultSettings();
  settings.tts = {
    ...settings.tts,
    baseUrl: 'http://localhost:8080/v1',
    model: 'model',
    defaultVoice: 'common',
    speedMode: 'server',
  };
  settings.notificationPreferences = { overrides: [{ ...owner, typeId: 'message', speak: true }] };
  let generation = 'run1',
    ready = true,
    accepts = true,
    speech;
  const posts = [],
    played = [],
    failed = [];
  const service = new NotificationService();
  const availability = new NotificationAvailability({
    query: async () => accepts,
    close: () => {},
    failed: () => failed.push('query'),
  });
  const tts = new TtsService({
    settings: () => settings.tts,
    key: () => undefined,
    canUse: (owner) => owner === 'host' || speech?.allows(owner),
    fetcher: async (u, o) => {
      posts.push(JSON.parse(o.body));
      return new Response(wave(), { headers: { 'Content-Type': 'audio/wav' } });
    },
    play: async (b, d, s, sp, guard) => {
      guard?.();
      played.push(sp);
    },
    ...extra.tts,
  });
  const applet = {
    id: owner.ownerId,
    displayName: 'Speech fixture',
    state: 'running',
    notificationTypes: [definition],
    capabilities: ['notifications'],
  };
  speech = new NotificationSpeechService({
    settings: () => settings,
    applets: () => [applet],
    generation: () => generation,
    ready: () => ready,
    service,
    tts,
    availability,
    failed: (id, code) => failed.push(code),
    startMs: extra.startMs,
  });
  const typed = new TypedNotifications(service, {
    settings: () => settings,
    applets: () => [applet],
    generation: () => generation,
    changed: () => {},
    policyChanged: () => {},
    published: (e) => speech.publish(e),
  });
  t.after(async () => {
    speech.dispose();
    availability.dispose();
    typed.dispose();
    service.dispose();
    await tts.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    settings,
    tts,
    speech,
    typed,
    service,
    availability,
    posts,
    played,
    failed,
    publish: (key = 'episode', extra = {}) =>
      typed.publish(
        owner,
        'message',
        { title: ' Title ', body: 'Body\n text', level: 'info', dedupeKey: key, ...extra },
        generation,
      ),
    reconcile: () => {
      speech.reconcile();
      tts.reconcile();
      typed.reconcile();
    },
    ready: (v) => {
      ready = v;
      speech.reconcile();
    },
    stop: () => {
      generation = undefined;
      speech.reconcile();
      tts.reconcile();
      typed.reconcile();
    },
    suppress: async (v) => {
      accepts = !v;
      await availability.check();
    },
  };
}
test('notification speech settings inherit independently and reject invalid or secret fields', () => {
  const s = createDefaultSettings();
  assert.deepEqual(parseNotificationPreferences(), { overrides: [] });
  assert.deepEqual(resolveNotificationSpeech(s), { voice: '', speed: 1 });
  s.tts.defaultVoice = 'common';
  s.tts.defaultSpeed = 1.2;
  s.notificationPreferences = { overrides: [], speech: { voice: 'UPPER' } };
  assert.deepEqual(resolveNotificationSpeech(s), { voice: 'UPPER', speed: 1.2 });
  s.notificationPreferences.speech = { speed: 1.8 };
  assert.deepEqual(resolveNotificationSpeech(s), { voice: 'common', speed: 1.8 });
  for (const speech of [
    { voice: '' },
    { voice: null },
    { speed: 0 },
    { speed: NaN },
    { speed: 4.1 },
    { baseUrl: 'http://other' },
    { apiKey: 'secret' },
  ])
    assert.throws(() => parseNotificationPreferences({ overrides: [], speech }));
  assert.throws(() =>
    parseNotificationPreferences({ overrides: [{ ...owner, typeId: 'message', speak: 1 }] }),
  );
  assert.equal(
    parseNotificationPreferences({
      overrides: [{ ...owner, typeId: 'message', speak: true, durationSeconds: null }],
    }).overrides[0].speak,
    true,
  );
});
test('new notifications speak once across dedupe, timer restart, reads and target changes; recurrence speaks again', async (t) => {
  const f = setup(t);
  const a = f.publish();
  await wait(() => f.posts.length === 1 && f.played.length === 1);
  f.publish('episode', { body: 'changed', restartTimer: true });
  f.service.centerEntries();
  f.settings.notificationPreferences.overrides[0].targets = ['banner', 'desktop'];
  f.reconcile();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.posts.length, 1);
  f.typed.end(owner, a.notificationId, 'run1');
  f.publish();
  await wait(() => f.posts.length === 2);
  assert.equal(f.posts[0].input, 'Title。Body text');
});
test('off to on never reads old notices and failed TTS does not reject or hide delivery', async (t) => {
  const f = setup(t, { tts: { fetcher: async () => new Response('{}', { status: 500 }) } });
  f.settings.notificationPreferences.overrides[0].speak = false;
  const a = f.publish();
  f.settings.notificationPreferences.overrides[0].speak = true;
  f.reconcile();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.failed.length, 0);
  const b = f.publish('new');
  assert.equal(b.status, 'accepted');
  await wait(() => f.failed.includes('TTS_SERVER_ERROR'));
  assert.equal(f.service.list().find((i) => i.id === b.notificationId).status, 'active');
  assert.equal(f.service.list().find((i) => i.id === a.notificationId).status, 'active');
});
test('startup preserves captured voice and speed and expiry permits speech; generation stop cancels after expiry', async (t) => {
  let resolvePlay;
  const f = setup(t, {
    tts: {
      play: async (b, d, s, sp, guard) => {
        guard?.();
        await new Promise((r) => {
          resolvePlay = r;
          s.addEventListener('abort', r, { once: true });
        });
      },
    },
  });
  f.ready(false);
  f.settings.notificationPreferences.speech = { voice: 'notice', speed: 1.7 };
  const a = f.publish();
  f.settings.notificationPreferences.speech = { voice: 'next', speed: 2 };
  f.service.end('applet.' + owner.ownerId, a.notificationId, 'resolved');
  f.ready(true);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.posts.length, 0);
  f.ready(false);
  const b = f.publish('expire');
  await new Promise((r) => setTimeout(r, 1050));
  assert.equal(
    f.service.list().find((i) => i.id === b.notificationId),
    undefined,
  );
  f.settings.notificationPreferences.speech = { voice: 'later', speed: 3 };
  f.ready(true);
  await wait(() => f.posts.length === 1 && resolvePlay);
  assert.equal(f.posts[0].voice, 'next');
  assert.equal(f.posts[0].speed, 2);
  f.stop();
  await wait(() => !f.speech.allows('notification:' + b.notificationId));
  resolvePlay();
});
test('suppression cancels running generation and does not replay on resume even without desktop target', async (t) => {
  let aborted = false;
  const f = setup(t, {
    tts: {
      fetcher: async (u, o) =>
        await new Promise((r, j) =>
          o.signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              j(Error('abort'));
            },
            { once: true },
          ),
        ),
    },
  });
  const a = f.publish();
  await wait(() => f.availability.status() === 'allowed');
  await new Promise((r) => setTimeout(r, 20));
  f.availability.setBlocked('lock', true);
  await wait(() => aborted);
  f.publish('locked');
  f.availability.setBlocked('lock', false);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.played.length, 0);
  assert(!f.speech.allows('notification:' + a.notificationId));
});
test('freshness deadline covers generation and is rechecked after late response', async (t) => {
  let release;
  const f = setup(t, {
    startMs: 25,
    tts: {
      fetcher: async () => {
        await new Promise((r) => (release = r));
        return new Response(wave(), { headers: { 'Content-Type': 'audio/wav' } });
      },
    },
  });
  const a = f.publish();
  await wait(() => release);
  await new Promise((r) => setTimeout(r, 40));
  release();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.played.length, 0);
  assert(!f.speech.allows('notification:' + a.notificationId));
});
test('shared TTS queue preserves notification snapshots and isolates cancellation from other owner', async (t) => {
  let release;
  const f = setup(t, {
    tts: {
      play: async (b, d, s, sp, guard) => {
        guard?.();
        await new Promise((r) => {
          release = r;
          s.addEventListener('abort', r, { once: true });
        });
      },
    },
  });
  const host = f.tts.speak('host', { text: 'manual', requestId: 'manual' });
  await wait(() => release);
  f.settings.notificationPreferences.speech = { voice: 'notice', speed: 1.5 };
  const a = f.publish();
  await wait(() => f.availability.status() === 'allowed');
  f.settings.notificationPreferences.overrides[0].speak = false;
  f.reconcile();
  assert.equal(f.tts.get('host', host.jobId).state, 'playing');
  release();
  await wait(() => f.tts.get('host', host.jobId).state === 'completed');
  assert.equal(f.posts.length, 1);
  assert(!f.speech.allows('notification:' + a.notificationId));
});
test('OS query shared lease ignores obsolete responses and stays alive while speech uses it', async () => {
  let release,
    closes = 0;
  const q = new NotificationAvailability({
    query: () => new Promise((r) => (release = r)),
    close: () => closes++,
    failed: () => {},
  });
  q.use('desktop', true);
  q.use('speech', true);
  q.use('desktop', false);
  assert.equal(closes, 0);
  q.use('speech', false);
  assert.equal(closes, 1);
  release(true);
  await new Promise((r) => setImmediate(r));
  assert.equal(q.status(), 'unknown');
  q.dispose();
});

test('global stop includes pre-TTS startup wait and does not replay on ready', async (t) => {
  const f = setup(t);
  f.ready(false);
  f.publish();
  f.speech.stopAll();
  f.ready(true);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(f.posts.length, 0);
});
test('starting playback before freshness deadline permits long playback past that deadline', async (t) => {
  let release;
  const f = setup(t, {
    startMs: 35,
    tts: {
      play: async (b, d, s, sp, guard) => {
        guard?.();
        await new Promise((r) => {
          release = r;
          s.addEventListener('abort', r, { once: true });
        });
      },
    },
  });
  const a = f.publish();
  await wait(() => release);
  await new Promise((r) => setTimeout(r, 55));
  assert(f.speech.allows('notification:' + a.notificationId));
  release();
});
