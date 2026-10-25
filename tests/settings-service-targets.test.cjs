const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { SettingsStore } = require('../out/main/main/core/settings');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { SettingsServiceTargets } = require('../out/main/main/core/settings-service-targets');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { AiSettingsController } = require('../out/main/main/core/ai-settings');
const { AiSecrets } = require('../out/main/main/core/ai-secrets');
const { TtsSecrets } = require('../out/main/main/core/tts-secrets');
const { newAiConnection, parseAiSettings } = require('../out/main/shared/ai');
const { parseSettings } = require('../out/main/shared/settings-schema');
const {
  notificationCatalog,
  notificationTypeKey,
  validateNotificationPreferenceChanges,
} = require('../out/main/shared/notification-types');
const {
  replaceNotificationPreference,
} = require('../out/main/shared/notification-preference-edit');
function fixture(t, { device = false } = {}) {
  const dir = path.resolve('.artifacts/settings-service-targets-unit', randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  const store = device
    ? new DeviceSettingsStore(
        path.join(dir, 'settings.json'),
        path.join(dir, 'local'),
        'TEST',
        () => [],
        () => [],
      )
    : new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  const connection = { ...newAiConnection('one'), name: 'One', baseUrl: 'http://example.test/v1' };
  store.save(
    {
      ...store.value,
      ai: { commonPrompt: '', connections: [connection] },
      tts: {
        ...store.value.tts,
        baseUrl: 'http://example.test/tts',
        model: 'model',
        defaultVoice: 'voice',
      },
      notificationPreferences: {
        overrides: [{ ownerKind: 'applet', ownerId: 'missing', typeId: 'old', speak: true }],
      },
    },
    store.revision,
  );
  let decrypts = 0,
    writes = 0,
    write = true,
    execute = false;
  const encryption = {
    encrypt: (value) => Buffer.from(value).toString('base64'),
    decrypt: () => {
      decrypts++;
      throw Error('Settings entry must not decrypt credentials');
    },
  };
  const aiFile = path.join(dir, 'ai-keys.json'),
    ttsFile = path.join(dir, 'tts-key.json');
  const aiSecrets = new AiSecrets(aiFile, encryption),
    ttsSecrets = new TtsSecrets(ttsFile, encryption);
  const ai = new AiSettingsController(
    store,
    aiSecrets,
    () => {
      throw Error('Unexpected credential/discovery action');
    },
    {
      models: () => {
        throw Error('Unexpected HTTP request');
      },
    },
  );
  const types = notificationCatalog([]);
  const validate = (value) => {
    const next = parseSettings(value);
    validateNotificationPreferenceChanges(next, store.value, types);
    return next;
  };
  const save = (value, revision, rewrite = []) => {
    writes++;
    return device ? store.save(value, revision, undefined, rewrite) : store.save(value, revision);
  };
  const commands = new SettingsCommands({ settings: store, applets: () => [], save });
  const services = new SettingsServiceTargets({
    settings: store,
    revision: () => commands.revision(),
    checkRevision: (revision) => commands.checkRevision(revision),
    validate,
    save,
    ai,
    tts: ttsSecrets,
    notifications: () => types,
  });
  const api = new AppDockApi({
    settings: store,
    settingsCommands: commands,
    serviceSettingsTargets: () => services.targets(),
    save,
    ready: () => true,
    writable: () => write,
    executable: () => execute,
    version: 'test',
    instanceId: randomUUID(),
    applets: () => [],
    commands: () => [],
    execute: () => {
      throw Error('Unexpected command execution');
    },
  });
  const call = (name, args = {}) => api.call('settings.' + name, args);
  const read = (targetId, keys) => call('values.get', { targetId, ...(keys ? { keys } : {}) });
  const values = (targetId) =>
    Object.fromEntries(
      read(targetId)
        .fields.filter((field) => field.hasValue)
        .map((field) => [field.key, field.value]),
    );
  const request = (targetId, operations, dryRun = false) => ({
    targetId,
    operations,
    dryRun,
    expectedRevision:
      call('schema.get', { targetId }).kind === 'list'
        ? call('items.list', { targetId }).revision
        : read(targetId).revision,
    expectedSchemaRevision: call('schema.get', { targetId }).schemaRevision,
    requestId: randomUUID(),
  });
  const target = (category, title) =>
    call('targets.list').items.find(
      (item) => item.category === category && (!title || item.title === title),
    );
  const notification = (type) =>
    services
      .targets()
      .find(
        (item) =>
          item.targetId ===
          'service.notification.' + Buffer.from(notificationTypeKey(type)).toString('base64url'),
      ).targetId;
  return {
    dir,
    store,
    aiSecrets,
    ttsSecrets,
    aiFile,
    ttsFile,
    types,
    api,
    commands,
    services,
    call,
    read,
    values,
    request,
    target,
    notification,
    writes: () => writes,
    decrypts: () => decrypts,
    setWrite: (value) => (write = value),
  };
}
test('service settings discovery uses existing six entry points and never exposes credentials', (t) => {
  const f = fixture(t);
  f.aiSecrets.setKey(f.store.value.ai.connections[0], 'PRIVATE_AI_KEY');
  f.ttsSecrets.set(f.store.value.tts.baseUrl, 'PRIVATE_TTS_KEY');
  const targets = f
    .call('targets.list')
    .items.filter((target) => target.targetId.startsWith('service.'));
  assert(targets.some((target) => target.targetId === 'service.ai'));
  assert(targets.some((target) => target.targetId === 'service.tts'));
  assert(targets.some((target) => target.targetId === 'service.notifications.speech'));
  for (const target of targets) {
    assert.deepEqual(
      target.operations,
      target.kind === 'list' ? ['add', 'update', 'remove', 'reorder'] : ['set', 'reset'],
    );
    const data = JSON.stringify([
      f.call('schema.get', { targetId: target.targetId }),
      target.kind === 'list'
        ? f.call('items.list', { targetId: target.targetId })
        : f.read(target.targetId),
    ]);
    assert(!/PRIVATE_|\$guard|keyRevision|fingerprint/.test(data));
  }
  for (const key of ['apiKey', 'token', 'connections', 'manualVoices'])
    assert.throws(() => f.read('service.tts', [key]), { code: 'NOT_FOUND' });
  assert.equal(f.decrypts(), 0);
  assert.equal(f.writes(), 0);
  assert.throws(() => f.api.call('settings.targets.list', {}, 'other.applet'), {
    code: 'NOT_FOUND',
  });
});
test('TTS updates share validation, are atomic and side-effect free in dryRun, preserve manual voices and reset defaults', (t) => {
  const f = fixture(t, { device: true }),
    id = 'service.tts',
    before = fs.readFileSync(f.store.shared.file, 'utf8'),
    device = fs.readFileSync(f.store.device.file, 'utf8');
  const operations = [
      {
        kind: 'set',
        changes: { defaultSpeed: 1.5, speedMode: 'server', defaultVoice: 'new voice' },
      },
    ],
    preview = f.call('apply', f.request(id, operations, true));
  assert.equal(preview.completion, 'validated');
  assert.equal(fs.readFileSync(f.store.shared.file, 'utf8'), before);
  assert.equal(f.writes(), 0);
  const request = f.request(id, operations),
    saved = f.call('apply', request);
  assert.deepEqual(f.call('apply', request), saved);
  assert.equal(f.writes(), 1);
  assert.equal(f.values(id).defaultSpeed, 1.5);
  assert.equal(fs.readFileSync(f.store.device.file, 'utf8'), device);
  assert.throws(
    () =>
      f.call(
        'apply',
        f.request(id, [{ kind: 'set', changes: { model: 'valid', defaultSpeed: 9 } }]),
      ),
    { code: 'INVALID_ARGUMENT' },
  );
  assert.equal(f.values(id).model, 'model');
  f.call(
    'apply',
    f.request(id, [{ kind: 'reset', keys: ['defaultSpeed', 'speedMode', 'defaultVoice'] }]),
  );
  assert.equal(f.values(id).defaultSpeed, 1);
  assert.equal(f.read(id, ['defaultSpeed']).fields[0].inherited, true);
  assert.deepEqual(f.store.value.tts.manualVoices, []);
  const count = f.writes();
  assert.equal(
    f.call('apply', f.request(id, [{ kind: 'reset', keys: ['defaultSpeed'] }])).changed,
    false,
  );
  assert.equal(f.writes(), count);
});
test('credential-bound TTS endpoint changes and resets fail closed, while non-secret settings preserve exact cipher bytes', (t) => {
  const f = fixture(t),
    id = 'service.tts';
  f.ttsSecrets.set(f.store.value.tts.baseUrl, 'PRIVATE_TTS_KEY');
  const bytes = fs.readFileSync(f.ttsFile, 'utf8');
  assert.equal(
    f.call('schema.get', { targetId: id }).items.find((field) => field.key === 'baseUrl').writable,
    false,
  );
  for (const dryRun of [true, false])
    for (const operations of [
      [{ kind: 'set', changes: { baseUrl: 'http://other.test/v1', model: 'bad' } }],
      [{ kind: 'reset', keys: ['baseUrl'] }],
    ])
      assert.throws(() => f.call('apply', f.request(id, operations, dryRun)), {
        code: 'LOCAL_ACTION_REQUIRED',
      });
  f.call('apply', f.request(id, [{ kind: 'set', changes: { model: 'changed' } }]));
  assert.equal(fs.readFileSync(f.ttsFile, 'utf8'), bytes);
  assert.equal(f.decrypts(), 0);
  fs.writeFileSync(f.ttsFile, '{broken');
  assert.throws(
    () =>
      f.call('apply', f.request(id, [{ kind: 'set', changes: { baseUrl: 'http://other.test/' } }])),
    { code: 'LOCAL_ACTION_REQUIRED' },
  );
  assert.equal(fs.readFileSync(f.ttsFile, 'utf8'), '{broken');
});
test('AI general and existing connection fields preserve ownership, integer limits and optional reset semantics without key decryption', (t) => {
  const f = fixture(t),
    id = f.target('ai', 'One').targetId;
  f.aiSecrets.setKey(f.store.value.ai.connections[0], 'PRIVATE_AI_KEY');
  const bytes = fs.readFileSync(f.aiFile, 'utf8');
  f.call(
    'apply',
    f.request('service.ai', [
      { kind: 'set', changes: { commonPrompt: 'Shared policy', defaultConnectionId: 'one' } },
    ]),
  );
  assert.equal(f.values('service.ai').commonPrompt, 'Shared policy');
  assert.deepEqual(
    f.call('options.list', { targetId: 'service.ai', key: 'defaultConnectionId' }).items,
    [{ value: 'one', label: 'One' }],
  );
  f.call(
    'apply',
    f.request(id, [
      {
        kind: 'set',
        changes: {
          defaultModel: 'model-two',
          defaultMaxOutputTokens: 2048,
          'compatibility.temperature': 0.7,
          'compatibility.reasoningEffort': 'high',
        },
      },
    ]),
  );
  assert.equal(f.store.value.ai.connections[0].defaultModel, 'model-two');
  assert.equal(f.store.value.ai.connections[0].id, 'one');
  assert.equal(f.read(id, ['defaultMaxOutputTokens']).fields[0].inherited, null);
  f.call(
    'apply',
    f.request(id, [
      {
        kind: 'reset',
        keys: [
          'compatibility.temperature',
          'compatibility.reasoningEffort',
          'defaultMaxOutputTokens',
        ],
      },
    ]),
  );
  assert.equal(f.store.value.ai.connections[0].compatibility.temperature, undefined);
  assert.equal(f.values(id).defaultMaxOutputTokens, 8192);
  for (const changes of [
    { defaultMaxOutputTokens: 32.5 },
    { defaultTimeoutSeconds: 0 },
    { 'compatibility.temperature': 3 },
    { 'compatibility.reasoningEffort': 'bad value' },
    { defaultModel: { invalid: true } },
  ])
    assert.throws(() => f.call('apply', f.request(id, [{ kind: 'set', changes }])), {
      code: 'INVALID_ARGUMENT',
    });
  assert.equal(fs.readFileSync(f.aiFile, 'utf8'), bytes);
  assert.equal(f.decrypts(), 0);
});
test('AI authenticated endpoint/authentication edits require local actions and default connection choices are revalidated', (t) => {
  const f = fixture(t),
    id = f.target('ai', 'One').targetId;
  assert.throws(
    () => f.call('apply', f.request(id, [{ kind: 'set', changes: { authentication: 'bearer' } }])),
    { code: 'LOCAL_ACTION_REQUIRED' },
  );
  const next = structuredClone(f.store.value);
  next.ai.connections[0].authentication = 'bearer';
  f.store.save(next, f.store.revision);
  f.aiSecrets.setKey(f.store.value.ai.connections[0], 'PRIVATE_AI_KEY');
  const bytes = fs.readFileSync(f.aiFile, 'utf8');
  for (const dryRun of [true, false])
    for (const changes of [{ baseUrl: 'http://other.test/v1' }, { authentication: 'none' }])
      assert.throws(() => f.call('apply', f.request(id, [{ kind: 'set', changes }], dryRun)), {
        code: 'LOCAL_ACTION_REQUIRED',
      });
  assert.throws(
    () => f.call('apply', f.request(id, [{ kind: 'reset', keys: ['authentication'] }])),
    { code: 'LOCAL_ACTION_REQUIRED' },
  );
  assert.throws(
    () =>
      f.call(
        'apply',
        f.request('service.ai', [{ kind: 'set', changes: { defaultConnectionId: 'missing' } }]),
      ),
    { code: 'INVALID_ARGUMENT' },
  );
  assert.equal(fs.readFileSync(f.aiFile, 'utf8'), bytes);
});
test('notification updates enforce required targets and lifetime rules, preserve missing providers and clear overrides', (t) => {
  const f = fixture(t),
    type = f.types[0],
    id = f.notification(type),
    before = structuredClone(f.store.value.notificationPreferences.overrides);
  const request = f.request(id, [
    {
      kind: 'set',
      changes: { targets: ['banner'], durationSeconds: 7, speak: true, mcpEvents: true },
    },
  ]);
  assert.equal(f.call('apply', { ...request, dryRun: true }).completion, 'validated');
  assert.deepEqual(f.store.value.notificationPreferences.overrides, before);
  f.call('apply', { ...request, requestId: randomUUID() });
  assert.equal(f.values(id).durationSeconds, 7);
  assert.deepEqual(f.store.value.notificationPreferences.overrides[0], before[0]);
  for (const changes of [
    { targets: [] },
    { targets: ['unknown'] },
    { durationSeconds: 0 },
    { speak: 'yes' },
  ])
    assert.throws(() => f.call('apply', f.request(id, [{ kind: 'set', changes }])), {
      code: 'INVALID_ARGUMENT',
    });
  f.call('apply', f.request(id, [{ kind: 'set', changes: { durationSeconds: null } }]));
  assert.equal(f.values(id).durationSeconds, null);
  f.call(
    'apply',
    f.request(id, [{ kind: 'reset', keys: ['targets', 'durationSeconds', 'speak', 'mcpEvents'] }]),
  );
  assert.deepEqual(f.store.value.notificationPreferences.overrides, before);
  assert(f.read(id).fields.every((field) => field.inherited === true));
  const fixed = f.types.find((type) => type.lifetimePolicy !== 'userDuration');
  assert(fixed);
  assert.throws(
    () =>
      f.call(
        'apply',
        f.request(f.notification(fixed), [{ kind: 'set', changes: { durationSeconds: 5 } }]),
      ),
    { code: 'LOCAL_ACTION_REQUIRED' },
  );
});
test('notification speech inherits TTS values; schema changes and missing/stopped providers retain safe behavior', (t) => {
  const f = fixture(t),
    speech = 'service.notifications.speech';
  assert.equal(f.values(speech).voice, 'voice');
  f.call(
    'apply',
    f.request(speech, [{ kind: 'set', changes: { voice: 'notification voice', speed: 2 } }]),
  );
  assert.equal(f.values(speech).speed, 2);
  f.call('apply', f.request(speech, [{ kind: 'reset', keys: ['voice', 'speed'] }]));
  assert.equal(f.values(speech).voice, 'voice');
  assert.equal(f.read(speech, ['voice']).fields[0].inherited, true);
  const stale = f.request(speech, [{ kind: 'set', changes: { speed: 1.3 } }]);
  f.call('apply', f.request('service.tts', [{ kind: 'set', changes: { defaultSpeed: 1.7 } }]));
  assert.throws(() => f.call('apply', stale), { code: 'SCHEMA_CONFLICT' });
  assert.equal(f.values(speech).speed, 1.7);
  const type = f.types[0],
    id = f.notification(type),
    request = f.request(id, [{ kind: 'set', changes: { speak: true } }]);
  f.types[0] = { ...type, requiredTargets: [] };
  assert.throws(() => f.call('apply', request), { code: 'SCHEMA_CONFLICT' });
  f.types.splice(0, 1);
  assert.throws(() => f.read(id), { code: 'NOT_FOUND' });
});
test('service writes check permissions and external conflicts; cached responses obey current write/schema availability', (t) => {
  const f = fixture(t),
    id = 'service.tts',
    request = f.request(id, [{ kind: 'set', changes: { model: 'changed' } }]);
  f.call('apply', request);
  f.setWrite(false);
  assert.throws(() => f.call('apply', request), { code: 'WRITE_DISABLED' });
  f.setWrite(true);
  const stale = f.request(id, [{ kind: 'set', changes: { model: 'again' } }]),
    raw = JSON.parse(fs.readFileSync(f.store.file));
  raw.host = { soundEnabled: false };
  fs.writeFileSync(f.store.file, JSON.stringify(raw));
  assert.throws(() => f.call('apply', stale), { code: 'REVISION_CONFLICT' });
  assert.equal(f.writes(), 1);
});
test('shared notification editor removes an emptied preference and retains all unrelated overrides', (t) => {
  const f = fixture(t),
    type = f.types[0],
    identity = { ownerKind: type.ownerKind, ownerId: type.ownerId, typeId: type.typeId },
    original = { ...identity, speak: true },
    settings = {
      ...f.store.value,
      notificationPreferences: {
        overrides: [...f.store.value.notificationPreferences.overrides, original],
      },
    };
  const next = replaceNotificationPreference(settings, f.types, type, original, identity);
  assert.deepEqual(
    next.notificationPreferences.overrides,
    f.store.value.notificationPreferences.overrides,
  );
  assert.equal(settings.notificationPreferences.overrides.length, 2);
});

test('adding credentials invalidates older public schemas and AI prompts use the shared Unicode limit', (t) => {
  const f = fixture(t),
    request = f.request('service.tts', [{ kind: 'set', changes: { model: 'new model' } }]);
  f.ttsSecrets.set(f.store.value.tts.baseUrl, 'PRIVATE_KEY');
  assert.throws(() => f.call('apply', request), { code: 'SCHEMA_CONFLICT' });
  f.call(
    'apply',
    f.request('service.ai', [{ kind: 'set', changes: { commonPrompt: '😀'.repeat(2048) } }]),
  );
  assert.equal(Array.from(f.values('service.ai').commonPrompt).length, 2048);
  assert.throws(
    () =>
      f.call(
        'apply',
        f.request('service.ai', [{ kind: 'set', changes: { commonPrompt: '😀'.repeat(2049) } }]),
      ),
    { code: 'INVALID_ARGUMENT' },
  );
  assert.equal(f.decrypts(), 0);
});

test('stopped notification providers with identical labels keep separate stable preferences', (t) => {
  const f = fixture(t),
    a = {
      ...f.types[0],
      ownerKind: 'applet',
      ownerId: 'fixture.a',
      ownerTitle: 'Same',
      title: 'Same',
      ownerState: 'stopped',
    },
    b = { ...a, ownerId: 'fixture.b' };
  f.types.push(a, b);
  const aId = f.notification(a),
    bId = f.notification(b);
  assert.notEqual(aId, bId);
  f.call('apply', f.request(aId, [{ kind: 'set', changes: { speak: true } }]));
  assert.equal(f.values(aId).speak, true);
  assert.equal(f.values(bId).speak, false);
});

test('owner field coverage detects new normal settings and keeps explicit complex/identity exclusions', (t) => {
  const f = fixture(t),
    schema = (id) => f.call('schema.get', { targetId: id }).items.map((field) => field.key);
  assert.deepEqual(
    schema('service.tts').sort(),
    Object.keys(require('../out/main/shared/tts').defaultTtsSettings())
      .filter((key) => key !== 'manualVoices')
      .sort(),
  );
  const connection = newAiConnection('one'),
    keys = Object.keys(connection)
      .filter((key) => !['id', 'protocol', 'compatibility'].includes(key))
      .concat(Object.keys(connection.compatibility).map((key) => 'compatibility.' + key));
  for (const key of keys) assert(schema(f.target('ai', 'One').targetId).includes(key), key);
});

test('unreadable credential metadata fails closed without reading a plaintext key', (t) => {
  const f = fixture(t),
    stat = fs.statSync;
  t.mock.method(fs, 'statSync', (file, ...args) => {
    if (file === f.ttsFile) throw Object.assign(Error('Denied'), { code: 'EACCES' });
    return stat(file, ...args);
  });
  assert.equal(
    f.call('schema.get', { targetId: 'service.tts' }).items.find((field) => field.key === 'baseUrl')
      .writable,
    false,
  );
  assert.throws(
    () =>
      f.call(
        'apply',
        f.request('service.tts', [{ kind: 'set', changes: { baseUrl: 'http://other.test/' } }]),
      ),
    { code: 'LOCAL_ACTION_REQUIRED' },
  );
  assert.equal(f.decrypts(), 0);
  assert.equal(f.writes(), 0);
});

test('explicit AI name edits share UI trimming without normalizing unrelated user-entered names', (t) => {
  const f = fixture(t),
    id = f.target('ai', 'One').targetId;
  f.call('apply', f.request(id, [{ kind: 'set', changes: { name: '  Renamed  ' } }]));
  assert.equal(f.values(id).name, 'Renamed');
  const next = structuredClone(f.store.value);
  next.ai.connections[0].name = ' Legacy name ';
  f.store.save(next, f.store.revision);
  f.call('apply', f.request(id, [{ kind: 'set', changes: { defaultModel: 'Changed' } }]));
  assert.equal(f.values(id).name, ' Legacy name ');
});

const aiList = 'service.ai.connections';
const listRows = (f) => f.call('items.list', { targetId: aiList }).items;
const listApply = (f, operations, dryRun = false) =>
  f.call('apply', f.request(aiList, operations, dryRun));
const addConnection = (name = 'New', extra = {}) => ({
  kind: 'add',
  values: { name, baseUrl: 'http://example.test/v1/', ...extra },
});

test('AI list add shares owner defaults and normalization, dryRun and replay never duplicate writes', (t) => {
  const f = fixture(t),
    schema = f.call('schema.get', { targetId: aiList });
  assert.equal(schema.kind, 'list');
  assert.equal(schema.maxItems, 8);
  assert.equal(schema.items.find((field) => field.key === 'id').writable, false);
  assert.equal(
    schema.items.find((field) => field.key === 'defaultTimeoutSeconds').inputSchema.type,
    'integer',
  );
  assert(!schema.items.some((field) => ['protocol', 'apiKey'].includes(field.key)));
  const before = fs.readFileSync(f.store.file, 'utf8'),
    operation = addConnection('  同じ名前😀  ', { preset: 'lm-studio' }),
    preview = listApply(f, [operation], true);
  assert.equal(preview.completion, 'validated');
  assert.equal(preview.changes[0].values.name, '同じ名前😀');
  assert.equal(preview.changes[0].values.baseUrl, 'http://example.test/v1');
  assert.equal(preview.changes[0].values.defaultMaxOutputTokens, 8192);
  assert.equal(fs.readFileSync(f.store.file, 'utf8'), before);
  assert(!fs.existsSync(f.aiFile));
  assert.equal(f.writes(), 0);
  const request = f.request(aiList, [operation]),
    saved = f.call('apply', request);
  assert.deepEqual(f.call('apply', request), saved);
  assert.equal(f.writes(), 1);
  const added = f.store.value.ai.connections[1];
  assert.match(added.id, /^[a-f0-9-]{36}$/);
  assert.equal(added.name, '同じ名前😀');
  assert.equal(added.protocol, 'openai-chat-completions');
  assert.equal(added.authentication, 'none');
  assert.equal(added.defaultTimeoutSeconds, 60);
  assert.equal(f.store.value.ai.connections[0].id, 'one');
  assert.equal(f.decrypts(), 0);
});

test('AI first addition chooses a default and removing that default clears it without selecting another', (t) => {
  const f = fixture(t, { device: true });
  f.store.save(
    { ...f.store.value, ai: { commonPrompt: 'Kept', connections: [] } },
    f.store.revision,
  );
  const device = fs.readFileSync(f.store.device.file, 'utf8');
  listApply(f, [addConnection('First')]);
  const first = f.store.value.ai.connections[0];
  assert.equal(f.store.value.ai.defaultConnectionId, first.id);
  listApply(f, [addConnection('Second')]);
  let rows = listRows(f);
  const preview = listApply(f, [{ kind: 'remove', itemRef: rows[0].itemRef }], true);
  assert.equal(preview.changed, true);
  assert.equal(f.store.value.ai.defaultConnectionId, first.id);
  listApply(f, [{ kind: 'remove', itemRef: rows[0].itemRef }]);
  assert.equal(f.store.value.ai.defaultConnectionId, undefined);
  assert.equal(f.store.value.ai.commonPrompt, 'Kept');
  assert.equal(f.store.value.ai.connections.length, 1);
  assert.equal(
    Object.hasOwn(JSON.parse(fs.readFileSync(f.store.shared.file)).ai, 'defaultConnectionId'),
    false,
  );
  rows = listRows(f);
  listApply(f, [{ kind: 'remove', itemRef: rows[0].itemRef }]);
  assert.equal(f.store.value.ai.connections.length, 0);
  assert.equal(fs.readFileSync(f.store.device.file, 'utf8'), device);
  assert(!fs.existsSync(f.aiFile));
});

test('AI list insert and partial update distinguish identical names and preserve unrelated nested values', (t) => {
  const f = fixture(t),
    before = structuredClone(f.store.value);
  before.ai.connections[0].name = ' Same ';
  before.ai.connections[0].compatibility.temperature = 0.2;
  f.store.save(before, f.store.revision);
  listApply(f, [{ ...addConnection('Same'), beforeItemRef: listRows(f)[0].itemRef }]);
  let rows = listRows(f);
  assert.equal(rows[1].values.id, 'one');
  const preview = listApply(
    f,
    [
      {
        kind: 'update',
        itemRef: rows[0].itemRef,
        changes: { name: '  Renamed  ', baseUrl: 'http://new.test/v1/' },
      },
    ],
    true,
  );
  assert.equal(preview.changes[0].changes.name.value, 'Renamed');
  assert.equal(preview.changes[0].changes.baseUrl.value, 'http://new.test/v1');
  listApply(f, [
    {
      kind: 'update',
      itemRef: rows[0].itemRef,
      changes: { name: '  Renamed  ', baseUrl: 'http://new.test/v1/' },
    },
    {
      kind: 'update',
      itemRef: rows[1].itemRef,
      changes: { defaultModel: 'Changed', 'compatibility.store': 'false' },
    },
  ]);
  rows = listRows(f);
  assert.equal(rows[0].values.name, 'Renamed');
  assert.equal(rows[1].values.name, ' Same ');
  assert.equal(rows[1].values['compatibility.temperature'], 0.2);
  assert.equal(rows[1].values['compatibility.store'], 'false');
  assert.equal(f.store.value.ai.connections[1].compatibility.temperature, 0.2);
  const writes = f.writes();
  assert.equal(
    listApply(f, [
      {
        kind: 'update',
        itemRef: rows[0].itemRef,
        changes: { name: ' Renamed ', baseUrl: 'http://new.test/v1/' },
      },
    ]).changed,
    false,
  );
  assert.equal(f.writes(), writes);
});

test('AI list reorder keeps credential files byte-identical and never changes default or selection priority', (t) => {
  const f = fixture(t);
  listApply(f, [addConnection('Second')]);
  f.aiSecrets.setKey(f.store.value.ai.connections[0], 'PRIVATE_KEY');
  const bytes = fs.readFileSync(f.aiFile),
    rows = listRows(f),
    defaultId = f.store.value.ai.defaultConnectionId;
  assert.equal(rows[0].removable, false);
  assert(!rows[0].writableKeys.includes('baseUrl'));
  assert(rows[0].writableKeys.includes('defaultModel'));
  assert(!rows[0].writableKeys.includes('id'));
  listApply(f, [{ kind: 'reorder', itemRefs: rows.map((row) => row.itemRef).reverse() }]);
  assert.equal(listRows(f)[1].values.id, 'one');
  assert.equal(f.store.value.ai.defaultConnectionId, defaultId);
  assert.deepEqual(fs.readFileSync(f.aiFile), bytes);
  const current = f.call('items.list', { targetId: aiList }),
    writes = f.writes();
  assert.equal(
    listApply(f, [{ kind: 'reorder', itemRefs: current.items.map((row) => row.itemRef) }]).changed,
    false,
  );
  assert.equal(f.call('items.list', { targetId: aiList }).revision, current.revision);
  assert.equal(f.writes(), writes);
  assert.equal(f.decrypts(), 0);
});

test('AI list protects credential deletion and binding changes in validation and persistence', (t) => {
  const f = fixture(t);
  f.aiSecrets.setKey(f.store.value.ai.connections[0], 'PRIVATE_KEY');
  const bytes = fs.readFileSync(f.aiFile),
    before = fs.readFileSync(f.store.file);
  for (const dryRun of [true, false]) {
    const row = listRows(f)[0];
    for (const operation of [
      { kind: 'remove', itemRef: row.itemRef },
      { kind: 'update', itemRef: row.itemRef, changes: { baseUrl: 'http://other.test/v1' } },
      { kind: 'update', itemRef: row.itemRef, changes: { authentication: 'bearer' } },
    ])
      assert.throws(() => listApply(f, [operation], dryRun), { code: 'LOCAL_ACTION_REQUIRED' });
  }
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  listApply(f, [
    { kind: 'update', itemRef: listRows(f)[0].itemRef, changes: { defaultModel: 'Safe' } },
  ]);
  assert.deepEqual(fs.readFileSync(f.aiFile), bytes);
  assert.equal(f.decrypts(), 0);
});

test('AI list rejects key-required additions, unknown fields and caller-supplied immutable identities', (t) => {
  const f = fixture(t);
  for (const dryRun of [true, false]) {
    for (const operation of [
      addConnection('Bearer', { authentication: 'bearer' }),
      addConnection('OpenAI', { preset: 'openai', baseUrl: 'https://example.test/v1' }),
    ])
      assert.throws(() => listApply(f, [operation], dryRun), { code: 'LOCAL_ACTION_REQUIRED' });
    for (const key of ['apiKey', 'token', 'protocol', 'compatibility', 'unknown'])
      assert.throws(
        () => listApply(f, [addConnection('Bad', { [key]: 'PRIVATE_INPUT' })], dryRun),
        { code: 'NOT_FOUND' },
      );
    assert.throws(() => listApply(f, [addConnection('Bad', { id: 'chosen-id' })], dryRun), {
      code: 'INVALID_ARGUMENT',
    });
  }
  assert.equal(f.writes(), 0);
  assert(!fs.existsSync(f.aiFile));
  listApply(f, [
    addConnection('No key', {
      preset: 'openai',
      baseUrl: 'https://example.test/v1',
      authentication: 'none',
    }),
  ]);
  assert.equal(
    f.store.value.ai.connections[1].compatibility.tokenLimitField,
    'max_completion_tokens',
  );
  assert.equal(f.store.value.ai.connections[1].compatibility.store, 'false');
});

test('AI list validates limits, identity sets and complete batches before one atomic save', (t) => {
  const f = fixture(t);
  listApply(f, [addConnection('Second')]);
  const rows = listRows(f),
    before = fs.readFileSync(f.store.file),
    writes = f.writes();
  for (const operations of [
    [
      { kind: 'update', itemRef: rows[0].itemRef, changes: { name: 'Valid' } },
      { kind: 'update', itemRef: rows[1].itemRef, changes: { defaultTimeoutSeconds: 1.5 } },
    ],
    [{ kind: 'update', itemRef: rows[0].itemRef, changes: { defaultMaxOutputTokens: 31 } }],
    [
      {
        kind: 'update',
        itemRef: rows[0].itemRef,
        changes: { 'compatibility.reasoningEffort': 'bad effort' },
      },
    ],
    [{ kind: 'update', itemRef: rows[0].itemRef, changes: { name: '   ' } }],
    [{ kind: 'reorder', itemRefs: [rows[0].itemRef, rows[0].itemRef] }],
    [{ kind: 'reorder', itemRefs: [rows[0].itemRef] }],
    [
      { kind: 'update', itemRef: rows[0].itemRef, changes: { name: 'First' } },
      { kind: 'update', itemRef: rows[0].itemRef, changes: { name: 'Second' } },
    ],
    [addConnection('Mixed'), { kind: 'remove', itemRef: rows[0].itemRef }],
  ])
    assert.throws(() => listApply(f, operations), { code: 'INVALID_ARGUMENT' });
  assert.equal(f.writes(), writes);
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  while (f.store.value.ai.connections.length < 8) listApply(f, [addConnection('Same')]);
  assert.throws(() => listApply(f, [addConnection('Ninth')]), { code: 'INVALID_ARGUMENT' });
  assert.equal(new Set(f.store.value.ai.connections.map((c) => c.id)).size, 8);
});

test('AI list stale references, credential revisions, external edits and revocation cannot overwrite newer state', (t) => {
  const f = fixture(t),
    row = listRows(f)[0],
    request = f.request(aiList, [
      { kind: 'update', itemRef: row.itemRef, changes: { defaultModel: 'Changed' } },
    ]);
  f.setWrite(false);
  assert.throws(() => f.call('apply', request), { code: 'WRITE_DISABLED' });
  f.setWrite(true);
  f.aiSecrets.setKey(f.store.value.ai.connections[0], 'PRIVATE_KEY');
  assert.throws(() => f.call('apply', request), { code: 'REVISION_CONFLICT' });
  const staleKey = f.request(aiList, [
    { kind: 'update', itemRef: listRows(f)[0].itemRef, changes: { name: 'Stale' } },
  ]);
  f.aiSecrets.setKey(f.store.value.ai.connections[0], 'PRIVATE_NEW_KEY');
  assert.throws(() => f.call('apply', staleKey), { code: 'REVISION_CONFLICT' });
  const staleDisk = f.request(aiList, [{ kind: 'remove', itemRef: listRows(f)[0].itemRef }]);
  const raw = JSON.parse(fs.readFileSync(f.store.file));
  raw.ai.connections[0].name = 'External';
  fs.writeFileSync(f.store.file, JSON.stringify(raw));
  assert.throws(() => f.call('apply', staleDisk), { code: 'REVISION_CONFLICT' });
  assert.equal(f.writes(), 0);
  assert.equal(f.decrypts(), 0);
});

test('AI list corrupt or unreadable credential metadata denies lifecycle changes without touching ciphertext', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.aiFile, 'CORRUPT_METADATA');
  const original = fs.readFileSync(f.aiFile);
  assert.equal(listRows(f)[0].removable, false);
  assert.throws(() => listApply(f, [{ kind: 'remove', itemRef: listRows(f)[0].itemRef }]), {
    code: 'LOCAL_ACTION_REQUIRED',
  });
  assert.throws(() => listApply(f, [addConnection('Cannot inspect orphaned keys')]), {
    code: 'LOCAL_ACTION_REQUIRED',
  });
  const stat = fs.statSync;
  t.mock.method(fs, 'statSync', (file, ...args) => {
    if (file === f.aiFile) throw Object.assign(Error('Denied'), { code: 'EACCES' });
    return stat(file, ...args);
  });
  assert.equal(listRows(f)[0].removable, false);
  assert.throws(
    () =>
      listApply(f, [
        {
          kind: 'update',
          itemRef: listRows(f)[0].itemRef,
          changes: { baseUrl: 'http://other.test/v1' },
        },
      ]),
    { code: 'LOCAL_ACTION_REQUIRED' },
  );
  assert.deepEqual(fs.readFileSync(f.aiFile), original);
  assert.equal(f.writes(), 0);
  assert.equal(f.decrypts(), 0);
});

test('AI list save failure leaves settings and encrypted credentials intact', (t) => {
  const f = fixture(t),
    before = fs.readFileSync(f.store.file),
    rename = fs.renameSync;
  f.aiSecrets.setKey(f.store.value.ai.connections[0], 'PRIVATE_KEY');
  const bytes = fs.readFileSync(f.aiFile);
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === f.store.file) throw Error('Injected atomic write failure');
    return rename(from, to);
  });
  assert.throws(() => listApply(f, [addConnection('Unsaved')]), { code: 'SAVE_FAILED' });
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  assert.deepEqual(fs.readFileSync(f.aiFile), bytes);
  assert.equal(f.store.value.ai.connections.length, 1);
  assert.equal(f.decrypts(), 0);
});

test('AI owner rechecks credentials immediately before committing a planned deletion', (t) => {
  const f = fixture(t),
    target = f.services.targets().find((item) => item.targetId === aiList);
  const plan = target.plan([], f.commands.revision());
  assert.equal(plan.changed.length, 1);
  f.aiSecrets.setKey(f.store.value.ai.connections[0], 'PRIVATE_LATE_KEY');
  const cipher = fs.readFileSync(f.aiFile),
    settings = fs.readFileSync(f.store.file);
  assert.throws(() => plan.commit(), { code: 'LOCAL_ACTION_REQUIRED' });
  assert.deepEqual(fs.readFileSync(f.aiFile), cipher);
  assert.deepEqual(fs.readFileSync(f.store.file), settings);
  assert.equal(f.writes(), 0);
  assert.equal(f.decrypts(), 0);
});
