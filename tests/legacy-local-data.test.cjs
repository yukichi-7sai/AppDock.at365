const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const {
  inspectLegacyLocalData,
  LegacyLocalDataMonitor,
} = require('../out/main/main/core/legacy-local-data');

test('inspection distinguishes missing paths from denied access without exposing raw errors', (t) => {
  const inspect = t.mock.method(fs, 'lstatSync', (target) => {
    const error = Error('PRIVATE-EXCEPTION');
    error.code = target.endsWith('secrets') ? 'EACCES' : 'ENOENT';
    throw error;
  });
  const state = inspectLegacyLocalData(path.resolve('.artifacts/inspection'), path.resolve('.artifacts/inspection/data'), path.resolve('.artifacts/inspection/local'));
  inspect.mock.restore();
  assert.equal(state.scanFailed, true);
  assert.deepEqual(state.targets, []);
  assert(!JSON.stringify(state).includes('PRIVATE-EXCEPTION'));
});
test('only fixed legacy paths are listed, including empty folders, without reading or mutating data', (t) => {
  fs.mkdirSync('.artifacts', { recursive: true });
  const base = fs.mkdtempSync(path.resolve('.artifacts/legacy-data-unit-'));
  const shared = path.join(base, 'data'),
    local = path.join(base, 'local');
  const targets = [
    'data/chromium',
    '.appdock/storage',
    '.appdock/secrets',
    '.appdock/web-accounts',
    '.appdock/web-applets/sessions',
  ].map((p) => path.resolve(base, p));
  for (const p of [
    ...targets,
    path.join(shared, 'storage'),
    path.join(shared, 'assets/profile'),
    path.join(shared, 'web-applets'),
    path.join(local, 'chromium'),
  ])
    fs.mkdirSync(p, { recursive: true });
  const files = [
    'settings.json',
    'data/assets/profile/picture.png',
    'data/web-applets/accounts.json',
    '.appdock/secrets/private.json',
  ];
  for (const name of files) fs.writeFileSync(path.join(base, name), 'private-do-not-read-' + name);
  const before = files.map((name) => fs.readFileSync(path.join(base, name)));
  const found = inspectLegacyLocalData(base, shared, local);
  assert.equal(found.scanFailed, false);
  assert.deepEqual(found.targets.sort(), targets.sort());
  assert.deepEqual(
    files.map((name) => fs.readFileSync(path.join(base, name))),
    before,
  );
  assert.deepEqual(inspectLegacyLocalData(base, shared, shared), {
    targets: [],
    scanFailed: false,
  });
  // Each cleanup target is verified to remain inside this test's dedicated directory.
  t.after(() => {
    assert(path.resolve(base).startsWith(path.resolve('.artifacts') + path.sep));
    fs.rmSync(base, { recursive: true, force: true });
  });
});
test('monitor retains known targets on inspection failure, resolves on complete absence and starts a new episode on recurrence', () => {
  const episodes = [];
  let state = { targets: ['C:\\fixture\\data\\storage'], scanFailed: false },
    changes = 0;
  const warnings = {
    episode() {
      const e = {
        updates: [],
        resolves: 0,
        update(w) {
          this.updates.push(w);
        },
        resolve() {
          this.resolves++;
        },
      };
      episodes.push(e);
      return e;
    },
  };
  const monitor = new LegacyLocalDataMonitor({
    inspect: () => {
      if (state === 'throw') throw Error('SECRET');
      return structuredClone(state);
    },
    warnings,
    actions: [],
    changed: () => changes++,
  });
  monitor.refresh();
  monitor.refresh();
  assert.equal(episodes.length, 1);
  assert.equal(changes, 1);
  const originalId = episodes[0].updates[0].eventId;
  state = 'throw';
  monitor.refresh();
  assert.equal(monitor.snapshot().scanFailed, true);
  assert.deepEqual(monitor.snapshot().targets, ['C:\\fixture\\data\\storage']);
  assert.equal(episodes[0].resolves, 0);
  assert.equal(episodes[0].updates.at(-1).code, 'LEGACY_LOCAL_DATA_UNREADABLE');
  assert(!JSON.stringify(episodes).includes('SECRET'));
  state = { targets: [], scanFailed: false };
  monitor.refresh();
  assert.equal(episodes[0].resolves, 1);
  state = { targets: ['C:\\fixture\\data\\secrets'], scanFailed: false };
  monitor.refresh();
  assert.equal(episodes.length, 2);
  assert.notEqual(episodes[1].updates[0].eventId, originalId);
  monitor.dispose();
  monitor.refresh();
  assert.equal(episodes[1].updates.length, 1);
});
