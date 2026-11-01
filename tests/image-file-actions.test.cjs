const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const Module = require('node:module');
const shell = {
  trashItem: async (file) => fs.unlink(file),
  openPath: async () => '',
  showItemInFolder() {},
};
const clipboard = { writeText: async () => {} };
const load = Module._load;
Module._load = function (name, ...args) {
  return name === 'electron' ? { shell, clipboard } : load.call(this, name, ...args);
};
const { ImageLibraryHost } = require('../out/main/main/core/image-library-host');
Module._load = load;
const { RegisteredImages } = require('../out/main/main/core/registered-images');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const root = path.resolve('.artifacts/image-file-actions-' + Date.now());
const svg = (value) =>
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M' +
      value +
      ' 2h4"/></svg>',
  );
let serial = 0;
async function fixture(t) {
  const directory = path.join(root, String(++serial), 'images');
  const images = new RegisteredImages(directory, () => ({
    width: 24,
    height: 24,
    thumbnail: '',
    circle: '',
  }));
  t.after(() => images.stop());
  const a = await images.add(svg(1), 'one/a.svg'),
    b = await images.add(svg(2), 'one/b.svg');
  const settings = {
    value: {
      ...createDefaultSettings(),
      imageLibrary: {
        groups: [
          { id: 'a', name: 'A', images: [a, b] },
          { id: 'b', name: 'B', images: [b, a] },
        ],
      },
    },
    revision: 1,
    save(next, revision) {
      assert.equal(revision, this.revision);
      this.value = next;
      this.revision++;
    },
  };
  const host = new ImageLibraryHost(images, {
    settings,
    writable() {},
    window: () => null,
    show() {},
  });
  return {
    images,
    host,
    settings,
    a,
    b,
    directory,
    entries: () => [images.entry(a), images.entry(b)],
    read: (file) => fs.readFile(path.join(directory, file)),
  };
}
test('batch rename swaps names and updates every membership in place while assigned copies stay exact', async (t) => {
  const f = await fixture(t);
  const retained = await f.host.retain(f.a);
  f.settings.value.ribbon.items = [{ image: retained }];
  const retainedBytes = (await f.images.read(retained)).bytes;
  await f.host.rename(f.entries(), ['b.svg', 'a.svg']);
  assert.deepEqual(await f.read('one/b.svg'), svg(1));
  assert.deepEqual(await f.read('one/a.svg'), svg(2));
  assert.deepEqual(
    f.settings.value.imageLibrary.groups.map((g) => g.images.map((r) => r.file)),
    [
      ['one/b.svg', 'one/a.svg'],
      ['one/a.svg', 'one/b.svg'],
    ],
  );
  assert.deepEqual((await f.images.read(retained)).bytes, retainedBytes);
  assert.deepEqual((await fs.readdir(path.join(f.directory, 'one'))).sort(), ['a.svg', 'b.svg']);
  await f.host.rename([f.images.entry({ file: 'one/a.svg' })], ['A.svg']);
  assert((await fs.readdir(path.join(f.directory, 'one'))).includes('A.svg'));
});
test('duplicate destinations, changed extensions, escapes and changed confirmed files leave all originals untouched', async (t) => {
  const f = await fixture(t),
    before = JSON.stringify(f.settings.value);
  for (const names of [
    ['a.svg', 'a.svg'],
    ['../escape.svg', 'b.svg'],
    ['a.png', 'b.svg'],
  ])
    await assert.rejects(f.host.rename(f.entries(), names));
  await f.images.add(svg(3), 'one/c.svg');
  await assert.rejects(f.host.rename(f.entries(), ['c.svg', 'd.svg']));
  const entries = f.entries();
  await fs.writeFile(path.join(f.directory, 'one/b.svg'), svg(4));
  await assert.rejects(f.host.rename(entries, ['c2.svg', 'd.svg']), /変更/);
  assert.deepEqual(await f.read('one/a.svg'), svg(1));
  assert.deepEqual(await f.read('one/b.svg'), svg(4));
  assert.equal(JSON.stringify(f.settings.value), before);
});
test('settings failure rolls back all names and memberships', async (t) => {
  const f = await fixture(t),
    before = JSON.stringify(f.settings.value);
  f.settings.save = () => {
    throw Error('save denied');
  };
  await assert.rejects(f.host.rename(f.entries(), ['x.svg', 'y.svg']), /save denied/);
  assert.deepEqual(await f.read('one/a.svg'), svg(1));
  assert.deepEqual(await f.read('one/b.svg'), svg(2));
  assert.deepEqual((await fs.readdir(path.join(f.directory, 'one'))).sort(), ['a.svg', 'b.svg']);
  assert.equal(JSON.stringify(f.settings.value), before);
});

test('a destination created during rename is preserved and all sources are restored', async (t) => {
  const f = await fixture(t),
    before = JSON.stringify(f.settings.value);
  const target = path.join(f.directory, 'one/x.svg'),
    originalLink = fs.link;
  fs.link = async (source, destination) => {
    if (destination === target) await fs.writeFile(target, svg(8), { flag: 'wx' });
    return originalLink(source, destination);
  };
  try {
    await assert.rejects(f.host.rename(f.entries(), ['x.svg', 'y.svg']), /EEXIST/);
  } finally {
    fs.link = originalLink;
  }
  assert.deepEqual(await f.read('one/a.svg'), svg(1));
  assert.deepEqual(await f.read('one/b.svg'), svg(2));
  assert.deepEqual(await f.read('one/x.svg'), svg(8));
  assert.deepEqual((await fs.readdir(path.join(f.directory, 'one'))).sort(), [
    'a.svg',
    'b.svg',
    'x.svg',
  ]);
  assert.equal(JSON.stringify(f.settings.value), before);
});
test('a move explicitly updates membership even when another folder has the same basename', async (t) => {
  const f = await fixture(t);
  await f.images.add(svg(9), 'other/a.svg');
  await f.host.folderOperation('create', '', 'destination');
  const entry = f.images.entry(f.a);
  await f.host.folderOperation('move-images', 'destination', undefined, [f.a], [entry]);
  assert.deepEqual(await f.read('destination/a.svg'), svg(1));
  assert.deepEqual(await f.read('other/a.svg'), svg(9));
  assert.equal(f.settings.value.imageLibrary.groups[0].images[0].file, 'destination/a.svg');
});
test('legacy in-use sources cannot be renamed, and stale batch deletion refuses before the first recycle', async (t) => {
  const f = await fixture(t);
  f.settings.value.ribbon.items = [{ image: f.a }];
  await assert.rejects(f.host.rename(f.entries(), ['x.svg', 'y.svg']), /使用中/);
  f.settings.value.ribbon.items = [];
  let recycled = 0;
  shell.trashItem = async (file) => {
    recycled++;
    await fs.unlink(file);
  };
  const entries = f.entries();
  await fs.writeFile(path.join(f.directory, 'one/b.svg'), svg(5));
  await assert.rejects(f.host.removeMany(entries), /変更/);
  assert.equal(recycled, 0);
  assert.deepEqual(await f.read('one/a.svg'), svg(1));
  await f.images.refresh(true);
  await f.host.removeMany(f.entries());
  assert.equal(recycled, 2);
  assert(f.settings.value.imageLibrary.groups.every((g) => g.images.length === 0));
});
test('opening a new library creates only its root, while missing child folders are not recreated', async (t) => {
  const f = await fixture(t),
    directory = path.join(path.dirname(f.directory), 'new-library');
  const images = new RegisteredImages(directory, () => ({
    width: 24,
    height: 24,
    thumbnail: '',
    circle: '',
  }));
  t.after(() => images.stop());
  const host = new ImageLibraryHost(images, {
    settings: f.settings,
    writable() {},
    window: () => null,
    show() {},
  });
  let opened;
  shell.openPath = async (file) => {
    opened = file;
    return '';
  };
  await host.openFolder('');
  assert.equal(opened, directory);
  assert((await fs.stat(directory)).isDirectory());
  await assert.rejects(host.openFolder('missing'), /ENOENT/);
  assert.deepEqual(await fs.readdir(directory), []);
});

test('copy-paths includes every target, image copy rejects multiple targets, reveal groups folders, unsafe paths cannot open', async (t) => {
  const f = await fixture(t),
    revealed = [];
  let copied;
  clipboard.writeText = async (value) => {
    copied = value;
  };
  shell.showItemInFolder = (file) => revealed.push(file);
  await f.host.fileAction('copy-paths', f.entries());
  assert.deepEqual(copied.split('\r\n'), [
    path.join(f.directory, 'one/a.svg'),
    path.join(f.directory, 'one/b.svg'),
  ]);
  await assert.rejects(f.host.fileAction('copy-image', f.entries()), /1枚/);
  await f.host.fileAction('reveal', f.entries());
  assert.equal(revealed.length, 1);
  await assert.rejects(f.host.openFolder('../outside'));
});
