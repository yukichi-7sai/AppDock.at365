const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  commandSelectionCatalog,
  filterCommandSelection,
} = require('../out/main/shared/command-selection');
const command = (id, other = {}) => ({
  id,
  title: id,
  extension: '同じ提供元名',
  extensionId: 'fixture.one',
  available: true,
  ...other,
});
test('selection preserves caller order and unavailable commands, filters hidden commands, and leaves inputs unchanged', () => {
  const commands = [
    command('a'),
    command('b', { available: false }),
    command('c', { hidden: true }),
    command('deleted', { available: false, missing: true }),
  ];
  const pins = ['missing', 'b'];
  const before = JSON.stringify({ commands, pins });
  const catalog = commandSelectionCatalog(commands, pins);
  assert.deepEqual(
    catalog.map((x) => x.command.id),
    ['b', 'a'],
  );
  assert.equal(catalog[0].command.available, false);
  assert.deepEqual(
    filterCommandSelection(catalog, '', 'favorites').map((x) => x.command.id),
    ['b'],
  );
  assert.equal(JSON.stringify({ commands, pins }), before);
});
test('search combines normalized terms with stable provider IDs and resolves description links without actions', () => {
  const catalog = commandSelectionCatalog(
    [
      command('first', { title: 'ＡＢＣ 設定', description: '[command:target] を表示' }),
      command('second', { title: 'ABC 設定', extensionId: 'fixture.two' }),
      command('target', { title: '通知センター', extensionId: null }),
      command('custom', { customDefinitionId: 'custom-one', extensionId: null }),
    ],
    [],
  );
  assert.deepEqual(
    filterCommandSelection(catalog, 'abc　通知', 'applet:fixture.one').map((x) => x.command.id),
    ['first'],
  );
  assert.deepEqual(
    filterCommandSelection(catalog, '', 'applet:fixture.two').map((x) => x.command.id),
    ['second'],
  );
  assert.deepEqual(
    filterCommandSelection(catalog, '', 'custom').map((x) => x.command.id),
    ['custom'],
  );
  assert.deepEqual(
    filterCommandSelection(catalog, '', 'host').map((x) => x.command.id),
    ['target'],
  );
  assert.equal(filterCommandSelection(catalog, 'missing', 'all').length, 0);
});
test('large catalogs remain fully selectable and reflect removed commands on the next catalog', () => {
  const commands = Array.from({ length: 10050 }, (_, i) => command('fixture.' + i));
  const catalog = commandSelectionCatalog(commands, []);
  assert.equal(filterCommandSelection(catalog, '', 'all').length, 10050);
  assert.equal(
    filterCommandSelection(catalog, 'fixture.10049', 'all')[0].command.id,
    'fixture.10049',
  );
  assert.equal(
    filterCommandSelection(
      commandSelectionCatalog(commands.slice(0, -1), []),
      'fixture.10049',
      'all',
    ).length,
    0,
  );
});
