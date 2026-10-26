const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { SettingsStore } = require('../out/main/main/core/settings');
const { AutomationApi } = require('../out/main/main/core/automation-api');
const { defaultRibbon } = require('../out/main/shared/applet-pages');
const id = 'appdock.ribbon.update';
function fixture(t) {
  const root = path.resolve('.artifacts/ribbon-command-unit');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const settings = new SettingsStore(path.join(dir, 'settings.json'), path.join(dir, 'backups'));
  settings.load();
  t.after(() => settings.close());
  const permissions = { write: true, execute: true, ribbon: true };
  const applets = [
    {
      id: 'sample',
      name: 'Sample',
      enabled: false,
      pages: [
        {
          id: 'main',
          title: 'Sample page',
          kind: 'local',
          path: 'PRIVATE_PATH',
          openCommand: 'PRIVATE_COMMAND',
        },
      ],
    },
  ];
  const options = {
    settings,
    save: (v, r) => settings.save(v, r),
    writable: () => permissions.write,
    executable: () => permissions.execute,
    ribbonEditable: () => permissions.ribbon,
    ribbonApplets: () => applets,
    ready: () => true,
    version: 'test',
    instanceId: 'test',
    applets: () => [],
    commands: () => [],
    execute: async () => {
      throw Error('Ribbon edits must not execute commands');
    },
  };
  const api = new AutomationApi(options);
  const get = () => api.call('ribbon.get');
  const edit = (operations, extras = {}) =>
    api.call('commands.execute', {
      id,
      args: { expectedRevision: get().revision, operations, ...extras },
    });
  return { settings, options, permissions, applets, api, get, edit };
}
const update = (id, changes) => ({ kind: 'update', id, changes });

test('ordinary item icons accept the expanded catalog through the public atomic edit API', async (t) => {
  const f = fixture(t);
  const icons = require('../out/main/shared/ribbon').ribbonGroupIcons;
  assert.equal(icons.length, 40);
  assert.equal(new Set(icons).size, icons.length);
  for (const icon of icons) {
    await f.edit([{ kind: 'updateItem', id: 'page:sample:main', changes: { icon } }]);
    assert.equal(f.get().layout.itemOverrides['page:sample:main'].icon, icon);
  }
  const before = fs.readFileSync(f.settings.file, 'utf8');
  const operations = [
    { kind: 'updateItem', id: 'ribbon-display-mode', changes: { icon: 'calendar' } },
  ];
  await f.edit(operations, { dryRun: true });
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), before);
  for (const icon of ['unknown-icon', {}, 1]) {
    await assert.rejects(
      f.edit([{ kind: 'updateItem', id: 'ribbon-display-mode', changes: { icon } }]),
    );
    assert.equal(fs.readFileSync(f.settings.file, 'utf8'), before);
  }
  await f.edit(operations);
  await f.edit([{ kind: 'updateItem', id: 'page:sample:main', changes: { icon: null } }]);
  assert.equal(f.get().layout.itemOverrides['page:sample:main'].icon, null);
  assert.equal(f.get().layout.itemOverrides['ribbon-display-mode'].icon, 'calendar');
});

test('mode icon edits validate both states, support dry-run and reject invalid or misplaced data atomically', async (t) => {
  const f = fixture(t),
    item = 'ribbon-display-mode';
  await f.edit([{ kind: 'updateItem', id: item, changes: { icon: 'star' } }]);
  const modes = {
    compact: { icon: 'music', image: null },
    expanded: { icon: null, image: { file: 'expanded.png' } },
  };
  const operations = [{ kind: 'updateItem', id: item, changes: { displayModeIcons: modes } }];
  const before = fs.readFileSync(f.settings.file, 'utf8');
  await f.edit(operations, { dryRun: true });
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), before);
  await f.edit(operations);
  assert.deepEqual(f.get().layout.itemOverrides[item].displayModeIcons, modes);
  assert.equal(f.get().layout.itemOverrides[item].icon, 'star');
  const saved = fs.readFileSync(f.settings.file, 'utf8');
  for (const value of [
    { other: {} },
    { compact: null },
    { compact: { icon: 'invalid' } },
    { expanded: { image: { file: '../outside.png' } } },
    { compact: { title: 'extra' } },
  ]) {
    await assert.rejects(
      f.edit([{ kind: 'updateItem', id: item, changes: { displayModeIcons: value } }]),
    );
    assert.equal(fs.readFileSync(f.settings.file, 'utf8'), saved);
  }
  await assert.rejects(
    f.edit([{ kind: 'updateItem', id: 'logs', changes: { displayModeIcons: modes } }]),
  );
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), saved);
  await f.edit([
    { kind: 'updateItem', id: item, changes: { displayModeIcons: null, icon: null, image: null } },
  ]);
  assert.equal(f.get().layout.itemOverrides[item].displayModeIcons, null);
});

test('appearance edits preserve source identity and missing removal rechecks the current catalog', async (t) => {
  const f = fixture(t);
  await f.edit([
    {
      kind: 'updateItem',
      id: 'page:sample:main',
      changes: { title: 'Personal name', iconOnly: true },
    },
  ]);
  assert.equal(f.get().items.find((i) => i.id === 'page:sample:main').title, 'Personal name');
  assert.equal(f.applets[0].pages[0].title, 'Sample page');
  assert.equal(f.get().layout.itemOverrides['page:sample:main'].lastKnownTitle, 'Sample page');
  await assert.rejects(f.edit([{ kind: 'removeMissing', id: 'page:sample:main' }]));
  const source = f.applets.pop();
  const before = fs.readFileSync(f.settings.file, 'utf8');
  const dry = await f.edit([{ kind: 'removeMissing', id: 'page:sample:main' }], { dryRun: true });
  assert.deepEqual(dry.retainedIds, []);
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), before);
  f.applets.push(source);
  await assert.rejects(
    f.edit([
      { kind: 'updateItem', id: 'image-library', changes: { title: 'Must not save' } },
      { kind: 'removeMissing', id: 'page:sample:main' },
    ]),
  );
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), before);
  f.applets.pop();
  await f.edit([{ kind: 'removeMissing', id: 'page:sample:main' }]);
  assert.deepEqual(f.get().retainedIds, []);
  assert.equal(f.get().layout.itemOverrides['page:sample:main'], undefined);
});

test('group operations stay atomic with shared revisions and expose parent placement without opening pages', async (t) => {
  const f = fixture(t);
  const ops = [
    {
      kind: 'addGroup',
      id: 'group:work',
      title: 'Work',
      icon: 'folder',
      expansion: 'temporary',
      placement: 'bottom',
    },
    { kind: 'moveItem', id: 'image-library', parentId: 'group:work', beforeId: null },
    { kind: 'moveItem', id: 'page:sample:main', parentId: 'group:work', beforeId: 'image-library' },
  ];
  const before = JSON.stringify(f.settings.value);
  const dry = await f.edit(ops, { dryRun: true });
  assert.equal(JSON.stringify(f.settings.value), before);
  assert.deepEqual(dry.layout.groups[0].children, ['page:sample:main', 'image-library']);
  await f.edit(ops);
  const page = f.get().items.find((i) => i.id === 'page:sample:main');
  assert.equal(page.parentId, 'group:work');
  assert.equal(page.placement, 'bottom');
  assert.equal(page.displayed, false);
  await assert.rejects(
    f.edit([
      { kind: 'updateGroup', id: 'group:work', changes: { title: 'Changed' } },
      { kind: 'reorderChildren', id: 'group:work', ids: ['image-library'] },
    ]),
  );
  assert.equal(f.get().layout.groups[0].title, 'Work');
  await f.edit([{ kind: 'ungroup', id: 'group:work' }]);
  assert.deepEqual(f.get().layout.groups, []);
  assert(f.get().layout.bottom.includes('image-library'));
});
test('ribbon read exposes scoped metadata and retains disabled and missing pages', (t) => {
  const f = fixture(t),
    s = structuredClone(f.settings.value);
  s.ribbon.order = ['page:missing:main'];
  s.ribbon.custom = 'PRIVATE_EXTRA';
  f.settings.save(s, f.settings.revision);
  const v = f.get(),
    page = v.items.find((i) => i.id === 'page:sample:main');
  assert.equal(page.enabled, false);
  assert.equal(page.visible, true);
  assert.equal(page.displayed, false);
  assert.deepEqual(v.retainedIds, ['page:missing:main']);
  assert.equal(JSON.stringify(v).includes('PRIVATE_'), false);
  assert.throws(() => f.api.call('ribbon.get', { extra: true }), { code: 'INVALID_ARGUMENT' });
});
test('ribbon atomic edit, dry run, disabled page visibility, placement and unrelated settings', async (t) => {
  const f = fixture(t),
    before = structuredClone(f.settings.value),
    bytes = fs.readFileSync(f.settings.file, 'utf8');
  const ops = [
    { kind: 'addSeparator', id: 'separator:test', placement: 'bottom' },
    update('image-library', { visible: false }),
    update('page:sample:main', { placement: 'bottom' }),
  ];
  const dry = await f.edit(ops, { dryRun: true });
  assert.equal(dry.completion, 'validated');
  assert.equal(dry.changed, true);
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), bytes);
  const saved = await f.edit(ops);
  assert.equal(saved.completion, 'settingsSaved');
  assert.equal(saved.effectVerified, false);
  assert.ok(saved.layout.hidden.includes('image-library'));
  assert.ok(saved.layout.bottom.includes('page:sample:main'));
  assert.equal(saved.items.find((i) => i.id === 'page:sample:main').displayed, false);
  for (const key of ['host', 'extensions', 'keybindings', 'gestures', 'appletOrder'])
    assert.deepEqual(f.settings.value[key], before[key]);
  await f.edit([{ kind: 'removeSeparator', id: 'separator:test' }]);
  for (const key of ['order', 'hidden', 'bottom', 'separators'])
    assert.ok(!f.get().layout[key].includes('separator:test'));
});
test('reorder includes hidden and disabled items and preserves other group and retained ids', async (t) => {
  const f = fixture(t),
    s = structuredClone(f.settings.value);
  s.ribbon.order = ['page:missing:main', 'logs'];
  s.ribbon.bottom.push('page:missing:main');
  s.ribbon.hidden = ['image-library', 'page:missing:main'];
  s.ribbon.custom = { secret: 'PRIVATE_EXTRA' };
  f.settings.save(s, f.settings.revision);
  const before = f.get(),
    top = before.items
      .filter((i) => i.placement === 'top')
      .map((i) => i.id)
      .reverse();
  await f.edit([{ kind: 'reorder', placement: 'top', ids: top }]);
  const after = f.get();
  assert.deepEqual(
    after.items.filter((i) => i.placement === 'top').map((i) => i.id),
    top,
  );
  assert.deepEqual(
    after.items.filter((i) => i.placement === 'bottom'),
    before.items.filter((i) => i.placement === 'bottom'),
  );
  assert.deepEqual(after.retainedIds, ['page:missing:main']);
  assert.ok(after.layout.hidden.includes('page:missing:main'));
  assert.equal(f.settings.value.ribbon.custom.secret, 'PRIVATE_EXTRA');
  await f.edit([{ kind: 'reset' }]);
  assert.deepEqual(f.get().layout, defaultRibbon());
  assert.equal(f.settings.value.ribbon.custom.secret, 'PRIVATE_EXTRA');
});
test('no-op visibility, placement and order do not save', async (t) => {
  const f = fixture(t);
  await f.edit([update('image-library', { visible: false }), update('logs', { visible: false })]);
  const rev = f.get().revision,
    bytes = fs.readFileSync(f.settings.file, 'utf8');
  const result = await f.edit([
    update('image-library', { visible: false, placement: 'top' }),
    {
      kind: 'reorder',
      placement: 'top',
      ids: f
        .get()
        .items.filter((i) => i.placement === 'top')
        .map((i) => i.id),
    },
  ]);
  assert.equal(result.changed, false);
  assert.equal(f.get().revision, rev);
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), bytes);
});
test('invalid operations and late errors reject all changes', async (t) => {
  const f = fixture(t),
    bytes = fs.readFileSync(f.settings.file, 'utf8');
  for (const op of [
    update('image-library', {}),
    update('image-library', { visible: 'yes' }),
    update('image-library', { placement: 'left' }),
    update('image-library', { extra: true }),
    { kind: 'reset', extra: 1 },
    { kind: 'removeSeparator', id: 'image-library' },
    { kind: 'addSeparator', id: 'bad', placement: 'top' },
    { kind: 'addSeparator', id: 'separator:test', placement: 'wrong' },
    { kind: 'reorder', placement: 'top', ids: ['image-library'] },
    { kind: 'reorder', placement: 'top', ids: ['image-library', 'image-library'] },
    { kind: 'unknown' },
  ]) {
    await assert.rejects(f.edit([update('logs', { visible: false }), op]), {
      code: 'INVALID_ARGUMENT',
    });
    assert.equal(fs.readFileSync(f.settings.file, 'utf8'), bytes);
  }
  await assert.rejects(f.edit([update('page:missing:main', { visible: true })]), {
    code: 'NOT_FOUND',
  });
  await assert.rejects(f.edit([{ kind: 'removeSeparator', id: 'separator:missing' }]), {
    code: 'NOT_FOUND',
  });
  await assert.rejects(f.edit([]), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(f.edit([{ kind: 'reset' }], { dryRun: 'yes' }), {
    code: 'INVALID_ARGUMENT',
  });
  await assert.rejects(f.edit([{ kind: 'reset' }], { extra: true }), { code: 'INVALID_ARGUMENT' });
});
test('catalog changes invalidate incomplete reorder; separator count and duplicates are bounded', async (t) => {
  const f = fixture(t),
    top = f
      .get()
      .items.filter((i) => i.placement === 'top')
      .map((i) => i.id);
  f.applets.push({
    id: 'second',
    enabled: true,
    pages: [{ id: 'main', title: 'Second', kind: 'local', path: 'index.html' }],
  });
  await assert.rejects(f.edit([{ kind: 'reorder', placement: 'top', ids: top }]), {
    code: 'INVALID_ARGUMENT',
  });
  await assert.rejects(
    f.edit(
      Array.from({ length: 51 }, (_, i) => ({
        kind: 'addSeparator',
        id: `separator:s${i}`,
        placement: 'top',
      })),
    ),
    { code: 'INVALID_ARGUMENT' },
  );
  assert.deepEqual(f.get().layout, defaultRibbon());
  await assert.rejects(
    f.edit([
      { kind: 'addSeparator', id: 'separator:dup', placement: 'top' },
      { kind: 'addSeparator', id: 'separator:dup', placement: 'top' },
    ]),
    { code: 'INVALID_ARGUMENT' },
  );
});
test('settings grant gates ribbon edits independently of retired and execution grants', async (t) => {
  const f = fixture(t);
  f.permissions.execute = f.permissions.ribbon = false;
  f.permissions.write = false;
  await assert.rejects(f.edit([update('image-library', { visible: false })]), {
    code: 'WRITE_DISABLED',
  });
  assert.ok(f.get().items.length);
  f.permissions.write = true;
  const api = new AutomationApi({ ...f.options, ribbonEditable: undefined });
  await api.call('commands.execute', {
    id,
    args: { expectedRevision: api.call('ribbon.get').revision, operations: [{ kind: 'reset' }] },
  });
});

test('shared revision rejects stale edits, restarted API tokens, and disk conflict', async (t) => {
  const f = fixture(t),
    old = f.get().revision;
  await f.api.call('commands.execute', {
    id: 'appdock.settings.update',
    args: { expectedRevision: old, changes: { theme: 'dark' } },
  });
  await assert.rejects(
    f.edit([update('image-library', { visible: false })], { expectedRevision: old }),
    {
      code: 'REVISION_CONFLICT',
    },
  );
  const restarted = new AutomationApi(f.options);
  await assert.rejects(
    restarted.call('commands.execute', {
      id,
      args: { expectedRevision: f.get().revision, operations: [{ kind: 'reset' }] },
    }),
    { code: 'REVISION_CONFLICT' },
  );
  const disk = JSON.parse(fs.readFileSync(f.settings.file, 'utf8'));
  disk.host.theme = 'light';
  fs.writeFileSync(f.settings.file, JSON.stringify(disk));
  await assert.rejects(f.edit([update('image-library', { visible: false })]));
  assert.equal(JSON.parse(fs.readFileSync(f.settings.file, 'utf8')).host.theme, 'light');
});
test('save failure is sanitized and leaves settings intact', async (t) => {
  const f = fixture(t),
    api = new AutomationApi({
      ...f.options,
      save: () => {
        throw Error('PRIVATE_PATH');
      },
    });
  await assert.rejects(
    api.call('commands.execute', {
      id,
      args: {
        expectedRevision: api.call('ribbon.get').revision,
        operations: [update('image-library', { visible: false })],
      },
    }),
    (e) => e.code === 'SAVE_FAILED' && !e.message.includes('PRIVATE'),
  );
  assert.deepEqual(f.get().layout, defaultRibbon());
});
