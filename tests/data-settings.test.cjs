const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { RibbonState } = require('../out/main/main/core/ribbon-state');
const { GalleryViewStateStore } = require('../out/main/main/core/gallery-view-state');
const { WindowStateStore } = require('../out/main/main/core/window-state');
const { createHostApi } = require('../out/main/main/core/host-api');
const { appletStorageFile } = require('../out/main/main/core/applet-storage');
const disk = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-data-settings-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'data/settings.json');
  const a = new DeviceSettingsStore(file, path.join(root, 'local-a'), 'PC-A');
  const b = new DeviceSettingsStore(file, path.join(root, 'local-b'), 'PC-B');
  t.after(() => {
    a.close();
    b.close();
  });
  a.load();
  b.load();
  return { root, file, a, b };
}
test('device UI state survives restart in data settings without changing shared configuration, settings revision or backups', (t) => {
  const { root, file, a, b } = fixture(t);
  const sharedBefore = fs.readFileSync(file);
  const revision = a.revision;
  let changes = 0;
  a.on('changed', () => changes++);
  const backups = () =>
    fs.readdirSync(path.join(root, 'local-a/settings-backups/device/pc-a')).sort();
  const beforeBackups = backups();
  const ribbon = new RibbonState(a.uiStateStorage('ribbon'), () => {}, assert.fail);
  ribbon.setDisplayMode('expanded');
  ribbon.set('group:one', true);
  const gallery = new GalleryViewStateStore(a.uiStateStorage('gallery'));
  gallery.save('library', 180);
  gallery.save('picker', 200);
  const window = a.uiStateStorage('windows', 'host');
  window.read();
  const bounds = { x: 20, y: 30, width: 1000, height: 700 };
  for (let i = 0; i < 40; i++) window.write({ bounds: { ...bounds, x: 20 + i }, maximized: false });
  assert.equal(a.revision, revision);
  assert.equal(changes, 0);
  assert.deepEqual(backups(), beforeBackups);
  assert.deepEqual(fs.readFileSync(file), sharedBefore);
  assert.equal(b.device.value.uiState, undefined);
  const restarted = new DeviceSettingsStore(file, path.join(root, 'local-a'), 'PC-A');
  t.after(() => restarted.close());
  restarted.load();
  assert.equal(
    new RibbonState(restarted.uiStateStorage('ribbon'), () => {}, assert.fail).isExpanded(
      'group:one',
    ),
    true,
  );
  assert.equal(new GalleryViewStateStore(restarted.uiStateStorage('gallery')).get('picker'), 200);
  assert.equal(
    new WindowStateStore(restarted.uiStateStorage('windows', 'host'), assert.fail).load([
      { x: 0, y: 0, width: 1920, height: 1080 },
    ]).bounds.x,
    59,
  );
  assert(fs.existsSync(path.join(root, 'data/settings-PC-A.json')));
  assert(!fs.existsSync(path.join(root, 'settings.json')));
  assert(!fs.existsSync(path.join(root, 'local-a/window-state.json')));
});
test('UI writes preserve concurrent settings and other windows, reject same-entry conflicts, and survive settings saves', (t) => {
  const { file, a } = fixture(t);
  const one = a.uiStateStorage('windows', 'page:example:one');
  one.read();
  const two = a.uiStateStorage('windows', 'page:example:two');
  two.read();
  const value = { bounds: { x: 1, y: 2, width: 1000, height: 700 }, maximized: false };
  one.write(value);
  two.write({ ...value, maximized: true });
  const next = structuredClone(a.value);
  next.host.theme = 'dark';
  a.save(next, a.revision);
  one.write({ ...value, bounds: { ...value.bounds, x: 10 } });
  assert.equal(a.value.host.theme, 'dark');
  assert.equal(a.device.value.uiState.windows['page:example:two'].maximized, true);
  const raw = disk(a.device.file);
  raw.uiState.windows['page:example:one'].bounds.x = 50;
  fs.writeFileSync(a.device.file, JSON.stringify(raw));
  assert.throws(() => one.write(value), /changed|変更/);
  assert.equal(disk(a.device.file).uiState.windows['page:example:one'].bounds.x, 50);
  const ribbon = a.uiStateStorage('ribbon');
  ribbon.read();
  const raw2 = disk(a.device.file);
  raw2.host.startAtLogon = true;
  fs.writeFileSync(a.device.file, JSON.stringify(raw2));
  ribbon.write({ schemaVersion: 1, expanded: {}, displayMode: 'expanded' });
  assert.equal(a.value.host.startAtLogon, true);
  assert.equal(disk(a.device.file).host.startAtLogon, true);
  assert.equal(disk(file).uiState, undefined);
  const { settingsCatalog, resetSettingsPage } = require('../out/main/shared/settings-catalog');
  const beforeUi = structuredClone(a.device.value.uiState);
  const appearance = settingsCatalog([], a.value).find((page) => page.id === 'appearance');
  a.save(resetSettingsPage(a.value, appearance, []), a.revision);
  assert.deepEqual(a.device.value.uiState, beforeUi, 'page reset keeps every UI state');
});

test('failed UI saves and invalid external device state preserve settings and the visible gallery size', (t) => {
  const { a } = fixture(t);
  const gallery = new GalleryViewStateStore(a.uiStateStorage('gallery'));
  gallery.save('library', 180);
  const before = fs.readFileSync(a.device.file);
  const rename = fs.renameSync;
  const mock = t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === a.device.file) throw Object.assign(Error('denied'), { code: 'EIO' });
    return rename(from, to);
  });
  assert.throws(() => gallery.save('library', 200));
  assert.equal(gallery.get('library'), 180);
  assert.deepEqual(fs.readFileSync(a.device.file), before);
  mock.mock.restore();
  const invalid = disk(a.device.file);
  invalid.uiState.gallery.library.cardWidth = -1;
  const bytes = JSON.stringify(invalid);
  fs.writeFileSync(a.device.file, bytes);
  assert.throws(() => gallery.save('picker', 200));
  assert.equal(fs.readFileSync(a.device.file, 'utf8'), bytes);
  assert.equal(gallery.get('library'), 180);
});
test('Storage API separates computers and owners, shares only explicit scope and never imports old local values', async (t) => {
  const { root, a } = fixture(t);
  const shared = path.join(root, 'data');
  const api = (machine) =>
    createHostApi(
      a,
      path.join(root, 'local-a'),
      () => {},
      () => {},
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      shared,
      undefined,
      undefined,
      undefined,
      machine,
    );
  const A = api('PC-A'),
    B = api('PC-B');
  const applet = {
    state: 'running',
    manifest: { id: 'example.storage', capabilities: ['storage'] },
  };
  fs.mkdirSync(path.join(root, 'local-a/storage/example.storage'), { recursive: true });
  fs.writeFileSync(path.join(root, 'local-a/storage/example.storage/item.json'), '"old"');
  assert.equal(await A(applet, 'host.storage.get', { key: 'item' }), null);
  await A(applet, 'host.storage.set', { key: 'item', value: { source: 'A' } });
  assert.deepEqual(await A(applet, 'host.storage.get', { key: 'item' }), { source: 'A' });
  assert.equal(await B(applet, 'host.storage.get', { key: 'item' }), null);
  await B(applet, 'host.storage.set', { key: 'item', value: { source: 'B' } });
  await A(applet, 'host.storage.set', { key: 'item', value: { shared: true }, scope: 'shared' });
  assert.deepEqual(await B(applet, 'host.storage.get', { key: 'item', scope: 'shared' }), {
    shared: true,
  });
  assert.equal(
    await B(
      { ...applet, manifest: { ...applet.manifest, id: 'example.other' } },
      'host.storage.get',
      { key: 'item', scope: 'shared' },
    ),
    null,
  );
  assert.equal(
    fs.readFileSync(path.join(root, 'local-a/storage/example.storage/item.json'), 'utf8'),
    '"old"',
  );
  assert.equal(
    disk(appletStorageFile(shared, 'example.storage', 'item', 'device', 'PC-A')).source,
    'A',
  );
  for (const scope of ['invalid', '../escape', null])
    await assert.rejects(A(applet, 'host.storage.set', { key: 'item', value: 1, scope }));
  await assert.rejects(A(applet, 'host.storage.set', { key: '../escape', value: 1 }));
  await assert.rejects(
    A({ ...applet, manifest: { ...applet.manifest, capabilities: [] } }, 'host.storage.get', {
      key: 'item',
    }),
  );
});
