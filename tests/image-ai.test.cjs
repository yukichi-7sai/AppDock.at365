const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { ImageAiService } = require('../out/main/main/core/image-ai-service');
const { OpenAiImageAdapter } = require('../out/main/main/core/image-ai-adapter');
const { ImageAiSettingsController } = require('../out/main/main/core/image-ai-settings');
const { AiSecrets } = require('../out/main/main/core/ai-secrets');
const { SettingsStore } = require('../out/main/main/core/settings');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const {
  newImageAiConnection,
  parseImageAiSettings,
  imageReadChunkBytes,
} = require('../out/main/shared/image-ai');
const { operationsFor } = require('../out/main/shared/appdock-api');
const png = require('./fixtures/image-ai-png.cjs');
const connection = (id = 'one') => ({
  ...newImageAiConnection(id),
  name: id,
  baseUrl: 'http://127.0.0.1/v1',
  authentication: 'none',
  defaultModel: 'fixture',
  defaultPrompt: 'default',
});
const response = (bytes = png, n = 1) =>
  new Response(
    JSON.stringify({
      data: Array.from({ length: n }, () => ({ b64_json: bytes.toString('base64') })),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
async function until(fn) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const r = fn();
    if (r) return r;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error('state timeout');
}
function fixture(t, extra = {}) {
  let settings = { connections: [connection()], defaultConnectionId: 'one' },
    allowed = true;
  const requests = [],
    failures = [];
  const s = new ImageAiService({
    settings: () => settings,
    key: () => undefined,
    canUse: () => allowed,
    fetcher: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return response(png, JSON.parse(init.body).n);
    },
    failed: (...args) => failures.push(args),
    ...extra,
  });
  t.after(() => s.close());
  return {
    s,
    requests,
    failures,
    set: (value) => {
      settings = value;
    },
    config: () => settings,
    deny: () => {
      allowed = false;
    },
  };
}
const completed = (s, id) =>
  until(() => {
    const v = s.get('one', id);
    return v.state === 'completed' && v;
  });
test('image instructions and input combine once, inherit omitted defaults and suppress explicit empty defaults', async (t) => {
  const f = fixture(t),
    c = connection();
  c.alwaysPrompt = 'always';
  c.defaultPrompt = 'default style';
  f.set({ connections: [c], defaultConnectionId: c.id });
  const cases = [
    [{ input: 'subject' }, 'always\ndefault style\nsubject'],
    [{ additionalPrompt: 'watercolor', input: 'subject' }, 'always\nwatercolor\nsubject'],
    [{ additionalPrompt: '', input: 'subject' }, 'always\nsubject'],
  ];
  for (const [input, expected] of cases) {
    const job = f.s.generate('one', { requestId: String(f.requests.length), ...input });
    await completed(f.s, job.jobId);
    assert.equal(f.requests.at(-1).body.prompt, expected);
  }
  assert.throws(() => f.s.generate('one', { requestId: 'bad', input: {} }), {
    code: 'INVALID_ARGUMENT',
  });
  assert.equal(c.defaultPrompt, 'default style');
});
test('preset model selection, per-call image options and canonical request IDs', async (t) => {
  const f = fixture(t);
  const other = connection('two');
  other.defaultModel = 'second-model';
  other.alwaysPrompt = 'always';
  other.defaults.size = '1536x1024';
  f.set({ connections: [connection(), other], defaultConnectionId: 'one' });
  const input = {
    requestId: 'r',
    connectionId: 'two',
    additionalPrompt: 'landscape',
    options: { count: 2, providerOptions: { quality: 'high' } },
  };
  const j = f.s.generate('one', input);
  assert.equal(j.completion, 'accepted');
  assert.equal(j.model, 'second-model');
  assert.equal(
    f.s.generate('one', {
      options: { providerOptions: { quality: 'high' }, count: 2 },
      additionalPrompt: 'landscape',
      connectionId: 'two',
      requestId: 'r',
    }).jobId,
    j.jobId,
  );
  assert.throws(() => f.s.generate('one', { ...input, additionalPrompt: 'different' }), {
    code: 'IMAGE_AI_REQUEST_CONFLICT',
  });
  const done = await completed(f.s, j.jobId);
  assert.equal(done.images.length, 2);
  assert.deepEqual(f.requests[0].body, {
    model: 'second-model',
    prompt: 'always\nlandscape',
    n: 2,
    size: '1536x1024',
    output_format: 'png',
    quality: 'high',
    background: 'auto',
  });
  assert.equal(f.requests[0].init.redirect, 'error');
  assert.equal(other.defaults.count, 1);
  assert.equal(
    f.s.read('one', { jobId: j.jobId, imageId: done.images[0].id }).data,
    png.toString('base64'),
  );
  assert.throws(() => f.s.get('other', j.jobId), { code: 'NOT_FOUND' });
  assert.throws(() => f.s.read('other', { jobId: j.jobId, imageId: done.images[0].id }), {
    code: 'NOT_FOUND',
  });
  assert.throws(() => f.s.generate('one', { requestId: 'missing', connectionId: 'missing' }), {
    code: 'NOT_FOUND',
  });
  assert.throws(() => f.s.generate('one', { ...input, model: 'override' }), {
    code: 'INVALID_ARGUMENT',
  });
});
test('large results are read in bounded chunks and no raw image is in the job projection', async (t) => {
  const bytes = Buffer.concat([png, Buffer.alloc(imageReadChunkBytes * 5, 42)]);
  const f = fixture(t, { fetcher: async () => response(bytes) });
  const j = f.s.generate('one', { requestId: 'large' });
  const done = await completed(f.s, j.jobId);
  assert(JSON.stringify(done).length < 1000);
  let offset = 0,
    parts = [];
  for (;;) {
    const p = f.s.read('one', { jobId: j.jobId, imageId: done.images[0].id, offset });
    assert(JSON.stringify(p).length < 1024 * 1024);
    parts.push(Buffer.from(p.data, 'base64'));
    offset = p.nextOffset;
    if (p.done) break;
  }
  assert.deepEqual(Buffer.concat(parts), bytes);
  assert.throws(() => f.s.read('one', { jobId: j.jobId, imageId: done.images[0].id, offset: -1 }), {
    code: 'INVALID_ARGUMENT',
  });
});
test('cancellation discards late output, holds the transport slot and does not report failure', async (t) => {
  const resolve = [];
  const f = fixture(t, { fetcher: () => new Promise((r) => resolve.push(r)) });
  const a = f.s.generate('one', { requestId: 'a' }),
    b = f.s.generate('one', { requestId: 'b' });
  await until(() => resolve.length === 1);
  f.s.cancel('one', a.jobId);
  assert.equal(f.s.get('one', b.jobId).state, 'queued');
  resolve[0](response());
  await until(() => resolve.length === 2);
  resolve[1](response());
  await completed(f.s, b.jobId);
  assert.equal(f.s.get('one', a.jobId).state, 'canceled');
  assert.equal(f.s.get('one', a.jobId).images, undefined);
  assert.equal(f.failures.length, 0);
});
test('preset/key changes cancel only the affected work and owner shutdown forgets results', async (t) => {
  const resolve = [];
  const f = fixture(t, { fetcher: () => new Promise((r) => resolve.push(r)) });
  f.set({ connections: [connection(), connection('two')], defaultConnectionId: 'one' });
  const a = f.s.generate('one', { requestId: 'a' }),
    b = f.s.generate('one', { requestId: 'b', connectionId: 'two' });
  await until(() => resolve.length === 2);
  f.s.reconcile('one');
  assert.equal(f.s.get('one', a.jobId).state, 'canceled');
  resolve[0](response());
  resolve[1](response());
  await completed(f.s, b.jobId);
  f.s.forgetOwner('one');
  assert.throws(() => f.s.get('one', b.jobId), { code: 'NOT_FOUND' });
});
test('errors are sanitized and reported once; invalid requests never send', async (t) => {
  const f = fixture(t, {
    fetcher: async () => new Response('private-key private-prompt', { status: 401 }),
  });
  assert.throws(
    () =>
      f.s.generate('one', {
        requestId: 'bad',
        options: { format: 'jpeg', providerOptions: { background: 'transparent' } },
      }),
    { code: 'INVALID_ARGUMENT' },
  );
  const j = f.s.generate('one', { requestId: 'denied' });
  await until(() => f.s.get('one', j.jobId).state === 'failed');
  assert.equal(f.s.get('one', j.jobId).error.code, 'IMAGE_AI_AUTH_FAILED');
  f.s.generate('one', { requestId: 'denied' });
  assert.equal(f.failures.length, 1);
  assert(!JSON.stringify(f.failures).includes('private-'));
});
test('expiry and permission revocation do not regenerate images', async (t) => {
  const f = fixture(t, { resultMs: 20 });
  const j = f.s.generate('one', { requestId: 'expire' });
  const done = await completed(f.s, j.jobId);
  await until(() => f.s.get('one', j.jobId).resultExpired);
  assert.throws(() => f.s.read('one', { jobId: j.jobId, imageId: done.images[0].id }), {
    code: 'IMAGE_AI_RESULT_EXPIRED',
  });
  f.s.generate('one', { requestId: 'expire' });
  assert.equal(f.requests.length, 1);
  f.deny();
  f.s.reconcile();
  assert.throws(() => f.s.connections('one'), { code: 'API_DISABLED' });
});
test('adapter rejects malformed image bodies and never follows a returned URL', async () => {
  const c = connection();
  let calls = 0;
  for (const data of [
    [{ url: 'https://untrusted/image.png' }],
    [{ b64_json: 'abcd' }],
    [{ b64_json: png.toString('base64') + '!' }],
  ]) {
    const adapter = new OpenAiImageAdapter(async () => {
      calls++;
      return new Response(JSON.stringify({ data }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
    await assert.rejects(
      adapter.generate(
        c,
        undefined,
        { model: 'm', prompt: 'p', options: c.defaults },
        new AbortController().signal,
      ),
      { code: 'IMAGE_AI_INVALID_RESPONSE' },
    );
  }
  assert.equal(calls, 3);
});
test('empty explicit prompt differs from omission; credentials and prompts stay out of discovery', async (t) => {
  const f = fixture(t);
  assert.throws(() => f.s.generate('one', { requestId: 'empty', additionalPrompt: '' }), {
    code: 'INVALID_ARGUMENT',
  });
  const list = f.s.connections('one');
  assert.equal(list.connections[0].capabilities.textToImage, true);
  assert(!JSON.stringify(list).includes('defaultPrompt'));
  const j = f.s.generate('one', { requestId: 'default' });
  await completed(f.s, j.jobId);
  assert.equal(f.requests[0].body.prompt, 'default');
  assert.deepEqual(
    operationsFor('applet')
      .filter(([k]) => k.startsWith('ai.image.'))
      .map(([k]) => k),
    ['ai.image.connections.list', 'ai.image.jobs.get', 'ai.image.jobs.cancel'],
  );
  assert(!operationsFor('mcp').some(([k]) => k.startsWith('ai.image.')));
});
function settingsFixture(t) {
  const root = path.resolve(__dirname, '../.artifacts/image-ai-unit');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify(createDefaultSettings()));
  const settings = new SettingsStore(file);
  settings.load();
  const secrets = new AiSecrets(dir, 'image-ai-keys', {
    encrypt: (v) => Buffer.from(v).toString('base64'),
    decrypt: (v) => Buffer.from(v, 'base64').toString(),
  });
  return {
    settings,
    secrets,
    file,
    controller: new ImageAiSettingsController(settings, secrets, () => {}),
  };
}
test('preset and key save atomically; identity, conflicts, reorder and unrelated settings are preserved', (t) => {
  const f = settingsFixture(t),
    c = { ...connection(), authentication: 'bearer' };
  const before = f.settings.value.ai;
  f.controller.save(c, null, 'secret');
  assert.equal(f.settings.value.imageAi.defaultConnectionId, 'one');
  assert.equal(f.secrets.key(c), 'secret');
  assert(!fs.readFileSync(f.file, 'utf8').includes('secret'));
  assert.deepEqual(f.settings.value.ai, before);
  const old = structuredClone(f.settings.value.imageAi.connections[0]),
    revision = f.secrets.revision(c.id);
  f.controller.save({ ...old, name: 'renamed' }, old, undefined, revision);
  assert.equal(f.settings.value.imageAi.connections[0].id, 'one');
  assert.throws(() => f.controller.save({ ...old, name: 'stale' }, old, undefined, revision));
  const current = structuredClone(f.settings.value.imageAi.connections[0]);
  assert.throws(() =>
    f.controller.save(
      { ...current, baseUrl: 'http://different/v1' },
      current,
      undefined,
      f.secrets.revision(c.id),
    ),
  );
  assert.throws(
    () =>
      f.controller.validatePublic({
        connections: [{ ...current, baseUrl: 'http://different/v1' }],
      }),
    { code: 'LOCAL_ACTION_REQUIRED' },
  );
  f.controller.save(connection('two'), null, undefined);
  f.controller.reorder(['one', 'two'], ['two', 'one']);
  assert.equal(f.settings.value.imageAi.defaultConnectionId, 'one');
  f.controller.remove(current, f.secrets.revision(c.id));
  assert.equal(f.settings.value.imageAi.defaultConnectionId, undefined);
  assert.equal(f.secrets.key(c), undefined);
  assert.throws(() => parseImageAiSettings({ connections: [connection(), connection()] }));
});
test('failed settings persistence restores the previous credential', (t) => {
  const f = settingsFixture(t),
    c = { ...connection(), authentication: 'bearer' };
  f.controller.save(c, null, 'old-key');
  const old = structuredClone(f.settings.value.imageAi.connections[0]);
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (to === f.file) throw Error('fixture write failure');
    return rename(from, to);
  };
  try {
    assert.throws(
      () => f.controller.save({ ...old, name: 'new' }, old, 'new-key', f.secrets.revision(c.id)),
      /fixture/,
    );
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(f.secrets.key(c), 'old-key');
  assert.equal(f.settings.value.imageAi.connections[0].name, 'one');
});

test('timeouts include queue time and abort running requests without automatic retry', async (t) => {
  const resolve = [];
  const f = fixture(t, { fetcher: () => new Promise((r) => resolve.push(r)) });
  f.set({ connections: [{ ...connection(), timeoutSeconds: 1 }], defaultConnectionId: 'one' });
  const a = f.s.generate('one', { requestId: 'timeout-a' }),
    b = f.s.generate('one', { requestId: 'timeout-b' });
  await until(
    () => f.s.get('one', a.jobId).state === 'failed' && f.s.get('one', b.jobId).state === 'failed',
  );
  assert.equal(f.s.get('one', a.jobId).error.code, 'IMAGE_AI_TIMEOUT');
  assert.equal(f.s.get('one', b.jobId).error.code, 'IMAGE_AI_TIMEOUT');
  assert.equal(resolve.length, 1);
  resolve[0](response());
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(f.s.get('one', a.jobId).images, undefined);
});

test('malformed JSON is a response failure and decoder errors do not complete the job', async (t) => {
  const f = fixture(t, {
    fetcher: async () =>
      new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
  });
  const j = f.s.generate('one', { requestId: 'json' });
  await until(() => f.s.get('one', j.jobId).state === 'failed');
  assert.equal(f.s.get('one', j.jobId).error.code, 'IMAGE_AI_INVALID_RESPONSE');
  const g = fixture(t, {
    validateImage: async () => {
      throw Error('invalid pixel data');
    },
  });
  const k = g.s.generate('one', { requestId: 'decode' });
  await until(() => g.s.get('one', k.jobId).state === 'failed');
  assert.equal(g.s.get('one', k.jobId).error.code, 'IMAGE_AI_INVALID_RESPONSE');
  assert.equal(g.s.get('one', k.jobId).images, undefined);
});
