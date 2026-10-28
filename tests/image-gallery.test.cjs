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
    images: { get: async () => 'image-data' },
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
