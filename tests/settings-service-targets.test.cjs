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
const {
  commandTriggerOptionDeclarations,
  commandTriggerSettingDefinitions,
  defaultCommandTriggerOptions,
  parseCommandTriggerOptions,
} = require('../out/main/shared/command-trigger-options');
function fixture(t, { device = false, updateApplets = [] } = {}) {
  const dir = path.resolve('.artifacts/settings-service-targets-unit', randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  const store = device
    ? new DeviceSettingsStore(
        path.join(dir, 'settings.json'),
        path.join(dir, 'local'),
        'TEST',
        () => [],
        () => updateApplets,
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
    applets: () => updateApplets,
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
    updateApplets,
  };
}

test('shared browser discovery uses declared defaults, a bounded array and existing six settings operations', (t) => {
  const f = fixture(t),
    id = 'service.command-triggers';
  assert.equal(f.target('command-triggers').targetId, id);
  const schema = f.call('schema.get', { targetId: id });
  assert.deepEqual(
    schema.items.map((field) => field.key),
    ['browsers', 'requireChromiumWindowClass'],
  );
  assert.equal(schema.items[0].inputSchema.type, 'array');
  assert.equal(schema.items[0].inputSchema.maxItems, undefined);
  assert.deepEqual(f.values(id), defaultCommandTriggerOptions());
  assert(f.read(id).fields.every((field) => field.inherited && field.writable));
  assert.doesNotThrow(() => structuredClone(commandTriggerSettingDefinitions()));
  assert.equal(f.writes(), 0);
  assert.equal(f.decrypts(), 0);
});

test('shared browser normalization, dryRun, replay, normalized no-op and defaults agree across all three existing readers', (t) => {
  const f = fixture(t),
    id = 'service.command-triggers',
    before = fs.readFileSync(f.store.file);
  const operations = [
    {
      kind: 'set',
      changes: { browsers: [' CHROME.EXE ', 'chrome'], requireChromiumWindowClass: true },
    },
  ];
  const preview = f.call('apply', f.request(id, operations, true));
  assert.deepEqual(preview.changes.find((field) => field.key === 'browsers').value, ['chrome']);
  assert.equal(preview.completion, 'validated');
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  const request = f.request(id, operations),
    saved = f.call('apply', request);
  assert.deepEqual(f.call('apply', request), saved);
  assert.equal(saved.effectVerified, false);
  assert.equal(f.writes(), 1);
  for (const name of ['shortcuts', 'gestures', 'touchpadGestures']) {
    const state = f.api.call(name + '.get');
    const options = state.options ?? state.settings;
    assert.deepEqual(options.browsers, ['chrome']);
    assert.equal(options.requireChromiumWindowClass, true);
  }
  const bytes = fs.readFileSync(f.store.file);
  assert.equal(
    f.call(
      'apply',
      f.request(id, [{ kind: 'set', changes: { browsers: ['CHROME.exe', 'chrome'] } }]),
    ).changed,
    false,
  );
  assert.deepEqual(fs.readFileSync(f.store.file), bytes);
  const defaults = defaultCommandTriggerOptions();
  f.call(
    'apply',
    f.request(id, [
      {
        kind: 'set',
        changes: {
          browsers: defaults.browsers.map((name) => name.toUpperCase() + '.EXE'),
          requireChromiumWindowClass: false,
        },
      },
    ]),
  );
  assert(f.read(id).fields.every((field) => field.inherited));
  assert.equal(f.store.storedValue().commandTriggerOptions, undefined);
});

test('shared browser changes retain PC settings, assignments, other preferences and ciphertext, with 100 names and explicit empty supported', (t) => {
  const f = fixture(t, { device: true }),
    id = 'service.command-triggers';
  f.aiSecrets.setKey(f.store.value.ai.connections[0], 'PRIVATE_AI_KEY');
  f.ttsSecrets.set(f.store.value.tts.baseUrl, 'PRIVATE_TTS_KEY');
  const files = [f.store.device.file, f.aiFile, f.ttsFile],
    bytes = files.map((file) => fs.readFileSync(file));
  const withoutCommon = (value) => {
    const clone = structuredClone(value);
    delete clone.commandTriggerOptions;
    return clone;
  };
  const before = withoutCommon(f.store.value);
  const browsers = Array.from({ length: 100 }, (_, index) => `browser${index}.EXE`);
  f.call('apply', f.request(id, [{ kind: 'set', changes: { browsers } }]));
  assert.equal(f.values(id).browsers.length, 100);
  assert.deepEqual(withoutCommon(f.store.value), before);
  assert.deepEqual(
    files.map((file) => fs.readFileSync(file)),
    bytes,
  );
  f.call('apply', f.request(id, [{ kind: 'set', changes: { browsers: [...browsers, 'extra'] } }]));
  assert.equal(f.values(id).browsers.length, 101);
  f.call('apply', f.request(id, [{ kind: 'set', changes: { browsers: [] } }]));
  assert.deepEqual(f.values(id).browsers, []);
  assert.equal(f.read(id, ['browsers']).fields[0].inherited, false);
  f.call('apply', f.request(id, [{ kind: 'reset', keys: ['browsers'] }]));
  assert.deepEqual(f.values(id).browsers, defaultCommandTriggerOptions().browsers);
  assert.deepEqual(
    files.map((file) => fs.readFileSync(file)),
    bytes,
  );
});

test('shared browser invalid batches, permission revocation and external revisions never overwrite unrelated settings', (t) => {
  const f = fixture(t),
    id = 'service.command-triggers',
    before = fs.readFileSync(f.store.file);
  for (const changes of [
    { browsers: 'chrome' },
    { browsers: ['C:/browser.exe'] },
    { browsers: ['  '] },
    { browsers: ['valid'], requireChromiumWindowClass: 'true' },
    { executionMode: 'first' },
  ])
    assert.throws(() => f.call('apply', f.request(id, [{ kind: 'set', changes }])));
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  const request = f.request(id, [{ kind: 'set', changes: { requireChromiumWindowClass: true } }]);
  f.call('apply', request);
  f.setWrite(false);
  assert.throws(() => f.call('apply', request), { code: 'WRITE_DISABLED' });
  f.setWrite(true);
  const stale = f.request(id, [{ kind: 'set', changes: { browsers: [] } }]);
  const changed = JSON.parse(fs.readFileSync(f.store.file));
  changed.host = { ...changed.host, theme: 'dark' };
  fs.writeFileSync(f.store.file, JSON.stringify(changed));
  assert.throws(() => f.call('apply', stale), { code: 'REVISION_CONFLICT' });
  assert.equal(JSON.parse(fs.readFileSync(f.store.file)).host.theme, 'dark');
});

test('adding common browser declarations drives parser, types of defaults, catalogs, JSON, storage and MCP without a second field table', (t) => {
  const additions = {
    futureText: { type: 'string', title: 'Future text', default: '', maxLength: 8 },
    futureToggle: { type: 'boolean', title: 'Future toggle', default: false },
    futureNumber: { type: 'number', title: 'Future number', default: 1, minimum: 0, maximum: 4 },
    futureSelect: {
      type: 'select',
      title: 'Future select',
      default: 'one',
      options: [
        { value: 'one', label: 'One' },
        { value: 'two', label: 'Two' },
      ],
    },
    privateText: {
      type: 'string',
      title: 'PRIVATE_BROWSER_TITLE',
      default: 'PRIVATE_BROWSER_VALUE',
      automation: false,
    },
    secretText: {
      type: 'string',
      title: 'SECRET_BROWSER_TITLE',
      default: 'SECRET_BROWSER_VALUE',
      secret: true,
      automation: true,
    },
    localText: {
      type: 'string',
      title: 'LOCAL_BROWSER_TITLE',
      default: 'LOCAL_BROWSER_VALUE',
      localOnly: true,
    },
  };
  Object.assign(commandTriggerOptionDeclarations, additions);
  try {
    const f = fixture(t),
      id = 'service.command-triggers';
    const {
      settingsCatalog,
      settingsJsonProjection,
      applySettingsJson,
    } = require('../out/main/shared/settings-catalog');
    const pages = settingsCatalog([], f.store.value);
    for (const name of ['shortcuts', 'gestures', 'touchpad-gestures']) {
      const page = pages.find((item) => item.id === name);
      for (const key of Object.keys(additions)) assert(page.items.some((item) => item.key === key));
      const json = settingsJsonProjection(f.store.value, page, []);
      assert.equal(parseCommandTriggerOptions(json.commandTriggerOptions).futureNumber, 1);
      const edited = applySettingsJson(
        f.store.value,
        page,
        [],
        JSON.stringify({
          ...json,
          commandTriggerOptions: { ...json.commandTriggerOptions, futureText: 'JSON' },
        }),
      );
      assert.equal(edited.commandTriggerOptions.futureText, 'JSON');
    }
    const output = JSON.stringify([f.call('schema.get', { targetId: id }), f.read(id)]);
    assert(!/PRIVATE_BROWSER|SECRET_BROWSER|LOCAL_BROWSER/.test(output));
    assert.equal(f.call('targets.list', { query: 'PRIVATE_BROWSER_TITLE' }).items.length, 0);
    assert.equal(f.values(id).futureNumber, 1);
    f.call(
      'apply',
      f.request(id, [
        {
          kind: 'set',
          changes: {
            futureText: 'saved',
            futureToggle: true,
            futureNumber: 4,
            futureSelect: 'two',
          },
        },
      ]),
    );
    assert.equal(
      JSON.parse(fs.readFileSync(f.store.file)).commandTriggerOptions.futureText,
      'saved',
    );
    for (const changes of [
      { futureText: 'too-long-value' },
      { futureNumber: 5 },
      { futureSelect: 'missing' },
      { privateText: 'write' },
      { secretText: 'write' },
      { localText: 'write' },
    ])
      assert.throws(() => f.call('apply', f.request(id, [{ kind: 'set', changes }])));
    for (const name of ['shortcuts', 'gestures', 'touchpadGestures'])
      assert(
        !/PRIVATE_BROWSER|SECRET_BROWSER|LOCAL_BROWSER/.test(
          JSON.stringify(f.api.call(name + '.get')),
        ),
      );
    assert.doesNotThrow(() => structuredClone(commandTriggerSettingDefinitions()));
  } finally {
    for (const key of Object.keys(additions)) delete commandTriggerOptionDeclarations[key];
  }
});

test('explicitly private common browser fields are also hidden and protected through legacy configure schemas and previews', (t) => {
  const declaration = commandTriggerOptionDeclarations.browsers;
  declaration.automation = false;
  try {
    const f = fixture(t),
      id = 'service.command-triggers';
    assert.throws(() => f.read(id, ['browsers']), { code: 'NOT_FOUND' });
    const { ShortcutCommands } = require('../out/main/main/core/shortcut-commands');
    const { GestureCommands } = require('../out/main/main/core/gesture-commands');
    const options = {
      settings: f.store,
      settingsCommands: f.commands,
      save: (value, revision) => f.store.save(value, revision),
      commands: () => [],
      applets: () => [],
      statuses: () => [],
    };
    for (const service of [
      new ShortcutCommands(options),
      new GestureCommands(options),
      new GestureCommands({ ...options, touchpad: true }),
    ]) {
      const state = service.get();
      assert.equal(Object.hasOwn(state.options ?? state.settings, 'browsers'), false);
      const configure = service
        .commands()[0]
        .inputSchema.properties.operations.items.oneOf.find(
          (operation) => operation.properties.kind.const === 'configure',
        );
      assert.equal(Object.hasOwn(configure.properties.changes.properties, 'browsers'), false);
      assert.throws(
        () =>
          service.execute({
            expectedRevision: f.commands.revision(),
            operations: [{ kind: 'configure', changes: { browsers: ['hidden'] } }],
            dryRun: true,
          }),
        { code: 'INVALID_ARGUMENT' },
      );
      const result = service.execute({
        expectedRevision: f.commands.revision(),
        operations: [{ kind: 'configure', changes: { executionMode: 'first' } }],
        dryRun: true,
      });
      assert.equal(Object.hasOwn(result.options ?? result.settings, 'browsers'), false);
    }
    assert.equal(f.writes(), 0);
  } finally {
    delete declaration.automation;
  }
});

test('common browser failed saves retain shared/device and credential bytes and deduplicate the safe error', (t) => {
  const f = fixture(t, { device: true }),
    id = 'service.command-triggers';
  f.aiSecrets.setKey(f.store.value.ai.connections[0], 'PRIVATE_AI_KEY');
  f.ttsSecrets.set(f.store.value.tts.baseUrl, 'PRIVATE_TTS_KEY');
  const files = [f.store.file, f.store.device.file, f.aiFile, f.ttsFile],
    before = files.map((file) => fs.readFileSync(file));
  const request = f.request(id, [
    { kind: 'set', changes: { browsers: [], requireChromiumWindowClass: true } },
  ]);
  const save = f.store.save;
  f.store.save = () => {
    throw Error('PRIVATE_FAILURE_DETAIL');
  };
  try {
    for (let attempt = 0; attempt < 2; attempt++)
      assert.throws(
        () => f.call('apply', request),
        (error) =>
          error.code === 'SAVE_FAILED' && !error.message.includes('PRIVATE_FAILURE_DETAIL'),
      );
  } finally {
    f.store.save = save;
  }
  assert.deepEqual(
    files.map((file) => fs.readFileSync(file)),
    before,
  );
  assert.equal(f.writes(), 1);
  assert.equal(f.decrypts(), 0);
});
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
      target.targetId === 'service.applets.order'
        ? ['reorder']
        : target.kind === 'list'
          ? ['add', 'update', 'remove', 'reorder']
          : ['set', 'reset'],
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
  const f = fixture(t);
  f.types[0] = { ...f.types[0], requiredTargets: ['banner'] };
  const type = f.types[0],
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
  f.types[0] = { ...type, requiredTargets: ['banner'] };
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
  assert.equal(schema.maxItems, undefined);
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
  listApply(f, [addConnection('Ninth')]);
  assert.equal(new Set(f.store.value.ai.connections.map((c) => c.id)).size, 9);
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

const ttsList = 'service.tts.manual-voices';
const voiceRows = (f) => f.call('items.list', { targetId: ttsList, limit: 100 }).items;
const voiceApply = (f, operations, dryRun = false) =>
  f.call('apply', f.request(ttsList, operations, dryRun));

test('TTS manual voices use explicit server IDs, owner defaults and independent shared storage', (t) => {
  const f = fixture(t, { device: true }),
    schema = f.call('schema.get', { targetId: ttsList });
  assert.equal(schema.maxItems, undefined);
  assert.equal(schema.operationSchemas.reorder.properties.itemRefs.maxItems, undefined);
  assert.equal(schema.items.find((field) => field.key === 'id').writable, true);
  const before = fs.readFileSync(f.store.shared.file),
    device = fs.readFileSync(f.store.device.file),
    operation = { kind: 'add', values: { id: ' Voice-ID_大文字😀 ' } },
    preview = voiceApply(f, [operation], true);
  assert.deepEqual(preview.changes[0].values, {
    id: ' Voice-ID_大文字😀 ',
    name: ' Voice-ID_大文字😀 ',
  });
  assert.equal(preview.completion, 'validated');
  assert.deepEqual(fs.readFileSync(f.store.shared.file), before);
  assert.equal(f.writes(), 0);
  const request = f.request(ttsList, [operation]),
    saved = f.call('apply', request);
  assert.deepEqual(f.call('apply', request), saved);
  assert.equal(f.writes(), 1);
  assert.deepEqual(f.store.value.tts.manualVoices, [preview.changes[0].values]);
  assert.equal(f.store.value.tts.voicesSource, 'endpoint');
  assert.equal(f.store.value.tts.defaultVoice, 'voice');
  assert.deepEqual(fs.readFileSync(f.store.device.file), device);
  assert(!fs.existsSync(f.ttsFile));
  assert.equal(f.decrypts(), 0);
});

test('TTS list ID edits and removals preserve defaults, notification references, server mode and user-entered names', (t) => {
  const f = fixture(t);
  const next = structuredClone(f.store.value);
  next.tts.defaultVoice = 'VoiceA';
  next.tts.manualVoices = [
    { id: 'VoiceA', name: ' Same ' },
    { id: 'VoiceB', name: ' Same ' },
  ];
  next.notificationPreferences.speech = { voice: 'VoiceA' };
  f.store.save(next, f.store.revision);
  let rows = voiceRows(f);
  assert.notEqual(rows[0].itemRef, rows[1].itemRef);
  voiceApply(f, [{ kind: 'update', itemRef: rows[0].itemRef, changes: { id: 'VoiceNew' } }]);
  rows = voiceRows(f);
  assert.deepEqual(
    rows.map((row) => row.values),
    [
      { id: 'VoiceNew', name: ' Same ' },
      { id: 'VoiceB', name: ' Same ' },
    ],
  );
  voiceApply(f, [{ kind: 'remove', itemRef: rows[0].itemRef }]);
  assert.equal(f.store.value.tts.defaultVoice, 'VoiceA');
  assert.equal(f.store.value.notificationPreferences.speech.voice, 'VoiceA');
  assert.equal(f.store.value.tts.voicesSource, 'endpoint');
  assert.equal(f.store.value.tts.model, 'model');
  voiceApply(f, [{ kind: 'remove', itemRef: voiceRows(f)[0].itemRef }]);
  assert.deepEqual(f.store.value.tts.manualVoices, []);
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(f.store.file)).tts, 'manualVoices'), false);
});

test('TTS list validates duplicate IDs and complete update batches while preserving case, whitespace and optional names', (t) => {
  const f = fixture(t);
  voiceApply(f, [{ kind: 'add', values: { id: 'VOICE', name: '' } }]);
  voiceApply(f, [{ kind: 'add', values: { id: 'voice', name: ' Same ' } }]);
  const before = fs.readFileSync(f.store.file),
    writes = f.writes(),
    rows = voiceRows(f);
  for (const operation of [
    { kind: 'add', values: {} },
    { kind: 'add', values: { id: '  ' } },
    { kind: 'add', values: { id: 'VOICE' } },
    { kind: 'add', values: { id: 'long'.repeat(51) } },
    { kind: 'add', values: { id: 'new', name: '😀'.repeat(101) } },
    { kind: 'update', itemRef: rows[1].itemRef, changes: { id: 'VOICE' } },
  ])
    assert.throws(() => voiceApply(f, [operation]), { code: 'INVALID_ARGUMENT' });
  assert.throws(
    () =>
      voiceApply(f, [
        { kind: 'update', itemRef: rows[0].itemRef, changes: { name: 'Valid' } },
        { kind: 'update', itemRef: rows[1].itemRef, changes: { id: '' } },
      ]),
    { code: 'INVALID_ARGUMENT' },
  );
  for (const key of ['apiKey', 'token', 'baseUrl', 'unknown'])
    assert.throws(() => voiceApply(f, [{ kind: 'add', values: { id: 'new', [key]: 'PRIVATE' } }]), {
      code: 'NOT_FOUND',
    });
  assert.equal(f.writes(), writes);
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  assert.deepEqual(
    rows.map((row) => row.values),
    [
      { id: 'VOICE', name: '' },
      { id: 'voice', name: ' Same ' },
    ],
  );
});

test('TTS list paginates 1000 rows and reorders all references within the unchanged transport bounds', (t) => {
  const f = fixture(t),
    initial = Array.from({ length: 1000 }, (_, index) => ({ id: 'v' + index, name: 'Same' }));
  f.store.save(
    { ...f.store.value, tts: { ...f.store.value.tts, manualVoices: initial } },
    f.store.revision,
  );
  const rows = [];
  let cursor, firstCursor;
  do {
    const page = f.call('items.list', {
      targetId: ttsList,
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    rows.push(...page.items);
    cursor = page.nextCursor;
    firstCursor ??= cursor;
  } while (cursor);
  assert.equal(rows.length, 1000);
  assert.equal(new Set(rows.map((row) => row.itemRef)).size, 1000);
  const request = f.request(ttsList, [
    { kind: 'reorder', itemRefs: rows.map((row) => row.itemRef).reverse() },
  ]);
  assert(Buffer.byteLength(JSON.stringify(request), 'utf8') < 65536);
  const preview = f.call('apply', { ...request, requestId: randomUUID(), dryRun: true });
  assert.equal(preview.changed, true);
  assert.equal(f.writes(), 0);
  f.call('apply', request);
  assert.deepEqual(f.store.value.tts.manualVoices, initial.slice().reverse());
  assert.throws(
    () => f.call('items.list', { targetId: ttsList, limit: 100, cursor: firstCursor }),
    { code: 'REVISION_CONFLICT' },
  );
  voiceApply(f, [{ kind: 'add', values: { id: 'v1000' } }]);
  assert.equal(f.store.value.tts.manualVoices.length, 1001);
  assert.equal(
    f.call('schema.get', { targetId: aiList }).operationSchemas.reorder.properties.itemRefs
      .maxItems,
    undefined,
  );
});

test('TTS list dryRun/no-op/replay and stale refs obey revisions and current permissions', (t) => {
  const f = fixture(t);
  voiceApply(f, [{ kind: 'add', values: { id: 'one' } }]);
  voiceApply(f, [{ kind: 'add', values: { id: 'two' } }]);
  let rows = voiceRows(f),
    before = f.call('items.list', { targetId: ttsList }),
    writes = f.writes();
  assert.equal(
    voiceApply(f, [
      { kind: 'update', itemRef: rows[0].itemRef, changes: { id: 'one', name: 'one' } },
    ]).changed,
    false,
  );
  assert.equal(
    voiceApply(f, [{ kind: 'reorder', itemRefs: rows.map((row) => row.itemRef) }]).changed,
    false,
  );
  assert.equal(f.writes(), writes);
  assert.equal(f.call('items.list', { targetId: ttsList }).revision, before.revision);
  const operation = { kind: 'update', itemRef: rows[0].itemRef, changes: { name: 'Updated' } },
    request = f.request(ttsList, [operation]);
  f.call('apply', request);
  f.setWrite(false);
  assert.throws(() => f.call('apply', request), { code: 'WRITE_DISABLED' });
  f.setWrite(true);
  assert.throws(() => voiceApply(f, [{ kind: 'remove', itemRef: rows[0].itemRef }]), {
    code: 'REVISION_CONFLICT',
  });
  rows = voiceRows(f);
  const stale = f.request(ttsList, [{ kind: 'remove', itemRef: rows[0].itemRef }]);
  const raw = JSON.parse(fs.readFileSync(f.store.file));
  raw.tts.manualVoices[0].name = 'External';
  fs.writeFileSync(f.store.file, JSON.stringify(raw));
  assert.throws(() => f.call('apply', stale), { code: 'REVISION_CONFLICT' });
});

test('TTS manual list keeps encrypted bytes intact even with unreadable or damaged credential metadata', (t) => {
  const f = fixture(t);
  f.ttsSecrets.set(f.store.value.tts.baseUrl, 'PRIVATE_TTS_KEY');
  const encrypted = fs.readFileSync(f.ttsFile);
  voiceApply(f, [{ kind: 'add', values: { id: 'voice' } }]);
  assert.deepEqual(fs.readFileSync(f.ttsFile), encrypted);
  fs.writeFileSync(f.ttsFile, 'DAMAGED_METADATA');
  const stat = fs.statSync;
  t.mock.method(fs, 'statSync', (file, ...args) => {
    if (file === f.ttsFile) throw Object.assign(Error('Denied'), { code: 'EACCES' });
    return stat(file, ...args);
  });
  voiceApply(f, [{ kind: 'update', itemRef: voiceRows(f)[0].itemRef, changes: { name: 'Safe' } }]);
  const output = JSON.stringify([
    f.call('schema.get', { targetId: ttsList }),
    f.call('items.list', { targetId: ttsList }),
  ]);
  assert(!/PRIVATE_|DAMAGED|keyRevision|fingerprint|\$guard/.test(output));
  assert.equal(fs.readFileSync(f.ttsFile, 'utf8'), 'DAMAGED_METADATA');
  assert.equal(f.decrypts(), 0);
});

test('TTS manual list owner save failure never persists rows or modifies encrypted credentials', (t) => {
  const f = fixture(t),
    before = fs.readFileSync(f.store.file),
    rename = fs.renameSync;
  f.ttsSecrets.set(f.store.value.tts.baseUrl, 'PRIVATE_TTS_KEY');
  const cipher = fs.readFileSync(f.ttsFile);
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === f.store.file) throw Error('Injected atomic write failure');
    return rename(from, to);
  });
  assert.throws(() => voiceApply(f, [{ kind: 'add', values: { id: 'unsaved' } }]), {
    code: 'SAVE_FAILED',
  });
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  assert.deepEqual(fs.readFileSync(f.ttsFile), cipher);
  assert.deepEqual(f.store.value.tts.manualVoices, []);
  assert.equal(f.decrypts(), 0);
});

test('TTS manual candidate reads use the edited list without network, credential decryption or speech', async (t) => {
  const f = fixture(t),
    { TtsService } = require('../out/main/main/core/tts-service');
  f.store.save(
    { ...f.store.value, tts: { ...f.store.value.tts, voicesSource: 'manual' } },
    f.store.revision,
  );
  const service = new TtsService({
    settings: () => f.store.value.tts,
    canUse: () => true,
    key: () => {
      throw Error('Unexpected credential read');
    },
    fetcher: () => {
      throw Error('Unexpected network');
    },
    play: () => {
      throw Error('Unexpected speech');
    },
  });
  t.after(() => service.close());
  f.store.on('changed', () => service.reconcile());
  assert.deepEqual((await service.voices('test')).voices, []);
  voiceApply(f, [{ kind: 'add', values: { id: 'ActualVoice', name: 'Display voice' } }]);
  assert.deepEqual(await service.voices('test'), {
    source: 'manual',
    voices: [{ id: 'ActualVoice', name: 'Display voice' }],
  });
  voiceApply(f, [{ kind: 'remove', itemRef: voiceRows(f)[0].itemRef }]);
  assert.deepEqual((await service.voices('test')).voices, []);
  assert.equal(f.store.value.tts.defaultVoice, 'voice');
  assert.equal(f.decrypts(), 0);
});

const updatesId = 'service.updates';
const updateApplet = (id, extra = {}) => ({
  id,
  name: id,
  displayName: 'Same',
  version: '1.0.0',
  apiVersion: 1,
  runtime: 'node',
  entry: 'index.cjs',
  folder: 'unused',
  enabled: false,
  state: 'stopped',
  sourceKind: 'external',
  error: null,
  settings: [],
  settingOptions: {},
  commands: [],
  tray: [],
  panel: null,
  ...extra,
});
const sourceTarget = (f, ownerId) =>
  f.services.targets().find((target) => target.category === 'updates' && target.ownerId === ownerId)
    ?.targetId;
const setUpdate = (f, changes, dryRun = false) =>
  f.call('apply', f.request(updatesId, [{ kind: 'set', changes }], dryRun));

const commonApplet = (id = 'common.applet', extra = {}) =>
  updateApplet(id, {
    startupDelaySeconds: 12,
    pages: [
      {
        id: 'main.part',
        title: 'Same page',
        source: 'local',
        ui: 'page.html',
        openCommand: id + '.open',
        defaultDisplay: 'window',
      },
    ],
    ...extra,
  });
const commonTarget = (f, owner) =>
  f.call('targets.list', { ownerId: owner }).items.find((item) => item.category === 'applet-common')
    ?.targetId;
const setCommon = (f, id, changes, dryRun = false) =>
  f.call('apply', f.request(id, [{ kind: 'set', changes }], dryRun));

test('new primitive common declarations automatically join discovery, validation, catalog, JSON projection and both storage scopes', (t) => {
  const {
    appletCommonSettingDeclarations: declarations,
  } = require('../out/main/shared/applet-common-settings');
  const additions = {
    futureFlag: { title: 'Future flag', type: 'boolean', default: false },
    futureText: { title: 'Future text', type: 'string', default: '', maxLength: 20 },
    futureMode: {
      title: 'Future mode',
      type: 'select',
      default: 'one',
      options: [
        { value: 'one', label: 'One' },
        { value: 'two', label: 'Two' },
      ],
    },
    futureScale: { title: 'Future scale', type: 'number', default: 1.5, minimum: 0, maximum: 3 },
    privateCommon: {
      title: 'PRIVATE_COMMON_TITLE',
      type: 'string',
      default: 'PRIVATE_DEFAULT',
      automation: false,
    },
    secretCommon: {
      title: 'SECRET_COMMON_TITLE',
      type: 'string',
      default: '',
      secret: true,
      automation: true,
    },
    localCommon: {
      title: 'LOCAL_COMMON_TITLE',
      type: 'boolean',
      default: false,
      localOnly: true,
      automation: true,
    },
  };
  t.after(() => {
    for (const key of Object.keys(additions)) delete declarations[key];
  });
  Object.assign(declarations, additions);
  const provider = commonApplet(),
    f = fixture(t, { device: true, updateApplets: [provider] }),
    id = commonTarget(f, provider.id);
  f.store.save(
    {
      ...f.store.value,
      extensions: {
        [provider.id]: {
          enabled: false,
          settings: {},
          privateCommon: 'PRIVATE_VALUE',
          secretCommon: 'SECRET_VALUE',
          localCommon: true,
        },
      },
    },
    f.store.revision,
  );
  const schema = f.call('schema.get', { targetId: id });
  for (const key of ['futureFlag', 'futureText', 'futureMode', 'futureScale'])
    assert(schema.items.some((field) => field.key === key));
  for (const key of ['privateCommon', 'secretCommon', 'localCommon'])
    assert.throws(() => f.read(id, [key]), { code: 'NOT_FOUND' });
  assert.equal(f.call('targets.list', { query: 'PRIVATE_COMMON_TITLE' }).items.length, 0);
  const {
      settingsCatalog,
      settingsProjection,
      applySettingsJson,
    } = require('../out/main/shared/settings-catalog'),
    page = settingsCatalog([provider], f.store.value).find((page) => page.owner === provider.id);
  assert(page.items.some((item) => item.key === 'futureFlag'));
  const projected = settingsProjection(f.store.value, page, [provider]);
  const json = structuredClone(projected);
  json.extensions[provider.id].futureText = 'From JSON';
  assert.equal(
    applySettingsJson(f.store.value, page, [provider], JSON.stringify(json)).extensions[provider.id]
      .futureText,
    'From JSON',
  );
  const changes = {
    futureFlag: true,
    futureText: 'Automatic',
    futureMode: 'two',
    futureScale: 2.25,
  };
  const device = fs.readFileSync(f.store.device.file);
  setCommon(f, id, changes);
  assert.deepEqual(fs.readFileSync(f.store.device.file), device);
  for (const [key, value] of Object.entries(changes)) assert.equal(f.values(id)[key], value);
  assert.equal(
    JSON.parse(fs.readFileSync(f.store.shared.file)).extensions[provider.id].futureFlag,
    true,
  );
  for (const bad of [
    { futureFlag: 'true' },
    { futureText: 'x'.repeat(21) },
    { futureMode: 'other' },
    { futureScale: 4 },
  ])
    assert.throws(() => setCommon(f, id, bad), { code: 'INVALID_ARGUMENT' });
  f.store.setLocalSettings(provider.id, true, f.store.revision);
  const shared = fs.readFileSync(f.store.shared.file);
  setCommon(f, id, { futureText: 'Local' });
  assert.equal(f.values(id).futureText, 'Local');
  assert.deepEqual(fs.readFileSync(f.store.shared.file), shared);
  const config = JSON.parse(fs.readFileSync(f.store.device.file)).extensions[provider.id]
    .configuration;
  assert.equal(config.futureFlag, true);
  assert.equal(config.privateCommon, 'PRIVATE_VALUE');
  assert.equal(config.secretCommon, 'SECRET_VALUE');
  f.call('apply', f.request(id, [{ kind: 'reset', keys: Object.keys(changes) }]));
  assert.equal(f.values(id).futureFlag, false);
  assert.equal(f.values(id).futureText, '');
  assert.deepEqual(fs.readFileSync(f.store.shared.file), shared);
  assert.equal(f.decrypts(), 0);
});

test('Applet common fields follow declared defaults and pages for stopped owners without exposing lifecycle or private configuration', (t) => {
  const a = commonApplet(),
    b = commonApplet('other.applet', { startupDelaySeconds: undefined, pages: undefined }),
    f = fixture(t, {
      updateApplets: [
        a,
        b,
        commonApplet('builtin', { sourceKind: 'builtin' }),
        commonApplet('child', { collection: { owner: a.id, key: 'pages', itemId: 'child' } }),
      ],
    }),
    id = commonTarget(f, a.id);
  assert(id);
  assert.notEqual(id, commonTarget(f, b.id));
  assert.equal(commonTarget(f, 'builtin'), undefined);
  assert.equal(commonTarget(f, 'child'), undefined);
  assert.deepEqual(f.values(id), { startupDelaySeconds: 12, 'page:main.part': 'window' });
  assert.deepEqual(f.values(commonTarget(f, b.id)), { startupDelaySeconds: 0 });
  assert(f.read(id).fields.every((field) => field.inherited));
  const schema = f.call('schema.get', { targetId: id });
  assert.deepEqual(schema.items[0].inputSchema, { type: 'integer', minimum: 0, maximum: 86400 });
  assert.deepEqual(
    f.call('options.list', { targetId: id, key: 'page:main.part' }).items.map((item) => item.value),
    ['page', 'window'],
  );
  for (const key of [
    'enabled',
    'settings',
    'updateSource',
    'useLocalSettings',
    'appletOrder',
    'page:missing',
  ])
    assert.throws(() => setCommon(f, id, { [key]: true }), { code: 'NOT_FOUND' });
  assert.equal(f.writes(), 0);
  assert.equal(f.decrypts(), 0);
  assert.equal(a.state, 'stopped');
});

test('Applet common dryRun/replay/reset keep literal dotted page IDs and unrelated settings intact', (t) => {
  const provider = commonApplet(),
    f = fixture(t, { updateApplets: [provider] }),
    id = commonTarget(f, provider.id);
  f.store.save(
    {
      ...f.store.value,
      extensions: {
        [provider.id]: {
          enabled: false,
          settings: { private: 'PRIVATE_COMMON' },
          updateSource: '',
          future: { retained: true },
          pages: { retired: { display: 'window', metadata: 7 } },
        },
      },
    },
    f.store.revision,
  );
  const before = fs.readFileSync(f.store.file),
    changes = { startupDelaySeconds: 86400, 'page:main.part': 'page' },
    preview = setCommon(f, id, changes, true);
  assert.equal(preview.completion, 'validated');
  assert.equal(preview.effectVerified, false);
  assert.equal(preview.applies.startupDelaySeconds, 'appletStartupScheduleChanged');
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  const request = f.request(id, [{ kind: 'set', changes }]),
    saved = f.call('apply', request);
  assert.deepEqual(f.call('apply', request), saved);
  assert.equal(f.writes(), 1);
  assert.equal(f.store.value.extensions[provider.id].pages['main.part'].display, 'page');
  assert.equal(f.store.value.extensions[provider.id].pages.main, undefined);
  f.call('apply', f.request(id, [{ kind: 'reset', keys: Object.keys(changes) }]));
  assert(f.read(id).fields.every((field) => field.inherited));
  const entry = f.store.value.extensions[provider.id];
  assert.equal(entry.startupDelaySeconds, undefined);
  assert.deepEqual(entry.pages, { retired: { display: 'window', metadata: 7 } });
  assert.equal(entry.enabled, false);
  assert.equal(entry.updateSource, '');
  assert.deepEqual(entry.future, { retained: true });
  assert.deepEqual(entry.settings, { private: 'PRIVATE_COMMON' });
  const writes = f.writes();
  setCommon(f, id, { startupDelaySeconds: 12, 'page:main.part': 'window' });
  assert.equal(f.writes(), writes);
  assert(!JSON.stringify(f.read(id)).includes('PRIVATE_COMMON'));
});

test('shared common preferences omit explicit defaults and never change device bytes', (t) => {
  const provider = commonApplet(),
    f = fixture(t, { device: true, updateApplets: [provider] }),
    id = commonTarget(f, provider.id);
  f.store.save(
    {
      ...f.store.value,
      extensions: { ...f.store.value.extensions, [provider.id]: { enabled: false, settings: {} } },
    },
    f.store.revision,
  );
  const device = fs.readFileSync(f.store.device.file);
  setCommon(f, id, { startupDelaySeconds: 45, 'page:main.part': 'page' });
  assert.deepEqual(fs.readFileSync(f.store.device.file), device);
  assert.equal(
    JSON.parse(fs.readFileSync(f.store.shared.file)).extensions[provider.id].startupDelaySeconds,
    45,
  );
  setCommon(f, id, { startupDelaySeconds: 12, 'page:main.part': 'window' });
  assert.deepEqual(fs.readFileSync(f.store.device.file), device);
  const raw = JSON.parse(fs.readFileSync(f.store.shared.file));
  raw.extensions[provider.id].startupDelaySeconds = 12;
  raw.extensions[provider.id].pages = { 'main.part': { display: 'window' } };
  fs.writeFileSync(f.store.shared.file, JSON.stringify(raw));
  f.store.shared.reload();
  assert(f.read(id).fields.every((field) => !field.inherited));
  f.call(
    'apply',
    f.request(id, [{ kind: 'reset', keys: ['startupDelaySeconds', 'page:main.part'] }]),
  );
  const stored = JSON.parse(fs.readFileSync(f.store.shared.file)).extensions[provider.id];
  assert.equal(stored.startupDelaySeconds, undefined);
  assert.equal(stored.pages, undefined);
  assert(f.read(id).fields.every((field) => field.inherited));
  assert.deepEqual(fs.readFileSync(f.store.device.file), device);
});

test('PC-only common preferences use their current configuration and preserve dormant shared values and permission state', (t) => {
  const provider = commonApplet(),
    f = fixture(t, { device: true, updateApplets: [provider] }),
    id = commonTarget(f, provider.id);
  setCommon(f, id, { startupDelaySeconds: 33, 'page:main.part': 'page' });
  f.store.setLocalSettings(provider.id, true, f.store.revision);
  const shared = fs.readFileSync(f.store.shared.file),
    device = JSON.parse(fs.readFileSync(f.store.device.file));
  setCommon(f, id, { startupDelaySeconds: 77 });
  assert.equal(f.values(id).startupDelaySeconds, 77);
  assert.equal(
    f.read(id).fields.find((field) => field.key === 'startupDelaySeconds').inherited,
    false,
  );
  assert.deepEqual(fs.readFileSync(f.store.shared.file), shared);
  const after = JSON.parse(fs.readFileSync(f.store.device.file));
  device.extensions[provider.id].configuration = after.extensions[provider.id].configuration;
  assert.deepEqual(after, device);
  f.call(
    'apply',
    f.request(id, [{ kind: 'reset', keys: ['startupDelaySeconds', 'page:main.part'] }]),
  );
  assert.deepEqual(fs.readFileSync(f.store.shared.file), shared);
  assert(f.read(id).fields.every((field) => field.inherited));
  const stale = f.request(id, [{ kind: 'set', changes: { startupDelaySeconds: 88 } }]);
  f.store.setLocalSettings(provider.id, false, f.store.revision);
  assert.throws(() => f.call('apply', stale), { code: 'SCHEMA_CONFLICT' });
  assert.equal(f.values(id).startupDelaySeconds, 33);
});

test('Applet common schemas follow page/default changes and removed owners while dormant page preferences remain saved', (t) => {
  const provider = commonApplet(),
    f = fixture(t, { updateApplets: [provider] }),
    id = commonTarget(f, provider.id);
  setCommon(f, id, { 'page:main.part': 'page' });
  const stale = f.request(id, [{ kind: 'reset', keys: ['page:main.part'] }]),
    cursor = f.call('schema.get', { targetId: id, limit: 1 }).nextCursor;
  provider.pages = [{ id: 'new', title: 'New', defaultDisplay: 'page' }];
  assert.throws(() => f.call('apply', stale), { code: 'SCHEMA_CONFLICT' });
  assert.throws(() => f.call('schema.get', { targetId: id, limit: 1, cursor }), {
    code: 'REVISION_CONFLICT',
  });
  setCommon(f, id, { startupDelaySeconds: 50 });
  assert.equal(f.store.value.extensions[provider.id].pages['main.part'].display, 'page');
  assert.throws(() => f.read(id, ['page:main.part']), { code: 'NOT_FOUND' });
  const defaults = f.call('schema.get', { targetId: id }).schemaRevision;
  provider.startupDelaySeconds = 100;
  assert.notEqual(f.call('schema.get', { targetId: id }).schemaRevision, defaults);
  const absent = f.request(id, [{ kind: 'reset', keys: ['startupDelaySeconds'] }]);
  f.updateApplets.splice(0);
  assert.throws(() => f.call('apply', absent), { code: 'NOT_FOUND' });
});

test('Applet common input validation, write revocation and external revisions protect atomic saves', (t) => {
  const provider = commonApplet(),
    f = fixture(t, { updateApplets: [provider] }),
    id = commonTarget(f, provider.id),
    before = fs.readFileSync(f.store.file);
  for (const value of [-1, 86401, 1.5, '12', true, null])
    assert.throws(
      () => setCommon(f, id, { startupDelaySeconds: value, 'page:main.part': 'page' }),
      { code: 'INVALID_ARGUMENT' },
    );
  for (const value of ['other', {}, ['page'], null])
    assert.throws(() => setCommon(f, id, { startupDelaySeconds: 66, 'page:main.part': value }), {
      code: 'INVALID_ARGUMENT',
    });
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  const request = f.request(id, [{ kind: 'set', changes: { startupDelaySeconds: 25 } }]);
  f.call('apply', request);
  f.setWrite(false);
  assert.throws(() => f.call('apply', request), { code: 'WRITE_DISABLED' });
  f.setWrite(true);
  const stale = f.request(id, [{ kind: 'set', changes: { startupDelaySeconds: 26 } }]),
    raw = JSON.parse(fs.readFileSync(f.store.file));
  raw.extensions[provider.id].startupDelaySeconds = 99;
  fs.writeFileSync(f.store.file, JSON.stringify(raw));
  assert.throws(() => f.call('apply', stale), { code: 'REVISION_CONFLICT' });
});

test('Applet common save failures preserve both settings files and encrypted credentials', (t) => {
  const provider = commonApplet(),
    f = fixture(t, { device: true, updateApplets: [provider] }),
    id = commonTarget(f, provider.id);
  f.store.setLocalSettings(provider.id, true, f.store.revision);
  f.aiSecrets.setKey(f.store.value.ai.connections[0], 'PRIVATE_AI');
  f.ttsSecrets.set(f.store.value.tts.baseUrl, 'PRIVATE_TTS');
  const files = [f.store.shared.file, f.store.device.file, f.aiFile, f.ttsFile],
    bytes = files.map((file) => fs.readFileSync(file)),
    rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === f.store.device.file) throw Error('Injected write failure');
    return rename(from, to);
  });
  assert.throws(() => setCommon(f, id, { startupDelaySeconds: 77, 'page:main.part': 'page' }), {
    code: 'SAVE_FAILED',
  });
  assert.deepEqual(
    files.map((file) => fs.readFileSync(file)),
    bytes,
  );
  assert.equal(f.decrypts(), 0);
});

test('Applet common edits retain unknown page metadata and refuse resets that would remove it', (t) => {
  const provider = commonApplet('future.common', {
      pages: [
        { id: 'main', title: 'Page' },
        { id: 'default', title: 'Default page' },
      ],
    }),
    f = fixture(t, { device: true, updateApplets: [provider] }),
    id = commonTarget(f, provider.id);
  f.store.save(
    {
      ...f.store.value,
      extensions: {
        [provider.id]: {
          enabled: false,
          settings: {},
          pages: {
            main: { display: 'window', future: { keep: true } },
            default: { display: 'page', future: { keep: true } },
          },
        },
      },
    },
    f.store.revision,
  );
  assert.equal(
    f.call('schema.get', { targetId: id }).items.find((field) => field.key === 'page:main')
      .resettable,
    false,
  );
  const before = fs.readFileSync(f.store.shared.file);
  assert.throws(() => setCommon(f, id, { 'page:main': 'page' }), { code: 'INVALID_ARGUMENT' });
  assert.deepEqual(fs.readFileSync(f.store.shared.file), before);
  setCommon(f, id, { startupDelaySeconds: 30 });
  assert.deepEqual(f.store.value.extensions[provider.id].pages.main, {
    display: 'window',
    future: { keep: true },
  });
  assert.equal(
    JSON.parse(fs.readFileSync(f.store.shared.file)).extensions[provider.id].pages.default.display,
    'page',
  );
  f.store.shared.reload();
  f.store.setLocalSettings(provider.id, true, f.store.revision);
  const shared = fs.readFileSync(f.store.shared.file);
  setCommon(f, id, { startupDelaySeconds: 31 });
  f.store.device.reload();
  assert.deepEqual(f.store.value.extensions[provider.id].pages.default, {
    display: 'page',
    future: { keep: true },
  });
  assert.deepEqual(fs.readFileSync(f.store.shared.file), shared);
});

const { shellRegions, defaultShellId } = require('../out/main/shared/shell');
const shellId = 'service.shell';
const shellApplet = (id, regions = shellRegions.map((r) => r.id), extra = {}) =>
  updateApplet(id, {
    shell: {
      apiVersion: 1,
      ribbonSchemaVersion: require('../shells/default/extension.json').shell.ribbonSchemaVersion,
      views: Object.fromEntries(regions.map((region) => [region, 'view.html'])),
    },
    ...extra,
  });
const selectShell = (f, changes, dryRun = false) =>
  f.call('apply', f.request(shellId, [{ kind: 'set', changes }], dryRun));

test('integrated ribbon groups are not separate Shell settings and dormant assignments survive current-region edits', (t) => {
  const retired = 'overlay.ribbon-group',
    provider = shellApplet('shell.legacy', [retired]),
    f = fixture(t, { device: true, updateApplets: [provider] });
  f.store.save(
    {
      ...f.store.value,
      host: { ...f.store.value.host, shellProviders: { [retired]: provider.id } },
    },
    f.store.revision,
  );
  const before = fs.readFileSync(f.store.shared.file),
    schema = f.call('schema.get', { targetId: shellId });
  assert(!schema.items.some((field) => field.key === retired));
  assert.throws(() => f.read(shellId, [retired]), { code: 'NOT_FOUND' });
  assert.throws(() => selectShell(f, { [retired]: provider.id }), { code: 'NOT_FOUND' });
  for (const { id } of shellRegions)
    assert.deepEqual(
      f.call('options.list', { targetId: shellId, key: id }).items.map((option) => option.value),
      [defaultShellId],
    );
  f.store.save(
    {
      ...f.store.value,
      host: {
        ...f.store.value.host,
        shellProviders: { ...f.store.value.host.shellProviders, titlebar: defaultShellId },
      },
    },
    f.store.revision,
  );
  f.call('apply', f.request(shellId, [{ kind: 'reset', keys: ['titlebar'] }]));
  assert.deepEqual(f.store.value.host.shellProviders, { [retired]: provider.id });
  assert.deepEqual(JSON.parse(fs.readFileSync(f.store.device.file)).host.shellProviders, {
    [retired]: provider.id,
  });
  assert.deepEqual(fs.readFileSync(f.store.shared.file), before);
});

test('Shell selection discovers declared regions and per-region providers without starting disabled or stopped Applets', (t) => {
  const a = shellApplet('shell.a'),
    b = shellApplet('shell.b', ['statusbar']),
    f = fixture(t, { updateApplets: [a, b, updateApplet('ordinary')] }),
    schema = f.call('schema.get', { targetId: shellId });
  assert.deepEqual(
    schema.items.map((field) => field.key),
    shellRegions.map((region) => region.id),
  );
  for (const { id } of shellRegions) {
    const options = f.call('options.list', { targetId: shellId, key: id }).items;
    assert.deepEqual(
      options.map((option) => option.value),
      [defaultShellId, a.id, ...(id === 'statusbar' ? [b.id] : [])],
    );
    assert.equal(options[1].label, options.at(-1).label);
    assert.equal(f.values(shellId)[id], defaultShellId);
    assert.equal(f.read(shellId, [id]).fields[0].inherited, true);
  }
  selectShell(f, Object.fromEntries(shellRegions.map(({ id }) => [id, a.id])));
  assert.equal(a.state, 'stopped');
  assert.equal(a.enabled, false);
  assert.equal(f.decrypts(), 0);
  for (const key of ['page.settings', 'future.private', 'retry', 'enabled'])
    assert.throws(() => selectShell(f, { [key]: a.id }), { code: 'NOT_FOUND' });
});

test('Shell selection dryRun, replay, default omission and dotted IDs preserve unrelated and retired values', (t) => {
  const f = fixture(t, { device: true, updateApplets: [shellApplet('shell.a')] });
  f.store.save(
    {
      ...f.store.value,
      host: {
        ...f.store.value.host,
        shellProviders: {
          'page.settings': 'old.shell',
          'overlay.command-palette': 'retired.palette',
          'future.saved': 'future.shell',
          ribbon: defaultShellId,
        },
      },
      extensions: { 'shell.a': { enabled: false, settings: { private: 'PRIVATE_SHELL_SETTING' } } },
    },
    f.store.revision,
  );
  const before = fs.readFileSync(f.store.shared.file),
    device = fs.readFileSync(f.store.device.file),
    changes = { 'notification.banner': 'shell.a', 'notification.desktop': 'shell.a' },
    preview = selectShell(f, changes, true);
  assert.equal(preview.completion, 'validated');
  assert.equal(preview.effectVerified, false);
  assert.equal(preview.applies['notification.banner'], 'shellProvidersChanged');
  assert.deepEqual(fs.readFileSync(f.store.shared.file), before);
  assert.deepEqual(fs.readFileSync(f.store.device.file), device);
  const request = f.request(shellId, [{ kind: 'set', changes }]),
    result = f.call('apply', request);
  assert.deepEqual(f.call('apply', request), result);
  assert.equal(f.writes(), 1);
  assert.equal(f.store.value.host.shellProviders['notification.banner'], 'shell.a');
  assert.throws(() => selectShell(f, { 'overlay.command-palette': 'shell.a' }), {
    code: 'NOT_FOUND',
  });
  assert.equal(f.store.value.host.shellProviders.overlay, undefined);
  assert.deepEqual(fs.readFileSync(f.store.shared.file), before);
  const deviceBefore = JSON.parse(device),
    deviceAfter = JSON.parse(fs.readFileSync(f.store.device.file));
  deviceBefore.host.shellProviders = deviceAfter.host.shellProviders;
  assert.deepEqual(deviceAfter, deviceBefore);
  assert(f.read(shellId, Object.keys(changes)).fields.every((field) => !field.inherited));
  f.call('apply', f.request(shellId, [{ kind: 'reset', keys: Object.keys(changes) }]));
  selectShell(f, { ribbon: defaultShellId });
  assert.deepEqual(f.store.value.host.shellProviders, {
    'page.settings': 'old.shell',
    'overlay.command-palette': 'retired.palette',
    'future.saved': 'future.shell',
  });
  assert.equal(f.read(shellId, ['ribbon']).fields[0].inherited, true);
  assert.deepEqual(fs.readFileSync(f.store.shared.file), before);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.store.device.file)).host.shellProviders, {
    'page.settings': 'old.shell',
    'overlay.command-palette': 'retired.palette',
    'future.saved': 'future.shell',
  });
  const noOpWrites = f.writes();
  selectShell(f, { ribbon: defaultShellId });
  assert.equal(f.writes(), noOpWrites);
  assert.equal(f.store.value.extensions['shell.a'].enabled, false);
  assert.deepEqual(f.store.value.extensions['shell.a'].settings, {
    private: 'PRIVATE_SHELL_SETTING',
  });
  assert(!JSON.stringify(f.read(shellId)).includes('PRIVATE_SHELL_SETTING'));
});

test('Shell region additions and removals change discovery without new tool schemas and retain dormant assignments', (t) => {
  const original = [...shellRegions];
  t.after(() => shellRegions.splice(0, shellRegions.length, ...original));
  const provider = shellApplet('shell.a', ['fixture.future']),
    f = fixture(t, { updateApplets: [provider] }),
    before = f.call('schema.get', { targetId: shellId });
  shellRegions.push({ id: 'fixture.future', title: 'Future fixture' });
  const added = f.call('schema.get', { targetId: shellId });
  assert.notEqual(added.schemaRevision, before.schemaRevision);
  assert(added.items.some((field) => field.key === 'fixture.future'));
  selectShell(f, { 'fixture.future': provider.id });
  const cursor = f.call('schema.get', { targetId: shellId, limit: 1 }).nextCursor,
    stale = f.request(shellId, [{ kind: 'reset', keys: ['fixture.future'] }]);
  shellRegions.pop();
  assert.throws(() => f.call('apply', stale), { code: 'SCHEMA_CONFLICT' });
  assert.throws(() => f.call('schema.get', { targetId: shellId, limit: 1, cursor }), {
    code: 'REVISION_CONFLICT',
  });
  assert.throws(() => f.read(shellId, ['fixture.future']), { code: 'NOT_FOUND' });
  selectShell(f, { ribbon: defaultShellId });
  assert.equal(f.store.value.host.shellProviders['fixture.future'], provider.id);
  shellRegions.push({ id: 'fixture.future', title: 'Future fixture' });
  assert.equal(f.values(shellId)['fixture.future'], provider.id);
});

test('Shell candidate changes invalidate schemas, cursors and replay; disappeared selections survive unrelated edits', (t) => {
  const provider = shellApplet('shell.a'),
    f = fixture(t, { updateApplets: [provider] }),
    request = f.request(shellId, [{ kind: 'set', changes: { ribbon: provider.id } }]);
  f.call('apply', request);
  const cursor = f.call('options.list', { targetId: shellId, key: 'ribbon', limit: 1 }).nextCursor,
    oldSchema = f.call('schema.get', { targetId: shellId }).schemaRevision;
  provider.displayName = 'Renamed';
  assert.notEqual(f.call('schema.get', { targetId: shellId }).schemaRevision, oldSchema);
  assert.throws(
    () => f.call('options.list', { targetId: shellId, key: 'ribbon', limit: 1, cursor }),
    { code: 'REVISION_CONFLICT' },
  );
  assert.throws(() => f.call('apply', request), { code: 'SCHEMA_CONFLICT' });
  delete provider.shell.views.ribbon;
  assert.equal(f.values(shellId).ribbon, provider.id);
  selectShell(f, { statusbar: provider.id });
  assert.equal(f.values(shellId).ribbon, provider.id);
  assert.throws(() => selectShell(f, { ribbon: provider.id }), { code: 'INVALID_ARGUMENT' });
  f.updateApplets.splice(0);
  assert.equal(f.values(shellId).statusbar, provider.id);
  f.call('apply', f.request(shellId, [{ kind: 'reset', keys: ['ribbon', 'statusbar'] }]));
  assert.equal(f.values(shellId).ribbon, defaultShellId);
});

test('Shell selection rejects invalid batches atomically and checks current write permission and external revisions', (t) => {
  const f = fixture(t, { updateApplets: [shellApplet('shell.partial', ['ribbon'])] }),
    before = fs.readFileSync(f.store.file);
  for (const bad of ['missing.shell', true, null, { id: 'shell.partial' }])
    assert.throws(() => selectShell(f, { ribbon: 'shell.partial', statusbar: bad }), {
      code: 'INVALID_ARGUMENT',
    });
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  const request = f.request(shellId, [{ kind: 'set', changes: { ribbon: 'shell.partial' } }]);
  f.call('apply', request);
  f.setWrite(false);
  assert.throws(() => f.call('apply', request), { code: 'WRITE_DISABLED' });
  f.setWrite(true);
  const stale = f.request(shellId, [{ kind: 'reset', keys: ['ribbon'] }]),
    raw = JSON.parse(fs.readFileSync(f.store.file));
  raw.host.shellProviders.ribbon = defaultShellId;
  fs.writeFileSync(f.store.file, JSON.stringify(raw));
  assert.throws(() => f.call('apply', stale), { code: 'REVISION_CONFLICT' });
  assert.equal(f.writes(), 1);
});

test('Shell save failure preserves settings, device data and encrypted credentials', (t) => {
  const f = fixture(t, { device: true, updateApplets: [shellApplet('shell.a')] });
  f.aiSecrets.setKey(f.store.value.ai.connections[0], 'PRIVATE_AI');
  f.ttsSecrets.set(f.store.value.tts.baseUrl, 'PRIVATE_TTS');
  const files = [f.store.shared.file, f.store.device.file, f.aiFile, f.ttsFile],
    before = files.map((file) => fs.readFileSync(file)),
    rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === f.store.device.file) throw Error('Injected write failure');
    return rename(from, to);
  });
  assert.throws(() => selectShell(f, { statusbar: 'shell.a' }), { code: 'SAVE_FAILED' });
  assert.deepEqual(
    files.map((file) => fs.readFileSync(file)),
    before,
  );
  assert.equal(f.values(shellId).statusbar, defaultShellId);
  assert.equal(f.decrypts(), 0);
});

test('Shell registry consumes saved assignments with its existing per-region fallback and safe-mode rules', (t) => {
  const provider = shellApplet('shell.a'),
    fallback = shellApplet(defaultShellId, undefined, {
      sourceKind: 'builtin',
      enabled: true,
      state: 'running',
    }),
    f = fixture(t, { updateApplets: [provider, fallback] }),
    { ShellProviderRegistry } = require('../out/main/main/core/shell-provider-registry'),
    registry = new ShellProviderRegistry({
      assignments: () => f.store.value.host.shellProviders,
      providers: () => f.updateApplets,
      safeMode: false,
    });
  selectShell(f, { ribbon: provider.id });
  assert.equal(registry.configured('ribbon'), provider.id);
  assert.equal(registry.resolve('ribbon').provider.id, defaultShellId);
  provider.enabled = true;
  provider.state = 'running';
  assert.equal(registry.resolve('ribbon').provider.id, provider.id);
  assert.equal(
    new ShellProviderRegistry({
      assignments: () => f.store.value.host.shellProviders,
      providers: () => f.updateApplets,
      safeMode: true,
    }).resolve('ribbon').provider.id,
    defaultShellId,
  );
  assert.equal(f.values(shellId).ribbon, provider.id);
});

test('update fields follow existing defaults and catalog, with explicit application timing and no lifecycle commands', (t) => {
  const f = fixture(t),
    defaults = require('../out/main/shared/settings-schema').createDefaultSettings().updates,
    schema = f.call('schema.get', { targetId: updatesId });
  assert.deepEqual(schema.items.map((field) => field.key).sort(), Object.keys(defaults).sort());
  assert.deepEqual(schema.operationSchemas && Object.keys(schema.operationSchemas), [
    'set',
    'reset',
  ]);
  assert.equal(
    schema.items.find((field) => field.key === 'startupDelaySeconds').inputSchema.type,
    'integer',
  );
  assert.equal(schema.items.find((field) => field.key === 'hostSource').applies, 'nextUpdateCheck');
  assert.equal(
    schema.items.find((field) => field.key === 'checkHostOnAboutOpen').applies,
    'nextAboutOpen',
  );
  assert.equal(
    schema.items.find((field) => field.key === 'checkHostOnStartup').applies,
    'nextStartupCheck',
  );
  assert.deepEqual(f.values(updatesId), defaults);
  f.store.save(
    {
      ...f.store.value,
      updates: { ...f.store.value.updates, privateFuture: 'PRIVATE_UPDATE_STATE' },
    },
    f.store.revision,
  );
  assert(!JSON.stringify(f.read(updatesId)).includes('PRIVATE_UPDATE_STATE'));
  for (const key of ['check', 'install', 'executable', 'token', 'unregistered'])
    assert.throws(() => setUpdate(f, { [key]: true }), { code: 'NOT_FOUND' });
  assert.equal(f.writes(), 0);
});

test('update fields dryRun and batched reset share atomic, default-omitting storage without changing device or unrelated settings', (t) => {
  const f = fixture(t, { device: true }),
    before = fs.readFileSync(f.store.shared.file),
    device = fs.readFileSync(f.store.device.file),
    ai = structuredClone(f.store.value.ai),
    notifications = structuredClone(f.store.value.notificationPreferences),
    changes = {
      hostSource: 'https://example.test/update.json?v=1',
      checkHostOnAboutOpen: false,
      checkHostOnStartup: true,
      checkAppletsOnStartup: true,
      startupDelaySeconds: 120,
      notifyOnStartup: false,
      allowSameVersion: true,
    };
  const preview = setUpdate(f, changes, true);
  assert.equal(preview.completion, 'validated');
  assert.equal(preview.effectVerified, false);
  assert.deepEqual(fs.readFileSync(f.store.shared.file), before);
  assert.equal(f.writes(), 0);
  const request = f.request(updatesId, [{ kind: 'set', changes }]),
    saved = f.call('apply', request);
  assert.deepEqual(f.call('apply', request), saved);
  assert.equal(f.writes(), 1);
  assert.deepEqual(f.values(updatesId), changes);
  assert.deepEqual(fs.readFileSync(f.store.device.file), device);
  assert.deepEqual(f.store.value.ai, ai);
  assert.deepEqual(f.store.value.notificationPreferences, notifications);
  f.call('apply', f.request(updatesId, [{ kind: 'reset', keys: Object.keys(changes) }]));
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(f.store.shared.file)), 'updates'), false);
  assert(f.read(updatesId).fields.every((field) => field.inherited));
  const writes = f.writes(),
    revision = f.read(updatesId).revision;
  assert.equal(setUpdate(f, f.values(updatesId)).changed, false);
  assert.equal(f.writes(), writes);
  assert.equal(f.read(updatesId).revision, revision);
});

test('update sources validate saved syntax without network or filesystem lookups and malformed batches do not persist', (t) => {
  const f = fixture(t);
  let sourceLookups = 0;
  for (const method of ['statSync', 'readFileSync']) {
    const original = fs[method];
    t.mock.method(fs, method, (file, ...args) => {
      if (
        String(file).startsWith('A:\\Missing') ||
        String(file).startsWith('\\\\unavailable-server')
      ) {
        sourceLookups++;
        throw Error('Unexpected source lookup');
      }
      return original(file, ...args);
    });
  }
  for (const source of [
    'github:Owner/repository',
    'https://example.test/feed.json?v=1',
    'A:\\Missing\\publish',
    '\\\\unavailable-server\\publish\\update.json',
    '',
    '   ',
  ]) {
    setUpdate(f, { hostSource: source });
    assert.equal(f.values(updatesId).hostSource, source);
  }
  const before = fs.readFileSync(f.store.file),
    writes = f.writes();
  for (const source of [
    'https://user:secret@example.test/feed',
    'https://example.test/feed#fragment',
    'github:owner',
    'relative/path',
    '\\\\?\\A:\\device',
    'https://example.test/feed\n',
  ])
    assert.throws(() => setUpdate(f, { notifyOnStartup: false, hostSource: source }), {
      code: 'INVALID_ARGUMENT',
    });
  for (const delay of [-1, 3601, 1.5, '10', null])
    assert.throws(() => setUpdate(f, { hostSource: '', startupDelaySeconds: delay }), {
      code: 'INVALID_ARGUMENT',
    });
  assert.throws(() => setUpdate(f, { checkHostOnStartup: 'true' }), { code: 'INVALID_ARGUMENT' });
  assert.equal(f.writes(), writes);
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  assert.equal(f.decrypts(), 0);
  assert.equal(sourceLookups, 0);
});

test('Applet update sources distinguish same-name providers, remain editable when stopped and preserve unrelated configuration', (t) => {
  const a = updateApplet('first', { updateRepository: 'owner/first' }),
    b = updateApplet('second', { updateRepository: 'owner/second' }),
    builtin = updateApplet('builtin', { sourceKind: 'builtin' }),
    child = updateApplet('child', {
      collection: { owner: 'first', key: 'pages', itemId: 'child' },
    }),
    f = fixture(t, { device: true, updateApplets: [a, b, builtin, child] });
  f.store.save(
    {
      ...f.store.value,
      extensions: {
        first: { enabled: false, settings: { private: 'PRIVATE_VALUE' }, startupDelaySeconds: 77 },
      },
    },
    f.store.revision,
  );
  const device = fs.readFileSync(f.store.device.file),
    id = sourceTarget(f, 'first');
  assert(id);
  assert.notEqual(id, sourceTarget(f, 'second'));
  assert.equal(sourceTarget(f, 'builtin'), undefined);
  assert.equal(sourceTarget(f, 'child'), undefined);
  assert.equal(f.values(id).updateSource, 'github:owner/first');
  assert.equal(f.read(id).fields[0].inherited, true);
  f.call('apply', f.request(id, [{ kind: 'set', changes: { updateSource: '' } }]));
  assert.equal(f.values(id).updateSource, '');
  assert.equal(f.values(sourceTarget(f, 'second')).updateSource, 'github:owner/second');
  assert.equal(f.store.value.extensions.first.enabled, false);
  assert.equal(f.store.value.extensions.first.startupDelaySeconds, 77);
  assert.deepEqual(f.store.value.extensions.first.settings, { private: 'PRIVATE_VALUE' });
  assert.deepEqual(fs.readFileSync(f.store.device.file), device);
  f.call('apply', f.request(id, [{ kind: 'reset', keys: ['updateSource'] }]));
  assert.equal(f.store.value.extensions.first.updateSource, undefined);
  assert.equal(f.values(id).updateSource, 'github:owner/first');
  assert.equal(f.read(id).fields[0].inherited, true);
  assert(
    !JSON.stringify([f.read(id), f.call('schema.get', { targetId: id })]).includes('PRIVATE_VALUE'),
  );
  assert.throws(() => f.read(id, ['settings']), { code: 'NOT_FOUND' });
});

test('explicitly disabled Applet sources stay disabled when a manifest gains a default and default changes invalidate stale schemas', (t) => {
  const provider = updateApplet('without-default'),
    f = fixture(t, { updateApplets: [provider] }),
    id = sourceTarget(f, provider.id);
  assert.equal(f.read(id).fields[0].hasValue, false);
  f.call('apply', f.request(id, [{ kind: 'set', changes: { updateSource: '' } }]));
  assert.equal(f.read(id).fields[0].inherited, false);
  const stale = f.request(id, [{ kind: 'set', changes: { updateSource: 'github:new/source' } }]);
  provider.updateRepository = 'owner/new-default';
  assert.throws(() => f.call('apply', stale), { code: 'SCHEMA_CONFLICT' });
  assert.equal(f.values(id).updateSource, '');
  f.call('apply', f.request(id, [{ kind: 'reset', keys: ['updateSource'] }]));
  assert.equal(f.values(id).updateSource, 'github:owner/new-default');
  assert.equal(f.read(id).fields[0].inherited, true);
  const hidden = f.request(id, [{ kind: 'set', changes: { updateSource: '' } }]);
  provider.sourceKind = 'builtin';
  assert.throws(() => f.call('apply', hidden), { code: 'NOT_FOUND' });
});

test('update settings use current write permission and external revision, including cached requests', (t) => {
  const f = fixture(t),
    request = f.request(updatesId, [{ kind: 'set', changes: { allowSameVersion: true } }]);
  f.call('apply', request);
  f.setWrite(false);
  assert.throws(() => f.call('apply', request), { code: 'WRITE_DISABLED' });
  f.setWrite(true);
  const stale = f.request(updatesId, [{ kind: 'set', changes: { notifyOnStartup: false } }]),
    raw = JSON.parse(fs.readFileSync(f.store.file));
  raw.updates.startupDelaySeconds = 77;
  fs.writeFileSync(f.store.file, JSON.stringify(raw));
  assert.throws(() => f.call('apply', stale), { code: 'REVISION_CONFLICT' });
  assert.equal(f.writes(), 1);
});

test('update save failure preserves settings and both credential files byte-for-byte', (t) => {
  const f = fixture(t),
    before = fs.readFileSync(f.store.file),
    rename = fs.renameSync;
  f.aiSecrets.setKey(f.store.value.ai.connections[0], 'PRIVATE_AI');
  f.ttsSecrets.set(f.store.value.tts.baseUrl, 'PRIVATE_TTS');
  const ai = fs.readFileSync(f.aiFile),
    tts = fs.readFileSync(f.ttsFile);
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === f.store.file) throw Error('Injected write failure');
    return rename(from, to);
  });
  assert.throws(() => setUpdate(f, { hostSource: 'https://example.test/feed.json' }), {
    code: 'SAVE_FAILED',
  });
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  assert.deepEqual(fs.readFileSync(f.aiFile), ai);
  assert.deepEqual(fs.readFileSync(f.ttsFile), tts);
  assert.equal(f.decrypts(), 0);
});

test('update saves do not run checks, and the existing updater reads the latest saved source on an explicit check', async (t) => {
  const f = fixture(t),
    { PortableUpdates } = require('../out/main/main/core/portable-updates'),
    requests = [];
  const updater = new PortableUpdates({
    settings: () => f.store.value.updates,
    targets: () => [
      {
        id: 'host',
        name: 'Host',
        kind: 'host',
        version: '1.0.0',
        source: f.store.value.updates.hostSource,
        destination: 'unused',
      },
    ],
    hostVersion: '1.0.0',
    helper: 'unused',
    executable: 'unused',
    baseDirectory: f.dir,
    stateDirectory: f.dir,
    restartArgs: [],
    confirm: () => {
      throw Error('Unexpected install');
    },
    shutdown: () => {
      throw Error('Unexpected shutdown');
    },
    changed: () => {},
    fetcher: async (url) => {
      requests.push(String(url));
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          kind: 'host',
          id: 'host',
          version: '1.0.0',
          payload: { file: 'AppDock.exe', format: 'exe', sha256: 'a'.repeat(64), size: 20 },
        }),
      );
    },
  });
  setUpdate(f, { hostSource: 'https://example.test/one.json', checkHostOnAboutOpen: true });
  assert.deepEqual(requests, []);
  await updater.checkHostOnAboutOpen();
  assert.deepEqual(requests, ['https://example.test/one.json']);
  setUpdate(f, { hostSource: 'https://example.test/two.json' });
  assert.equal(requests.length, 1);
  await updater.checkHostOnAboutOpen();
  assert.deepEqual(requests, ['https://example.test/one.json', 'https://example.test/two.json']);
  assert.equal(f.decrypts(), 0);
});
