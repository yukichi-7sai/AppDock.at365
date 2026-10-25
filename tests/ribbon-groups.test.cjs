const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { defaultRibbon, parseRibbon, ribbonItems } = require('../out/main/shared/applet-pages');
const { editRibbon, ribbonPresentation } = require('../out/main/shared/ribbon-layout');
const { parseRibbonBadge, ribbonBadgeView } = require('../out/main/shared/ribbon');
const { RibbonState } = require('../out/main/main/core/ribbon-state');
const { RibbonBadges } = require('../out/main/main/core/ribbon-badges');
const { UiPresentation, NavigationCoordinator } = require('../out/main/main/core/ui-presentation');
const { RibbonGroupSession } = require('../out/main/main/core/ribbon-group-session');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const group = (id = 'group:one', children = [], expansion = 'persistent') => ({
  id,
  title: 'Group',
  icon: 'folder',
  expansion,
  children,
});
const edit = (layout, operation) =>
  editRibbon(layout, ribbonItems([], layout.separators, layout.groups), operation);

test('configured source names survive disappearance and do not override live names or custom labels', () => {
  const source = { id: 'remembered', pages: [{ id: 'main', title: 'Original name' }] };
  const id = 'page:remembered:main';
  let items = ribbonItems([source]);
  let layout = editRibbon(defaultRibbon(), items, {
    kind: 'update',
    id,
    changes: { visible: false },
  });
  assert.equal(layout.itemOverrides[id].lastKnownTitle, 'Original name');
  layout = parseRibbon(JSON.parse(JSON.stringify(layout)));
  assert.equal(layout.itemOverrides[id].lastKnownTitle, 'Original name');
  source.pages[0].title = 'Current name';
  items = ribbonItems([source]);
  assert.equal(
    ribbonPresentation(
      layout,
      items.find((i) => i.id === id),
    ).title,
    'Current name',
  );
  const unchanged = editRibbon(layout, items, { kind: 'update', id, changes: { visible: false } });
  assert.deepEqual(unchanged, layout, 'no-op does not write a name cache');
  layout = editRibbon(layout, items, { kind: 'updateItem', id, changes: { title: 'My label' } });
  assert.equal(layout.itemOverrides[id].lastKnownTitle, 'Current name');
  const missing = { id, title: layout.itemOverrides[id].lastKnownTitle };
  assert.equal(ribbonPresentation(layout, missing).title, 'My label');
  layout = editRibbon(layout, ribbonItems([]), { kind: 'updateItem', id, changes: { title: '' } });
  assert.equal(ribbonPresentation(layout, missing).title, 'Current name');
  layout = editRibbon(layout, ribbonItems([]), { kind: 'removeMissing', id });
  assert.equal(layout.itemOverrides[id], undefined);
  assert.throws(() =>
    parseRibbon({ ...layout, itemOverrides: { [id]: { lastKnownTitle: 'bad\nname' } } }),
  );
});

test('blank group names and display overrides preserve source identities and validate presentation fields', () => {
  let layout = edit(defaultRibbon(), {
    kind: 'addGroup',
    id: 'group:empty',
    title: '  ',
    icon: 'folder',
    expansion: 'temporary',
    iconOnly: true,
    placement: 'top',
  });
  assert.equal(layout.groups[0].title, '');
  layout = edit(layout, {
    kind: 'updateItem',
    id: 'image-library',
    changes: { title: '  Custom gallery  ', iconOnly: true },
  });
  assert.deepEqual(layout.itemOverrides['image-library'], {
    title: 'Custom gallery',
    iconOnly: true,
  });
  assert.equal(ribbonItems([]).find((i) => i.id === 'image-library').title, '画像ライブラリー');
  layout = edit(layout, { kind: 'updateItem', id: 'image-library', changes: { title: '' } });
  assert.deepEqual(layout.itemOverrides['image-library'], { iconOnly: true });
  for (const changes of [
    { title: 'x'.repeat(81) },
    { title: 'bad\nname' },
    { iconOnly: 'yes' },
    { other: true },
  ])
    assert.throws(() => edit(layout, { kind: 'updateItem', id: 'image-library', changes }));
  assert.throws(() =>
    edit(layout, { kind: 'updateItem', id: 'group:empty', changes: { title: 'no' } }),
  );
  assert.throws(() =>
    parseRibbon({ ...layout, itemOverrides: { 'group:empty': { iconOnly: true } } }),
  );
  assert.throws(() =>
    parseRibbon({ ...layout, groups: [{ ...layout.groups[0], iconOnly: 'true' }] }),
  );
});

test('remove missing item clears every placement and override while refusing live or unknown entries', () => {
  const root = 'page:missing:root',
    child = 'page:missing:child',
    only = 'page:missing:override';
  let layout = parseRibbon({
    ...defaultRibbon(),
    order: [root, 'group:one'],
    hidden: [root, child],
    bottom: [root],
    groups: [group('group:one', [child, 'image-library'])],
    itemOverrides: {
      [root]: { title: 'Root' },
      [child]: { iconOnly: true },
      [only]: { title: 'Only' },
    },
  });
  for (const id of [root, child, only]) layout = edit(layout, { kind: 'removeMissing', id });
  assert.deepEqual(layout.order, ['group:one']);
  assert.deepEqual(layout.groups[0].children, ['image-library']);
  assert.deepEqual(layout.hidden, []);
  assert.deepEqual(layout.bottom, []);
  assert.deepEqual(layout.itemOverrides, {});
  for (const id of ['image-library', 'group:one', 'page:absent:unknown'])
    assert.throws(() => edit(layout, { kind: 'removeMissing', id }));
});

test('old layouts migrate in memory; duplicate ownership, nesting, dangling groups and excess values fail', () => {
  const legacy = { order: [], hidden: [], bottom: [], separators: [] };
  assert.deepEqual(parseRibbon(legacy).groups, []);
  assert.equal(legacy.groups, undefined);
  const good = { ...defaultRibbon(), order: ['group:one'], groups: [group('group:one', ['home'])] };
  assert.deepEqual(parseRibbon(good), good);
  for (const bad of [
    { ...good, order: ['group:one', 'home'] },
    { ...good, bottom: ['home'] },
    { ...good, groups: [group('group:one', ['home', 'home'])] },
    { ...good, groups: [group('group:one', ['group:two'])] },
    { ...good, groups: [group('group:one', ['separator:missing'])] },
    { ...good, hidden: ['group:missing'] },
    { ...good, groups: [{ ...group(), title: 'bad\nname' }] },
    {
      ...good,
      order: ['group:one', 'group:two'],
      groups: [group('group:one', ['home']), group('group:two', ['home'])],
    },
  ])
    assert.throws(() => parseRibbon(bad));
});

test('move and ungroup preserve missing children, exact root position, bottom and hidden inheritance', () => {
  let layout = {
    ...defaultRibbon(),
    order: ['home', 'group:one', 'logs'],
    bottom: ['group:one'],
    hidden: ['group:one'],
    groups: [group('group:one', ['page:missing:main', 'extensions'])],
  };
  layout = edit(layout, {
    kind: 'moveItem',
    id: 'settings',
    parentId: 'group:one',
    beforeId: 'extensions',
  });
  assert.deepEqual(layout.groups[0].children, ['page:missing:main', 'settings', 'extensions']);
  assert(!layout.order.includes('settings'));
  layout = edit(layout, {
    kind: 'reorderChildren',
    id: 'group:one',
    ids: ['settings', 'extensions', 'page:missing:main'],
  });
  layout = edit(layout, { kind: 'ungroup', id: 'group:one' });
  assert.deepEqual(layout.order.slice(0, 5), [
    'home',
    'settings',
    'extensions',
    'page:missing:main',
    'logs',
  ]);
  assert.deepEqual(layout.bottom, ['settings', 'extensions', 'page:missing:main']);
  assert.deepEqual(layout.hidden, ['settings', 'extensions', 'page:missing:main']);
  assert.deepEqual(layout.groups, []);
});

test('child placement changes require moving out; group nesting and partial reorder cannot corrupt layout', () => {
  const layout = {
    ...defaultRibbon(),
    order: ['group:one', 'group:two'],
    groups: [group('group:one', ['home', 'logs']), group('group:two')],
  };
  for (const op of [
    { kind: 'update', id: 'home', changes: { placement: 'bottom' } },
    { kind: 'moveItem', id: 'group:one', parentId: 'group:two', beforeId: null },
    { kind: 'reorderChildren', id: 'group:one', ids: ['home'] },
  ])
    assert.throws(() => edit(layout, op));
  const moved = edit(layout, {
    kind: 'moveItem',
    id: 'home',
    parentId: null,
    beforeId: null,
    placement: 'bottom',
  });
  assert.deepEqual(moved.groups[0].children, ['logs']);
  assert(moved.bottom.includes('home'));
  assert.deepEqual(layout.groups[0].children, ['home', 'logs']);
});

test('local expansion survives restart, is no-op aware and stays unchanged on write failure', (t) => {
  const dir = fs.mkdtempSync(path.resolve('.artifacts/ribbon-state-'));
  const file = path.join(dir, 'ribbon-state.json');
  let changed = 0,
    failed = 0;
  const state = new RibbonState(
    file,
    () => changed++,
    () => failed++,
  );
  assert(!fs.existsSync(file));
  assert.equal(state.isExpanded('group:one'), false);
  state.set('group:one', true);
  const bytes = fs.readFileSync(file, 'utf8');
  assert.equal(state.set('group:one', true), false);
  assert.equal(changed, 1);
  assert.equal(
    new RibbonState(
      file,
      () => {},
      () => {},
    ).isExpanded('group:one'),
    true,
  );
  const io = require('../out/main/main/core/settings');
  const original = io.atomicWrite;
  io.atomicWrite = () => {
    throw Error('fixture disk full');
  };
  try {
    assert.throws(() => state.set('group:one', false));
  } finally {
    io.atomicWrite = original;
  }
  assert.equal(failed, 1);
  assert.equal(state.isExpanded('group:one'), true);
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  fs.writeFileSync(file, 'corrupt');
  assert.equal(
    new RibbonState(
      file,
      () => {},
      () => failed++,
    ).isExpanded('group:one'),
    false,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'corrupt');
});

test('badges validate exact types and raw counts, clear zero and never notify for an identical value', () => {
  for (const value of [
    undefined,
    -1,
    { kind: 'count', count: -1 },
    { kind: 'count', count: 1.2 },
    { kind: 'count', count: 2 ** 53 },
    { kind: 'dot', count: 1 },
    { kind: 'dot', label: '\n' },
    { kind: 'dot', label: 'a'.repeat(121) },
  ])
    assert.throws(() => parseRibbonBadge(value));
  assert.equal(parseRibbonBadge({ kind: 'count', count: 0 }), null);
  assert.deepEqual(ribbonBadgeView({ kind: 'count', count: 140, label: 'Pending' }), {
    kind: 'count',
    text: '99+',
    description: 'Pending: 140',
  });
  let live = { generation: 'one', ids: new Set(['page:owner:main']) },
    changes = 0;
  const badges = new RibbonBadges(
    (owner) => (owner === 'owner' ? live : undefined),
    () => changes++,
  );
  badges.set('owner', 'one', 'page:owner:main', { kind: 'count', count: 140 });
  badges.set('owner', 'one', 'page:owner:main', { kind: 'count', count: 140 });
  assert.equal(changes, 1);
  assert.equal(badges.get('page:owner:main').count, 140);
  assert.throws(() => badges.set('other', 'one', 'page:owner:main', null));
  assert.throws(() => badges.set('owner', 'stale', 'page:owner:main', null));
  live.ids.clear();
  badges.reconcile();
  live.ids.add('page:owner:main');
  assert.equal(badges.get('page:owner:main'), null);
  badges.set('owner', 'one', 'page:owner:main', { kind: 'dot' });
  live = { ...live, generation: 'two' };
  badges.reconcile();
  assert.equal(badges.get('page:owner:main'), null);
  badges.set('owner', 'two', 'page:owner:main', { kind: 'dot' });
  live = undefined;
  badges.reconcile();
  assert.equal(badges.get('page:owner:main'), null);
});

function presentation(expansion = 'persistent') {
  const settings = createDefaultSettings();
  settings.ribbon = {
    ...defaultRibbon(),
    order: ['group:one'],
    groups: [group('group:one', ['image-library', 'page:owner:main'], expansion)],
  };
  const applets = [
    {
      id: 'owner',
      enabled: true,
      state: 'running',
      pages: [{ id: 'main', title: 'Page', openCommand: 'owner.open' }],
      commands: [{ id: 'owner.open', available: true }],
    },
  ];
  let open = false,
    badge = { kind: 'count', count: 123 },
    executed = [];
  const ui = new UiPresentation({
    settings: () => settings,
    applets: () => applets,
    dark: () => true,
    avatar: () => undefined,
    navigation: new NavigationCoordinator(() => {}),
    execute: async (id) => executed.push(id),
    theme: async () => {},
    expanded: () => open,
    toggleGroup: () => {
      open = !open;
    },
    badge: (id) => (id === 'page:owner:main' ? badge : null),
  });
  return { ui, settings, applets, executed, badge: (next) => (badge = next) };
}

test('persistent projection, aggregate dot, schema 1 flattening and request deduplication', async () => {
  const f = presentation(),
    before = f.ui.get();
  const group = before.items.find((i) => i.kind === 'group');
  assert.equal(group.expanded, false);
  assert.deepEqual(group.children, []);
  assert.equal(group.badge.kind, 'dot');
  const request = { epoch: before.epoch, requestId: 'toggle', actionId: group.actionId };
  await Promise.all([f.ui.invoke(request, 'shell'), f.ui.invoke(request, 'shell')]);
  assert.equal(f.ui.group(group.id).group.expanded, true);
  const legacy = f.ui.get(() => true, 1, false);
  assert(legacy.items.every((i) => i.kind !== 'group' && !i.badge && !i.children && !i.expansion));
  assert(legacy.items.some((i) => i.id === 'page:owner:main'));
  const expanded = f.ui.group(group.id);
  assert.equal(expanded.items[1].badge.text, '99+');
  f.settings.ribbon.hidden.push('page:owner:main');
  assert.equal(f.ui.group(group.id).group.badge, undefined);
  f.settings.ribbon.hidden.push('image-library');
  assert.equal(f.ui.group(group.id), undefined);
});

test('temporary group requires local anchor, dismiss executes nothing, selected action dispatches once after closing', async () => {
  const f = presentation('temporary');
  const action = { epoch: f.ui.epoch, requestId: 'open', actionId: 'ribbon.group:one' };
  assert.equal(
    f.ui.get(() => true, 2, false).items.find((i) => i.id === 'group:one').enabled,
    false,
  );
  await assert.rejects(f.ui.invoke(action, 'external'));
  const anchor = { x: 5, y: 10, width: 60, height: 50 };
  let closed = 0;
  const dismissed = new RibbonGroupSession(f.ui, 'group:one', anchor, () => assert.fail());
  dismissed.onClosed(() => closed++);
  await dismissed.act({ id: dismissed.id, type: 'dismiss' });
  assert.equal(closed, 1);
  assert.deepEqual(f.executed, []);
  const chosen = new RibbonGroupSession(f.ui, 'group:one', anchor, () => assert.fail());
  chosen.onClosed(() => {
    closed++;
    assert.deepEqual(f.executed, []);
  });
  await chosen.act({
    id: chosen.id,
    type: 'ribbonChoose',
    requestId: 'choose',
    actionId: 'ribbon.page:owner:main',
  });
  assert.equal(closed, 2);
  assert.deepEqual(f.executed, ['owner.open']);
  await assert.rejects(
    chosen.act({
      id: chosen.id,
      type: 'ribbonChoose',
      requestId: 'choose',
      actionId: 'ribbon.page:owner:main',
    }),
  );
});

test('temporary sessions update badges, but invalidate on membership, disabled source and configuration changes', () => {
  const f = presentation('temporary');
  let closed = 0;
  const viewport = { x: 0, y: 32, width: 200, height: 650 };
  const session = new RibbonGroupSession(
    f.ui,
    'group:one',
    { x: 0, y: 0, width: 20, height: 20 },
    () => {},
    viewport,
  );
  session.onClosed(() => closed++);
  const first = session.snapshot();
  assert.deepEqual(first.content.viewport, viewport);
  assert.deepEqual(first.content.anchor, { x: 0, y: 0, width: 20, height: 20 });
  f.badge({ kind: 'dot' });
  assert(session.snapshot().revision > first.revision);
  assert.equal(closed, 0);
  f.applets[0].commands[0].available = false;
  assert.equal(session.snapshot().content.items[1].enabled, false);
  assert.equal(closed, 0);
  f.applets[0].enabled = false;
  assert.equal(session.snapshot().content.items.length, 1);
  assert.equal(closed, 0);
  f.settings.ribbon.groups[0].children = ['page:owner:main'];
  session.snapshot();
  assert.equal(closed, 1);
});

test('badge Host API resolves actual page/collection ownership, capabilities and runtime, never ID prefixes', async () => {
  const { createHostApi } = require('../out/main/main/core/host-api');
  const settings = { value: createDefaultSettings() };
  const e = {
    state: 'running',
    runtimeSession: 'generation',
    manifest: { id: 'owner', capabilities: ['ribbon-badges'], pages: [{ id: 'fixed' }] },
    dynamicPages: [{ id: 'dynamic' }],
  };
  const collections = [
    {
      id: 'legacy.other-id',
      binding: { owner: 'owner', key: 'items', itemId: 'one' },
      item: { enabled: true },
    },
  ];
  const ids = new Set(['page:owner:fixed', 'page:owner:dynamic', 'page:legacy.other-id:main']);
  const badges = new RibbonBadges(
    (owner) => (owner === 'owner' ? { generation: e.runtimeSession, ids } : undefined),
    () => {},
  );
  const api = createHostApi(
    settings,
    '.',
    () => {},
    () => {},
    undefined,
    undefined,
    undefined,
    undefined,
    {},
    undefined,
    undefined,
    () => ({ entries: () => collections }),
    badges,
  );
  await api(e, 'host.ribbon.setBadge', {
    target: { pageId: 'fixed' },
    badge: { kind: 'count', count: 12 },
  });
  assert.equal(badges.get('page:owner:fixed').count, 12);
  assert.equal(
    (
      await api(e, 'host.ribbon.setBadge', {
        target: { pageId: 'fixed' },
        badge: { kind: 'count', count: 12 },
      })
    ).changed,
    false,
  );
  await api(e, 'host.ribbon.setBadge', { target: { pageId: 'dynamic' }, badge: { kind: 'dot' } });
  await api(e, 'host.ribbon.setBadge', {
    target: { collectionKey: 'items', itemId: 'one' },
    badge: { kind: 'dot' },
  });
  assert.equal(badges.get('page:legacy.other-id:main').kind, 'dot');
  for (const target of [
    { pageId: 'foreign' },
    { pageId: 'fixed', other: 1 },
    { collectionKey: 'items', itemId: 'foreign' },
    { pageId: 'page:owner:fixed' },
  ])
    await assert.rejects(api(e, 'host.ribbon.setBadge', { target, badge: null }));
  e.manifest.capabilities = [];
  await assert.rejects(
    api(e, 'host.ribbon.setBadge', { target: { pageId: 'fixed' }, badge: null }),
  );
  e.manifest.capabilities = ['ribbon-badges'];
  e.state = 'stopping';
  await assert.rejects(
    api(e, 'host.ribbon.setBadge', { target: { pageId: 'fixed' }, badge: null }),
  );
});

test('moving the last child to the same position is a true no-op without materializing roots', () => {
  const layout = {
    ...defaultRibbon(),
    order: ['group:one'],
    groups: [group('group:one', ['home', 'logs'])],
  };
  assert.deepEqual(
    edit(layout, { kind: 'moveItem', id: 'logs', parentId: 'group:one', beforeId: null }),
    layout,
  );
});
