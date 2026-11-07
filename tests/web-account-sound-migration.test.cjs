const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path');
const Module = require('node:module'),
  load = Module._load;
Module._load = function (name, ...args) {
  return name === 'electron'
    ? { shell: {}, clipboard: {}, dialog: {} }
    : load.call(this, name, ...args);
};
const { SoundLibraryService } = require('../out/main/main/core/sound-library-service');
const { WebAccountController } = require('../out/main/main/core/web-accounts');
Module._load = load;
const { migrateWebAccountSounds } = require('../out/main/main/core/web-account-sound-migration');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { wave } = require('../scripts/sound-library-fixture.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.resolve('.artifacts/sound-migration-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const old = path.join(root, 'legacy'),
    stateRoot = path.join(root, 'state');
  await fs.mkdir(old);
  await fs.mkdir(stateRoot);
  const settings = {
    value: createDefaultSettings(),
    revision: 1,
    save(v) {
      this.value = v;
      this.revision++;
    },
  };
  const library = new SoundLibraryService(
    path.join(root, 'assets', 'sounds'),
    { settings, writable() {}, window: () => undefined, show() {} },
    () => {},
    () => assert.fail('audio playback during migration'),
  );
  t.after(() => library.close());
  let accounts = [],
    writes = 0;
  const failures = [];
  const options = {
    owner: 'at365.gmail',
    root: stateRoot,
    legacyDirectory: old,
    library,
    active: () => true,
    apply(updates) {
      accounts = accounts.map((a) => {
        const u = updates.find((u) => u.id === a.id && u.original === JSON.stringify(a.sound));
        return u ? { ...a, sound: u.sound } : a;
      });
      writes++;
      return accounts.every((a) => !a.sound?.file || a.sound.file.startsWith('@library/'));
    },
    failed(id) {
      failures.push(id || 'catalog');
    },
  };
  return {
    root,
    old,
    stateRoot,
    library,
    options,
    failures,
    marker: path.join(stateRoot, 'sound-library-migration.json'),
    accounts: () => accounts,
    setAccounts: (a) => {
      accounts = structuredClone(a);
    },
    writes: () => writes,
    async run(overrides = {}) {
      return migrateWebAccountSounds({
        ...options,
        accounts: structuredClone(accounts),
        ...overrides,
      });
    },
    async add(name, ms = 100) {
      const file = path.join(old, name);
      await fs.writeFile(file, wave(ms));
      return file;
    },
  };
}

test('imports every old sound and retains enabled/disabled account assignments with exact bytes', async (t) => {
  const f = await fixture(t),
    bell = await f.add('ベル.wav'),
    unused = await f.add('未使用.wav', 200);
  const external = path.join(f.root, '外部.wav');
  await fs.writeFile(external, wave(300));
  f.setAccounts([
    { id: 'on', sound: { enabled: true, file: 'ベル.wav' } },
    { id: 'off', sound: { enabled: false, file: 'ベル.wav' } },
    { id: 'external', sound: { enabled: false, file: external } },
    { id: 'none', sound: { enabled: false, file: '' } },
  ]);
  await f.run();
  assert.deepEqual(f.failures, []);
  assert.equal(f.accounts()[0].sound.file, f.accounts()[1].sound.file);
  assert.equal(f.accounts()[0].sound.enabled, true);
  assert.equal(f.accounts()[1].sound.enabled, false);
  assert.equal(f.accounts()[0].sound.name, 'ベル.wav');
  assert.deepEqual(
    await fs.readFile(await f.library.resolve(f.accounts()[0].sound.file)),
    wave(100),
  );
  assert.deepEqual(
    await fs.readFile(await f.library.resolve(f.accounts()[2].sound.file)),
    wave(300),
  );
  assert.deepEqual(
    await fs.readFile(
      path.join(
        f.root,
        'assets',
        'sounds',
        'Imported notification sounds',
        'at365.gmail',
        '未使用.wav',
      ),
    ),
    await fs.readFile(unused),
  );
  assert.equal(JSON.parse(await fs.readFile(f.marker, 'utf8')).completed, true);
  await fs.writeFile(bell, wave(400));
  await f.run();
  assert.deepEqual(
    await fs.readFile(await f.library.resolve(f.accounts()[0].sound.file)),
    wave(100),
  );
  assert.deepEqual(await fs.readFile(bell), wave(400));
});

test('same-name originals are retained separately without overwriting existing library audio or changing filenames', async (t) => {
  const f = await fixture(t);
  await f.add('bell.wav');
  await f.library.files.add(wave(300), 'bell.wav');
  f.setAccounts([{ id: 'a', sound: { enabled: true, file: 'bell.wav' } }]);
  await f.run();
  assert.deepEqual(await fs.readFile(path.join(f.root, 'assets', 'sounds', 'bell.wav')), wave(300));
  const g = await fixture(t);
  const source = await g.add('bell.wav');
  await g.library.files.add(wave(200), 'Imported notification sounds/at365.gmail/bell.wav');
  const account = { id: 'a', sound: { enabled: true, file: 'bell.wav' } };
  g.setAccounts([account]);
  await g.run();
  assert.deepEqual(g.failures, []);
  assert.equal(g.accounts()[0].sound.name, 'bell.wav');
  assert.equal(g.accounts()[0].sound.enabled, true);
  assert.deepEqual(
    await fs.readFile(await g.library.resolve(g.accounts()[0].sound.file)),
    wave(100),
  );
  assert.deepEqual(
    await fs.readFile(
      path.join(
        g.root,
        'assets',
        'sounds',
        'Imported notification sounds',
        'at365.gmail',
        'bell.wav',
      ),
    ),
    wave(200),
  );
  assert.deepEqual(await fs.readFile(source), wave(100));
});

test('failed account saving stays retryable without deleting or duplicating imported audio', async (t) => {
  const f = await fixture(t);
  const source = await f.add('bell.wav');
  const account = { id: 'a', sound: { enabled: false, file: 'bell.wav' } };
  f.setAccounts([account]);
  await assert.rejects(
    f.run({
      apply() {
        throw Error('disk conflict');
      },
    }),
    /disk conflict/,
  );
  assert.deepEqual(f.accounts(), [account]);
  await assert.rejects(fs.stat(f.marker), { code: 'ENOENT' });
  await f.run();
  assert(f.accounts()[0].sound.file.startsWith('@library/@assigned/'));
  assert.deepEqual(
    await fs.readdir(
      path.join(f.root, 'assets', 'sounds', 'Imported notification sounds', 'at365.gmail'),
    ),
    ['bell.wav'],
  );
  assert.deepEqual(await fs.readFile(source), wave(100));
});

test('missing sounds retain their account preferences while successful accounts migrate and a later retry finishes', async (t) => {
  const f = await fixture(t);
  await f.add('good.wav');
  f.setAccounts([
    { id: 'a', sound: { enabled: true, file: 'good.wav' } },
    { id: 'b', sound: { enabled: false, file: 'missing.wav' } },
  ]);
  await f.run();
  assert(f.accounts()[0].sound.file.startsWith('@library/'));
  assert.equal(f.accounts()[1].sound.file, 'missing.wav');
  assert(f.failures.includes('b'));
  await assert.rejects(fs.stat(f.marker), { code: 'ENOENT' });
  await f.add('missing.wav', 200);
  await f.run();
  assert(f.accounts()[1].sound.file.startsWith('@library/'));
  assert.equal(f.accounts()[1].sound.enabled, false);
  assert.equal(JSON.parse(await fs.readFile(f.marker, 'utf8')).completed, true);
});

test('controller migration preserves an account edit made during copying and stopping does not apply pending assignments', async (t) => {
  for (const action of ['edit', 'stop']) {
    const f = await fixture(t);
    await f.add('bell.wav');
    const state = {
      version: 1,
      selected: 'a',
      accounts: [{ id: 'a', sound: { enabled: false, file: 'bell.wav' } }],
    };
    const controller = {
      id: 'at365.gmail',
      root: f.stateRoot,
      state,
      disposed: false,
      deleting: new Set(),
      soundFailures: new Map(),
      save(next) {
        this.state = next;
      },
      view() {},
      services: {
        legacySoundDirectory: f.old,
        failed() {},
        soundLibrary: {
          ...f.library,
          importLegacy: async (...args) => {
            const result = await f.library.importLegacy(...args);
            if (action === 'edit') controller.state.accounts[0].sound = { enabled: true, file: '' };
            else controller.disposed = true;
            return result;
          },
        },
      },
    };
    Object.setPrototypeOf(controller, WebAccountController.prototype);
    await controller.start();
    assert.deepEqual(
      controller.state.accounts[0].sound,
      action === 'edit' ? { enabled: true, file: '' } : { enabled: false, file: 'bell.wav' },
    );
    if (action === 'stop') await assert.rejects(fs.stat(f.marker), { code: 'ENOENT' });
  }
});
