const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { GenerationStore } = require('../out/main/main/core/generation-store');
const { BackgroundJobs } = require('../out/main/main/core/background-jobs');
const { ImageAiService } = require('../out/main/main/core/image-ai-service');
const { ImageGeneration } = require('../out/main/main/core/image-generation');
const { RegisteredAssets } = require('../out/main/main/core/registered-assets');
const { newImageAiConnection } = require('../out/main/shared/image-ai');
const png = require('./fixtures/image-ai-png.cjs');
const response = () =>
  new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
    headers: { 'Content-Type': 'application/json' },
  });
const root = () => {
  const directory = path.resolve('.artifacts/background-jobs-unit', randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  return directory;
};
const until = async (predicate) => {
  for (let n = 0; n < 400; n++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw Error('Fixture operation did not settle');
};
function imageFixture(t, change = {}) {
  const store = change.store ?? new GenerationStore(path.join(root(), 'recovery'));
  const background = new BackgroundJobs();
  const connection = {
    ...newImageAiConnection('fixture'),
    name: 'fixture',
    baseUrl: 'http://fixture/v1',
    authentication: 'none',
    defaultModel: 'fixture',
  };
  let calls = 0,
    saves = 0,
    failSave = false;
  const options = {
    store,
    background,
    settings: () => ({ connections: [connection] }),
    key: () => undefined,
    canUse: () => true,
    fetcher: async () => {
      calls++;
      return response();
    },
    registration: {
      validate: (value) => value,
      save: async (image) => {
        if (failSave) throw Error('disk offline');
        assert.deepEqual(image.bytes, png);
        saves++;
        image.ref = { file: image.id + '.png' };
        image.grouped = true;
        image.checkpoint?.();
      },
    },
    ...change,
    store,
    background,
  };
  const service = new ImageAiService(options);
  t.after(() => service.close());
  const start = (owner = 'host') =>
    service.generateAndRegister(owner, {
      requestId: randomUUID(),
      connectionId: connection.id,
      input: 'fixture',
      destination: { folder: '' },
    });
  return {
    store,
    service,
    background,
    options,
    start,
    calls: () => calls,
    saves: () => saves,
    failSave: (value) => {
      failSave = value;
    },
  };
}

test('unsaved images cannot be dismissed; deleting results retains the job across restart until X removes it', async (t) => {
  const f = imageFixture(t);
  f.failSave(true);
  const job = f.start();
  await until(() => f.service.hostGet(job.jobId).state === 'unsaved');
  await assert.rejects(f.service.hostDismiss(job.jobId), /保存|save/);
  assert.equal(f.background.summary().attention, 1);
  const resultId = f.service.hostGet(job.jobId).images[0].id;
  await f.service.hostDeleteResults(job.jobId);
  assert.equal(fs.existsSync(path.join(f.store.directory, job.jobId, resultId + '.bin')), false);
  assert.equal(f.service.hostItems()[0].resultsDeleted, true);
  assert.equal(f.background.summary().ended, 1);
  await f.service.close();
  const next = imageFixture(t, { store: new GenerationStore(f.store.directory) });
  assert.equal(next.service.hostItems()[0].job.jobId, job.jobId);
  assert.equal(next.service.hostItems()[0].resultsDeleted, true);
  await next.service.hostDismiss(job.jobId);
  assert.equal(next.background.snapshot().jobs.length, 0);
  assert.deepEqual(new GenerationStore(f.store.directory).load('image'), []);
});

test('dismissal verifies rescue copies again and keeps the exported bytes after removing a job', async (t) => {
  const f = imageFixture(t);
  f.failSave(true);
  const job = f.start();
  await until(() => f.service.hostGet(job.jobId).state === 'unsaved');
  const id = f.service.hostGet(job.jobId).images[0].id;
  const file = path.join(root(), 'rescued.png');
  fs.writeFileSync(file, png);
  const hash = require('node:crypto').createHash('sha256').update(png).digest('hex');
  f.service.hostRescued(job.jobId, [{ id, file, hash }]);
  await f.service.close();
  const next = imageFixture(t, { store: new GenerationStore(f.store.directory) });
  fs.writeFileSync(file, 'replaced');
  await assert.rejects(next.service.hostDismiss(job.jobId));
  assert.deepEqual(next.service.hostExport(job.jobId)[0].bytes, png);
  fs.writeFileSync(file, png);
  await next.service.hostDismiss(job.jobId);
  assert.deepEqual(fs.readFileSync(file), png);
  assert.equal(next.background.summary().ended + next.background.summary().attention, 0);
});

test('explicit result deletion resumes after a crash without removing the job or reviving bytes', () => {
  const store = new GenerationStore(root());
  const record = { version: 1, kind: 'image', id: randomUUID(), data: {}, results: [] };
  const id = randomUUID();
  store.preserve(record, id, 'image/png', png);
  record.deletedResults = [id];
  store.save(record); // Crash boundary: intent committed, bytes not removed yet.
  const recovered = new GenerationStore(store.directory).load('image');
  assert.equal(recovered.length, 1);
  assert.equal(fs.existsSync(path.join(store.directory, record.id, id + '.bin')), false);
  assert.throws(() => store.read(recovered[0], id));
  recovered[0].retired = true;
  store.save(recovered[0]);
  assert.deepEqual(new GenerationStore(store.directory).load('image'), []);
  assert.equal(fs.existsSync(path.join(store.directory, record.id)), false);
});

test('job summary counts requests once and keeps attention separate from terminal outcomes', () => {
  const jobs = new BackgroundJobs();
  const values = [
    'queued',
    'running',
    'canceling',
    'attention',
    'completed',
    'failed',
    'canceled',
  ].map((state, i) => ({
    jobId: String(i),
    state,
    shutdownImpact: { active: false },
    resultSummary: { saved: 5, pending: 0 },
  }));
  jobs.register('fixture', { snapshot: () => values });
  assert.deepEqual(jobs.summary(), {
    active: 3,
    ended: 3,
    attention: 1,
    completed: 1,
    failed: 1,
    canceled: 1,
  });
  values.pop();
  assert.equal(jobs.summary().ended, 2);
});

test('job removal never sweeps uncommitted recovery files or treats malformed retirement as consent', () => {
  const store = new GenerationStore(root());
  const record = { version: 1, kind: 'image', id: randomUUID(), data: {}, results: [] };
  store.save(record);
  const partial = path.join(store.directory, record.id, '.preserved.partial');
  fs.writeFileSync(partial, png);
  assert.throws(() => store.discard(record), /Uncommitted/);
  assert.deepEqual(fs.readFileSync(partial), png);
  record.retired = 'false';
  store.save(record);
  const restored = new GenerationStore(store.directory);
  assert.deepEqual(restored.load('image'), []);
  assert(restored.issues.length);
  assert.deepEqual(fs.readFileSync(partial), png);
});

test('results survive restart and clock changes; corrupt and orphan files are retained for inspection', () => {
  const store = new GenerationStore(path.join(root(), 'recovery'));
  const record = {
    version: 1,
    id: randomUUID(),
    kind: 'image',
    data: { note: 'fixture' },
    results: [],
  };
  const resultId = randomUUID();
  store.preserve(record, resultId, 'image/png', png);
  const reopened = new GenerationStore(store.directory);
  const loaded = reopened.load('image')[0];
  assert.deepEqual(reopened.read(loaded, resultId), png);
  const binary = path.join(store.directory, record.id, resultId + '.bin');
  fs.writeFileSync(binary, 'corrupt');
  assert.throws(() => reopened.read(loaded, resultId), /integrity/);
  assert(fs.existsSync(binary));
  const orphan = path.join(store.directory, record.id, '.orphan.partial');
  fs.writeFileSync(orphan, png);
  fs.writeFileSync(path.join(store.directory, record.id, 'manifest.json'), '{broken');
  const damaged = new GenerationStore(store.directory);
  assert.equal(damaged.load('image').length, 0);
  assert(damaged.issues.length);
  assert.throws(() => damaged.preflight());
  assert(fs.existsSync(orphan));
});

test('recovery storage rejects traversal and redirected directories without touching the target', () => {
  const directory = root(),
    outside = path.join(directory, 'outside'),
    redirected = path.join(directory, 'recovery');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, redirected, process.platform === 'win32' ? 'junction' : 'dir');
  const store = new GenerationStore(redirected);
  assert.throws(() => store.preflight());
  assert.throws(() =>
    store.save({ version: 1, kind: 'image', id: '../outside', results: [], data: {} }),
  );
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('image save failure survives service reconstruction and retries exact output without network', async (t) => {
  const f = imageFixture(t);
  f.failSave(true);
  const job = f.start();
  await until(() => f.service.hostGet(job.jobId).state === 'unsaved');
  assert.equal(f.background.snapshot().jobs[0].shutdownImpact.volatile, 0);
  await f.service.close();
  let regenerated = 0,
    saved;
  const recovered = imageFixture(t, {
    store: new GenerationStore(f.store.directory),
    fetcher: async () => {
      regenerated++;
      throw Error('must not generate');
    },
    registration: {
      validate: (value) => value,
      save: async (image) => {
        saved = image.bytes;
        image.ref = { file: 'recovered.png' };
        image.grouped = true;
        image.checkpoint();
      },
    },
  });
  assert.equal(recovered.service.hostItems()[0].job.jobId, job.jobId);
  assert.throws(() => recovered.service.get('host', job.jobId), { code: 'NOT_FOUND' });
  recovered.service.hostRetry(job.jobId);
  await until(() => recovered.service.hostGet(job.jobId).state === 'completed');
  assert.deepEqual(saved, png);
  assert.equal(regenerated, 0);
  assert.equal(f.calls(), 1);
});

test('dialog and page detach keep a generation alive and reopen the same job', async (t) => {
  let release;
  const f = imageFixture(t, {
    fetcher: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const dialog = new ImageGeneration({
    ai: f.service,
    library: { assertWritable() {}, images: { folders: [''], entry: () => undefined } },
    configuration: f.options.settings,
    send() {},
    changed() {},
    failed() {},
  });
  const closed = dialog.open('page-1', '');
  const id = dialog.current().id;
  await dialog.act(id, {
    kind: 'generate',
    folder: '',
    input: { requestId: randomUUID(), connectionId: 'fixture', input: 'fixture' },
  });
  const jobId = dialog.current().items[0].job.jobId;
  await until(() => release);
  dialog.cancel('page-1');
  await closed;
  assert.equal(f.service.hostGet(jobId).state, 'running');
  release(response());
  await until(() => f.service.hostGet(jobId).state === 'completed');
  void dialog.open('page-2', '');
  assert.equal(dialog.current().items[0].job.jobId, jobId);
  await assert.rejects(dialog.act(id, { kind: 'close' }));
  dialog.cancel();
});

test('storage failure preserves RAM, blocks new paid requests and can retry after repair', async (t) => {
  const f = imageFixture(t);
  const preserve = f.store.preserve.bind(f.store);
  f.store.preserve = () => {
    throw Error('disk full');
  };
  const job = f.start();
  await until(() => f.service.hostGet(job.jobId).state === 'unsaved');
  assert.equal(f.background.snapshot().jobs[0].shutdownImpact.volatile, 1);
  assert.deepEqual(f.service.hostExport(job.jobId)[0].bytes, png);
  assert.throws(() => f.start());
  assert.equal(f.calls(), 1);
  f.store.preserve = preserve;
  f.service.hostRetry(job.jobId);
  await until(() => f.service.hostGet(job.jobId).state === 'completed');
  assert.equal(f.background.snapshot().jobs[0].shutdownImpact.volatile, 0);
});

test('revoked owners cannot read their jobs but late complete output remains available to trusted recovery', async (t) => {
  let release;
  const f = imageFixture(t, {
    fetcher: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const job = f.start('applet:fixture');
  await until(() => release);
  f.service.forgetOwner('applet:fixture');
  release(response());
  await until(() => f.service.hostGet(job.jobId).images?.length);
  assert.throws(() => f.service.get('applet:fixture', job.jobId), { code: 'NOT_FOUND' });
  assert.deepEqual(f.service.hostExport(job.jobId)[0].bytes, png);
  assert.equal(f.saves(), 0);
});

test('registration journal recovers the exact committed file and rejects deleted or replaced targets', async () => {
  const directory = root();
  const policy = {
    media: 'image',
    assignedDirectory: '',
    maxBytes: 1e6,
    format: () => 'png',
    validate: async () => ({ width: 1, height: 1, thumbnail: '', circle: '' }),
  };
  const files = new RegisteredAssets(directory, policy);
  let intent;
  const saved = await files.addVerified(png, 'result.png', {
    unique: true,
    journal: {
      prepare: (value) => {
        intent = value;
      },
    },
  });
  const recovered = new RegisteredAssets(directory, policy);
  const again = await recovered.addVerified(png, 'result.png', {
    unique: true,
    journal: {
      intent,
      prepare() {
        assert.fail('must not reserve another name');
      },
    },
  });
  assert.deepEqual(again.ref, saved.ref);
  assert.equal(fs.readdirSync(directory).length, 1);
  fs.unlinkSync(path.join(directory, saved.ref.file));
  await assert.rejects(
    recovered.addVerified(png, 'result.png', { unique: true, journal: { intent, prepare() {} } }),
  );
  fs.writeFileSync(path.join(directory, saved.ref.file), png);
  await assert.rejects(recovered.recoverRegistration(intent));
  files.stop();
  recovered.stop();
});

test('canceling exit leaves sources usable; RAM-only results require a second explicit decision', async () => {
  const jobs = new BackgroundJobs();
  let settled = 0;
  const job = {
    jobId: 'one',
    kind: 'fixture',
    owner: 'host',
    origin: 'test',
    state: 'running',
    phase: 'generating',
    createdAt: '',
    updatedAt: '',
    actions: ['cancel'],
    shutdownImpact: { active: true, preserved: 0, volatile: 0 },
    resultSummary: { saved: 0, pending: 0 },
  };
  jobs.register('fixture', {
    snapshot: () => [job],
    cancel() {},
    retry() {},
    close: async () => {},
    settle: async () => {
      settled++;
      job.shutdownImpact.active = false;
      job.shutdownImpact.volatile = 1;
    },
  });
  assert.equal(await jobs.prepareStop(async () => false), false);
  jobs.assertAccepting();
  assert.equal(settled, 0);
  const decisions = [];
  assert.equal(
    await jobs.prepareStop(async (_jobs, loss) => {
      decisions.push(loss);
      return !loss;
    }),
    false,
  );
  assert.deepEqual(decisions, [false, true]);
  jobs.assertAccepting();
  assert.equal(await jobs.prepareStop(async () => true), true);
  assert.throws(() => jobs.assertAccepting());
});

test('explicit original deletion removes only the selected recovery record', () => {
  const directory = root(),
    store = new GenerationStore(path.join(directory, 'recovery'));
  const records = [0, 1].map(() => ({
    version: 1,
    id: randomUUID(),
    kind: 'image',
    data: {},
    results: [],
  }));
  const resultIds = [randomUUID(), randomUUID()];
  records.forEach((record, i) => store.preserve(record, resultIds[i], 'image/png', png));
  fs.writeFileSync(path.join(directory, 'registered.png'), png);
  store.discard(records[0]);
  assert(!fs.existsSync(path.join(store.directory, records[0].id)));
  assert.deepEqual(store.read(records[1], resultIds[1]), png);
  assert.deepEqual(fs.readFileSync(path.join(directory, 'registered.png')), png);
});

test('concurrent quit requests cannot bypass a pending loss confirmation', async () => {
  const jobs = new BackgroundJobs();
  let release,
    prompts = 0;
  jobs.register('fixture', {
    snapshot: () => [
      {
        jobId: 'one',
        shutdownImpact: { active: false, volatile: 1 },
        resultSummary: { pending: 0 },
      },
    ],
    close: async () => {},
    settle: async () => {},
    cancel() {},
    retry() {},
  });
  const confirm = async () => {
    prompts++;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const first = jobs.prepareStop(confirm);
  await until(() => release);
  let secondSettled = false;
  const second = jobs.prepareStop(confirm).then((value) => {
    secondSettled = true;
    return value;
  });
  await Promise.resolve();
  assert.equal(secondSettled, false);
  assert.equal(prompts, 1);
  release(false);
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  jobs.assertAccepting();
});
