const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SettingsStore } = require('../out/main/main/core/settings');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { RegisteredImages } = require('../out/main/main/core/registered-images');
const { parseSettingDefinitions } = require('../out/main/shared/setting-definitions');
const { settingsItemId } = require('../out/main/shared/settings-catalog');

function fixture(t, { rows = [], stored = {}, imageDefault = null, rowImageDefault = null } = {}) {
  const dir = path.resolve('.artifacts/settings-image-unit', randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  const definitions = parseSettingDefinitions([
    { key: 'name', title: 'Name', type: 'string', default: 'Initial' },
    { key: 'image', title: 'Image', type: 'registered-image', default: imageDefault },
    { key: 'explicit', title: 'Explicit image', type: 'registered-image', automation: true },
    { key: 'private', title: 'PRIVATE_IMAGE', type: 'registered-image', automation: false },
    {
      key: 'secret',
      title: 'SECRET_IMAGE',
      type: 'registered-image',
      secret: true,
      automation: true,
    },
    { key: 'local', title: 'LOCAL_IMAGE', type: 'registered-image', localOnly: true },
    {
      key: 'rows',
      title: 'Rows',
      type: 'object-list',
      default: [],
      list: { idKey: 'id', titleKey: 'name', columns: ['name'] },
      fields: [
        { key: 'id', title: 'ID', type: 'string' },
        { key: 'name', title: 'Name', type: 'string', default: 'New', minLength: 1 },
        {
          key: 'picture',
          title: 'Picture',
          type: 'registered-image',
          default: rowImageDefault,
          propertyPath: ['presentation', 'image'],
          aliases: ['oldPicture'],
        },
        { key: 'hiddenImage', title: 'HIDDEN_COLUMN', type: 'registered-image', automation: false },
      ],
    },
  ]);
  const owner = {
    id: 'test.image-settings',
    displayName: 'Images',
    enabled: true,
    state: 'running',
    settings: definitions,
  };
  const store = new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  store.save(
    {
      ...store.value,
      extensions: {
        [owner.id]: {
          enabled: true,
          settings: {
            private: { file: 'PRIVATE_VALUE.png' },
            secret: { file: 'SECRET_VALUE.png' },
            rows,
            ...stored,
          },
        },
      },
    },
    store.revision,
  );
  const state = { images: ['old.png', 'new.png'], writable: true, writes: 0, optionCalls: 0 };
  const options = {
    settings: store,
    applets: () => [owner],
    save: (next, revision) => {
      state.writes++;
      return store.save(next, revision);
    },
    settingOptions: (_owner, field) => {
      state.optionCalls++;
      assert.equal(field.type, 'registered-image');
      return state.images.map((file) => ({ value: file, label: file }));
    },
  };
  const commands = new SettingsCommands(options);
  const api = new AppDockApi({
    ...options,
    settingsCommands: commands,
    ready: () => true,
    writable: () => state.writable,
    executable: () => false,
    settingsPrincipal: () => 'images',
    version: 'test',
    instanceId: randomUUID(),
    commands: () => [],
    execute: async () => {
      throw Error('Execution forbidden');
    },
  });
  const call = (method, args = {}) => api.call('settings.' + method, args);
  const target = (kind = 'fields') =>
    call('targets.list', { ownerId: owner.id }).items.find((item) => item.kind === kind).targetId;
  const read = (kind = 'fields') =>
    call(kind === 'list' ? 'items.list' : 'values.get', { targetId: target(kind) });
  const request = (operations, kind = 'fields', extra = {}) => ({
    targetId: target(kind),
    expectedSchemaRevision: call('schema.get', { targetId: target(kind) }).schemaRevision,
    expectedRevision: read(kind).revision,
    requestId: randomUUID(),
    operations,
    ...extra,
  });
  const saved = () => store.value.extensions[owner.id].settings;
  return { dir, owner, store, state, commands, api, call, target, read, request, saved };
}
const field = (f, key) => f.read().fields.find((item) => item.key === key);
const invalid = (action) => assert.throws(action, (error) => error.code === 'INVALID_ARGUMENT');

test('registered image declarations are automatically public with bounded reference schemas and private fields excluded', (t) => {
  const f = fixture(t);
  const schema = f.call('schema.get', { targetId: f.target() });
  assert.deepEqual(
    schema.items.map((item) => item.key),
    ['name', 'image', 'explicit'],
  );
  const image = schema.items.find((item) => item.key === 'image');
  assert.equal(image.type, 'registered-image');
  assert.equal(image.writable, true);
  assert.deepEqual(image.inputSchema.anyOf[0], { type: 'null' });
  assert.equal(image.inputSchema.anyOf[1].additionalProperties, false);
  assert.doesNotMatch(JSON.stringify([schema, f.read()]), /PRIVATE_|SECRET_|LOCAL_IMAGE/);
  for (const key of ['private', 'secret', 'local'])
    assert.throws(
      () => f.call('options.list', { targetId: f.target(), key }),
      (error) => error.code === 'NOT_FOUND',
    );
  assert.deepEqual(Object.keys(f.commands.get(f.owner.id).values), ['name']);
  const access = f.api.settingsAccess({ id: 'applet:' + f.owner.id, items: [] });
  assert.equal(access.items[settingsItemId('applet:' + f.owner.id, 'setting:image')].reason, null);
  f.owner.state = 'stopped';
  assert.equal(f.call('schema.get', { targetId: f.target() }).available, false);
  assert.throws(
    () => f.call('apply', f.request([{ kind: 'set', changes: { image: null } }])),
    (error) => error.code === 'UNAVAILABLE',
  );
});

test('reference candidates use the fixed options entry and paginate without returning content or paths', (t) => {
  const f = fixture(t);
  f.state.images = Array.from(
    { length: 512 },
    (_, index) => `image-${String(index).padStart(3, '0')}.png`,
  );
  const items = [];
  let cursor;
  do {
    const result = f.call('options.list', {
      targetId: f.target(),
      key: 'image',
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    items.push(...result.items);
    cursor = result.nextCursor;
  } while (cursor);
  assert.equal(items.length, 512);
  assert.deepEqual(items[0], { value: 'image-000.png', label: 'image-000.png' });
  assert.doesNotMatch(JSON.stringify(items), /thumbnail|generation|data:|[A-Z]:\\/);
  assert.equal(f.state.writes, 0);
});

test('dryRun, save, replay, clear and reset preserve private settings and exact image bytes', (t) => {
  const f = fixture(t, { imageDefault: { file: 'default.png' } });
  const original = Buffer.from('original image bytes');
  const imageFile = path.join(f.dir, 'new.png');
  fs.writeFileSync(imageFile, original);
  const request = f.request([{ kind: 'set', changes: { image: { file: 'new.png' } } }], 'fields', {
    dryRun: true,
  });
  const before = fs.readFileSync(f.store.file ?? path.join(f.dir, 'settings.json'));
  assert.equal(f.call('apply', request).completion, 'validated');
  assert.equal(f.state.writes, 0);
  assert.deepEqual(fs.readFileSync(path.join(f.dir, 'settings.json')), before);
  const save = { ...request, requestId: randomUUID(), dryRun: false };
  f.call('apply', save);
  f.call('apply', save);
  assert.equal(f.state.writes, 1);
  assert.deepEqual(field(f, 'image').value, { file: 'new.png' });
  f.call('apply', f.request([{ kind: 'set', changes: { image: null } }]));
  assert.equal(field(f, 'image').value, null);
  f.call('apply', f.request([{ kind: 'reset', keys: ['image'] }]));
  assert.deepEqual(field(f, 'image').value, { file: 'default.png' });
  assert.equal(field(f, 'image').inherited, true);
  assert.equal(Object.hasOwn(f.saved(), 'image'), false);
  assert.deepEqual(f.saved().secret, { file: 'SECRET_VALUE.png' });
  assert.deepEqual(fs.readFileSync(imageFile), original);
});

test('unregistered images, URLs, paths and extra reference properties fail atomically', (t) => {
  const f = fixture(t);
  for (const image of [
    { file: 'unknown.png' },
    { file: '../old.png' },
    { file: 'C:\\old.png' },
    { file: 'https://host/old.png' },
    { file: 'old.png', extra: 'ignored' },
    'old.png',
    { file: 'CON.png' },
  ]) {
    invalid(() =>
      f.call('apply', f.request([{ kind: 'set', changes: { name: 'Changed', image } }])),
    );
    assert.equal(f.state.writes, 0);
    assert.equal(field(f, 'name').value, 'Initial');
  }
  f.call('apply', f.request([{ kind: 'set', changes: { image: { file: 'NEW.PNG' } } }]));
  assert.deepEqual(field(f, 'image').value, { file: 'NEW.PNG' });
});

test('candidate changes invalidate schemas, option cursors and prepared saves while write revocation still applies', (t) => {
  const f = fixture(t);
  const page = f.call('options.list', { targetId: f.target(), key: 'image', limit: 1 });
  const request = f.request([{ kind: 'set', changes: { image: { file: 'new.png' } } }]);
  f.state.images = ['old.png', 'third.png'];
  assert.throws(
    () =>
      f.call('options.list', {
        targetId: f.target(),
        key: 'image',
        limit: 1,
        cursor: page.nextCursor,
      }),
    (error) => error.code === 'REVISION_CONFLICT',
  );
  assert.throws(
    () => f.call('apply', request),
    (error) => error.code === 'SCHEMA_CONFLICT',
  );
  f.state.writable = false;
  assert.throws(
    () => f.call('apply', f.request([{ kind: 'set', changes: { image: null } }])),
    (error) => error.code === 'WRITE_DISABLED',
  );
  assert.equal(f.state.writes, 0);
});

test('unavailable stored image references are retained by unrelated edits and malformed values are never published', (t) => {
  const f = fixture(t, {
    stored: {
      image: { file: 'missing.png' },
      explicit: { file: 'PRIVATE_PATH', token: 'PRIVATE_INLINE' },
    },
  });
  assert.deepEqual(field(f, 'image').value, { file: 'missing.png' });
  assert.equal(field(f, 'explicit').hasValue, false);
  assert.doesNotMatch(JSON.stringify(f.read()), /PRIVATE_PATH|PRIVATE_INLINE/);
  f.call('apply', f.request([{ kind: 'set', changes: { name: 'Renamed' } }]));
  assert.deepEqual(f.saved().image, { file: 'missing.png' });
  assert.deepEqual(f.saved().explicit, { file: 'PRIVATE_PATH', token: 'PRIVATE_INLINE' });
  f.state.images = [];
  f.call('apply', f.request([{ kind: 'set', changes: { image: null } }]));
  assert.equal(field(f, 'image').value, null);
});

test('list image columns use the same options and preserve nested values, aliases and original rows', (t) => {
  const f = fixture(t, {
    rows: [
      {
        id: 'one',
        name: 'One',
        oldPicture: { file: 'old.png' },
        presentation: { retained: 7, image: { file: 'old.png' } },
        unknown: { kept: true },
      },
    ],
  });
  const schema = f.call('schema.get', { targetId: f.target('list') });
  assert.equal(schema.items.find((item) => item.key === 'picture').type, 'registered-image');
  assert(!schema.items.some((item) => item.key === 'hiddenImage'));
  const before = f.read('list').items[0];
  assert.deepEqual(before.values.picture, { file: 'old.png' });
  assert.equal(before.removable, false);
  assert.equal(
    f.call('options.list', { targetId: f.target('list'), key: 'picture', itemRef: before.itemRef })
      .items.length,
    2,
  );
  const request = f.request(
    [{ kind: 'update', itemRef: before.itemRef, changes: { picture: { file: 'new.png' } } }],
    'list',
  );
  f.call('apply', { ...request, requestId: randomUUID(), dryRun: true });
  assert.equal(f.state.writes, 0);
  f.call('apply', request);
  const row = f.saved().rows[0];
  assert.equal(Object.hasOwn(row, 'oldPicture'), false);
  assert.deepEqual(row.presentation, { retained: 7, image: { file: 'new.png' } });
  assert.deepEqual(row.unknown, { kept: true });
  const current = f.read('list').items[0];
  assert.throws(
    () => f.call('apply', f.request([{ kind: 'remove', itemRef: current.itemRef }], 'list')),
    (error) => error.code === 'LOCAL_ACTION_REQUIRED',
  );
  f.call(
    'apply',
    f.request([{ kind: 'update', itemRef: current.itemRef, changes: { picture: null } }], 'list'),
  );
  const cleared = f.read('list').items[0];
  assert.equal(cleared.removable, true);
  f.call('apply', f.request([{ kind: 'remove', itemRef: cleared.itemRef }], 'list'));
  assert.deepEqual(f.saved().rows, []);
});

test('explicit null clears a nested image even when its declaration has a non-null default', (t) => {
  const f = fixture(t, {
    rowImageDefault: { file: 'default.png' },
    rows: [{ id: 'one', name: 'One', presentation: { image: { file: 'old.png' } } }],
  });
  const row = f.read('list').items[0];
  f.call(
    'apply',
    f.request([{ kind: 'update', itemRef: row.itemRef, changes: { picture: null } }], 'list'),
  );
  assert.equal(f.read('list').items[0].values.picture, null);
  assert.equal(f.read('list').items[0].removable, true);
  assert.equal(f.saved().rows[0].presentation.image, null);
});

test('malformed stored image columns never expose unknown properties and require explicit clearing', (t) => {
  const f = fixture(t, {
    rows: [
      {
        id: 'one',
        name: 'One',
        presentation: { image: { file: 'PRIVATE_PATH', token: 'PRIVATE_INLINE' } },
      },
    ],
  });
  const row = f.read('list').items[0];
  assert.equal(Object.hasOwn(row.values, 'picture'), false);
  assert.equal(row.removable, false);
  assert.doesNotMatch(JSON.stringify(f.read('list')), /PRIVATE_PATH|PRIVATE_INLINE/);
  const request = f.request(
    [{ kind: 'update', itemRef: row.itemRef, changes: { picture: null } }],
    'list',
  );
  const preview = f.call('apply', { ...request, requestId: randomUUID(), dryRun: true });
  assert.doesNotMatch(JSON.stringify(preview), /PRIVATE_PATH|PRIVATE_INLINE/);
  assert.equal(f.state.writes, 0);
  assert.equal(f.saved().rows[0].presentation.image.token, 'PRIVATE_INLINE');
  assert.doesNotMatch(JSON.stringify(f.call('apply', request)), /PRIVATE_PATH|PRIVATE_INLINE/);
  assert.equal(f.read('list').items[0].values.picture, null);
});

test('image list updates reject invalid late values atomically and candidate revisions bind row edits', (t) => {
  const f = fixture(t, {
    rows: [{ id: 'one', name: 'One', presentation: { image: { file: 'old.png' } } }],
  });
  const row = f.read('list').items[0];
  invalid(() =>
    f.call(
      'apply',
      f.request(
        [
          {
            kind: 'update',
            itemRef: row.itemRef,
            changes: { name: 'Changed', picture: { file: 'unknown.png' } },
          },
        ],
        'list',
      ),
    ),
  );
  assert.equal(f.state.writes, 0);
  assert.equal(f.saved().rows[0].name, 'One');
  const request = f.request(
    [{ kind: 'update', itemRef: row.itemRef, changes: { picture: null } }],
    'list',
  );
  f.state.images = ['old.png'];
  assert.throws(
    () => f.call('apply', request),
    (error) => error.code === 'SCHEMA_CONFLICT',
  );
});

test('list additions use existing defaults and ID generation without broadening private columns', (t) => {
  const f = fixture(t);
  f.call(
    'apply',
    f.request([{ kind: 'add', values: { name: 'Added', picture: { file: 'new.png' } } }], 'list'),
  );
  const row = f.saved().rows[0];
  assert.match(row.id, /^[a-f0-9-]{36}$/);
  assert.deepEqual(row.presentation.image, { file: 'new.png' });
  assert.throws(
    () =>
      f.call(
        'apply',
        f.request(
          [
            {
              kind: 'update',
              itemRef: f.read('list').items[0].itemRef,
              changes: { hiddenImage: null },
            },
          ],
          'list',
        ),
      ),
    (error) => error.code === 'NOT_FOUND',
  );
});

test('cached available references omit missing/error images and never return decoding content', async (t) => {
  const dir = path.resolve('.artifacts/settings-image-cache', randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  let decoded = 0;
  const library = new RegisteredImages(dir, () => {
    decoded++;
    return { width: 1, height: 1, thumbnail: 'PRIVATE_THUMBNAIL', circle: 'PRIVATE_CIRCLE' };
  });
  t.after(() => library.stop());
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from('fixture'),
  ]);
  await library.add(bytes, 'ready.png');
  const calls = decoded;
  assert.deepEqual(library.availableReferences(), [{ file: 'ready.png' }]);
  assert.equal(decoded, calls);
  assert.doesNotMatch(JSON.stringify(library.availableReferences()), /PRIVATE_|generation|width/);
  const refs = library.availableReferences();
  refs[0].file = 'changed.png';
  assert.equal(library.availableReferences()[0].file, 'ready.png');
  fs.unlinkSync(path.join(dir, 'ready.png'));
  await library.refresh();
  assert.deepEqual(library.availableReferences(), []);
  library.error = 'temporary';
  assert.deepEqual(library.availableReferences(), []);
});
