const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { WebProfileStore } = require('../out/main/main/core/web-profiles');
const { SettingsStore, defaults } = require('../out/main/main/core/settings');
const { parseWebProfiles } = require('../out/main/shared/web-content');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-web-profiles-'));
  const account = { id: `account.${randomUUID()}`, name: '既存の個人用' };
  const value = defaults();
  value.webApplets = {
    accounts: [account],
    items: [
      {
        id: `web.${randomUUID()}`,
        name: '既存ページ',
        url: 'https://example.test/',
        accountId: account.id,
        enabled: true,
        display: 'page',
        navigation: 'same-origin',
        allowedOrigins: [],
        icon: '',
      },
    ],
  };
  const settings = new SettingsStore(path.join(root, 'settings.json'));
  fs.writeFileSync(settings.file, JSON.stringify(value));
  settings.load();
  const file = path.join(root, 'data', 'web-applets', 'accounts.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, accounts: [account] }));
  return { root, account, settings, file, value };
}

test('Immediate account operations persist independently of settings bytes/revision and restart', () => {
  const f = fixture();
  try {
    const store = new WebProfileStore(f.file);
    store.loadStandalone(() => true);
    const before = fs.readFileSync(f.settings.file),
      revision = f.settings.revision;
    const other = store.add('仕事用');
    store.rename(other.id, '変更した仕事用');
    assert.equal(
      JSON.parse(fs.readFileSync(f.file)).accounts.find((a) => a.id === other.id).name,
      '変更した仕事用',
    );
    store.remove(other.id);
    assert.deepEqual(fs.readFileSync(f.settings.file), before);
    assert.equal(f.settings.revision, revision);
    const restarted = new WebProfileStore(f.file);
    restarted.loadStandalone(() => true);
    assert.deepEqual(restarted.snapshot(), [f.account]);
    assert.throws(() => restarted.get(other.id));
    assert.throws(() => store.rename(f.account.id, ''));
    assert.deepEqual(store.snapshot(), [f.account]);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('Invalid or externally changed roster is preserved instead of overwritten', () => {
  const f = fixture();
  try {
    const store = new WebProfileStore(f.file);
    store.loadStandalone(() => true);
    const external = JSON.stringify({
      schemaVersion: 1,
      accounts: [{ ...f.account, name: '外部で変更' }],
    });
    fs.writeFileSync(f.file, external);
    assert.throws(() => store.rename(f.account.id, '上書き禁止'));
    assert.equal(fs.readFileSync(f.file, 'utf8'), external);
    fs.writeFileSync(f.file, 'invalid account file');
    const settingsBytes = fs.readFileSync(f.settings.file);
    assert.throws(() => new WebProfileStore(f.file).loadStandalone(() => true));
    assert.equal(fs.readFileSync(f.file, 'utf8'), 'invalid account file');
    assert.deepEqual(fs.readFileSync(f.settings.file), settingsBytes);
    assert.throws(() => parseWebProfiles([f.account, f.account]));
    assert.doesNotThrow(() =>
      parseWebProfiles(
        Array.from({ length: 33 }, () => ({ id: `account.${randomUUID()}`, name: '枠' })),
      ),
    );
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('Deletion persists its cleanup record and only removes the unused session directory', () => {
  const f = fixture();
  try {
    const store = new WebProfileStore(f.file);
    store.loadStandalone(() => true);
    const removed = store.add('削除する枠');
    const root = path.join(path.dirname(f.file), 'sessions');
    const target = path.join(root, removed.id);
    const active = path.join(root, f.account.id);
    fs.mkdirSync(path.join(target, 'Cache'), { recursive: true });
    fs.writeFileSync(path.join(target, 'Cache', 'data'), 'deleted data');
    fs.mkdirSync(active, { recursive: true });
    fs.writeFileSync(path.join(active, 'Cookies'), 'preserve');
    const settingsBytes = fs.readFileSync(f.settings.file);
    store.remove(removed.id);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.file)).pendingDeletion, [removed.id]);
    assert.deepEqual(store.cleanupSessions([removed.id]), [removed.id]);
    assert.ok(fs.existsSync(target));
    assert.deepEqual(store.cleanupSessions([], [removed.id]), [removed.id]);
    assert.deepEqual(store.cleanupSessions([]), []);
    assert.equal(fs.existsSync(target), false);
    assert.equal(fs.readFileSync(path.join(active, 'Cookies'), 'utf8'), 'preserve');
    assert.deepEqual(fs.readFileSync(f.settings.file), settingsBytes);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.file)).pendingDeletion, []);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('Locked deletion remains tracked across restart and retries without touching active accounts', (t) => {
  const f = fixture();
  try {
    const store = new WebProfileStore(f.file);
    store.loadStandalone(() => true);
    const removed = store.add('ロックされる枠');
    const target = path.join(path.dirname(f.file), 'sessions', removed.id);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'Cookies'), 'pending');
    store.remove(removed.id);
    const original = fs.rmSync;
    const mock = t.mock.method(fs, 'rmSync', (file, options) => {
      if (file === target) throw Object.assign(Error('locked'), { code: 'EBUSY' });
      return original(file, options);
    });
    assert.deepEqual(store.cleanupSessions([]), [removed.id]);
    const restarted = new WebProfileStore(f.file);
    restarted.loadStandalone(() => true);
    assert.deepEqual(restarted.pendingDeletion(), [removed.id]);
    assert.ok(fs.existsSync(target));
    mock.mock.restore();
    assert.deepEqual(restarted.cleanupSessions([]), []);
    assert.equal(fs.existsSync(target), false);
    assert.deepEqual(restarted.snapshot(), [f.account]);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('Cleanup rejects path traversal and redirected roots, and preserves files beyond nested junctions', () => {
  const f = fixture();
  try {
    const store = new WebProfileStore(f.file);
    store.loadStandalone(() => true);
    const removed = store.add('リンクの枠');
    store.remove(removed.id);
    const root = path.join(path.dirname(f.file), 'sessions');
    const outside = path.join(f.root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'marker'), 'keep');
    fs.symlinkSync(outside, root, 'junction');
    assert.deepEqual(store.cleanupSessions([]), [removed.id]);
    fs.unlinkSync(root);
    fs.mkdirSync(root);
    const target = path.join(root, removed.id);
    fs.symlinkSync(outside, target, 'junction');
    assert.deepEqual(store.cleanupSessions([]), [removed.id]);
    fs.unlinkSync(target);
    fs.mkdirSync(target);
    fs.symlinkSync(outside, path.join(target, 'nested'), 'junction');
    assert.deepEqual(store.cleanupSessions([]), []);
    assert.equal(fs.readFileSync(path.join(outside, 'marker'), 'utf8'), 'keep');
    const unsafe = JSON.stringify({
      schemaVersion: 1,
      accounts: [f.account],
      pendingDeletion: ['../outside'],
    });
    fs.writeFileSync(f.file, unsafe);
    assert.throws(() => new WebProfileStore(f.file).loadStandalone(() => true));
    assert.equal(fs.readFileSync(f.file, 'utf8'), unsafe);
    assert.equal(fs.readFileSync(path.join(outside, 'marker'), 'utf8'), 'keep');
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
