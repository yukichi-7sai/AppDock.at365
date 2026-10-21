const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSettings, createDefaultSettings } = require('../out/main/shared/settings-schema.js');
const {
  normalizeShortcut,
  shortcutFromEvent,
  rankCommands,
  movePinnedCommand,
} = require('../out/main/shared/commands.js');
test('legacy settings gain Ctrl+P and pins without creating a host profile', () => {
  const original = {
    schemaVersion: 1,
    host: { theme: 'light', closeToTray: false, notifications: false, startMinimized: true },
    extensions: { 'test.custom': { enabled: true, settings: { answer: 42 } } },
  };
  const result = parseSettings(original);
  assert.deepEqual(result.extensions, original.extensions);
  assert.deepEqual(result.host, {
    theme: 'light',
    zoomFactor: 1,
    accentColor: 'mint',
    customAccentDark: '#217a65',
    customAccentLight: '#e1f3ec',
    showHints: true,
    soundEnabled: true,
    closeToTray: false,
    startMinimized: true,
    trayClickCommand: 'appdock.open',
    trayDoubleClickCommand: null,
    hardwareAcceleration: false,
    shellProviders: {},
    startAtLogon: false,
    runAsAdministrator: false,
  });
  assert.equal(result.shortcuts['appdock.commands.search'][0], 'Ctrl+P');
  assert.deepEqual(result.pinnedCommands, []);
  assert.equal('profile' in result, false);
  assert.equal(original.shortcuts, undefined);
});
test('sound playback defaults on for missing settings and preserves explicit off', () => {
  const settings = createDefaultSettings();
  assert.equal(settings.host.soundEnabled, true);
  delete settings.host.soundEnabled;
  settings.host.unknownFutureSetting = 'preserved';
  assert.equal(parseSettings(settings).host.soundEnabled, true);
  assert.equal(settings.host.soundEnabled, undefined);
  settings.host.soundEnabled = false;
  const parsed = parseSettings(settings);
  assert.equal(parsed.host.soundEnabled, false);
  assert.equal(parsed.host.unknownFutureSetting, 'preserved');
  for (const invalid of [null, 0, 1, 'false', {}, []])
    assert.throws(
      () => parseSettings({ ...settings, host: { ...settings.host, soundEnabled: invalid } }),
      /soundEnabled/,
    );
});
test('general defaults keep close-to-tray on and acceleration off while preserving explicit values', () => {
  const settings = createDefaultSettings();
  assert.equal(settings.host.closeToTray, true);
  assert.equal(settings.host.hardwareAcceleration, false);
  delete settings.host.hardwareAcceleration;
  assert.equal(parseSettings(settings).host.hardwareAcceleration, false);
  assert.equal(settings.host.hardwareAcceleration, undefined);
  settings.host.hardwareAcceleration = true;
  assert.equal(parseSettings(settings).host.hardwareAcceleration, true);
  settings.host.hardwareAcceleration = false;
  assert.equal(parseSettings(settings).host.hardwareAcceleration, false);
  for (const invalid of [null, 0, 1, 'false', {}, []])
    assert.throws(
      () =>
        parseSettings({ ...settings, host: { ...settings.host, hardwareAcceleration: invalid } }),
      /hardwareAcceleration/,
    );
});
test('shortcut normalization, duplicate detection, disabling and persisted unknown commands', () => {
  assert.equal(normalizeShortcut(' shift + control + p '), 'Ctrl+Shift+P');
  assert.equal(normalizeShortcut('ctrl+,'), 'Ctrl+,');
  assert.equal(normalizeShortcut('F12'), 'F12');
  assert.equal(normalizeShortcut('P'), 'P');
  assert.equal(normalizeShortcut(' pause '), 'Pause');
  assert.equal(normalizeShortcut('shift+Pause'), 'Shift+Pause');
  assert.throws(() => normalizeShortcut('Ctrl+Ctrl+P'), /修飾/);
  const settings = createDefaultSettings();
  settings.shortcuts['test.extension.run'] = ['Ctrl+Alt+R'];
  assert.deepEqual(parseSettings(settings).shortcuts['test.extension.run'], ['Ctrl+Alt+R']);
  settings.shortcuts['test.extension.run'] = ['Ctrl+P'];
  assert.throws(() => parseSettings(settings), /重複/);
  settings.shortcuts['appdock.commands.search'] = [];
  assert.deepEqual(parseSettings(settings).shortcuts['appdock.commands.search'], []);
});
test('keyboard matching ignores IME/modifier keys and canonicalizes shifted digits and comma', () => {
  const event = {
    key: 'p',
    code: 'KeyP',
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  };
  assert.equal(shortcutFromEvent(event), 'Ctrl+P');
  assert.equal(shortcutFromEvent({ ...event, isComposing: true }), null);
  assert.equal(shortcutFromEvent({ ...event, key: 'Control' }), null);
  assert.equal(
    shortcutFromEvent({ ...event, key: '!', code: 'Digit1', shiftKey: true }),
    'Ctrl+Shift+1',
  );
  assert.equal(shortcutFromEvent({ ...event, key: ',', code: 'Comma' }), 'Ctrl+,');
});
test('pins rank commands without mutating source and reorder around inactive or filtered commands', () => {
  const commands = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(
    rankCommands(commands, ['c', 'a']).map((c) => c.id),
    ['c', 'a', 'b'],
  );
  assert.deepEqual(
    commands.map((c) => c.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(movePinnedCommand(['a', 'inactive', 'c'], 'c', -1, ['a', 'c']), [
    'c',
    'inactive',
    'a',
  ]);
  assert.deepEqual(movePinnedCommand(['a', 'c'], 'a', -1), ['a', 'c']);
  const settings = createDefaultSettings();
  settings.pinnedCommands = ['a', 'a'];
  assert.throws(() => parseSettings(settings), /重複/);
});
test('legacy profile data is preserved opaquely and never normalized as active host settings', () => {
  const settings = createDefaultSettings();
  settings.profile = { name: '  Legacy  ', avatar: '../old-opaque-value.png', extra: true };
  assert.deepEqual(parseSettings(settings).profile, settings.profile);
});
