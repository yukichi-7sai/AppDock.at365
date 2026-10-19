const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaultRibbon, parseRibbon, ribbonItems } = require('../out/main/shared/applet-pages');
const { editRibbon, ribbonPresentation } = require('../out/main/shared/ribbon-layout');
const { UiPresentation, NavigationCoordinator } = require('../out/main/main/core/ui-presentation');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const edit = (layout, op) =>
  editRibbon(layout, ribbonItems([], layout.separators, layout.groups, layout.buttons), op);
const addGroup = {
  kind: 'addGroup',
  id: 'group:color',
  title: 'Color',
  icon: 'folder',
  expansion: 'persistent',
  placement: 'top',
};

test('group color is optional, normalized, removable, and rejected atomically when malformed', () => {
  let layout = edit(defaultRibbon(), addGroup);
  assert.equal(layout.groups[0].color, undefined);
  layout = edit(layout, { kind: 'updateGroup', id: addGroup.id, changes: { color: '#ab12cd' } });
  assert.equal(layout.groups[0].color, '#AB12CD');
  assert.deepEqual(
    edit(layout, { kind: 'updateGroup', id: addGroup.id, changes: { color: '#ab12cd' } }),
    layout,
  );
  const original = structuredClone(layout);
  for (const color of ['red', '#abc', '#12345678', 'var(--accent)', 5, {}])
    assert.throws(() => edit(layout, { kind: 'updateGroup', id: addGroup.id, changes: { color } }));
  assert.deepEqual(layout, original);
  layout = edit(layout, { kind: 'updateGroup', id: addGroup.id, changes: { color: null } });
  assert.equal(layout.groups[0].color, null);
});

const addButton = {
  kind: 'addButton',
  id: 'button:run',
  title: 'Run',
  icon: 'clock',
  commandId: 'fixture.run',
  placement: 'top',
};

test('ribbon page projection and partial JSON round-trip all new fields while preserving other settings', () => {
  const { settingsProjection, applySettingsJson } = require('../out/main/shared/settings-catalog');
  const current = createDefaultSettings();
  current.ribbon = edit(defaultRibbon(), addButton);
  current.ribbon = edit(current.ribbon, {
    kind: 'addSeparator',
    id: 'separator:roundtrip',
    placement: 'top',
  });
  current.ribbon = edit(current.ribbon, {
    kind: 'updateSeparator',
    id: 'separator:roundtrip',
    changes: { title: 'Persistent name' },
  });
  current.ribbon.rightClickCommand = 'fixture.run';
  const page = { id: 'ribbon', kind: 'host', json: true };
  const projected = settingsProjection(current, page, []);
  assert.deepEqual(projected.ribbon, current.ribbon);
  projected.ribbon.buttons[0].title = 'JSON name';
  const saved = applySettingsJson(current, page, [], JSON.stringify(projected));
  assert.equal(saved.ribbon.buttons[0].title, 'JSON name');
  assert.equal(saved.ribbon.separatorTitles['separator:roundtrip'], 'Persistent name');
  assert.equal(saved.ribbon.rightClickCommand, 'fixture.run');
  assert.deepEqual(saved.host, current.host);
});
test('command button identity, placement and definitions persist independently of the target', () => {
  let layout = edit(defaultRibbon(), addButton);
  layout = edit(layout, { ...addButton, id: 'button:other' });
  layout = edit(layout, addGroup);
  layout = edit(layout, {
    kind: 'moveItem',
    id: addButton.id,
    parentId: addGroup.id,
    beforeId: null,
  });
  layout = edit(layout, {
    kind: 'updateButton',
    id: addButton.id,
    changes: { title: 'Renamed', icon: 'mail', commandId: 'missing.target', iconOnly: true },
  });
  layout = parseRibbon(JSON.parse(JSON.stringify(layout)));
  assert.equal(layout.buttons[0].id, addButton.id);
  assert.equal(layout.buttons[0].commandId, 'missing.target');
  assert.equal(layout.groups[0].children[0], addButton.id);
  layout = edit(layout, { kind: 'ungroup', id: addGroup.id });
  assert(layout.order.includes(addButton.id));
  layout = edit(layout, { kind: 'removeButton', id: addButton.id });
  assert(!layout.order.includes(addButton.id));
  assert.equal(layout.buttons[0].id, 'button:other');
  layout = edit(layout, { kind: 'setRightClickCommand', commandId: 'fixture.run' });
  layout = edit(layout, { kind: 'reset' });
  assert.deepEqual(layout.buttons, []);
  assert.equal(layout.rightClickCommand, 'fixture.run');
});

test('button validation rejects dangling IDs, malformed definitions and excess counts without mutation', () => {
  const layout = edit(defaultRibbon(), addButton);
  for (const changes of [
    { title: '' },
    { title: 'bad\nname' },
    { icon: 'unknown' },
    { commandId: '../bad' },
    { iconOnly: 'yes' },
  ])
    assert.throws(() => edit(layout, { kind: 'updateButton', id: addButton.id, changes }));
  assert.throws(() => edit(layout, addButton));
  assert.throws(() => parseRibbon({ ...defaultRibbon(), order: ['button:missing'] }));
  assert.throws(() => parseRibbon({ ...layout, buttons: [...layout.buttons, ...layout.buttons] }));
  assert.throws(() =>
    parseRibbon({
      ...layout,
      buttons: Array.from({ length: 101 }, (_, i) => ({
        ...layout.buttons[0],
        id: 'button:b' + i,
      })),
    }),
  );
  assert.throws(() => edit(layout, { kind: 'setRightClickCommand', commandId: '' }));
  assert.throws(() =>
    edit(layout, { kind: 'updateItem', id: addButton.id, changes: { title: 'Wrong editor' } }),
  );
  assert.equal(layout.buttons[0].title, 'Run');
});

function commandPresentation() {
  const settings = createDefaultSettings();
  settings.ribbon = edit(defaultRibbon(), addButton);
  const commands = [{ id: 'fixture.run', title: 'Fixture', extension: 'Fixture', available: true }];
  const calls = [];
  const navigation = new NavigationCoordinator(() => {});
  let execute = async (id) => {
    calls.push(id);
  };
  const ui = new UiPresentation({
    settings: () => settings,
    applets: () => [],
    commands: () => commands,
    dark: () => false,
    avatar: () => undefined,
    navigation,
    execute: (id) => execute(id),
    theme: async () => {},
  });
  return {
    settings,
    commands,
    calls,
    navigation,
    ui,
    execute: (fn) => {
      execute = fn;
    },
  };
}

test('command buttons and right-click share current availability without changing selected page', async () => {
  const f = commandPresentation();
  let view = f.ui.get();
  const item = view.items.find((i) => i.id === addButton.id);
  assert.equal(item.kind, 'button');
  assert.equal(item.enabled, true);
  assert(!JSON.stringify(view).includes('fixture.run'), 'opaque view does not disclose target IDs');
  const request = { epoch: view.epoch, actionId: item.actionId, requestId: 'first' };
  await f.ui.invoke(request, 'local');
  await f.ui.invoke(request, 'local');
  assert.deepEqual(f.calls, ['fixture.run']);
  assert.equal(f.navigation.state.route, 'home');
  f.settings.ribbon.rightClickCommand = 'fixture.run';
  await f.ui.invoke({ ...request, actionId: view.contextActionId, requestId: 'context' }, 'local');
  assert.equal(f.calls.length, 2);
  const revision = f.ui.get().revision;
  f.commands[0].available = false;
  view = f.ui.get();
  assert(view.revision > revision);
  assert.equal(view.contextActionEnabled, false);
  assert.equal(view.items.find((i) => i.id === addButton.id).enabled, false);
  await assert.rejects(f.ui.invoke({ ...request, requestId: 'stopped' }, 'local'));
  await assert.rejects(
    f.ui.invoke(
      { ...request, actionId: view.contextActionId, requestId: 'stopped-context' },
      'local',
    ),
  );
  assert.equal(f.calls.length, 2);
  assert.equal(f.ui.get(undefined, 1).contextActionEnabled, undefined);
});

test('running UI commands reject reentry and a changed pending target cannot run the old target', async () => {
  const f = commandPresentation();
  let release;
  f.execute(
    async () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const view = f.ui.get(),
    item = view.items.find((i) => i.id === addButton.id);
  const request = { epoch: view.epoch, actionId: item.actionId, requestId: 'running' };
  const first = f.ui.invoke(request, 'local');
  await Promise.resolve();
  await assert.rejects(f.ui.invoke({ ...request, requestId: 'reentrant' }, 'local'), /実行中/);
  release();
  await first;
  const stale = f.ui.invoke({ ...request, requestId: 'changed' }, 'local');
  f.settings.ribbon.buttons[0].commandId = 'another.target';
  await assert.rejects(stale, /target changed/);
});

test('external read and dry-run redact nonpublic targets and never execute their definitions', (t) => {
  const fs = require('node:fs'),
    path = require('node:path');
  const { SettingsStore } = require('../out/main/main/core/settings');
  const { RibbonCommands } = require('../out/main/main/core/ribbon-commands');
  const { SettingsCommands } = require('../out/main/main/core/settings-commands');
  const dir = fs.mkdtempSync(path.resolve('.artifacts/ribbon-customization-unit-'));
  const store = new SettingsStore(path.join(dir, 'settings.json'), path.join(dir, 'backups'));
  store.load();
  t.after(() => store.close());
  store.save(
    {
      ...store.value,
      ribbon: { ...edit(defaultRibbon(), addButton), rightClickCommand: 'private.secret' },
    },
    store.revision,
  );
  const revisions = new SettingsCommands({
    settings: store,
    save: (v, r) => store.save(v, r),
    applets: () => [],
  });
  const api = new RibbonCommands({
    settings: store,
    settingsCommands: revisions,
    save: (v, r) => store.save(v, r),
  });
  const before = fs.readFileSync(store.file, 'utf8');
  const read = api.get([]);
  assert(!JSON.stringify(read).includes('fixture.run'));
  assert(!JSON.stringify(read).includes('private.secret'));
  const dry = api.execute(
    {
      operations: [{ kind: 'updateButton', id: addButton.id, changes: { title: 'Updated' } }],
      expectedRevision: read.revision,
      dryRun: true,
    },
    [],
  );
  assert(!JSON.stringify(dry).includes('fixture.run'));
  assert.equal(fs.readFileSync(store.file, 'utf8'), before);
  assert.equal(
    api.get().layout.buttons[0].commandId,
    'fixture.run',
    'local edit retains complete data',
  );
});

test('temporary command groups close before executing and reject changed button configurations', async () => {
  const { RibbonGroupSession } = require('../out/main/main/core/ribbon-group-session');
  const f = commandPresentation();
  f.settings.ribbon = edit(f.settings.ribbon, { ...addGroup, expansion: 'temporary' });
  f.settings.ribbon = edit(f.settings.ribbon, {
    kind: 'moveItem',
    id: addButton.id,
    parentId: addGroup.id,
    beforeId: null,
  });
  const session = new RibbonGroupSession(
    f.ui,
    addGroup.id,
    { x: 0, y: 0, width: 20, height: 20 },
    (e) => {
      throw e;
    },
  );
  let closed = false,
    calls = 0;
  session.onClosed(() => {
    closed = true;
  });
  f.execute(async () => {
    assert.equal(closed, true);
    calls++;
  });
  const action = {
    id: session.id,
    type: 'ribbonChoose',
    actionId: session.snapshot().content.items[0].actionId,
    requestId: 'temporary',
  };
  await session.act(action);
  assert.equal(calls, 1);
  await assert.rejects(session.act(action));
  const changed = new RibbonGroupSession(
    f.ui,
    addGroup.id,
    { x: 0, y: 0, width: 20, height: 20 },
    () => {},
  );
  let invalidated = false;
  changed.onClosed(() => {
    invalidated = true;
  });
  f.settings.ribbon.buttons[0].commandId = 'missing.target';
  changed.snapshot();
  assert.equal(invalidated, true);
  assert.equal(calls, 1);
});

test('separator titles survive movement and serialization, and are cleared independently', () => {
  let layout = edit(defaultRibbon(), {
    kind: 'addSeparator',
    id: 'separator:work',
    placement: 'top',
  });
  layout = edit(layout, {
    kind: 'updateSeparator',
    id: 'separator:work',
    changes: { title: '  Work  ' },
  });
  layout = parseRibbon(JSON.parse(JSON.stringify(layout)));
  const item = ribbonItems([], layout.separators).find((i) => i.id === 'separator:work');
  assert.equal(ribbonPresentation(layout, item).title, 'Work');
  layout = edit(layout, addGroup);
  layout = edit(layout, { kind: 'moveItem', id: item.id, parentId: addGroup.id, beforeId: null });
  assert.equal(layout.separatorTitles[item.id], 'Work');
  layout = edit(layout, { kind: 'updateSeparator', id: item.id, changes: { title: '' } });
  assert.equal(ribbonPresentation(layout, item).title, 'セパレーター 1');
  layout = edit(layout, { kind: 'updateSeparator', id: item.id, changes: { title: 'Named' } });
  layout = edit(layout, { kind: 'removeSeparator', id: item.id });
  assert.deepEqual(layout.separatorTitles, {});
  assert.deepEqual(layout.groups[0].children, []);
  assert.throws(() => parseRibbon({ ...layout, separatorTitles: { 'separator:missing': 'No' } }));
  for (const title of ['x'.repeat(81), 'bad\nname', 42])
    assert.throws(() =>
      edit(edit(defaultRibbon(), { kind: 'addSeparator', id: item.id, placement: 'top' }), {
        kind: 'updateSeparator',
        id: item.id,
        changes: { title },
      }),
    );
});

test('only schema 2 groups project decoration color and renamed separators', () => {
  const settings = createDefaultSettings();
  settings.ribbon = edit(defaultRibbon(), { ...addGroup, color: '#123abc' });
  settings.ribbon = edit(settings.ribbon, {
    kind: 'moveItem',
    id: 'home',
    parentId: addGroup.id,
    beforeId: null,
  });
  const presentation = new UiPresentation({
    settings: () => settings,
    applets: () => [],
    dark: () => false,
    avatar: () => undefined,
    navigation: new NavigationCoordinator(
      async () => {},
      () => {},
    ),
    execute: async () => {},
    theme: async () => {},
    expanded: () => true,
  });
  assert.equal(presentation.get().items.find((i) => i.id === addGroup.id).color, '#123ABC');
  assert.equal(
    presentation.get(undefined, 1).items.find((i) => i.id === addGroup.id).color,
    undefined,
  );
});
