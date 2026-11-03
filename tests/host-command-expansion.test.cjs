const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hostCommands, hostCommandsForApplets } = require('../out/main/shared/commands');
const { hostSettingDefinitions } = require('../out/main/shared/host-settings');
const {
  hostToggleSettings,
  hostToggleCommand,
} = require('../out/main/shared/host-toggle-settings');
const { applyHostToggle } = require('../out/main/shared/host-toggle-apply');
const { automationCommands } = require('../out/main/main/core/automation-commands');
const { appletManagementCommands } = require('../out/main/shared/applet-management');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { HostCommandSession } = require('../out/main/main/core/host-command-session');
const { InputCaptureManager } = require('../out/main/main/core/gestures');

test('all host commands include descriptions, keep stable IDs and generate all ordinary booleans', () => {
  assert.equal(new Set(hostCommands.map((c) => c.id)).size, hostCommands.length);
  for (const command of [
    ...hostCommandsForApplets([{ id: 'test.applet', displayName: 'Example' }]),
    ...appletManagementCommands([
      { id: 'test.applet', displayName: 'Example', enabled: false, state: 'stopped' },
    ]),
  ]) {
    assert(command.description?.trim(), command.id);
    assert(!command.description.includes('{{'), command.id);
  }
  for (const field of hostSettingDefinitions.filter((field) => field.type === 'boolean'))
    for (const action of ['on', 'off', 'toggle'])
      assert(
        hostCommands.some((c) => c.id === `appdock.settings.${field.key}.${action}`),
        field.key,
      );
  assert(hostCommands.some((c) => c.id === 'appdock.gestures.togglePause'));
  const published = automationCommands([]);
  for (const id of [
    'appdock.input.pause',
    'appdock.window.hide',
    'appdock.settings.runAsAdministrator.on',
    'appdock.settings.touchpadGestures.enabled.on',
  ])
    assert(!published.some((c) => c.id === id), id);
});

test('specialized setting commands preserve bindings and unrelated values; defaults match the settings schema', () => {
  const settings = createDefaultSettings();
  settings.gestures.distance = 77;
  settings.updates.startupDelaySeconds = 17;
  const original = structuredClone(settings);
  for (const field of hostToggleSettings) {
    assert.equal(createDefaultSettings()[field.section][field.property], field.default, field.key);
    for (const action of ['on', 'off', 'toggle']) {
      const command = hostToggleCommand(`appdock.settings.${field.key}.${action}`);
      assert.equal(command.field.key, field.key);
      const result = parseSettings(applyHostToggle(settings, command.field, command.action));
      assert.equal(
        result[field.section][field.property],
        action === 'toggle' ? !settings[field.section][field.property] : action === 'on',
      );
      result[field.section][field.property] = settings[field.section][field.property];
      assert.deepEqual(result, parseSettings(settings), field.key);
      assert.deepEqual(settings, original);
    }
  }
  assert.equal(hostToggleCommand('appdock.settings.unknown.toggle'), undefined);
});

test('aggregate input pause preserves independent pauses and saved settings remain separate', () => {
  const state = new HostCommandSession(() => {});
  state.setInput('mouse', 'on');
  state.setInput('all', 'on');
  for (const kind of ['mouse', 'keyboard', 'touchpad']) assert(state.inputPaused(kind));
  state.setInput('all', 'off');
  assert(state.inputPaused('mouse'));
  assert(!state.inputPaused('keyboard'));
  assert(!state.inputPaused('touchpad'));
  state.setInput('mouse', 'off');
  state.setInput('mouse', 'off');
  assert(!state.inputPaused('mouse'));
  state.setInput('keyboard', 'toggle');
  assert(state.inputPaused('keyboard'));
  const restarted = new HostCommandSession(() => {});
  for (const kind of ['mouse', 'keyboard', 'touchpad', 'all']) assert(!restarted.inputPaused(kind));
  state.dispose();
  restarted.dispose();
});

test('notification pause extends, expires, resumes and never survives a new session', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const changes = [];
  const state = new HostCommandSession(() => changes.push(state.notificationsPaused));
  state.setNotifications('on');
  assert.equal(state.notificationsUntil, 1801000);
  t.mock.timers.tick(900000);
  state.setNotifications('on');
  assert.equal(state.notificationsUntil, 2701000);
  t.mock.timers.tick(1799999);
  assert(state.notificationsPaused);
  t.mock.timers.tick(1);
  assert(!state.notificationsPaused);
  assert.equal(changes.at(-1), false);
  state.setNotifications('toggle');
  state.setNotifications('toggle');
  assert(!state.notificationsPaused);
  state.setNotifications('on');
  state.dispose();
  assert(!new HostCommandSession(() => {}).notificationsPaused);
});

test('input pause removes only its native inputs, rejects stale delivery, keeps dialog keys and restores bindings', async () => {
  const settings = createDefaultSettings();
  const payloads = [],
    presses = [];
  const manager = new InputCaptureManager(
    'unused',
    () => ({
      settings,
      context: { appFocused: false, window: '' },
      commands: [],
      recording: false,
    }),
    {},
    async () => {},
    () => {},
    assert.fail,
    {
      ownership: async () => {},
      applied() {},
      pressed: (press) => presses.push(press),
    },
  );
  manager.peer = {
    closed: false,
    request: async (_method, payload) => {
      payloads.push(payload);
      return payload.shortcuts.map(({ shortcut }) => ({
        shortcut,
        registered: true,
        inputKeys: [shortcut],
      }));
    },
  };
  // F13 is only a simulated touchpad bridge input; this fixture never registers or sends OS keys.
  await manager.syncShortcuts([{ shortcut: 'Ctrl+Shift+F11', blockOriginalInput: true }]);
  await manager.syncTouchpad(
    [{ shortcut: 'F13', owner: 'touchpad:three.tap', blockOriginalInput: true }],
    ['F13'],
  );
  const original = structuredClone(settings),
    before = payloads.at(-1);
  await manager.setInputPaused(true, false, false);
  assert.equal(payloads.at(-1).shortcutRevision, before.shortcutRevision);
  assert.deepEqual(payloads.at(-1).shortcuts, before.shortcuts);
  await manager.setInputPaused(false, true, false);
  assert.deepEqual(
    payloads.at(-1).shortcuts.map((i) => i.shortcut),
    ['F13'],
  );
  assert.equal(payloads.at(-1).gestures.enabled, true);
  assert(payloads.at(-1).dialogShortcuts.includes('Enter'));
  await manager.event('shortcuts.pressed', {
    revision: before.shortcutRevision,
    shortcuts: ['Ctrl+Shift+F11'],
    window: '1',
    context: '',
  });
  assert.deepEqual(presses, []);
  await manager.setInputPaused(true, false, true);
  assert.deepEqual(
    payloads.at(-1).shortcuts.map((i) => i.shortcut),
    ['Ctrl+Shift+F11'],
  );
  assert.equal(payloads.at(-1).gestures.enabled, false);
  await manager.setInputPaused(false, false, false);
  assert.deepEqual(
    payloads.at(-1).shortcuts.map((i) => i.shortcut),
    ['Ctrl+Shift+F11', 'F13'],
  );
  assert.deepEqual(settings, original);
});
