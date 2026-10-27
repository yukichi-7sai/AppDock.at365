const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const {
  getTrayMenu,
  parseTrayMenu,
  resolveTrayMenu,
  trayMenuCommandIds,
  gesturePauseCommand,
} = require('../out/main/shared/tray-menu');
const command = (id, cmd = id) => ({ id, type: 'command', command: cmd });
const group = (children) => ({ id: 'group', type: 'group', title: '好きな名前', children });
test('tray layout migration preserves displayed order, unknown commands and opt-ins once', () => {
  const settings = createDefaultSettings();
  delete settings.trayMenu;
  settings.trayCommands = ['appdock.quit', 'missing.run', 'a.second', 'appdock.open', 'a.first'];
  const original = structuredClone(settings);
  const items = getTrayMenu(settings, [
    { id: 'a', name: 'Applet A', commands: [{ id: 'a.first' }, { id: 'a.second' }] },
  ]);
  assert.deepEqual(trayMenuCommandIds(items), [
    'a.first',
    'a.second',
    'appdock.open',
    'missing.run',
    gesturePauseCommand,
  ]);
  assert.equal(items[0].title, 'Applet A');
  assert.deepEqual(settings, original);
  const saved = parseSettings({ ...settings, trayMenu: items });
  assert.deepEqual(getTrayMenu(saved, []), items);
  assert.deepEqual(getTrayMenu({ ...settings, trayMenu: [] }, []), []);
  assert.deepEqual(parseSettings({ ...settings, trayMenu: [] }).trayCommands, []);
});
test('tray schema rejects invalid structure, fixed commands, duplicate ids, nesting and excessive size', () => {
  for (const invalid of [
    null,
    {},
    [command('bad id')],
    [command('same'), command('same')],
    [command('x', 'appdock.quit')],
    [command('x', 'appdock.settings.open')],
    [group([group([])])],
    [{ ...group([]), title: ' ' }],
    [{ ...group([]), title: 'x'.repeat(81) }],
    Array.from({ length: 1501 }, (_, i) => command('c' + i)),
  ])
    assert.throws(() => parseTrayMenu(invalid));
  const duplicateCommand = [command('a', 'some.command'), group([command('b', 'some.command')])];
  assert.deepEqual(parseTrayMenu(duplicateCommand), duplicateCommand);
  assert.equal(parseTrayMenu([{ ...group([]), title: ' 名前 ' }])[0].title, '名前');
});

test('maximum legacy opt-ins migrate without exceeding the new layout or derived ID limits', () => {
  const settings = createDefaultSettings();
  delete settings.trayMenu;
  const applets = Array.from({ length: 500 }, (_, i) => ({
    id: `applet${i}`,
    name: `Applet ${i}`,
    commands: [{ id: `applet${i}.run` }],
  }));
  settings.trayCommands = applets.map((a) => a.commands[0].id);
  settings.trayMenu = getTrayMenu(settings, applets);
  assert.equal(parseSettings(settings).trayCommands.length, 501);
  assert.equal(settings.trayMenu.filter((item) => item.type === 'group').length, 500);
});
test('tray renderer preserves custom grouping, resolves current command titles and availability, normalizes separators', () => {
  const sep = (id) => ({ id, type: 'separator' });
  const layout = [
    sep('start'),
    group([sep('s1'), command('run', 'a.run'), sep('s2')]),
    sep('one'),
    sep('two'),
    { ...group([]), id: 'empty' },
    command('missing'),
    sep('last'),
  ];
  const rendered = resolveTrayMenu(layout, [
    { id: 'a.run', title: '変更後の名前', available: false },
  ]);
  assert.deepEqual(
    rendered.map((i) => i.type),
    ['group', 'separator', 'command'],
  );
  assert.equal(rendered[0].title, '好きな名前');
  assert.equal(rendered[0].children.length, 1);
  assert.equal(rendered[0].children[0].title, '変更後の名前');
  assert.equal(rendered[0].children[0].enabled, false);
  assert.equal(rendered[2].title, 'missing');
  assert.equal(rendered[2].enabled, false);
  assert.equal(layout.length, 7);
});
