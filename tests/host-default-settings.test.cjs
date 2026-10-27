const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { getKeybindings } = require('../out/main/shared/keybindings');
const {
  notificationCatalog,
  resolveNotificationPolicy,
} = require('../out/main/shared/notification-types');
const { omitSettingDefaults } = require('../out/main/shared/settings-defaults');
const { ribbonItems } = require('../out/main/shared/applet-pages');
const { ribbonPlacement, ribbonPresentation } = require('../out/main/shared/ribbon-layout');

test('fresh host defaults match the supplied behavior without installation history or user-generated IDs', () => {
  const settings = parseSettings(createDefaultSettings());
  assert.equal(settings.gestures.wheelDelayMs, 20);
  assert.equal(settings.gestures.indicatorOpacity, 0.9);
  assert.deepEqual(
    getKeybindings(settings).map(({ command, key }) => ({ command, key })),
    [
      { command: 'appdock.commands.search', key: 'Ctrl+P' },
      { command: 'appdock.settings.open', key: 'Ctrl+,' },
    ],
  );
  assert.deepEqual(
    settings.trayMenu.map((item) => item.command),
    ['appdock.open'],
  );
  assert.deepEqual(settings.trayCommands, ['appdock.open']);
  assert.deepEqual(settings.ribbon.order, [
    'ribbon-display-mode',
    'settings',
    'image-library',
    'notifications',
    'logs',
    'theme',
  ]);
  assert.deepEqual(settings.ribbon.bottom, ['theme', 'logs', 'notifications']);
  const mode = ribbonItems([]).find((item) => item.id === 'ribbon-display-mode');
  assert.equal(ribbonPlacement(settings.ribbon, mode.id, [mode]), 'top');
  assert.equal(ribbonPresentation(settings.ribbon, mode).iconOnly, false);
  for (const ownerId of ['errors', 'warnings', 'updates']) {
    const type = notificationCatalog([]).find((type) => type.ownerId === ownerId);
    const policy = resolveNotificationPolicy(type, settings);
    assert.deepEqual(policy.targets, ['banner']);
    assert.equal(policy.durationSeconds, ownerId === 'updates' ? 6 : null);
  }
  assert.deepEqual(settings.extensions, {});
  assert.deepEqual(settings.gestureDefaultsInitialized, []);
  assert.deepEqual(settings.keybindingDefaultsInitialized ?? [], []);
});

test('all automatic update entry points default off and AI/TTS have no configured endpoint', () => {
  const value = createDefaultSettings();
  assert.equal(value.updates.checkHostOnAboutOpen, false);
  assert.equal(value.updates.checkHostOnStartup, false);
  assert.equal(value.updates.checkAppletsOnStartup, false);
  assert.deepEqual(value.ai.connections, []);
  assert.equal(value.tts.baseUrl, '');
});

test('saved overrides and legacy tray command lists retain their meaning after the default change', () => {
  const raw = {
    schemaVersion: 1,
    updates: { checkHostOnAboutOpen: true, checkHostOnStartup: true },
    gestures: { wheelDelayMs: 0, indicatorOpacity: 0.45 },
    shortcuts: { 'appdock.commands.search': ['Ctrl+Shift+P'] },
    trayCommands: ['example.custom'],
    ribbon: {
      order: ['settings'],
      bottom: [],
      itemOverrides: { 'ribbon-display-mode': { iconOnly: true } },
    },
    notificationPreferences: {
      overrides: [
        {
          ownerKind: 'host',
          ownerId: 'updates',
          typeId: 'available',
          targets: ['windows'],
          durationSeconds: null,
        },
      ],
    },
  };
  const value = parseSettings(raw);
  assert.equal(value.updates.checkHostOnAboutOpen, true);
  assert.equal(value.updates.checkHostOnStartup, true);
  assert.equal(value.gestures.wheelDelayMs, 0);
  assert.equal(value.gestures.indicatorOpacity, 0.45);
  assert.deepEqual(value.shortcuts['appdock.commands.search'], ['Ctrl+Shift+P']);
  assert.equal(value.trayMenu, undefined);
  assert.deepEqual(value.trayCommands, ['example.custom']);
  assert.deepEqual(value.ribbon.order, ['settings']);
  assert.deepEqual(value.ribbon.bottom, []);
  assert.equal(value.ribbon.itemOverrides['ribbon-display-mode'].iconOnly, true);
  assert.deepEqual(value.notificationPreferences, raw.notificationPreferences);
  const roundTrip = parseSettings({
    schemaVersion: 1,
    ...omitSettingDefaults(value, createDefaultSettings()),
  });
  assert.deepEqual(roundTrip, value);
  const empty = parseSettings({ schemaVersion: 1, trayCommands: [] });
  assert.equal(empty.trayMenu, undefined);
  assert.deepEqual(empty.trayCommands, []);
  const custom = parseSettings({
    schemaVersion: 1,
    trayMenu: [{ id: 'user.menu', type: 'command', command: 'example.custom' }],
  });
  assert.equal(custom.trayMenu[0].id, 'user.menu');
});

test('sparse saved ribbon groups remain valid when new root defaults include their children', () => {
  const group = {
    id: 'group:custom',
    title: 'Saved group',
    icon: 'folder',
    expansion: 'persistent',
    children: ['logs'],
  };
  const value = parseSettings({
    schemaVersion: 1,
    ribbon: { groups: [group], order: ['group:custom', 'settings'] },
  });
  assert.deepEqual(value.ribbon.groups, [group]);
  assert(!value.ribbon.bottom.includes('logs'));
  assert.throws(() =>
    parseSettings({
      schemaVersion: 1,
      ribbon: { groups: [group], order: ['group:custom'], bottom: ['logs'] },
    }),
  );
});
