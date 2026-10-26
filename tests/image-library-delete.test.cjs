const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const Module = require('node:module');
const shell = {
  trashItem: async () => {
    throw Error('unset fixture');
  },
};
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  return id === 'electron' ? { shell } : originalLoad.call(this, id, ...args);
};
const { ImageLibraryHost, ownsImage } = require('../out/main/main/core/image-library-host');
Module._load = originalLoad;
const { RegisteredImages } = require('../out/main/main/core/registered-images');
const { ImageLibraryDialogs } = require('../out/main/main/core/image-library-dialogs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { hostSettingsPages, applySettingsJson } = require('../out/main/shared/settings-catalog');
const bytes = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.from('fixture'),
]);
const root = path.join(__dirname, '../.artifacts/image-delete-unit-' + Date.now());
let serial = 0;
async function fixture() {
  const directory = path.join(root, String(++serial));
  const images = new RegisteredImages(directory, () => ({
    width: 10,
    height: 10,
    thumbnail: '',
    circle: '',
  }));
  const ref = await images.add(bytes, 'sample.png');
  const store = {
    value: {
      ...createDefaultSettings(),
      imageLibrary: {
        groups: [
          { id: 'one', name: 'One', images: [ref] },
          { id: 'two', name: 'Two', images: [ref, { file: 'other.png' }] },
        ],
      },
    },
    revision: 1,
    save(value, revision) {
      assert.equal(revision, this.revision);
      this.value = value;
      this.revision++;
    },
  };
  const host = new ImageLibraryHost(images, {
    settings: store,
    writable() {},
    window: () => null,
    show() {},
  });
  const file = path.join(directory, ref.file),
    trash = path.join(directory, 'recycled.fixture');
  let calls = 0;
  shell.trashItem = async (target) => {
    assert.equal(target, file);
    calls++;
    await fs.rename(target, trash);
  };
  return { images, ref, entry: images.entry(ref), store, host, file, trash, calls: () => calls };
}
test('confirmed deletion removes memberships and catalogue, keeps original bytes in the recycle adapter', async () => {
  const f = await fixture();
  await f.host.remove(f.entry);
  assert.equal(f.calls(), 1);
  assert.deepEqual(await fs.readFile(f.trash), bytes);
  assert.equal(await fs.stat(f.file).catch(() => null), null);
  assert.equal(f.images.entry(f.ref), undefined);
  assert.deepEqual(
    f.store.value.imageLibrary.groups.map((g) => g.images),
    [[], [{ file: 'other.png' }]],
  );
  await assert.rejects(f.host.remove(f.entry));
  assert.equal(f.calls(), 1);
});
test('saved ribbon and inactive or unknown Applet references block deletion, memberships alone do not', async () => {
  const f = await fixture();
  assert.equal(f.host.inUse(f.ref), false);
  f.store.value.extensions.absent = {
    enabled: false,
    settings: { nested: [{ image: { file: 'SAMPLE.PNG' } }] },
  };
  await assert.rejects(f.host.remove(f.entry), /使用中/);
  assert.equal(f.calls(), 0);
  delete f.store.value.extensions.absent;
  f.store.value.ribbon.items = [{ image: f.ref }];
  assert.equal(f.host.inUse(f.ref), true);
  assert(
    ownsImage(
      { settings: [{ type: 'registered-image', key: 'image', default: f.ref }] },
      {},
      f.ref,
    ),
  );
  assert(
    !ownsImage(
      { settings: [{ type: 'registered-image', key: 'image', default: f.ref }] },
      { image: null },
      f.ref,
    ),
  );
});
test('both mode image references block deletion even when only the other mode is displayed', async () => {
  const f = await fixture();
  f.store.value.ribbon.itemOverrides['ribbon-display-mode'] = {
    displayModeIcons: { compact: { icon: 'star' }, expanded: { image: f.ref } },
  };
  assert.equal(f.host.inUse(f.ref), true);
  await assert.rejects(f.host.remove(f.entry), /使用中/);
  assert.equal(f.calls(), 0);
  f.store.value.ribbon.itemOverrides['ribbon-display-mode'].displayModeIcons = null;
  assert.equal(f.host.inUse(f.ref), false);
  assert.deepEqual(await fs.readFile(f.file), bytes);
});

test('changed bytes and invalid paths never reach the recycle adapter', async () => {
  const f = await fixture();
  await fs.writeFile(f.file, Buffer.concat([bytes, Buffer.from('changed')]));
  await assert.rejects(f.host.remove(f.entry), /変更/);
  await assert.rejects(
    f.images.remove({ file: '../sample.png' }, f.entry.generation, {
      trash: () => {
        throw Error('must not run');
      },
      prepare: () => () => {},
    }),
    /参照/,
  );
  assert.equal(f.calls(), 0);
});
test('settings save failure restores original exclusively and leaves memberships unchanged', async () => {
  const f = await fixture();
  const before = structuredClone(f.store.value);
  f.store.save = () => {
    throw Error('save failed');
  };
  await assert.rejects(f.host.remove(f.entry), /save failed/);
  assert.deepEqual(await fs.readFile(f.file), bytes);
  assert.deepEqual(f.store.value, before);
  assert(f.images.entry(f.ref).available);
});
test('settings changes while recycling cause restoration without overwriting newer settings', async () => {
  const f = await fixture();
  shell.trashItem = async () => {
    await fs.rename(f.file, f.trash);
    f.store.value.host.theme = 'dark';
    f.store.revision++;
  };
  await assert.rejects(f.host.remove(f.entry), /設定が変更/);
  assert.deepEqual(await fs.readFile(f.file), bytes);
  assert.equal(f.store.value.host.theme, 'dark');
  assert.equal(f.store.value.imageLibrary.groups[0].images.length, 1);
});
test('recycle failure retains original and membership; recovery never overwrites a different file', async () => {
  const f = await fixture();
  shell.trashItem = async () => {
    throw Error('OS failure');
  };
  await assert.rejects(f.host.remove(f.entry), /ごみ箱へ移せません/);
  assert.deepEqual(await fs.readFile(f.file), bytes);
  assert.equal(f.store.value.imageLibrary.groups[0].images.length, 1);
  const replacement = Buffer.concat([bytes, Buffer.from('replacement')]);
  shell.trashItem = async () => {
    await fs.rename(f.file, f.trash);
    await fs.writeFile(f.file, replacement);
    f.store.revision++;
  };
  await assert.rejects(f.host.remove(f.entry), /復元できません/);
  assert.deepEqual(await fs.readFile(f.file), replacement);
});
test('deletion is bound to the host request, disallows duplicate confirmation, and permits retry after failure', async () => {
  let release,
    requests = 0;
  const dialogs = new ImageLibraryDialogs({
    send() {},
    failed() {},
    edit: async (_, request) => {
      assert.equal(request.entry.ref.file, 'sample.png');
      requests++;
      await new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  const pending = dialogs.open({
    kind: 'delete-image',
    groups: [],
    images: [],
    entry: { ref: { file: 'sample.png' } },
  });
  const id = dialogs.current().id;
  await assert.rejects(dialogs.complete(id, { kind: 'order' }), /操作/);
  const saving = dialogs.complete(id, { kind: 'delete-image' });
  await assert.rejects(dialogs.complete(id, { kind: 'delete-image' }), /完了するまで/);
  assert.equal(requests, 1);
  release();
  await saving;
  await pending;
  await assert.rejects(dialogs.complete(id, { kind: 'delete-image' }), /終了/);
});
test('removing the settings category preserves image groups during unrelated JSON editing', () => {
  assert(!hostSettingsPages.some(([id]) => id === 'image-library'));
  const value = createDefaultSettings();
  value.imageLibrary = { groups: [{ id: 'keep', name: 'Keep', images: [{ file: 'sample.png' }] }] };
  const updated = applySettingsJson(
    value,
    { id: 'appearance', kind: 'host', json: true },
    [],
    JSON.stringify({ host: { theme: 'dark' } }),
  );
  assert.deepEqual(updated.imageLibrary, value.imageLibrary);
});
