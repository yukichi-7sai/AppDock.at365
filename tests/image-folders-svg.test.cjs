const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  return id === 'electron' ? { shell: {} } : originalLoad.call(this, id, ...args);
};
const { ImageLibraryHost } = require('../out/main/main/core/image-library-host');
Module._load = originalLoad;
const { RegisteredImages } = require('../out/main/main/core/registered-images');
const { AssignedImages } = require('../out/main/main/core/assigned-images');
const { imagePath, imageFolder } = require('../out/main/shared/image-paths');
const { validateSvg } = require('../out/main/shared/svg-image');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 12h20"/></svg>',
);
let serial = 0;
const root = path.resolve('.artifacts/image-folders-svg-' + Date.now());
async function fixture(t) {
  const base = path.join(root, String(++serial));
  await fs.mkdir(path.join(base, 'images'), { recursive: true });
  let decodes = 0;
  const images = new RegisteredImages(path.join(base, 'images'), () => {
    decodes++;
    return {
      width: 24,
      height: 24,
      thumbnail: 'data:image/png;base64,AA==',
      circle: 'data:image/png;base64,AQ==',
    };
  });
  t.after(() => images.stop());
  const settings = {
    value: createDefaultSettings(),
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
  return { base, images, host, settings, decodes: () => decodes };
}
test('relative folder paths and assigned IDs reject root escapes and namespace collisions', () => {
  for (const value of ['a/b.svg', '日本語/heart.svg', '@assigned/' + 'a'.repeat(64) + '.svg'])
    assert(imagePath(value));
  for (const value of [
    '../a.svg',
    'a/../b.svg',
    '/a.svg',
    'a\\b.svg',
    'a//b.svg',
    'CON/a.svg',
    '@assigned/heart.svg',
    'a./b.svg',
    'https://x/a.svg',
  ])
    assert(!imagePath(value), value);
  assert(imageFolder(''));
  assert(!imageFolder('@assigned'));
});
test('SVG static shapes retain their bytes and reject executable, external and malformed content', () => {
  assert.equal(validateSvg(svg.toString()), svg.toString());
  for (const body of [
    '<script>alert(1)</script>',
    '<foreignObject/>',
    '<path onclick="x()"/>',
    '<use href="https://x/a.svg"/>',
    '<path style="fill:url(x)"/>',
    '<animate/>',
    '<path fill="url(https://x)"/>',
    '<path fill="&#106;avascript:x"/>',
    '<g></path>',
  ])
    assert.throws(() => validateSvg('<svg xmlns="http://www.w3.org/2000/svg">' + body + '</svg>'));
  assert.throws(() => validateSvg('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///c:/x">]>' + svg));
});
test('nested catalogue includes empty folders and more than 512 images without eager decoding', async (t) => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.images.directory, 'nested/empty'), { recursive: true });
  for (let i = 0; i < 620; i++)
    await fs.writeFile(path.join(f.images.directory, 'nested', i + '.svg'), svg);
  await f.images.refresh();
  assert.equal(f.images.list().length, 620);
  assert.equal(f.decodes(), 0);
  assert(f.images.folders.includes('nested/empty'));
  await f.images.read({ file: 'nested/3.svg' });
  assert.equal(f.decodes(), 1);
});
test('selection copy survives external rename, content changes, deletion and restart, and remains hidden from library', async (t) => {
  const f = await fixture(t),
    ref = await f.images.add(svg, 'icons/heart.svg');
  const saved = await f.host.retain(ref);
  assert.match(saved.file, /^@assigned\/[a-f0-9]{64}\.svg$/);
  assert.deepEqual(await f.host.retain(ref), saved);
  await fs.rename(path.join(f.images.directory, 'icons'), path.join(f.images.directory, 'renamed'));
  await fs.writeFile(
    path.join(f.images.directory, 'renamed/heart.svg'),
    svg.toString().replace('M2 12h20', 'M1 1h5'),
  );
  await fs.unlink(path.join(f.images.directory, 'renamed/heart.svg'));
  await fs.rmdir(path.join(f.images.directory, 'renamed'));
  await fs.rmdir(f.images.directory);
  const restarted = new RegisteredImages(f.images.directory, () => ({
    width: 24,
    height: 24,
    thumbnail: 'ok',
    circle: 'ok',
  }));
  t.after(() => restarted.stop());
  assert.deepEqual((await restarted.read(saved)).bytes, svg);
  assert.equal(restarted.list().length, 0);
  assert.equal(restarted.asset(saved).monochrome, true);
});
test('group fallback follows a unique moved basename, retains missing or ambiguous names, and preserves memberships', async (t) => {
  const f = await fixture(t);
  await f.images.add(svg, 'new/heart.svg');
  await f.images.add(svg, 'one/duplicate.svg');
  await f.images.add(svg, 'two/duplicate.svg');
  f.settings.value.imageLibrary = {
    groups: [
      {
        id: 'one',
        name: 'One',
        images: [{ file: 'old/heart.svg' }, { file: 'old/duplicate.svg' }, { file: 'renamed.svg' }],
      },
    ],
  };
  f.host.reconcileGroups();
  assert.deepEqual(f.settings.value.imageLibrary.groups[0].images, [
    { file: 'new/heart.svg' },
    { file: 'old/duplicate.svg' },
    { file: 'renamed.svg' },
  ]);
  const revision = f.settings.revision;
  f.host.reconcileGroups();
  assert.equal(f.settings.revision, revision);
});
test('folder operations affect disk and reject nonempty deletion, overwrites, traversal and redirected folders', async (t) => {
  const f = await fixture(t);
  await f.host.folderOperation('create', '', 'first');
  await f.host.folderOperation('create', '', 'second');
  const ref = await f.images.add(svg, 'first/heart.svg');
  await assert.rejects(f.host.folderOperation('delete', 'first'));
  await f.host.folderOperation('move-images', 'second', undefined, [ref]);
  assert.deepEqual(await fs.readFile(path.join(f.images.directory, 'second/heart.svg')), svg);
  await f.host.folderOperation('rename', 'second', 'renamed');
  await f.host.folderOperation('delete', 'first');
  await assert.rejects(f.host.folderOperation('create', '', '../escape'));
  await fs.mkdir(path.join(f.base, 'outside'));
  await fs.symlink(path.join(f.base, 'outside'), path.join(f.images.directory, 'link'), 'junction');
  await assert.rejects(f.images.add(svg, 'link/escape.svg'));
  await f.images.refresh();
  assert(!f.images.folders.includes('link'));
});
test('new settings selections are copied while old missing refs and group classifications are preserved', async (t) => {
  const f = await fixture(t);
  await f.images.add(svg, 'icons/heart.svg');
  const previous = createDefaultSettings();
  previous.ribbon.groups = [
    {
      id: 'group:old',
      title: 'Old',
      icon: 'heart',
      expansion: 'persistent',
      children: [],
      image: { file: 'missing.svg' },
    },
  ];
  const next = structuredClone(previous);
  next.ribbon.groups.push({
    id: 'group:new',
    title: 'New',
    icon: 'heart',
    expansion: 'persistent',
    children: [],
    image: { file: 'icons/heart.svg' },
  });
  next.imageLibrary = {
    groups: [{ id: 'icons', name: 'Icons', images: [{ file: 'icons/heart.svg' }] }],
  };
  new AssignedImages(f.images.directory).prepare(next, previous, []);
  assert.equal(next.ribbon.groups[0].image.file, 'missing.svg');
  assert.match(next.ribbon.groups[1].image.file, /^@assigned\//);
  assert.equal(next.imageLibrary.groups[0].images[0].file, 'icons/heart.svg');
  assert.equal(previous.ribbon.groups.length, 1);
});
test('native watching follows nested Explorer additions, replacements and folder moves', async (t) => {
  const f = await fixture(t);
  await f.images.watch();
  async function until(check) {
    const end = Date.now() + 5000;
    while (!check()) {
      assert(Date.now() < end);
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  await fs.mkdir(path.join(f.images.directory, 'new'));
  await fs.writeFile(path.join(f.images.directory, 'new/heart.svg'), svg);
  await until(() => f.images.entry({ file: 'new/heart.svg' })?.available);
  const old = f.images.entry({ file: 'new/heart.svg' }).generation;
  await fs.writeFile(
    path.join(f.images.directory, 'new/heart.svg'),
    svg.toString().replace('h20', 'h21'),
  );
  await until(() => f.images.entry({ file: 'new/heart.svg' })?.generation !== old);
  await fs.rename(path.join(f.images.directory, 'new'), path.join(f.images.directory, 'moved'));
  await until(
    () =>
      f.images.entry({ file: 'moved/heart.svg' })?.available &&
      f.images.entry({ file: 'new/heart.svg' })?.state === 'missing',
  );
});
test('programmatic import returns a retained selection that survives source deletion before saving', async (t) => {
  const f = await fixture(t),
    selected = await f.host.import({ filename: 'from-api.svg', base64: svg.toString('base64') });
  await assert.rejects(f.images.add(svg, '@assigned/' + 'a'.repeat(64) + '.svg'));
  assert.match(selected.file, /^@assigned\//);
  await fs.unlink(path.join(f.images.directory, 'from-api.svg'));
  assert.deepEqual((await f.images.read(selected)).bytes, svg);
});
test('declared nested image fields are retained without changing unselected defaults or unrelated row data', async (t) => {
  const f = await fixture(t);
  await f.images.add(svg, 'nested/heart.svg');
  const previous = createDefaultSettings(),
    next = structuredClone(previous);
  next.extensions['fixture.images'] = {
    enabled: true,
    settings: {
      items: [{ id: 'one', metadata: { image: { file: 'nested/heart.svg' }, other: 42 } }],
    },
  };
  new AssignedImages(f.images.directory).prepare(next, previous, [
    {
      id: 'fixture.images',
      settings: [
        {
          key: 'items',
          type: 'object-list',
          fields: [
            { key: 'image', type: 'registered-image', propertyPath: ['metadata', 'image'] },
            { key: 'default', type: 'registered-image', default: { file: 'missing.svg' } },
          ],
        },
      ],
    },
  ]);
  const row = next.extensions['fixture.images'].settings.items[0];
  assert.match(row.metadata.image.file, /^@assigned\//);
  assert.equal(row.metadata.other, 42);
  assert(!Object.hasOwn(row, 'default'));
});
test('bulk publication does not rescan the whole tree for its temporary files', async (t) => {
  const files = require('../out/main/main/core/image-files');
  const originalScan = files.scanImageTree;
  let scans = 0;
  files.scanImageTree = async (...args) => {
    scans++;
    return originalScan(...args);
  };
  t.after(() => (files.scanImageTree = originalScan));
  const f = await fixture(t);
  await f.images.watch();
  await f.images.batch(async () => {
    for (let i = 0; i < 60; i++) await f.images.add(svg, 'icon-' + i + '.svg');
  });
  await f.images.refresh(true);
  assert(scans < 8, `unexpected full scans: ${scans}`);
  assert.equal(f.images.list().length, 60);
});
