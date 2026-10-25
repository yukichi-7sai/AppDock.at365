const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SettingsStore } = require('../out/main/main/core/settings');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { parseSettingDefinitions } = require('../out/main/shared/setting-definitions');
const {
  hostSettingDefinitions,
  hostSettingsDefaults,
  specializedHostDefaults,
} = require('../out/main/shared/host-settings');
const {
  settingsCatalog,
  settingsPaths,
  hostSettingItem,
} = require('../out/main/shared/settings-catalog');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { operationsFor } = require('../out/main/shared/appdock-api');

function fixture(t, { device = false, definitions } = {}) {
  const root = path.resolve('.artifacts/settings-targets-unit');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const fields = parseSettingDefinitions(
    definitions ?? [
      { key: 'flag', title: 'Flag', type: 'boolean', default: false },
      { key: 'count', title: 'Count', type: 'number', default: 3, minimum: 1, maximum: 8 },
      {
        key: 'text.key',
        title: 'Text',
        type: 'string',
        default: 'default',
        minLength: 1,
        maxLength: 20,
      },
      {
        key: 'mode',
        title: 'Mode',
        type: 'select',
        default: 'a',
        options: ['a', 'b', 'c'].map((value) => ({ value, label: value.toUpperCase() })),
      },
      { key: 'unset', title: 'Optional text', type: 'string' },
      {
        key: 'hidden',
        title: 'PRIVATE_FIELD',
        type: 'string',
        default: 'PRIVATE_DEFAULT',
        automation: false,
      },
      {
        key: 'credential',
        title: 'PRIVATE_CREDENTIAL',
        type: 'string',
        default: 'PRIVATE_DEFAULT',
        secret: true,
        automation: true,
      },
      {
        key: 'local',
        title: 'PRIVATE_LOCAL',
        type: 'boolean',
        default: false,
        localOnly: true,
        automation: true,
      },
      {
        key: 'records',
        title: 'Records',
        type: 'object-list',
        fields: [{ key: 'name', title: 'Name', type: 'string' }],
        default: [],
      },
    ],
  );
  const owner = {
    id: 'test.target-provider',
    displayName: 'Target provider',
    enabled: true,
    state: 'running',
    settings: fields,
  };
  const owners = [owner];
  const store = device
    ? new DeviceSettingsStore(
        path.join(dir, 'settings.json'),
        path.join(dir, 'local'),
        'TEST',
        () => [],
        () => owners,
      )
    : new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  store.save(
    {
      ...store.value,
      extensions: {
        [owner.id]: {
          enabled: true,
          settings: { hidden: 'PRIVATE_VALUE', unknown: { nested: 'preserved' } },
        },
      },
    },
    store.revision,
  );
  let writes = 0,
    writable = true,
    principal = 'principal-1';
  const options = {
    settings: store,
    applets: () => owners,
    save: (value, revision, reset) => {
      writes++;
      return device
        ? store.save(
            value,
            revision,
            undefined,
            reset
              ? [
                  reset.ownerId === 'appdock' || store.localSettings(reset.ownerId)
                    ? 'device'
                    : 'shared',
                ]
              : [],
          )
        : store.save(value, revision);
    },
  };
  const settingsCommands = new SettingsCommands(options);
  const api = new AppDockApi({
    ...options,
    settingsCommands,
    ready: () => true,
    writable: () => writable,
    executable: () => false,
    settingsPrincipal: () => principal,
    version: 'test',
    instanceId: randomUUID(),
    commands: () => [],
    execute: async () => {},
    appletPermissions: () => ({ read: true, write: true, execute: true }),
  });
  const call = (method, params = {}) => api.call('settings.' + method, params);
  const target = (ownerId = owner.id) => call('targets.list', { ownerId }).items[0].targetId;
  const read = (targetId = target(), keys) =>
    call('values.get', { targetId, ...(keys ? { keys } : {}) });
  const request = (operations, { targetId = target(), ...extra } = {}) => ({
    targetId,
    operations,
    expectedRevision: read(targetId).revision,
    expectedSchemaRevision: call('schema.get', { targetId }).schemaRevision,
    requestId: randomUUID(),
    ...extra,
  });
  return {
    dir,
    store,
    owner,
    owners,
    fields,
    options,
    settingsCommands,
    api,
    call,
    target,
    read,
    request,
    writes: () => writes,
    setWrite: (value) => (writable = value),
    setPrincipal: (value) => (principal = value),
  };
}
const values = (result) =>
  Object.fromEntries(
    result.fields.filter((field) => field.hasValue).map((field) => [field.key, field.value]),
  );

test('fixed MCP entries discover registered fields without exposing private/default/unsupported data', (t) => {
  const f = fixture(t),
    id = f.target();
  assert.equal(f.call('targets.list', { query: 'PRIVATE_FIELD' }).items.length, 0);
  const schema = f.call('schema.get', { targetId: id });
  assert.deepEqual(
    schema.items.map((field) => field.key),
    ['flag', 'count', 'text.key', 'mode', 'unset'],
  );
  assert.equal(schema.items.find((field) => field.key === 'text.key').inputSchema.maxLength, 20);
  assert.equal(
    JSON.stringify([schema, f.read(), f.call('targets.list')]).includes('PRIVATE_'),
    false,
  );
  assert.deepEqual(values(f.read(id, ['flag', 'mode'])), { flag: false, mode: 'a' });
  for (const key of ['credential', 'hidden', 'local', 'records', 'missing'])
    assert.throws(() => f.read(id, [key]), { code: 'NOT_FOUND' });
  assert.throws(() => f.call('items.list', { targetId: id }), { code: 'INVALID_ARGUMENT' });
  const fixedMethods = Object.keys(
    require('../out/main/shared/settings-operations').settingsOperations,
  );
  assert.equal(fixedMethods.length, 6);
  for (const [method, definition] of operationsFor('mcp').filter(([method]) =>
    fixedMethods.includes(method),
  )) {
    assert.equal(
      operationsFor('applet').some(([m]) => m === method),
      false,
      method,
    );
    assert.equal(definition.annotations.readOnlyHint, method !== 'settings.apply');
  }
  assert.throws(() => f.api.call('settings.targets.list', {}, 'test.caller'), {
    code: 'NOT_FOUND',
  });
  assert.throws(() => f.call('values.get', { targetId: '../../settings.json' }), {
    code: 'NOT_FOUND',
  });
});

test('set/reset plans are atomic, preserve private/unknown state and omit default overrides', (t) => {
  const f = fixture(t),
    id = f.target(),
    before = fs.readFileSync(f.store.file, 'utf8'),
    revision = f.read().revision;
  const operations = [{ kind: 'set', changes: { flag: true, count: 5, 'text.key': 'changed' } }];
  const preview = f.call('apply', f.request(operations, { dryRun: true }));
  assert.equal(preview.completion, 'validated');
  assert.equal(preview.effectVerified, false);
  assert.equal(f.read().revision, revision);
  assert.equal(fs.readFileSync(f.store.file, 'utf8'), before);
  assert.equal(f.writes(), 0);
  const saved = f.call('apply', f.request(operations));
  assert.equal(saved.completion, 'settingsSaved');
  assert.equal(saved.changed, true);
  assert.equal(f.writes(), 1);
  assert.deepEqual(values(f.read(id, ['flag', 'count', 'text.key'])), {
    flag: true,
    count: 5,
    'text.key': 'changed',
  });
  const reset = f.call(
    'apply',
    f.request([{ kind: 'reset', keys: ['flag', 'count', 'text.key'] }]),
  );
  assert.equal(reset.changed, true);
  assert(reset.changes.every((field) => field.inherited));
  const stored = JSON.parse(fs.readFileSync(f.store.file)).extensions[f.owner.id].settings;
  assert.deepEqual(stored, { hidden: 'PRIVATE_VALUE', unknown: { nested: 'preserved' } });
  const writes = f.writes(),
    stable = f.read().revision;
  assert.equal(
    f.call('apply', f.request([{ kind: 'set', changes: { flag: false } }])).changed,
    false,
  );
  assert.equal(f.call('apply', f.request([{ kind: 'reset', keys: ['flag'] }])).changed, false);
  assert.equal(f.writes(), writes);
  assert.equal(f.read().revision, stable);
  f.call('apply', f.request([{ kind: 'set', changes: { unset: 'temporary' } }]));
  f.call('apply', f.request([{ kind: 'reset', keys: ['unset'] }]));
  assert.equal(f.read(id, ['unset']).fields[0].hasValue, false);
});

test('invalid late operations, duplicates and bounds never save a partial result', (t) => {
  const f = fixture(t),
    before = fs.readFileSync(f.store.file, 'utf8');
  const invalid = [
    [
      { kind: 'set', changes: { flag: true } },
      { kind: 'set', changes: { count: 99 } },
    ],
    [
      { kind: 'set', changes: { flag: true } },
      { kind: 'reset', keys: ['hidden'] },
    ],
    [
      { kind: 'set', changes: { flag: true } },
      { kind: 'reset', keys: ['flag'] },
    ],
    [{ kind: 'reset', keys: ['flag', 'flag'] }],
    [{ kind: 'set', changes: {} }],
    [{ kind: 'set', changes: { 'text.key': '' } }],
    [{ kind: 'set', changes: { mode: 'unknown' } }],
    [{ kind: 'set', changes: { flag: 'true' } }],
    [{ kind: 'set', changes: { flag: true }, extra: 'private' }],
    [{ kind: 'reset', keys: ['count'], changes: { flag: true } }],
    [{ kind: 'reorder', itemRefs: [] }],
  ];
  for (const operations of invalid) assert.throws(() => f.call('apply', f.request(operations)));
  assert.throws(() => f.call('apply', f.request([])), { code: 'INVALID_ARGUMENT' });
  assert.throws(
    () => f.call('apply', f.request(Array(33).fill({ kind: 'reset', keys: ['flag'] }))),
    { code: 'INVALID_ARGUMENT' },
  );
  const polluted = JSON.parse(
    JSON.stringify(f.request([{ kind: 'set', changes: { flag: true } }])),
  );
  polluted.operations[0].changes = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(() => f.call('apply', polluted), { code: 'INVALID_ARGUMENT' });
  assert.equal({}.polluted, undefined);
  assert.equal(f.writes(), 0);
  assert.equal(fs.readFileSync(f.store.file, 'utf8'), before);
});

test('revision, schema, availability and permission are rechecked before accepted request replay', (t) => {
  const f = fixture(t),
    request = f.request([{ kind: 'set', changes: { flag: true } }]);
  const saved = f.call('apply', request);
  assert.deepEqual(f.call('apply', structuredClone(request)), saved);
  assert.equal(f.writes(), 1);
  assert.throws(() => f.call('apply', { ...request, dryRun: true }), { code: 'INVALID_ARGUMENT' });
  f.setWrite(false);
  assert.throws(() => f.call('apply', request), { code: 'WRITE_DISABLED' });
  assert.equal(f.read().fields.length, 5);
  f.setWrite(true);
  f.owner.state = 'stopped';
  assert.throws(() => f.call('apply', request), { code: 'UNAVAILABLE' });
  assert.equal(f.read().available, false);
  f.owner.state = 'running';
  f.fields[0].secret = true;
  assert.throws(() => f.call('apply', request), { code: 'SCHEMA_CONFLICT' });
  f.fields[0].secret = false;
  assert.deepEqual(f.call('apply', request), saved);
  f.setPrincipal('principal-2');
  assert.throws(() => f.call('apply', request), { code: 'REVISION_CONFLICT' });
  const stale = f.request([{ kind: 'set', changes: { count: 6 } }]);
  f.call('apply', f.request([{ kind: 'set', changes: { flag: false } }]));
  assert.throws(() => f.call('apply', stale), { code: 'REVISION_CONFLICT' });
});

test('failed save requests are deduplicated even if the owner persisted before reporting failure', (t) => {
  const f = fixture(t),
    save = f.options.save;
  f.options.save = (value, revision) => {
    save(value, revision);
    throw Error('PRIVATE_SAVE_DETAIL');
  };
  const request = f.request([{ kind: 'set', changes: { flag: true } }]);
  assert.throws(
    () => f.call('apply', request),
    (error) => error.code === 'SAVE_FAILED' && !error.message.includes('PRIVATE_SAVE_DETAIL'),
  );
  assert.equal(values(f.read()).flag, true);
  assert.equal(f.writes(), 1);
  assert.throws(() => f.call('apply', request), { code: 'SAVE_FAILED' });
  assert.equal(f.writes(), 1);
  assert.throws(
    () => f.call('apply', { ...request, operations: [{ kind: 'reset', keys: ['flag'] }] }),
    { code: 'INVALID_ARGUMENT' },
  );
});

test('only the most recent 512 completed request identities are retained', (t) => {
  const f = fixture(t),
    request = f.request([{ kind: 'set', changes: { flag: false } }], { dryRun: true }),
    first = { ...request, requestId: 'oldest' };
  f.call('apply', first);
  for (let i = 0; i < 512; i++) f.call('apply', { ...request, requestId: 'request-' + i });
  f.call('apply', f.request([{ kind: 'set', changes: { flag: true } }]));
  assert.throws(() => f.call('apply', first), { code: 'REVISION_CONFLICT' });
  assert.equal(f.call('apply', { ...request, requestId: 'request-511' }).completion, 'validated');
});

test('opaque pagination is scoped to principal, filters, target and metadata revision', (t) => {
  const f = fixture(t),
    first = f.call('targets.list', { limit: 1 });
  assert(first.nextCursor);
  assert.throws(
    () => f.call('targets.list', { limit: 1, cursor: first.nextCursor, query: 'changed' }),
    { code: 'INVALID_ARGUMENT' },
  );
  assert.throws(() => f.call('targets.list', { cursor: first.nextCursor + 'tamper' }), {
    code: 'INVALID_ARGUMENT',
  });
  f.setPrincipal('other');
  assert.throws(() => f.call('targets.list', { cursor: first.nextCursor }), {
    code: 'INVALID_ARGUMENT',
  });
  f.setPrincipal('principal-1');
  f.owners.push({ ...f.owner, id: 'test.second', displayName: 'Second' });
  assert.throws(() => f.call('targets.list', { cursor: first.nextCursor }), {
    code: 'REVISION_CONFLICT',
  });
  const schema = f.call('schema.get', { targetId: f.target(), limit: 1 });
  f.fields.push({ key: 'added', title: 'Added', type: 'boolean', default: false });
  assert.throws(() => f.call('schema.get', { targetId: f.target(), cursor: schema.nextCursor }), {
    code: 'REVISION_CONFLICT',
  });
  const options = f.call('options.list', { targetId: f.target(), key: 'mode', limit: 1 });
  assert.deepEqual(options.items, [{ value: 'a', label: 'A' }]);
  assert.deepEqual(
    f
      .call('options.list', { targetId: f.target(), key: 'mode', cursor: options.nextCursor })
      .items.map((item) => item.value),
    ['b', 'c'],
  );
  assert.throws(() => f.call('options.list', { targetId: f.target(), key: 'flag' }), {
    code: 'INVALID_ARGUMENT',
  });
});

test('large results paginate whole schema entries and are rejected before oversized writes', (t) => {
  const definitions = Array.from({ length: 30 }, (_, i) => ({
    key: 'field' + i,
    title: 'Field ' + i,
    type: 'string',
    default: 'x'.repeat(10000),
  }));
  const f = fixture(t, { definitions }),
    next = structuredClone(f.store.value);
  next.extensions[f.owner.id].settings = Object.fromEntries(
    definitions.map((field) => [field.key, 'small']),
  );
  f.store.save(next, f.store.revision);
  assert.throws(() => f.read(), { code: 'RESULT_TOO_LARGE' });
  assert.equal(f.read(f.target(), ['field0']).fields[0].value, 'small');
  let cursor,
    found = [];
  do {
    const page = f.call('schema.get', {
      targetId: f.target(),
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    assert(Buffer.byteLength(JSON.stringify(page)) <= 256 * 1024);
    found.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(found.length, 30);
  const before = fs.readFileSync(f.store.file, 'utf8');
  const request = {
    targetId: f.target(),
    operations: [{ kind: 'reset', keys: definitions.map((field) => field.key) }],
    expectedRevision: f.read(f.target(), ['field0']).revision,
    expectedSchemaRevision: f.call('schema.get', { targetId: f.target() }).schemaRevision,
    requestId: randomUUID(),
  };
  assert.throws(() => f.call('apply', request), { code: 'RESULT_TOO_LARGE' });
  assert.equal(f.writes(), 0);
  assert.equal(fs.readFileSync(f.store.file, 'utf8'), before);
});

test('field registration drives host defaults, validation, UI metadata, storage projection and MCP discovery', (t) => {
  const f = fixture(t),
    definition = {
      key: 'futureFlag',
      title: 'Future flag',
      type: 'boolean',
      default: false,
      pageId: 'general',
    };
  hostSettingDefinitions.push(definition);
  t.after(() => hostSettingDefinitions.pop());
  f.store.reload();
  assert.equal(hostSettingsDefaults().futureFlag, false);
  assert.equal(createDefaultSettings().host.futureFlag, false);
  assert.throws(() =>
    parseSettings({
      ...createDefaultSettings(),
      host: { ...hostSettingsDefaults(), futureFlag: 'bad' },
    }),
  );
  const catalog = settingsCatalog([], createDefaultSettings()),
    page = catalog.find((page) => page.id === 'general');
  assert.equal(hostSettingItem('general', 'futureFlag').definition, definition);
  assert(page.items.some((item) => item.key === 'futureFlag'));
  assert(settingsPaths(page, []).some((parts) => parts.join('.') === 'host.futureFlag'));
  const target = f
    .call('targets.list', { ownerId: 'appdock' })
    .items.find((item) => item.category === 'general').targetId;
  f.call(
    'apply',
    f.request([{ kind: 'set', changes: { futureFlag: true } }], { targetId: target }),
  );
  assert.equal(f.store.value.host.futureFlag, true);
  const defaults = Object.keys(createDefaultSettings().host).sort();
  assert.deepEqual(
    defaults,
    [
      ...hostSettingDefinitions.map((field) => field.key),
      ...Object.keys(specializedHostDefaults),
    ].sort(),
  );
});

test('device-backed resets preserve per-PC ownership and shared bytes', (t) => {
  const f = fixture(t, { device: true }),
    targetId = f
      .call('targets.list', { ownerId: 'appdock' })
      .items.find((target) => target.category === 'general').targetId;
  const sharedBefore = fs.readFileSync(f.store.shared.file, 'utf8');
  f.call('apply', f.request([{ kind: 'set', changes: { soundEnabled: false } }], { targetId }));
  assert.equal(f.store.value.host.soundEnabled, false);
  assert.equal(fs.readFileSync(f.store.shared.file, 'utf8'), sharedBefore);
  f.call('apply', f.request([{ kind: 'reset', keys: ['soundEnabled'] }], { targetId }));
  assert.equal(f.store.value.host.soundEnabled, true);
  assert.equal(fs.readFileSync(f.store.shared.file, 'utf8'), sharedBefore);
  assert.equal(
    Object.hasOwn(JSON.parse(fs.readFileSync(f.store.device.file)).host ?? {}, 'soundEnabled'),
    false,
  );
});

test('reset clears an explicit override equal to its default and detects representation-only conflicts', (t) => {
  for (const device of [false, true]) {
    const f = fixture(t, { device }),
      targetId = f
        .call('targets.list', { ownerId: 'appdock' })
        .items.find((target) => target.category === 'general').targetId;
    const stale = f.request([{ kind: 'reset', keys: ['soundEnabled'] }], { targetId });
    const file = device ? f.store.device.file : f.store.file;
    const sharedBefore = device ? fs.readFileSync(f.store.shared.file, 'utf8') : null;
    const raw = JSON.parse(fs.readFileSync(file));
    raw.host ??= {};
    raw.host.soundEnabled = true;
    fs.writeFileSync(file, JSON.stringify(raw));
    assert.equal(f.read(targetId, ['soundEnabled']).fields[0].inherited, false);
    assert.throws(() => f.call('apply', stale), { code: 'REVISION_CONFLICT' });
    const result = f.call(
      'apply',
      f.request([{ kind: 'reset', keys: ['soundEnabled'] }], { targetId }),
    );
    assert.equal(result.changed, true);
    assert.equal(result.changes[0].inherited, true);
    assert.equal(
      Object.hasOwn(JSON.parse(fs.readFileSync(file)).host ?? {}, 'soundEnabled'),
      false,
    );
    assert.equal(f.read(targetId, ['soundEnabled']).fields[0].inherited, true);
    const writes = f.writes();
    assert.equal(
      f.call('apply', f.request([{ kind: 'reset', keys: ['soundEnabled'] }], { targetId })).changed,
      false,
    );
    assert.equal(f.writes(), writes);
    if (device) assert.equal(fs.readFileSync(f.store.shared.file, 'utf8'), sharedBefore);
  }
});

test('a real MCP client uses newly registered settings and owners without refreshing tools', async (t) => {
  const f = fixture(t),
    { AutomationMcp } = require('../out/main/main/core/automation-mcp');
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
  const {
    StreamableHTTPClientTransport,
  } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const token = 'a'.repeat(64),
    server = new AutomationMcp(
      f.api,
      () => token,
      () => {},
      'test',
    );
  await server.start(0);
  server.activate();
  const client = new Client({ name: 'Settings registry fixture', version: '1' });
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.port}/mcp`), {
      requestInit: { headers: { Authorization: 'Bearer ' + token } },
    }),
  );
  const tools = JSON.stringify((await client.listTools()).tools);
  f.fields.push({ key: 'newBoolean', title: 'New boolean', type: 'boolean', default: false });
  f.owners.push({ ...f.owner, id: 'test.new-owner', displayName: 'New owner' });
  const discovered = await client.callTool({
    name: 'appdock_settings_list_targets',
    arguments: { ownerId: 'test.new-owner' },
  });
  assert.equal(discovered.isError, undefined);
  assert.equal(discovered.structuredContent.items.length, 1);
  const targetId = f.target();
  const schema = await client.callTool({
    name: 'appdock_settings_get_schema',
    arguments: { targetId },
  });
  assert(schema.structuredContent.items.some((field) => field.key === 'newBoolean'));
  const read = await client.callTool({
    name: 'appdock_settings_get_values',
    arguments: { targetId, keys: ['newBoolean'] },
  });
  const saved = await client.callTool({
    name: 'appdock_settings_apply',
    arguments: {
      targetId,
      expectedSchemaRevision: schema.structuredContent.schemaRevision,
      expectedRevision: read.structuredContent.revision,
      requestId: randomUUID(),
      operations: [{ kind: 'set', changes: { newBoolean: true } }],
    },
  });
  assert.equal(saved.structuredContent.completion, 'settingsSaved');
  assert.equal(f.store.value.extensions[f.owner.id].settings.newBoolean, true);
  assert.equal(JSON.stringify((await client.listTools()).tools), tools);
});
