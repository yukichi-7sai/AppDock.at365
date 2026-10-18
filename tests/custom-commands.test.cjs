const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const {
  CustomCommandService,
  compileCustomType,
} = require('../out/main/main/core/custom-commands');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { SettingsStore } = require('../out/main/main/core/settings');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { CommandContexts } = require('../out/main/main/core/command-contexts');
const {
  parseCustomTypes,
  parseCustomCommands,
  customCommandId,
  customUpdateCommand,
} = require('../out/main/shared/custom-commands');
const { parseSettings, createDefaultSettings } = require('../out/main/shared/settings-schema');
const { operationsFor } = require('../out/main/shared/appdock-api');
const type = {
  id: 'test.custom.echo',
  title: 'Echo',
  configVersion: 1,
  automation: true,
  configSchema: {
    type: 'object',
    properties: { message: { type: 'string', maxLength: 100 } },
    required: ['message'],
    additionalProperties: false,
  },
  fields: [{ key: 'message', title: 'Message', type: 'string', default: 'hello' }],
};
function fixture(t, extra = {}) {
  const root = path.resolve('.artifacts/custom-commands-unit');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const store = new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  const save = (v, r) => store.save(v, r);
  const settingsCommands = new SettingsCommands({ settings: store, applets: () => [], save });
  const provider = {
    owner: { kind: 'applet', id: 'test.custom' },
    title: 'Custom',
    types: [structuredClone(type)],
    generation: 'g1',
    available: true,
    invoke: async (d) => ({ echo: d.config.message }),
  };
  const options = {
    settings: store,
    settingsCommands,
    save,
    providers: () => [provider],
    ...extra,
  };
  const service = new CustomCommandService(options);
  service.registerApplet('test.custom', 'g1', type.id);
  const revision = () => settingsCommands.revision();
  const descriptor = () => service.descriptors()[0];
  const update = (operations, caller, dryRun = false) =>
    service.update({ expectedRevision: revision(), operations, dryRun }, caller);
  const add = (changes = {}, caller) => {
    const item = {
      id: randomUUID(),
      title: 'Saved',
      typeId: type.id,
      configVersion: 1,
      config: { message: 'secret config' },
      enabled: true,
      automation: false,
      ...changes,
    };
    update([{ op: 'add', item, expectedTypeRevision: descriptor().typeRevision }], caller);
    return item;
  };
  return {
    store,
    dir,
    provider,
    options,
    service,
    settingsCommands,
    revision,
    descriptor,
    update,
    add,
  };
}
test('codec preserves unknown blocks and rejects unsafe or oversized known definitions', () => {
  const old = createDefaultSettings();
  assert.equal(parseSettings(old).customCommands, undefined);
  const future = { version: 9, unknown: { data: [1, 2] } };
  assert.deepEqual(parseSettings({ ...old, customCommands: future }).customCommands, future);
  const item = {
    id: randomUUID(),
    title: 'x',
    description: '',
    typeId: type.id,
    owner: { kind: 'applet', id: 'test.custom' },
    configVersion: 9,
    config: { x: 1 },
    enabled: false,
    automation: false,
  };
  assert.deepEqual(parseCustomCommands({ version: 2, items: [item] }).items, [item]);
  assert.deepEqual(parseCustomCommands({ version: 1, items: [item] }), {
    version: 1,
    items: [item],
  });
  for (const items of [
    [item, item],
    [{ ...item, config: { x: 'x'.repeat(16384) } }],
    [{ ...item, owner: { kind: 'host', id: 'spoof' } }],
    [{ ...item, config: JSON.parse('{"__proto__":1}') }],
  ])
    assert.throws(() => parseCustomCommands({ version: 2, items }));
});
test('descriptions are common metadata, normalized and published without config', (t) => {
  const f = fixture(t),
    item = f.add({ automation: true, description: '用途\r\n条件' });
  assert.equal(f.store.value.customCommands.version, 2);
  assert.equal(f.service.publicCommands()[0].description, '用途\n条件');
  assert.equal(
    f.service.read('customCommands.get', { id: item.id }).item.description,
    '用途\n条件',
  );
  const expectedTypeRevision = f.descriptor().typeRevision;
  f.update([{ op: 'update', id: item.id, changes: { title: 'renamed' } }]);
  assert.equal(f.service.publicCommands()[0].description, '用途\n条件');
  for (const description of [null, false, 0, {}, 'x'.repeat(1001), 'bad\0value'])
    assert.throws(
      () => f.update([{ op: 'update', id: item.id, changes: { description } }]),
      (e) => e.code === 'INVALID_ARGUMENT',
    );
  f.update([{ op: 'update', id: item.id, changes: { description: '' } }]);
  assert.equal(f.service.publicCommands()[0].description, '');
  assert.equal(f.descriptor().typeRevision, expectedTypeRevision);
  assert(!JSON.stringify(f.service.publicCommands()).includes('secret config'));
});

test('old storage is inert and only explicit JSON replacement creates the new format', (t) => {
  const f = fixture(t),
    item = f.add();
  const legacy = {
    ...f.store.value,
    customCommands: { ...f.store.value.customCommands, version: 1 },
  };
  f.store.save(legacy, f.store.revision);
  assert.equal(f.service.has(customCommandId(item.id)), false);
  assert.equal(f.service.read('customCommands.list', {}).supportedVersion, false);
  assert.throws(
    () => f.add(),
    (e) => e.code === 'UNSUPPORTED_VERSION',
  );
  const replacement = { ...f.store.value, customCommands: { version: 2, items: [] } };
  f.service.validateReplacement(replacement);
  assert.equal(f.store.value.customCommands.version, 1);
  f.options.save(replacement, f.store.revision);
  assert.deepEqual(f.store.value.customCommands, { version: 2, items: [] });
});

test('description edits leave in-flight execution snapshots running', async (t) => {
  const f = fixture(t),
    item = f.add();
  let finish;
  f.provider.invoke = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const running = f.service.execute(customCommandId(item.id));
  f.update([{ op: 'update', id: item.id, changes: { description: 'new purpose' } }]);
  finish({ ok: true });
  assert.equal((await running).result.ok, true);
});

test('schema accepts only bounded local acyclic common keywords and checks defaults', () => {
  assert.equal(
    compileCustomType(parseCustomTypes('test.custom', [type])[0])({ message: 'ok' }).valid,
    true,
  );
  for (const schema of [
    { ...type.configSchema, unevaluatedProperties: false },
    { ...type.configSchema, $ref: 'https://example.test/schema' },
    { ...type.configSchema, pattern: '(a+)+' },
    { ...type.configSchema, $defs: { a: { $ref: '#/$defs/a' } }, $ref: '#/$defs/a' },
  ])
    assert.throws(() => parseCustomTypes('test.custom', [{ ...type, configSchema: schema }]));
  assert.throws(() => parseCustomTypes('other', [type]));
  assert.throws(() =>
    compileCustomType({
      ...type,
      fields: [{ key: 'message', type: 'string', title: 'x', default: 123 }],
    }),
  );
  const local = {
    ...type,
    configSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      $defs: { message: { type: 'string' } },
      properties: { message: { $ref: '#/$defs/message' } },
      required: ['message'],
    },
    fields: undefined,
  };
  delete local.fields;
  assert.equal(
    compileCustomType(parseCustomTypes('test.custom', [local])[0])({ message: 'ok' }).valid,
    true,
  );
});
test('CRUD is atomic, dry runs are inert and revisions/types are checked', (t) => {
  const f = fixture(t),
    item = f.add(),
    original = structuredClone(f.store.value),
    rev = f.revision();
  f.update([{ op: 'update', id: item.id, changes: { title: 'Dry' } }], undefined, true);
  assert.deepEqual(f.store.value, original);
  assert.throws(
    () =>
      f.update([
        { op: 'update', id: item.id, changes: { title: 'Changed' } },
        { op: 'remove', id: randomUUID() },
      ]),
    (e) => e.code === 'NOT_FOUND',
  );
  assert.deepEqual(f.store.value, original);
  assert.throws(
    () =>
      f.update([
        {
          op: 'update',
          id: item.id,
          changes: { config: { message: 'changed' } },
          expectedTypeRevision: 'stale',
        },
      ]),
    (e) => e.code === 'TYPE_CHANGED',
  );
  f.update([{ op: 'update', id: item.id, changes: { title: 'Changed' } }]);
  assert.equal(f.service.uiCommands()[0].id, customCommandId(item.id));
  assert.throws(
    () => f.service.update({ expectedRevision: rev, operations: [{ op: 'remove', id: item.id }] }),
    (e) => e.code === 'REVISION_CONFLICT',
  );
  assert.throws(() => f.update([{ op: 'update', id: item.id, changes: { typeId: 'other' } }]));
  const replacement = structuredClone(f.store.value);
  replacement.customCommands.items[0].owner = { kind: 'host' };
  assert.throws(() => f.service.validateReplacement(replacement));
});
test('saved definitions remain shared across device-local Applet settings', (t) => {
  const f = fixture(t);
  f.add();
  const store = new DeviceSettingsStore(
    path.join(f.dir, 'settings.json'),
    path.join(f.dir, 'local'),
    'CUSTOM-TEST',
  );
  store.load();
  t.after(() => store.close());
  const next = structuredClone(store.value);
  next.customCommands.items[0].title = 'Shared';
  store.save(next, store.revision);
  assert.equal(
    JSON.parse(fs.readFileSync(store.shared.file)).customCommands.items[0].title,
    'Shared',
  );
  assert.equal(JSON.parse(fs.readFileSync(store.device.file)).customCommands, undefined);
});
test('owner scope cannot be broadened; Applet cannot publish; no config in summaries', (t) => {
  const f = fixture(t),
    item = f.add({}, 'test.custom');
  assert.equal(f.service.read('customCommands.list', {}, 'other').items.length, 0);
  assert.throws(
    () => f.service.read('customCommands.list', { ownerId: 'test.custom' }, 'other'),
    (e) => e.code === 'PERMISSION_DENIED',
  );
  assert.throws(
    () => f.update([{ op: 'update', id: item.id, changes: { automation: true } }], 'test.custom'),
    (e) => e.code === 'PERMISSION_DENIED',
  );
  assert.throws(
    () => f.add({ automation: true }, 'test.custom'),
    (e) => e.code === 'PERMISSION_DENIED',
  );
  assert.ok(!JSON.stringify(f.service.read('customCommands.list', {})).includes('secret config'));
  assert.ok(!JSON.stringify(f.service.uiCommands()).includes('secret config'));
});
test('publication requires both declarations; stopped and unknown versions preserve identities', async (t) => {
  const f = fixture(t),
    item = f.add({ automation: true }),
    id = customCommandId(item.id);
  assert.deepEqual((await f.service.execute(id, { origin: { kind: 'mcp' } })).result, {
    echo: 'secret config',
  });
  f.provider.types[0].automation = false;
  assert.equal(f.service.publicCommands().length, 0);
  await assert.rejects(
    f.service.execute(id, { origin: { kind: 'mcp' } }),
    (e) => e.code === 'PERMISSION_DENIED',
  );
  f.provider.types[0].automation = true;
  f.provider.available = false;
  assert.equal(f.service.publicCommands()[0].available, false);
  assert.equal(f.store.value.customCommands.items.length, 1);
  f.provider.available = true;
  f.provider.generation = 'g2';
  assert.equal(f.service.uiCommands()[0].available, false);
  f.service.registerApplet('test.custom', 'g2', type.id);
  assert.equal(f.service.uiCommands()[0].available, true);
  f.provider.types[0].configVersion = 2;
  assert.equal(f.service.uiCommands()[0].available, false);
  f.update([{ op: 'update', id: item.id, changes: { title: 'Still here' } }]);
  f.update([
    {
      op: 'update',
      id: item.id,
      changes: { configVersion: 2, config: { message: 'migrated' } },
      expectedTypeRevision: f.descriptor().typeRevision,
    },
  ]);
  assert.equal(f.service.uiCommands()[0].id, id);
  assert.equal(f.service.uiCommands()[0].available, true);
});
test('execution is snapshot-based, bounded, cancellable and never automatically retried', async (t) => {
  const f = fixture(t, { timeoutMs: 30 }),
    item = f.add({ automation: true }),
    id = customCommandId(item.id);
  let calls = 0,
    received,
    release,
    signal;
  f.provider.invoke = async (d, c) => {
    calls++;
    received = d;
    signal = c.signal;
    await new Promise((r) => (release = r));
    return { ok: true };
  };
  const pending = f.service.execute(id, { origin: { kind: 'mcp' } });
  await assert.rejects(f.service.execute(id), (e) => e.code === 'BUSY');
  f.update([
    {
      op: 'update',
      id: item.id,
      changes: { config: { message: 'new' } },
      expectedTypeRevision: f.descriptor().typeRevision,
    },
  ]);
  assert.equal(received.config.message, 'secret config');
  f.update([{ op: 'update', id: item.id, changes: { automation: false } }]);
  await assert.rejects(pending, (e) => e.code === 'CANCELLED');
  assert.equal(signal.aborted, true);
  release();
  assert.equal(calls, 1);
  const timed = f.service.execute(id);
  await assert.rejects(timed, (e) => e.code === 'OUTCOME_UNKNOWN');
  release();
  f.provider.invoke = async () => ({ large: 'x'.repeat(65536) });
  await assert.rejects(f.service.execute(id), (e) => e.code === 'OUTCOME_UNKNOWN');
});
test('host and Applet providers use the same saved command service', async (t) => {
  const f = fixture(t);
  f.service.registerHost({ ...type, id: 'appdock.test' }, async (config) => ({
    message: config.message,
  }));
  const hostType = f.service.descriptors().find((t) => t.owner.kind === 'host'),
    id = randomUUID();
  f.update([
    {
      op: 'add',
      expectedTypeRevision: hostType.typeRevision,
      item: {
        id,
        title: 'Host',
        typeId: hostType.id,
        configVersion: 1,
        config: { message: 'host' },
      },
    },
  ]);
  assert.equal(f.service.uiCommands().find((c) => c.id === customCommandId(id)).extensionId, null);
  assert.equal((await f.service.execute(customCommandId(id))).result.message, 'host');
});
test('fixed MCP catalog remains unchanged as definitions change; stale cursor rejected', (t) => {
  const f = fixture(t),
    outer = JSON.stringify(operationsFor('mcp'));
  f.add();
  f.add();
  const page = f.service.read('customCommands.list', { limit: 1 });
  assert.equal(page.items.length, 1);
  f.add();
  assert.throws(
    () => f.service.read('customCommands.list', { cursor: page.nextCursor }),
    (e) => e.code === 'STALE_CURSOR',
  );
  assert.equal(JSON.stringify(operationsFor('mcp')), outer);
});
test('API grants separate config management and execution and preserve nested origin', async (t) => {
  const f = fixture(t),
    item = f.add({ automation: true }),
    id = customCommandId(item.id);
  let grants = {
    read: true,
    execute: true,
    write: true,
    manageCustomCommands: false,
    sendInput: true,
  };
  const api = new AppDockApi({
    settings: f.store,
    settingsCommands: f.settingsCommands,
    customCommands: f.service,
    save: f.options.save,
    applets: () => [],
    commands: () => [],
    execute: async () => {},
    ready: () => true,
    version: 'test',
    instanceId: 'test',
    executable: () => true,
    writable: () => true,
    customCommandsManageable: () => false,
    inputAllowed: () => true,
    appletPermissions: () => grants,
    handlers: { 'input.sendKeys': async () => ({ completion: 'inputSubmitted' }) },
  });
  assert.throws(
    () => api.call('customCommands.get', { id: item.id }),
    (e) => e.code === 'API_DISABLED',
  );
  assert.equal((await api.call('commands.execute', { id })).effectVerified, false);
  let invocation;
  f.provider.invoke = async (_definition, context) => {
    invocation = context;
    return {};
  };
  await api.call('commands.execute', { id }, 'different.applet', {
    origin: { kind: 'mcp' },
    apiCaller: { kind: 'mcp' },
  });
  assert.deepEqual(invocation.origin, { kind: 'mcp' });
  assert.deepEqual(invocation.apiCaller, { kind: 'applet', appletId: 'different.applet' });
  await assert.rejects(
    api.call('commands.execute', {
      id: customUpdateCommand,
      args: { expectedRevision: f.revision(), operations: [{ op: 'remove', id: item.id }] },
    }),
    (e) => e.code === 'API_DISABLED',
  );
  grants.manageCustomCommands = true;
  assert.throws(
    () =>
      api.call('customCommands.get', { id: item.id }, 'test.custom', { origin: { kind: 'mcp' } }),
    (e) => e.code === 'API_DISABLED',
  );
  assert.equal(api.call('customCommands.get', { id: item.id }, 'test.custom').item.id, item.id);
  assert.equal(
    (await api.call('input.sendKeys', { keys: 'A' }, 'test.custom', { origin: { kind: 'mcp' } }))
      .completion,
    'inputSubmitted',
  );
  grants.sendInput = false;
  assert.throws(
    () => api.call('input.sendKeys', { keys: 'A' }, 'test.custom', { origin: { kind: 'mcp' } }),
    (e) => e.code === 'API_DISABLED',
  );
  await assert.rejects(
    api.call('commands.execute', { id }, 'test.custom'),
    (e) => e.code === 'SELF_CALL',
  );
  await assert.rejects(
    api.call('commands.execute', { id, args: { override: true } }),
    (e) => e.code === 'INVALID_ARGUMENT',
  );
});
test('host-issued execution identity preserves cancellation and cannot be omitted by external handlers', async () => {
  const contexts = new CommandContexts(),
    controller = new AbortController();
  let identity;
  await contexts.run(
    'test.custom',
    { origin: { kind: 'mcp' }, signal: controller.signal, window: '123', session: 'gesture' },
    async (id) => {
      identity = id;
      assert.equal(contexts.get('test.custom', id).origin.kind, 'mcp');
      assert.throws(() => contexts.get('other', id));
      assert.throws(() => contexts.get('test.custom'));
      controller.abort();
      assert.equal(contexts.get('test.custom', id).signal.aborted, true);
    },
  );
  assert.throws(() => contexts.get('test.custom', identity));
});
