const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SettingsStore } = require('../out/main/main/core/settings');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { parseSettingDefinitions } = require('../out/main/shared/setting-definitions');
const { settingsItemId } = require('../out/main/shared/settings-catalog');
const { newShortcutListEntry, validShortcutList } = require('../out/main/shared/shortcut-list');
const { normalizeShortcut } = require('../out/main/shared/commands');

function fixture(t, { rows, defaults = [], device = false } = {}) {
  const directory = path.resolve('.artifacts/settings-shortcut-lists-unit', randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  const definition = {
    key: 'shortcuts',
    title: 'Shortcuts',
    type: 'shortcut-list',
    default: defaults,
  };
  const owner = {
    id: 'test.shortcut-list',
    displayName: 'Shortcut provider',
    enabled: true,
    state: 'running',
    settings: parseSettingDefinitions([
      definition,
      { ...definition, key: 'explicit', title: 'Explicit', automation: true },
      { ...definition, key: 'private', title: 'PRIVATE_TITLE', automation: false },
      { ...definition, key: 'secret', title: 'SECRET_TITLE', secret: true, automation: true },
      { ...definition, key: 'local', title: 'LOCAL_TITLE', localOnly: true, automation: true },
      { key: 'flag', title: 'Flag', type: 'boolean', default: false },
    ]),
  };
  const store = device
    ? new DeviceSettingsStore(
        path.join(directory, 'settings.json'),
        path.join(directory, 'local'),
        'TEST',
        () => [],
        () => [owner],
      )
    : new SettingsStore(path.join(directory, 'settings.json'));
  store.load();
  t.after(() => store.close());
  store.save(
    {
      ...store.value,
      extensions: {
        [owner.id]: {
          enabled: true,
          settings: {
            ...(rows === undefined ? {} : { shortcuts: rows }),
            private: [{ id: 'private', title: 'PRIVATE_VALUE', keys: 'Ctrl+P' }],
            retained: { value: 'PRIVATE_RETAINED' },
          },
        },
      },
    },
    store.revision,
  );
  if (device) store.setLocalSettings(owner.id, true, store.revision);
  const state = { writes: 0, writable: true };
  const options = {
    settings: store,
    applets: () => [owner],
    save: (next, revision) => {
      state.writes++;
      return store.save(next, revision);
    },
  };
  const commands = new SettingsCommands(options);
  const api = new AppDockApi({
    ...options,
    settingsCommands: commands,
    ready: () => true,
    writable: () => state.writable,
    executable: () => false,
    commands: () => [],
    execute: async () => {
      throw Error('Execution forbidden');
    },
    version: 'test',
    instanceId: randomUUID(),
  });
  const call = (name, args = {}) => api.call('settings.' + name, args);
  const target = () =>
    call('targets.list', { ownerId: owner.id }).items.find(
      (entry) => entry.kind === 'list' && entry.title.endsWith('/ Shortcuts'),
    );
  const read = (extra = {}) => call('items.list', { targetId: target().targetId, ...extra });
  const schema = () => call('schema.get', { targetId: target().targetId });
  const request = (operations, extra = {}) => ({
    targetId: target().targetId,
    expectedSchemaRevision: schema().schemaRevision,
    expectedRevision: read().revision,
    requestId: randomUUID(),
    operations,
    ...extra,
  });
  return {
    directory,
    owner,
    store,
    state,
    commands,
    api,
    call,
    target,
    read,
    schema,
    request,
    saved: () => store.value.extensions[owner.id].settings,
  };
}
const row = (id, extra = {}) => ({ id, title: 'Same', keys: 'Ctrl+J', ...extra });
const refuses = (action, code) => assert.throws(action, (error) => error.code === code);

test('shortcut declarations auto-publish all three editable columns without widening legacy publication', (t) => {
  const f = fixture(t, { rows: [row('one')] });
  assert.deepEqual(f.target().operations, ['add', 'update', 'remove', 'reorder']);
  const schema = f.schema();
  assert.equal(schema.maxItems, 32);
  assert.deepEqual(
    schema.items.map((field) => [field.key, field.writable]),
    [
      ['id', true],
      ['title', true],
      ['keys', true],
    ],
  );
  assert.equal(schema.items[0].inputSchema.pattern, '^[a-z0-9][a-z0-9-]{0,39}$');
  assert.equal(
    f.call('targets.list', { ownerId: f.owner.id }).items.filter((item) => item.kind === 'list')
      .length,
    2,
  );
  assert.doesNotMatch(
    JSON.stringify([f.schema(), f.read(), f.call('targets.list')]),
    /PRIVATE_|SECRET_TITLE|LOCAL_TITLE/,
  );
  assert.deepEqual(Object.keys(f.commands.get(f.owner.id).values), ['flag']);
  const access = f.api.settingsAccess({ id: 'applet:' + f.owner.id, items: [] });
  assert.equal(
    access.items[settingsItemId('applet:' + f.owner.id, 'setting:shortcuts')].reason,
    null,
  );
  assert.deepEqual(
    Object.keys(access.items[settingsItemId('applet:' + f.owner.id, 'setting:shortcuts')].fields),
    ['id', 'title', 'keys'],
  );
});

test('dryRun/add/save/replay use native defaults and preserve unrelated/private values without execution', (t) => {
  const f = fixture(t, { rows: [row('shortcut-1')] });
  const before = fs.readFileSync(f.store.file),
    privateValue = f.saved().private;
  const draft = f.request([{ kind: 'add', values: {} }], { dryRun: true });
  assert.equal(f.call('apply', draft).completion, 'validated');
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  assert.equal(f.state.writes, 0);
  const request = { ...draft, requestId: randomUUID(), dryRun: false };
  const reply = f.call('apply', request);
  assert.deepEqual(f.call('apply', request), reply);
  assert.equal(f.state.writes, 1);
  assert.deepEqual(f.read().items[1].values, newShortcutListEntry([row('shortcut-1')]));
  assert.equal(reply.revision, f.read().revision);
  assert.deepEqual(f.saved().private, privateValue);
  assert.deepEqual(f.saved().retained, { value: 'PRIVATE_RETAINED' });
});

test('MCP send-shortcut lists keep their grammar separate from gesture-only lock and IME chords', (t) => {
  const f = fixture(t, { rows: [] });
  const keys = [
    'CapsLock',
    'ScrollLock',
    'Alphanumeric',
    'KanaMode',
    'KANA',
    'Convert',
    'NonConvert',
    'Ctrl+ScrollLock',
    'Ctrl+Alt+NonConvert',
    'Ctrl+Alt+Shift+KanaMode',
  ];
  const before = fs.readFileSync(f.store.file);
  for (const key of keys) {
    assert.equal(normalizeShortcut(key), key === 'KANA' ? 'KanaMode' : key);
    for (const dryRun of [true, false])
      refuses(
        () =>
          f.call(
            'apply',
            f.request([{ kind: 'add', values: { id: 'key', title: key, keys: key } }], { dryRun }),
          ),
        'INVALID_ARGUMENT',
      );
  }
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  assert.equal(f.state.writes, 0);
  assert.deepEqual(f.saved().shortcuts, []);
});

test('partial edits allow explicit ID/name/key changes and retain unknown data and other rows', (t) => {
  const f = fixture(t, {
    rows: [row('one', { hidden: { token: 'PRIVATE_ROW_VALUE' } }), row('two')],
  });
  const first = f.read().items[0];
  assert.equal(first.removable, false);
  assert.doesNotMatch(JSON.stringify(f.read()), /PRIVATE_ROW_VALUE|hidden/);
  const result = f.call(
    'apply',
    f.request([
      {
        kind: 'update',
        itemRef: first.itemRef,
        changes: { id: 'renamed', title: 'Edited', keys: 'Control + Shift + J' },
      },
    ]),
  );
  assert.deepEqual(f.saved().shortcuts, [
    row('renamed', {
      title: 'Edited',
      keys: 'Control + Shift + J',
      hidden: { token: 'PRIVATE_ROW_VALUE' },
    }),
    row('two'),
  ]);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_ROW_VALUE|hidden/);
  assert.equal(result.revision, f.read().revision);
});

test('invalid IDs, duplicate IDs, invalid keys and late invalid edits fail atomically', (t) => {
  const f = fixture(t, { rows: [row('one'), row('two')] });
  const before = fs.readFileSync(f.store.file),
    refs = f.read().items.map((item) => item.itemRef);
  for (const changes of [
    { id: '' },
    { id: 'Bad.ID' },
    { id: 'x'.repeat(41) },
    { id: 'two' },
    { title: '' },
    { title: 'x'.repeat(101) },
    { keys: '' },
    { keys: 'Ctrl+Ctrl+J' },
    { keys: '%{F4}' },
    { keys: 5 },
  ])
    refuses(
      () => f.call('apply', f.request([{ kind: 'update', itemRef: refs[0], changes }])),
      'INVALID_ARGUMENT',
    );
  refuses(
    () =>
      f.call(
        'apply',
        f.request([
          { kind: 'update', itemRef: refs[0], changes: { title: 'Do not save' } },
          { kind: 'update', itemRef: refs[1], changes: { keys: 'bad-key' } },
        ]),
      ),
    'INVALID_ARGUMENT',
  );
  refuses(
    () =>
      f.call(
        'apply',
        f.request([{ kind: 'add', values: { id: 'one', title: 'Duplicate', keys: 'J' } }]),
      ),
    'INVALID_ARGUMENT',
  );
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  assert.equal(f.state.writes, 0);
});

test('unknown columns stay nonpublic and protected rows cannot be deleted implicitly', (t) => {
  const f = fixture(t, { rows: [row('one', { secretState: 'PRIVATE_STATE' }), row('two')] });
  refuses(
    () =>
      f.call(
        'apply',
        f.request([
          { kind: 'update', itemRef: f.read().items[0].itemRef, changes: { secretState: 'new' } },
        ]),
      ),
    'NOT_FOUND',
  );
  refuses(
    () => f.call('apply', f.request([{ kind: 'remove', itemRef: f.read().items[0].itemRef }])),
    'LOCAL_ACTION_REQUIRED',
  );
  f.call('apply', f.request([{ kind: 'remove', itemRef: f.read().items[1].itemRef }]));
  assert.equal(f.saved().shortcuts.length, 1);
  assert.equal(f.saved().shortcuts[0].secretState, 'PRIVATE_STATE');
});

test('reorder and insertion preserve IDs and unknown values; empty lists do not regenerate defaults', (t) => {
  const f = fixture(t, {
    rows: [row('one'), row('two', { unknown: 7 })],
    defaults: [row('default')],
  });
  f.call(
    'apply',
    f.request([
      {
        kind: 'reorder',
        itemRefs: f
          .read()
          .items.map((item) => item.itemRef)
          .reverse(),
      },
    ]),
  );
  assert.deepEqual(
    f.saved().shortcuts.map((item) => item.id),
    ['two', 'one'],
  );
  assert.equal(f.saved().shortcuts[0].unknown, 7);
  f.call(
    'apply',
    f.request([
      {
        kind: 'add',
        beforeItemRef: f.read().items[1].itemRef,
        values: { id: 'inserted', title: 'Inserted', keys: 'Alt+J' },
      },
    ]),
  );
  assert.deepEqual(
    f.saved().shortcuts.map((item) => item.id),
    ['two', 'inserted', 'one'],
  );
  const plain = fixture(t, { rows: [row('one')], defaults: [row('default')] });
  plain.call('apply', plain.request([{ kind: 'remove', itemRef: plain.read().items[0].itemRef }]));
  assert.deepEqual(plain.saved().shortcuts, []);
  assert.deepEqual(plain.read().items, []);
});

test('32-row limit, pagination and no-change detection share existing validation', (t) => {
  const f = fixture(t, { rows: Array.from({ length: 32 }, (_, i) => row('item-' + i)) });
  const first = f.read({ limit: 20 }),
    second = f.read({ limit: 20, cursor: first.nextCursor });
  assert.equal(first.items.length + second.items.length, 32);
  refuses(() => f.call('apply', f.request([{ kind: 'add', values: {} }])), 'INVALID_ARGUMENT');
  const before = fs.readFileSync(f.store.file);
  assert.equal(
    f.call(
      'apply',
      f.request([{ kind: 'update', itemRef: first.items[0].itemRef, changes: { keys: 'Ctrl+J' } }]),
    ).changed,
    false,
  );
  assert.equal(f.state.writes, 0);
  assert.deepEqual(fs.readFileSync(f.store.file), before);
});

test('stale itemRefs/cursors and revoked write including replay are rejected', (t) => {
  const f = fixture(t, { rows: [row('one'), row('two')] }),
    old = f.read({ limit: 1 });
  const replay = f.request([
    { kind: 'update', itemRef: old.items[0].itemRef, changes: { title: 'New' } },
  ]);
  f.call('apply', replay);
  refuses(() => f.read({ cursor: old.nextCursor, limit: 1 }), 'REVISION_CONFLICT');
  refuses(
    () =>
      f.call(
        'apply',
        f.request([
          { kind: 'update', itemRef: old.items[0].itemRef, changes: { title: 'Old ref' } },
        ]),
      ),
    'REVISION_CONFLICT',
  );
  f.state.writable = false;
  refuses(() => f.call('apply', replay), 'WRITE_DISABLED');
});

test('stopped owners and malformed stored shortcut values are unavailable without projecting invalid objects', (t) => {
  for (const rows of [
    null,
    [row('one', { keys: { token: 'PRIVATE_BAD_KEY' } })],
    '[{"id":"one"}]',
    Array.from({ length: 33 }, (_, i) => row('row-' + i)),
  ]) {
    const f = fixture(t, { rows });
    assert.equal(f.target().available, false);
    assert.deepEqual(f.read().items, []);
    assert.doesNotMatch(JSON.stringify(f.read()), /PRIVATE_BAD_KEY/);
    refuses(() => f.call('apply', f.request([{ kind: 'add', values: {} }])), 'UNAVAILABLE');
  }
  const f = fixture(t, { rows: [row('one')] });
  f.owner.state = 'stopped';
  assert.equal(f.target().available, false);
  refuses(() => f.call('apply', f.request([{ kind: 'add', values: {} }])), 'UNAVAILABLE');
});

test('later shortcut declarations and device-only storage use the existing owners and saved keys', (t) => {
  const f = fixture(t, { rows: [row('one')], device: true });
  const shared = fs.readFileSync(f.store.file);
  f.call(
    'apply',
    f.request([
      { kind: 'update', itemRef: f.read().items[0].itemRef, changes: { title: 'Device only' } },
    ]),
  );
  assert.deepEqual(fs.readFileSync(f.store.file), shared);
  assert.equal(f.saved().shortcuts[0].title, 'Device only');
  assert.equal(validShortcutList(f.saved().shortcuts), true);
  const previous = f.call('targets.list', { ownerId: f.owner.id }).items.length;
  f.owner.settings.push(
    ...parseSettingDefinitions([
      { key: 'later', title: 'Later shortcuts', type: 'shortcut-list', default: [row('later')] },
    ]),
  );
  assert.equal(f.call('targets.list', { ownerId: f.owner.id }).items.length, previous + 1);
});
