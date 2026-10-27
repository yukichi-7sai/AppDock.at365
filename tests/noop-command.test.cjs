const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hostCommandsForApplets } = require('../out/main/shared/commands');
const { automationCommands } = require('../out/main/main/core/automation-commands');
const { trayCommandCatalog } = require('../out/main/shared/tray-menu');
const {
  parseKeybindings,
  planKeybindings,
  nativeShortcutInputs,
} = require('../out/main/shared/keybindings');

test('no-op is an available host command in shared UI, tray and public catalogs', () => {
  for (const catalog of [
    hostCommandsForApplets([]),
    trayCommandCatalog([]),
    automationCommands([]),
  ]) {
    const commands = catalog.filter((command) => command.id === 'appdock.noop');
    assert.equal(commands.length, 1);
    assert.equal(commands[0].title, '何もしない');
    assert.equal(commands[0].available, true);
  }
});

test('no-op uses existing conditional input blocking and respects pass-through and disabled bindings', () => {
  const catalog = hostCommandsForApplets([]);
  const available = catalog.map((command) => command.id);
  const environment = { browsers: [], requireChromiumWindowClass: true };
  const binding = {
    id: 'noop',
    command: 'appdock.noop',
    key: 'Ctrl+Alt+F10',
    enabled: true,
    when: { scope: 'exe', appletIds: [], processes: ['test-target'] },
  };
  const context = {
    appFocused: false,
    target: { window: '42', processName: 'test-target.exe', desktop: false },
  };
  for (const block of [undefined, true, false]) {
    const rows = parseKeybindings([
      { ...binding, ...(block === undefined ? {} : { blockOriginalInput: block }) },
    ]);
    assert.deepEqual(
      planKeybindings(rows, binding.key, context, catalog, true, 'all', environment).commands,
      ['appdock.noop'],
    );
    const input = nativeShortcutInputs(rows, available, environment)[0];
    assert.equal(input.blockOriginalInput, block !== false);
    assert.equal(input.conditions[0].blockOriginalInput, block !== false);
    assert.deepEqual(
      planKeybindings(
        rows,
        binding.key,
        { ...context, target: { ...context.target, processName: 'other.exe' } },
        catalog,
        true,
        'all',
        environment,
      ).commands,
      [],
    );
    const disabled = parseKeybindings([{ ...rows[0], enabled: false }]);
    assert.deepEqual(nativeShortcutInputs(disabled, available, environment), []);
  }
});
