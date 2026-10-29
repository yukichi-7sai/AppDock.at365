const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GlobalHotKeyManager } = require('../out/main/main/core/global-hotkeys.js');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema.js');
const { shortcutFromEvent } = require('../out/main/shared/commands.js');
const { getKeybindings, planKeybindings } = require('../out/main/shared/keybindings');
const { CommandDispatcher } = require('../out/main/main/core/command-dispatcher');

test('legacy Watch global Pause and explicit opt-out survive migration', () => {
  const settings = createDefaultSettings();
  settings.shortcuts['at365.watch.toggle'] = ['Pause'];
  settings.globalShortcutCommands = ['at365.watch.toggle'];
  assert.deepEqual(settings.shortcuts['at365.watch.toggle'], ['Pause']);
  assert.deepEqual(settings.globalShortcutCommands, ['at365.watch.toggle']);
  settings.shortcuts['at365.watch.toggle'] = [];
  settings.globalShortcutCommands = [];
  assert.deepEqual(parseSettings(settings).shortcuts['at365.watch.toggle'], []);
  assert.deepEqual(parseSettings(settings).globalShortcutCommands, []);
  settings.globalShortcutCommands = ['bad id'];
  assert.throws(() => parseSettings(settings), /globalShortcutCommands/);
  assert.equal(
    shortcutFromEvent({
      key: 'Pause',
      code: 'Pause',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    }),
    'Pause',
  );
});

test('registration follows availability, whole-key disable, rebinding, recording suspension and shutdown', async () => {
  const registrations = [];
  const executed = [];
  const dispatcher = new CommandDispatcher(async (id) => executed.push(id), assert.fail);
  const backend = {
    async sync(keys) {
      registrations.push(keys);
      return keys.map((shortcut) => ({ shortcut, registered: true }));
    },
    async close() {
      registrations.push('closed');
    },
  };
  const manager = new GlobalHotKeyManager(
    backend,
    (key) =>
      dispatcher.dispatch(
        'keyboard:' + key,
        planKeybindings(
          getKeybindings(settings),
          key,
          { appFocused: false },
          available.map((id) => ({ id })),
          true,
        ),
      ),
    () => {},
    assert.fail,
  );
  const settings = createDefaultSettings();
  settings.shortcuts['at365.watch.toggle'] = ['Pause'];
  settings.globalShortcutCommands = ['at365.watch.toggle'];
  const available = ['at365.watch.toggle'];
  await manager.sync(settings, []);
  await manager.pressed('Pause');
  assert.deepEqual(executed, []);
  await manager.sync(settings, available);
  await manager.sync(settings, available);
  assert.deepEqual(registrations, [[], ['Pause']]);
  await manager.pressed('Pause');
  assert.deepEqual(executed, available);
  const saved = structuredClone(settings);
  settings.keybindingOptions.enabled = false;
  await manager.sync(settings, available);
  assert.deepEqual(registrations.at(-1), []);
  await manager.pressed('Pause');
  assert.equal(executed.length, 1);
  settings.keybindingOptions.enabled = true;
  await manager.sync(settings, available);
  assert.deepEqual(settings, saved);
  await manager.sync(settings, available, true);
  await manager.pressed('Pause');
  assert.equal(executed.length, 1);
  await manager.sync(settings, available);
  settings.shortcuts['at365.watch.toggle'] = ['Ctrl+F12'];
  await manager.sync(settings, available);
  await manager.pressed('Pause');
  assert.equal(executed.length, 1);
  await manager.pressed('Ctrl+F12');
  assert.equal(executed.length, 2);
  await manager.sync(settings, []);
  await manager.pressed('Ctrl+F12');
  assert.equal(executed.length, 2);
  await manager.close();
  await manager.sync(settings, available);
  assert.equal(registrations.at(-1), 'closed');
});

test('registration conflicts and host failure are visible; distinct accepted callbacks can overlap', async () => {
  let conflict = true;
  const reports = [];
  let calls = 0;
  const finishes = [];
  const dispatcher = new CommandDispatcher(
    async () => {
      calls++;
      await new Promise((resolve) => {
        finishes.push(resolve);
      });
    },
    (error) => reports.push(error),
  );
  const manager = new GlobalHotKeyManager(
    {
      async sync(keys) {
        return keys.map((shortcut) => ({
          shortcut,
          registered: !conflict,
          ...(conflict ? { error: 'already in use' } : {}),
        }));
      },
      async close() {},
    },
    (key) =>
      dispatcher.dispatch(
        'keyboard:' + key,
        planKeybindings(
          getKeybindings(settings),
          key,
          { appFocused: false },
          [{ id: 'at365.watch.toggle' }],
          true,
        ),
      ),
    () => {},
    (error) => reports.push(error),
  );
  const settings = createDefaultSettings();
  settings.shortcuts['at365.watch.toggle'] = ['Pause'];
  settings.globalShortcutCommands = ['at365.watch.toggle'];
  await manager.sync(settings, ['at365.watch.toggle']);
  await manager.pressed('Pause');
  assert.equal(calls, 0);
  assert.match(manager.statuses[0].error, /already in use/);
  conflict = false;
  await manager.sync(settings, ['at365.watch.toggle'], false, true);
  const first = manager.pressed('Pause');
  const second = manager.pressed('Pause');
  assert.equal(calls, 2);
  finishes.forEach((finish) => finish());
  await Promise.all([first, second]);
  manager.failed(new Error('host crashed'));
  assert.equal(manager.statuses[0].registered, false);
  assert.equal(manager.statuses[0].error, 'host crashed');
  await manager.pressed('Pause');
  assert.equal(calls, 2);
  await manager.close();
});
