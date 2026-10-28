const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { SettingsStore } = require('../out/main/main/core/settings');
const { AutomationApi } = require('../out/main/main/core/automation-api');
const id = 'appdock.tray.update';
function fixture(t) {
  const root = path.resolve('.artifacts/tray-editing-unit');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const settings = new SettingsStore(path.join(dir, 'settings.json'), path.join(dir, 'backups'));
  settings.load();
  t.after(() => settings.close());
  settings.save(
    { ...settings.value, trayMenu: [{ id: 'old', type: 'command', command: 'private.run' }] },
    settings.revision,
  );
  const permissions = { write: true, execute: true, tray: true };
  const options = {
    settings,
    save: (v, r) => settings.save(v, r),
    writable: () => permissions.write,
    executable: () => permissions.execute,
    trayEditable: () => permissions.tray,
    ready: () => true,
    version: 'test',
    instanceId: 'test',
    applets: () => [],
    commands: () =>
      ['sample.run', 'appdock.open', 'appdock.settings.open', 'appdock.quit'].map((id) => ({
        id,
        title: id,
        appletId: null,
        available: id !== 'sample.run',
        completion: 'handlerReturned',
      })),
    execute: async () => {
      throw Error('Editing must not execute');
    },
  };
  const api = new AutomationApi(options),
    get = () => api.call('tray.get'),
    edit = (operations, extras = {}) =>
      api.call('commands.execute', {
        id,
        args: { expectedRevision: get().revision, operations, ...extras },
      });
  return { settings, options, permissions, api, get, edit };
}
const add = (item, parentId = null) => ({ kind: 'add', parentId, item });
const configure = (changes) => ({ kind: 'configure', changes });
const group = (id, title = 'Group') => ({ id, type: 'group', title });
const command = (id, c = 'sample.run') => ({ id, type: 'command', command: c });
test('tray scoped read retains private rows and filters parameterized assignment candidates', (t) => {
  const f = fixture(t),
    v = f.get();
  assert.equal(v.menu[0].command, 'private.run');
  assert.equal(v.clicks.singleClickCommand, 'appdock.open');
  assert.equal(v.clicks.doubleClickCommand, null);
  assert.ok(!v.assignableCommands.some((c) => c.id.endsWith('.update')));
  assert.equal(v.assignableCommands.find((c) => c.id === 'sample.run').available, false);
  assert.equal(
    v.assignableCommands.find((c) => c.id === 'appdock.settings.open').menuAllowed,
    false,
  );
  assert.equal(v.host, undefined);
  assert.throws(() => f.api.call('tray.get', { extra: 1 }), { code: 'INVALID_ARGUMENT' });
});
test('atomic click/menu changes support dry run, persistence and unrelated preservation', async (t) => {
  const f = fixture(t),
    before = structuredClone(f.settings.value),
    bytes = fs.readFileSync(f.settings.file, 'utf8');
  const ops = [
    add(group('g')),
    add(command('c'), 'g'),
    add({ id: 's', type: 'separator' }, 'g'),
    configure({ singleClickCommand: 'sample.run', doubleClickCommand: 'appdock.settings.open' }),
  ];
  const dry = await f.edit(ops, { dryRun: true });
  assert.equal(dry.completion, 'validated');
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), bytes);
  const saved = await f.edit(ops);
  assert.equal(saved.completion, 'settingsSaved');
  assert.equal(saved.effectVerified, false);
  assert.deepEqual(
    saved.menu[1].children.map((i) => i.id),
    ['c', 's'],
  );
  assert.deepEqual(f.settings.value.trayCommands, ['private.run', 'sample.run']);
  for (const k of ['ribbon', 'keybindings', 'extensions', 'gestures'])
    assert.deepEqual(f.settings.value[k], before[k]);
  assert.equal(f.settings.value.host.theme, before.host.theme);
  await f.edit([configure({ doubleClickCommand: null })]);
  assert.equal(f.get().clicks.doubleClickCommand, null);
});
test('move/reorder/rename and ungroup retain children and existing nonpublic assignments', async (t) => {
  const f = fixture(t);
  await f.edit([
    add(group('g')),
    add(command('c')),
    add({ id: 's', type: 'separator' }),
    { kind: 'move', id: 'old', parentId: 'g', beforeId: null },
    { kind: 'move', id: 'c', parentId: 'g', beforeId: 'old' },
    { kind: 'reorder', parentId: 'g', ids: ['old', 'c'] },
    { kind: 'update', id: 'g', changes: { title: ' New ' } },
    { kind: 'reorder', parentId: null, ids: ['s', 'g'] },
  ]);
  assert.equal(f.get().menu[1].title, 'New');
  await f.edit([{ kind: 'ungroup', id: 'g' }]);
  assert.deepEqual(
    f.get().menu.map((i) => i.id),
    ['s', 'old', 'c'],
  );
  await f.edit([
    { kind: 'update', id: 'c', changes: { command: 'appdock.open' } },
    { kind: 'remove', id: 's' },
  ]);
  assert.deepEqual(
    f.get().menu.map((i) => i.command),
    ['private.run', 'appdock.open'],
  );
});
test('no-op operations preserve revision, and empty menu stays empty', async (t) => {
  const f = fixture(t);
  const rev = f.get().revision;
  const v = await f.edit([
    configure({ singleClickCommand: 'appdock.open', doubleClickCommand: null }),
    { kind: 'update', id: 'old', changes: { command: 'private.run' } },
    { kind: 'move', id: 'old', parentId: null, beforeId: 'old' },
    { kind: 'reorder', parentId: null, ids: ['old'] },
  ]);
  assert.equal(v.changed, false);
  assert.equal(f.get().revision, rev);
  await f.edit([{ kind: 'remove', id: 'old' }]);
  assert.deepEqual(f.get().menu, []);
  assert.deepEqual(f.settings.value.trayCommands, []);
  await f.edit([configure({ singleClickCommand: 'appdock.settings.open' })]);
  assert.deepEqual(f.get().menu, []);
});
test('new private or parameterized commands and fixed menu entries cannot be assigned', async (t) => {
  const f = fixture(t);
  for (const operation of [
    add(command('x', 'private.run')),
    configure({ singleClickCommand: 'private.run' }),
    configure({ doubleClickCommand: 'private.run' }),
    add(command('x', 'appdock.settings.update')),
  ])
    await assert.rejects(f.edit([operation]), { code: 'COMMAND_NOT_ASSIGNABLE' });
  for (const c of ['appdock.quit', 'appdock.settings.open'])
    await assert.rejects(f.edit([add(command('x', c))]), { code: 'INVALID_ARGUMENT' });
});
test('invalid tree, hierarchy and click inputs reject the whole batch', async (t) => {
  const f = fixture(t);
  await f.edit([add(group('g')), add(command('c'), 'g')]);
  const bytes = fs.readFileSync(f.settings.file, 'utf8');
  for (const bad of [
    add(group('nested'), 'g'),
    add(command('old')),
    add({ ...group('bad'), children: [] }),
    { kind: 'remove', id: 'g' },
    { kind: 'ungroup', id: 'old' },
    { kind: 'move', id: 'g', parentId: 'g', beforeId: null },
    { kind: 'move', id: 'old', parentId: 'g', beforeId: 'g' },
    { kind: 'reorder', parentId: 'g', ids: [] },
    { kind: 'reorder', parentId: null, ids: ['old', 'old'] },
    { kind: 'update', id: 'g', changes: { command: 'sample.run' } },
    { kind: 'update', id: 'g', changes: { title: '\n' } },
    configure({ singleClickCommand: null }),
    configure({ doubleClickCommand: '' }),
    configure({ singleClickCommand: 'sample.run', extra: true }),
    configure({}),
    { kind: 'unknown' },
  ]) {
    await assert.rejects(f.edit([configure({ singleClickCommand: 'sample.run' }), bad]), {
      code: 'INVALID_ARGUMENT',
    });
    assert.equal(fs.readFileSync(f.settings.file, 'utf8'), bytes);
  }
  await assert.rejects(f.edit([{ kind: 'remove', id: 'missing' }]), { code: 'NOT_FOUND' });
  await assert.rejects(f.edit([]), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(f.edit([configure({ doubleClickCommand: null })], { dryRun: 'yes' }), {
    code: 'INVALID_ARGUMENT',
  });
});
test('settings grant gates tray edits independently of retired and execution grants', async (t) => {
  const f = fixture(t);
  f.permissions.execute = f.permissions.tray = false;
  f.permissions.write = false;
  await assert.rejects(f.edit([configure({ doubleClickCommand: null })]), {
    code: 'WRITE_DISABLED',
  });
  assert.ok(f.get().menu);
  f.permissions.write = true;
  const api = new AutomationApi({ ...f.options, trayEditable: undefined });
  await api.call('commands.execute', {
    id,
    args: {
      expectedRevision: api.call('tray.get').revision,
      operations: [configure({ doubleClickCommand: null })],
    },
  });
});

test('shared revision, restart tokens, unobserved disk edits and save failures protect settings', async (t) => {
  const f = fixture(t),
    revision = f.get().revision;
  await f.api.call('commands.execute', {
    id: 'appdock.settings.update',
    args: { expectedRevision: revision, changes: { theme: 'dark' } },
  });
  await assert.rejects(
    f.edit([configure({ doubleClickCommand: null })], { expectedRevision: revision }),
    { code: 'REVISION_CONFLICT' },
  );
  const other = new AutomationApi(f.options);
  await assert.rejects(
    other.call('commands.execute', {
      id,
      args: {
        expectedRevision: f.get().revision,
        operations: [configure({ doubleClickCommand: null })],
      },
    }),
    { code: 'REVISION_CONFLICT' },
  );
  const fail = new AutomationApi({
    ...f.options,
    save: () => {
      throw Error('PRIVATE_PATH');
    },
  });
  await assert.rejects(
    fail.call('commands.execute', {
      id,
      args: {
        expectedRevision: fail.call('tray.get').revision,
        operations: [configure({ singleClickCommand: 'sample.run' })],
      },
    }),
    (e) => e.code === 'SAVE_FAILED' && !e.message.includes('PRIVATE'),
  );
  const disk = JSON.parse(fs.readFileSync(f.settings.file, 'utf8'));
  disk.host.theme = 'light';
  fs.writeFileSync(f.settings.file, JSON.stringify(disk));
  await assert.rejects(f.edit([configure({ singleClickCommand: 'sample.run' })]));
  assert.equal(JSON.parse(fs.readFileSync(f.settings.file, 'utf8')).host.theme, 'light');
});
test('legacy layout is projected without saving and larger menus remain editable', async (t) => {
  const f = fixture(t),
    value = structuredClone(f.settings.value);
  delete value.trayMenu;
  value.trayCommands = ['private.run'];
  f.settings.save(value, f.settings.revision);
  const bytes = fs.readFileSync(f.settings.file, 'utf8');
  assert.ok(f.get().menu.some((i) => i.command === 'private.run'));
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), bytes);
  await f.edit([configure({ doubleClickCommand: 'appdock.open' })]);
  assert.ok(f.settings.value.trayMenu.some((i) => i.command === 'private.run'));
  f.settings.save(
    {
      ...f.settings.value,
      trayMenu: Array.from({ length: 1500 }, (_, i) => ({ id: `s${i}`, type: 'separator' })),
    },
    f.settings.revision,
  );
  await f.edit([add(command('overflow'))]);
  assert.equal(f.get().menu.length, 1501);
});
