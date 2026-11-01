const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path');
const Module = require('node:module');
const original = Module._load;
Module._load = function (name, ...args) {
  return name === 'electron'
    ? { shell: { trashItem: (file) => fs.unlink(file) }, clipboard: {}, dialog: {} }
    : original.call(this, name, ...args);
};
const { SoundLibraryService } = require('../out/main/main/core/sound-library-service');
const { AssetLibraryHost } = require('../out/main/main/core/asset-library-host');
const { LibrarySoundPreview } = require('../out/main/main/core/library-sound-preview');
const {
  WebAccountController,
  parseWebAccountSound,
} = require('../out/main/main/core/web-accounts');
Module._load = original;
const {
  RegisteredSoundLibrary,
  waveDuration,
} = require('../out/main/main/core/registered-sound-library');
const { RegisteredImages } = require('../out/main/main/core/registered-images');
const { AudioPlaybackQueue } = require('../out/main/main/core/audio-playback');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { parseDeviceUiState } = require('../out/main/main/core/device-ui-state');
const { libraryPath, soundLibraryReference } = require('../out/main/shared/library-assets');
const { wave } = require('../scripts/sound-library-fixture.cjs');
const turn = () => new Promise((r) => setImmediate(r));
const root = path.resolve('.artifacts/sound-library-unit-' + Date.now());
let serial = 0;
async function fixture(t) {
  const directory = path.join(root, String(++serial), 'sounds');
  const settings = {
    value: createDefaultSettings(),
    revision: 1,
    save(value, revision) {
      assert.equal(revision, this.revision);
      this.value = value;
      this.revision++;
    },
  };
  const window = { isDestroyed: () => false, webContents: { send() {} } };
  const options = { settings, writable() {}, window: () => window, show() {} };
  const service = new SoundLibraryService(
    directory,
    options,
    () => {},
    () => assert.fail('unexpected sound error'),
  );
  t.after(() => service.close());
  const a = await service.files.add(wave(1000), 'one/a.wav'),
    b = await service.files.add(wave(2000), 'one/b.wav');
  settings.value.soundLibrary = {
    groups: [
      { id: 'a', name: '通知: A', files: [a, b] },
      { id: 'b', name: '通知: B', files: [b] },
    ],
  };
  settings.value.imageLibrary = {
    groups: [{ id: 'keep', name: 'Images', images: [{ file: 'picture.png' }] }],
  };
  return { directory, settings, options, service, files: service.files, host: service.host, a, b };
}
test('WAV parser measures PCM and rejects malformed lengths, missing audio, unsupported codecs and invalid alignment', () => {
  assert.equal(waveDuration(wave(1250)), 1250);
  for (const mutate of [
    (b) => b.write('MP3!'),
    (b) => b.writeUInt32LE(b.length, 4),
    (b) => b.writeUInt32LE(999999, 40),
    (b) => b.writeUInt16LE(2, 20),
    (b) => b.writeUInt16LE(3, 32),
    (b) => b.writeUInt16LE(7, 34),
    (b) => b.writeUInt32LE(0, 28),
  ]) {
    const b = wave();
    mutate(b);
    assert.throws(() => waveDuration(b));
  }
  assert.throws(() => waveDuration(wave(0)));
});
test('library paths reject traversal and reserved originals while shared settings preserve separate image and audio memberships', () => {
  for (const p of [
    '../a.wav',
    'a/../b.wav',
    'C:/a.wav',
    'a\\b.wav',
    '@assigned/a.wav',
    'a.mp3',
    'a.png',
  ])
    assert.equal(libraryPath(p, 'sound'), false, p);
  const s = createDefaultSettings();
  s.soundLibrary = { groups: [{ id: 'n', name: 'Notice', files: [{ file: 'folder/one.wav' }] }] };
  s.imageLibrary = { groups: [{ id: 'n', name: 'Image', images: [{ file: 'one.svg' }] }] };
  const parsed = parseSettings(s);
  assert.deepEqual(parsed.soundLibrary, s.soundLibrary);
  assert.deepEqual(parsed.imageLibrary, s.imageLibrary);
  assert.throws(() =>
    parseSettings({
      ...s,
      soundLibrary: { groups: [{ id: 'n', name: 'Notice', files: [{ file: 'one.png' }] }] },
    }),
  );
});
test('audio addition refuses same-name replacement and indexes only supported files and actual folders', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.files.addWithResult(wave(1000), 'one/A.WAV')).reused, true);
  await assert.rejects(f.files.add(wave(3000), 'one/a.wav'));
  await fs.writeFile(path.join(f.directory, 'ignored.txt'), 'keep');
  await fs.mkdir(path.join(f.directory, 'empty'));
  await f.files.refresh(true);
  assert.deepEqual(
    f.files.list().map((e) => e.ref.file),
    ['one/a.wav', 'one/b.wav'],
  );
  assert.ok(f.files.folders.includes('empty'));
  assert.equal(f.files.entry(f.a).durationMs, 1000);
});
test('batch move and rename preserve all audio memberships, order and unrelated image settings', async (t) => {
  const f = await fixture(t),
    image = structuredClone(f.settings.value.imageLibrary);
  await f.host.rename([f.files.entry(f.a), f.files.entry(f.b)], ['b.wav', 'a.wav']);
  assert.deepEqual(
    f.settings.value.soundLibrary.groups.map((g) => g.files.map((r) => r.file)),
    [['one/b.wav', 'one/a.wav'], ['one/a.wav']],
  );
  await f.host.folderOperation('create', '', 'dest');
  const entry = f.files.entry({ file: 'one/b.wav' });
  await f.host.folderOperation('move-images', 'dest', undefined, [entry.ref], [entry]);
  assert.equal(f.settings.value.soundLibrary.groups[0].files[0].file, 'dest/b.wav');
  assert.deepEqual(f.settings.value.imageLibrary, image);
  assert.deepEqual(await fs.readFile(path.join(f.directory, 'dest/b.wav')), wave(1000));
});
test('assigned sound copies survive source replacement, movement and removal', async (t) => {
  const f = await fixture(t),
    retained = await f.host.retain(f.a),
    reference = '@library/' + retained.file;
  assert.equal(soundLibraryReference(reference), true);
  const absolute = await f.service.resolve(reference);
  assert.ok(absolute.includes('assigned-sounds'));
  await fs.writeFile(path.join(f.directory, f.a.file), wave(2000));
  await fs.rename(path.join(f.directory, f.a.file), path.join(f.directory, 'moved.wav'));
  await fs.unlink(path.join(f.directory, 'moved.wav'));
  assert.deepEqual(await fs.readFile(await f.service.resolve(reference)), wave(1000));
  await assert.rejects(f.service.resolve('@library/../../escape.wav'));
});
test('outside moves follow one exact basename and retain missing memberships when candidates are ambiguous', async (t) => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.directory, 'next'));
  await fs.rename(path.join(f.directory, f.a.file), path.join(f.directory, 'next/a.wav'));
  await f.files.refresh(true);
  f.host.reconcileGroups();
  assert.equal(f.settings.value.soundLibrary.groups[0].files[0].file, 'next/a.wav');
  await f.files.add(wave(), 'first/b.wav');
  await f.files.add(wave(), 'second/b.wav');
  await fs.unlink(path.join(f.directory, f.b.file));
  await f.files.refresh(true);
  f.host.reconcileGroups();
  assert.equal(f.settings.value.soundLibrary.groups[0].files[1].file, 'one/b.wav');
});
test('replaced assigned bytes are rejected instead of silently changing a notification sound', async (t) => {
  const f = await fixture(t),
    kept = await f.host.retain(f.a),
    ref = '@library/' + kept.file;
  const file = await f.service.resolve(ref);
  await fs.writeFile(file, wave(2000));
  await f.files.refresh(true);
  await assert.rejects(f.service.resolve(ref));
});
test('stale selection cannot rename changed bytes and stale classification plans do not overwrite settings', async (t) => {
  const f = await fixture(t),
    entry = f.files.entry(f.a),
    before = structuredClone(f.settings.value.soundLibrary);
  await fs.writeFile(path.join(f.directory, f.a.file), wave(3000));
  await f.files.refresh(true);
  await assert.rejects(f.host.rename([entry], ['stale.wav']));
  assert.deepEqual(f.settings.value.soundLibrary, before);
  const plan = f.host.configuration.plan({ groups: [] }, f.settings.revision);
  f.settings.revision++;
  assert.throws(() => plan.commit());
  assert.deepEqual(f.settings.value.soundLibrary, before);
});
test('removing an original sound updates groups while preserving its retained selection', async (t) => {
  const f = await fixture(t),
    kept = await f.host.retain(f.a);
  await f.host.remove(f.files.entry(f.a));
  assert.equal(f.settings.value.soundLibrary.groups[0].files.length, 1);
  assert.deepEqual((await f.files.read(kept)).bytes, wave());
});
test('sound selection retains a friendly name and cancellation never creates an assigned copy', async (t) => {
  const f = await fixture(t);
  let pending = f.service.pick();
  await turn();
  f.host.complete(f.host.pendingRequest().id, { cancelled: true });
  assert.equal(await pending, null);
  await assert.rejects(fs.stat(path.join(path.dirname(f.directory), 'assigned-sounds')), {
    code: 'ENOENT',
  });
  pending = f.service.pick();
  await turn();
  f.host.complete(f.host.pendingRequest().id, { cancelled: false, image: f.a, name: 'a.wav' });
  const selected = await pending;
  assert.equal(selected.name, 'a.wav');
  assert.ok(soundLibraryReference(selected.file));
  assert.deepEqual(await fs.readFile(await f.service.resolve(selected.file)), wave());
});
test('only one media picker owns the host modal, and a stopped caller cancels before committing', async (t) => {
  const f = await fixture(t),
    imageFiles = new RegisteredImages(path.join(root, 'image-lock'), () => ({
      width: 1,
      height: 1,
      thumbnail: '',
      circle: '',
    }));
  t.after(() => imageFiles.stop());
  const imageHost = new AssetLibraryHost(imageFiles, f.options);
  let live = true;
  const selected = f.service.pick('', () => live);
  await turn();
  await assert.rejects(imageHost.pick());
  live = false;
  f.host.reconcile(new Set());
  assert.equal(await selected, null);
  const next = imageHost.pick();
  await turn();
  imageHost.cancel();
  assert.deepEqual(await next, { cancelled: true });
});
test('manual previews wait for notification audio and stop only their own job', async (t) => {
  const f = await fixture(t),
    events = [],
    releases = [];
  const queue = new AudioPlaybackQueue(async (r) => {
    r.beforePlay?.();
    events.push(r.bytes.length);
    await new Promise((resolve) => {
      releases.push(resolve);
      r.signal.addEventListener('abort', resolve, { once: true });
    });
  });
  const preview = new LibrarySoundPreview(
    f.files,
    () => {},
    () => assert.fail('preview failed'),
    queue.play.bind(queue),
  );
  t.after(() => preview.stop());
  const notification = queue.play({ bytes: Buffer.from('notice'), playbackTimeoutMs: 10000 });
  await turn();
  await preview.play(f.a, 'page');
  assert.equal(preview.snapshot().state, 'waiting');
  preview.stop('picker');
  assert.equal(preview.snapshot().state, 'waiting');
  assert.deepEqual(events, [6]);
  releases.shift()();
  await notification;
  await turn();
  assert.equal(preview.snapshot().state, 'playing');
  preview.stop('page');
  await turn();
  assert.equal(preview.snapshot(), undefined);
  assert.equal(events.length, 2);
});
test('OFF never reports playback and replaced preview completion cannot erase the next selection', async (t) => {
  const f = await fixture(t),
    queue = new AudioPlaybackQueue(async () => assert.fail('OFF must not play'));
  queue.setEnabled(false);
  const preview = new LibrarySoundPreview(
    f.files,
    () => {},
    () => assert.fail('OFF is not an error'),
    queue.play.bind(queue),
  );
  await preview.play(f.a, 'picker');
  await turn();
  assert.equal(preview.snapshot(), undefined);
  const pending = [];
  const active = new LibrarySoundPreview(
    f.files,
    () => {},
    () => assert.fail('canceled preview is not an error'),
    (r) => new Promise((resolve, reject) => pending.push({ resolve, reject, r })),
  );
  t.after(() => active.stop());
  await active.play(f.a, 'page');
  await active.play(f.b, 'page');
  pending[0].reject(Error('late old failure'));
  await turn();
  assert.equal(active.snapshot().file, f.b.file);
  assert.equal(active.error, '');
  active.stop();
  pending[1].resolve();
});
test('image and sound display layouts round-trip independently', () => {
  const value = {
    gallery: { schemaVersion: 1, library: { cardWidth: 120 } },
    soundGallery: {
      schemaVersion: 1,
      library: {
        cardWidth: 40,
        layout: { sidebarWidth: 304, collapsedGroups: ['通知'], collapsedFolders: [] },
      },
      picker: { cardWidth: 160 },
    },
  };
  assert.deepEqual(parseDeviceUiState(value), value);
  assert.throws(() =>
    parseDeviceUiState({
      ...value,
      soundGallery: { schemaVersion: 1, library: { cardWidth: 39 } },
    }),
  );
});
function accountFixture(library) {
  const f = {
    state: { accounts: [{ id: 'a', sound: { enabled: true, file: 'old.wav' } }] },
    services: { capabilities: ['audio', 'file-dialog'], soundLibrary: library },
    deleting: new Set(),
    soundFailures: new Map(),
    refreshSounds: async () => {},
    save(value) {
      this.state = value;
    },
    account(id) {
      return this.state.accounts.find((a) => a.id === id);
    },
    requireCapability: WebAccountController.prototype.requireCapability,
    sound: WebAccountController.prototype.sound,
  };
  return f;
}
test('notification sound selection preserves enabled state and friendly name; cancel or concurrent edits win', async () => {
  const selection = { file: '@library/@assigned/' + 'a'.repeat(64) + '.wav', name: 'Notice.wav' };
  let resolve;
  const f = accountFixture({
    pick: () => new Promise((r) => (resolve = r)),
    resolve: async () => '/retained.wav',
  });
  let pending = WebAccountController.prototype.invoke.call(f, 'pickSound', ['a']);
  resolve(selection);
  await pending;
  assert.deepEqual(f.account('a').sound, { enabled: true, ...selection });
  assert.deepEqual(parseWebAccountSound(f.account('a').sound), f.account('a').sound);
  pending = WebAccountController.prototype.invoke.call(f, 'pickSound', ['a']);
  resolve(null);
  await pending;
  assert.equal(f.account('a').sound.name, 'Notice.wav');
  pending = WebAccountController.prototype.invoke.call(f, 'pickSound', ['a']);
  f.account('a').sound = { enabled: false, file: 'new.wav' };
  resolve(selection);
  await pending;
  assert.deepEqual(f.account('a').sound, { enabled: false, file: 'new.wav' });
});
test('notification sound replacement cannot overwrite an edit made during assigned-file verification', async () => {
  let verify;
  const selection = { file: '@library/@assigned/' + 'b'.repeat(64) + '.wav', name: 'Notice.wav' };
  const f = accountFixture({
    pick: async () => selection,
    resolve: () => new Promise((r) => (verify = r)),
  });
  const pending = WebAccountController.prototype.invoke.call(f, 'pickSound', ['a']);
  await turn();
  f.account('a').sound = { enabled: false, file: 'latest.wav' };
  verify('/retained.wav');
  await pending;
  assert.equal(f.account('a').sound.file, 'latest.wav');
});
