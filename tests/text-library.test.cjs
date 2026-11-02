const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path');
const Module = require('node:module'),
  original = Module._load;
let copied;
const dialog = { showOpenDialog() {} };
Module._load = function (name, ...args) {
  return name === 'electron'
    ? {
        shell: { trashItem: (file) => fs.unlink(file) },
        clipboard: {
          writeText: (text) => {
            copied = text;
          },
        },
        dialog,
      }
    : original.call(this, name, ...args);
};
const {
  TextLibraryService,
  decodeLibraryText,
} = require('../out/main/main/core/text-library-service');
const {
  ImageLibraryPageSession,
  ImageLibraryPageState,
} = require('../out/main/main/core/image-library-page');
const { ImageLibraryDialogs } = require('../out/main/main/core/image-library-dialogs');
Module._load = original;
const { GalleryViewStateStore } = require('../out/main/main/core/gallery-view-state');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { parseDeviceUiState } = require('../out/main/main/core/device-ui-state');
const { libraryPath } = require('../out/main/shared/library-assets');
const { filterImageBrowser } = require('../out/main/shared/image-browser');
const root = path.resolve('.artifacts/text-library-unit-' + Date.now());
test('snippet group keeps its identity and order without adopting or deleting user texts', async (t) => {
  const { snippetGroupId } = require('../out/main/shared/text-library');
  const f = await fixture(t);
  const user = { id: 'appdock-snippets', name: '定型文', files: [f.a] };
  f.settings.value.textLibrary = { groups: [user] };
  const store = f.host.configuration;
  const [fixed, existing] = store.snapshot().groups;
  assert.equal(fixed.id, snippetGroupId);
  assert.notEqual(fixed.name, user.name);
  assert.deepEqual(fixed.images, []);
  assert.deepEqual(existing.images, [f.a]);
  store.edit({
    kind: 'membership-batch',
    mode: 'add',
    groupId: fixed.id,
    images: [
      { image: f.b, before: [] },
      { image: f.a, before: [user.id] },
    ],
  });
  const selected = store.snapshot().groups[0];
  assert.deepEqual(selected.images, [f.b, f.a]);
  assert.deepEqual(
    f.service.snippetEntries().map((entry) => entry.ref),
    [f.b, f.a],
  );
  assert.throws(() =>
    store.edit({ kind: 'update', before: selected, group: { ...selected, name: 'changed' } }),
  );
  assert.throws(() => store.edit({ kind: 'delete', id: fixed.id, before: selected }));
  assert.throws(() =>
    store.edit({ kind: 'order', before: [fixed.id, user.id], ids: [user.id, fixed.id] }),
  );
  store.edit({
    kind: 'membership-batch',
    mode: 'remove',
    groupId: fixed.id,
    images: [{ image: f.a, before: [fixed.id, user.id] }],
  });
  assert.deepEqual(store.snapshot().groups[0].images, [f.b]);
  assert.deepEqual(store.snapshot().groups[1].images, [f.a]);
  assert(f.files.entry(f.a).available);
});
let serial = 0;
async function fixture(t) {
  const directory = path.join(root, String(++serial), 'texts');
  const settings = {
    value: createDefaultSettings(),
    revision: 1,
    save(value, revision) {
      assert.equal(revision, this.revision);
      this.value = value;
      this.revision++;
    },
  };
  const options = {
    settings,
    writable() {},
    window: () => ({ isDestroyed: () => false, webContents: { send() {} } }),
    show() {},
  };
  const service = new TextLibraryService(directory, options, () => {});
  t.after(() => service.close());
  const a = await service.create('one', 'a.txt', 'こんにちは😀\nAlpha'),
    b = await service.create('one', 'b.txt', 'Beta');
  settings.value.textLibrary = {
    groups: [
      { id: 'a', name: '定型: A', files: [b, a] },
      { id: 'b', name: '定型: B', files: [a] },
    ],
  };
  settings.value.imageLibrary = {
    groups: [{ id: 'keep', name: 'Images', images: [{ file: 'a.png' }] }],
  };
  settings.value.soundLibrary = {
    groups: [{ id: 'keep', name: 'Sounds', files: [{ file: 'a.wav' }] }],
  };
  return { directory, settings, options, service, files: service.files, host: service.host, a, b };
}
test('batch import rechecks large sources on their turn and continues in selection order', async (t) => {
  const f = await fixture(t);
  const source = path.join(path.dirname(f.directory), 'import');
  await fs.mkdir(source);
  const names = ['first.txt', 'growing.txt', 'large.txt', 'last.txt'];
  const paths = names.map((name) => path.join(source, name));
  const size = 512 * 1024 + 1;
  f.files.policy = { ...f.files.policy, maxBytes: size };
  for (const [i, file] of paths.entries())
    await fs.writeFile(file, i === 1 || i === 2 ? Buffer.alloc(size, 97) : names[i]);
  t.mock.method(dialog, 'showOpenDialog', async () => ({
    canceled: false,
    filePaths: paths,
  }));
  const add = f.files.addWithResult.bind(f.files);
  t.mock.method(f.files, 'addWithResult', async (bytes, name) => {
    if (name === names[0]) await fs.appendFile(paths[1], 'growing');
    return add(bytes, name);
  });
  const results = await f.host.registerMany();
  assert.deepEqual(
    results.map((item) => item.name),
    names,
  );
  assert.deepEqual(
    results.map((item) => !!item.image),
    [true, false, true, true],
  );
  assert.ok(results[1].error);
  assert.equal((await f.service.document(results[2].image)).body.length, size);
});
test('UTF-8 decoder accepts empty, BOM, emoji and line breaks, and rejects corrupt or binary bytes', () => {
  for (const value of ['', 'こんにちは😀\r\n次の行', '<script>alert(1)</script>'])
    assert.equal(decodeLibraryText(Buffer.from(value)), value);
  assert.equal(decodeLibraryText(Buffer.from('\ufeff本文')), '本文');
  for (const bytes of [Buffer.from([0x81, 0xff]), Buffer.from('a\0b')])
    assert.throws(() => decodeLibraryText(bytes));
});
test('text references and persisted groups remain separate from sound and image settings', async (t) => {
  const f = await fixture(t);
  for (const p of [
    '../a.txt',
    'a/../b.txt',
    'a\\b.txt',
    'C:/a.txt',
    '@assigned/' + 'a'.repeat(64) + '.txt',
    'a.wav',
    'CON.txt',
  ])
    assert.equal(libraryPath(p, 'text'), false, p);
  const next = parseSettings(f.settings.value);
  for (const name of ['imageLibrary', 'soundLibrary', 'textLibrary'])
    assert.deepEqual(next[name], f.settings.value[name]);
  assert.throws(() =>
    parseSettings({
      ...next,
      textLibrary: { groups: [{ id: 'a', name: 'bad', files: [{ file: 'a.wav' }] }] },
    }),
  );
});
test('creation preserves existing names, supports empty documents and bounds only the displayed preview', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.service.create('one', 'a.txt', 'replacement'));
  await assert.rejects(f.service.create('one', 'A.TXT', 'こんにちは😀\nAlpha'));
  assert.equal((await f.service.document(f.a)).body, 'こんにちは😀\nAlpha');
  const empty = await f.service.create('', 'empty.txt', '');
  assert.equal((await f.service.document(empty)).body, '');
  assert.equal(f.files.entry(empty).available, true);
  const long = 'あ'.repeat(10000) + 'SEARCH-END';
  const ref = await f.service.create('', 'long.txt', long);
  assert.equal((await f.service.document(ref)).body, long);
  assert.ok(f.files.entry(ref).textPreview.length <= 800);
  assert.equal(f.files.entry(ref).characters, long.length);
  assert.equal(f.service.matches(ref, 'search-end'), true);
  await assert.rejects(f.service.create('', 'bad.txt', '\ud800'));
});
test('save preserves BOM and CRLF; unchanged textarea normalization leaves bytes untouched', async (t) => {
  const f = await fixture(t),
    originalBytes = Buffer.from('\ufeffone\r\ntwo');
  const ref = await f.files.add(originalBytes, 'bom.txt');
  const doc = await f.service.document(ref);
  await f.service.save(ref, doc.generation, 'one\ntwo');
  assert.deepEqual(await fs.readFile(f.files.file(ref.file)), originalBytes);
  await f.service.save(ref, doc.generation, 'one\nchanged😀');
  assert.deepEqual(
    await fs.readFile(f.files.file(ref.file)),
    Buffer.from('\ufeffone\r\nchanged😀'),
  );
  assert.equal(f.service.matches(ref, 'changed😀'), true);
});
test('stale editor, readonly state and invalid drafts cannot overwrite a file', async (t) => {
  const f = await fixture(t),
    doc = await f.service.document(f.a);
  await fs.writeFile(f.files.file(f.a.file), 'external edit');
  await assert.rejects(f.service.save(f.a, doc.generation, 'draft'));
  assert.equal(await fs.readFile(f.files.file(f.a.file), 'utf8'), 'external edit');
  const latest = await f.service.document(f.a);
  await assert.rejects(f.service.save(f.a, latest.generation, 'invalid\0body'));
  f.options.writable = () => {
    throw Error('readonly');
  };
  await assert.rejects(f.service.save(f.a, latest.generation, latest.body), /readonly/);
  await assert.rejects(f.service.create('', 'blocked.txt', 'draft'), /readonly/);
  assert.equal(await fs.readFile(f.files.file(f.a.file), 'utf8'), latest.body);
});
test('a write immediately before atomic commit wins without leaving a partial file', async (t) => {
  const f = await fixture(t),
    doc = await f.service.document(f.a);
  let checks = 0;
  await assert.rejects(
    f.files.updateContent(f.a, doc.generation, Buffer.from('draft'), () => {
      if (++checks === 3)
        require('node:fs').writeFileSync(f.files.file(f.a.file), 'last-moment external edit');
    }),
    /テキストが変更されました/,
  );
  assert.equal(await fs.readFile(f.files.file(f.a.file), 'utf8'), 'last-moment external edit');
  assert.deepEqual((await fs.readdir(path.join(f.directory, 'one'))).sort(), ['a.txt', 'b.txt']);
});
test('body search intersects folder and group filters, retains group order, and does not reread unchanged files', async (t) => {
  const f = await fixture(t),
    groups = f.host.configuration.snapshot().groups;
  const refs = f.files.list().map((e) => e.ref);
  assert.deepEqual(
    filterImageBrowser(refs, groups, { folder: 'one', group: 'group:a', query: 'a' }, (r, q) =>
      f.service.matches(r, q),
    ),
    [f.b, f.a],
  );
  assert.deepEqual(
    filterImageBrowser(refs, groups, { folder: '', group: 'all', query: 'alpha' }, (r, q) =>
      f.service.matches(r, q),
    ),
    [],
  );
  const read = f.files.read.bind(f.files);
  let count = 0;
  f.files.read = (...args) => {
    count++;
    return read(...args);
  };
  await f.service.index();
  for (let i = 0; i < 10; i++) assert.equal(f.service.matches(f.a, 'alpha'), true);
  assert.equal(count, 0);
  await fs.writeFile(f.files.file(f.a.file), 'replacement body');
  await f.files.refresh(true);
  await f.service.index();
  assert.equal(f.service.matches(f.a, 'alpha'), false);
  assert.equal(f.service.matches(f.a, 'replacement'), true);
});
test('saving or creating one text makes it searchable during a pending index of another file', async (t) => {
  const f = await fixture(t);
  await f.service.index();
  let enter, release;
  const started = new Promise((r) => (enter = r));
  const blocked = new Promise((r) => (release = r));
  const read = f.files.read.bind(f.files);
  f.files.read = async (ref, ...args) => {
    if (ref.file === f.b.file) {
      enter();
      await blocked;
    }
    return read(ref, ...args);
  };
  await fs.writeFile(f.files.file(f.b.file), 'background replacement');
  await f.files.refresh(true);
  const index = f.service.index();
  await started;
  let timer;
  try {
    await Promise.race([
      (async () => {
        const doc = await f.service.document(f.a);
        await f.service.save(f.a, doc.generation, 'updated immediately');
        assert(f.service.matches(f.a, 'immediately'));
        const created = await f.service.create('', 'early.txt', 'new searchable body');
        assert(f.service.matches(created, 'searchable'));
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('Edit blocked behind background index')), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    release();
    await index;
  }
  assert(f.service.matches(f.b, 'background replacement'));
});
test('batch rename, folder moves and recycle preserve memberships and unrelated libraries', async (t) => {
  const f = await fixture(t),
    before = structuredClone(f.settings.value);
  await f.host.rename([f.files.entry(f.a), f.files.entry(f.b)], ['b.txt', 'a.txt']);
  assert.deepEqual(f.settings.value.textLibrary.groups[0].files, [
    { file: 'one/a.txt' },
    { file: 'one/b.txt' },
  ]);
  await f.host.folderOperation('create', '', 'dest');
  const entry = f.files.entry({ file: 'one/b.txt' });
  await f.host.folderOperation('move-images', 'dest', undefined, [entry.ref], [entry]);
  assert.equal(f.settings.value.textLibrary.groups[1].files[0].file, 'dest/b.txt');
  await f.host.removeMany([f.files.entry({ file: 'dest/b.txt' })]);
  assert.deepEqual(f.settings.value.textLibrary.groups[1].files, []);
  for (const key of ['imageLibrary', 'soundLibrary'])
    assert.deepEqual(f.settings.value[key], before[key]);
});
test('external folder changes follow unique filenames while ambiguous missing references are retained', async (t) => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.directory, 'dest'));
  await fs.rename(f.files.file(f.a.file), path.join(f.directory, 'dest/a.txt'));
  await f.files.refresh(true);
  await f.service.index();
  assert.equal(f.settings.value.textLibrary.groups[1].files[0].file, 'dest/a.txt');
  await fs.mkdir(path.join(f.directory, 'other'));
  await fs.rename(f.files.file(f.b.file), path.join(f.directory, 'dest/b.txt'));
  await fs.writeFile(path.join(f.directory, 'other/b.txt'), 'ambiguous');
  await f.files.refresh(true);
  await f.service.index();
  assert.equal(f.settings.value.textLibrary.groups[0].files[0].file, 'one/b.txt');
});
test('copy reads every selected body in supplied order and rejects stale selections without changing clipboard', async (t) => {
  const f = await fixture(t);
  copied = 'keep';
  await f.host.fileAction('copy-text', [f.files.entry(f.b), f.files.entry(f.a)]);
  assert.equal(copied, 'Beta\r\nこんにちは😀\nAlpha');
  const selected = [f.files.entry(f.a), f.files.entry(f.b)];
  await fs.writeFile(f.files.file(f.b.file), 'external');
  copied = 'keep';
  await assert.rejects(f.host.fileAction('copy-text', selected));
  assert.equal(copied, 'keep');
});
test('invalid external files remain visible as errors and can be repaired without losing the index', async (t) => {
  const f = await fixture(t);
  const file = f.files.file(f.a.file);
  await fs.writeFile(file, Buffer.from([0xff, 0x81]));
  await f.files.refresh(true);
  await f.service.index();
  assert.equal(f.files.entry(f.a).available, false);
  assert.equal(f.service.matches(f.a, 'alpha'), false);
  await fs.writeFile(file, 'repaired');
  await f.files.refresh(true);
  await f.service.index();
  assert.equal(f.files.entry(f.a).available, true);
  assert.equal(f.service.matches(f.a, 'repaired'), true);
});
test('page uses plaintext previews and body search without image decoding', async (t) => {
  const f = await fixture(t);
  const state = new ImageLibraryPageState(
    new GalleryViewStateStore({ read() {}, write() {} }, 'text'),
  );
  const page = new ImageLibraryPageSession(
    { id: 'test', kind: 'text-library', route: 'text-library' },
    {
      host: f.host,
      texts: f.service,
      state,
      groups: () => f.host.configuration.snapshot().groups,
      dialogs: { cancel() {} },
      dark: () => false,
      changed() {},
      failed: assert.fail,
    },
  );
  t.after(() => page.dispose());
  assert.equal(page.snapshot().content.items[0].assetId, '');
  assert.match(page.snapshot().content.items[0].textPreview, /こんにちは/);
  await page.act({ id: 'test', type: 'gallery', command: 'query', value: 'BETA' });
  assert.deepEqual(
    page.snapshot().content.items.map((e) => e.title),
    ['one/b.txt'],
  );
  await assert.rejects(
    page.act({ id: 'test', type: 'gallery', command: 'import-set', setId: 'lucide' }),
  );
});
test('dialog cancellation, mismatched operations and failed save preserve the pending draft lifetime', async () => {
  let saveFails = true,
    edits = 0,
    failures = 0;
  const dialogs = new ImageLibraryDialogs({
    send() {},
    async edit() {
      edits++;
      if (saveFails) throw Error('conflict');
    },
    failed() {
      failures++;
    },
  });
  let result = dialogs.open({ media: 'text', kind: 'text-edit', groups: [], images: [] });
  const id = dialogs.current().id;
  await assert.rejects(dialogs.complete(id, { kind: 'delete-image' }));
  await assert.rejects(
    dialogs.complete(id, { kind: 'text-save', name: 'a.txt', body: 'draft' }),
    /conflict/,
  );
  assert.equal(dialogs.current().id, id);
  assert.equal(failures, 1);
  saveFails = false;
  await dialogs.complete(id, { kind: 'text-save', name: 'a.txt', body: 'draft' });
  assert.equal((await result).body, 'draft');
  assert.equal(edits, 2);
  result = dialogs.open({ media: 'text', kind: 'text-create', groups: [], images: [] });
  await dialogs.complete(dialogs.current().id);
  assert.equal(await result, undefined);
  assert.equal(edits, 2);
  result = dialogs.open({ media: 'text', kind: 'text-preview', groups: [], images: [] });
  await assert.rejects(
    dialogs.complete(dialogs.current().id, { kind: 'text-save', name: 'a.txt', body: 'forged' }),
  );
  dialogs.cancel();
  await result;
});
test('text view sizing and index collapse persist independently from sound and image views', () => {
  const value = {
    gallery: { schemaVersion: 1, library: { cardWidth: 180 } },
    soundGallery: { schemaVersion: 1, library: { cardWidth: 160 } },
    textGallery: {
      schemaVersion: 1,
      library: {
        cardWidth: 40,
        layout: { sidebarWidth: 320, collapsedGroups: ['定型'], collapsedFolders: ['one'] },
      },
    },
  };
  assert.deepEqual(parseDeviceUiState(value), value);
  assert.throws(() =>
    parseDeviceUiState({ textGallery: { schemaVersion: 1, library: { cardWidth: 39 } } }),
  );
});
