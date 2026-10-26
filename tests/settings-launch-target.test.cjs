const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const {
  WindowsLaunch,
  WindowsOperationCancelled,
} = require('../out/main/main/core/windows-launch');
const { launchSettingsTarget } = require('../out/main/main/core/settings-launch-target');
const { parseSettings } = require('../out/main/shared/settings-schema');
const targetId = 'service.launch';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};
async function fixture(
  t,
  { supported = true, administrator = true, initial = {}, journalBlocked = false } = {},
) {
  const dir = path.resolve('.artifacts/settings-launch-unit', randomUUID()),
    local = path.join(dir, 'local');
  fs.mkdirSync(local, { recursive: true });
  const store = new DeviceSettingsStore(
    path.join(dir, 'settings.json'),
    local,
    'TEST',
    () => [],
    () => [],
  );
  store.load();
  t.after(() => store.close());
  if (Object.keys(initial).length)
    store.save({ ...store.value, host: { ...store.value.host, ...initial } }, store.revision);
  for (const name of ['ai-keys.json', 'tts-key.json', 'mcp-client.json'])
    fs.writeFileSync(path.join(local, name), '{"fixture":"PRESERVED_CIPHER"}');
  const state = {
    administrator,
    elevated: false,
    registered: false,
    taskElevated: false,
    xml: null,
    reads: 0,
    mutations: 0,
    uac: 0,
    saves: 0,
    failed: 0,
    succeeded: 0,
    write: true,
    ready: true,
    principal: 'one',
    cancel: false,
    osFailure: false,
    saveFailure: false,
    rollbackFailure: false,
    waiting: false,
    gate: deferred(),
    started: deferred(),
  };
  const task = () => ({
    administratorAccount: state.administrator,
    elevated: state.elevated,
    sid: 'S-1-5-21-100-100',
    registered: state.registered,
    taskElevated: state.taskElevated,
    xml: state.xml,
  });
  const run = async (script) => {
    if (script.includes('ConvertTo-Json -Compress')) {
      state.reads++;
      return JSON.stringify(task());
    }
    if (script.includes('-Verb RunAs')) {
      state.uac++;
      if (state.cancel) throw new WindowsOperationCancelled('PRIVATE_UAC_DETAILS');
      const match = script.match(/EncodedCommand ([A-Za-z0-9+/=]+)/);
      assert(match);
      script = Buffer.from(match[1], 'base64').toString('utf16le');
    }
    state.mutations++;
    if (state.waiting) {
      state.waiting = false;
      state.started.resolve();
      await state.gate.promise;
    }
    if (state.osFailure) throw Error('PRIVATE_OS_DETAILS');
    if (state.rollbackFailure && state.mutations > 1) throw Error('PRIVATE_ROLLBACK_DETAILS');
    if (script.includes('RegisterTaskDefinition')) {
      state.registered = true;
      state.taskElevated = script.includes('Principal.RunLevel=1');
      state.xml = '<registered-task/>';
    } else if (script.includes('$folder.RegisterTask($name')) {
      state.registered = true;
      state.taskElevated = false;
      state.xml = '<original-task/>';
    } else if (script.includes('DeleteTask')) {
      state.registered = false;
      state.taskElevated = false;
      state.xml = null;
    } else assert.fail('Unexpected Windows owner script');
    return '';
  };
  const journalDirectory = path.join(
    local,
    journalBlocked ? 'blocked-launch-journal' : 'settings-transactions',
  );
  if (journalBlocked) fs.writeFileSync(journalDirectory, 'blocked fixture');
  const journal = path.join(journalDirectory, 'launch.json');
  const launch = new WindowsLaunch(
    'C:\\MCP launch fixture\\AppDock.exe',
    dir,
    [],
    supported,
    run,
    { changed: () => {}, failed: () => state.failed++, succeeded: () => state.succeeded++ },
    {
      file: journal,
      desiredSaved: (next) =>
        next.startAtLogon === store.value.host.startAtLogon &&
        next.runAsAdministrator === store.value.host.runAsAdministrator,
    },
  );
  await launch.refresh();
  const save = (next, revision, rewrite) => {
      state.saves++;
      if (state.saveFailure) throw Error('PRIVATE_SAVE_DETAILS');
      return store.save(next, revision, undefined, rewrite);
    },
    commands = new SettingsCommands({ settings: store, applets: () => [], save });
  const target = () =>
    launchSettingsTarget({
      settings: store,
      launch,
      checkRevision: (revision) => commands.checkRevision(revision),
      validate: parseSettings,
      save,
    });
  const api = new AppDockApi({
    settings: store,
    settingsCommands: commands,
    serviceSettingsTargets: () => [target()],
    save,
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
  const call = (name, args = {}) => api.call('settings.' + name, args),
    read = () => call('values.get', { targetId }),
    request = (operations, dryRun = false) => ({
      targetId,
      operations,
      dryRun,
      requestId: randomUUID(),
      expectedRevision: read().revision,
      expectedSchemaRevision: call('schema.get', { targetId }).schemaRevision,
    }),
    apply = (changes, dryRun = false) => call('apply', request([{ kind: 'set', changes }], dryRun)),
    bytes = () =>
      [
        store.shared.file,
        store.device.file,
        ...['ai-keys.json', 'tts-key.json', 'mcp-client.json'].map((name) =>
          path.join(local, name),
        ),
      ].map((file) => fs.readFileSync(file));
  return {
    state,
    store,
    launch,
    journal,
    target,
    commands,
    api,
    call,
    read,
    request,
    apply,
    bytes,
  };
}

test('launch discovery and dryRun use cached owner capabilities without OS calls, files or private task data', async (t) => {
  const f = await fixture(t),
    before = f.bytes(),
    reads = f.state.reads;
  const discovery = f.call('targets.list').items.find((item) => item.targetId === targetId);
  assert.equal(discovery.category, 'launch');
  assert.equal(discovery.available, true);
  assert.deepEqual(
    f.call('schema.get', { targetId }).items.map((field) => field.key),
    ['startAtLogon', 'runAsAdministrator'],
  );
  assert(f.read().fields.every((field) => field.inherited && field.value === false));
  assert.equal(f.commands.schema().fields.startAtLogon, undefined);
  assert.equal(f.apply({ startAtLogon: true }, true).completion, 'validated');
  assert.deepEqual(f.bytes(), before);
  assert.equal(f.state.reads, reads);
  assert.equal(f.state.mutations, 0);
  assert.equal(fs.existsSync(f.journal), false);
  for (const text of [f.launch.executable, 'S-1-5-21-100-100', '<registered-task/>'])
    assert(!JSON.stringify(f.read()).includes(text));
});

test('launch apply awaits the Windows owner, saves only this PC and deduplicates pending/replayed requests', async (t) => {
  const f = await fixture(t),
    before = f.bytes(),
    request = f.request([{ kind: 'set', changes: { startAtLogon: true } }]);
  f.state.waiting = true;
  const pending = f.call('apply', request);
  await f.state.started.promise;
  assert.equal(f.store.value.host.startAtLogon, false);
  assert.equal(f.state.saves, 0);
  assert.throws(() => f.call('apply', request), { code: 'BUSY' });
  assert.throws(() => f.apply({ runAsAdministrator: true }), { code: 'BUSY' });
  f.state.gate.resolve();
  const saved = await pending;
  assert.equal(saved.completion, 'settingsSaved');
  assert.equal(saved.effectVerified, false);
  assert.equal(f.state.registered, true);
  assert.equal(f.store.value.host.startAtLogon, true);
  assert.equal(f.read().fields.find((field) => field.key === 'startAtLogon').inherited, false);
  assert.deepEqual(f.bytes()[0], before[0]);
  assert.deepEqual(f.bytes().slice(2), before.slice(2));
  assert.equal(fs.existsSync(f.journal), false);
  assert.deepEqual(f.call('apply', request), saved);
  assert.equal(f.state.saves, 1);
  const reads = f.state.reads,
    mutations = f.state.mutations;
  assert.equal((await f.apply({ startAtLogon: true })).changed, false);
  assert.equal(f.state.reads, reads);
  assert.equal(f.state.mutations, mutations);
  assert.equal(f.state.saves, 1);
});

test('reset removes the current PC override and unregisters the same owner task without touching other data', async (t) => {
  const f = await fixture(t),
    before = f.bytes();
  await f.apply({ startAtLogon: true });
  const result = await f.call('apply', f.request([{ kind: 'reset', keys: ['startAtLogon'] }]));
  assert.equal(result.completion, 'settingsSaved');
  assert.equal(f.state.registered, false);
  assert.equal(f.store.value.host.startAtLogon, false);
  assert.equal(f.read().fields.find((field) => field.key === 'startAtLogon').inherited, true);
  assert.equal(JSON.parse(fs.readFileSync(f.store.device.file)).host?.startAtLogon, undefined);
  assert.deepEqual(f.bytes()[0], before[0]);
  assert.deepEqual(f.bytes().slice(2), before.slice(2));
});

test('administrator preference uses the owner account check and changes neither the current token nor a disabled logon task', async (t) => {
  const f = await fixture(t);
  const saved = await f.apply({ runAsAdministrator: true });
  assert.equal(f.store.value.host.runAsAdministrator, true);
  assert.equal(f.state.elevated, false);
  assert.equal(f.state.registered, false);
  assert.equal(f.state.mutations, 0);
  assert.equal(saved.applies.runAsAdministrator, 'nextStartAndLogonTask');
  await f.apply({ runAsAdministrator: false });
  assert.equal(f.store.value.host.runAsAdministrator, false);
  const standard = await fixture(t, { administrator: false });
  assert.deepEqual(
    standard
      .call('schema.get', { targetId })
      .items.find((field) => field.key === 'runAsAdministrator').inputSchema.enum,
    [false],
  );
  for (const dryRun of [true, false])
    assert.throws(() => standard.apply({ runAsAdministrator: true }, dryRun), {
      code: 'UNAVAILABLE',
    });
  const imported = await fixture(t, {
    administrator: false,
    initial: { runAsAdministrator: true },
  });
  assert.equal((await imported.apply({ startAtLogon: false })).changed, false);
  assert.throws(() => imported.apply({ startAtLogon: true }), { code: 'UNAVAILABLE' });
  await imported.apply({ runAsAdministrator: false });
  assert.equal(imported.store.value.host.runAsAdministrator, false);
});

test('reset clears a stored false override without running an unnecessary Windows operation', async (t) => {
  const f = await fixture(t),
    document = JSON.parse(fs.readFileSync(f.store.device.file));
  document.host = { ...document.host, startAtLogon: false };
  fs.writeFileSync(f.store.device.file, JSON.stringify(document));
  f.store.reload();
  assert.equal(f.read().fields.find((field) => field.key === 'startAtLogon').inherited, false);
  const reads = f.state.reads;
  assert.equal(
    (await f.call('apply', f.request([{ kind: 'reset', keys: ['startAtLogon'] }]))).changed,
    true,
  );
  assert.equal(JSON.parse(fs.readFileSync(f.store.device.file)).host?.startAtLogon, undefined);
  assert.equal(f.read().fields.find((field) => field.key === 'startAtLogon').inherited, true);
  assert.equal(f.state.reads, reads);
  assert.equal(f.state.mutations, 0);
});

test('UAC cancellation and OS failure preserve saved settings and return safe owner-specific errors', async (t) => {
  const f = await fixture(t);
  await f.apply({ startAtLogon: true });
  const before = f.bytes();
  f.state.cancel = true;
  await assert.rejects(
    f.apply({ runAsAdministrator: true }),
    (error) => error.code === 'CANCELLED' && !error.message.includes('PRIVATE_UAC_DETAILS'),
  );
  assert.equal(f.state.uac, 1);
  assert.equal(f.state.registered, true);
  assert.equal(f.state.taskElevated, false);
  assert.deepEqual(f.bytes(), before);
  assert.equal(fs.existsSync(f.journal), false);
  const failing = await fixture(t);
  failing.state.osFailure = true;
  const failedBefore = failing.bytes();
  await assert.rejects(
    failing.apply({ startAtLogon: true }),
    (error) => error.code === 'APPLY_FAILED' && !error.message.includes('PRIVATE_OS_DETAILS'),
  );
  assert.deepEqual(failing.bytes(), failedBefore);
  assert.equal(failing.launch.isBusy, false);
});

test('a batched administrator and logon change uses the existing same-user elevation path once', async (t) => {
  const f = await fixture(t),
    before = f.bytes(),
    request = f.request([
      { kind: 'set', changes: { startAtLogon: true, runAsAdministrator: true } },
    ]);
  const saved = await f.call('apply', request);
  assert.equal(f.state.uac, 1);
  assert.equal(f.state.registered, true);
  assert.equal(f.state.taskElevated, true);
  assert.equal(f.state.elevated, false);
  assert.equal(f.store.value.host.startAtLogon, true);
  assert.equal(f.store.value.host.runAsAdministrator, true);
  assert.equal(f.state.saves, 1);
  assert.deepEqual(f.call('apply', request), saved);
  assert.equal(f.state.uac, 1);
  assert.deepEqual(f.bytes()[0], before[0]);
  assert.deepEqual(f.bytes().slice(2), before.slice(2));
  assert.equal(fs.existsSync(f.journal), false);
});

test('settings save failure rolls back Windows registration through the existing owner transaction', async (t) => {
  const f = await fixture(t),
    before = f.bytes();
  f.state.saveFailure = true;
  await assert.rejects(
    f.apply({ startAtLogon: true }),
    (error) => error.code === 'SAVE_FAILED' && !error.message.includes('PRIVATE_SAVE_DETAILS'),
  );
  assert.equal(f.state.registered, false);
  assert.equal(f.state.mutations, 2);
  assert.equal(f.store.value.host.startAtLogon, false);
  assert.deepEqual(f.bytes(), before);
  assert.equal(fs.existsSync(f.journal), false);
});

test('a failed recovery-journal write reports owner health before any OS or settings mutation', async (t) => {
  const f = await fixture(t, { journalBlocked: true }),
    before = f.bytes();
  await assert.rejects(f.apply({ startAtLogon: true }), { code: 'APPLY_FAILED' });
  assert.equal(f.state.failed, 1);
  assert.equal(f.state.mutations, 0);
  assert.equal(f.state.saves, 0);
  assert.deepEqual(f.bytes(), before);
  assert.equal(f.launch.isBusy, false);
});

test('write revocation, principal change, external settings and changed account schema roll back an in-flight OS change', async (t) => {
  for (const [change, code] of [
    [(f) => (f.state.write = false), 'WRITE_DISABLED'],
    [(f) => (f.state.principal = 'two'), 'API_DISABLED'],
    [
      (f) =>
        f.store.save(
          { ...f.store.value, host: { ...f.store.value.host, theme: 'dark' } },
          f.store.revision,
        ),
      'REVISION_CONFLICT',
    ],
    [(f) => (f.state.administrator = false), 'SCHEMA_CONFLICT'],
  ]) {
    const f = await fixture(t);
    f.state.waiting = true;
    const pending = f.apply({ startAtLogon: true });
    await f.state.started.promise;
    change(f);
    f.state.gate.resolve();
    await assert.rejects(pending, { code });
    assert.equal(f.store.value.host.startAtLogon, false);
    assert.equal(f.state.registered, false);
    assert.equal(f.state.saves, 0);
    assert.equal(fs.existsSync(f.journal), false);
    if (code === 'REVISION_CONFLICT') assert.equal(f.store.value.host.theme, 'dark');
  }
});

test('unsupported and recovery-pending owners remain readable and reject writes without running Windows', async (t) => {
  const unsupported = await fixture(t, { supported: false });
  assert.equal(unsupported.read().fields.length, 2);
  assert(unsupported.read().fields.every((field) => !field.writable));
  assert.throws(() => unsupported.apply({ startAtLogon: true }, true), { code: 'UNAVAILABLE' });
  assert.equal(unsupported.state.reads, 0);
  const recovery = await fixture(t);
  recovery.launch.recoveryPending = true;
  assert.throws(() => recovery.apply({ startAtLogon: true }), { code: 'UNAVAILABLE' });
  assert.equal(recovery.state.mutations, 0);
});

test('late invalid fields and external device-file conflicts never start a Windows change', async (t) => {
  const f = await fixture(t),
    before = f.bytes();
  for (const operations of [
    [{ kind: 'set', changes: { startAtLogon: true, runAsAdministrator: 'true' } }],
    [{ kind: 'set', changes: { startAtLogon: true, executable: 'C:\\other.exe' } }],
    [
      { kind: 'set', changes: { startAtLogon: true } },
      { kind: 'reset', keys: ['startAtLogon'] },
    ],
  ])
    assert.throws(() => f.call('apply', f.request(operations)));
  assert.deepEqual(f.bytes(), before);
  assert.equal(f.state.mutations, 0);
  const request = f.request([{ kind: 'set', changes: { startAtLogon: true } }]);
  fs.writeFileSync(f.store.device.file, '{bad json');
  assert.throws(() => f.call('apply', request), { code: 'REVISION_CONFLICT' });
  assert.equal(fs.readFileSync(f.store.device.file, 'utf8'), '{bad json');
  assert.equal(f.state.mutations, 0);
});

test('failed OS rollback retains recovery for local action and never exposes raw Windows or storage errors', async (t) => {
  const f = await fixture(t);
  f.state.saveFailure = true;
  f.state.rollbackFailure = true;
  await assert.rejects(
    f.apply({ startAtLogon: true }),
    (error) => error.code === 'LOCAL_ACTION_REQUIRED' && !/PRIVATE_/.test(error.message),
  );
  assert.equal(f.launch.recoveryPending, true);
  assert.equal(fs.existsSync(f.journal), true);
  assert.equal(f.state.registered, true);
  assert.equal(f.store.value.host.startAtLogon, false);
  const discovery = f.call('targets.list').items.find((item) => item.targetId === targetId);
  assert.equal(discovery.available, false);
});
