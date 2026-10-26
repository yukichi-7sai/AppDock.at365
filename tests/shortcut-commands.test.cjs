const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { SettingsStore } = require('../out/main/main/core/settings');
const { AutomationApi } = require('../out/main/main/core/automation-api');
const {
  getKeybindings,
  withKeybindings,
  defaultKeybindingOptions,
} = require('../out/main/shared/keybindings');
const id = 'appdock.shortcuts.update';
const binding = (id, command = 'sample.run', key = 'Ctrl+F9') => ({
  id,
  command,
  key,
  enabled: true,
  when: { scope: 'app', appletIds: [] },
});
function fixture(t) {
  const root = path.resolve('.artifacts/shortcut-command-unit');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const settings = new SettingsStore(path.join(dir, 'settings.json'), path.join(dir, 'backups'));
  settings.load();
  t.after(() => settings.close());
  settings.save(
    withKeybindings(settings.value, [binding('old-private', 'private.run', 'Ctrl+F8')]),
    settings.revision,
  );
  const permissions = { write: true, execute: true, shortcuts: true };
  const options = {
    gesturesEditable: () => true,
    touchpadGesturesEditable: () => true,
    settings,
    save: (v, r) => settings.save(v, r),
    writable: () => permissions.write,
    executable: () => permissions.execute,
    shortcutsEditable: () => permissions.shortcuts,
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
    shortcutStatus: () => [
      {
        commandId: 'sample.run',
        shortcut: 'Ctrl+F9',
        registered: false,
        error: 'SECRET_NATIVE_PATH',
      },
    ],
  };
  const api = new AutomationApi(options);
  const get = () => api.call('shortcuts.get');
  const edit = (operations, extras = {}) =>
    api.call('commands.execute', {
      id,
      args: { expectedRevision: get().revision, operations, ...extras },
    });
  return { settings, api, options, permissions, get, edit };
}

test('key trigger and binding exclusions save through revisioned API without replacing each other', async (t) => {
  const f = fixture(t);
  const operations = [
    { kind: 'configure', changes: { excludedProcesses: ['BASE.EXE'] } },
    {
      kind: 'add',
      binding: {
        ...binding('excluded'),
        when: { scope: 'global', appletIds: [], excludedProcesses: ['ROW.exe'] },
      },
    },
  ];
  const before = fs.readFileSync(f.settings.file, 'utf8');
  await f.edit(operations, { dryRun: true });
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), before);
  await f.edit(operations);
  assert.deepEqual(f.get().options.excludedProcesses, ['base']);
  assert.deepEqual(f.get().bindings.find((row) => row.id === 'excluded').when.excludedProcesses, [
    'row',
  ]);
  await f.edit([{ kind: 'configure', changes: { executionMode: 'first' } }]);
  assert.deepEqual(f.get().options.excludedProcesses, ['base']);
  await assert.rejects(
    f.edit([{ kind: 'configure', changes: { excludedProcesses: ['C:\\bad.exe'] } }]),
    { code: 'INVALID_ARGUMENT' },
  );
});

test('execution mode configuration is atomic, revisioned, private-field preserving and dry-run aware', async (t) => {
  const f = fixture(t);
  assert.deepEqual(f.get().options, {
    ...defaultKeybindingOptions(),
    ...require('../out/main/shared/command-trigger-options').defaultCommandTriggerOptions(),
  });
  assert.equal(Object.hasOwn(f.api.call('settings.get').values, 'keybindingOptions'), false);
  assert.equal(Object.hasOwn(f.api.call('settings.getSchema').fields, 'keybindingOptions'), false);
  await assert.rejects(
    f.api.call('commands.execute', {
      id: 'appdock.settings.update',
      args: {
        expectedRevision: f.get().revision,
        changes: { keybindingOptions: { executionMode: 'first' } },
      },
    }),
    { code: 'INVALID_ARGUMENT' },
  );
  f.settings.save(
    { ...f.settings.value, keybindingOptions: { executionMode: 'all', future: 'PRIVATE' } },
    f.settings.revision,
  );
  assert.equal(JSON.stringify(f.get()).includes('PRIVATE'), false);
  const configure = { kind: 'configure', changes: { executionMode: 'first' } };
  const before = fs.readFileSync(f.settings.file, 'utf8');
  assert.equal((await f.edit([configure], { dryRun: true })).changed, true);
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), before);
  const rows = f.get().bindings;
  await f.edit([configure, { kind: 'add', binding: binding('added') }]);
  assert.equal(f.get().options.executionMode, 'first');
  assert.equal(f.settings.value.keybindingOptions.future, 'PRIVATE');
  assert.deepEqual(f.get().bindings[0], rows[0]);
  const revision = f.get().revision;
  assert.equal((await f.edit([configure])).changed, false);
  assert.equal(f.get().revision, revision);
  const persisted = fs.readFileSync(f.settings.file, 'utf8');
  for (const changes of [
    {},
    { executionMode: null },
    { executionMode: 'invalid' },
    { executionMode: undefined },
    { executionMode: 'all', extra: true },
  ])
    await assert.rejects(f.edit([{ kind: 'configure', changes }]), /確認/);
  await assert.rejects(
    f.edit([
      { kind: 'configure', changes: { executionMode: 'all' } },
      { kind: 'remove', id: 'missing' },
    ]),
  );
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), persisted);
  f.settings.reload();
  assert.equal(f.get().options.executionMode, 'first');
});

test('configuring execution mode requires all shortcut editing grants', async (t) => {
  const f = fixture(t);
  for (const grant of ['write', 'execute', 'shortcuts']) {
    f.permissions[grant] = false;
    await assert.rejects(f.edit([{ kind: 'configure', changes: { executionMode: 'first' } }]));
    f.permissions[grant] = true;
  }
  assert.equal(f.get().options.executionMode, 'all');
});
test('external shortcut scopes and browser options are atomic, normalized and use the same restricted editor', async (t) => {
  const f = fixture(t),
    revision = f.get().revision;
  assert.deepEqual(
    f.get().scopes.map((s) => s.id),
    ['global', 'desktop', 'app', 'pages', 'owner', 'applets', 'browser', 'exe'],
  );
  const source = {
    ...binding('external'),
    when: { scope: 'exe', appletIds: [], processes: ['NOTEPAD.EXE'], excludeDesktop: true },
  };
  const configure = {
    kind: 'configure',
    changes: { browsers: ['FIREFOX.EXE'], requireChromiumWindowClass: true },
  };
  const dry = await f.edit([configure, { kind: 'add', binding: source }], { dryRun: true });
  assert.deepEqual(dry.options.browsers, ['firefox']);
  assert.equal(f.get().revision, revision);
  await f.edit([configure, { kind: 'add', binding: source }]);
  assert.deepEqual(f.get().bindings.find((r) => r.id === 'external').when, {
    ...source.when,
    processes: ['notepad'],
  });
  assert.equal(f.settings.value.gestures.requireChromiumWindowClass, undefined);
  assert.equal(f.settings.value.commandTriggerOptions.requireChromiumWindowClass, true);
  const before = fs.readFileSync(f.settings.file, 'utf8');
  await assert.rejects(
    f.edit([
      { kind: 'configure', changes: { browsers: ['chrome'] } },
      { kind: 'add', binding: { ...source, id: 'invalid', key: 'Win+L' } },
    ]),
    { code: 'INVALID_ARGUMENT' },
  );
  for (const changes of [
    { browsers: null },
    { browsers: ['../chrome'] },
    { requireChromiumWindowClass: null },
    { requireChromiumWindowClass: undefined },
  ])
    await assert.rejects(f.edit([{ kind: 'configure', changes }]), { code: 'INVALID_ARGUMENT' });
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), before);
  f.settings.reload();
  assert.deepEqual(f.get().options.browsers, ['firefox']);
});
test('shortcut read is scoped, lists assignable commands while stopped, and masks OS errors', (t) => {
  const f = fixture(t),
    value = f.get();
  assert.equal(value.bindings[0].command, 'private.run');
  assert.ok(value.assignableCommands.some((c) => c.id === 'sample.run'));
  assert.ok(value.assignableCommands.some((c) => c.id === 'appdock.settings.closeToTray.toggle'));
  assert.ok(!value.assignableCommands.some((c) => c.id.endsWith('.update')));
  assert.equal(JSON.stringify(value).includes('SECRET'), false);
  assert.equal(value.settings, undefined);
  assert.throws(() => f.api.call('shortcuts.get', { unknown: true }), { code: 'INVALID_ARGUMENT' });
});
test('page targets are discoverable and validated against current declarations', async (t) => {
  const f = fixture(t);
  assert.equal(f.get().pages[1].id, 'page:sample:history');
  const value = {
    ...binding('pages'),
    when: { scope: 'applets', appletIds: ['host:settings', 'page:sample:history'] },
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
            when: { scope: 'applets', appletIds: ['page:sample:missing'] },
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

test('atomic add/update/remove, normalized keys, dry run, legacy compatibility and unrelated preservation', async (t) => {
  const f = fixture(t),
    original = structuredClone(f.settings.value),
    bytes = fs.readFileSync(f.settings.file, 'utf8');
  const add = [{ kind: 'add', binding: binding('new', 'sample.run', 'control+f9') }];
  const dry = await f.edit(add, { dryRun: true });
  assert.equal(dry.completion, 'validated');
  assert.equal(dry.bindings[1].key, 'Ctrl+F9');
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), bytes);
  const saved = await f.edit(add);
  assert.equal(saved.completion, 'settingsSaved');
  assert.deepEqual(f.settings.value.host, original.host);
  assert.deepEqual(f.settings.value.extensions, original.extensions);
  assert.deepEqual(f.settings.value.shortcuts['sample.run'], ['Ctrl+F9']);
  await f.edit([
    {
      kind: 'update',
      id: 'new',
      changes: { key: 'Alt+F8', when: { scope: 'global', appletIds: [] } },
    },
  ]);
  assert.deepEqual(f.settings.value.globalShortcutCommands, ['sample.run']);
  assert.equal(getKeybindings(f.settings.value).find((r) => r.id === 'new').key, 'Alt+F8');
  await f.edit([{ kind: 'remove', id: 'new' }]);
  assert.deepEqual(f.get().bindings, original.keybindings);
});
test('Win passthrough is optional, preserved by unrelated edits, and validated before save', async (t) => {
  const f = fixture(t);
  const source = {
    ...binding('win', 'appdock.open', 'windows+w'),
    when: { scope: 'global', appletIds: [] },
    blockOriginalInput: false,
  };
  const operations = [{ kind: 'add', binding: source }];
  const before = fs.readFileSync(f.settings.file, 'utf8');
  const dry = await f.edit(operations, { dryRun: true });
  assert.equal(dry.bindings.at(-1).key, 'Win+W');
  assert.equal(dry.bindings.at(-1).blockOriginalInput, false);
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), before);
  await f.edit(operations);
  await f.edit([{ kind: 'update', id: 'win', changes: { enabled: false } }]);
  assert.equal(f.get().bindings.find((r) => r.id === 'win').blockOriginalInput, false);
  assert.equal(Object.hasOwn(f.get().bindings[0], 'blockOriginalInput'), false);
  await f.edit([{ kind: 'update', id: 'win', changes: { blockOriginalInput: true } }]);
  assert.equal(f.get().bindings.find((r) => r.id === 'win').blockOriginalInput, true);
  await assert.rejects(
    f.edit([{ kind: 'add', binding: { ...source, id: 'protected', key: 'Win+L' } }]),
    { code: 'INVALID_ARGUMENT' },
  );
  await assert.rejects(
    f.edit([{ kind: 'update', id: 'win', changes: { blockOriginalInput: 'false' } }]),
    { code: 'INVALID_ARGUMENT' },
  );
});

test('same-key order is explicit; no-op does not save and reorder cannot omit or duplicate members', async (t) => {
  const f = fixture(t);
  await f.edit(['a', 'b', 'c'].map((id) => ({ kind: 'add', binding: binding(id) })));
  const r = f.settings.revision;
  await f.edit([{ kind: 'reorder', key: 'Ctrl+F9', ids: ['a', 'b', 'c'] }]);
  assert.equal(f.settings.revision, r);
  await f.edit([{ kind: 'reorder', key: 'Ctrl+F9', ids: ['c', 'a', 'b'] }]);
  assert.deepEqual(
    f.get().bindings.map((r) => r.id),
    ['old-private', 'c', 'a', 'b'],
  );
  for (const ids of [
    ['a', 'b'],
    ['a', 'b', 'b'],
    ['a', 'b', 'old-private'],
  ])
    await assert.rejects(f.edit([{ kind: 'reorder', key: 'Ctrl+F9', ids }]), {
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
  await assert.rejects(f.edit([{ kind: 'update', id: 'old-private', changes: { key: 'F9' } }]), {
    code: 'COMMAND_NOT_ASSIGNABLE',
  });
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
    ['appdock.open', { scope: 'owner', appletIds: [] }],
    ['appdock.applets.sample.restart', { scope: 'owner', appletIds: [] }],
    ['sample.run', { scope: 'applets', appletIds: [] }],
    ['sample.run', { scope: 'applets', appletIds: ['missing'] }],
    ['sample.run', { scope: 'app', appletIds: ['sample'] }],
  ])
    await assert.rejects(f.edit([{ kind: 'add', binding: { ...binding('new', command), when } }]), {
      code: 'INVALID_ARGUMENT',
    });
  await f.edit([
    { kind: 'add', binding: { ...binding('new'), when: { scope: 'owner', appletIds: [] } } },
  ]);
  await f.edit([
    { kind: 'update', id: 'new', changes: { when: { scope: 'applets', appletIds: ['sample'] } } },
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
test('command, settings and shortcut grants are all required, including dry run, and revocation is immediate', async (t) => {
  const f = fixture(t),
    op = [{ kind: 'add', binding: binding('new') }];
  for (const [flag, code] of [
    ['execute', 'EXECUTION_DISABLED'],
    ['write', 'WRITE_DISABLED'],
    ['shortcuts', 'SHORTCUT_EDITING_DISABLED'],
  ]) {
    f.permissions[flag] = false;
    await assert.rejects(f.edit(op, { dryRun: true }), { code });
    assert.equal(f.get().bindings.length, 1);
    f.permissions[flag] = true;
  }
  await f.edit(op);
  f.permissions.shortcuts = false;
  await assert.rejects(f.edit([{ kind: 'remove', id: 'new' }]), {
    code: 'SHORTCUT_EDITING_DISABLED',
  });
});
