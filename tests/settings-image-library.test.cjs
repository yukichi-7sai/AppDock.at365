const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SettingsStore } = require('../out/main/main/core/settings');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { ImageLibrarySettings } = require('../out/main/main/core/image-library-settings');
const {
  imageLibrarySettingsTargets,
} = require('../out/main/main/core/settings-image-library-targets');
const { ImageLibraryHost } = require('../out/main/main/core/image-library-host');
const group = (id, images = []) => ({ id, name: id, images: images.map((file) => ({ file })) });
function fixture(
  t,
  {
    groups = [group('one', ['first.png']), group('two', ['first.png', 'missing.png'])],
    device = false,
  } = {},
) {
  const directory = path.resolve('.artifacts/settings-image-library-unit', randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  const store = device
    ? new DeviceSettingsStore(
        path.join(directory, 'settings.json'),
        path.join(directory, 'local'),
        'TEST',
        () => [],
        () => [],
      )
    : new SettingsStore(path.join(directory, 'settings.json'));
  store.load();
  t.after(() => store.close());
  store.save(
    {
      ...store.value,
      imageLibrary: { groups },
      extensions: {
        retained: {
          enabled: false,
          settings: { image: { file: 'first.png' }, secret: 'PRIVATE_SETTINGS' },
        },
      },
    },
    store.revision,
  );
  const original = path.join(directory, 'first.png');
  fs.writeFileSync(original, 'original image bytes');
  const state = { writes: 0, writable: true, candidates: ['first.png', 'second.png'], reads: 0 };
  const forbidden = () => {
    throw Error('Image I/O forbidden');
  };
  const images = {
    availableReferences: () => {
      state.reads++;
      return state.candidates.map((file) => ({ file }));
    },
    refresh: forbidden,
    add: forbidden,
    remove: forbidden,
    read: forbidden,
  };
  const native = new ImageLibraryHost(images, {
    settings: store,
    window: forbidden,
    writable: () => {},
    show: forbidden,
  });
  const owner = native.configuration;
  const options = {
    settings: store,
    applets: () => [],
    save: (next, revision) => store.save(next, revision),
  };
  const commands = new SettingsCommands(options);
  const originalSave = store.save.bind(store);
  store.save = (...args) => {
    state.writes++;
    return originalSave(...args);
  };
  const api = new AppDockApi({
    ...options,
    settingsCommands: commands,
    serviceSettingsTargets: () =>
      imageLibrarySettingsTargets({
        owner,
        references: () => images.availableReferences(),
        checkRevision: (revision) => commands.checkRevision(revision),
      }),
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
  const call = (method, args = {}) => api.call('settings.' + method, args);
  const target = (id) =>
    call('targets.list', { limit: 100 }).items.find((item) =>
      id
        ? item.targetId === `service.image-library.members.${Buffer.from(id).toString('base64url')}`
        : item.category === 'image-library',
    );
  const read = (id, extra = {}) => call('items.list', { targetId: target(id).targetId, ...extra });
  const request = (operations, id, extra = {}) => ({
    targetId: target(id).targetId,
    expectedRevision: read(id).revision,
    expectedSchemaRevision: call('schema.get', { targetId: target(id).targetId }).schemaRevision,
    requestId: randomUUID(),
    operations,
    ...extra,
  });
  return {
    directory,
    store,
    state,
    original,
    images,
    native,
    owner,
    commands,
    api,
    call,
    target,
    read,
    request,
  };
}
const refuses = (action, code) => assert.throws(action, (error) => error.code === code);

test('classification discovery exposes only group identities/names and filenames through cached options', (t) => {
  const f = fixture(t);
  assert.deepEqual(f.target().operations, ['add', 'update', 'remove', 'reorder']);
  assert.deepEqual(f.target('one').operations, ['add', 'remove', 'reorder']);
  const schema = f.call('schema.get', { targetId: f.target().targetId });
  assert.deepEqual(
    schema.items.map((field) => [field.key, field.writable]),
    [
      ['id', false],
      ['name', true],
    ],
  );
  assert.equal(schema.maxItems, 64);
  assert.equal(f.call('schema.get', { targetId: f.target('one').targetId }).maxItems, 512);
  assert.deepEqual(
    f.read('two').items.map((row) => row.values),
    [{ file: 'first.png' }, { file: 'missing.png' }],
  );
  assert.deepEqual(
    f.call('options.list', { targetId: f.target('one').targetId, key: 'file' }).items,
    [
      { value: 'first.png', label: 'first.png' },
      { value: 'second.png', label: 'second.png' },
    ],
  );
  assert.doesNotMatch(
    JSON.stringify([schema, f.read(), f.read('one')]),
    /PRIVATE_|thumbnail|data:|generation|[A-Z]:\\/,
  );
  assert.equal(f.state.writes, 0);
});

test('dryRun/save/replay and native edit share classification planning while other settings/images remain exact', async (t) => {
  const f = fixture(t),
    before = fs.readFileSync(f.store.file),
    other = structuredClone(f.store.value.extensions);
  const operations = [
    { kind: 'update', itemRef: f.read().items[0].itemRef, changes: { name: 'MCP group' } },
  ];
  assert.equal(
    f.call('apply', f.request(operations, undefined, { dryRun: true })).completion,
    'validated',
  );
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  assert.equal(f.state.writes, 0);
  const request = f.request(operations),
    reply = f.call('apply', request);
  assert.deepEqual(f.call('apply', request), reply);
  assert.equal(reply.revision, f.read().revision);
  assert.equal(f.state.writes, 1);
  const current = f.owner.snapshot().groups[0];
  await f.native.edit({
    kind: 'update',
    before: current,
    group: { ...current, name: 'Native group' },
  });
  assert.equal(f.read().items[0].values.name, 'Native group');
  assert.deepEqual(f.store.value.extensions, other);
  assert.equal(fs.readFileSync(f.original, 'utf8'), 'original image bytes');
});

test('group add/insert/reorder/delete retain IDs, membership refs, missing images and original files', (t) => {
  const f = fixture(t);
  f.call(
    'apply',
    f.request([
      { kind: 'add', beforeItemRef: f.read().items[1].itemRef, values: { name: 'Added' } },
    ]),
  );
  const added = f.read().items[1];
  assert.match(added.values.id, /^[a-f0-9-]{36}$/);
  assert.equal(f.target(added.values.id).category, 'image-library-members');
  f.call(
    'apply',
    f.request([
      {
        kind: 'reorder',
        itemRefs: f
          .read()
          .items.map((row) => row.itemRef)
          .reverse(),
      },
    ]),
  );
  assert.deepEqual(
    f.read().items.map((row) => row.values.id),
    ['two', added.values.id, 'one'],
  );
  f.call('apply', f.request([{ kind: 'remove', itemRef: f.read().items[0].itemRef }]));
  assert.equal(f.target('two'), undefined);
  assert.deepEqual(f.owner.snapshot().groups.find((group) => group.id === 'one').images, [
    { file: 'first.png' },
  ]);
  assert.equal(fs.readFileSync(f.original, 'utf8'), 'original image bytes');
  assert.equal(f.store.value.extensions.retained.settings.image.file, 'first.png');
});

test('group names normalize and validate atomically, including multi-row swaps and readonly IDs', (t) => {
  const f = fixture(t),
    refs = f.read().items.map((row) => row.itemRef),
    before = fs.readFileSync(f.store.file);
  for (const name of ['', '  ', 'TWO', 'x'.repeat(81), 'bad\nname'])
    refuses(
      () => f.call('apply', f.request([{ kind: 'update', itemRef: refs[0], changes: { name } }])),
      'INVALID_ARGUMENT',
    );
  refuses(
    () =>
      f.call(
        'apply',
        f.request([
          { kind: 'update', itemRef: refs[0], changes: { name: 'No partial' } },
          { kind: 'update', itemRef: refs[1], changes: { name: '' } },
        ]),
      ),
    'INVALID_ARGUMENT',
  );
  refuses(
    () =>
      f.call('apply', f.request([{ kind: 'update', itemRef: refs[0], changes: { id: 'other' } }])),
    'INVALID_ARGUMENT',
  );
  refuses(
    () =>
      f.call('apply', f.request([{ kind: 'update', itemRef: refs[0], changes: { images: [] } }])),
    'NOT_FOUND',
  );
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  f.call(
    'apply',
    f.request([
      { kind: 'update', itemRef: refs[0], changes: { name: ' two ' } },
      { kind: 'update', itemRef: refs[1], changes: { name: 'one' } },
    ]),
  );
  assert.deepEqual(
    f.owner.snapshot().groups.map((group) => group.name),
    ['two', 'one'],
  );
});

test('membership add/remove/reorder is classification only and keeps other groups/settings unchanged', (t) => {
  const f = fixture(t),
    other = structuredClone(f.owner.snapshot().groups[1]);
  f.call(
    'apply',
    f.request(
      [
        {
          kind: 'add',
          beforeItemRef: f.read('one').items[0].itemRef,
          values: { file: 'second.png' },
        },
      ],
      'one',
    ),
  );
  assert.deepEqual(
    f.read('one').items.map((row) => row.values.file),
    ['second.png', 'first.png'],
  );
  f.call(
    'apply',
    f.request(
      [
        {
          kind: 'reorder',
          itemRefs: f
            .read('one')
            .items.map((row) => row.itemRef)
            .reverse(),
        },
      ],
      'one',
    ),
  );
  f.call('apply', f.request([{ kind: 'remove', itemRef: f.read('one').items[0].itemRef }], 'one'));
  assert.deepEqual(
    f.read('one').items.map((row) => row.values.file),
    ['second.png'],
  );
  assert.deepEqual(f.owner.snapshot().groups[1], other);
  assert.equal(fs.readFileSync(f.original, 'utf8'), 'original image bytes');
  assert.equal(f.store.value.extensions.retained.settings.image.file, 'first.png');
});

test('paths/URLs/unavailable files, duplicate references and missing filename fail without partial writes', (t) => {
  const f = fixture(t),
    before = fs.readFileSync(f.store.file);
  for (const file of [
    '../first.png',
    'C:\\first.png',
    'https://example.test/first.png',
    'unknown.png',
    'FIRST.PNG',
  ])
    refuses(
      () => f.call('apply', f.request([{ kind: 'add', values: { file } }], 'one')),
      'INVALID_ARGUMENT',
    );
  refuses(
    () => f.call('apply', f.request([{ kind: 'add', values: {} }], 'one')),
    'INVALID_ARGUMENT',
  );
  refuses(
    () =>
      f.call(
        'apply',
        f.request(
          [
            {
              kind: 'update',
              itemRef: f.read('one').items[0].itemRef,
              changes: { file: 'second.png' },
            },
          ],
          'one',
        ),
      ),
    'INVALID_ARGUMENT',
  );
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  assert.equal(f.state.writes, 0);
});

test('cached candidate changes invalidate schemas/cursors; missing refs remain removable without I/O', (t) => {
  const f = fixture(t);
  const stale = f.request([{ kind: 'add', values: { file: 'second.png' } }], 'one');
  const options = f.call('options.list', {
    targetId: f.target('one').targetId,
    key: 'file',
    limit: 1,
  });
  f.state.candidates.push('late.png');
  refuses(() => f.call('apply', stale), 'SCHEMA_CONFLICT');
  refuses(
    () =>
      f.call('options.list', {
        targetId: f.target('one').targetId,
        key: 'file',
        limit: 1,
        cursor: options.nextCursor,
      }),
    'REVISION_CONFLICT',
  );
  f.state.candidates = [];
  f.call(
    'apply',
    f.request(
      [
        {
          kind: 'remove',
          itemRef: f.read('two').items.find((row) => row.values.file === 'missing.png').itemRef,
        },
      ],
      'two',
    ),
  );
  assert.deepEqual(
    f.read('two').items.map((row) => row.values.file),
    ['first.png'],
  );
  assert.equal(f.target().available, true);
});

test('stale values/itemRefs, external file changes and write revocation including replay cannot overwrite', (t) => {
  const f = fixture(t),
    staleRows = f.read(undefined, { limit: 1 });
  const request = f.request([
    { kind: 'update', itemRef: staleRows.items[0].itemRef, changes: { name: 'Changed' } },
  ]);
  f.call('apply', request);
  refuses(() => f.read(undefined, { limit: 1, cursor: staleRows.nextCursor }), 'REVISION_CONFLICT');
  f.state.writable = false;
  refuses(() => f.call('apply', request), 'WRITE_DISABLED');
  f.state.writable = true;
  const stale = f.request([{ kind: 'remove', itemRef: f.read().items[0].itemRef }]);
  const external = JSON.stringify({
    ...f.store.value,
    imageLibrary: { groups: [group('external')] },
  });
  fs.writeFileSync(f.store.file, external);
  refuses(() => f.call('apply', stale), 'REVISION_CONFLICT');
  assert.equal(fs.readFileSync(f.store.file, 'utf8'), external);
});

test('malformed classification stays unavailable without exposing unknown data or accepting replacement', (t) => {
  const f = fixture(t);
  for (const value of [
    null,
    { groups: [], secret: 'PRIVATE_ROOT' },
    { groups: [group('one'), group('one')] },
    { groups: [{ ...group('one'), images: [{ file: 'first.png', token: 'PRIVATE_REF' }] }] },
  ]) {
    f.store.value.imageLibrary = value;
    assert.equal(f.target().available, false);
    assert.deepEqual(f.read().items, []);
    assert.doesNotMatch(JSON.stringify(f.read()), /PRIVATE_|secret|token/);
    refuses(
      () => f.call('apply', f.request([{ kind: 'add', values: { name: 'No replacement' } }])),
      'UNAVAILABLE',
    );
  }
});

test('64 groups/512 references/4096 memberships retain the existing capacity limits and pagination', (t) => {
  const files = Array.from({ length: 512 }, (_, i) => `image-${i}.png`);
  const f = fixture(t, { groups: Array.from({ length: 8 }, (_, i) => group('group-' + i, files)) });
  f.state.candidates = files;
  let count = 0,
    cursor;
  do {
    const page = f.read('group-0', { limit: 100, ...(cursor ? { cursor } : {}) });
    count += page.items.length;
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(count, 512);
  refuses(
    () => f.call('apply', f.request([{ kind: 'add', values: { file: files[0] } }], 'group-0')),
    'INVALID_ARGUMENT',
  );
  f.call('apply', f.request([{ kind: 'add', values: { name: 'Ninth' } }]));
  const ninth = f.owner.snapshot().groups.at(-1).id;
  refuses(
    () => f.call('apply', f.request([{ kind: 'add', values: { file: files[0] } }], ninth)),
    'INVALID_ARGUMENT',
  );
  const capped = fixture(t, { groups: Array.from({ length: 64 }, (_, i) => group('group-' + i)) });
  assert.equal(capped.read(undefined, { limit: 100 }).items.length, 64);
  refuses(
    () => capped.call('apply', capped.request([{ kind: 'add', values: { name: 'Overflow' } }])),
    'INVALID_ARGUMENT',
  );
});

test('owner plans recheck preflight/revision and do not write on no-change or failed commit', (t) => {
  const f = fixture(t),
    before = fs.readFileSync(f.store.file);
  const noChange = f.owner.plan(f.owner.snapshot(), f.owner.revision);
  noChange.commit();
  assert.equal(f.state.writes, 0);
  const next = f.owner.snapshot();
  next.groups[0].name = 'Plan';
  const planned = f.owner.plan(next, f.owner.revision);
  assert.throws(
    () =>
      planned.commit(() => {
        throw Error('Preflight refusal');
      }),
    /Preflight/,
  );
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  f.store.save(
    { ...f.store.value, host: { ...f.store.value.host, theme: 'dark' } },
    f.store.revision,
  );
  refuses(() => planned.commit(), 'REVISION_CONFLICT');
  assert.equal(f.owner.snapshot().groups[0].name, 'one');
});

test('classification remains shared and retains PC-only settings and unrelated device data', (t) => {
  const f = fixture(t, { device: true });
  const deviceFile = path.join(f.directory, 'settings-TEST.json');
  const before = fs.readFileSync(deviceFile);
  f.call(
    'apply',
    f.request([
      { kind: 'update', itemRef: f.read().items[0].itemRef, changes: { name: 'Shared group' } },
    ]),
  );
  assert.equal(
    JSON.parse(fs.readFileSync(f.store.file)).imageLibrary.groups[0].name,
    'Shared group',
  );
  assert.deepEqual(fs.readFileSync(deviceFile), before);
  assert.equal(f.store.value.extensions.retained.settings.secret, 'PRIVATE_SETTINGS');
});
