const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path');
const { TtsService, waveDuration, finalizeTtsWave } = require('../out/main/main/core/tts-service');
const { TtsSecrets } = require('../out/main/main/core/tts-secrets');
const {
  parseTtsSettings,
  defaultTtsSettings,
  applyTtsPreset,
  isTtsPresetCustomized,
  ttsPresetIds,
} = require('../out/main/shared/tts');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { ttsSpeechRequest } = require('../out/main/shared/tts-request');
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

test('generation retains long input and large PCM audio without receipt or decoded byte caps', async (t) => {
  const data = 65 * 1024 * 1024,
    audio = Buffer.alloc(44 + data);
  wave().copy(audio, 0, 0, 44);
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.writeUInt16LE(2, 22);
  audio.writeUInt32LE(192000, 24);
  audio.writeUInt32LE(384000, 28);
  audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(8, 34);
  audio.writeUInt32LE(data, 40);
  const text = 'speech'.repeat(2000);
  let received;
  const f = setup(t, {
    fetcher: async (_url, init) => {
      received = JSON.parse(init.body);
      return new Response(audio, { headers: { 'content-type': 'audio/wav' } });
    },
  });
  const result = await f.s.generate('host', { text }, new AbortController().signal);
  assert.equal(received.input, text);
  assert.deepEqual(result.bytes, audio);
  assert.equal(result.seconds, data / 384000);
});
const wait = async (fn) => {
  for (let i = 0; i < 300; i++) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error('wait timed out');
};
test('explicit authentication controls speech and discovery headers and rejects missing bearer keys', async (t) => {
  let keyReads = 0;
  const requests = [];
  const f = setup(t, {
    key: () => {
      keyReads++;
      return 'fixture-secret';
    },
    fetcher: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/models')) return Response.json({ data: [] });
      if (url.endsWith('/audio/voices')) return Response.json({ voices: [] });
      return new Response(wave(), { headers: { 'Content-Type': 'audio/wav' } });
    },
  });
  for (const authentication of ['none', 'bearer']) {
    f.config({ authentication });
    const job = f.s.speak('host', { requestId: authentication, text: 'fixture' });
    await wait(() => f.s.get('host', job.jobId).state === 'completed');
    await f.s.models('host');
    await f.s.voices('host');
    for (const { options } of requests.splice(0))
      assert.equal(
        options.headers?.Authorization,
        authentication === 'bearer' ? 'Bearer fixture-secret' : undefined,
      );
    assert.equal(keyReads, authentication === 'bearer' ? 3 : 0);
  }
  const missing = setup(t);
  missing.config({ authentication: 'bearer' });
  assert.throws(() => missing.s.speak('host', { requestId: 'missing', text: 'fixture' }), {
    code: 'TTS_AUTH_FAILED',
  });
  assert.throws(() => missing.s.models('host'), { code: 'TTS_AUTH_FAILED' });
  assert.throws(() => missing.s.voices('host'), { code: 'TTS_AUTH_FAILED' });
  assert.equal(missing.posts.length, 0);
});
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
    settings: () => {
      const value = extra.settings?.() ?? config;
      return value.connections
        ? value
        : {
            connections: [{ ...value, id: 'default', name: 'Fixture' }],
            defaultConnectionId: 'default',
          };
    },
    play: async (b, d, signal, beforePlay) => {
      beforePlay?.();
      await extra.play?.(b, d, signal, beforePlay);
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
test('registered server selection binds model, voice and key while instructions remain per call', async (t) => {
  const server = (id, voice) => ({
    ...defaultTtsSettings(),
    id,
    name: 'Same name',
    baseUrl: 'http://same/v1',
    model: id,
    defaultVoice: voice,
    instructionsMode: 'json',
    alwaysInstructions: '常時',
    defaultInstructions: '既定',
  });
  const config = {
    connections: [server('first', 'voice-a'), server('second', '')],
    defaultConnectionId: 'first',
  };
  const f = setup(t, { settings: () => config, key: (value) => 'key-' + value.id });
  assert.deepEqual(f.s.connections('a'), {
    connections: [
      { id: 'first', name: 'Same name' },
      { id: 'second', name: 'Same name' },
    ],
    defaultConnectionId: 'first',
  });
  assert.equal(f.posts.length, 0);
  for (const override of [
    { voice: 'other' },
    { speed: 1.4 },
    { connectionId: '' },
    { connectionId: '../first' },
  ])
    assert.throws(() => f.s.speak('a', { ...input('invalid'), ...override }), {
      code: 'INVALID_ARGUMENT',
    });
  assert.throws(() => f.s.speak('a', { ...input('missing'), connectionId: 'missing' }), {
    code: 'NOT_FOUND',
  });
  const request = { ...input('selected'), connectionId: 'second', instructions: '今回' };
  const job = f.s.speak('a', request);
  await wait(() => f.s.get('a', job.jobId).state === 'completed');
  assert.equal(f.posts[0].o.headers.Authorization, 'Bearer key-second');
  assert.equal(config.defaultConnectionId, 'first');
  const body = JSON.parse(f.posts[0].o.body);
  assert.equal(body.model, 'second');
  assert.equal(Object.hasOwn(body, 'speed'), false);
  assert.equal(Object.hasOwn(body, 'voice'), false);
  assert.equal(body.instructions, '常時\n今回');
  assert.throws(() => f.s.speak('a', { ...request, connectionId: 'first' }), {
    code: 'TTS_REQUEST_CONFLICT',
  });
  config.connections.pop();
  assert.equal(f.s.speak('a', request).jobId, job.jobId);
  const normal = f.s.speak('a', input('normal'));
  await wait(() => f.s.get('a', normal.jobId).state === 'completed');
  assert.equal(JSON.parse(f.posts[1].o.body).voice, 'voice-a');
  assert.equal(f.posts[1].o.headers.Authorization, 'Bearer key-first');
  delete config.defaultConnectionId;
  assert.throws(() => f.s.speak('a', input('no-default')), { code: 'TTS_NOT_CONFIGURED' });
  const explicit = f.s.speak('a', {
    ...input('explicit'),
    connectionId: 'first',
    instructions: '',
  });
  await wait(() => f.s.get('a', explicit.jobId).state === 'completed');
  assert.equal(JSON.parse(f.posts[2].o.body).instructions, '常時');
  f.deny();
  assert.throws(() => f.s.connections('a'), { code: 'API_DISABLED' });
});
test('connection presets preserve identity and speech defaults; custom edits survive parsing', () => {
  const original = parseTtsSettings({
    baseUrl: 'http://local/v1',
    model: 'saved-model',
    defaultVoice: 'saved-voice',
    defaultInstructions: '穏やかに',
    alwaysInstructions: '自然な日本語で',
    manualVoices: [{ id: 'saved-voice', name: 'Saved' }],
    extraBody: { language: 'Japanese' },
  });
  for (const preset of ttsPresetIds) {
    const value = applyTtsPreset(original, preset);
    for (const key of [
      'baseUrl',
      'model',
      'defaultVoice',
      'defaultInstructions',
      'alwaysInstructions',
      'manualVoices',
      'extraBody',
    ])
      assert.deepEqual(value[key], original[key]);
    assert.equal(value.preset, preset);
    assert.equal(isTtsPresetCustomized(value), false);
  }
  const custom = parseTtsSettings({
    ...applyTtsPreset(original, 'qwen3-tts'),
    instructionsParameter: 'generation.instruct',
    speechPath: 'speech/create',
    voicesPath: 'voices',
  });
  assert.equal(isTtsPresetCustomized(custom), true);
  assert.equal(
    parseTtsSettings(JSON.parse(JSON.stringify(custom))).instructionsParameter,
    'generation.instruct',
  );
  const reset = applyTtsPreset(custom, 'qwen3-tts');
  assert.equal(reset.instructionsParameter, 'instruct');
  assert.equal(reset.defaultInstructions, '穏やかに');
  assert.equal(applyTtsPreset(custom, 'custom').instructionsParameter, 'generation.instruct');
  for (const instructionsParameter of [
    'input',
    'voice.child',
    'model',
    'speed',
    'response_format',
    '__proto__.polluted',
    'a.constructor.x',
    'a.prototype.x',
    'a..b',
    '',
    'a[0]',
    'a/b',
  ])
    assert.throws(() => parseTtsSettings({ instructionsParameter }));
  for (const value of [
    { preset: 'unknown' },
    { instructionsMode: 'unknown' },
    { defaultInstructions: null },
    { alwaysInstructions: null },
    { alwaysInstructions: 1 },
    { speechPath: '../speech' },
    { speechPath: 'https://other/speech' },
  ])
    assert.throws(() => parseTtsSettings(value));
});
test('Ollama preset fills blank voices while preserving saved selections and independent lists', () => {
  const defaults = defaultTtsSettings();
  const initial = applyTtsPreset(defaults, 'ollama');
  assert.equal(initial.defaultVoice, 'default');
  assert.deepEqual(initial.manualVoices, [{ id: 'default', name: 'default' }]);
  assert.equal(isTtsPresetCustomized(initial), false);
  assert.equal(isTtsPresetCustomized({ ...initial, manualVoices: [] }), true);
  assert.equal(isTtsPresetCustomized({ ...initial, defaultVoice: '' }), true);
  assert.equal(defaults.defaultVoice, '');
  assert.deepEqual(defaults.manualVoices, []);
  initial.manualVoices[0].name = 'custom label';
  assert.equal(applyTtsPreset(defaults, 'ollama').manualVoices[0].name, 'default');
  const selected = applyTtsPreset({ ...defaults, defaultVoice: 'Zoey' }, 'ollama');
  assert.equal(selected.defaultVoice, 'Zoey');
  assert.equal(selected.manualVoices[0].id, 'default');
  const custom = applyTtsPreset(
    { ...defaults, manualVoices: [{ id: 'Freya', name: 'Saved voice' }] },
    'ollama',
  );
  assert.equal(custom.defaultVoice, 'default');
  assert.deepEqual(custom.manualVoices, [{ id: 'Freya', name: 'Saved voice' }]);
  for (const preset of ttsPresetIds.filter((id) => id !== 'ollama')) {
    const value = applyTtsPreset(defaults, preset);
    assert.equal(value.defaultVoice, '');
    assert.deepEqual(value.manualVoices, []);
  }
  assert.deepEqual(parseTtsSettings({ preset: 'ollama' }).manualVoices, []);
});
for (const preset of ['qwen3-tts', 'mlx-audio'])
  test(`${preset} maps common instructions to instruct and sends captured custom JSON`, async (t) => {
    const f = setup(t);
    const languageKey = preset === 'mlx-audio' ? 'lang_code' : 'language';
    const extraBody = {
      [languageKey]: 'Japanese',
      temperature: 0.7,
      enabled: false,
      tags: ['one', 2, null],
    };
    const config = applyTtsPreset(
      parseTtsSettings({
        baseUrl: 'http://localhost/v1',
        model: 'custom-voice',
        defaultVoice: 'Ono_Anna',
        defaultInstructions: '穏やかに',
        extraBody,
      }),
      preset,
    );
    f.config(config);
    const job = f.s.speak('a', input(preset));
    config.extraBody[languageKey] = 'English';
    await wait(() => f.s.get('a', job.jobId).state === 'completed');
    const body = JSON.parse(f.posts[0].o.body);
    assert.equal(body.instruct, '穏やかに');
    assert.equal(String(f.posts[0].u), 'http://localhost/v1/audio/speech');
    assert.equal(Object.hasOwn(body, 'instructions'), false);
    assert.equal(body[languageKey], 'Japanese');
    assert.equal(body.temperature, 0.7);
    assert.equal(body.enabled, false);
    assert.deepEqual(body.tags, ['one', 2, null]);
    if (preset === 'mlx-audio') {
      assert.deepEqual(await f.s.voices('a'), { source: 'manual', voices: [] });
      assert.equal(f.posts.length, 1, 'manual voices do not request a model-specific endpoint');
    }
    const stored = parseTtsSettings({ preset, instructionsParameter: 'instructions' });
    assert.equal(
      stored.instructionsParameter,
      'instructions',
      'explicit existing mapping is preserved',
    );
    assert.equal(applyTtsPreset(stored, preset).instructionsParameter, 'instruct');
  });
test('extra parameters merge beside nested instructions without mutating saved settings', () => {
  const connection = parseTtsSettings({
    instructionsMode: 'json',
    instructionsParameter: 'generation.instruct',
    extraBody: { language: 'Japanese', generation: { temperature: 0.6, options: [true, null] } },
  });
  const speech = { text: '本文', voice: 'voice', instructions: '静かに' };
  const first = ttsSpeechRequest(connection, speech);
  assert.deepEqual(first.body.generation, {
    temperature: 0.6,
    options: [true, null],
    instruct: '静かに',
  });
  assert.equal(connection.extraBody.generation.instruct, undefined);
  first.body.generation.options.push(false);
  const empty = ttsSpeechRequest(connection, { ...speech, instructions: '' });
  assert.deepEqual(empty.body.generation, { temperature: 0.6, options: [true, null] });
  assert.equal(empty.body.language, 'Japanese');
});
test('extra parameters reject invalid JSON values and conflicts with owned payload fields atomically', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  for (const extraBody of [
    null,
    [],
    'language=Japanese',
    { nested: undefined },
    { amount: NaN },
    { date: new Date() },
    cyclic,
    JSON.parse('{"nested":{"__proto__":{}}}'),
    { nested: { constructor: 'bad' } },
    ...['model', 'input', 'voice', 'speed', 'response_format'].map((key) => ({
      [key]: 'override',
    })),
    { generation: null },
    { generation: [] },
    { generation: 'text' },
    { generation: { instruct: 'override' } },
  ])
    assert.throws(() =>
      parseTtsSettings({ instructionsParameter: 'generation.instruct', extraBody }),
    );
  assert.deepEqual(parseTtsSettings({}).extraBody, {});
});
for (const alwaysInstructions of ['', '常時付与', ' \n '])
  test(`speech preserves default, per-call, empty and deduplication rules with alwaysInstructions=${JSON.stringify(alwaysInstructions)}`, async (t) => {
    const f = setup(t);
    const prefix = alwaysInstructions.trim() ? alwaysInstructions + '\n' : '';
    f.config({
      instructionsMode: 'json',
      alwaysInstructions,
      defaultInstructions: '既定の声色',
      instructionsParameter: 'generation.instruct',
      speechPath: 'synthesize',
    });
    const first = f.s.speak('a', input('default'));
    await wait(() => f.s.get('a', first.jobId).state === 'completed');
    assert.equal(f.posts[0].u, 'http://localhost:8080/v1/synthesize');
    assert.deepEqual(JSON.parse(f.posts[0].o.body).generation, { instruct: prefix + '既定の声色' });
    const explicit = { ...input('override'), instructions: '明るく' };
    const second = f.s.speak('a', explicit);
    await wait(() => f.s.get('a', second.jobId).state === 'completed');
    assert.equal(JSON.parse(f.posts[1].o.body).generation.instruct, prefix + '明るく');
    assert.equal(f.s.speak('a', explicit).jobId, second.jobId);
    assert.throws(() => f.s.speak('a', { ...explicit, instructions: '静かに' }), {
      code: 'TTS_REQUEST_CONFLICT',
    });
    f.config({ defaultInstructions: '変更後' });
    assert.equal(f.s.speak('a', input('default')).jobId, first.jobId);
    for (const [index, instructions] of ['', ' \n '].entries()) {
      const job = f.s.speak('a', { ...input('empty-' + index), instructions });
      await wait(() => f.s.get('a', job.jobId).state === 'completed');
      const body = JSON.parse(f.posts[2 + index].o.body);
      assert.deepEqual(body.generation, prefix ? { instruct: alwaysInstructions } : undefined);
    }
    assert(!JSON.stringify(f.s.get('a', second.jobId)).includes('明るく'));
    assert.equal(f.s.jobs.get(second.jobId).instructions, undefined);
    assert.throws(() => f.s.speak('a', { ...input('bad'), instructions: 1 }), {
      code: 'INVALID_ARGUMENT',
    });
  });
test('queued speech captures nuance once and settings changes cancel pending jobs without rewriting retries', async (t) => {
  const f = setup(t);
  f.config({ instructionsMode: 'json', alwaysInstructions: '共通A', defaultInstructions: '既定A' });
  const first = f.s.speak('a', input('first'));
  const queued = f.s.speak('a', { ...input('queued'), instructions: '個別A' });
  assert.equal(f.s.jobs.get(first.jobId).instructions, '共通A\n既定A');
  assert.equal(f.s.jobs.get(queued.jobId).instructions, '共通A\n個別A');
  f.config({ alwaysInstructions: '共通B', defaultInstructions: '既定B' });
  assert.equal(f.s.get('a', first.jobId).state, 'canceled');
  assert.equal(f.s.get('a', queued.jobId).state, 'canceled');
  assert.equal(f.s.speak('a', input('first')).jobId, first.jobId);
  assert.equal(f.posts.length, 0);
  const latest = f.s.speak('a', input('latest'));
  await wait(() => f.s.get('a', latest.jobId).state === 'completed');
  assert.equal(JSON.parse(f.posts[0].o.body).instructions, '共通B\n既定B');
  assert(!JSON.stringify(f.s.get('a', queued.jobId)).includes('共通A'));
  assert.equal(f.s.jobs.get(queued.jobId).instructions, undefined);
});
test('disabled nuance ignores default and per-call instructions while speech and extra parameters remain usable', async (t) => {
  const f = setup(t);
  f.config({
    defaultInstructions: '落ち着いて',
    alwaysInstructions: '聞き取りやすく',
    instructionsParameter: 'generation.instruct',
    extraBody: { language: 'Japanese', generation: { temperature: 0.4 } },
  });
  for (const [index, instructions] of [undefined, '明るく', '', '   '].entries()) {
    const request = { ...input('ignored-' + index), instructions };
    const job = f.s.speak('a', request);
    await wait(() => f.s.get('a', job.jobId).state === 'completed');
    const body = JSON.parse(f.posts[index].o.body);
    assert.equal(body.input, '本文');
    assert.equal(body.language, 'Japanese');
    assert.deepEqual(body.generation, { temperature: 0.4 });
    assert.equal(Object.hasOwn(body, 'instructions'), false);
    assert.equal(Object.hasOwn(body, 'instruct'), false);
    assert.equal(f.s.speak('a', request).jobId, job.jobId);
  }
  assert.equal(f.posts.length, 4);
  assert.throws(() => f.s.speak('a', { ...input('bad'), instructions: 1 }), {
    code: 'INVALID_ARGUMENT',
  });
  f.config({ instructionsMode: 'json' });
  const enabled = f.s.speak('a', input('enabled'));
  await wait(() => f.s.get('a', enabled.jobId).state === 'completed');
  assert.equal(JSON.parse(f.posts[4].o.body).generation.instruct, '聞き取りやすく\n落ち着いて');
});
test('streamed WAV length sentinels are finalized before the common player; malformed sizes still fail', async (t) => {
  const streaming = wave();
  streaming.writeUInt32LE(0xffffffff, 4);
  streaming.writeUInt32LE(0xffffffff, 40);
  const normalized = finalizeTtsWave(streaming);
  assert.equal(waveDuration(normalized), 0.02);
  assert.equal(streaming.readUInt32LE(4), 0xffffffff);
  const malformed = wave();
  malformed.writeUInt32LE(0xfffffffe, 40);
  assert.throws(() => waveDuration(finalizeTtsWave(malformed)), { code: 'TTS_INVALID_AUDIO' });
  let played = false;
  const f = setup(t, {
    fetcher: async () => new Response(streaming, { headers: { 'Content-Type': 'audio/wav' } }),
    play: async (bytes) => {
      assert.equal(waveDuration(bytes), 0.02);
      played = true;
    },
  });
  const job = f.s.speak('a', input('stream'));
  await wait(() => f.s.get('a', job.jobId).state === 'completed');
  assert(played);
});
test('TTS settings validate endpoints, secrets exclusion, voice list', () => {
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
    { apiKey: 'secret' },
    ...[{}, null, 'default', [null], [{}], [{ id: 'default', name: {} }]].map((manualVoices) => ({
      manualVoices,
    })),
    { manualVoices: [{ id: 'x' }, { id: 'x' }] },
  ])
    assert.throws(() => parseTtsSettings(v));
  assert.deepEqual(parseTtsSettings({ manualVoices: [{ id: 'default' }] }).manualVoices, [
    { id: 'default', name: 'default' },
  ]);
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
  assert.equal(Object.hasOwn(JSON.parse(f.posts[0].o.body), 'speed'), false);
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
test('HTTP status and invalid audio content become safe errors', async (t) => {
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
      'TTS_INVALID_AUDIO',
    ],
  ]) {
    const f = setup(t, { fetcher: async () => response() });
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
  const file = path.join(dir, 'tts-keys.json');
  const keys = new TtsSecrets(dir, 'tts-keys', {
    encrypt: (s) => 'encrypted:' + Buffer.from(s).toString('base64'),
    decrypt: (s) => Buffer.from(s.slice(10), 'base64').toString(),
  });
  keys.setKey({ id: 'one', baseUrl: 'http://host/v1' }, 'secret-value');
  assert(!fs.readFileSync(file, 'utf8').includes('secret-value'));
  assert.equal(keys.key({ id: 'one', baseUrl: 'http://host/v1' }), 'secret-value');
  assert.equal(keys.key({ id: 'one', baseUrl: 'http://other/v1' }), undefined);
  assert.throws(() => keys.setKey({ id: 'one', baseUrl: 'http://host/v1' }, 'x\ny'));
  keys.setKey({ id: 'one', baseUrl: 'http://host/v1' }, '');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).entries, {});
  const denied = new TtsSecrets(dir, 'tts-keys', {
    encrypt: () => {
      throw Error('unavailable');
    },
    decrypt: () => '',
  });
  assert.throws(() => denied.setKey({ id: 'two', baseUrl: 'http://host/v1' }, 'secret'));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).entries, {});
});
test('common dispatcher publishes TTS tools and enforces dedicated permissions and owner', async (t) => {
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
test('preview configuration uses its own endpoint and key without changing normal speech', async (t) => {
  const f = setup(t, { key: () => 'normal-key' });
  const preview = {
    settings: {
      ...defaultTtsSettings(),
      baseUrl: 'http://preview/v1',
      model: 'preview-model',
      defaultVoice: 'preview-voice',
    },
    key: 'preview-key',
  };
  const job = f.s.speak('host', input('preview'), { configuration: preview });
  await wait(() => f.s.get('host', job.jobId).state === 'completed');
  assert.equal(f.posts[0].u, 'http://preview/v1/audio/speech');
  assert.equal(f.posts[0].o.headers.Authorization, 'Bearer preview-key');
  assert.equal(JSON.parse(f.posts[0].o.body).voice, 'preview-voice');
  const normal = f.s.speak('host', input('normal'));
  await wait(() => f.s.get('host', normal.jobId).state === 'completed');
  assert.equal(f.posts[1].u, 'http://localhost:8080/v1/audio/speech');
  assert.equal(f.posts[1].o.headers.Authorization, 'Bearer normal-key');
  assert.equal(JSON.parse(f.posts[1].o.body).voice, 'voice');
});
test('retired speed preferences never reach the server and generated WAV bytes reach playback unchanged', async (t) => {
  for (const mode of ['playback', 'server']) {
    const original = wave();
    let played;
    const f = setup(t, {
      settings: () => ({
        ...defaultTtsSettings(),
        baseUrl: 'http://host/v1',
        model: 'm',
        defaultVoice: 'v',
        speedMode: mode,
        defaultSpeed: 1.4,
      }),
      fetcher: async (_u, o) => {
        assert.equal(Object.hasOwn(JSON.parse(o.body), 'speed'), false);
        return new Response(original, { headers: { 'Content-Type': 'audio/wav' } });
      },
      play: async (bytes, duration, signal, beforePlay) => {
        assert.equal(typeof beforePlay, 'function');
        assert.equal(duration, waveDuration(original));
        played = bytes;
      },
    });
    const job = f.s.speak('a', input(mode));
    await wait(() => f.s.get('a', job.jobId).state === 'completed');
    assert.deepEqual(played, original);
  }
});

test('model discovery preserves base path and endpoint-bound auth without requiring a model', async (t) => {
  const requests = [];
  const f = setup(t, {
    key: (server) => (server.baseUrl === 'http://localhost:8080/v1' ? 'fixture-key' : undefined),
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
