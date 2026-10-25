const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { SettingsStore } = require('../out/main/main/core/settings');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { SettingsServiceTargets } = require('../out/main/main/core/settings-service-targets');
const { AppletManagement } = require('../out/main/main/core/applet-management');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { AiSettingsController } = require('../out/main/main/core/ai-settings');
const { AiSecrets } = require('../out/main/main/core/ai-secrets');
const { TtsSecrets } = require('../out/main/main/core/tts-secrets');
const { parseSettings } = require('../out/main/shared/settings-schema');
const { appletEnabled } = require('../out/main/shared/applet-state');
const orderId = 'service.applets.order';
function fixture(t, device = false) {
  const dir = path.resolve('.artifacts/settings-applet-management-unit', randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  const applets = [
    { id: 'pkg.one', displayName: 'Same', state: 'running' },
    { id: 'pkg.two', displayName: 'Same', state: 'stopped' },
    { id: 'pkg.new', displayName: 'New', state: 'waiting' },
    {
      id: 'appdock.default-shell',
      sourceKind: 'builtin',
      displayName: 'Default',
      state: 'running',
    },
    {
      id: 'collection.child',
      collection: { owner: 'pkg.one', key: 'sites', itemId: 'child' },
      displayName: 'Child',
      state: 'running',
    },
  ].map((applet) => ({ runtime: 'node', commands: [], tray: [], pages: [], ...applet }));
  const store = device
    ? new DeviceSettingsStore(
        path.join(dir, 'settings.json'),
        path.join(dir, 'local'),
        'TEST',
        () => [],
        () => applets,
      )
    : new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  store.save(
    {
      ...store.value,
      appletOrder: [
        'missing.first',
        'pkg.one',
        'collection.child',
        'missing.middle',
        'pkg.two',
        'appdock.default-shell',
        'missing.last',
      ],
      extensions: {
        'pkg.one': {
          enabled: true,
          startupDelaySeconds: 5,
          settings: { private: 'PRIVATE_VALUE', sites: [{ id: 'child', enabled: true }] },
        },
        'pkg.two': { enabled: false, startupDelaySeconds: 9, settings: { retained: 7 } },
        'pkg.new': { enabled: true, startupDelaySeconds: 180, settings: {} },
      },
    },
    store.revision,
  );
  let write = true,
    ready = true,
    writes = 0,
    reconciles = 0,
    restarts = 0,
    hold;
  const snapshots = () =>
    applets.map((applet) => ({ ...applet, enabled: appletEnabled(store.value, applet.id) }));
  const management = new AppletManagement({
    settings: store,
    applets: snapshots,
    ready: () => ready,
    reconcile: async () => {
      reconciles++;
    },
    restart: async () => {
      restarts++;
      if (hold) await hold;
    },
  });
  const save = (value, revision, rewrite = []) => {
    writes++;
    return device ? store.save(value, revision, undefined, rewrite) : store.save(value, revision);
  };
  const encryption = {
    encrypt: (value) => value,
    decrypt: () => {
      throw Error('Unexpected decryption');
    },
  };
  const ai = new AiSettingsController(
    store,
    new AiSecrets(path.join(dir, 'ai.json'), encryption),
    () => {},
  );
  const commands = new SettingsCommands({ settings: store, applets: () => [], save });
  const services = new SettingsServiceTargets({
    settings: store,
    revision: () => commands.revision(),
    checkRevision: (revision) => commands.checkRevision(revision),
    validate: parseSettings,
    save,
    ai,
    tts: new TtsSecrets(path.join(dir, 'tts.json'), encryption),
    notifications: () => [],
    applets: snapshots,
    appletManagement: management,
  });
  const api = new AppDockApi({
    settings: store,
    settingsCommands: commands,
    serviceSettingsTargets: () => services.targets(),
    appletManagement: management,
    save,
    ready: () => ready,
    writable: () => write,
    executable: () => false,
    version: 'test',
    instanceId: randomUUID(),
    applets: () => [],
    commands: () => [],
    execute: async () => {
      throw Error('Unexpected execution');
    },
  });
  const call = (method, args = {}) => api.call('settings.' + method, args);
  const commonId = (ownerId) =>
    call('targets.list', { ownerId }).items.find((item) => item.category === 'applet-common')
      .targetId;
  const request = (targetId, operations, dryRun = false) => {
    const schema = call('schema.get', { targetId });
    const state = call(schema.kind === 'list' ? 'items.list' : 'values.get', { targetId });
    return {
      targetId,
      operations,
      dryRun,
      expectedSchemaRevision: schema.schemaRevision,
      expectedRevision: state.revision,
      requestId: randomUUID(),
    };
  };
  return {
    dir,
    store,
    applets,
    management,
    api,
    call,
    commonId,
    request,
    read: (ownerId) => call('values.get', { targetId: commonId(ownerId) }),
    set: (ownerId, changes, dryRun = false) =>
      call('apply', request(commonId(ownerId), [{ kind: 'set', changes }], dryRun)),
    items: () => call('items.list', { targetId: orderId }),
    reorder: (refs, dryRun = false) =>
      call('apply', request(orderId, [{ kind: 'reorder', itemRefs: refs }], dryRun)),
    writes: () => writes,
    reconciles: () => reconciles,
    restarts: () => restarts,
    setWrite: (value) => {
      write = value;
    },
    setReady: (value) => {
      ready = value;
    },
    hold: (value) => {
      hold = value;
    },
  };
}
test('common enabled is explicit and host-owned; package order advertises only reorder and read-only identities', (t) => {
  const f = fixture(t),
    state = f.read('pkg.two');
  assert.equal(state.fields.find((field) => field.key === 'enabled').value, false);
  assert.equal(state.fields.find((field) => field.key === 'enabled').inherited, null);
  const enabled = f
    .call('schema.get', { targetId: f.commonId('pkg.two') })
    .items.find((field) => field.key === 'enabled');
  assert.equal(enabled.resettable, false);
  assert.equal(enabled.applies, 'appletEnabledChanged');
  const target = f
    .call('targets.list', { query: 'applet-management' })
    .items.find((item) => item.targetId === orderId);
  assert.deepEqual(target.operations, ['reorder']);
  const schema = f.call('schema.get', { targetId: orderId });
  assert.deepEqual(Object.keys(schema.operationSchemas), ['reorder']);
  assert.equal(schema.maxItems, 500);
  assert(schema.items.every((field) => !field.writable));
  const rows = f.items().items;
  assert.deepEqual(
    rows.map((item) => item.values.id),
    ['pkg.one', 'pkg.two', 'pkg.new'],
  );
  assert(rows.every((item) => !item.removable && item.writableKeys.length === 0));
  assert.equal(
    f
      .call('targets.list', { ownerId: 'appdock.default-shell' })
      .items.some((item) => item.category === 'applet-common'),
    false,
  );
  assert.equal(
    f
      .call('targets.list', { ownerId: 'collection.child' })
      .items.some((item) => item.category === 'applet-common'),
    false,
  );
  assert(!JSON.stringify([state, schema, rows]).includes('PRIVATE_VALUE'));
  assert.equal(f.writes(), 0);
});
test('enable dryRun is inert, combined common edits save once and replay/no-op do not repeat lifecycle actions', (t) => {
  const f = fixture(t),
    targetId = f.commonId('pkg.two'),
    before = fs.readFileSync(f.store.file);
  const operations = [{ kind: 'set', changes: { enabled: true, startupDelaySeconds: 13 } }];
  const preview = f.call('apply', f.request(targetId, operations, true));
  assert.equal(preview.completion, 'validated');
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  assert.equal(f.writes(), 0);
  assert.equal(f.reconciles(), 0);
  const request = f.request(targetId, operations),
    saved = f.call('apply', request);
  assert.equal(saved.completion, 'settingsSaved');
  assert.equal(saved.effectVerified, false);
  assert.deepEqual(f.call('apply', request), saved);
  assert.equal(f.writes(), 1);
  assert.equal(f.set('pkg.two', { enabled: true }).changed, false);
  assert.equal(f.writes(), 1);
  assert.deepEqual(f.store.value.extensions['pkg.two'], {
    enabled: true,
    startupDelaySeconds: 13,
    settings: { retained: 7 },
  });
  assert.equal(f.restarts(), 0);
});
test('enabled edits route only to the current PC and preserve shared/local configuration and dormant data', (t) => {
  const f = fixture(t, true);
  f.store.setLocalSettings('pkg.two', true, f.store.revision);
  const shared = fs.readFileSync(f.store.file),
    local = structuredClone(f.store.device.value.extensions['pkg.two']);
  f.set('pkg.two', { enabled: true });
  assert.deepEqual(fs.readFileSync(f.store.file), shared);
  assert.equal(f.store.device.value.extensions['pkg.two'].enabled, true);
  assert.deepEqual(f.store.device.value.extensions['pkg.two'].configuration, local.configuration);
  assert.equal(f.store.device.value.extensions['pkg.two'].useLocalSettings, true);
  f.set('pkg.two', { enabled: false });
  assert.deepEqual(fs.readFileSync(f.store.file), shared);
  assert.equal(f.store.value.extensions['pkg.two'].enabled, false);
});
test('invalid common batches and enabled reset are rejected atomically and cannot invoke restart or alter permissions', (t) => {
  const f = fixture(t),
    targetId = f.commonId('pkg.two'),
    before = fs.readFileSync(f.store.file);
  for (const operations of [
    [{ kind: 'reset', keys: ['enabled'] }],
    [{ kind: 'set', changes: { enabled: 'true' } }],
    [{ kind: 'set', changes: { enabled: true, startupDelaySeconds: -1 } }],
    [{ kind: 'set', changes: { enabled: true, restart: true } }],
  ])
    assert.throws(() => f.call('apply', f.request(targetId, operations)));
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  assert.equal(f.writes(), 0);
  assert.equal(f.restarts(), 0);
  f.setWrite(false);
  assert.throws(() => f.set('pkg.two', { enabled: true }), { code: 'WRITE_DISABLED' });
});
test('enabled planner shares the existing busy/state guards without side effects', async (t) => {
  const f = fixture(t);
  let release;
  f.hold(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const pending = f.management.run('pkg.one', 'restart');
  assert.equal(f.management.canEditEnabled('pkg.one'), false);
  assert.throws(() => f.management.prepareEnabled('pkg.one', false), { code: 'BUSY' });
  assert.equal(f.read('pkg.one').fields.find((field) => field.key === 'enabled').writable, false);
  assert.throws(() => f.set('pkg.one', { enabled: false }), { code: 'LOCAL_ACTION_REQUIRED' });
  assert.equal(f.writes(), 0);
  release();
  await pending;
  assert.equal(f.management.canEditEnabled('pkg.one'), true);
  for (const state of ['starting', 'stopping']) {
    f.applets[0].state = state;
    assert.throws(() => f.management.prepareEnabled('pkg.one', false), { code: 'BUSY' });
  }
  assert.throws(() => f.management.prepareEnabled('appdock.default-shell', false), {
    code: 'UNAVAILABLE',
  });
});
test('new package defaults stay enabled without a redundant save and collection preferences remain owner-managed', (t) => {
  const f = fixture(t);
  f.applets.push({ ...f.applets[0], id: 'pkg.default' });
  assert.equal(f.read('pkg.default').fields.find((field) => field.key === 'enabled').value, true);
  assert.equal(f.set('pkg.default', { enabled: true }).changed, false);
  assert.equal(f.writes(), 0);
  f.set('pkg.default', { enabled: false });
  assert.equal(f.store.value.extensions['pkg.default'].enabled, false);
  const prepared = f.management.prepareEnabled('collection.child', false);
  assert.equal(prepared.extensions['pkg.one'].settings.sites[0].enabled, false);
  assert.equal(f.store.value.extensions['pkg.one'].settings.sites[0].enabled, true);
  assert.equal(f.store.value.extensions['collection.child'], undefined);
});
test('read-only permission is checked again for cached enable and reorder requests', (t) => {
  const f = fixture(t),
    enable = f.request(f.commonId('pkg.two'), [{ kind: 'set', changes: { enabled: true } }]);
  f.call('apply', enable);
  const reorder = f.request(orderId, [
    {
      kind: 'reorder',
      itemRefs: f
        .items()
        .items.map((row) => row.itemRef)
        .reverse(),
    },
  ]);
  f.call('apply', reorder);
  f.setWrite(false);
  for (const request of [enable, reorder])
    assert.throws(() => f.call('apply', request), { code: 'WRITE_DISABLED' });
  assert.equal(f.writes(), 2);
});
test('reorder dryRun/save/replay/no-op preserve missing and child slots and discovery/lifecycle arrays', (t) => {
  const f = fixture(t),
    discovered = f.applets.map((item) => item.id),
    before = fs.readFileSync(f.store.file);
  const refs = f
    .items()
    .items.map((item) => item.itemRef)
    .reverse();
  assert.equal(f.reorder(refs, true).completion, 'validated');
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  const request = f.request(orderId, [{ kind: 'reorder', itemRefs: refs }]);
  const saved = f.call('apply', request);
  assert.deepEqual(f.call('apply', request), saved);
  assert.equal(f.writes(), 1);
  assert.deepEqual(f.store.value.appletOrder, [
    'missing.first',
    'pkg.new',
    'collection.child',
    'missing.middle',
    'pkg.two',
    'appdock.default-shell',
    'missing.last',
    'pkg.one',
  ]);
  assert.deepEqual(
    f.items().items.map((item) => item.values.id),
    ['pkg.new', 'pkg.two', 'pkg.one'],
  );
  assert.deepEqual(
    f.applets.map((item) => item.id),
    discovered,
  );
  assert.equal(f.reconciles(), 0);
  assert.equal(f.restarts(), 0);
  assert.equal(f.reorder(f.items().items.map((item) => item.itemRef)).changed, false);
  assert.equal(f.writes(), 1);
});
test('package reorder does not support installation, removal, row editing or incomplete/duplicate/stale refs', (t) => {
  const f = fixture(t),
    rows = f.items().items,
    before = fs.readFileSync(f.store.file);
  for (const operation of [
    { kind: 'add', values: { name: 'New' } },
    { kind: 'remove', itemRef: rows[0].itemRef },
    { kind: 'update', itemRef: rows[0].itemRef, changes: { name: 'Other' } },
    { kind: 'reorder', itemRefs: rows.slice(1).map((item) => item.itemRef) },
    { kind: 'reorder', itemRefs: rows.map(() => rows[0].itemRef) },
    { kind: 'reorder', itemRefs: rows.map(() => 'forged') },
  ])
    assert.throws(() => f.call('apply', f.request(orderId, [operation])));
  assert.deepEqual(fs.readFileSync(f.store.file), before);
  assert.equal(f.writes(), 0);
});
test('catalog changes invalidate order schemas/cursors, external settings changes invalidate refs without overwriting them', (t) => {
  const f = fixture(t),
    rows = f.items(),
    stale = f.request(orderId, [
      { kind: 'reorder', itemRefs: rows.items.map((item) => item.itemRef).reverse() },
    ]);
  const first = f.call('items.list', { targetId: orderId, limit: 1 });
  f.applets.push({ ...f.applets[0], id: 'pkg.added', displayName: 'Added' });
  assert.throws(() => f.call('apply', stale), { code: 'SCHEMA_CONFLICT' });
  assert.throws(
    () => f.call('items.list', { targetId: orderId, limit: 1, cursor: first.nextCursor }),
    { code: 'REVISION_CONFLICT' },
  );
  f.applets.pop();
  const oldRefs = f.items().items.map((item) => item.itemRef);
  f.store.save(
    { ...f.store.value, host: { ...f.store.value.host, theme: 'dark' } },
    f.store.revision,
  );
  assert.throws(() => f.reorder(oldRefs.reverse()), { code: 'REVISION_CONFLICT' });
  assert.equal(f.store.value.host.theme, 'dark');
  assert.equal(f.writes(), 0);
});
test('order changes use shared storage while preserving PC enabled states, configuration and unrelated values', (t) => {
  const f = fixture(t, true),
    device = fs.readFileSync(f.store.device.file);
  const extensions = structuredClone(f.store.value.extensions);
  f.reorder(
    f
      .items()
      .items.map((item) => item.itemRef)
      .reverse(),
  );
  assert.deepEqual(fs.readFileSync(f.store.device.file), device);
  assert.deepEqual(f.store.value.extensions, extensions);
  assert.equal(JSON.parse(fs.readFileSync(f.store.file)).appletOrder[1], 'pkg.new');
});
test('save failures retain both files and return a stable safe failure for retry', (t) => {
  const f = fixture(t, true),
    before = [f.store.file, f.store.device.file].map((file) => fs.readFileSync(file));
  const request = f.request(f.commonId('pkg.two'), [{ kind: 'set', changes: { enabled: true } }]);
  const save = f.store.save;
  f.store.save = () => {
    throw Error('PRIVATE_FAILURE_DETAIL');
  };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.throws(
        () => f.call('apply', request),
        (error) =>
          error.code === 'SAVE_FAILED' && !error.message.includes('PRIVATE_FAILURE_DETAIL'),
      );
    }
  } finally {
    f.store.save = save;
  }
  assert.deepEqual(
    [f.store.file, f.store.device.file].map((file) => fs.readFileSync(file)),
    before,
  );
  assert.equal(f.store.value.extensions['pkg.two'].enabled, false);
  assert.equal(f.writes(), 1);
});
