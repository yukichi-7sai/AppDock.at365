const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path');
const { TtsService, waveDuration } = require('../out/main/main/core/tts-service');
const { TtsSecrets } = require('../out/main/main/core/tts-secrets');
const { parseTtsSettings, defaultTtsSettings } = require('../out/main/shared/tts');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { SettingsStore } = require('../out/main/main/core/settings');
fs.mkdirSync(path.resolve('.artifacts/tts-implementation'), { recursive: true });
function wave(seconds = 0.02) {
  const data = Math.ceil(seconds * 8000) * 2,
    b = Buffer.alloc(44 + data);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(data, 40);
  return b;
}
const wait = async (fn) => {
  for (let i = 0; i < 300; i++) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error('wait timed out');
};
function setup(t, extra = {}) {
  let config = {
      ...defaultTtsSettings(),
      baseUrl: 'http://localhost:8080/v1',
      model: 'model',
      defaultVoice: 'voice',
    },
    allowed = true;
  const posts = [];
  const s = new TtsService({
    settings: () => config,
    key: () => undefined,
    canUse: () => allowed,
    play: async () => {},
    fetcher: async (u, o) => {
      posts.push({ u, o });
      return new Response(wave(), { headers: { 'Content-Type': 'audio/wav' } });
    },
    ...extra,
    play: async (b, d, signal, speed, beforePlay) => {
      beforePlay?.();
      await extra.play?.(b, d, signal, speed, beforePlay);
    },
  });
  t.after(() => s.close());
  return {
    s,
    posts,
    config: (v) => {
      config = { ...config, ...v };
      s.reconcile();
    },
    deny: () => {
      allowed = false;
      s.reconcile();
    },
  };
}
const input = (id, text = '本文') => ({ text, requestId: id });
test('TTS settings validate endpoints, secrets exclusion, voice list and speed', () => {
  assert.equal(parseTtsSettings().defaultSpeed, 1);
  assert.equal(
    parseTtsSettings({ baseUrl: 'http://host:8080/v1/' }).baseUrl,
    'http://host:8080/v1',
  );
  for (const v of [
    { baseUrl: 'https://user:key@host/v1' },
    { baseUrl: 'http://host/v1?key=x' },
    { baseUrl: 'file:///x' },
    { voicesPath: '../voices' },
    { voicesPath: '%2e%2e/voices' },
    { voicesPath: '/voices' },
    { defaultSpeed: NaN },
    { defaultSpeed: 0 },
    { apiKey: 'secret' },
    { manualVoices: [{ id: 'x' }, { id: 'x' }] },
  ])
    assert.throws(() => parseTtsSettings(v));
});
test('WAV validation rejects corrupt, inconsistent and too long audio; supports >30s', () => {
  assert.equal(waveDuration(wave(31)), 31);
  assert.throws(
    () => waveDuration(Buffer.from('{}')),
    (e) => e.code === 'TTS_INVALID_AUDIO',
  );
  const b = wave();
  b.writeUInt32LE(1, 28);
  assert.throws(() => waveDuration(b));
  assert.throws(
    () => waveDuration(wave(601)),
    (e) => e.code === 'TTS_AUDIO_TOO_LONG',
  );
});
test('accepted jobs deduplicate, preserve default snapshot and expose no text or key', async (t) => {
  const f = setup(t),
    a = f.s.speak('a', input('1'));
  assert.equal(a.completion, 'accepted');
  assert.equal(a.state, 'queued');
  assert.equal(f.s.speak('a', input('1')).jobId, a.jobId);
  assert.throws(
    () => f.s.speak('a', input('1', 'different')),
    (e) => e.code === 'TTS_REQUEST_CONFLICT',
  );
  await wait(() => f.s.get('a', a.jobId).state === 'completed');
  assert.equal(f.posts.length, 1);
  assert.equal(JSON.parse(f.posts[0].o.body).speed, 1);
  assert.equal(f.posts[0].u, 'http://localhost:8080/v1/audio/speech');
  assert.equal(f.posts[0].o.headers.Authorization, undefined);
  f.config({ defaultVoice: 'different' });
  assert.equal(f.s.speak('a', input('1')).jobId, a.jobId);
  assert.throws(
    () => f.s.get('b', a.jobId),
    (e) => e.code === 'NOT_FOUND',
  );
  assert(!JSON.stringify(f.s.get('a', a.jobId)).includes('本文'));
});
test('input validation, capacity, queued stop and ordered playback', async (t) => {
  let release;
  const order = [];
  const f = setup(t, {
    limits: { capacity: 2 },
    play: async (_b, _s, signal) => {
      order.push('play');
      await new Promise((r) => {
        release = r;
        signal.addEventListener('abort', r, { once: true });
      });
    },
  });
  for (const bad of [
    { text: ' ', requestId: 'x' },
    { text: 'x'.repeat(4097), requestId: 'x' },
    { text: 'x', requestId: 'x', speed: Infinity },
    { text: 'x', requestId: 'x', voice: '' },
    { text: 'x', requestId: 'x', url: 'http://other' },
  ])
    assert.throws(
      () => f.s.speak('a', bad),
      (e) => e.code === 'INVALID_ARGUMENT',
    );
  const a = f.s.speak('a', input('a')),
    b = f.s.speak('a', input('b'));
  assert.throws(
    () => f.s.speak('a', input('c')),
    (e) => e.code === 'TTS_QUEUE_FULL',
  );
  await wait(() => f.s.get('a', a.jobId).state === 'playing');
  await f.s.stop('a', b.jobId);
  assert.equal(f.s.get('a', b.jobId).state, 'canceled');
  release();
  await wait(() => f.s.get('a', a.jobId).state === 'completed');
  assert.equal(order.length, 1);
});
test('revocation stops playback and canceled late completion never becomes completed', async (t) => {
  const f = setup(t, {
    play: async (_b, _s, signal) =>
      new Promise((r) => signal.addEventListener('abort', r, { once: true })),
  });
  const a = f.s.speak('a', input('a'));
  await wait(() => f.s.get('a', a.jobId).state === 'playing');
  f.deny();
  await wait(() => f.s.get('a', a.jobId).state === 'canceled');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(f.s.get('a', a.jobId).state, 'canceled');
  assert.throws(
    () => f.s.speak('a', input('b')),
    (e) => e.code === 'API_DISABLED',
  );
});
test('setting changes cancel queued and generating jobs while allowing received playback', async (t) => {
  const f = setup(t, {
    play: async (_b, _s, signal) =>
      new Promise((r) => signal.addEventListener('abort', r, { once: true })),
  });
  const a = f.s.speak('a', input('a'));
  await wait(() => f.s.get('a', a.jobId).state === 'playing');
  const b = f.s.speak('a', input('b'));
  f.config({ model: 'new' });
  assert.equal(f.s.get('a', a.jobId).state, 'playing');
  assert.equal(f.s.get('a', b.jobId).state, 'canceled');
  await f.s.stop('a', a.jobId);
  const g = setup(t, {
    fetcher: async (_u, o) =>
      new Promise((_, reject) =>
        o.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }),
      ),
  });
  const c = g.s.speak('a', input('c'));
  await wait(() => g.s.get('a', c.jobId).state === 'generating');
  g.config({ model: 'new' });
  assert.equal(g.s.get('a', c.jobId).state, 'canceled');
});
test('generation timeout fails and does not replay automatically', async (t) => {
  const f = setup(t, {
    limits: { generationMs: 15 },
    fetcher: async (_u, o) =>
      new Promise((_, reject) =>
        o.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }),
      ),
  });
  const a = f.s.speak('a', input('a'));
  await wait(() => f.s.get('a', a.jobId).state === 'failed');
  assert.equal(f.s.get('a', a.jobId).error.code, 'TTS_TIMEOUT');
});
test('queue deadline expires; failed generation does not block next job', async (t) => {
  const f = setup(t, {
    limits: { queueMs: 10 },
    play: async (_b, _s, signal) =>
      new Promise((r) => signal.addEventListener('abort', r, { once: true })),
  });
  const a = f.s.speak('a', input('a'));
  await wait(() => f.s.get('a', a.jobId).state === 'playing');
  const b = f.s.speak('a', input('b'));
  await wait(() => f.s.get('a', b.jobId).state === 'failed');
  assert.equal(f.s.get('a', b.jobId).error.code, 'TTS_QUEUE_TIMEOUT');
  await f.s.stop('a', a.jobId);
  let n = 0;
  const g = setup(t, {
    fetcher: async () =>
      ++n === 1
        ? new Response('private text', { status: 500 })
        : new Response(wave(), { headers: { 'Content-Type': 'audio/wav' } }),
  });
  const c = g.s.speak('a', input('c')),
    d = g.s.speak('a', input('d'));
  await wait(() => g.s.get('a', d.jobId).state === 'completed');
  assert.equal(g.s.get('a', c.jobId).error.code, 'TTS_SERVER_ERROR');
  assert(!JSON.stringify(g.s.get('a', c.jobId)).includes('private text'));
});
test('HTTP status, content and streaming byte limits become safe errors', async (t) => {
  for (const [response, code] of [
    [() => new Response('secret', { status: 401 }), 'TTS_AUTH_FAILED'],
    [() => new Response('secret', { status: 403 }), 'TTS_AUTH_FAILED'],
    [() => new Response('secret', { status: 429 }), 'TTS_RATE_LIMITED'],
    [
      () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
      'TTS_INVALID_AUDIO',
    ],
    [
      () => new Response(Buffer.alloc(100), { headers: { 'Content-Type': 'audio/wav' } }),
      'TTS_AUDIO_TOO_LARGE',
    ],
  ]) {
    const f = setup(t, { limits: { audioBytes: 80 }, fetcher: async () => response() });
    const a = f.s.speak('a', input('a'));
    await wait(() => f.s.get('a', a.jobId).state === 'failed');
    assert.equal(f.s.get('a', a.jobId).error.code, code);
  }
});
test('voice list distinguishes empty, manual, unsupported, bad schema and revoked fetch', async (t) => {
  const f = setup(t, { fetcher: async () => Response.json({ voices: [] }) });
  assert.deepEqual(await f.s.voices('a'), { voices: [], source: 'endpoint' });
  f.config({ voicesSource: 'manual', manualVoices: [{ id: 'x', name: 'X' }] });
  assert.equal((await f.s.voices('a')).voices[0].id, 'x');
  for (const [response, code] of [
    [() => new Response('', { status: 404 }), 'TTS_VOICES_UNSUPPORTED'],
    [() => new Response('', { status: 401 }), 'TTS_AUTH_FAILED'],
    [() => Response.json({ voices: [{ id: 'x' }, { id: 'x' }] }), 'TTS_INVALID_VOICES'],
  ]) {
    const g = setup(t, { fetcher: async () => response() });
    await assert.rejects(g.s.voices('a'), (e) => e.code === code);
  }
  const g = setup(t, {
    fetcher: async (_u, o) =>
      new Promise((_, reject) =>
        o.signal.addEventListener('abort', () => reject(Error()), { once: true }),
      ),
  });
  const pending = g.s.voices('a');
  g.deny();
  await assert.rejects(pending, (e) => e.code === 'TTS_TIMEOUT');
});
test('expired completion records become NOT_FOUND and do not persist across restart', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const f = setup(t, { limits: { retentionMs: 15 } }),
    a = f.s.speak('a', input('a'));
  await wait(() => f.s.get('a', a.jobId).state === 'completed');
  now += 14;
  assert.equal(f.s.get('a', a.jobId).state, 'completed');
  now += 1;
  assert.throws(
    () => f.s.get('a', a.jobId),
    (e) => e.code === 'NOT_FOUND',
  );
  const restarted = setup(t);
  assert.throws(
    () => restarted.s.get('a', a.jobId),
    (e) => e.code === 'NOT_FOUND',
  );
});
test('keys are encrypted, bound to endpoint, never fall back to plaintext and deletable', (t) => {
  const dir = fs.mkdtempSync(path.resolve('.artifacts/tts-implementation/secrets-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'tts-key.json');
  const keys = new TtsSecrets(file, {
    encrypt: (s) => 'encrypted:' + Buffer.from(s).toString('base64'),
    decrypt: (s) => Buffer.from(s.slice(10), 'base64').toString(),
  });
  keys.set('http://host/v1', 'secret-value');
  assert(!fs.readFileSync(file, 'utf8').includes('secret-value'));
  assert.equal(keys.get('http://host/v1/'), 'secret-value');
  assert.equal(keys.get('http://other/v1'), undefined);
  assert.throws(() => keys.set('http://host/v1', 'x\ny'));
  keys.set('http://host/v1', '');
  assert(!fs.existsSync(file));
  const denied = new TtsSecrets(file, {
    encrypt: () => {
      throw Error('unavailable');
    },
    decrypt: () => '',
  });
  assert.throws(() => denied.set('http://host/v1', 'secret'));
  assert(!fs.existsSync(file));
});
test('common dispatcher publishes four tools and enforces dedicated permissions and owner', async (t) => {
  const dir = fs.mkdtempSync(path.resolve('.artifacts/tts-implementation/api-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  const f = setup(t);
  let grants = { read: true, execute: true };
  const api = new AppDockApi({
    settings: store,
    save: (v, r) => store.save(v, r),
    commands: () => [],
    applets: () => [],
    execute: async () => {},
    version: 'test',
    instanceId: 'test',
    ready: () => true,
    executable: () => true,
    writable: () => false,
    appletPermissions: () => grants,
    handlers: {
      'tts.speak': async (p, id) => f.s.speak(id ?? 'mcp', p),
      'tts.jobs.get': async (p, id) => ({ ...f.s.get(id ?? 'mcp', p.jobId) }),
    },
  });
  assert.throws(
    () => api.call('tts.speak', input('a'), 'a'),
    (e) => e.code === 'API_DISABLED',
  );
  grants.useTts = true;
  const job = await api.call('tts.speak', input('a'), 'a');
  await assert.rejects(
    api.call('tts.jobs.get', { jobId: job.jobId }, 'b'),
    (e) => e.code === 'NOT_FOUND',
  );
  assert.throws(
    () => api.call('tts.speak', input('b')),
    (e) => e.code === 'API_DISABLED',
  );
});
test('real HTTP redirect is not followed and request uses configured authentication', async (t) => {
  let redirected = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/v1/audio/speech') {
      assert.equal(req.headers.authorization, 'Bearer test-key');
      res.writeHead(302, { Location: '/target' });
      res.end();
    } else {
      redirected++;
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const f = setup(t, {
    settings: () => ({
      ...defaultTtsSettings(),
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      model: 'm',
      defaultVoice: 'v',
    }),
    key: () => 'test-key',
    fetcher: fetch,
  });
  const a = f.s.speak('a', input('a'));
  await wait(() => f.s.get('a', a.jobId).state === 'failed');
  assert.equal(redirected, 0);
  assert.equal(f.s.get('a', a.jobId).error.code, 'TTS_CONNECTION_FAILED');
});
module.exports = { wave };
test('playback/server speed modes apply speed exactly once', async (t) => {
  for (const mode of ['playback', 'server']) {
    let sent, played;
    const f = setup(t, {
      settings: () => ({
        ...defaultTtsSettings(),
        baseUrl: 'http://host/v1',
        model: 'm',
        defaultVoice: 'v',
        speedMode: mode,
      }),
      fetcher: async (_u, o) => {
        sent = JSON.parse(o.body).speed;
        return new Response(wave(), { headers: { 'Content-Type': 'audio/wav' } });
      },
      play: async (_b, _d, _signal, speed) => {
        played = speed;
      },
    });
    const job = f.s.speak('a', { ...input(mode), speed: 1.4 });
    await wait(() => f.s.get('a', job.jobId).state === 'completed');
    assert.equal(sent, mode === 'server' ? 1.4 : 1);
    assert.equal(played, mode === 'playback' ? 1.4 : 1);
  }
});

test('model discovery preserves base path and endpoint-bound auth without requiring a model', async (t) => {
  const requests = [];
  const f = setup(t, {
    key: (url) => (url === 'http://localhost:8080/v1' ? 'fixture-key' : undefined),
    fetcher: async (url, options) => {
      requests.push({ url, options });
      return Response.json({
        data: [
          { id: 'speech-a', object: 'model' },
          { id: 'speech-b', name: 'Voice model' },
        ],
      });
    },
  });
  f.config({ model: '' });
  assert.deepEqual(await f.s.models('host'), {
    models: [
      { id: 'speech-a', name: 'speech-a' },
      { id: 'speech-b', name: 'Voice model' },
    ],
  });
  assert.equal(requests[0].url, 'http://localhost:8080/v1/models');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer fixture-key');
  assert.equal(requests[0].options.redirect, 'error');
  f.config({ baseUrl: 'http://localhost:8081/api/v1' });
  await f.s.models('host');
  assert.deepEqual(requests[1].options.headers, {});
});

test('model discovery distinguishes empty, unsupported, auth and malformed responses', async (t) => {
  const f = setup(t, { fetcher: async () => Response.json({ data: [] }) });
  assert.deepEqual(await f.s.models('host'), { models: [] });
  for (const [reply, code] of [
    [() => new Response('', { status: 404 }), 'TTS_MODELS_UNSUPPORTED'],
    [() => new Response('', { status: 405 }), 'TTS_MODELS_UNSUPPORTED'],
    [() => new Response('PRIVATE RESPONSE', { status: 401 }), 'TTS_AUTH_FAILED'],
    [() => Response.json({ data: [{ id: 'a' }, { id: 'a' }] }), 'TTS_INVALID_MODELS'],
    [() => Response.json({ data: [{ id: '' }] }), 'TTS_INVALID_MODELS'],
    [() => Response.json({ voices: [] }), 'TTS_INVALID_MODELS'],
    [
      () => new Response('PRIVATE RESPONSE', { headers: { 'Content-Type': 'text/html' } }),
      'TTS_INVALID_MODELS',
    ],
  ]) {
    const g = setup(t, { fetcher: async () => reply() });
    await assert.rejects(
      g.s.models('host'),
      (e) => e.code === code && !e.message.includes('PRIVATE RESPONSE'),
    );
  }
  const large = setup(t, {
    limits: { voiceBytes: 10 },
    fetcher: async () => Response.json({ data: [{ id: 'too-long' }] }),
  });
  await assert.rejects(large.s.models('host'), (e) => e.code === 'TTS_INVALID_MODELS');
});

test('model requests coalesce per owner, remain independent from voices and cancel on reconfiguration or close', async (t) => {
  for (const end of ['config', 'deny', 'close', 'key']) {
    let calls = 0;
    const f = setup(t, {
      fetcher: async (url, options) => {
        calls++;
        if (url.endsWith('/audio/voices')) return Response.json({ voices: [{ id: 'voice' }] });
        return new Promise((_, reject) =>
          options.signal.addEventListener('abort', () => reject(Error('cancel')), { once: true }),
        );
      },
    });
    const pending = f.s.models('host');
    assert.equal(f.s.models('host'), pending);
    assert.equal((await f.s.voices('host')).voices.length, 1);
    assert.equal(calls, 2);
    if (end === 'config') f.config({ baseUrl: 'http://localhost:9000/v1' });
    if (end === 'deny') f.deny();
    if (end === 'close') void f.s.close();
    if (end === 'key') f.s.reconcile(true);
    await assert.rejects(pending, (e) => e.code === 'TTS_TIMEOUT');
  }
});

test('model request deadline aborts the request', async (t) => {
  const f = setup(t, {
    limits: { voicesMs: 10 },
    fetcher: async (_url, options) =>
      new Promise((_, reject) =>
        options.signal.addEventListener('abort', () => reject(Error()), { once: true }),
      ),
  });
  await assert.rejects(f.s.models('host'), (e) => e.code === 'TTS_TIMEOUT');
});

test('Qwen model catalogs offer downloaded models using their server names', async (t) => {
  const f = setup(t, {
    fetcher: async () =>
      Response.json({
        models: [
          { name: '1.7B-Base', downloaded: true, repo_id: 'repo-a' },
          { name: '0.6B-Base', downloaded: false },
          { id: 'other', name: 'Other model' },
        ],
      }),
  });
  assert.deepEqual(await f.s.models('host'), {
    models: [
      { id: '1.7B-Base', name: '1.7B-Base' },
      { id: 'other', name: 'Other model' },
    ],
  });
  for (const models of [
    [{ name: 'bad', downloaded: 'yes' }],
    [{ name: 'same' }, { name: 'same' }],
    [null],
  ]) {
    const g = setup(t, { fetcher: async () => Response.json({ models }) });
    await assert.rejects(g.s.models('host'), (e) => e.code === 'TTS_INVALID_MODELS');
  }
});
