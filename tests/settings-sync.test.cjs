const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { SettingsStore, defaults } = require('../out/main/main/core/settings');
const { dataPaths } = require('../out/main/main/core/data-paths');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-sync-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
async function until(fn) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > 6000) throw Error('sync timeout');
    await new Promise((r) => setTimeout(r, 30));
  }
}
test('received settings retain dirty revision, reject partial JSON and recover after rename without writeback', async (t) => {
  const root = fixture(t),
    file = path.join(root, 'settings.json'),
    store = new SettingsStore(file, path.join(root, 'local', 'backups'));
  store.load();
  t.after(() => store.close());
  store.watch(() => {});
  const old = store.revision,
    remote = defaults();
  remote.host.theme = 'dark';
  fs.writeFileSync(file, '{broken');
  await until(() => store.syncError);
  assert.equal(store.value.host.theme, 'light');
  const raw = JSON.stringify(remote);
  fs.writeFileSync(file + '.incoming', raw);
  fs.renameSync(file + '.incoming', file);
  await until(() => store.value.host.theme === 'dark');
  assert.equal(fs.readFileSync(file, 'utf8'), raw);
  assert.throws(() => store.save(defaults(), old), /別の場所/);
  assert.equal(store.syncError, undefined);
  // The same valid bytes must clear an error after temporary disappearance.
  fs.renameSync(file, file + '.away');
  await until(() => store.syncError);
  fs.renameSync(file + '.away', file);
  await until(() => !store.syncError);
});
test('PC-local generations survive corruption and restart; incoming valid settings cancel explicit restoration', async (t) => {
  const root = fixture(t),
    file = path.join(root, 'settings.json'),
    backup = path.join(root, 'local', 'backups');
  const first = new SettingsStore(file, backup);
  first.load();
  for (let i = 0; i < 24; i++) {
    const next = structuredClone(first.value);
    next.profile = { ...next.profile, name: 'generation ' + i };
    first.save(next, first.revision);
  }
  assert.equal(fs.readdirSync(backup).filter((n) => n.startsWith('settings-')).length, 20);
  fs.writeFileSync(file, '{broken');
  const second = new SettingsStore(file, backup);
  second.load();
  assert.equal(second.value.profile?.name, 'generation 23');
  assert.equal(second.recovered, true);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  assert.equal(second.confirmedValue(), undefined);
  assert.throws(() => second.save(defaults(), second.revision));
  const good = defaults();
  good.profile = { ...good.profile, name: 'remote won' };
  fs.writeFileSync(file, JSON.stringify(good));
  assert.throws(() => second.restoreBackup(second.revision), /正常な設定/);
  assert.equal(second.value.profile?.name, 'remote won');
  fs.writeFileSync(file, '{broken');
  const third = new SettingsStore(file, backup);
  third.load();
  third.restoreBackup(third.revision);
  assert.equal(JSON.parse(fs.readFileSync(file)).profile?.name, 'remote won');
  fs.unlinkSync(file);
  const missing = new SettingsStore(file, backup);
  missing.load();
  assert.equal(missing.recovered, true);
  assert.equal(fs.existsSync(file), false);
});
test('local state paths separate placements and leave the shared asset root beside the EXE', (t) => {
  const root = fixture(t),
    local = path.join(root, 'LocalAppData');
  const a = dataPaths(path.join(root, 'A'), local),
    b = dataPaths(path.join(root, 'B'), local);
  assert.notEqual(a.local, b.local);
  assert.equal(a.local, dataPaths(path.join(root, 'A'), local).local);
  assert.equal(a.assets, path.join(root, 'A', 'data', 'assets'));
  assert.equal(a.local.startsWith(local), true);
  assert.equal(path.dirname(a.local), path.join(local, 'at365', 'AppDock', 'profiles'));
});
