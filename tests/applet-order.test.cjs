const { test } = require('node:test');
const assert = require('node:assert/strict');
const { orderApplets, moveApplet } = require('../out/main/shared/applet-order.js');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema.js');
const { getKeybindings } = require('../out/main/shared/keybindings.js');

test('Applet display order tolerates absent IDs and appends new file/Web applets without mutating discovery', () => {
  const discovered = ['file.a', 'web.new', 'file.b', 'new.file'].map((id) => ({ id }));
  assert.deepEqual(
    orderApplets(discovered, ['missing.id', 'file.b', 'file.a']).map((a) => a.id),
    ['file.b', 'file.a', 'web.new', 'new.file'],
  );
  assert.deepEqual(
    discovered.map((a) => a.id),
    ['file.a', 'web.new', 'file.b', 'new.file'],
  );
  assert.deepEqual(moveApplet(['file.a', 'file.b', 'web.new'], 'web.new', 'file.a'), [
    'web.new',
    'file.a',
    'file.b',
  ]);
  assert.deepEqual(moveApplet(['file.a', 'file.b'], 'missing', 'file.a'), ['file.a', 'file.b']);
});

test('order persists through schema parsing, upgrades old settings, and never changes keybinding execution order', () => {
  const settings = createDefaultSettings();
  const bindings = getKeybindings(settings);
  settings.appletOrder = ['web.new', 'file.b', 'file.a'];
  const parsed = parseSettings(settings);
  assert.deepEqual(parsed.appletOrder, settings.appletOrder);
  assert.deepEqual(getKeybindings(parsed), bindings);
  delete settings.appletOrder;
  assert.deepEqual(parseSettings(settings).appletOrder, []);
  for (const invalid of [null, 'file.a', ['file.a', 'file.a'], ['../escape'], ['constructor']]) {
    assert.throws(() => parseSettings({ ...settings, appletOrder: invalid }), /appletOrder/);
  }
});
