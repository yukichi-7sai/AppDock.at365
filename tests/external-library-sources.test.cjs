const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  return id === 'electron' ? {} : originalLoad.call(this, id, ...args);
};
const { AssetLibraryHost } = require('../out/main/main/core/asset-library-host');
Module._load = originalLoad;
const { RegisteredImages } = require('../out/main/main/core/registered-images');
const { TextLibraryService } = require('../out/main/main/core/text-library-service');
const { ImageRegistration } = require('../out/main/main/core/image-registration');
const { RegisteredSoundLibrary } = require('../out/main/main/core/registered-sound-library');
const { wave } = require('../scripts/sound-library-fixture.cjs');
const { renameLibraryFiles } = require('../out/main/main/core/library-file-rename');
const { ExternalLibrarySources } = require('../out/main/main/core/external-library-sources');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { libraryPath, libraryFolder } = require('../out/main/shared/library-assets');
const { filterImageBrowser } = require('../out/main/shared/image-browser');
const {
  externalLibraryPath: refPath,
  parseExternalLibrarySources,
} = require('../out/main/shared/library-sources');
const { fileHash } = require('../out/main/main/core/file-content');
const root = path.resolve('.artifacts/external-library-unit-' + Date.now());
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.from('external-fixture'),
]);
const decode = () => ({
  width: 32,
  height: 32,
  thumbnail: 'data:image/png;base64,AA==',
  circle: '',
});
let serial = 0;
async function fixture(t) {
  const base = path.join(root, String(++serial));
  const external = path.join(base, 'external');
  await fs.mkdir(path.join(external, 'nested'), { recursive: true });
  await fs.writeFile(path.join(external, 'same.png'), png);
  await fs.writeFile(path.join(external, 'nested/child.png'), png);
  await fs.mkdir(path.join(base, 'data'), { recursive: true });
  const settingsFile = path.join(base, 'data/settings.json');
  await fs.writeFile(settingsFile, JSON.stringify(createDefaultSettings()));
  const settings = new DeviceSettingsStore(settingsFile, path.join(base, 'local'), 'TEST-PC');
  settings.load();
  let notifications = 0;
  const files = new RegisteredImages(
    path.join(base, 'data/assets/images'),
    decode,
    () => notifications++,
  );
  const host = new AssetLibraryHost(files, {
    settings,
    writable() {},
    window: () => null,
    show() {},
  });
  const manager = new ExternalLibrarySources(settings, [files], () => {});
  t.after(() => {
    files.stop();
    settings.close();
  });
  await manager.add('External', external);
  const source = settings.readLibrarySources()[0];
  const ref = { file: refPath(source.id, 'same.png') };
  await files.refresh(false, [ref.file]);
  return {
    base,
    external,
    settings,
    files,
    host,
    manager,
    source,
    ref,
    notifications: () => notifications,
  };
}
test('external roots keep opaque identities and folder/group search stays within the selected root', async (t) => {
  const f = await fixture(t);
  await f.files.add(png, 'same.png');
  const refs = f.files.list().map((e) => e.ref);
  assert.equal(refs.length, 3);
  assert.equal(libraryPath(f.ref.file, 'image'), true);
  assert.equal(libraryFolder(refPath(f.source.id, '*')), true);
  for (const relative of [
    '../escape.png',
    '@assigned/a.png',
    'C:/escape.png',
    'nested/../../escape.png',
  ])
    assert.equal(libraryPath(refPath(f.source.id, relative), 'image'), false);
  const select = (folder) => filterImageBrowser(refs, [], { folder, group: 'all', query: '' });
  assert.deepEqual(select('*'), [{ file: 'same.png' }]);
  assert.equal(select(refPath(f.source.id, '*')).length, 2);
  assert.deepEqual(select(refPath(f.source.id)), [f.ref]);
  assert.equal(select(refPath(f.source.id, 'nested')).length, 1);
  assert.equal((await f.files.read(f.ref)).bytes.equals(png), true);
  const before = f.notifications();
  await f.files.refresh(false, [f.ref.file]);
  assert.equal(f.notifications(), before, 'unchanged scans do not restart snapshot/change loops');
});
test('every external write path refuses before callbacks or filesystem changes; groups and internal settings copies remain writable', async (t) => {
  const f = await fixture(t);
  const before = await fileHash(path.join(f.external, 'same.png'));
  const fail = () => {
    throw Error('write callback must not run');
  };
  assert.throws(() =>
    new ImageRegistration(f.files, f.host).validate({
      folder: refPath(f.source.id),
      name: 'generated',
    }),
  );
  await assert.rejects(f.files.addVerified(png, f.ref.file, { writable: fail }), /読み取り専用/);
  await assert.rejects(
    f.files.addFile(path.join(f.external, 'same.png'), f.ref.file, fail),
    /読み取り専用/,
  );
  await assert.rejects(async () => f.files.updateContent(f.ref, '', png), /読み取り専用/);
  await assert.rejects(f.files.remove(f.ref, '', { prepare: fail, trash: fail }), /読み取り専用/);
  await assert.rejects(
    renameLibraryFiles(f.files, [f.files.entry(f.ref)], ['new.png'], fail),
    /読み取り専用/,
  );
  await assert.rejects(
    f.host.folderOperation('create', refPath(f.source.id), refPath(f.source.id, 'new')),
    /読み取り専用/,
  );
  await assert.rejects(f.host.registerMany(refPath(f.source.id)), /読み取り専用/);
  await f.host.edit({ kind: 'add', group: { id: 'keep', name: 'Keep', images: [f.ref] } });
  assert.deepEqual(f.host.configuration.snapshot().groups[0].images, [f.ref]);
  const retained = await f.host.retain(f.ref);
  assert.match(retained.file, /^@assigned\//);
  assert.equal(await fileHash(f.files.file(retained.file)), before);
  assert.equal(await fileHash(path.join(f.external, 'same.png')), before);
  assert.deepEqual((await fs.readdir(f.external)).sort(), ['nested', 'same.png']);
  assert.equal(
    await fs.stat(path.join(f.base, 'assigned-images')).then(
      () => true,
      () => false,
    ),
    false,
  );
});
test('disconnect retains source and memberships; reconnect recovers; unregister never removes originals', async (t) => {
  const f = await fixture(t);
  await f.host.edit({ kind: 'add', group: { id: 'keep', name: 'Keep', images: [f.ref] } });
  const away = path.join(f.base, 'disconnected');
  await fs.rename(f.external, away);
  await f.files.refresh(true, [f.ref.file]);
  assert.equal(f.files.sources[0].available, false);
  assert.equal(f.settings.readLibrarySources().length, 1);
  f.host.reconcileGroups();
  assert.deepEqual(f.host.configuration.snapshot().groups[0].images, [f.ref]);
  await fs.rename(away, f.external);
  await f.files.refresh(true, [f.ref.file]);
  assert.equal(f.files.sources[0].available, true);
  f.manager.remove(f.source);
  assert.equal(f.files.sources.length, 0);
  await assert.rejects(f.files.read(f.ref));
  assert.equal((await fs.readFile(path.join(f.external, 'same.png'))).equals(png), true);
});
test('junction descendants and roots are excluded; overlapping roots and unknown access modes are rejected', async (t) => {
  const f = await fixture(t);
  const outside = path.join(f.base, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'secret.png'), png);
  await fs.symlink(outside, path.join(f.external, 'redirect'), 'junction');
  const redirectedRoot = path.join(f.base, 'outside-link');
  await fs.symlink(outside, redirectedRoot, 'junction');
  await assert.rejects(f.manager.add('Redirected root', redirectedRoot), {
    message: require('../out/main/shared/i18n').hostText(
      'services.registeredImages.redirectedDirectory',
    ),
  });
  await f.files.refresh(true, [f.ref.file]);
  // Force a complete source scan through its cached reader.
  f.files.configureSources([]);
  f.files.configureSources([f.source]);
  await f.files.refresh(false, [f.ref.file]);
  assert.equal(
    f.files.list().some((e) => e.ref.file.includes('secret')),
    false,
  );
  await assert.rejects(f.manager.add('Redirect', path.join(f.external, 'redirect')));
  await assert.rejects(f.manager.add('Nested', path.join(f.external, 'nested')), /重複/);
  await assert.rejects(f.manager.add('Data', path.join(f.base, 'data')), /重複/);
  assert.equal(
    parseExternalLibrarySources([{ ...f.source, access: 'read-write' }])[0].access,
    'read-write',
  );
  assert.throws(() => parseExternalLibrarySources([{ ...f.source, access: 'unknown' }]));
  assert.throws(() => parseExternalLibrarySources([{ ...f.source, path: 'relative' }]));
  assert.equal(
    parseExternalLibrarySources([{ ...f.source, path: '\\\\server\\share\\media' }])[0].path,
    '\\\\server\\share\\media',
  );
});

test('access switches preserve references and memberships; writable roots support registration, recovery, folders and moves', async (t) => {
  const f = await fixture(t);
  const generation = (await f.files.read(f.ref)).generation;
  await f.host.edit({ kind: 'add', group: { id: 'keep', name: 'Keep', images: [f.ref] } });
  f.manager.update(f.source, 'read-write');
  const writableSource = f.settings.readLibrarySources()[0];
  assert.equal(writableSource.id, f.source.id);
  assert.equal(f.files.entry(f.ref).generation, generation);
  assert.equal(f.files.sources[0].canWrite, true);
  assert.deepEqual(f.host.configuration.snapshot().groups[0].images, [f.ref]);
  assert.throws(() => f.manager.update(f.source, 'read-only'), /変更/);
  assert.throws(() => f.manager.update(writableSource, 'unknown'));
  await f.host.folderOperation('create', refPath(f.source.id), refPath(f.source.id, 'new'));
  let intent;
  const added = await f.files.addVerified(png, refPath(f.source.id, 'new/generated.png'), {
    unique: true,
    journal: {
      prepare: (value) => {
        intent = value;
      },
    },
  });
  assert.equal(added.ref.file, refPath(f.source.id, 'new/generated-001.png'));
  assert.equal(intent.file, added.ref.file);
  assert.deepEqual((await f.files.recoverRegistration(intent)).ref, added.ref);
  const retry = await f.files.addVerified(png, refPath(f.source.id, 'new/generated.png'), {
    unique: true,
    journal: { intent, prepare: () => assert.fail('must reuse reserved file') },
  });
  assert.deepEqual(retry.ref, added.ref);
  await f.host.rename([f.files.entry(f.ref)], ['renamed.png'], refPath(f.source.id, 'new'));
  const renamed = { file: refPath(f.source.id, 'new/renamed.png') };
  assert.deepEqual(f.host.configuration.snapshot().groups[0].images, [renamed]);
  await f.files.add(png, 'local.png');
  await f.host.folderOperation('move-images', refPath(f.source.id), undefined, [
    { file: 'local.png' },
  ]);
  assert.equal((await fs.readFile(path.join(f.external, 'local.png'))).equals(png), true);
  await f.host.folderOperation('move-images', '', undefined, [renamed]);
  assert.deepEqual(f.host.configuration.snapshot().groups[0].images, [{ file: 'renamed.png' }]);
  await f.host.folderOperation('create', refPath(f.source.id), refPath(f.source.id, 'empty'));
  await f.host.folderOperation(
    'rename',
    refPath(f.source.id, 'empty'),
    refPath(f.source.id, 'renamed-folder'),
  );
  await f.host.folderOperation('delete', refPath(f.source.id, 'renamed-folder'));
  for (const folder of [refPath(f.source.id), refPath(f.source.id, '*')])
    await assert.rejects(f.host.folderOperation('delete', folder));
  f.manager.update(writableSource, 'read-only');
  assert.equal(f.files.canWrite(added.ref.file), false);
  await assert.rejects(f.files.add(png, refPath(f.source.id, 'refused.png')), /読み取り専用/);
  const snapshot = f.settings.readLibrarySources();
  f.manager.configure();
  assert.equal(snapshot[0].access, 'read-only');
  assert.equal((await f.files.read(added.ref)).bytes.equals(png), true);
  assert.equal(
    (await fs.readdir(f.external)).some((name) => name.startsWith('.')),
    false,
  );
});

test('writable disconnected roots are not recreated and writable external text has no sibling assigned assets', async (t) => {
  const f = await fixture(t);
  f.manager.update(f.source, 'read-write');
  const away = path.join(f.base, 'away');
  await fs.rename(f.external, away);
  await assert.rejects(f.files.add(png, refPath(f.source.id, 'must-not-create.png')));
  assert.equal(
    await fs.stat(f.external).then(
      () => true,
      () => false,
    ),
    false,
  );
  await fs.rename(away, f.external);
  const source = f.settings.readLibrarySources()[0];
  const text = new TextLibraryService(
    path.join(f.base, 'data/assets/texts'),
    { settings: f.settings, writable() {}, window: () => null, show() {} },
    () => {},
  );
  t.after(() => text.close());
  text.files.configureSources([source]);
  await text.files.refresh();
  const ref = await text.create(refPath(source.id), 'new.txt', 'before');
  const document = await text.document(ref);
  await text.save(ref, document.generation, 'after');
  assert.equal(await fs.readFile(path.join(f.external, 'new.txt'), 'utf8'), 'after');
  text.files.configureSources([{ ...source, access: 'read-only' }]);
  await assert.rejects(
    text.save(ref, (await text.document(ref)).generation, 'refused'),
    /読み取り専用/,
  );
  assert.equal(await fs.readFile(path.join(f.external, 'new.txt'), 'utf8'), 'after');
});
test('registrations remain device-local through unrelated shared-settings saves and optimistic conflicts', async (t) => {
  const f = await fixture(t);
  const next = structuredClone(f.settings.value);
  next.host.soundEnabled = !next.host.soundEnabled;
  f.settings.save(next, f.settings.revision);
  assert.deepEqual(f.settings.readLibrarySources(), [f.source]);
  assert.deepEqual(JSON.parse(await fs.readFile(f.settings.device.file, 'utf8')).librarySources, [
    f.source,
  ]);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(f.base, 'data/settings.json'), 'utf8')).librarySources,
    undefined,
  );
  assert.throws(() => f.settings.saveLibrarySources([], []));
});

test('revocation at commit prevents registration and deletion; stopped registrations cannot finish queued writes', async (t) => {
  const f = await fixture(t);
  f.manager.update(f.source, 'read-write');
  const writable = f.settings.readLibrarySources()[0];
  let calls = 0;
  await assert.rejects(
    f.files.addVerified(png, refPath(f.source.id, 'blocked.png'), {
      writable() {
        if (++calls === 2) f.manager.update(writable, 'read-only');
      },
    }),
    /読み取り専用/,
  );
  assert.equal(
    await fs.stat(path.join(f.external, 'blocked.png')).then(
      () => true,
      () => false,
    ),
    false,
  );
  f.manager.update(f.settings.readLibrarySources()[0], 'read-write');
  const entry = await f.files.read(f.ref);
  await assert.rejects(
    f.files.remove(f.ref, entry.generation, {
      prepare() {
        f.manager.update(f.settings.readLibrarySources()[0], 'read-only');
        return () => assert.fail('classification must not commit');
      },
      trash() {
        assert.fail('trash must not be called');
      },
    }),
    /読み取り専用/,
  );
  assert.equal((await fs.readFile(path.join(f.external, 'same.png'))).equals(png), true);
  f.manager.update(f.settings.readLibrarySources()[0], 'read-write');
  calls = 0;
  await assert.rejects(
    f.files.addVerified(png, refPath(f.source.id, 'removed.png'), {
      writable() {
        if (++calls === 2) f.manager.remove(f.settings.readLibrarySources()[0]);
      },
    }),
    /読み取り専用/,
  );
  assert.deepEqual((await fs.readdir(f.external)).sort(), ['nested', 'same.png']);
});

test('cross-device file staging preserves memberships and restores source on settings failure', async (t) => {
  const f = await fixture(t);
  f.manager.update(f.source, 'read-write');
  await f.files.add(png, 'local.png');
  await f.host.edit({
    kind: 'add',
    group: { id: 'keep', name: 'Keep', images: [{ file: 'local.png' }] },
  });
  const link = fs.link;
  fs.link = async (source, target) => {
    if (source.endsWith('local.png') && target.includes('.appdock-rename-'))
      throw Object.assign(Error('cross-device fixture'), { code: 'EXDEV' });
    return link(source, target);
  };
  t.after(() => {
    fs.link = link;
  });
  const before = f.files.entry({ file: 'local.png' });
  await assert.rejects(
    renameLibraryFiles(
      f.files,
      [before],
      ['local.png'],
      () => () => {
        throw Error('settings failure');
      },
      refPath(f.source.id),
    ),
    /settings failure/,
  );
  assert.equal((await fs.readFile(f.files.file('local.png'))).equals(png), true);
  assert.equal(
    await fs.stat(path.join(f.external, 'local.png')).then(
      () => true,
      () => false,
    ),
    false,
  );
  await f.host.rename([f.files.entry({ file: 'local.png' })], ['local.png'], refPath(f.source.id));
  assert.deepEqual(f.host.configuration.snapshot().groups[0].images, [
    { file: refPath(f.source.id, 'local.png') },
  ]);
  assert.equal((await fs.readFile(path.join(f.external, 'local.png'))).equals(png), true);
});

test('external folder rename updates image and text groups together and restores the directory on a settings failure', async (t) => {
  const f = await fixture(t);
  f.manager.update(f.source, 'read-write');
  const text = new TextLibraryService(
    path.join(f.base, 'data/assets/texts'),
    { settings: f.settings, writable() {}, window: () => null, show() {} },
    () => {},
  );
  t.after(() => text.close());
  text.files.configureSources(f.settings.readLibrarySources());
  const textRef = await text.create(refPath(f.source.id, 'nested'), 'member.txt', 'keep');
  await f.host.edit({
    kind: 'add',
    group: {
      id: 'images',
      name: 'Images',
      images: [{ file: refPath(f.source.id, 'nested/child.png') }],
    },
  });
  await text.host.edit({ kind: 'add', group: { id: 'texts', name: 'Texts', images: [textRef] } });
  f.host.setFolderPeers([f.host, text.host]);
  text.host.setFolderPeers([f.host, text.host]);
  const save = f.settings.save;
  f.settings.save = () => {
    throw Error('settings save failure');
  };
  await assert.rejects(
    f.host.folderOperation('rename', refPath(f.source.id, 'nested'), refPath(f.source.id, 'after')),
    /settings save failure/,
  );
  f.settings.save = save;
  assert.equal(await fs.readFile(path.join(f.external, 'nested/member.txt'), 'utf8'), 'keep');
  await f.host.folderOperation(
    'rename',
    refPath(f.source.id, 'nested'),
    refPath(f.source.id, 'after'),
  );
  assert.equal(
    f.host.configuration.snapshot().groups[0].images[0].file,
    refPath(f.source.id, 'after/child.png'),
  );
  assert.equal(
    text.host.configuration.snapshot().groups.find((g) => g.id === 'texts').images[0].file,
    refPath(f.source.id, 'after/member.txt'),
  );
});
test('external sound selection copies to internal assigned-sounds without touching the source or its siblings', async (t) => {
  const f = await fixture(t);
  const sound = path.join(f.external, 'sample.wav');
  await fs.writeFile(sound, wave(250));
  const files = new RegisteredSoundLibrary(path.join(f.base, 'data/assets/sounds'));
  t.after(() => files.stop());
  files.configureSources([f.source]);
  const ref = { file: refPath(f.source.id, 'sample.wav') };
  await files.refresh(false, [ref.file]);
  const host = new AssetLibraryHost(files, {
    settings: f.settings,
    writable() {},
    window: () => null,
    show() {},
  });
  const result = await host.retain(ref);
  assert.match(result.file, /^@assigned\//);
  assert.equal(await fileHash(files.file(result.file)), await fileHash(sound));
  assert.equal(
    await fs.stat(path.join(f.base, 'assigned-sounds')).then(
      () => true,
      () => false,
    ),
    false,
  );
});
