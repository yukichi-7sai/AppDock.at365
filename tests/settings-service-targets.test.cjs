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
    expectedRevision: read(targetId).revision,
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
test('service settings discovery uses existing six entry points and never exposes credentials or lifecycle operations', (t) => {
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
    assert.deepEqual(target.operations, ['set', 'reset']);
    const data = JSON.stringify([
      f.call('schema.get', { targetId: target.targetId }),
      f.read(target.targetId),
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
