const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path');
const { ImageAiService } = require('../out/main/main/core/image-ai-service');
const { ImageRegistration } = require('../out/main/main/core/image-registration');
const { RegisteredImages } = require('../out/main/main/core/registered-images');
const { readImageReference } = require('../out/main/main/core/image-ai-references');
const { newImageAiConnection } = require('../out/main/shared/image-ai');
const png = require('./fixtures/image-ai-png.cjs');
const until = async (fn) => {
  for (let n = 0; n < 500; n++) {
    const value = fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error('state timeout');
};
async function fixture(t, extra = {}) {
  const root = path.resolve('.artifacts/image-registration-unit');
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'case-'));
  const files = new RegisteredImages(directory, async () => ({
    width: 2,
    height: 1,
    thumbnail: 'data:image/png;base64,' + png.toString('base64'),
    circle: '',
  }));
  await fs.mkdir(path.join(directory, 'pictures'));
  await files.refresh();
  let writes = true,
    groupWrites = true,
    requests = 0;
  const groups = [{ id: 'favorites', name: 'Favorites', images: [] }];
  const host = {
    assertWritable() {
      if (!writes) throw Error('fixture save denied');
    },
    configuration: { snapshot: () => ({ groups }) },
    async edit(operation) {
      if (!groupWrites) throw Error('fixture group failure');
      groups[0].images.push(operation.image);
    },
  };
  const registration = new ImageRegistration(files, host);
  const connection = {
    ...newImageAiConnection('one'),
    name: 'one',
    authentication: 'none',
    defaultModel: 'fixture',
    mcpEnabled: true,
  };
  const config = { connections: [connection], defaultConnectionId: 'one' };
  let grants = true;
  const service = new ImageAiService({
    settings: () => config,
    key: () => undefined,
    canUse: (_owner, kind) => kind === 'read' || kind === 'cancel' || grants,
    registration,
    fetcher: async (_url, init) => {
      requests++;
      return new Response(
        JSON.stringify({
          data: Array.from({ length: JSON.parse(init.body).n }, () => ({
            b64_json: png.toString('base64'),
          })),
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    },
    ...extra,
  });
  t.after(() => {
    service.close();
    files.stop();
  });
  const input = {
    requestId: 'request',
    input: 'fixture',
    destination: { folder: 'pictures', name: 'flower', group: 'favorites' },
    options: { count: 2 },
  };
  return {
    directory,
    files,
    service,
    input,
    registration,
    config,
    groups,
    requests: () => requests,
    writes: (value) => {
      writes = value;
    },
    groupWrites: (value) => {
      groupWrites = value;
    },
    grants: (value) => {
      grants = value;
    },
  };
}
test('reference reads use validated original library bytes and reject invalid or missing paths', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.directory, 'pictures/reference.png'), png);
  await f.files.refresh();
  const ref = { file: 'pictures/reference.png' };
  assert.deepEqual(await readImageReference(f.files, ref, () => true), {
    bytes: png,
    mimeType: 'image/png',
  });
  assert.deepEqual(await fs.readFile(path.join(f.directory, ref.file)), png);
  for (const file of ['../outside.png', 'C:/private.png', 'missing.png', 'pictures/vector.svg'])
    await assert.rejects(
      readImageReference(f.files, { file }, () => true),
      { code: 'INVALID_ARGUMENT' },
    );
  await assert.rejects(
    readImageReference(f.files, ref, () => false),
    { name: 'AbortError' },
  );
  await fs.unlink(path.join(f.directory, ref.file));
  await assert.rejects(
    readImageReference(f.files, ref, () => true),
    { code: 'INVALID_ARGUMENT' },
  );
});
async function settled(f, job, state) {
  return until(() => {
    const view = f.service.get('host', job.jobId);
    return view.state === state && view;
  });
}
test('generation registers original bytes in the selected folder and group; retries do not duplicate files or requests', async (t) => {
  const f = await fixture(t);
  const job = f.service.generateAndRegister('host', f.input);
  assert.equal(job.completion, 'accepted');
  assert.equal(job.state, 'queued');
  const done = await settled(f, job, 'completed');
  assert.equal(done.images.length, 2);
  assert.equal(new Set(done.images.map((i) => i.ref.file)).size, 2);
  assert(
    done.images.every(
      (i) => i.registration === 'saved' && i.ref.file.startsWith('pictures/flower'),
    ),
  );
  for (const image of done.images) assert.deepEqual((await f.files.read(image.ref)).bytes, png);
  assert.equal(f.groups[0].images.length, 2);
  assert(!JSON.stringify(done).includes(png.toString('base64')));
  assert(!JSON.stringify(done).includes('Buffer'));
  assert.equal(f.service.generateAndRegister('host', f.input).jobId, job.jobId);
  f.service.retrySave('host', job.jobId);
  assert.equal(f.requests(), 1);
  assert.throws(
    () => f.service.generateAndRegister('host', { ...f.input, destination: { folder: '' } }),
    { code: 'IMAGE_AI_REQUEST_CONFLICT' },
  );
  assert.throws(() => f.service.read('host', { jobId: job.jobId, imageId: done.images[0].id }), {
    code: 'NOT_FOUND',
  });
});
test('partial file saves and group-only failures retain references and retry only unfinished work', async (t) => {
  const f = await fixture(t);
  const save = f.registration.save.bind(f.registration);
  let attempts = 0,
    fail = true;
  f.registration.save = async (...args) => {
    if (++attempts === 2 && fail) throw Error('fixture second file failure');
    return save(...args);
  };
  const job = f.service.generateAndRegister('host', f.input);
  const partial = await settled(f, job, 'unsaved');
  assert.equal(partial.images.filter((i) => i.ref).length, 1);
  const ref = partial.images[0].ref;
  fail = false;
  f.groupWrites(false);
  f.service.retrySave('host', job.jobId);
  const groupPending = await settled(f, job, 'unsaved');
  assert.equal(groupPending.images.filter((i) => i.ref).length, 2);
  assert.equal(groupPending.images[1].registration, 'group-pending');
  f.groupWrites(true);
  f.service.retrySave('host', job.jobId);
  const done = await settled(f, job, 'completed');
  assert.deepEqual(done.images[0].ref, ref);
  assert.equal(f.files.list().length, 2);
  assert.equal(f.requests(), 1);
});
test('invalid destinations reject before billing and retained results retry after elapsed time', async (t) => {
  const f = await fixture(t);
  for (const destination of [
    { folder: '../escape' },
    { folder: 'missing' },
    { folder: '', name: '../escape' },
    { folder: '', group: 'missing' },
  ])
    assert.throws(() => f.service.generateAndRegister('host', { ...f.input, destination }), {
      code: 'INVALID_ARGUMENT',
    });
  assert.equal(f.requests(), 0);
  const job = f.service.generateAndRegister('host', f.input);
  f.writes(false);
  await settled(f, job, 'unsaved');
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  t.mock.timers.tick(31 * 60 * 1000);
  f.writes(true);
  f.service.retrySave('host', job.jobId);
  await settled(f, job, 'completed');
  assert.equal(f.requests(), 1);
});
test('owner leases, permission revocation and cancellation cannot save later images', async (t) => {
  const f = await fixture(t);
  let release;
  const original = f.registration.save.bind(f.registration);
  f.registration.save = async (...args) => {
    await original(...args);
    await new Promise((r) => {
      release = r;
    });
  };
  const job = f.service.generateAndRegister('host', f.input);
  await until(() => release);
  assert.throws(() => f.service.get('mcp:0:other', job.jobId), { code: 'NOT_FOUND' });
  f.grants(false);
  f.service.reconcile();
  release();
  const canceled = await settled(f, job, 'canceled');
  await until(() => f.service.get('host', job.jobId).images.some((i) => i.ref));
  assert.equal(canceled.state, 'canceled');
  assert.equal(f.files.list().length, 1);
  assert.throws(() => f.service.generateAndRegister('host', { ...f.input, requestId: 'denied' }), {
    code: 'API_DISABLED',
  });
});
test('canceling an unsaved job disposes retries while keeping its saved images', async (t) => {
  const f = await fixture(t);
  f.groupWrites(false);
  const job = f.service.generateAndRegister('host', f.input);
  await settled(f, job, 'unsaved');
  const canceled = f.service.cancel('host', job.jobId);
  assert.equal(canceled.state, 'canceled');
  assert.equal(canceled.images.filter((image) => image.ref).length, 2);
  assert.equal(canceled.resultExpiresAt, undefined);
  f.groupWrites(true);
  assert.throws(() => f.service.retrySave('host', job.jobId), { code: 'INVALID_ARGUMENT' });
  assert.equal(f.files.list().length, 2);
  assert.equal(f.requests(), 1);
});
test('an immediate retry from the terminal notification starts a new save attempt', async (t) => {
  const f = await fixture(t);
  f.groupWrites(false);
  const job = f.service.generateAndRegister('host', f.input);
  let retried = false;
  f.service.options.changed = () => {
    const view = f.service.get('host', job.jobId);
    if (!retried && view.state === 'unsaved') {
      retried = true;
      f.groupWrites(true);
      f.service.retrySave('host', job.jobId);
    }
  };
  await settled(f, job, 'completed');
  assert(retried);
  assert.equal(f.files.list().length, 2);
  assert.equal(f.requests(), 1);
  f.service.options.changed = undefined;
});
