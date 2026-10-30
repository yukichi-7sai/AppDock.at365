const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { SettingsConflictError } = require('../out/main/main/core/settings');
const {
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
  } else if (pageId === 'notifications') {
    next.host.notificationBannerPosition = alternate ? 'bottom-left' : 'bottom-right';
    next.host.notificationBannerShadow = alternate;
    next.host.notificationDesktopShadow = alternate;
    next.notificationPreferences = {
      overrides: [],
      speech: { voice: alternate ? 'incoming' : 'local', speed: alternate ? 0.75 : 1.5 },
    };
  } else if (pageId === 'ribbon') {
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

test('legacy mixed notification values and status visibility migrate once without changing shared bytes', (t) => {
  const { store, file, shared } = fixture(t, (device) => {
    device.host.notificationBannerPosition = 'bottom-right';
    device.host.notificationBannerShadow = false;
    device.host.showStatusBar = false;
  });
  assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify(shared));
  for (const pageId of hostPageSettingsIds)
    assert.equal(
      store.hostPageLocalSettings(pageId),
      ['appearance', 'general', 'notifications', 'statusbar'].includes(pageId),
    );
  assert.equal(store.value.host.notificationBannerPosition, 'bottom-right');
  assert.equal(store.value.host.showStatusBar, false);
  assert.equal(store.value.notificationPreferences.speech.voice, 'shared');
  assert.equal(disk(store.device.file).host.notificationBannerPosition, undefined);
  const before = fs.readFileSync(store.device.file, 'utf8');
  store.reload();
  assert.equal(fs.readFileSync(store.device.file, 'utf8'), before);
  const incoming = disk(file);
  incoming.notificationPreferences.speech.voice = 'incoming';
  fs.writeFileSync(file, JSON.stringify(incoming));
  store.reload();
  assert.equal(store.value.notificationPreferences.speech.voice, 'shared');
});

for (const pageId of hostPageSettingsIds) {
  test(`${pageId}: local edits, external shared updates, keep/resume, share and two PCs use the selected file`, (t) => {
    const { store, file, base } = fixture(t);
    const b = new DeviceSettingsStore(file, path.join(base, 'local-b'), 'PC-B');
    t.after(() => b.close());
    b.load();
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
    b.setHostPageLocalSettings(pageId, false, b.revision);
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

test('appearance/general adopt existing PC values while preserving all earlier page modes', (t) => {
  const { store, file, shared } = fixture(t, (device) => {
    device.host.theme = 'dark';
    device.host.zoomFactor = 1.25;
    device.host.soundEnabled = false;
    device.host.hardwareAcceleration = true;
    device.host.startAtLogon = true;
    device.hostPages = {
      notifications: { useLocalSettings: false },
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
  const device = disk(store.device.file);
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
