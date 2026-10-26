const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { SettingsStore } = require('../out/main/main/core/settings');
const { AppDockApi, AutomationError } = require('../out/main/main/core/appdock-api');
const targetId = 'service.async-fixture';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};
function fixture(t, { sync = false, list = false, automatic = false } = {}) {
  const dir = path.resolve('.artifacts/settings-targets-async-unit', randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  const store = new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  const state = {
    value: 'initial',
    serial: 0,
    write: true,
    ready: true,
    principal: 'one',
    shape: 0,
    available: true,
    failure: '',
    large: false,
    starts: 0,
    writes: 0,
    rollbacks: 0,
    tasks: [],
  };
  const fields = list
    ? [
        { key: 'id', title: 'ID', type: 'string' },
        { key: 'name', title: 'Name', type: 'string' },
      ]
    : [{ key: 'value', title: 'Value', type: 'string' }];
  const plan = (changes) => {
    const next = list ? changes[0].name : changes.value,
      planned = state.large ? 'x'.repeat(300000) : next;
    return {
      changed: ['value'],
      before: { value: state.value },
      values: { value: planned },
      applies: { value: 'fixture' },
      commit: (preflight) => {
        state.starts++;
        const finish = () => {
          try {
            preflight();
            if (state.failure === 'before') throw Error('PRIVATE_OWNER_DETAILS');
            state.value = next;
            state.serial++;
            state.writes++;
            if (state.failure === 'after') throw Error('PRIVATE_OWNER_DETAILS');
          } catch (error) {
            state.rollbacks++;
            throw error;
          }
        };
        if (sync) {
          finish();
          return;
        }
        if (automatic) return Promise.resolve().then(finish);
        const task = deferred();
        state.tasks.push(task);
        return task.promise.then(finish);
      },
    };
  };
  const targets = () => [
    {
      targetId,
      ownerId: 'appdock',
      category: 'fixture',
      title: 'Async fixture',
      available: state.available,
      fields,
      applies: () => 'fixture',
      schemaContext: () => state.shape,
      overrides: () => ({ value: state.value, serial: state.serial }),
      plan,
      ...(list
        ? {
            kind: 'list',
            definition: {
              key: 'rows',
              title: 'Rows',
              type: 'object-list',
              fields,
              list: { idKey: 'id' },
            },
            rows: () => [{ id: 'row', name: state.value }],
          }
        : { values: () => ({ value: state.value }) }),
    },
  ];
  const api = new AppDockApi({
    settings: store,
    serviceSettingsTargets: targets,
    save: (next, revision) => store.save(next, revision),
    settingsPrincipal: () => state.principal,
    ready: () => state.ready,
    writable: () => state.write,
    executable: () => false,
    version: 'test',
    instanceId: randomUUID(),
    applets: () => [],
    commands: () => [],
    execute: async () => {
      throw Error('Unexpected execution');
    },
  });
  const call = (name, params = {}) => api.call('settings.' + name, params),
    read = () => call(list ? 'items.list' : 'values.get', { targetId }),
    request = (value, dryRun = false) => ({
      targetId,
      requestId: randomUUID(),
      expectedRevision: read().revision,
      expectedSchemaRevision: call('schema.get', { targetId }).schemaRevision,
      dryRun,
      operations: list
        ? [{ kind: 'update', itemRef: read().items[0].itemRef, changes: { name: value } }]
        : [{ kind: 'set', changes: { value } }],
    });
  return { state, call, read, request };
}

test('existing synchronous owners stay synchronous and an asynchronous dryRun never starts a commit', (t) => {
  const f = fixture(t, { sync: true });
  const result = f.call('apply', f.request('sync'));
  assert.equal(result.then, undefined);
  assert.equal(result.completion, 'settingsSaved');
  assert.equal(f.state.writes, 1);
  const async = fixture(t),
    preview = async.call('apply', async.request('preview', true));
  assert.equal(preview.then, undefined);
  assert.equal(preview.completion, 'validated');
  assert.equal(async.state.starts, 0);
});

test('asynchronous saves await the owner and deduplicate pending and completed request identities', async (t) => {
  const f = fixture(t),
    request = f.request('saved'),
    pending = f.call('apply', request);
  assert(pending instanceof Promise);
  assert.equal(f.state.starts, 1);
  assert.equal(f.state.writes, 0);
  assert.throws(() => f.call('apply', request), { code: 'BUSY' });
  assert.throws(() => f.call('apply', { ...request, dryRun: true }), { code: 'INVALID_ARGUMENT' });
  f.state.tasks[0].resolve();
  const result = await pending;
  assert.equal(result.completion, 'settingsSaved');
  assert.equal(result.effectVerified, false);
  assert.equal(f.state.writes, 1);
  assert.deepEqual(f.call('apply', request), result);
  assert.equal(f.state.starts, 1);
});

test('authorization, readiness, principal, schema, availability and values are rechecked after an owner wait', async (t) => {
  for (const [change, code] of [
    [(s) => (s.write = false), 'WRITE_DISABLED'],
    [(s) => (s.ready = false), 'NOT_READY'],
    [(s) => (s.principal = 'two'), 'API_DISABLED'],
    [(s) => s.shape++, 'SCHEMA_CONFLICT'],
    [(s) => (s.available = false), 'UNAVAILABLE'],
    [
      (s) => {
        s.value = 'external';
        s.serial++;
      },
      'REVISION_CONFLICT',
    ],
  ]) {
    const f = fixture(t),
      pending = f.call('apply', f.request('saved'));
    change(f.state);
    f.state.tasks[0].resolve();
    await assert.rejects(
      pending,
      (error) => error instanceof AutomationError && error.code === code,
    );
    assert.equal(f.state.writes, 0);
    assert.equal(f.state.rollbacks, 1);
    assert.notEqual(f.state.value, 'saved');
  }
});

test('an old in-flight principal cannot overwrite a new principal cache with the same request id', async (t) => {
  const f = fixture(t),
    request = f.request('saved'),
    old = f.call('apply', request);
  f.state.principal = 'two';
  const current = f.call('apply', request);
  assert.equal(f.state.starts, 2);
  f.state.tasks[0].resolve();
  await assert.rejects(old, { code: 'API_DISABLED' });
  f.state.tasks[1].resolve();
  const result = await current;
  assert.deepEqual(f.call('apply', request), result);
  assert.equal(f.state.writes, 1);
  assert.equal(f.state.starts, 2);
});

test('asynchronous failures remain safe and cached even if persistence happened before an owner error', async (t) => {
  for (const failure of ['before', 'after']) {
    const f = fixture(t),
      request = f.request('saved');
    f.state.failure = failure;
    const pending = f.call('apply', request);
    f.state.tasks[0].resolve();
    await assert.rejects(
      pending,
      (error) =>
        error instanceof AutomationError &&
        error.code === 'INTERNAL_ERROR' &&
        !error.message.includes('PRIVATE_OWNER_DETAILS'),
    );
    assert.throws(() => f.call('apply', request), { code: 'INTERNAL_ERROR' });
    assert.equal(f.state.starts, 1);
    assert.equal(f.state.writes, failure === 'after' ? 1 : 0);
  }
});

test('list owners also await a guarded commit without changing the fixed list operations', async (t) => {
  const f = fixture(t, { list: true }),
    request = f.request('changed'),
    pending = f.call('apply', request);
  assert.equal(f.state.value, 'initial');
  f.state.tasks[0].resolve();
  const saved = await pending;
  assert.equal(saved.completion, 'settingsSaved');
  assert.equal(f.read().items[0].values.name, 'changed');
  assert.deepEqual(f.call('apply', request), saved);
});

test('an oversized planned result is rejected before any asynchronous owner action', (t) => {
  const f = fixture(t),
    request = f.request('small');
  f.state.large = true;
  assert.throws(() => f.call('apply', request), { code: 'RESULT_TOO_LARGE' });
  assert.equal(f.state.starts, 0);
  assert.equal(f.state.writes, 0);
});

test('completed asynchronous request caches keep the existing 512-entry bound', async (t) => {
  const f = fixture(t, { automatic: true });
  let first;
  for (let index = 0; index < 514; index++) {
    const request = f.request(String(index));
    if (!first) first = request;
    await f.call('apply', request);
  }
  assert.throws(() => f.call('apply', first), { code: 'REVISION_CONFLICT' });
  assert.equal(f.state.writes, 514);
});
