const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { RibbonState } = require('../out/main/main/core/ribbon-state'),
  { UiPresentation, NavigationCoordinator } = require('../out/main/main/core/ui-presentation'),
  { createDefaultSettings } = require('../out/main/shared/settings-schema');
test('display mode shares PC-local state with groups, accepts old state and commits atomically', () => {
  const dir = fs.mkdtempSync(path.resolve('.artifacts/ribbon-mode-state-')),
    file = path.join(dir, 'ribbon-state.json');
  let changed = 0,
    failed = 0;
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, expanded: { 'group:one': true } }));
  const s = new RibbonState(
    file,
    () => changed++,
    () => failed++,
  );
  assert.equal(s.displayMode, 'compact');
  assert(s.isExpanded('group:one'));
  assert.equal(s.setDisplayMode('expanded'), true);
  assert.equal(s.setDisplayMode('expanded'), false);
  assert.equal(changed, 1);
  s.set('group:two', true);
  assert.equal(
    new RibbonState(
      file,
      () => {},
      () => {},
    ).displayMode,
    'expanded',
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(file)).expanded, {
    'group:one': true,
    'group:two': true,
  });
  assert.throws(() => s.setDisplayMode('invalid'));
  const bytes = fs.readFileSync(file, 'utf8'),
    io = require('../out/main/main/core/settings'),
    write = io.atomicWrite;
  io.atomicWrite = () => {
    throw Error('fixture write failure');
  };
  try {
    assert.throws(() => s.setDisplayMode('compact'));
  } finally {
    io.atomicWrite = write;
  }
  assert.equal(s.displayMode, 'expanded');
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  assert.equal(failed, 1);
  assert.equal(changed, 2);
});
test('expanded display respects individual icon flags without changing settings or command identity', async () => {
  const settings = createDefaultSettings();
  settings.ribbon.groups = [
    {
      id: 'group:one',
      title: '',
      icon: 'folder',
      expansion: 'persistent',
      iconOnly: true,
      children: ['image-library'],
    },
  ];
  settings.ribbon.itemOverrides = { logs: { iconOnly: false }, settings: { iconOnly: true } };
  let mode = 'compact',
    toggles = 0;
  const nav = new NavigationCoordinator(() => {}),
    before = JSON.stringify(settings),
    ui = new UiPresentation({
      settings: () => settings,
      applets: () => [],
      dark: () => false,
      navigation: nav,
      execute: async () => {},
      theme: async () => {},
      displayMode: () => mode,
      toggleDisplayMode: () => {
        toggles++;
        mode = mode === 'compact' ? 'expanded' : 'compact';
      },
    });
  const first = ui.get(),
    action = first.displayModeToggle.actionId,
    request = { epoch: first.epoch, requestId: 'toggle-once', actionId: action };
  assert(first.items.filter((x) => x.kind !== 'separator').every((x) => x.iconOnly === true));
  assert.equal(first.items.find((x) => x.id === 'settings').hideLabel, true);
  assert.equal(first.items.find((x) => x.id === 'logs').hideLabel, false);
  assert.equal(first.items.find((x) => x.id === 'group:one').hideLabel, true);
  assert.equal(ui.get(() => true, 1).items.find((x) => x.id === 'settings').hideLabel, undefined);
  assert.equal(ui.get(() => true, 1).displayMode, undefined);
  assert.equal(ui.get(() => true, 2, false).displayModeToggle, undefined);
  await Promise.all([ui.invoke(request, 'local'), ui.invoke(request, 'local')]);
  assert.equal(toggles, 1);
  const next = ui.get();
  assert.equal(next.displayMode, 'expanded');
  assert(next.revision > first.revision);
  assert.equal(next.items.find((x) => x.id === 'settings').iconOnly, true);
  assert.equal(next.items.find((x) => x.id === 'settings').hideLabel, true);
  assert.equal(next.items.find((x) => x.id === 'logs').hideLabel, false);
  assert.equal(next.items.find((x) => x.id === 'logs').iconOnly, false);
  assert.equal(next.items.find((x) => x.id === 'group:one').iconOnly, true);
  assert.equal(next.items.find((x) => x.id === 'ribbon-display-mode').iconOnly, false);
  assert.equal(
    next.items.find((x) => x.id === 'ribbon-display-mode').title,
    ribbonItems([]).find((x) => x.id === 'ribbon-display-mode').title,
  );
  assert.equal(next.items.find((x) => x.id === 'group:one').title, 'グループ');
  assert.equal(JSON.stringify(settings), before);
  assert.equal(nav.state.request, 0);
  assert.deepEqual(
    next.items.map((x) => [x.id, x.actionId]),
    first.items.map((x) => [x.id, x.actionId]),
  );
  await assert.rejects(
    ui.invoke({ ...request, requestId: 'external' }, 'external', async () => {
      throw Error('unexpected dispatch');
    }),
    /リボン/,
  );
  assert.equal(toggles, 1);
  await assert.rejects(
    ui.invoke({ ...request, requestId: 'group-overlay' }, 'local', undefined, {
      groupId: 'group:one',
    }),
  );
  assert.equal(toggles, 1);
});
const { ribbonItems } = require('../out/main/shared/applet-pages');
const { editRibbon, ribbonPlacement } = require('../out/main/shared/ribbon-layout');
test('mode item uses normal placement, name, visibility and group editing without executing navigation', async () => {
  const settings = createDefaultSettings(),
    items = ribbonItems([]),
    id = 'ribbon-display-mode';
  let mode = 'expanded',
    toggles = 0;
  const edit = (operation) => {
    settings.ribbon = editRibbon(
      settings.ribbon,
      ribbonItems([], settings.ribbon.separators, settings.ribbon.groups, settings.ribbon.buttons),
      operation,
    );
  };
  assert.equal(ribbonPlacement(settings.ribbon, id, items), 'bottom');
  edit({ kind: 'updateItem', id, changes: { title: '切り替え' } });
  edit({ kind: 'update', id, changes: { placement: 'top' } });
  assert.equal(ribbonPlacement(settings.ribbon, id, items), 'top');
  const ui = new UiPresentation({
    settings: () => settings,
    applets: () => [],
    dark: () => false,
    navigation: new NavigationCoordinator(() => {
      throw Error('unexpected navigation');
    }),
    execute: async () => {
      throw Error('unexpected command');
    },
    theme: async () => {},
    displayMode: () => mode,
    toggleDisplayMode: () => {
      toggles++;
      mode = mode === 'expanded' ? 'compact' : 'expanded';
    },
  });
  const view = ui.get(),
    button = view.items.find((x) => x.id === id),
    request = { epoch: view.epoch, requestId: 'renamed-mode', actionId: button.actionId };
  assert.equal(button.title, '切り替え');
  assert.equal(button.placement, 'top');
  assert.equal(ui.get(() => true, 2, false).items.find((x) => x.id === id).enabled, false);
  assert.equal(ui.get(() => true, 2, false).items.find((x) => x.id === id).actionId, undefined);
  await ui.invoke(request, 'local');
  assert.equal(mode, 'compact');
  edit({ kind: 'update', id, changes: { visible: false } });
  assert(!ui.get().items.some((x) => x.id === id));
  assert.equal(ui.get().displayModeToggle, undefined);
  await assert.rejects(async () => ui.invoke({ ...request, requestId: 'hidden-mode' }, 'local'));
  edit({ kind: 'update', id, changes: { visible: true } });
  edit({
    kind: 'addGroup',
    id: 'group:mode-test',
    title: 'Modes',
    icon: 'folder',
    expansion: 'temporary',
    placement: 'top',
  });
  edit({ kind: 'moveItem', id, parentId: 'group:mode-test', beforeId: null });
  assert.equal(ui.get().displayModeToggle, undefined);
  await assert.rejects(async () => ui.invoke({ ...request, requestId: 'closed-mode' }, 'local'));
  await ui.invoke({ ...request, requestId: 'group-mode' }, 'local', undefined, {
    groupId: 'group:mode-test',
  });
  assert.equal(toggles, 2);
  assert.equal(mode, 'expanded');
});
