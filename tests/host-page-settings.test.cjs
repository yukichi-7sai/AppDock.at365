const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { SettingsConflictError } = require('../out/main/main/core/settings');
const {
  combineSettings,
  initialDeviceSettings,
  parseDeviceSettings,
} = require('../out/main/main/core/device-settings');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const {
  hostPageSettingsIds,
  hostPageConfiguration,
  applyHostPageConfiguration,
} = require('../out/main/shared/host-page-settings');
const root = path.resolve('.artifacts', `host-page-settings-${Date.now()}`);
fs.mkdirSync(root, { recursive: true });
const disk = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
function fixture(t, legacy) {
  const base = fs.mkdtempSync(path.join(root, 'case-'));
  const file = path.join(base, 'settings.json');
  const shared = createDefaultSettings();
  shared.notificationPreferences = { overrides: [], speech: { voice: 'shared' } };
  fs.writeFileSync(file, JSON.stringify(shared));
  if (legacy) {
    const device = initialDeviceSettings('PC-A', shared);
    delete device.hostPages;
    legacy(device);
    fs.writeFileSync(path.join(base, 'settings-PC-A.json'), JSON.stringify(device));
  }
  const store = new DeviceSettingsStore(file, path.join(base, 'local'), 'PC-A');
  t.after(() => store.close());
  store.load();
  return { store, base, file, shared };
}
function change(value, pageId, alternate = false) {
  const next = structuredClone(value);
  if (pageId === 'appearance') {
    next.host.theme = alternate ? 'system' : 'dark';
    next.host.zoomFactor = alternate ? 1.1 : 1.25;
    next.host.overlayShadow = alternate;
    next.host.shellProviders = alternate ? {} : { ribbon: 'example.shell' };
  } else if (pageId === 'general') {
    next.host.soundEnabled = alternate;
    next.host.closeToTray = alternate;
    next.host.startMinimized = !alternate;
    next.host.startPage = alternate ? 'about' : 'page:example.missing:main';
  } else if (pageId === 'text-palette') {
    next.host.textPaletteHistory = alternate;
    next.host.textPaletteRows = alternate ? 11 : 4;
    next.host.clipboardPaletteRows = alternate ? 3 : 12;
    next.host.textPaletteWidth = alternate ? 420 : 560;
    next.host.clipboardPaletteWidth = alternate ? 350 : 480;
    next.host.paletteShowGuide = alternate;
  } else if (pageId === 'notifications') {
    next.host.notificationBannerPosition = alternate ? 'bottom-left' : 'bottom-right';
    next.host.notificationBannerShadow = alternate;
    next.host.notificationDesktopShadow = alternate;
    next.notificationPreferences = {
      overrides: [],
      speech: { voice: alternate ? 'incoming' : 'local', speed: alternate ? 0.75 : 1.5 },
    };
  } else if (pageId === 'ribbon') {
    next.host.ribbonExpandOnHover = !alternate;
    next.ribbon.rightClickCommand = alternate ? 'appdock.quit' : 'appdock.open';
    next.ribbon.hidden = alternate ? ['settings'] : [];
  } else if (pageId === 'statusbar') {
    next.host.showStatusBar = alternate;
  } else if (pageId === 'tray') {
    next.trayMenu = alternate ? createDefaultSettings().trayMenu : [];
    next.host.trayClickCommand = alternate ? 'appdock.open' : 'appdock.quit';
    next.host.trayDoubleClickCommand = alternate ? null : 'appdock.open';
  } else {
    next.updates.hostSource = alternate
      ? 'https://example.test/incoming.json'
      : 'https://example.test/local.json';
    next.updates.startupDelaySeconds = alternate ? 12 : 42;
    next.updates.allowSameVersion = !alternate;
  }
  return parseSettings(next);
}

test('legacy PC overrides without a saved mode stay dormant while all pages follow shared settings', (t) => {
  const { store, file, shared } = fixture(t, (device) => {
    device.host.notificationBannerPosition = 'bottom-right';
    device.host.notificationBannerShadow = false;
    device.host.showStatusBar = false;
    assert.equal(combineSettings(createDefaultSettings(), device, []).host.showStatusBar, true);
  });
  assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify(shared));
  for (const pageId of hostPageSettingsIds)
    assert.equal(store.hostPageLocalSettings(pageId), false, pageId);
  assert.equal(store.value.host.notificationBannerPosition, shared.host.notificationBannerPosition);
  assert.equal(store.value.host.showStatusBar, shared.host.showStatusBar);
  assert.equal(store.value.notificationPreferences.speech.voice, 'shared');
  assert.equal(disk(store.device.file).host.notificationBannerPosition, undefined);
  const before = fs.readFileSync(store.device.file, 'utf8');
  store.reload();
  assert.equal(fs.readFileSync(store.device.file, 'utf8'), before);
  const incoming = disk(file);
  incoming.notificationPreferences.speech.voice = 'incoming';
  fs.writeFileSync(file, JSON.stringify(incoming));
  store.reload();
  assert.equal(store.value.notificationPreferences.speech.voice, 'incoming');
  store.setHostPageLocalSettings('notifications', true, store.revision);
  store.setHostPageLocalSettings('statusbar', true, store.revision);
  assert.equal(store.value.host.notificationBannerPosition, 'bottom-right');
  assert.equal(store.value.host.showStatusBar, false);
  assert.equal(store.value.notificationPreferences.speech.voice, 'shared');
});

test('a new PC adopts later shared changes before first enabling local palette settings', (t) => {
  const { store, file } = fixture(t);
  assert.deepEqual(disk(store.device.file).hostPages['text-palette'], { useLocalSettings: false });
  const shared = disk(file);
  shared.host.textPaletteHistory = false;
  fs.writeFileSync(file, JSON.stringify(shared));
  store.reload();
  assert.equal(store.value.host.textPaletteHistory, false);
  store.setHostPageLocalSettings('text-palette', true, store.revision);
  assert.equal(store.value.host.textPaletteHistory, false);
  assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify(shared));
});

for (const pageId of hostPageSettingsIds) {
  test(`${pageId}: local edits, external shared updates, keep/resume, share and two PCs use the selected file`, (t) => {
    const { store, file, base } = fixture(t);
    const b = new DeviceSettingsStore(file, path.join(base, 'local-b'), 'PC-B');
    t.after(() => b.close());
    b.load();
    assert.deepEqual(disk(b.device.file).hostPages[pageId], { useLocalSettings: false });
    store.setHostPageLocalSettings(pageId, true, store.revision);
    const sharedBytes = fs.readFileSync(file, 'utf8');
    const next = change(store.value, pageId);
    store.save(next, store.revision);
    const local = hostPageConfiguration(next, pageId);
    assert.deepEqual(hostPageConfiguration(store.value, pageId), local);
    assert.equal(fs.readFileSync(file, 'utf8'), sharedBytes);
    b.reload();
    assert.notDeepEqual(hostPageConfiguration(b.value, pageId), local);
    const incoming = change(parseSettings(disk(file)), pageId, true);
    fs.writeFileSync(file, JSON.stringify(settingsStorageValue(incoming)));
    store.reload();
    assert.deepEqual(hostPageConfiguration(store.value, pageId), local);
    const sharedPage = hostPageConfiguration(incoming, pageId);
    store.setHostPageLocalSettings(pageId, false, store.revision);
    assert.deepEqual(hostPageConfiguration(store.value, pageId), sharedPage);
    for (const path of require('../out/main/shared/host-page-settings').hostPageSettingsPaths(
      pageId,
    ))
      assert.equal(store.settingScope(path), 'shared');
    store.setHostPageLocalSettings(pageId, true, store.revision);
    assert.deepEqual(hostPageConfiguration(store.value, pageId), local);
    const unrelated = structuredClone(store.shared.value);
    store.setHostPageLocalSettings(pageId, false, store.revision, undefined, 'share');
    applyHostPageConfiguration(unrelated, local, pageId);
    assert.deepEqual(store.shared.value, parseSettings(unrelated));
    assert.equal(disk(store.device.file).hostPages[pageId].configuration, undefined);
    b.reload();
    assert.deepEqual(hostPageConfiguration(b.value, pageId), local);
    const final = change(store.value, pageId, true);
    store.save(final, store.revision);
    assert.deepEqual(
      hostPageConfiguration(parseSettings(disk(file)), pageId),
      hostPageConfiguration(final, pageId),
    );
    assert.equal(store.value.host.runAsAdministrator, false);
    assert.equal(store.device.value.hostPages[pageId].useLocalSettings, false);
  });

  test(`${pageId}: clear copies the current shared page next time; defaults never fall back to shared values`, (t) => {
    const { store, file } = fixture(t);
    store.setHostPageLocalSettings(pageId, true, store.revision);
    store.save(change(store.value, pageId), store.revision);
    store.setHostPageLocalSettings(pageId, false, store.revision, undefined, 'clear');
    assert.equal(disk(store.device.file).hostPages[pageId].configuration, undefined);
    const sharedPage = hostPageConfiguration(store.value, pageId);
    store.setHostPageLocalSettings(pageId, true, store.revision);
    assert.deepEqual(hostPageConfiguration(store.value, pageId), sharedPage);
    const defaults = hostPageConfiguration(createDefaultSettings(), pageId);
    const next = structuredClone(store.value);
    applyHostPageConfiguration(next, defaults, pageId);
    store.save(next, store.revision);
    const incoming = change(parseSettings(disk(file)), pageId);
    fs.writeFileSync(file, JSON.stringify(settingsStorageValue(incoming)));
    store.reload();
    assert.deepEqual(
      hostPageConfiguration(store.value, pageId),
      hostPageConfiguration(parseSettings(createDefaultSettings()), pageId),
    );
    assert.deepEqual(disk(store.device.file).hostPages[pageId].configuration, {});
  });
}

test('host page configuration rejects foreign pages, invalid values and escaping paths while accepting legacy files', () => {
  const device = initialDeviceSettings('PC-A');
  delete device.hostPages;
  assert.deepEqual(parseDeviceSettings(device, 'PC-A').hostPages, {});
  for (const hostPages of [
    { appearance: { useLocalSettings: true, configuration: { host: { soundEnabled: false } } } },
    { general: { useLocalSettings: true, configuration: { host: { startAtLogon: true } } } },
    { general: { useLocalSettings: true, configuration: { host: { runAsAdministrator: true } } } },
    {
      general: { useLocalSettings: true, configuration: { host: { hardwareAcceleration: true } } },
    },
    { statusbar: { useLocalSettings: true } },
    { notifications: { useLocalSettings: true, configuration: { host: { theme: 'dark' } } } },
    { statusbar: { useLocalSettings: true, configuration: { host: { showStatusBar: 'false' } } } },
    { about: { useLocalSettings: false, configuration: { updates: { startupDelaySeconds: -1 } } } },
    { ribbon: { useLocalSettings: true, configuration: { extensions: {} } } },
  ])
    assert.throws(() => parseDeviceSettings({ ...device, hostPages }, 'PC-A'));
});

test('selected persisted overrides and stale revisions follow the host page mode', (t) => {
  const { store } = fixture(t);
  store.setHostPageLocalSettings('statusbar', true, store.revision);
  store.save(change(store.value, 'statusbar'), store.revision);
  assert.equal(store.storedSettingOverrides('appdock').showStatusBar, false);
  store.setHostPageLocalSettings('statusbar', false, store.revision);
  assert.equal(store.storedSettingOverrides('appdock').showStatusBar, true);
  const revision = store.revision;
  store.setHostPageLocalSettings('statusbar', true, revision);
  assert.throws(
    () => store.setHostPageLocalSettings('statusbar', false, revision),
    SettingsConflictError,
  );
  const before = fs.readFileSync(store.device.file, 'utf8');
  assert.throws(() => store.setHostPageLocalSettings('tts', true, store.revision));
  assert.equal(fs.readFileSync(store.device.file, 'utf8'), before);
});

test('sharing a local page rolls both files back if the second write fails', (t) => {
  const { store, file } = fixture(t);
  store.setHostPageLocalSettings('about', true, store.revision);
  store.save(change(store.value, 'about'), store.revision);
  const sharedBefore = fs.readFileSync(file, 'utf8');
  const deviceBefore = fs.readFileSync(store.device.file, 'utf8');
  const save = store.device.save;
  store.device.save = () => {
    throw Error('injected device save failure');
  };
  try {
    assert.throws(
      () => store.setHostPageLocalSettings('about', false, store.revision, undefined, 'share'),
      /injected/,
    );
  } finally {
    store.device.save = save;
  }
  assert.equal(fs.readFileSync(file, 'utf8'), sharedBefore);
  assert.equal(fs.readFileSync(store.device.file, 'utf8'), deviceBefore);
  assert.equal(store.hostPageLocalSettings('about'), true);
});

test('manual ribbon override commits auto OFF and the remembered mode together, preserving groups', (t) => {
  const { store } = fixture(t);
  const { RibbonState } = require('../out/main/main/core/ribbon-state');
  const ribbon = new RibbonState(
    store.uiStateStorage('ribbon'),
    () => {},
    () => {},
  );
  ribbon.set('group:keep', true);
  const automatic = structuredClone(store.value);
  automatic.host.ribbonExpandOnHover = true;
  store.save(automatic, store.revision);
  const next = structuredClone(store.value);
  next.host.ribbonExpandOnHover = false;
  const before = [store.shared.file, store.device.file].map((f) => fs.readFileSync(f, 'utf8'));
  const save = store.device.save;
  store.device.save = () => {
    throw Error('injected ribbon mode failure');
  };
  try {
    assert.throws(
      () =>
        ribbon.setDisplayMode('expanded', () =>
          store.save(next, store.revision, undefined, [], 'expanded'),
        ),
      /injected/,
    );
  } finally {
    store.device.save = save;
  }
  assert.equal(store.value.host.ribbonExpandOnHover, true);
  assert.equal(ribbon.displayMode, 'compact');
  assert.deepEqual(
    [store.shared.file, store.device.file].map((f) => fs.readFileSync(f, 'utf8')),
    before,
  );
  ribbon.setDisplayMode('expanded', () =>
    store.save(next, store.revision, undefined, [], 'expanded'),
  );
  assert.equal(store.value.host.ribbonExpandOnHover, false);
  assert.equal(ribbon.displayMode, 'expanded');
  ribbon.set('group:second', true); // The state-storage comparison is refreshed after the transaction.
  const restored = new RibbonState(
    store.uiStateStorage('ribbon'),
    () => {},
    () => {},
  );
  assert.equal(restored.displayMode, 'expanded');
  assert.equal(restored.isExpanded('group:keep'), true);
  assert.equal(restored.isExpanded('group:second'), true);
});

test('switching a legacy tray command list to local retains its resolved menu and unknown commands', (t) => {
  const { store, file } = fixture(t);
  const shared = disk(file);
  delete shared.trayMenu;
  shared.trayCommands = ['appdock.open', 'example.missing.command'];
  fs.writeFileSync(file, JSON.stringify(shared));
  store.reload();
  const expected = require('../out/main/shared/tray-menu').getTrayMenu(store.value, []);
  const before = fs.readFileSync(file, 'utf8');
  store.setHostPageLocalSettings('tray', true, store.revision);
  assert.deepEqual(store.value.trayMenu, expected);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  store.reload();
  assert.deepEqual(store.value.trayMenu, expected);
});

test('missing pages default to shared while saved modes and dormant configurations survive reload', (t) => {
  const { store, file, shared } = fixture(t, (device) => {
    device.host.theme = 'dark';
    device.host.zoomFactor = 1.25;
    device.host.soundEnabled = false;
    device.host.hardwareAcceleration = true;
    device.host.startAtLogon = true;
    device.hostPages = {
      notifications: {
        useLocalSettings: false,
        configuration: { host: { notificationBannerShadow: false } },
      },
      'text-palette': {
        useLocalSettings: true,
        configuration: { host: { textPaletteHistory: false } },
      },
      statusbar: { useLocalSettings: false },
      ribbon: {
        useLocalSettings: true,
        configuration: { ribbon: { rightClickCommand: 'appdock.open' } },
      },
      tray: { useLocalSettings: false },
      about: { useLocalSettings: false },
    };
  });
  assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify(shared));
  store.reload();
  const device = disk(store.device.file);
  assert.equal(store.hostPageLocalSettings('appearance'), false);
  assert.equal(store.value.host.theme, shared.host.theme);
  assert.equal(store.hostPageLocalSettings('general'), false);
  assert.equal(store.value.host.soundEnabled, shared.host.soundEnabled);
  assert.equal(store.hostPageLocalSettings('text-palette'), true);
  assert.equal(store.value.host.textPaletteHistory, false);
  assert.equal(device.hostPages.notifications.configuration.host.notificationBannerShadow, false);
  assert.equal(device.hostPages.appearance.configuration.host.theme, 'dark');
  assert.equal(device.hostPages.appearance.configuration.host.zoomFactor, 1.25);
  assert.equal(device.hostPages.general.configuration.host.soundEnabled, false);
  assert.equal(device.hostPages.general.configuration.host.hardwareAcceleration, undefined);
  assert.equal(device.hostPages.notifications.useLocalSettings, false);
  assert.equal(device.hostPages.ribbon.useLocalSettings, true);
  assert.equal(store.value.ribbon.rightClickCommand, 'appdock.open');
  assert.equal(device.host.hardwareAcceleration, true);
  assert.equal(device.host.startAtLogon, true);
  assert.equal(device.host.theme, undefined);
});

test('general shared/local modes and sharing never transfer launch or hardware flags to another PC', (t) => {
  const { store, file, base } = fixture(t);
  const fixed = ['startAtLogon', 'runAsAdministrator', 'hardwareAcceleration'];
  store.setHostPageLocalSettings('general', true, store.revision);
  const next = change(store.value, 'general');
  for (const key of fixed) next.host[key] = true;
  store.save(next, store.revision);
  store.setHostPageLocalSettings('general', false, store.revision, undefined, 'share');
  for (const key of fixed) {
    assert.equal(store.value.host[key], true);
    assert.equal(store.settingScope(['host', key]), 'device');
    assert.equal(parseSettings(disk(file)).host[key], false);
  }
  const b = new DeviceSettingsStore(file, path.join(base, 'local-b'), 'PC-B');
  t.after(() => b.close());
  b.load();
  b.setHostPageLocalSettings('general', false, b.revision);
  for (const key of fixed) assert.equal(b.value.host[key], false);
  for (const enabled of [true, false, true]) {
    store.setHostPageLocalSettings('general', enabled, store.revision);
    store.reload();
    for (const key of fixed) assert.equal(store.value.host[key], true);
  }
  const paths = require('../out/main/shared/settings-catalog').settingsPaths(
    { id: 'general', kind: 'host', json: true },
    [],
  );
  for (const key of fixed) assert(paths.some((path) => path.join('.') === 'host.' + key));
});
