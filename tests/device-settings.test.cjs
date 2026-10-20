const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const {
  initialDeviceSettings,
  parseDeviceSettings,
  deviceName,
} = require('../out/main/main/core/device-settings');
const root = path.resolve(__dirname, '../.artifacts', `device-settings-${Date.now()}`);
fs.mkdirSync(root, { recursive: true });
let sequence = 0;
const collection = {
  owner: 'example.web',
  definition: { key: 'items', source: 'local', ui: 'main.html', fields: [] },
};
function fixture(t, name = 'PC-A', collections = []) {
  const base = path.join(root, String(sequence++));
  fs.mkdirSync(base);
  const shared = createDefaultSettings();
  shared.extensions['example.wallpaper'] = {
    enabled: true,
    settings: { seconds: 60, monitors: [1, 2] },
  };
  shared.extensions['example.web'] = {
    enabled: false,
    settings: { items: [{ id: 'mail', name: 'Mail', enabled: true, display: 'page' }] },
  };
  const file = path.join(base, 'settings.json');
  fs.writeFileSync(file, JSON.stringify(shared));
  const store = new DeviceSettingsStore(file, path.join(base, 'local'), name, () => collections);
  t.after(() => store.close());
  store.load();
  return { store, base, file, shared };
}
const disk = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
test('hint visibility accepts old device files and remains independent per PC without changing shared bytes', (t) => {
  const old = initialDeviceSettings('PC-A');
  delete old.host.showHints;
  const before = JSON.stringify(old);
  assert.equal(parseDeviceSettings(old, 'PC-A').host.showHints, true);
  assert.equal(JSON.stringify(old), before);
  old.host.showHints = false;
  assert.equal(parseDeviceSettings(old, 'PC-A').host.showHints, false);
  old.host.showHints = null;
  assert.throws(() => parseDeviceSettings(old, 'PC-A'), /showHints/);
  const { store: a, file, base } = fixture(t);
  const b = new DeviceSettingsStore(file, path.join(base, 'local-b'), 'PC-B');
  t.after(() => b.close());
  b.load();
  const sharedBefore = fs.readFileSync(file, 'utf8');
  const next = structuredClone(a.value);
  next.host.showHints = false;
  a.save(next, a.revision);
  assert.equal(a.value.host.showHints, false);
  assert.equal(b.value.host.showHints, true);
  assert.equal(fs.readFileSync(file, 'utf8'), sharedBefore);
  assert.equal(disk(path.join(path.dirname(file), 'settings-PC-A.json')).host.showHints, false);
  a.reload();
  assert.equal(a.value.host.showHints, false);
});

test('migration preserves shared bytes and initializes local flags once', (t) => {
  const { store, file, shared } = fixture(t);
  assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify(shared));
  assert.equal(store.value.extensions['example.wallpaper'].enabled, true);
  const next = structuredClone(store.value);
  next.extensions['example.wallpaper'].enabled = false;
  next.host.theme = 'dark';
  store.save(next, store.revision);
  assert.equal(disk(file).host.theme, shared.host.theme);
  assert.equal(disk(file).extensions['example.wallpaper'].enabled, true);
  assert.equal(disk(store.device.file).extensions['example.wallpaper'].enabled, false);
  store.reload();
  assert.equal(store.value.host.theme, 'dark');
});
test('all display/general settings remain local while other settings synchronize', (t) => {
  const { store, file } = fixture(t);
  const next = structuredClone(store.value);
  Object.assign(next.host, {
    theme: 'dark',
    shellProviders: { ribbon: 'example.shell' },
    soundEnabled: false,
    closeToTray: false,
    startMinimized: true,
    startAtLogon: true,
    runAsAdministrator: true,
    hardwareAcceleration: true,
  });
  next.profile = { ...next.profile, name: 'Shared' };
  store.save(next, store.revision);
  const shared = disk(file),
    device = disk(store.device.file);
  assert.equal(shared.profile?.name, 'Shared');
  assert.equal(
    require('../out/main/shared/settings-schema').parseSettings(shared).host.soundEnabled,
    true,
  );
  assert.equal(device.host.soundEnabled, false);
  assert.equal(device.host.runAsAdministrator, true);
  shared.host ??= {};
  shared.host.theme = 'system';
  shared.host.startAtLogon = false;
  shared.profile = { ...shared.profile, name: 'Incoming' };
  fs.writeFileSync(file, JSON.stringify(shared));
  store.reload();
  assert.equal(store.value.host.theme, 'dark');
  assert.equal(store.value.host.startAtLogon, true);
  assert.equal(store.value.profile?.name, 'Incoming');
});
test('whole Applet configurations stay independent and survive OFF/ON', (t) => {
  const { store, file } = fixture(t);
  store.setLocalSettings('example.wallpaper', true, store.revision);
  let next = structuredClone(store.value);
  next.extensions['example.wallpaper'].settings = { seconds: 120 };
  next.extensions['example.wallpaper'].startupDelaySeconds = 5;
  store.save(next, store.revision);
  assert.deepEqual(disk(file).extensions['example.wallpaper'].settings, {
    seconds: 60,
    monitors: [1, 2],
  });
  const incoming = disk(file);
  incoming.extensions['example.wallpaper'].settings = { seconds: 300, added: true };
  fs.writeFileSync(file, JSON.stringify(incoming));
  store.reload();
  assert.deepEqual(store.value.extensions['example.wallpaper'].settings, { seconds: 120 });
  store.setLocalSettings('example.wallpaper', false, store.revision);
  assert.equal(store.value.extensions['example.wallpaper'].settings.seconds, 300);
  store.setLocalSettings('example.wallpaper', true, store.revision);
  assert.deepEqual(store.value.extensions['example.wallpaper'].settings, { seconds: 120 });
  assert.equal(store.value.extensions['example.wallpaper'].startupDelaySeconds, 5);
});
test('two PC names see only their own state in the same synchronized placement', (t) => {
  const { store: a, file, base } = fixture(t);
  const b = new DeviceSettingsStore(file, path.join(base, 'local-b'), 'PC-B');
  t.after(() => b.close());
  b.load();
  let next = structuredClone(a.value);
  next.host.soundEnabled = false;
  next.extensions['example.wallpaper'].enabled = false;
  a.save(next, a.revision);
  b.reload();
  assert.equal(b.value.host.soundEnabled, true);
  assert.equal(b.value.extensions['example.wallpaper'].enabled, true);
  const shared = disk(file);
  shared.extensions['example.new'] = { enabled: true, settings: {} };
  fs.writeFileSync(file, JSON.stringify(shared));
  a.reload();
  b.reload();
  assert.equal(a.value.extensions['example.new'].enabled, true);
  assert.equal(b.value.extensions['example.new'].enabled, true);
});
test('dynamic page flags never leak into shared or local configuration arrays', (t) => {
  const { store, file } = fixture(t, 'PC-A', [collection]);
  assert.equal(store.value.extensions['example.web'].settings.items[0].enabled, true);
  const next = structuredClone(store.value);
  next.extensions['example.web'].settings.items[0].enabled = false;
  next.extensions['example.web'].settings.items[0].name = 'Renamed';
  next.extensions['example.web'].settings.items.push({
    id: 'new',
    name: 'New',
    enabled: true,
    display: 'page',
  });
  store.save(next, store.revision);
  assert.equal(disk(file).extensions['example.web'].settings.items[0].enabled, true);
  assert.equal(disk(file).extensions['example.web'].settings.items[0].name, 'Renamed');
  assert.equal(disk(file).extensions['example.web'].settings.items[1].enabled, false);
  assert.equal(store.value.extensions['example.web'].settings.items[0].enabled, false);
  assert.equal(store.value.extensions['example.web'].settings.items[1].enabled, true);
  store.setLocalSettings('example.web', true, store.revision);
  store.setLocalSettings('example.web', false, store.revision);
  assert.equal(store.value.extensions['example.web'].settings.items[0].enabled, false);
});
test('mixed save failure rolls back both files and leaves no successful partial state', (t) => {
  const { store, file, base } = fixture(t);
  const before = fs.readFileSync(file, 'utf8'),
    device = fs.readFileSync(store.device.file, 'utf8');
  const save = store.device.save;
  store.device.save = () => {
    throw Error('injected disk failure');
  };
  const next = structuredClone(store.value);
  next.profile = { ...next.profile, name: 'Should rollback' };
  next.host.theme = 'dark';
  assert.throws(() => store.save(next, store.revision), /injected/);
  store.device.save = save;
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(fs.readFileSync(store.device.file, 'utf8'), device);
  assert.equal(fs.existsSync(path.join(base, 'local/settings-transactions/settings.json')), false);
});
test('rollback accepts and preserves a legacy UTF-8 BOM byte for byte', (t) => {
  const { store, file } = fixture(t);
  fs.writeFileSync(file, '\uFEFF' + fs.readFileSync(file, 'utf8'));
  store.shared.reload();
  const before = fs.readFileSync(file);
  store.device.save = () => {
    throw Error('injected write failure');
  };
  const next = structuredClone(store.value);
  next.profile = { ...next.profile, name: 'Rollback' };
  next.host.theme = 'dark';
  assert.throws(() => store.save(next, store.revision), /injected/);
  assert.deepEqual(fs.readFileSync(file), before);
});
test('interrupted mixed transaction recovers before settings activation', (t) => {
  const { store, file, base } = fixture(t);
  const before = fs.readFileSync(file),
    after = { ...disk(file), profile: { name: 'Interrupted', avatar: null } };
  const text = JSON.stringify(after, null, 2) + '\n';
  fs.writeFileSync(file, text);
  const journal = path.join(base, 'local/settings-transactions/settings.json');
  fs.mkdirSync(path.dirname(journal), { recursive: true });
  fs.writeFileSync(
    journal,
    JSON.stringify({
      version: 1,
      machineName: 'PC-A',
      committed: false,
      files: [
        {
          scope: 'shared',
          before: before.toString('base64'),
          after: Buffer.from(text).toString('base64'),
        },
      ],
    }),
  );
  store.reload();
  assert.equal(fs.readFileSync(file, 'utf8'), before.toString());
  assert.equal(fs.existsSync(journal), false);
});
test('missing local state is recovered independently and never reimported from shared', (t) => {
  const { store, file, base } = fixture(t);
  const next = structuredClone(store.value);
  next.host.theme = 'dark';
  store.save(next, store.revision);
  fs.unlinkSync(store.device.file);
  store.close();
  const reopened = new DeviceSettingsStore(file, path.join(base, 'local'), 'PC-A');
  t.after(() => reopened.close());
  reopened.load();
  assert.equal(reopened.value.host.theme, 'dark');
  assert.equal(reopened.device.recovered, true);
  const plan = reopened.prepareRecovery();
  assert.equal(plan.scope, 'device');
  reopened.restoreRecovery(plan);
  assert.equal(disk(file).host.theme, 'light');
  assert.equal(disk(reopened.device.file).host.theme, 'dark');
});
test('invalid local file, foreign PC and malicious identities cannot change storage boundaries', (t) => {
  const { store } = fixture(t);
  assert.throws(() => deviceName('../other'));
  assert.throws(() => parseDeviceSettings({ ...initialDeviceSettings('PC-B') }, 'PC-A'));
  assert.throws(() =>
    parseDeviceSettings(
      {
        ...initialDeviceSettings('PC-A'),
        host: { ...store.device.value.host, trayClickCommand: 'other' },
      },
      'PC-A',
    ),
  );
  assert.throws(() =>
    parseDeviceSettings(
      JSON.parse(
        '{"schemaVersion":1,"machineName":"PC-A","host":{},"extensions":{"__proto__":{}},"collectionEnabled":{}}',
      ),
      'PC-A',
    ),
  );
  const rev = store.revision;
  const changed = disk(store.shared.file);
  changed.extensions['example.wallpaper'].settings.seconds = 1;
  fs.writeFileSync(store.shared.file, JSON.stringify(changed));
  assert.throws(() => store.setLocalSettings('example.wallpaper', true, rev));
});
test('local edits can continue during shared read failure, but switching to shared is refused', (t) => {
  const { store, file } = fixture(t);
  store.setLocalSettings('example.wallpaper', true, store.revision);
  fs.writeFileSync(file, '{broken');
  store.assertRevision(store.revision);
  const next = structuredClone(store.value);
  next.host.soundEnabled = false;
  store.save(next, store.revision);
  assert.equal(store.value.host.soundEnabled, false);
  assert.throws(() => store.setLocalSettings('example.wallpaper', false, store.revision), /共有/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});
test('generated setting commands and dryRun use the selected storage without exposing metadata', async (t) => {
  const { store, file } = fixture(t);
  const { SettingsCommands } = require('../out/main/main/core/settings-commands');
  const owner = 'example.wallpaper';
  const applet = {
    id: owner,
    enabled: true,
    state: 'running',
    settings: [{ key: 'seconds', title: 'Seconds', type: 'number', default: 60, automation: true }],
  };
  const commands = new SettingsCommands({
    settings: store,
    applets: () => [applet],
    save: (v, r) => store.save(v, r),
  });
  store.setLocalSettings(owner, true, store.revision);
  const before = fs.readFileSync(store.device.file, 'utf8');
  await commands.execute(owner + '.settings.update', {
    changes: { seconds: 180 },
    expectedRevision: commands.get(owner).revision,
    dryRun: true,
  });
  assert.equal(fs.readFileSync(store.device.file, 'utf8'), before);
  await commands.execute(owner + '.settings.update', {
    changes: { seconds: 180 },
    expectedRevision: commands.get(owner).revision,
  });
  assert.equal(disk(store.device.file).extensions[owner].configuration.settings.seconds, 180);
  assert.equal(disk(file).extensions[owner].settings.seconds, 60);
  assert.equal('useLocalSettings' in commands.get(owner).values, false);
});
test('committed journal cleanup failure cannot roll back assets or saved settings', (t) => {
  const { store, file, base } = fixture(t);
  const journal = path.join(base, 'local/settings-transactions/settings.json');
  const unlink = fs.unlinkSync;
  let rollback = 0;
  fs.unlinkSync = (target) => {
    if (target === journal) throw Error('cleanup locked');
    return unlink(target);
  };
  try {
    const next = structuredClone(store.value);
    next.profile = { ...next.profile, name: 'Committed' };
    next.host.theme = 'dark';
    store.save(next, store.revision, {
      commit() {},
      rollback() {
        rollback++;
      },
    });
    assert.equal(disk(file).profile?.name, 'Committed');
    assert.equal(rollback, 0);
  } finally {
    fs.unlinkSync = unlink;
  }
  store.reload();
  assert.equal(store.value.host.theme, 'dark');
  assert.equal(fs.existsSync(journal), false);
});
test('rollback preserves external changes and retains unresolved recovery evidence', (t) => {
  const { store, file, base } = fixture(t);
  store.device.save = () => {
    const external = disk(file);
    external.profile = { ...external.profile, name: 'External' };
    fs.writeFileSync(file, JSON.stringify(external));
    throw Error('disk failure');
  };
  const next = structuredClone(store.value);
  next.profile = { ...next.profile, name: 'Mine' };
  next.host.theme = 'dark';
  assert.throws(() => store.save(next, store.revision));
  assert.equal(disk(file).profile?.name, 'External');
  assert.equal(fs.existsSync(path.join(base, 'local/settings-transactions/settings.json')), true);
});
test('initialization marker prevents reimport even when all backup writes were unavailable', (t) => {
  const { store, file, base } = fixture(t);
  const backup = path.dirname(store.device.backupCandidate().file);
  for (const name of fs.readdirSync(backup))
    if (name === 'last-good.json' || /^settings-.*\.json$/.test(name))
      fs.unlinkSync(path.join(backup, name));
  fs.unlinkSync(store.device.file);
  store.close();
  const reopened = new DeviceSettingsStore(file, path.join(base, 'local'), 'PC-A');
  t.after(() => reopened.close());
  assert.throws(() => reopened.load(), /正常なバックアップ/);
  assert.equal(fs.existsSync(store.device.file), false);
});
