const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { AiService } = require('../out/main/main/core/ai-service');
const { AiSecrets } = require('../out/main/main/core/ai-secrets');
const { AiOpenAiChat } = require('../out/main/main/core/ai-openai-chat');
const { parseAiSettings, newAiConnection, aiMessages } = require('../out/main/shared/ai');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { AppletApiAccess } = require('../out/main/main/core/applet-api-access');
const { appDockOperations } = require('../out/main/shared/appdock-api');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { SettingsStore } = require('../out/main/main/core/settings');
const { AutomationService } = require('../out/main/main/core/automation');
const root = path.join(__dirname, '../.artifacts/ai-unit');
fs.mkdirSync(root, { recursive: true });
const temp = () => fs.mkdtempSync(path.join(root, 'case-'));
const response = (text = '生成した文章') =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: text } }],
      usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
async function until(fn, ms = 2500) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error('wait timeout');
}
function setup(t, extra = {}) {
  let config = {
    commonPrompt: '共通方針',
    defaultConnectionId: 'local',
    connections: [
      {
        ...newAiConnection('local'),
        baseUrl: 'http://localhost:11434/proxy/v1',
        defaultModel: 'default',
      },
    ],
  };
  let allowed = true;
  const calls = [];
  const s = new AiService({
    settings: () => config,
    key: () => undefined,
    canUse: () => allowed,
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return response();
    },
    limits: { burst: 100, perMinute: 1000 },
    ...extra,
  });
  t.after(() => s.close());
  return {
    s,
    calls,
    set: (v) => {
      config = { ...config, ...v };
      s.reconcile();
    },
    connection: (v) => {
      config = { ...config, connections: config.connections.map((c) => ({ ...c, ...v })) };
      s.reconcile();
    },
    deny: () => {
      allowed = false;
      s.reconcile();
    },
    settings: () => config,
  };
}
const request = (id, patch = {}) => ({ requestId: id, input: '入力データ', ...patch });
test('AI settings accept old files and validate URL, keys, ids and compatibility', () => {
  assert.deepEqual(parseAiSettings(), { commonPrompt: '', connections: [] });
  const settings = createDefaultSettings();
  delete settings.ai;
  assert.deepEqual(parseSettings(settings).ai, parseAiSettings());
  const c = { ...newAiConnection('local'), baseUrl: 'http://server:11434/proxy/v1/' };
  const legacy = { ...c };
  delete legacy.defaultMaxOutputTokens;
  delete legacy.defaultTimeoutSeconds;
  const normalized = parseAiSettings({ connections: [legacy] }).connections[0];
  assert.equal(normalized.defaultMaxOutputTokens, 8192);
  assert.equal(normalized.defaultTimeoutSeconds, 60);
  assert.equal(
    parseAiSettings({
      connections: [{ ...c, defaultMaxOutputTokens: 131072, defaultTimeoutSeconds: 600 }],
    }).connections[0].defaultMaxOutputTokens,
    131072,
  );
  assert.equal(
    parseAiSettings({ connections: [c] }).connections[0].baseUrl,
    'http://server:11434/proxy/v1',
  );
  for (const patch of [
    { baseUrl: 'file:///etc' },
    { baseUrl: 'https://user:key@host/v1' },
    { baseUrl: 'http://host/v1?key=x' },
    { baseUrl: 'http://host/api' },
    { baseUrl: 'http://host/v1/chat/completions' },
    { apiKey: 'secret' },
    { id: '__proto__' },
    ...[0, 31, 131073, 8192.5, null, '8192', Infinity].map((defaultMaxOutputTokens) => ({
      defaultMaxOutputTokens,
    })),
    ...[0, 601, 1.5, null, '60', Infinity].map((defaultTimeoutSeconds) => ({
      defaultTimeoutSeconds,
    })),
    { compatibility: { ...c.compatibility, temperature: NaN } },
    { compatibility: { ...c.compatibility, reasoningEffort: 'x\n' } },
  ])
    assert.throws(() => parseAiSettings({ connections: [{ ...c, ...patch }] }));
  assert.throws(() => parseAiSettings({ connections: [c, c] }));
  assert.throws(() => parseAiSettings({ connections: [], commonPrompt: 'x'.repeat(2049) }));
});
test('model overrides and prompt composition preserve shared values and isolate input', async (t) => {
  const f = setup(t);
  const before = JSON.stringify(f.settings());
  const a = f.s.generate(
    'owner',
    request('a', {
      model: 'override',
      additionalPrompt: '用途の指示',
      input: '分離対象の架空データ',
    }),
  );
  assert.equal(a.state, 'queued');
  assert.equal(a.model, 'override');
  await until(() => f.s.get('owner', a.jobId).state === 'completed');
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.model, 'override');
  assert.equal(body.max_tokens, 8192);
  assert.equal(body.messages[1].content, '分離対象の架空データ');
  assert(!body.messages[0].content.includes('分離対象の架空データ'));
  assert(
    body.messages[0].content.indexOf('共通方針') < body.messages[0].content.indexOf('用途の指示'),
  );
  assert.equal(JSON.stringify(f.settings()), before);
  assert.equal(f.calls[0].url, 'http://localhost:11434/proxy/v1/chat/completions');
  assert.equal(f.calls[0].init.redirect, 'error');
  assert.equal(f.calls[0].init.headers.Authorization, undefined);
  const result = f.s.get('owner', a.jobId);
  assert.equal(result.text, '生成した文章');
  assert.equal(result.usage.totalTokens, 10);
  assert.throws(
    () => f.s.get('other', a.jobId),
    (e) => e.code === 'NOT_FOUND',
  );
  assert.throws(
    () => f.s.cancel('other', a.jobId),
    (e) => e.code === 'NOT_FOUND',
  );
  assert.equal(
    f.s.generate('owner', {
      input: '分離対象の架空データ',
      model: 'override',
      additionalPrompt: '用途の指示',
      requestId: 'a',
    }).jobId,
    a.jobId,
  );
  assert.throws(
    () => f.s.generate('owner', request('a', { model: 'different' })),
    (e) => e.code === 'AI_REQUEST_CONFLICT',
  );
  f.set({ commonPrompt: '変更後' });
  assert.equal(
    f.s.generate(
      'owner',
      request('a', {
        model: 'override',
        additionalPrompt: '用途の指示',
        input: '分離対象の架空データ',
      }),
    ).jobId,
    a.jobId,
  );
});
test('empty input, explicit token dialect and authentication are supported without hidden retries', async (t) => {
  const f = setup(t, { key: () => 'fake-secret' });
  f.connection({
    authentication: 'bearer',
    compatibility: {
      tokenLimitField: 'max_completion_tokens',
      store: 'false',
      reasoningEffort: 'none',
    },
  });
  const a = f.s.generate('owner', { requestId: 'a', additionalPrompt: '文章を作る' });
  await until(() => f.s.get('owner', a.jobId).state === 'completed');
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.max_completion_tokens, 8192);
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.store, false);
  assert.equal(body.temperature, undefined);
  assert.equal(body.reasoning_effort, 'none');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer fake-secret');
  assert.equal(f.calls.length, 1);
  assert(!JSON.stringify(f.s.get('owner', a.jobId)).includes('fake-secret'));
  f.connection({ defaultModel: '' });
  assert.throws(
    () => f.s.generate('owner', request('b')),
    (e) => e.code === 'AI_MODEL_REQUIRED',
  );
  assert.equal(aiMessages('', '', '入力').length, 1);
});
test('invalid arguments, missing authorization and bearer keys fail before sending', (t) => {
  const f = setup(t);
  for (const patch of [
    { model: ' ' },
    { model: 'm\n' },
    { timeoutMs: 1 },
    { maxOutputTokens: 31 },
    { maxOutputTokens: 131073 },
    { maxOutputTokens: 32.5 },
    { maxOutputTokens: null },
    { timeoutMs: 600001 },
    { timeoutMs: null },
    { input: 'x'.repeat(8193) },
    { additionalPrompt: 'x'.repeat(2049) },
    { apiKey: 'secret' },
    { connectionId: 12 },
  ])
    assert.throws(() => f.s.generate('owner', request('a', patch)));
  assert.equal(f.calls.length, 0);
  f.connection({ authentication: 'bearer' });
  assert.throws(
    () => f.s.generate('owner', request('a')),
    (e) => e.code === 'AI_AUTH_FAILED',
  );
  f.deny();
  assert.throws(
    () => f.s.generate('owner', request('a')),
    (e) => e.code === 'API_DISABLED',
  );
});
test('connection output defaults, explicit overrides and retry identities remain independent', async (t) => {
  const f = setup(t);
  f.connection({ defaultMaxOutputTokens: 100000 });
  const original = f.s.generate('owner', request('default'));
  await until(() => f.s.get('owner', original.jobId).state === 'completed');
  assert.equal(JSON.parse(f.calls.at(-1).init.body).max_tokens, 100000);
  f.connection({ defaultMaxOutputTokens: 32 });
  assert.equal(f.s.generate('owner', request('default')).jobId, original.jobId);
  assert.equal(f.calls.length, 1);
  for (const limit of [32, 131072]) {
    const job = f.s.generate('owner', request('explicit-' + limit, { maxOutputTokens: limit }));
    await until(() => f.s.get('owner', job.jobId).state === 'completed');
    assert.equal(JSON.parse(f.calls.at(-1).init.body).max_tokens, limit);
  }
  assert.equal(f.settings().connections[0].defaultMaxOutputTokens, 32);
  assert.throws(
    () => f.s.generate('owner', request('default', { maxOutputTokens: 100000 })),
    (e) => e.code === 'AI_REQUEST_CONFLICT',
  );
});

test('connection deadlines include queue time and API deadlines override them', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const failures = [];
  const f = setup(t, {
    fetcher: async (_url, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }),
      ),
    failed: (_owner, id, error) => failures.push({ id, ...error }),
  });
  f.connection({ defaultTimeoutSeconds: 2 });
  const first = f.s.generate('owner', request('default'));
  await Promise.resolve();
  t.mock.timers.tick(1999);
  assert.equal(f.s.get('owner', first.jobId).state, 'running');
  t.mock.timers.tick(1);
  assert.equal(f.s.get('owner', first.jobId).error.code, 'AI_TIMEOUT');
  assert.equal(failures.length, 1);
  const queued = f.s.generate('owner', request('override', { timeoutMs: 1000 }));
  t.mock.timers.tick(999);
  assert.equal(f.s.get('owner', queued.jobId).state, 'queued');
  t.mock.timers.tick(1);
  assert.equal(f.s.get('owner', queued.jobId).error.code, 'AI_TIMEOUT');
  assert.equal(failures.length, 2);
  const long = f.s.generate('owner', request('long', { timeoutMs: 600000 }));
  t.mock.timers.tick(599999);
  assert.notEqual(f.s.get('owner', long.jobId).state, 'failed');
  f.s.cancel('owner', long.jobId);
  assert.equal(failures.length, 2);
});

test('a response arriving after its deadline is a timeout even before the timer callback', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const failures = [];
  const f = setup(t, {
    fetcher: async () => {
      t.mock.timers.tick(2001);
      return response();
    },
    failed: (_owner, _id, error) => failures.push(error.code),
  });
  f.connection({ defaultTimeoutSeconds: 2 });
  const job = f.s.generate('owner', request('deadline'));
  await until(() => f.s.get('owner', job.jobId).state === 'failed');
  assert.equal(f.s.get('owner', job.jobId).error.code, 'AI_TIMEOUT');
  assert.deepEqual(failures, ['AI_TIMEOUT']);
});

test('token exhaustion reports one safe failure for host and API jobs without partial text', async (t) => {
  const failures = [];
  const f = setup(t, {
    fetcher: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'length',
              message: { content: 'partial-secret', reasoning: 'private-reasoning' },
            },
          ],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    failed: (owner, id, error) => {
      failures.push({ owner, id, ...error });
      throw Error('reporter unavailable');
    },
  });
  for (const owner of ['host', 'applet:fixture:run', 'mcp:run']) {
    const job = f.s.generate(owner, request(owner));
    await until(() => f.s.get(owner, job.jobId).state === 'failed');
    assert.equal(f.s.get(owner, job.jobId).error.code, 'AI_OUTPUT_LIMIT');
    assert.match(f.s.get(owner, job.jobId).error.message, /出力トークンの上限/);
    assert.equal(f.s.get(owner, job.jobId).text, undefined);
    assert.equal(f.s.generate(owner, request(owner)).jobId, job.jobId);
  }
  assert.equal(failures.length, 3);
  assert(!JSON.stringify(failures).includes('secret'));
  assert(!JSON.stringify(failures).includes('private-reasoning'));
});

test('queues serialize each connection, bound owners and allow two different connections', async (t) => {
  const runs = [],
    releases = [];
  const f = setup(t, {
    limits: { burst: 100, perMinute: 1000, ownerCapacity: 2 },
    fetcher: async (url, init) => {
      runs.push(JSON.parse(init.body).model);
      return new Promise((resolve) => releases.push(() => resolve(response())));
    },
  });
  f.set({
    connections: [
      ...f.settings().connections,
      { ...newAiConnection('second'), baseUrl: 'http://other/v1', defaultModel: 'second' },
    ],
  });
  const a = f.s.generate('one', request('a'));
  const b = f.s.generate('one', request('b', { model: 'queued' }));
  assert.throws(
    () => f.s.generate('one', request('c')),
    (e) => e.code === 'AI_QUEUE_FULL',
  );
  const c = f.s.generate('two', request('c', { connectionId: 'second' }));
  await until(() => runs.length === 2);
  assert.deepEqual(runs, ['default', 'second']);
  releases.shift()();
  await until(() => runs.length === 3);
  assert.equal(runs[2], 'queued');
  for (const release of releases) release();
  await until(
    () =>
      [a, b].every((j) => f.s.get('one', j.jobId).state === 'completed') &&
      f.s.get('two', c.jobId).state === 'completed',
  );
});
test('deadlines include queueing and late responses cannot overwrite a failed job', async (t) => {
  const releases = [];
  const f = setup(t, {
    fetcher: async () => new Promise((resolve) => releases.push(() => resolve(response('late')))),
  });
  const a = f.s.generate('owner', request('a', { timeoutMs: 1000 }));
  const b = f.s.generate('owner', request('b', { timeoutMs: 1000 }));
  await until(() => f.s.get('owner', b.jobId).state === 'failed', 1800);
  assert.equal(f.s.get('owner', a.jobId).error.code, 'AI_TIMEOUT');
  assert.equal(releases.length, 1);
  releases[0]();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.s.get('owner', a.jobId).state, 'failed');
  assert.equal(f.s.get('owner', a.jobId).text, undefined);
});
test('canceled transport retains its connection slot until it settles', async (t) => {
  const releases = [],
    calls = [];
  const f = setup(t, {
    fetcher: async (url, init) => {
      calls.push(url);
      return new Promise((resolve) => releases.push(() => resolve(response())));
    },
  });
  const a = f.s.generate('owner', request('a'));
  await until(() => calls.length === 1);
  f.s.cancel('owner', a.jobId);
  const b = f.s.generate('owner', request('b'));
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(calls.length, 1);
  releases.shift()();
  await until(() => calls.length === 2);
  releases.shift()();
  await until(() => f.s.get('owner', b.jobId).state === 'completed');
});
test('prompt/key/permission changes cancel work and revoke result access without new generation', async (t) => {
  const f = setup(t);
  const a = f.s.generate('owner', request('a'));
  await until(() => f.s.get('owner', a.jobId).state === 'completed');
  const b = f.s.generate('owner', request('b'));
  f.set({ commonPrompt: 'changed' });
  assert.equal(f.s.get('owner', b.jobId).state, 'canceled');
  const c = f.s.generate('owner', request('c'));
  f.s.reconcile(true);
  assert.equal(f.s.get('owner', c.jobId).state, 'canceled');
  f.deny();
  assert.throws(
    () => f.s.get('owner', a.jobId),
    (e) => e.code === 'API_DISABLED',
  );
  f.s.forgetOwner('owner');
});
test('result expiry and retention deduplicate without holding plaintext indefinitely', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const f = setup(t, { limits: { burst: 100, perMinute: 1000, resultMs: 10, retentionMs: 50 } });
  const a = f.s.generate('owner', request('a'));
  await until(() => f.s.get('owner', a.jobId).state === 'completed');
  t.mock.timers.tick(15);
  assert.equal(f.s.get('owner', a.jobId).text, undefined);
  assert.equal(f.s.get('owner', a.jobId).resultExpired, true);
  assert.equal(f.s.generate('owner', request('a')).jobId, a.jobId);
  assert.equal(f.calls.length, 1);
  t.mock.timers.tick(55);
  assert.throws(
    () => f.s.get('owner', a.jobId),
    (e) => e.code === 'NOT_FOUND',
  );
});
test('local rate limit does not consume another request on deduplication', async (t) => {
  const f = setup(t, { limits: { burst: 1, perMinute: 0 } });
  const a = f.s.generate('owner', request('a'));
  assert.equal(f.s.generate('owner', request('a')).jobId, a.jobId);
  assert.throws(
    () => f.s.generate('owner', request('b')),
    (e) => e.code === 'AI_RATE_LIMITED',
  );
});
test('result expiry is timer-driven, and connection revocation releases completed text', async (t) => {
  let notifications = 0;
  const f = setup(t, {
    changed: () => notifications++,
    limits: { burst: 100, perMinute: 1000, resultMs: 25 },
  });
  const a = f.s.generate('owner', request('a'));
  await until(() => f.s.get('owner', a.jobId).state === 'completed');
  const before = notifications;
  await new Promise((r) => setTimeout(r, 40));
  assert(notifications > before);
  assert.equal(f.s.get('owner', a.jobId).resultExpired, true);
  const b = f.s.generate('owner', request('b'));
  await until(() => f.s.get('owner', b.jobId).state === 'completed');
  f.set({ connections: [] });
  assert.equal(f.s.get('owner', b.jobId).text, undefined);
  assert.equal(f.s.get('owner', b.jobId).resultExpired, true);
});
test('key changes cancel only the affected connection', async (t) => {
  const releases = [];
  const f = setup(t, {
    fetcher: async () => new Promise((resolve) => releases.push(() => resolve(response()))),
  });
  f.set({
    connections: [
      ...f.settings().connections,
      { ...newAiConnection('second'), baseUrl: 'http://other/v1', defaultModel: 'second' },
    ],
  });
  const a = f.s.generate('one', request('a')),
    b = f.s.generate('two', request('b', { connectionId: 'second' }));
  await until(() => releases.length === 2);
  f.s.reconcile('local');
  assert.equal(f.s.get('one', a.jobId).state, 'canceled');
  assert.equal(f.s.get('two', b.jobId).state, 'running');
  for (const release of releases) release();
  await until(() => f.s.get('two', b.jobId).state === 'completed');
});
test('adapter rejects HTTP errors, refusals, truncation, malformed and oversized data safely', async () => {
  const c = { ...newAiConnection('local'), baseUrl: 'http://server/v1' };
  const invalid = [
    new Response('secret', { status: 401 }),
    new Response('secret', { status: 429 }),
    new Response('secret', { status: 500 }),
    new Response('<html>secret</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{secret', { headers: { 'Content-Type': 'application/json' } }),
    new Response('x'.repeat(1024 * 1024 + 1), { headers: { 'Content-Type': 'application/json' } }),
    ...[
      { finish_reason: 'length', message: { content: 'partial' } },
      { finish_reason: 'stop', message: { content: '' } },
      { finish_reason: 'stop', message: { content: 'text', refusal: 'secret' } },
      { finish_reason: 'stop', message: { content: 'text', tool_calls: [] } },
    ].map(
      (v) =>
        new Response(JSON.stringify({ choices: [v] }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  ];
  for (const r of invalid) {
    let calls = 0;
    const adapter = new AiOpenAiChat(async () => {
      calls++;
      return r;
    });
    await assert.rejects(
      adapter.generate(c, undefined, '{}', new AbortController().signal),
      (e) => e.code.startsWith('AI_') && !e.message.includes('secret'),
    );
    assert.equal(calls, 1);
  }
});
test('models coalesce by owner, reject unsupported lists and cancel on settings changes', async (t) => {
  let calls = 0,
    release;
  const f = setup(t, {
    fetcher: async () => {
      calls++;
      return new Promise(
        (resolve) =>
          (release = () =>
            resolve(
              new Response(JSON.stringify({ data: [{ id: 'model' }] }), {
                headers: { 'Content-Type': 'application/json' },
              }),
            )),
      );
    },
  });
  const a = f.s.models('owner'),
    b = f.s.models('owner');
  assert.equal(a, b);
  assert.equal(calls, 1);
  release();
  assert.equal((await a).models[0].id, 'model');
  const pending = f.s.models('owner');
  const rejected = assert.rejects(pending, (e) => e.code === 'AI_CANCELED');
  f.connection({ baseUrl: 'http://changed/v1' });
  release();
  await rejected;
  const adapter = new AiOpenAiChat(async () => new Response('secret', { status: 404 }));
  await assert.rejects(
    adapter.models(f.settings().connections[0], undefined, new AbortController().signal),
    (e) => e.code === 'AI_MODELS_UNSUPPORTED',
  );
});
test('model refresh replaces an aborted request without losing the new in-flight request', async (t) => {
  const pending = [];
  const f = setup(t, {
    limits: { modelLists: 1 },
    fetcher: (url, init) => new Promise((resolve) => pending.push({ url, init, resolve })),
  });
  const first = f.s.models('owner');
  const rejected = assert.rejects(first, (e) => e.code === 'AI_CANCELED');
  f.connection({ baseUrl: 'http://changed/v1' });
  const refreshed = f.s.models('owner');
  assert.notEqual(refreshed, first);
  assert.equal(pending.length, 2);
  assert.equal(pending[0].init.signal.aborted, true);
  assert.equal(pending[1].url, 'http://changed/v1/models');
  const models = (id) =>
    new Response(JSON.stringify({ data: [{ id }] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  pending[0].resolve(models('stale'));
  await rejected;
  assert.equal(f.s.models('owner'), refreshed);
  assert.equal(pending.length, 2);
  pending[1].resolve(models('fresh'));
  assert.equal((await refreshed).models[0].id, 'fresh');
});
test('keys are endpoint-bound encrypted and carry an opaque revision', () => {
  const dir = temp(),
    store = new AiSecrets(path.join(dir, 'keys.json'), {
      encrypt: (v) => Buffer.from(v).toString('base64'),
      decrypt: (v) => Buffer.from(v, 'base64').toString(),
    });
  const c = { ...newAiConnection('local'), baseUrl: 'http://server/v1' };
  store.setKey(c, 'fake-secret');
  assert.equal(store.key(c), 'fake-secret');
  assert(!fs.readFileSync(path.join(dir, 'keys.json'), 'utf8').includes('fake-secret'));
  assert.equal(store.key({ ...c, baseUrl: 'http://other/v1' }), undefined);
  assert.throws(() => store.setKey(c, 'secret\nheader'));
  store.setKey(c, '');
  assert.equal(store.key(c), undefined);
  fs.writeFileSync(path.join(dir, 'keys.json'), '{broken');
  assert(store.status(c).error);
});
test('Applet AI defaults ON and existing grants retain their explicit permissions', () => {
  const dir = temp(),
    file = path.join(dir, 'access.json');
  assert.equal(new AppletApiAccess(file).get().useAi, true);
  fs.writeFileSync(
    file,
    JSON.stringify({ version: 2, permissions: { read: true, execute: true, useTts: true } }),
  );
  assert.equal(new AppletApiAccess(file).get().useAi, undefined);
  assert.deepEqual(appDockOperations['ai.text.generate'].callers, ['mcp', 'applet']);
  assert.deepEqual(appDockOperations['ai.text.generate'].permissions, ['read', 'execute', 'useAi']);
});
test('shared dispatcher enforces independent Applet/MCP grants and the same AI schema', async () => {
  const dir = temp(),
    settings = new SettingsStore(path.join(dir, 'settings.json'));
  let mcp = false,
    applet = false;
  const calls = [];
  const api = new AppDockApi({
    settings,
    save: (v, r) => settings.save(v, r),
    applets: () => [],
    commands: () => [],
    execute: async () => {},
    ready: () => true,
    writable: () => false,
    executable: () => true,
    aiAllowed: () => mcp,
    appletPermissions: () => ({ read: true, execute: true, useAi: applet }),
    handlers: {
      'ai.text.generate': async (p, id) => {
        calls.push(id);
        return { jobId: 'j', state: 'queued' };
      },
    },
  });
  assert.throws(
    () => api.call('ai.text.generate', request('a')),
    (e) => e.code === 'API_DISABLED',
  );
  applet = true;
  await api.call('ai.text.generate', request('a'), 'applet');
  assert.deepEqual(calls, ['applet']);
  mcp = true;
  await api.call('ai.text.generate', request('a'));
  assert.deepEqual(calls, ['applet', undefined]);
  await api.call(
    'ai.text.generate',
    request('large', { maxOutputTokens: 131072, timeoutMs: 600000 }),
  );
  for (const patch of [{ maxOutputTokens: 131073 }, { timeoutMs: 600001 }])
    assert.throws(
      () => api.call('ai.text.generate', request('invalid-limit', patch)),
      (e) => e.code === 'INVALID_ARGUMENT',
    );
  assert.throws(
    () => api.call('ai.text.generate', { ...request('a'), apiKey: 'secret' }),
    (e) => e.code === 'INVALID_ARGUMENT',
  );
});
test('MCP AI permission is stored independently and absent legacy values remain OFF', async (t) => {
  const dir = temp(),
    s = new AutomationService({
      localDirectory: dir,
      baseDirectory: dir,
      version: 'test',
      encrypt: (v) => v,
      decrypt: (v) => v,
      changed: () => {},
      createApi: () => {
        throw Error('unused');
      },
    });
  t.after(() => s.close());
  assert.equal(s.state().allowUseAi, false);
  await s.action({ kind: 'setAi', allowed: true });
  assert.equal(s.state().allowUseAi, true);
  assert.equal(s.state().allowUseTts, false);
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'automation.json'), 'utf8'));
  delete config.allowUseAi;
  fs.writeFileSync(path.join(dir, 'automation.json'), JSON.stringify(config));
  const legacy = new AutomationService({
    localDirectory: dir,
    baseDirectory: dir,
    version: 'test',
    encrypt: (v) => v,
    decrypt: (v) => v,
    changed: () => {},
    createApi: () => {
      throw Error('unused');
    },
  });
  t.after(() => legacy.close());
  assert.equal(legacy.state().allowUseAi, false);
});
test('MCP authorization changes invalidate jobs synchronously before action completion', async (t) => {
  const dir = temp();
  let invalidations = 0;
  const service = new AutomationService({
    localDirectory: dir,
    baseDirectory: dir,
    version: 'test',
    encrypt: (v) => v,
    decrypt: (v) => v,
    changed: () => {},
    authorizationChanged: () => invalidations++,
    createApi: () => {
      throw Error('unused');
    },
  });
  t.after(() => service.close());
  await service.action({ kind: 'setAi', allowed: true });
  assert.equal(invalidations, 0);
  await service.action({ kind: 'setAi', allowed: false });
  assert.equal(invalidations, 1);
  await service.action({ kind: 'rotateToken' });
  assert.equal(invalidations, 2);
});
