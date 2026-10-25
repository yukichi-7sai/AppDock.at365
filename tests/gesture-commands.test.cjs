const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { SettingsStore } = require('../out/main/main/core/settings');
const { AutomationApi } = require('../out/main/main/core/automation-api');
const { defaultGestures } = require('../out/main/shared/gestures');
const getBindings = (s) => s.gestures.bindings;
const withBindings = (s, bindings) => ({ ...s, gestures: { ...defaultGestures(), bindings } });
const id = 'appdock.gestures.update';
const binding = (id, command = 'sample.run', gesture = 'key:Ctrl+F9') => ({
  id,
  command,
  gesture,
  enabled: true,
  when: { scope: 'app', appletIds: [], processes: [] },
});
function fixture(t) {
  const root = path.resolve('.artifacts/gesture-command-unit');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const settings = new SettingsStore(path.join(dir, 'settings.json'), path.join(dir, 'backups'));
  settings.load();
  t.after(() => settings.close());
  settings.save(
    withBindings(settings.value, [binding('old-private', 'private.run', 'key:Ctrl+F8')]),
    settings.revision,
  );
  const permissions = { write: true, execute: true, gestures: true };
  const options = {
    settings,
    save: (v, r) => settings.save(v, r),
    writable: () => permissions.write,
    executable: () => permissions.execute,
    gesturesEditable: () => permissions.gestures,
    ready: () => true,
    version: 'test',
    instanceId: 'test',
    applets: () => [{ id: 'sample' }],
    inputPages: () => [
      { id: 'host:settings', title: '設定' },
      { id: 'page:sample:history', title: '履歴' },
    ],
    commands: () => [
      {
        id: 'sample.run',
        title: 'Run',
        appletId: 'sample',
        available: false,
        completion: 'handlerReturned',
      },
      {
        id: 'appdock.open',
        title: 'Open',
        appletId: null,
        available: true,
        completion: 'accepted',
      },
    ],
    execute: async () => {
      throw Error('Editing must never execute a command');
    },
  };
  const api = new AutomationApi(options);
  const get = () => api.call('gestures.get');
  const edit = (operations, extras = {}) =>
    api.call('commands.execute', {
      id,
      args: { expectedRevision: get().revision, operations, ...extras },
    });
  return { settings, api, options, permissions, get, edit };
}
test('gesture read is scoped and lists assignable commands while stopped', (t) => {
  const f = fixture(t),
    value = f.get();
  assert.equal(value.bindings[0].command, 'private.run');
  assert.ok(value.assignableCommands.some((c) => c.id === 'sample.run'));
  assert.ok(value.assignableCommands.some((c) => c.id === 'appdock.settings.closeToTray.toggle'));
  assert.ok(!value.assignableCommands.some((c) => c.id.endsWith('.update')));
  assert.equal(JSON.stringify(value).includes('SECRET'), false);
  assert.equal(value.settings.host, undefined);
  assert.equal(value.gestureTypes.length, 20);
  assert.throws(() => f.api.call('gestures.get', { unknown: true }), { code: 'INVALID_ARGUMENT' });
});

test('two-step movements are discoverable, save atomically and survive reload without changing existing bindings', async (t) => {
  const f = fixture(t);
  const old = structuredClone(f.get().bindings);
  const pairs = f.get().gestureTypes.filter((g) => /^move-[a-z]+-[a-z]+$/.test(g.id));
  assert.equal(pairs.length, 12);
  const additions = pairs.map(({ id }) => ({
    kind: 'add',
    binding: binding(id, 'sample.run', id),
  }));
  await f.edit(additions);
  assert.deepEqual(f.get().bindings, [...old, ...additions.map((op) => op.binding)]);
  f.settings.load();
  assert.deepEqual(f.get().bindings, [...old, ...additions.map((op) => op.binding)]);
  const bytes = fs.readFileSync(f.settings.file, 'utf8');
  for (const gesture of ['move-up-up', 'move-up-down-left']) {
    await assert.rejects(
      () => f.edit([{ kind: 'add', binding: binding('invalid', 'sample.run', gesture) }]),
      { code: 'INVALID_ARGUMENT' },
    );
    assert.equal(fs.readFileSync(f.settings.file, 'utf8'), bytes);
  }
});
test('gesture page targets share discovery and reject undeclared pages atomically', async (t) => {
  const f = fixture(t);
  assert.equal(f.get().pages[1].id, 'page:sample:history');
  const value = {
    ...binding('pages'),
    when: { scope: 'applets', appletIds: ['host:settings', 'page:sample:history'], processes: [] },
  };
  await f.edit([{ kind: 'add', binding: value }]);
  assert.deepEqual(
    f.get().bindings.find((r) => r.id === 'pages'),
    value,
  );
  await assert.rejects(
    async () =>
      f.edit([
        {
          kind: 'update',
          id: 'pages',
          changes: {
            when: { scope: 'applets', appletIds: ['page:sample:missing'], processes: [] },
          },
        },
      ]),
    { code: 'INVALID_ARGUMENT' },
  );
  assert.deepEqual(
    f.get().bindings.find((r) => r.id === 'pages'),
    value,
  );
});

test('atomic add/update/remove, normalized key gestures, dry run and unrelated preservation', async (t) => {
  const f = fixture(t),
    original = structuredClone(f.settings.value),
    bytes = fs.readFileSync(f.settings.file, 'utf8');
  const add = [{ kind: 'add', binding: binding('new', 'sample.run', 'key:control+f9') }];
  const dry = await f.edit(add, { dryRun: true });
  assert.equal(dry.completion, 'validated');
  assert.equal(dry.bindings[1].gesture, 'key:Ctrl+F9');
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), bytes);
  const saved = await f.edit(add);
  assert.equal(saved.completion, 'settingsSaved');
  assert.deepEqual(f.settings.value.host, original.host);
  assert.deepEqual(f.settings.value.extensions, original.extensions);
  assert.deepEqual(f.settings.value.shortcuts, original.shortcuts);
  await f.edit([
    {
      kind: 'update',
      id: 'new',
      changes: { gesture: 'key:Alt+F8', when: { scope: 'global', appletIds: [], processes: [] } },
    },
  ]);
  assert.deepEqual(f.settings.value.globalShortcutCommands, original.globalShortcutCommands);
  assert.equal(getBindings(f.settings.value).find((r) => r.id === 'new').gesture, 'key:Alt+F8');
  await f.edit([{ kind: 'remove', id: 'new' }]);
  assert.deepEqual(f.get().bindings, original.gestures.bindings);
});

test('configure validates ranges/processes atomically, preserves bindings and supports dry run/no-op', async (t) => {
  const f = fixture(t),
    before = f.get(),
    bytes = fs.readFileSync(f.settings.file, 'utf8');
  const changes = {
    enabled: false,
    activateOnStart: true,
    browsers: ['CHROME.EXE', 'chrome'],
    excludedProcesses: ['Editor.exe'],
    requireChromiumWindowClass: true,
    distance: 75,
    wheelDelayMs: 120,
    executionMode: 'first',
    indicatorOpacity: 0.6,
    indicatorStyle: 'ring',
    indicatorPosition: 'monitor-center',
    indicatorShowNoAction: false,
  };
  const operations = [{ kind: 'configure', changes }];
  const dry = await f.edit(operations, { dryRun: true });
  assert.deepEqual(dry.settings.browsers, ['chrome']);
  assert.equal(dry.settings.indicatorStyle, 'ring');
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), bytes);
  const result = await f.edit(operations);
  assert.deepEqual(result.bindings, before.bindings);
  assert.equal(result.settings.distance, 75);
  assert.equal(result.settings.executionMode, 'first');
  assert.equal(result.settings.indicatorPosition, 'monitor-center');
  assert.equal(result.settings.indicatorStyle, 'ring');
  assert.equal(
    JSON.parse(fs.readFileSync(f.settings.file, 'utf8')).gestures.indicatorStyle,
    'ring',
  );
  assert.equal(result.settings.indicatorShowNoAction, false);
  assert.equal(result.settings.activateOnStart, true);
  const revision = f.settings.revision;
  await f.edit(operations);
  assert.equal(f.settings.revision, revision);
  const saved = fs.readFileSync(f.settings.file, 'utf8');
  for (const changes of [
    { distance: 4 },
    { distance: 501 },
    { wheelDelayMs: -1 },
    { indicatorOpacity: 2 },
    { indicatorPosition: 'other' },
    { indicatorStyle: 'other' },
    { indicatorStyle: null },
    { indicatorStyle: 1 },
    { indicatorShowNoAction: 'false' },
    { executionMode: 'other' },
    { enabled: 'true' },
    { activateOnStart: 1 },
    { browsers: ['C:/chrome.exe'] },
    { bindings: [] },
    { unknown: 1 },
    {},
  ]) {
    await assert.rejects(
      f.edit([
        { kind: 'add', binding: binding('new') },
        { kind: 'configure', changes },
      ]),
      { code: 'INVALID_ARGUMENT' },
    );
    assert.equal(fs.readFileSync(f.settings.file, 'utf8'), saved);
  }
});

test('every indicator design round-trips through the public edit API without altering bindings', async (t) => {
  const f = fixture(t);
  const before = f.get().bindings;
  for (const indicatorStyle of ['pill', 'ring', 'classic', 'compact']) {
    const result = await f.edit([{ kind: 'configure', changes: { indicatorStyle } }]);
    assert.equal(result.settings.indicatorStyle, indicatorStyle);
    assert.equal(f.get().settings.indicatorStyle, indicatorStyle);
    assert.deepEqual(result.bindings, before);
  }
});

test('desktop scopes and exclusions round-trip through the public atomic editing API', async (t) => {
  const f = fixture(t);
  const scopes = f.get().scopes.map((scope) => scope.id);
  assert.equal(scopes[scopes.indexOf('global') + 1], 'desktop');
  const bindings = ['global', 'exe', 'desktop'].map((scope) => ({
    ...binding('desktop-' + scope),
    when: {
      scope,
      appletIds: [],
      processes: scope === 'exe' ? ['EXPLORER.EXE'] : [],
      ...(scope === 'desktop' ? {} : { excludeDesktop: true }),
    },
  }));
  await f.edit(bindings.map((binding) => ({ kind: 'add', binding })));
  for (const row of bindings) {
    const saved = f.get().bindings.find((item) => item.id === row.id);
    assert.equal(saved.when.scope, row.when.scope);
    assert.equal(saved.when.excludeDesktop, row.when.excludeDesktop);
    assert.deepEqual(saved.when.processes, row.when.scope === 'exe' ? ['explorer'] : []);
  }
  const before = fs.readFileSync(f.settings.file, 'utf8');
  await assert.rejects(
    f.edit([
      {
        kind: 'update',
        id: 'desktop-desktop',
        changes: {
          when: { scope: 'desktop', appletIds: [], processes: [], excludeDesktop: true },
        },
      },
    ]),
    { code: 'INVALID_ARGUMENT' },
  );
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), before);
});

test('extra persisted gesture fields stay local and survive edits', async (t) => {
  const f = fixture(t);
  const value = structuredClone(f.settings.value);
  value.gestures.custom = { credential: 'PRIVATE_EXTENSION_VALUE' };
  f.settings.save(value, f.settings.revision);
  assert.equal(JSON.stringify(f.get()).includes('PRIVATE_EXTENSION_VALUE'), false);
  const result = await f.edit([{ kind: 'configure', changes: { distance: 90 } }]);
  assert.equal(JSON.stringify(result).includes('PRIVATE_EXTENSION_VALUE'), false);
  assert.deepEqual(f.settings.value.gestures.custom, value.gestures.custom);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(f.settings.file)).gestures.custom,
    value.gestures.custom,
  );
});

test('browser/exe conditions, all inputs and move between groups use the existing native resolver', async (t) => {
  const f = fixture(t);
  const { gestureTypes, nativeGestureRows } = require('../out/main/shared/gestures');
  for (const [gesture] of gestureTypes)
    await f.edit([
      {
        kind: 'add',
        binding: {
          ...binding(gesture),
          gesture,
          when: { scope: 'exe', appletIds: [], processes: ['Editor.EXE'] },
        },
      },
    ]);
  assert.deepEqual(f.get().bindings[1].when.processes, ['editor']);
  await f.edit([
    {
      kind: 'add',
      binding: {
        ...binding('browser'),
        gesture: 'move-up',
        when: { scope: 'browser', appletIds: [], processes: [] },
      },
    },
  ]);
  await f.edit([{ kind: 'update', id: 'move-down', changes: { gesture: 'move-up' } }]);
  assert.deepEqual(
    f
      .get()
      .bindings.filter((r) => r.gesture === 'move-up')
      .map((r) => r.id),
    ['move-up', 'browser', 'move-down'],
  );
  for (const when of [
    { scope: 'exe', appletIds: [], processes: [] },
    { scope: 'browser', appletIds: [], processes: ['editor'] },
    { scope: 'exe', appletIds: [], processes: ['../editor'] },
    { scope: 'app', appletIds: [], processes: [], extra: 1 },
  ])
    await assert.rejects(f.edit([{ kind: 'add', binding: { ...binding('bad'), when } }]), {
      code: 'INVALID_ARGUMENT',
    });
  const rows = nativeGestureRows(f.settings.value.gestures, { appFocused: false, window: '' }, [
    { id: 'sample.run', title: 'Run', extensionId: 'sample' },
  ]);
  assert.deepEqual(
    rows.filter((r) => r.gesture === 'move-up').map((r) => r.id),
    ['move-up', 'browser', 'move-down'],
  );
  assert.equal(rows[0].when.scope, 'exe');
});

test('shortcut and gesture edits share revisions, independent grants, and failed saves preserve disk', async (t) => {
  const f = fixture(t),
    stale = f.get().revision;
  f.options.shortcutsEditable = () => true;
  await f.api.call('commands.execute', {
    id: 'appdock.shortcuts.update',
    args: {
      expectedRevision: stale,
      operations: [
        {
          kind: 'add',
          binding: {
            id: 'other',
            command: 'appdock.open',
            key: 'F8',
            enabled: false,
            when: { scope: 'app', appletIds: [] },
          },
        },
      ],
    },
  });
  await assert.rejects(
    f.edit([{ kind: 'configure', changes: { distance: 60 } }], { expectedRevision: stale }),
    { code: 'REVISION_CONFLICT' },
  );
  f.options.shortcutsEditable = () => false;
  await f.edit([{ kind: 'configure', changes: { distance: 70 } }]);
  const bytes = fs.readFileSync(f.settings.file, 'utf8');
  const failing = new AutomationApi({
    ...f.options,
    save: () => {
      throw Error('SECRET_PATH');
    },
  });
  await assert.rejects(
    failing.call('commands.execute', {
      id,
      args: {
        expectedRevision: failing.call('gestures.get').revision,
        operations: [{ kind: 'configure', changes: { distance: 80 } }],
      },
    }),
    { code: 'SAVE_FAILED' },
  );
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), bytes);
});
test('same-gesture order is explicit; no-op does not save and reorder cannot omit or duplicate members', async (t) => {
  const f = fixture(t);
  await f.edit(['a', 'b', 'c'].map((id) => ({ kind: 'add', binding: binding(id) })));
  const r = f.settings.revision;
  await f.edit([{ kind: 'reorder', gesture: 'key:Ctrl+F9', ids: ['a', 'b', 'c'] }]);
  assert.equal(f.settings.revision, r);
  await f.edit([{ kind: 'reorder', gesture: 'key:Ctrl+F9', ids: ['c', 'a', 'b'] }]);
  assert.deepEqual(
    f.get().bindings.map((r) => r.id),
    ['old-private', 'c', 'a', 'b'],
  );
  for (const ids of [
    ['a', 'b'],
    ['a', 'b', 'b'],
    ['a', 'b', 'old-private'],
  ])
    await assert.rejects(f.edit([{ kind: 'reorder', gesture: 'key:Ctrl+F9', ids }]), {
      code: 'INVALID_ARGUMENT',
    });
});
test('late invalid operation rolls back the entire edit and rejects unknown fields and IDs', async (t) => {
  const f = fixture(t),
    bytes = fs.readFileSync(f.settings.file, 'utf8');
  for (const op of [
    { kind: 'add', binding: { ...binding('bad'), secret: 1 } },
    { kind: 'update', id: 'old-private', changes: { id: 'changed' } },
    { kind: 'add', binding: binding('__proto__') },
    { kind: 'add', binding: binding('old-private') },
    { kind: 'remove', id: 'missing' },
    { kind: 'remove', id: 'old-private', extra: 1 },
  ]) {
    await assert.rejects(f.edit([{ kind: 'add', binding: binding('first') }, op]));
    assert.equal(fs.readFileSync(f.settings.file, 'utf8'), bytes);
  }
});
test('private, missing and argument commands cannot be assigned; existing private rows can be disabled and removed', async (t) => {
  const f = fixture(t);
  for (const command of ['private.run', 'missing.run', 'appdock.settings.update', id])
    await assert.rejects(f.edit([{ kind: 'add', binding: binding('new', command) }]), {
      code: 'COMMAND_NOT_ASSIGNABLE',
    });
  await assert.rejects(
    f.edit([{ kind: 'update', id: 'old-private', changes: { gesture: 'move-up' } }]),
    {
      code: 'COMMAND_NOT_ASSIGNABLE',
    },
  );
  await f.edit([{ kind: 'update', id: 'old-private', changes: { enabled: false } }]);
  await assert.rejects(
    f.edit([{ kind: 'update', id: 'old-private', changes: { enabled: true } }]),
    { code: 'COMMAND_NOT_ASSIGNABLE' },
  );
  await f.edit([{ kind: 'remove', id: 'old-private' }]);
  assert.equal(f.get().bindings.length, 0);
});
test('owner and selected-Applet conditions share validation; unknown targets are refused', async (t) => {
  const f = fixture(t);
  const commands = f.options.commands();
  f.options.commands = () => [
    ...commands,
    {
      id: 'appdock.applets.sample.restart',
      title: 'Restart',
      appletId: 'sample',
      available: true,
      completion: 'lifecycleApplied',
      permission: 'applets.manage',
    },
  ];
  assert.equal(
    f.get().assignableCommands.find((c) => c.id === 'appdock.applets.sample.restart').ownerId,
    null,
  );
  for (const [command, when] of [
    ['appdock.open', { scope: 'owner', appletIds: [], processes: [] }],
    ['appdock.applets.sample.restart', { scope: 'owner', appletIds: [], processes: [] }],
    ['sample.run', { scope: 'applets', appletIds: [], processes: [] }],
    ['sample.run', { scope: 'applets', appletIds: ['missing'], processes: [] }],
    ['sample.run', { scope: 'app', appletIds: ['sample'], processes: [] }],
  ])
    await assert.rejects(f.edit([{ kind: 'add', binding: { ...binding('new', command), when } }]), {
      code: 'INVALID_ARGUMENT',
    });
  await f.edit([
    {
      kind: 'add',
      binding: { ...binding('new'), when: { scope: 'owner', appletIds: [], processes: [] } },
    },
  ]);
  await f.edit([
    {
      kind: 'update',
      id: 'new',
      changes: { when: { scope: 'applets', appletIds: ['sample'], processes: [] } },
    },
  ]);
});
test('stale, cross-setting and restart revisions and unobserved disk edits prevent overwrites', async (t) => {
  const f = fixture(t),
    revision = f.get().revision,
    op = [{ kind: 'add', binding: binding('new') }];
  await f.api.call('commands.execute', {
    id: 'appdock.settings.update',
    args: { expectedRevision: revision, changes: { theme: 'dark' } },
  });
  await assert.rejects(f.edit(op, { expectedRevision: revision }), { code: 'REVISION_CONFLICT' });
  const latest = f.get().revision;
  const restarted = new AutomationApi(f.options);
  await assert.rejects(
    restarted.call('commands.execute', { id, args: { operations: op, expectedRevision: latest } }),
    { code: 'REVISION_CONFLICT' },
  );
  const disk = structuredClone(f.settings.value);
  disk.host.theme = 'system';
  fs.writeFileSync(f.settings.file, JSON.stringify(disk));
  await assert.rejects(f.edit(op), { code: 'REVISION_CONFLICT' });
  assert.equal(JSON.parse(fs.readFileSync(f.settings.file)).host.theme, 'system');
});
test('command, settings and gesture grants are all required, including dry run, and revocation is immediate', async (t) => {
  const f = fixture(t),
    op = [{ kind: 'add', binding: binding('new') }];
  for (const [flag, code] of [
    ['execute', 'EXECUTION_DISABLED'],
    ['write', 'WRITE_DISABLED'],
    ['gestures', 'GESTURE_EDITING_DISABLED'],
  ]) {
    f.permissions[flag] = false;
    await assert.rejects(f.edit(op, { dryRun: true }), { code });
    assert.equal(f.get().bindings.length, 1);
    f.permissions[flag] = true;
  }
  await f.edit(op);
  f.permissions.gestures = false;
  await assert.rejects(f.edit([{ kind: 'remove', id: 'new' }]), {
    code: 'GESTURE_EDITING_DISABLED',
  });
});
