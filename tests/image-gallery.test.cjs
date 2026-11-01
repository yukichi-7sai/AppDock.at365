const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GalleryViewStateStore } = require('../out/main/main/core/gallery-view-state');
const {
  ImageLibraryPageState,
  ImageLibraryPageSession,
} = require('../out/main/main/core/image-library-page');
const { ImageLibraryDialogs } = require('../out/main/main/core/image-library-dialogs');
const { editImageLibrary } = require('../out/main/shared/registered-images');
const root = path.join(__dirname, '../.artifacts/gallery-unit-' + Date.now());

test('library compact size and navigation layout persist independently from picker size', () => {
  const file = path.join(root, 'layout.json');
  const store = new GalleryViewStateStore(file);
  store.save('picker', 200);
  store.save('library', 40);
  const layout = { sidebarWidth: 328, collapsedGroups: ['Lucide'], collapsedFolders: ['icons'] };
  store.saveLayout(layout);
  const reopened = new GalleryViewStateStore(file);
  assert.equal(reopened.get('library'), 40);
  assert.equal(reopened.get('picker'), 200);
  assert.deepEqual(reopened.layout(), layout);
  assert.throws(() => reopened.save('picker', 40));
  assert.throws(() => reopened.saveLayout({ ...layout, sidebarWidth: 0 }));
  assert.deepEqual(new GalleryViewStateStore(file).layout(), layout);
});

test('card/dialog targets include unrendered selection and right-clicking an unselected card replaces it', async () => {
  const f = fixture(),
    items = f.session.snapshot().content.items;
  await f.act('select-all');
  const pending = f.act('dialog', { kind: 'rename-images', imageId: items[0].id });
  assert.equal(f.dialog.images.length, 130);
  assert.equal(f.dialog.entries.length, 130);
  await f.dialogs.complete(f.dialog.id);
  await pending;
  await f.act('clear');
  await f.act('select', { imageId: items[0].id, selected: true });
  await f.act('select-target', { imageId: items[1].id });
  const model = f.session.snapshot().content;
  assert.equal(model.selected, 1);
  assert.equal(model.items[1].selected, true);
  assert.equal(model.items[0].selected, false);
  await assert.rejects(f.act('select-target', { imageId: 'stale' }));
  f.session.dispose();
});
test('import progress updates one modal, rejects edits, cancels once and closes only after completion', async () => {
  const requests = [];
  let aborted = 0;
  const dialogs = new ImageLibraryDialogs({
    send: (r) => requests.push(r),
    edit: async () => {
      throw Error('unexpected edit');
    },
    failed() {},
  });
  const id = dialogs.openProgress(() => aborted++);
  const progress = { phase: 'import', completed: 20, total: 100, added: 20, reused: 0, failed: 0 };
  dialogs.progress(id, progress);
  assert.equal(dialogs.current().importing.completed, 20);
  await assert.rejects(dialogs.complete(id, { kind: 'import-set', setId: 'lucide' }));
  await dialogs.complete(id);
  await dialogs.complete(id);
  assert.equal(aborted, 1);
  assert(dialogs.current().cancelling);
  dialogs.progress(id, { ...progress, phase: 'groups' });
  assert(dialogs.current().cancelling);
  dialogs.closeProgress('stale');
  assert(dialogs.current());
  dialogs.closeProgress(id);
  assert.equal(requests.at(-1), null);
  dialogs.openProgress(() => aborted++);
  dialogs.cancel();
  assert.equal(aborted, 2);
});
fs.mkdirSync(root, { recursive: true });
let serial = 0;
function fixture() {
  const file = path.join(root, `${++serial}.json`);
  const store = new GalleryViewStateStore(file);
  const state = new ImageLibraryPageState(store);
  let entries = Array.from({ length: 130 }, (_, i) => ({
    ref: { file: `image-${String(i).padStart(3, '0')}.png` },
    width: 640,
    height: 400,
    bytes: 50,
    thumbnail: '',
    available: true,
    generation: `hash${i}`,
    state: 'ready',
  }));
  let value = {
    groups: [
      { id: 'all', name: 'すべて', images: [entries[0].ref] },
      { id: 'b', name: '写真', images: [entries[1].ref] },
    ],
  };
  const host = {
    inUse: () => false,
    images: { list: () => structuredClone(entries), refresh: async () => {} },
    edit: async (operation) => {
      value = editImageLibrary(value, operation);
    },
    registerMany: async () => [],
  };
  let dialog,
    failed = 0;
  const dialogs = new ImageLibraryDialogs({
    send: (r) => {
      dialog = r;
    },
    edit: host.edit,
    failed: () => failed++,
  });
  const options = {
    host,
    images: { session: () => ({ get: async () => 'image-data', dispose() {} }) },
    state,
    groups: () => value.groups,
    dialogs,
    dark: () => false,
    changed() {},
    failed() {
      failed++;
    },
  };
  let session = new ImageLibraryPageSession(
    { id: 'first', kind: 'image-library', route: 'image-library' },
    options,
  );
  const act = (command, fields = {}) =>
    session.act({ id: session.id, type: 'gallery', command, ...fields });
  return {
    file,
    store,
    state,
    host,
    options,
    dialogs,
    act,
    get session() {
      return session;
    },
    get value() {
      return value;
    },
    get dialog() {
      return dialog;
    },
    setEntries(next) {
      entries = next;
    },
    get entries() {
      return entries;
    },
    reopen() {
      session.dispose();
      session = new ImageLibraryPageSession(
        { id: 'second', kind: 'image-library', route: 'image-library' },
        options,
      );
    },
  };
}
test('folder drops include unrendered selections, survive navigation expansion and keep the current view', async () => {
  const f = fixture();
  f.host.images.folders = ['', 'target'];
  f.state.query = 'image';
  await f.act('select-all');
  const before = f.entries;
  f.host.rename = async (entries, names, folder) => {
    assert.equal(entries.length, 130);
    assert.deepEqual(entries, before);
    const refs = names.map((name) => ({ file: folder + '/' + name }));
    f.setEntries(entries.map((entry, i) => ({ ...entry, ref: refs[i] })));
    for (const group of f.value.groups)
      group.images = group.images.map(
        (ref) => refs[before.findIndex((entry) => entry.ref.file === ref.file)],
      );
    return refs;
  };
  const first = f.session.snapshot().content.items[0];
  const drag = await f.act('drag-start', { imageId: first.id });
  await f.act('layout', {
    value: { sidebarWidth: 220, collapsedFolders: [], collapsedGroups: [] },
  });
  await f.act('drop-folder', { token: drag.token, folder: 'target' });
  const content = f.session.snapshot().content;
  assert.equal(content.selected, 130);
  assert.equal(content.items.length, 64);
  assert.equal(content.folder, '*');
  assert.equal(content.query, 'image');
  assert.equal(content.group, 'all');
  assert.match(content.message, /130.*target/);
  assert(
    f.value.groups.every((group) => group.images.every((ref) => ref.file.startsWith('target/'))),
  );
  await assert.rejects(f.act('drop-folder', { token: drag.token, folder: '' }), /Stale/);
});

test('folder drop uses the drag-time generation and rejects changed views and invalid destinations', async () => {
  const f = fixture();
  f.host.images.folders = ['', 'target'];
  const first = f.session.snapshot().content.items[0];
  let drag = await f.act('drag-start', { imageId: first.id });
  await f.act('query', { value: 'image' });
  await assert.rejects(f.act('drop-folder', { token: drag.token, folder: 'target' }), /Stale/);
  drag = await f.act('drag-start', { imageId: first.id });
  await assert.rejects(f.act('drop-folder', { token: drag.token, folder: '../outside' }));
  drag = await f.act('drag-start', { imageId: first.id });
  f.setEntries(f.entries.map((entry, i) => (i ? entry : { ...entry, generation: 'replacement' })));
  let calls = 0;
  f.host.rename = async (entries) => {
    calls++;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].generation, 'hash0');
    throw Error('confirmed image changed');
  };
  await assert.rejects(f.act('drop-folder', { token: drag.token, folder: 'target' }), /changed/);
  assert.equal(calls, 1);
  assert.equal(f.state.busy, false);
  assert.equal(f.state.folder, '*');
  assert.equal(f.entries[0].ref.file, 'image-000.png');
});

test('view state creates no file until a valid edit; surfaces remain independent and corrupt files survive', () => {
  const file = path.join(root, 'state.json'),
    store = new GalleryViewStateStore(file);
  assert.equal(store.get('library'), 260);
  assert(!fs.existsSync(file));
  store.save('library', 180);
  store.save('picker', 360);
  const restored = new GalleryViewStateStore(file);
  assert.equal(restored.get('library'), 180);
  assert.equal(restored.get('picker'), 360);
  restored.save('library', 120);
  assert.equal(new GalleryViewStateStore(file).get('library'), 120);
  for (const value of [0, 181, 400, '260', NaN])
    assert.throws(() => restored.save('library', value));
  for (const invalid of [
    'broken',
    '{"schemaVersion":9}',
    '{"schemaVersion":1,"library":{"cardWidth":185}}',
  ]) {
    fs.writeFileSync(file, invalid);
    const bad = new GalleryViewStateStore(file);
    assert.throws(() => bad.save('library', 260));
    assert.equal(fs.readFileSync(file, 'utf8'), invalid);
  }
  fs.writeFileSync(file, '{"schemaVersion":1}');
  const external = new GalleryViewStateStore(file);
  fs.writeFileSync(file, '{"schemaVersion":99}');
  assert.throws(() => external.save('library', 280));
  assert.equal(fs.readFileSync(file, 'utf8'), '{"schemaVersion":99}');
});

test('icon import retry survives navigation, reruns classification and rejects duplicates or stale retries', async (t) => {
  const f = fixture(),
    applied = [],
    calls = [];
  f.host.images.folders = ['', 'Lucide Icon'];
  f.host.assertWritable = () => {};
  f.host.configuration = { addImportedGroups: (groups) => applied.push(groups) };
  let release;
  t.mock.method(
    require('../out/main/main/core/icon-set-import'),
    'importIconSet',
    async (options) => {
      calls.push(options.id);
      options.progress({ phase: 'import', completed: 1, total: 1, added: 0, reused: 1, failed: 0 });
      options.retry({
        id: 'lucide',
        version: '1.2.3',
        folder: 'Lucide Icon',
        images: [{ name: 'zap.svg' }],
        groups: [],
      });
      assert.equal(calls.length, 1, 'retry must not restart whole-set import');
      return { folder: 'Lucide Icon', added: 0, reused: 0, failed: 1, failures: ['zap.svg'] };
    },
  );
  t.mock.method(
    require('../out/main/main/core/icon-set-import'),
    'retryIconImport',
    async (options, retry) => {
      calls.push(retry.id);
      assert.deepEqual(
        retry.images.map((image) => image.name),
        ['zap.svg'],
      );
      await new Promise((resolve) => {
        release = resolve;
      });
      options.groups([
        {
          id: 'icon-set-lucide-weather',
          name: 'Lucide: Weather',
          images: [{ file: 'Lucide Icon/zap.svg' }],
        },
      ]);
      options.retry(undefined);
      return { folder: 'Lucide Icon', added: 0, reused: 1, failed: 0, failures: [] };
    },
  );
  await f.act('import-set', { setId: 'lucide' });
  assert(f.session.snapshot().content.canRetryIconImport);
  f.reopen();
  assert(f.session.snapshot().content.canRetryIconImport);
  const pending = f.act('retry-import');
  await assert.rejects(f.act('retry-import'), /完了|待|追加/);
  release();
  await pending;
  assert.deepEqual(calls, ['lucide', 'lucide']);
  assert.equal(applied[0][0].images[0].file, 'Lucide Icon/zap.svg');
  assert.equal(f.session.snapshot().content.canRetryIconImport, false);
  assert.equal(f.state.error, '');
  assert.equal(f.dialog, null);
  await assert.rejects(f.act('retry-import'));
});

test('download/group-save failures are retryable; an unrelated error or ordinary reload does not retry imports', async (t) => {
  const f = fixture();
  let calls = 0,
    scans = 0;
  f.host.images.folders = ['', 'Lucide Icon'];
  f.host.assertWritable = () => {};
  t.mock.method(require('../out/main/main/core/icon-set-import'), 'importIconSet', async () => {
    calls++;
    throw Error('save failed');
  });
  f.host.images.refresh = async () => {
    scans++;
  };
  await f.act('import-set', { setId: 'lucide' });
  assert(f.session.snapshot().content.canRetryIconImport);
  await f.act('retry-import');
  assert.equal(calls, 2);
  assert(f.session.snapshot().content.canRetryIconImport);
  f.state.error = 'unrelated file error';
  assert.equal(f.session.snapshot().content.canRetryIconImport, false);
  await assert.rejects(f.act('retry-import'));
  await f.act('reload');
  assert.equal(calls, 2);
  assert(scans > 0);
  await assert.rejects(f.act('import-set', { setId: 'unknown' }));
  assert.equal(calls, 2);
});
test('range selection replaces or adds displayed images atomically and rejects stale IDs', async () => {
  const f = fixture(),
    items = f.session.snapshot().content.items;
  await f.act('select-range', { imageIds: [items[0].id, items[1].id], additive: false });
  assert.equal(f.state.selected.size, 2);
  await f.act('select-range', { imageIds: [items[2].id], additive: true });
  assert.equal(f.state.selected.size, 3);
  await assert.rejects(
    f.act('select-range', { imageIds: [items[3].id, 'stale'], additive: false }),
  );
  assert.equal(f.state.selected.size, 3);
  await f.act('select-range', { imageIds: [items[3].id], additive: false });
  assert.equal(f.state.selected.size, 1);
});
test('dragging a selected card includes unrendered selections, preserves memberships and skips duplicates', async () => {
  const f = fixture(),
    c = f.session.snapshot().content;
  await f.act('select-all');
  const drag = await f.act('drag-start', { imageId: c.items[0].id });
  assert.equal(drag.count, 130);
  await f.act('drop', { token: drag.token, groupId: c.groups[3].id });
  assert.equal(f.value.groups[1].images.length, 130);
  assert.equal(f.value.groups[0].images.length, 1);
  assert.match(f.state.message, /129枚/);
  await assert.rejects(f.act('drop', { token: drag.token, groupId: c.groups[3].id }));
  const repeated = await f.act('drag-start', { imageId: c.items[0].id });
  await f.act('drop', { token: repeated.token, groupId: c.groups[3].id });
  assert.match(f.state.message, /0枚/);
  assert.equal(f.value.groups[1].images.length, 130);
});
test('unselected drags use one image; virtual targets, changed view and concurrent membership edits are rejected', async () => {
  const f = fixture(),
    c = f.session.snapshot().content;
  await f.act('select', { imageId: c.items[0].id, selected: true });
  let drag = await f.act('drag-start', { imageId: c.items[2].id });
  assert.equal(drag.count, 1);
  await assert.rejects(f.act('drop', { token: drag.token, groupId: 'unfiled' }));
  drag = await f.act('drag-start', { imageId: c.items[2].id });
  await f.act('query', { value: 'image' });
  await assert.rejects(f.act('drop', { token: drag.token, groupId: c.groups[3].id }));
  drag = await f.act('drag-start', { imageId: c.items[2].id });
  f.value.groups[0].images.push(f.entries[2].ref);
  const before = structuredClone(f.value);
  await assert.rejects(f.act('drop', { token: drag.token, groupId: c.groups[3].id }), /別の場所/);
  assert.deepEqual(f.value, before);
  drag = await f.act('drag-start', { imageId: c.items[2].id });
  await f.act('drop', { token: drag.token, groupId: c.groups[3].id });
  assert.equal(f.value.groups[1].images.length, 2);
});
test('a removed source image cannot be restored to a group by a pending drop', async () => {
  const f = fixture(),
    c = f.session.snapshot().content;
  const drag = await f.act('drag-start', { imageId: c.items[2].id });
  f.setEntries(f.entries.filter((entry) => entry.ref.file !== 'image-002.png'));
  await assert.rejects(f.act('drop', { token: drag.token, groupId: c.groups[3].id }));
  assert.equal(f.value.groups[1].images.length, 1);
});
test('batch membership is atomic on conflict and permits larger groups, preserves unrelated membership and originals', () => {
  const image = { file: 'a.png' },
    other = { file: 'b.png' };
  const value = {
    groups: [
      { id: 'a', name: 'A', images: [image] },
      { id: 'b', name: 'B', images: [other] },
    ],
  };
  const op = {
    kind: 'membership-batch',
    groupId: 'b',
    mode: 'add',
    images: [
      { image, before: ['a'] },
      { image: other, before: ['b'] },
    ],
  };
  const result = editImageLibrary(value, op);
  assert.deepEqual(result.groups[0], value.groups[0]);
  assert.equal(result.groups[1].images.length, 2);
  assert.equal(value.groups[1].images.length, 1);
  const conflict = structuredClone(op);
  conflict.images[1].before = [];
  assert.throws(() => editImageLibrary(value, conflict), /別の場所/);
  const full = structuredClone(value);
  full.groups[1].images = Array.from({ length: 512 }, (_, i) => ({ file: `n${i}.png` }));
  assert.equal(
    editImageLibrary(full, { ...op, images: [op.images[0]] }).groups[1].images.length,
    513,
  );
  assert.equal(full.groups[1].images.length, 512);
});
test('pagination selects all matches, resize keeps selections and anchor, navigation retains state with fresh IDs', async () => {
  const f = fixture(),
    first = f.session.snapshot().content;
  assert.equal(first.items.length, 64);
  assert.equal(first.total, 130);
  assert(!JSON.stringify(first).includes('thumbnail'));
  await f.act('select-all');
  assert.equal(f.session.snapshot().content.selected, 130);
  await f.act('more');
  await f.act('anchor', { anchor: { id: first.items[5].id, offset: -20 } });
  await f.act('width', { value: 360, commit: true });
  const resized = f.session.snapshot().content;
  assert.equal(resized.items.length, 128);
  assert.equal(resized.selected, 130);
  assert.equal(resized.anchor.id, first.items[5].id);
  f.reopen();
  const restored = f.session.snapshot().content;
  assert.equal(restored.selected, 130);
  assert.equal(restored.cardWidth, 360);
  assert.notEqual(restored.items[0].id, first.items[0].id);
  assert.equal(restored.anchor.id, restored.items[5].id);
  await assert.rejects(f.act('image', { assetId: first.items[0].assetId, edge: 512 }));
  await f.act('query', { value: 'IMAGE-00' });
  assert.equal(f.session.snapshot().content.total, 10);
  assert.equal(f.session.snapshot().content.selected, 0);
});
test('virtual groups cannot collide with saved IDs; absent references and read failures remain visible', async () => {
  const f = fixture();
  const model = f.session.snapshot().content,
    group = model.groups[2];
  assert.notEqual(group.id, 'all');
  await f.act('group', { groupId: group.id });
  assert.equal(f.session.snapshot().content.total, 1);
  f.setEntries([]);
  const missing = f.session.snapshot().content.items[0];
  assert.equal(missing.state, 'missing');
  await assert.rejects(f.act('image', { assetId: missing.assetId, edge: 512 }));
  const pending = f.act('dialog', { kind: 'membership', imageId: missing.id });
  assert.equal(f.dialog.kind, 'membership');
  await f.dialogs.complete(f.dialog.id);
  await pending;
});
test('partial import keeps successful files and exposes membership-only retry; import survives navigation', async () => {
  const f = fixture();
  const group = f.session.snapshot().content.groups[3];
  await f.act('group', { groupId: group.id });
  let finish;
  f.host.registerMany = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  f.host.edit = async () => {
    throw Error('conflict');
  };
  const task = f.act('add');
  assert(f.state.busy);
  f.reopen();
  finish([
    { name: 'image-000.png', image: f.entries[0].ref, reused: true },
    { name: 'bad.png', error: 'Invalid format' },
  ]);
  await task;
  assert(!f.state.busy);
  assert(f.state.retry);
  const c = f.session.snapshot().content;
  assert.equal(c.group, 'all');
  assert.equal(c.selected, 1);
  assert.match(c.error, /登録済み/);
  assert.match(c.message, /再利用 1枚・失敗 1枚/);
});
test('dialogs preserve failed edits and cancel stale requests; disposed sessions reject actions', async () => {
  const f = fixture(),
    id = f.session.snapshot().content.items[0].id;
  const task = f.act('dialog', { kind: 'membership', imageId: id });
  assert.equal(f.dialog.kind, 'membership');
  await assert.rejects(
    f.dialogs.complete(f.dialog.id, {
      kind: 'membership',
      image: f.entries[0].ref,
      ids: [],
      before: [],
    }),
  );
  assert(f.dialog);
  await f.dialogs.complete(f.dialog.id);
  await task;
  f.session.dispose();
  await assert.rejects(f.act('select-all'));
});
test('maximum catalogue retains 512 images, 64 groups and 4096 memberships without eagerly sending image bytes', async () => {
  const f = fixture();
  f.setEntries(
    Array.from({ length: 512 }, (_, i) => ({
      ref: { file: `max-${String(i).padStart(3, '0')}.png` },
      width: 2048,
      height: 2048,
      bytes: 4000,
      thumbnail: 'data:image/png;base64,IGNORED',
      available: true,
      generation: `${i}`,
    })),
  );
  f.value.groups = Array.from({ length: 64 }, (_, i) => ({
    id: `g${i}`,
    name: `Group ${i}`,
    images: i < 8 ? f.entries.map((e) => e.ref) : [],
  }));
  const c = f.session.snapshot().content;
  assert.equal(c.groups.length, 66);
  assert.equal(c.total, 512);
  assert.equal(c.items.length, 64);
  assert.equal(c.items[0].labels.length, 8);
  assert(!JSON.stringify(c).includes('base64'));
  await f.act('select-all');
  assert.equal(f.session.snapshot().content.selected, 512);
});

test('modal bookkeeping accepts validated anchors while edits remain active operations', async () => {
  const f = fixture(),
    item = f.session.snapshot().content.items[0];
  const request = (command, fields = {}) => ({
    id: f.session.id,
    type: 'gallery',
    command,
    ...fields,
  });
  assert(f.session.passive(request('image')));
  assert(f.session.passive(request('anchor')));
  for (const command of [
    'select',
    'select-range',
    'drag-start',
    'drop',
    'reorder',
    'select-all',
    'clear',
    'query',
    'group',
    'width',
    'more',
    'reload',
    'dialog',
    'add',
    'retry-membership',
    'retry-import',
  ])
    assert.equal(f.session.passive(request(command)), false, command);
  assert.equal(f.session.passive({ type: 'invoke', command: 'anchor' }), false);
  const persistedWidth = f.state.width;
  const before = structuredClone(f.value);
  await f.act('anchor', { anchor: { id: item.id, offset: -24 } });
  assert.deepEqual(f.session.snapshot().content.anchor, { id: item.id, offset: -24 });
  await assert.rejects(f.act('anchor', { anchor: { id: 'foreign', offset: 0 } }));
  await assert.rejects(f.act('anchor', { anchor: { id: item.id, offset: Infinity } }));
  await assert.rejects(f.act('anchor', { anchor: { id: item.id, offset: 10001 } }));
  assert.deepEqual(f.session.snapshot().content.anchor, { id: item.id, offset: -24 });
  assert.equal(f.session.snapshot().content.selected, 0);
  assert.deepEqual(f.value, before);
  assert.equal(f.state.width, persistedWidth);
  assert.equal(f.store.get('library'), 260);
  assert(!fs.existsSync(f.file));
  f.session.dispose();
  await assert.rejects(f.act('anchor', { anchor: { id: item.id, offset: 0 } }));
});

test('group ordering moves selected images in visual order, survives reopening and leaves other groups unchanged', async () => {
  const f = fixture();
  const refs = f.entries.slice(0, 6).map((e) => e.ref);
  f.value.groups[1].images = refs;
  const other = structuredClone(f.value.groups[0]);
  await f.act('group', { groupId: f.session.snapshot().content.groups[3].id });
  const items = f.session.snapshot().content.items;
  // Reverse click order must not reverse the moved block.
  for (const index of [2, 0]) await f.act('select', { imageId: items[index].id, selected: true });
  const drag = await f.act('drag-start', { imageId: items[0].id });
  await f.act('reorder', { token: drag.token, imageId: items[4].id, after: true });
  const expected = [1, 3, 4, 0, 2, 5].map((i) => refs[i].file);
  assert.deepEqual(
    f.value.groups[1].images.map((r) => r.file),
    expected,
  );
  f.reopen();
  assert.deepEqual(
    f.session.snapshot().content.items.map((i) => i.title),
    expected,
  );
  assert.deepEqual(f.value.groups[0], other);
  await f.act('group', { groupId: 'all' });
  assert.deepEqual(
    f.session
      .snapshot()
      .content.items.slice(0, 6)
      .map((i) => i.title),
    refs.map((r) => r.file),
  );
  const virtualDrag = await f.act('drag-start', {
    imageId: f.session.snapshot().content.items[0].id,
  });
  await assert.rejects(
    f.act('reorder', {
      token: virtualDrag.token,
      imageId: f.session.snapshot().content.items[2].id,
      after: false,
    }),
  );
});

test('filtered reorder keeps hidden images in relative order and refuses concurrent group edits', async () => {
  const f = fixture();
  const refs = [0, 10, 1, 11, 2].map((i) => f.entries[i].ref);
  f.value.groups[1].images = refs;
  await f.act('group', { groupId: f.session.snapshot().content.groups[3].id });
  await f.act('query', { value: 'image-00' });
  const items = f.session.snapshot().content.items;
  let drag = await f.act('drag-start', { imageId: items[2].id });
  await f.act('reorder', { token: drag.token, imageId: items[0].id, after: false });
  assert.deepEqual(
    f.value.groups[1].images.map((r) => r.file),
    [2, 0, 10, 1, 11].map((i) => f.entries[i].ref.file),
  );
  drag = await f.act('drag-start', { imageId: items[0].id });
  f.value.groups[1].images.reverse();
  const changed = structuredClone(f.value);
  await assert.rejects(f.act('reorder', { token: drag.token, imageId: items[1].id, after: true }));
  assert.deepEqual(f.value, changed);
  await assert.rejects(f.act('reorder', { token: drag.token, imageId: items[1].id, after: true }));
});

test('membership changes retain existing order and append only new images', async () => {
  const f = fixture();
  const refs = f.entries.slice(0, 4).map((e) => e.ref);
  f.value.groups[1].images = [refs[2], refs[0], refs[1]];
  const before = structuredClone(f.value);
  await f.host.edit({
    kind: 'membership',
    image: refs[0],
    ids: ['all', 'b'],
    before: ['all', 'b'],
  });
  assert.deepEqual(f.value, before);
  await f.host.edit({
    kind: 'membership-batch',
    mode: 'add',
    groupId: 'b',
    images: [
      { image: refs[0], before: ['all', 'b'] },
      { image: refs[3], before: [] },
    ],
  });
  assert.deepEqual(f.value.groups[1].images, [refs[2], refs[0], refs[1], refs[3]]);
});

test('selection and view changes dismiss success feedback while retaining errors', async () => {
  for (const command of ['select', 'select-range', 'select-all', 'clear', 'group', 'query']) {
    const f = fixture();
    const model = f.session.snapshot().content;
    const drag = await f.act('drag-start', { imageId: model.items[0].id });
    await f.act('drop', { token: drag.token, groupId: model.groups[3].id });
    assert.match(f.session.snapshot().content.message, /1枚/);
    f.state.error = 'Save error remains actionable';
    await f.act(command, {
      imageId: model.items[1].id,
      selected: true,
      imageIds: [model.items[1].id],
      additive: false,
      groupId: model.groups[3].id,
      value: 'image-00',
    });
    assert.equal(f.session.snapshot().content.message, '', command);
    assert.equal(f.session.snapshot().content.error, 'Save error remains actionable', command);
  }
});

test('late drop and reorder results do not restore feedback after the selection context changes', async () => {
  for (const command of ['drop', 'reorder']) {
    const f = fixture();
    f.value.groups[1].images = f.entries.slice(0, 4).map((e) => e.ref);
    const group = f.session.snapshot().content.groups[3].id;
    await f.act('group', { groupId: group });
    const items = f.session.snapshot().content.items;
    const drag = await f.act('drag-start', { imageId: items[0].id });
    let finish;
    const gate = new Promise((resolve) => {
      finish = resolve;
    });
    const edit = f.host.edit;
    f.host.edit = async (op) => {
      await gate;
      await edit(op);
    };
    const operation = f.act(command, {
      token: drag.token,
      groupId: group,
      imageId: items[2].id,
      after: true,
    });
    await f.act('clear');
    finish();
    await operation;
    assert.equal(f.session.snapshot().content.message, '', command);
    if (command === 'reorder') {
      assert.equal(f.value.groups[1].images[2].file, 'image-000.png');
      const next = await f.act('drag-start', { imageId: items[0].id });
      await f.act('reorder', { token: next.token, imageId: items[1].id, after: false });
      assert.match(f.session.snapshot().content.message, /順番を保存/);
      await f.act('group', { groupId: 'all' });
      assert.equal(f.session.snapshot().content.message, '');
    }
  }
});
