const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Module = require('node:module');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');

const originalLoad = Module._load;
let WebSiteAccounts;
try {
  Module._load = function (name, ...args) {
    if (name !== 'electron') return originalLoad.call(this, name, ...args);
    return {
      session: {
        fromPath: (directory) => ({
          directory,
          setSpellCheckerEnabled() {},
          setPermissionCheckHandler() {},
          setPermissionRequestHandler() {},
          flushStorageData() {},
          cookies: { flushStore: async () => {} },
        }),
      },
    };
  };
  ({ WebSiteAccounts } = require('../out/main/main/core/web-site-accounts'));
} finally {
  Module._load = originalLoad;
}

const owner = 'at365.web-applet';
const key = 'sites';
function fixture(t) {
  const base = path.resolve('.artifacts/web-site-accounts', randomUUID());
  const local = path.join(base, 'local');
  const shared = path.join(base, 'data', 'settings.json');
  const store = new DeviceSettingsStore(shared, local, 'TEST-PC');
  store.load();
  t.after(() => {
    store.close();
    fs.rmSync(base, { recursive: true, force: true });
  });
  const failures = [];
  const accounts = () =>
    new WebSiteAccounts(
      local,
      () => store.confirmedAppletSources(),
      (error) => failures.push(error),
    );
  const root = path.join(local, 'web-account-groups');
  const directory = (id, group = owner, collection = key) =>
    path.join(root, group, 'site-sessions', collection, id);
  function seed(target) {
    fs.mkdirSync(target, { recursive: true });
    const marker = path.join(target, 'cookie-fixture');
    fs.writeFileSync(marker, 'local login');
    return marker;
  }
  function saveSites(sharedIds, deviceIds) {
    const shared = structuredClone(store.shared.value);
    shared.extensions[owner] = {
      enabled: false,
      settings: { [key]: sharedIds.map((id) => ({ id, enabled: false })) },
    };
    store.shared.save(shared, store.shared.revision);
    const device = structuredClone(store.device.value);
    device.extensions[owner] = {
      enabled: false,
      useLocalSettings: false,
      configuration: { settings: { [key]: deviceIds.map((id) => ({ id })) } },
    };
    store.device.save(device, store.device.revision);
  }
  return { store, accounts, directory, saveSites, root, failures, seed };
}

test('site groups reuse their own persistent path and isolate the same ID in other collections and groups', async (t) => {
  const f = fixture(t);
  const itemId = randomUUID();
  const accounts = f.accounts();
  const binding = { owner, key, itemId };
  const first = accounts.session(binding);
  assert.equal(first.directory, f.directory(itemId));
  assert.equal(accounts.session(binding), first);
  assert.notEqual(
    accounts.session({ ...binding, owner: 'fixture.other' }).directory,
    first.directory,
  );
  assert.notEqual(accounts.session({ ...binding, key: 'other' }).directory, first.directory);
  assert.notEqual(
    accounts.session({ ...binding, itemId: randomUUID() }).directory,
    first.directory,
  );
  assert.throws(() => accounts.session({ ...binding, key: 'nul.txt' }), /保存先/);
  assert.throws(() => accounts.session({ ...binding, itemId: '../sessions' }), /保存先/);
  await accounts.flush();
});

test('startup collects orphaned site sessions with no installed Applet and preserves both settings sources and manual groups', (t) => {
  const f = fixture(t);
  const shared = randomUUID(),
    device = randomUUID(),
    removed = randomUUID();
  f.saveSites([shared], [device]);
  const kept = [
    f.seed(f.directory(shared)),
    f.seed(f.directory(device)),
    f.seed(path.join(f.root, 'at365.google', 'sessions', removed)),
  ];
  const orphan = f.seed(f.directory(removed));
  f.accounts().cleanup(new Set([owner]));
  assert(fs.existsSync(orphan));
  f.accounts().cleanup();
  assert.equal(fs.existsSync(orphan), false);
  for (const file of kept) assert.equal(fs.readFileSync(file, 'utf8'), 'local login');
  f.saveSites([], []);
  f.accounts().cleanup();
  assert.equal(fs.existsSync(kept[0]), false);
  assert.equal(fs.existsSync(kept[1]), false);
  assert.equal(fs.existsSync(kept[2]), true);
  assert.deepEqual(f.failures, []);
});

test('unconfirmed or malformed settings and sessions opened by this process defer cleanup', (t) => {
  const f = fixture(t);
  const id = randomUUID();
  const accounts = f.accounts();
  accounts.session({ owner, key, itemId: id });
  const marker = f.seed(f.directory(id));
  accounts.cleanup();
  assert(fs.existsSync(marker));
  const restarted = f.accounts();
  const bytes = fs.readFileSync(f.store.device.file);
  fs.writeFileSync(f.store.device.file, '{');
  restarted.cleanup();
  assert(fs.existsSync(marker));
  fs.writeFileSync(f.store.device.file, bytes);
  f.saveSites(['invalid'], []);
  restarted.cleanup();
  assert(fs.existsSync(marker));
  f.saveSites([], []);
  restarted.cleanup();
  assert.equal(fs.existsSync(marker), false);
});

test('locked directories are retried and redirected session directories are left alone', (t) => {
  const f = fixture(t);
  const target = f.directory(randomUUID());
  const marker = f.seed(target);
  const outside = path.join(path.dirname(f.root), 'outside');
  const outsideMarker = f.seed(outside);
  const link = f.directory(randomUUID());
  fs.symlinkSync(outside, link, 'junction');
  const remove = fs.rmSync;
  const mocked = t.mock.method(fs, 'rmSync', (file, options) => {
    if (file === target) throw Object.assign(Error('locked'), { code: 'EPERM' });
    return remove(file, options);
  });
  f.accounts().cleanup();
  assert.equal(f.failures.length, 1);
  assert(fs.existsSync(marker));
  mocked.mock.restore();
  f.accounts().cleanup();
  assert.equal(fs.existsSync(marker), false);
  assert(fs.lstatSync(link).isSymbolicLink());
  assert.equal(fs.readFileSync(outsideMarker, 'utf8'), 'local login');
});
