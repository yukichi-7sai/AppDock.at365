const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema.js');
const {
  trayCommandGroups,
  withoutMissingSamples,
} = require('../out/main/main/core/tray-commands.js');
const applet = (commands) => ({
  id: 'test.applet',
  name: 'Test Applet',
  state: 'running',
  commands,
  tray: [{ title: 'Suggested label', command: 'test.applet.run' }],
});

test('missing tray choices default to the open command without mutating saved input', () => {
  const original = createDefaultSettings();
  delete original.trayCommands;
  delete original.host.trayClickCommand;
  const parsed = parseSettings(original);
  assert.deepEqual(parsed.trayCommands, ['appdock.open']);
  assert.equal(parsed.host.trayClickCommand, 'appdock.open');
  assert.equal(original.host.trayClickCommand, undefined);
  assert.deepEqual(
    trayCommandGroups(parsed, [
      applet([{ id: 'test.applet.run', title: 'Run', available: true }]),
    ]).flatMap((group) => group.commands.map((command) => command.id)),
    ['appdock.open'],
  );
});

test('tray settings validate types, duplicates and IDs, while retaining missing command choices', () => {
  const settings = createDefaultSettings();
  delete settings.trayMenu;
  settings.trayCommands = ['missing.command'];
  settings.host.trayClickCommand = 'missing.command';
  assert.deepEqual(parseSettings(settings).trayCommands, settings.trayCommands);
  for (const invalid of [
    null,
    {},
    ['bad id'],
    ['a', 'a'],
    Array.from({ length: 501 }, (_, i) => `c${i}`),
  ])
    assert.throws(() => parseSettings({ ...settings, trayCommands: invalid }), /trayCommands/);
  for (const invalid of [null, '', {}, 'bad id', '__proto__'])
    assert.throws(
      () => parseSettings({ ...settings, host: { ...settings.host, trayClickCommand: invalid } }),
      /trayClickCommand/,
    );
});

test('only selected commands appear, with availability and replacement titles reflected', () => {
  const settings = createDefaultSettings();
  settings.trayCommands = [
    'appdock.open',
    'appdock.settings.open',
    'test.applet.run',
    'test.applet.start',
    'missing.command',
  ];
  const extension = applet([
    { id: 'test.applet.run', title: 'Run', available: false },
    { id: 'test.applet.start', title: 'Start now', available: true },
    { id: 'test.applet.hidden', title: 'Not opted in', available: true },
  ]);
  let groups = trayCommandGroups(settings, [extension]);
  assert.equal(groups[0].commands.length, 2);
  assert.deepEqual(
    groups[0].commands.map((command) => command.id),
    ['appdock.open', 'appdock.settings.open'],
  );
  assert.deepEqual(groups[1].commands, [
    { id: 'test.applet.run', title: 'Suggested label', enabled: false },
    { id: 'test.applet.start', title: 'Start now', enabled: true },
  ]);
  extension.commands = [{ id: 'test.applet.start', title: 'Renamed', available: false }];
  groups = trayCommandGroups(settings, [extension]);
  assert.deepEqual(groups[1].commands, [
    { id: 'test.applet.start', title: 'Renamed', enabled: false },
  ]);
  settings.trayCommands = [];
  assert.deepEqual(trayCommandGroups(settings, [extension]), []);
});

test('missing sample migration removes legacy references but preserves installed fixtures and real Applets', () => {
  const settings = createDefaultSettings();
  settings.extensions = {
    'appdock.dotnet-demo': { enabled: false, settings: { obsolete: true } },
    'appdock.welcome': { enabled: true, settings: {} },
    'test.applet': { enabled: true, settings: { answer: 42 } },
  };
  settings.shortcuts['appdock.dotnet-demo.refresh'] = [];
  settings.shortcuts['appdock.welcome.notify'] = ['Ctrl+Alt+N'];
  settings.shortcuts['test.applet.run'] = ['Ctrl+Alt+R'];
  settings.pinnedCommands = ['appdock.dotnet-demo.refresh', 'test.applet.run'];
  settings.globalShortcutCommands = ['appdock.dotnet-demo.refresh', 'test.applet.run'];
  settings.trayCommands = ['appdock.dotnet-demo.refresh', 'test.applet.run'];
  settings.host.trayClickCommand = 'appdock.dotnet-demo.refresh';
  settings.host.trayDoubleClickCommand = 'appdock.dotnet-demo.refresh';
  const next = withoutMissingSamples(settings, ['appdock.welcome', 'test.applet']);
  assert.equal(next.extensions['appdock.dotnet-demo'], undefined);
  assert.equal(next.shortcuts['appdock.dotnet-demo.refresh'], undefined);
  assert.deepEqual(next.extensions['test.applet'], settings.extensions['test.applet']);
  assert.deepEqual(next.shortcuts['appdock.welcome.notify'], ['Ctrl+Alt+N']);
  for (const key of ['pinnedCommands', 'globalShortcutCommands', 'trayCommands'])
    assert.deepEqual(next[key], ['test.applet.run']);
  assert.equal(next.host.trayClickCommand, 'appdock.open');
  assert.equal(next.host.trayDoubleClickCommand, null);
  assert.deepEqual(settings.shortcuts['appdock.dotnet-demo.refresh'], []);
  assert.deepEqual(withoutMissingSamples(settings, Object.keys(settings.extensions)), settings);
});
