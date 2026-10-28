const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SettingsStore,
  SettingsConflictError,
  defaults,
  atomicWrite,
} = require('../out/main/main/core/settings');
const { SettingsHealth } = require('../out/main/main/core/settings-health');
const { recoverSettingsAtStartup } = require('../out/main/main/core/settings-recovery');
function fixture(t) {
  const root = fs.mkdtempSync(path.resolve('.artifacts/settings-recovery-unit-'));
  const file = path.join(root, 'settings.json'),
    backup = path.join(root, 'backups');
  const store = new SettingsStore(file, backup);
  t.after(() => store.close());
  return { root, file, backup, store };
}
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
test('first-run creation adopts a concurrently delivered file, and an unreadable backup location never creates defaults', (t) => {
  const f = fixture(t),
    remote = defaults();
  remote.profile = { ...remote.profile, name: 'first incoming' };
  const originalWrite = fs.writeFileSync;
  try {
    fs.writeFileSync = (file, ...args) => {
      if (file.startsWith(f.file + '.') && file.endsWith('.tmp'))
        originalWrite(f.file, JSON.stringify(remote));
      return originalWrite(file, ...args);
    };
    f.store.load();
  } finally {
    fs.writeFileSync = originalWrite;
  }
  assert.equal(f.store.value.profile?.name, 'first incoming');
  assert.equal(fs.readFileSync(f.file, 'utf8'), JSON.stringify(remote));
  const blocked = fixture(t);
  fs.writeFileSync(blocked.backup, 'not a directory');
  assert.throws(() => blocked.store.load());
  assert.equal(fs.existsSync(blocked.file), false);
});
test('watcher reports the same parse failure after a direct read consumed a brief healthy interval', async (t) => {
  const f = fixture(t);
  f.store.load();
  f.store.watch(() => {});
  const until = async (fn) => {
    const end = Date.now() + 6000;
    while (!fn()) {
      assert(Date.now() < end);
      await new Promise((r) => setTimeout(r, 30));
    }
  };
  fs.writeFileSync(f.file, '{broken');
  await until(() => f.store.recovered);
  write(f.file, defaults());
  f.store.reload();
  assert.equal(f.store.recovered, false);
  fs.writeFileSync(f.file, '{broken');
  await until(() => f.store.recovered);
  assert(f.store.health.has('read'));
});
test('backup failure accepts external settings, preserves read-only arrival and clears only after backup succeeds', (t) => {
  const f = fixture(t);
  write(f.file, defaults());
  fs.writeFileSync(f.backup, 'blocked');
  f.store.load();
  const remote = defaults();
  remote.profile = { ...remote.profile, name: 'remote' };
  write(f.file, remote);
  const raw = fs.readFileSync(f.file);
  f.store.reload();
  assert.equal(f.store.value.profile?.name, 'remote');
  assert.deepEqual(fs.readFileSync(f.file), raw);
  assert(f.store.health.has('backup'));
  fs.unlinkSync(f.backup);
  f.store.reload();
  assert(!f.store.syncError);
});
test('restore validates the latest backup, preserves exact damaged bytes and updates the store only after commit', (t) => {
  const f = fixture(t);
  f.store.load();
  const newer = defaults();
  newer.profile = { ...newer.profile, name: 'new backup' };
  write(path.join(f.backup, 'last-good.json'), newer);
  const broken = Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0xff, 0x00]);
  fs.writeFileSync(f.file, broken);
  assert.throws(() => f.store.reload());
  const plan = f.store.prepareRecovery();
  f.store.restoreRecovery(plan);
  assert.equal(f.store.value.profile?.name, 'new backup');
  assert.equal(JSON.parse(fs.readFileSync(f.file)).profile?.name, 'new backup');
  const evidence = fs.readdirSync(f.backup).find((n) => n.startsWith('invalid-'));
  assert.deepEqual(fs.readFileSync(path.join(f.backup, evidence)), broken);
  assert.equal(f.store.recovered, false);
  assert.equal(f.store.syncError, undefined);
});
test('valid incoming settings and changed corrupt bytes during confirmation both cancel restoration', (t) => {
  const f = fixture(t);
  f.store.load();
  fs.writeFileSync(f.file, '{bad');
  const plan = f.store.prepareRecovery();
  const remote = defaults();
  remote.profile = { ...remote.profile, name: 'incoming' };
  write(f.file, remote);
  assert.throws(() => f.store.restoreRecovery(plan), /正常な設定/);
  assert.equal(f.store.value.profile?.name, 'incoming');
  fs.writeFileSync(f.file, '{bad');
  const other = f.store.prepareRecovery();
  fs.writeFileSync(f.file, '{changed');
  assert.throws(() => f.store.restoreRecovery(other), SettingsConflictError);
  assert.equal(fs.readFileSync(f.file, 'utf8'), '{changed');
});
test('changed recovery candidate and unpreservable targets are never overwritten', (t) => {
  const f = fixture(t);
  f.store.load();
  fs.writeFileSync(f.file, '{bad');
  const plan = f.store.prepareRecovery();
  const next = defaults();
  next.profile = { ...next.profile, name: 'changed' };
  write(plan.candidate, next);
  assert.throws(() => f.store.restoreRecovery(plan), SettingsConflictError);
  assert.equal(fs.readFileSync(f.file, 'utf8'), '{bad');
  fs.writeFileSync(f.file, Buffer.alloc(4 * 1024 * 1024 + 1));
  assert.doesNotThrow(() => f.store.prepareRecovery());
  assert.equal(fs.statSync(f.file).size, 4 * 1024 * 1024 + 1);
  fs.unlinkSync(f.file);
  fs.mkdirSync(f.file);
  assert.throws(() => f.store.prepareRecovery());
});
test('failed preservation leaves target intact and failed replacement leaves the running value intact', (t) => {
  const f = fixture(t);
  f.store.load();
  fs.writeFileSync(f.file, '{bad');
  const external = path.join(f.root, 'external.json');
  const next = defaults();
  next.profile = { ...next.profile, name: 'restore' };
  write(external, next);
  const plan = f.store.prepareRecovery(external);
  const originalWrite = fs.writeFileSync;
  try {
    fs.writeFileSync = (file, ...args) => {
      if (path.basename(file).startsWith('invalid-'))
        throw Object.assign(Error('cannot preserve'), { code: 'EACCES' });
      return originalWrite(file, ...args);
    };
    assert.throws(() => f.store.restoreRecovery(plan), /退避/);
  } finally {
    fs.writeFileSync = originalWrite;
  }
  assert.equal(fs.readFileSync(f.file, 'utf8'), '{bad');
  const rename = fs.renameSync;
  try {
    fs.renameSync = (from, to) => {
      if (to === f.file) throw Object.assign(Error('private failure'), { code: 'ENOSPC' });
      return rename(from, to);
    };
    assert.throws(() => f.store.restoreRecovery(plan));
  } finally {
    fs.renameSync = rename;
  }
  assert.notEqual(f.store.value.profile?.name, 'restore');
  assert.equal(fs.readFileSync(f.file, 'utf8'), '{bad');
  assert(f.store.health.has('save'));
  f.store.restoreRecovery(plan);
  assert.equal(f.store.syncError, undefined);
});
test('atomic replacement checks expected bytes before the first rename and removes its temporary file', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.file, 'incoming');
  assert.throws(
    () => atomicWrite(f.file, 'replacement', { previous: Buffer.from('old') }),
    SettingsConflictError,
  );
  assert.equal(fs.readFileSync(f.file, 'utf8'), 'incoming');
  assert.deepEqual(fs.readdirSync(f.root), ['settings.json']);
});
test(
  'a genuine Windows file lock still reports save failure and preserves the last saved settings',
  { skip: process.platform !== 'win32' },
  (t) => {
    const f = fixture(t);
    f.store.load();
    const before = fs.readFileSync(f.file);
    const next = structuredClone(f.store.value);
    next.profile = { ...next.profile, name: 'after lock release' };
    const fd = fs.openSync(f.file, 'r');
    try {
      assert.throws(() => f.store.save(next, f.store.revision), { code: 'EPERM' });
      assert(f.store.health.has('save'));
      assert(fs.readFileSync(f.file).equals(before));
      assert.notEqual(f.store.value.profile?.name, next.profile.name);
    } finally {
      fs.closeSync(fd);
    }
    f.store.save(next, f.store.revision);
    assert.equal(f.store.syncError, undefined);
    assert.equal(JSON.parse(fs.readFileSync(f.file)).profile.name, next.profile.name);
    assert(!fs.readdirSync(f.root).some((name) => name.endsWith('.tmp')));
  },
);
test(
  'a concurrent external edit during a Windows retry is preserved instead of repeating a toggle',
  { skip: process.platform !== 'win32' },
  (t) => {
    const f = fixture(t);
    fs.writeFileSync(f.file, 'original');
    const rename = fs.renameSync;
    let attempts = 0;
    t.mock.method(fs, 'renameSync', (from, to) => {
      if (to !== f.file) return rename(from, to);
      attempts++;
      fs.writeFileSync(f.file, 'external edit');
      throw Object.assign(Error('temporary lock'), { code: 'EPERM' });
    });
    assert.throws(() => atomicWrite(f.file, 'replacement'), SettingsConflictError);
    assert.equal(attempts, 1);
    assert.equal(fs.readFileSync(f.file, 'utf8'), 'external edit');
    assert.deepEqual(fs.readdirSync(f.root), ['settings.json']);
  },
);
test('startup fallback never overwrites corrupt input and still finds a generation if last-good is invalid', (t) => {
  const f = fixture(t);
  f.store.load();
  fs.writeFileSync(f.file, '{bad');
  fs.writeFileSync(path.join(f.backup, 'last-good.json'), '{bad');
  const restarted = new SettingsStore(f.file, f.backup);
  restarted.load();
  assert(restarted.recovered);
  assert(restarted.health.all()[0].immediate);
  assert.equal(fs.readFileSync(f.file, 'utf8'), '{bad');
});
test('startup recovery cancel/reload never creates defaults; a selected valid JSON restores and requests relaunch', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{bad');
  assert.throws(() => f.store.load());
  const external = path.join(f.root, 'external.json');
  const selected = defaults();
  selected.host.hardwareAcceleration = true;
  write(external, selected);
  let step = 0,
    confirms = 0;
  const result = await recoverSettingsAtStartup(f.store, {
    chooseStartupAction: async () => ['restore', 'reload', 'restore'][step++],
    chooseJson: async () => external,
    confirm: async () => {
      confirms++;
      if (confirms === 1) {
        fs.unlinkSync(f.file);
        return false;
      }
      return true;
    },
    openDirectory: async () => {},
  });
  assert.equal(result, true);
  assert.equal(step, 3);
  assert.equal(confirms, 2);
  assert.equal(JSON.parse(fs.readFileSync(f.file)).host.hardwareAcceleration, true);
});
test('startup recovery accepts valid sync during confirmation without overwriting it', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{bad');
  assert.throws(() => f.store.load());
  const external = path.join(f.root, 'external.json');
  write(external, defaults());
  const remote = defaults();
  remote.profile = { ...remote.profile, name: 'remote wins' };
  assert.equal(
    await recoverSettingsAtStartup(f.store, {
      chooseStartupAction: async () => 'restore',
      chooseJson: async () => external,
      openDirectory: async () => {},
      confirm: async () => {
        write(f.file, remote);
        return true;
      },
    }),
    true,
  );
  assert.equal(f.store.value.profile?.name, 'remote wins');
});
test('save errors persist across successful reads and validation/conflict do not become operational errors', (t) => {
  const f = fixture(t);
  f.store.load();
  assert.throws(() => f.store.save({}, f.store.revision));
  assert.equal(f.store.syncError, undefined);
  assert.throws(() => f.store.save(defaults(), 0), SettingsConflictError);
  assert.equal(f.store.syncError, undefined);
  const rename = fs.renameSync;
  try {
    fs.renameSync = (from, to) => {
      if (to === f.file) throw Error('private token');
      return rename(from, to);
    };
    assert.throws(() => f.store.save(defaults(), f.store.revision));
  } finally {
    fs.renameSync = rename;
  }
  assert(f.store.health.has('save'));
  assert(!f.store.syncError.includes('private token'));
  f.store.reload();
  assert(f.store.health.has('save'));
  f.store.save(defaults(), f.store.revision);
  assert.equal(f.store.syncError, undefined);
});
test('an old asynchronous apply result cannot clear or replace a newer failure', () => {
  const health = new SettingsHealth(() => {});
  health.set('apply', 'apply-failed', 4);
  health.clear('apply', 3);
  assert(health.has('apply'));
  health.clear('apply', 5);
  health.set('apply', 'apply-failed', 4);
  assert(!health.has('apply'));
});
