const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const {
  defaultCommandTriggerOptions,
  parseCommandTriggerOptions,
  getCommandTriggerOptions,
} = require('../out/main/shared/command-trigger-options');
const { getGestureSettings, planGestureCommands } = require('../out/main/shared/gestures');
const {
  getKeybindingOptions,
  nativeShortcutInputs,
  planKeybindings,
} = require('../out/main/shared/keybindings');
const { planTouchpadCommands } = require('../out/main/shared/touchpad-gestures');
const {
  settingsCatalog,
  settingsProjection,
  settingsJsonProjection,
  applySettingsJson,
} = require('../out/main/shared/settings-catalog');

test('common browser defaults ignore obsolete per-trigger values and store only one normalized source', () => {
  const value = createDefaultSettings();
  delete value.commandTriggerOptions;
  for (const key of ['keybindingOptions', 'gestures', 'touchpadGestures']) {
    value[key].browsers = ['old-browser'];
    value[key].requireChromiumWindowClass = true;
  }
  const parsed = parseSettings(value);
  assert.deepEqual(parsed.commandTriggerOptions, defaultCommandTriggerOptions());
  for (const key of ['keybindingOptions', 'gestures', 'touchpadGestures']) {
    assert.equal(Object.hasOwn(parsed[key], 'browsers'), false);
    assert.equal(Object.hasOwn(parsed[key], 'requireChromiumWindowClass'), false);
  }
  assert.equal(settingsStorageValue(parsed).commandTriggerOptions, undefined);
  value.commandTriggerOptions = {
    browsers: ['FIREFOX.EXE', 'firefox'],
    requireChromiumWindowClass: true,
  };
  assert.deepEqual(parseSettings(value).commandTriggerOptions, {
    browsers: ['firefox'],
    requireChromiumWindowClass: true,
  });
  assert.deepEqual(settingsStorageValue(parseSettings(value)).commandTriggerOptions, {
    browsers: ['firefox'],
    requireChromiumWindowClass: true,
  });
});

test('common browser validation rejects invalid input and preserves explicit empty and false values', () => {
  for (const value of [
    null,
    [],
    false,
    { browsers: null },
    { browsers: ['C:/chrome.exe'] },
    { requireChromiumWindowClass: null },
    { requireChromiumWindowClass: 'true' },
  ])
    assert.throws(() => parseCommandTriggerOptions(value));
  assert.deepEqual(
    parseCommandTriggerOptions({ browsers: [], requireChromiumWindowClass: false }),
    { browsers: [], requireChromiumWindowClass: false },
  );
});

test('keyboard, mouse, touchpad and native keyboard gates use the same browser environment', () => {
  const settings = createDefaultSettings();
  settings.commandTriggerOptions = { browsers: ['firefox'], requireChromiumWindowClass: true };
  const when = { scope: 'browser', appletIds: [], processes: [] };
  const binding = { id: 'a', command: 'test.run', enabled: true, when };
  settings.keybindings = [{ ...binding, key: 'Ctrl+F8' }];
  settings.gestures.bindings = [{ ...binding, gesture: 'move-up' }];
  settings.touchpadGestures.bindings = [{ ...binding, gesture: 'three.tap' }];
  const commands = [{ id: 'test.run', title: 'Run' }];
  const environment = getCommandTriggerOptions(settings);
  assert.deepEqual(
    nativeShortcutInputs(settings.keybindings, ['test.run'], getKeybindingOptions(settings))[0]
      .environment,
    environment,
  );
  for (const [processName, windowClass, expected] of [
    ['firefox', 'Chrome_WidgetWin_1', ['test.run']],
    ['chrome', 'Chrome_WidgetWin_1', []],
    ['firefox', 'OtherWindow', []],
  ]) {
    const target = { window: '100', processName, windowClass, desktop: false };
    assert.deepEqual(
      planKeybindings(
        settings.keybindings,
        ['Ctrl+F8'],
        { appFocused: false, target },
        commands,
        true,
        'all',
        environment,
      ).commands,
      expected,
    );
    assert.deepEqual(
      planGestureCommands(
        getGestureSettings(settings),
        'move-up',
        { appFocused: false, window: '' },
        target,
        commands,
      ).commands,
      expected,
    );
    assert.deepEqual(
      planTouchpadCommands(
        settings.touchpadGestures,
        'three.tap',
        { host: { focused: false }, target },
        commands,
        environment,
      ).commands,
      expected,
    );
  }
});

test('three feature pages share browser JSON/reset while bindings belong to command triggers', () => {
  const settings = createDefaultSettings();
  settings.commandTriggerOptions = { browsers: ['firefox'], requireChromiumWindowClass: true };
  settings.gestures.executionMode = 'first';
  settings.gestures.bindings = [
    {
      id: 'keep',
      command: 'test.run',
      enabled: true,
      gesture: 'move-up',
      when: { scope: 'app', appletIds: [], processes: [] },
    },
  ];
  for (const id of ['shortcuts', 'gestures', 'touchpad-gestures']) {
    const page = settingsCatalog([], settings).find((page) => page.id === id);
    const projection = settingsProjection(settings, page, []);
    assert.deepEqual(projection.commandTriggerOptions, settings.commandTriggerOptions);
    assert.equal(projection.keybindings, undefined);
    assert.equal(projection.gestures?.bindings, undefined);
    assert.equal(projection.touchpadGestures?.bindings, undefined);
    assert.equal(
      page.items.some((item) =>
        ['bindings', 'keybindings', 'gestures', 'options'].includes(item.key),
      ),
      false,
    );
    const edited = applySettingsJson(
      settings,
      page,
      [],
      JSON.stringify({
        ...settingsJsonProjection(settings, page, []),
        commandTriggerOptions: { browsers: ['brave'] },
      }),
    );
    assert.deepEqual(edited.commandTriggerOptions.browsers, ['brave']);
    assert.deepEqual(edited.gestures.bindings, settings.gestures.bindings);
    const reset = applySettingsJson(settings, page, [], '{}');
    assert.deepEqual(reset.commandTriggerOptions, defaultCommandTriggerOptions());
    assert.deepEqual(reset.gestures.bindings, settings.gestures.bindings);
  }
});

test('all dedicated configure APIs read/write the common source, retain bindings and respect dry-run/no-op', (t) => {
  const { SettingsStore } = require('../out/main/main/core/settings');
  const { SettingsCommands } = require('../out/main/main/core/settings-commands');
  const { ShortcutCommands } = require('../out/main/main/core/shortcut-commands');
  const { GestureCommands } = require('../out/main/main/core/gesture-commands');
  const root = path.resolve('.artifacts/command-trigger-options-unit');
  fs.mkdirSync(root, { recursive: true });
  const folder = fs.mkdtempSync(path.join(root, 'case-'));
  const settings = new SettingsStore(
    path.join(folder, 'settings.json'),
    path.join(folder, 'backups'),
  );
  settings.load();
  t.after(() => settings.close());
  const save = (value, revision) => settings.save(value, revision);
  const settingsCommands = new SettingsCommands({ settings, save, applets: () => [] });
  const options = {
    settings,
    settingsCommands,
    save,
    commands: () => [],
    applets: () => [],
    statuses: () => [],
  };
  const services = [
    new ShortcutCommands(options),
    new GestureCommands(options),
    new GestureCommands({ ...options, touchpad: true }),
  ];
  for (const [index, service] of services.entries()) {
    const changes = { browsers: [`browser${index}`], requireChromiumWindowClass: index % 2 === 0 };
    const args = {
      expectedRevision: settingsCommands.revision(),
      operations: [{ kind: 'configure', changes }],
    };
    const before = structuredClone(settings.value);
    service.execute({ ...args, dryRun: true });
    assert.deepEqual(settings.value, before);
    service.execute(args);
    assert.deepEqual(settings.value.commandTriggerOptions, changes);
    for (const other of services) {
      const state = other.get();
      assert.deepEqual((state.options ?? state.settings).browsers, changes.browsers);
      assert.equal(
        (state.options ?? state.settings).requireChromiumWindowClass,
        changes.requireChromiumWindowClass,
      );
    }
    const revision = settings.revision;
    service.execute({ ...args, expectedRevision: settingsCommands.revision() });
    assert.equal(settings.revision, revision);
    for (const key of ['keybindingOptions', 'gestures', 'touchpadGestures'])
      assert.equal(settings.value[key].browsers, undefined);
  }
});

test('public common browser changes use unified write without execute and respect immediate revocation', async (t) => {
  const { AppDockApi } = require('../out/main/main/core/appdock-api');
  const { SettingsStore } = require('../out/main/main/core/settings');
  const root = path.resolve('.artifacts/command-trigger-options-unit');
  fs.mkdirSync(root, { recursive: true });
  const folder = fs.mkdtempSync(path.join(root, 'permissions-'));
  const settings = new SettingsStore(
    path.join(folder, 'settings.json'),
    path.join(folder, 'backups'),
  );
  settings.load();
  t.after(() => settings.close());
  let write = true;
  const api = new AppDockApi({
    settings,
    save: (value, revision) => settings.save(value, revision),
    commands: () => [],
    applets: () => [],
    version: 'test',
    instanceId: 'test',
    ready: () => true,
    writable: () => write,
    executable: () => false,
    execute: async () => {},
  });
  for (const endpoint of ['shortcuts', 'gestures', 'touchpadGestures']) {
    write = false;
    const before = structuredClone(settings.value);
    const args = {
      expectedRevision: (await api.call(endpoint + '.get')).revision,
      operations: [{ kind: 'configure', changes: { browsers: [endpoint.toLowerCase()] } }],
    };
    await assert.rejects(api.call('commands.execute', { id: `appdock.${endpoint}.update`, args }), {
      code: 'WRITE_DISABLED',
    });
    assert.deepEqual(settings.value, before);
    write = true;
    await api.call('commands.execute', { id: `appdock.${endpoint}.update`, args });
    assert.deepEqual(settings.value.commandTriggerOptions.browsers, [endpoint.toLowerCase()]);
  }
});
