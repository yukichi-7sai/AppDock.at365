const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { importIconSet } = require('../out/main/main/core/icon-set-import');
const { RegisteredImages } = require('../out/main/main/core/registered-images');
const { ImageLibrarySettings } = require('../out/main/main/core/image-library-settings');
const root = path.resolve('.artifacts/icon-set-import-' + Date.now());
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h20v20Z"/></svg>',
);
function archive(entries) {
  const chunks = [];
  for (const [name, value, type = '0'] of entries) {
    const bytes = Buffer.from(value),
      header = Buffer.alloc(512);
    header.write(name, 0, 100);
    header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write(type, 156);
    header.fill(32, 148, 156);
    header.write(
      header
        .reduce((a, b) => a + b, 0)
        .toString(8)
        .padStart(6, '0') + '\0 ',
      148,
    );
    chunks.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}
let serial = 0;
async function setup(
  t,
  entries = [
    ['package/icons/heart.svg', svg],
    ['package/LICENSE', 'ISC license'],
  ],
  sourceEntries,
) {
  const directory = path.join(root, String(++serial), 'images');
  await fs.mkdir(directory, { recursive: true });
  const images = new RegisteredImages(directory, () => ({
    width: 24,
    height: 24,
    thumbnail: 'png',
    circle: 'png',
  }));
  t.after(() => images.stop());
  const bytes = archive(entries),
    controller = new AbortController(),
    progress = [],
    requests = [];
  const metadata = {
    version: '1.2.3',
    dist: {
      tarball: 'https://registry.npmjs.org/lucide-static/-/lucide-static-1.2.3.tgz',
      integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'),
    },
  };
  const source = archive(
    sourceEntries ?? [
      ['lucide-1.2.3/categories/shapes.json', JSON.stringify({ title: 'Shapes' })],
      ...entries
        .filter(([name]) => /^package\/icons\/[a-z0-9-]+\.svg$/.test(name))
        .map(([name]) => [
          'lucide-1.2.3/icons/' + path.basename(name, '.svg') + '.json',
          JSON.stringify({ categories: ['shapes'] }),
        ]),
    ],
  );
  const store = {
    revision: 0,
    value: { imageLibrary: { groups: [] } },
    writes: 0,
    save(value, revision) {
      assert.equal(revision, this.revision);
      this.value = value;
      this.revision++;
      this.writes++;
    },
  };
  const configuration = new ImageLibrarySettings(store, () => {});
  const options = {
    id: 'lucide',
    images,
    signal: controller.signal,
    writable() {},
    groups(value) {
      configuration.addImportedGroups(value);
    },
    progress(value) {
      progress.push(value);
    },
    async fetch(url) {
      requests.push(url);
      return new Response(
        url.endsWith('/latest')
          ? JSON.stringify(metadata)
          : url.startsWith('https://codeload.github.com/')
            ? source
            : bytes,
        {
          status: 200,
        },
      );
    },
  };
  return { directory, images, controller, progress, requests, metadata, options, store };
}
test('verified explicit import keeps original SVG and license, reuses identical files and preserves edited files', async (t) => {
  const f = await setup(t);
  assert.deepEqual(f.requests, []);
  const first = await importIconSet(f.options);
  assert.equal(first.added, 1);
  assert.equal(first.failed, 0);
  assert.equal(f.requests.length, 3);
  assert.equal(
    f.requests[2],
    'https://codeload.github.com/lucide-icons/lucide/tar.gz/refs/tags/1.2.3',
  );
  assert.deepEqual(f.store.value.imageLibrary.groups, [
    {
      id: 'icon-set-lucide-shapes',
      name: 'Lucide: Shapes',
      images: [{ file: 'Lucide Icon/heart.svg' }],
    },
  ]);
  const file = path.join(f.directory, 'Lucide Icon/heart.svg');
  assert.deepEqual(await fs.readFile(file), svg);
  assert.equal(
    await fs.readFile(path.join(f.directory, 'Lucide Icon/LICENSE-1.2.3.txt'), 'utf8'),
    'ISC license',
  );
  assert.equal((await importIconSet(f.options)).reused, 1);
  assert.equal(f.store.writes, 1, 'identical reimport does not save duplicate memberships');
  const changed = Buffer.from(svg.toString().replace('h20', 'h10'));
  await fs.writeFile(file, changed);
  const second = await importIconSet(f.options);
  assert.equal(second.failed, 1);
  assert.deepEqual(second.failures, ['heart.svg']);
  assert.deepEqual(await fs.readFile(file), changed);
});
test('bad integrity, executable SVG, missing license, link entries and offline responses never publish images', async (t) => {
  const integrity = await setup(t);
  integrity.metadata.dist.integrity = 'sha512-' + Buffer.alloc(64).toString('base64');
  await assert.rejects(importIconSet(integrity.options));
  assert.deepEqual(await fs.readdir(integrity.directory), []);
  for (const entries of [
    [
      ['package/icons/heart.svg', '<svg><script/></svg>'],
      ['package/LICENSE', 'ISC'],
    ],
    [['package/icons/heart.svg', svg]],
    [
      ['package/icons/heart.svg', svg, '2'],
      ['package/LICENSE', 'ISC'],
    ],
  ]) {
    const f = await setup(t, entries);
    await assert.rejects(importIconSet(f.options));
    assert.deepEqual(await fs.readdir(f.directory), []);
  }
  const offline = await setup(t);
  offline.options.fetch = async () => {
    throw Error('offline');
  };
  await assert.rejects(importIconSet(offline.options), /offline/);
  assert.deepEqual(await fs.readdir(offline.directory), []);
});
test('unselected archive paths are never extracted and cancellation retains only completed images', async (t) => {
  const entries = [
    ['package/LICENSE', 'ISC'],
    ['package/../../escape.svg', svg],
    ...Array.from({ length: 25 }, (_, i) => ['package/icons/icon-' + i + '.svg', svg]),
  ];
  const f = await setup(t, entries);
  f.options.progress = (value) => {
    if (value.completed === 20) f.controller.abort();
  };
  await assert.rejects(importIconSet(f.options), (error) => error.name === 'AbortError');
  await f.images.refresh();
  assert.equal(f.images.list().length, 20);
  assert.equal(f.store.value.imageLibrary.groups[0].images.length, 20);
  assert.deepEqual((await fs.readdir(path.dirname(f.directory))).sort(), ['images']);
  for (const entry of f.images.list())
    assert.deepEqual((await f.images.read(entry.ref)).bytes, svg);
});

test('official category titles, inherited categories and aliases merge into multiple groups without losing edits', async (t) => {
  const f = await setup(
    t,
    [
      ['package/LICENSE', 'ISC'],
      ...['clock', 'clock-check', 'alarm-check'].map((name) => [
        'package/icons/' + name + '.svg',
        svg,
      ]),
    ],
    [
      ['lucide-1.2.3/categories/time.json', JSON.stringify({ title: 'Time & calendar' })],
      ['lucide-1.2.3/categories/devices.json', JSON.stringify({ title: 'Devices' })],
      ['lucide-1.2.3/icons/clock.json', JSON.stringify({ categories: ['time', 'devices'] })],
      [
        'lucide-1.2.3/icons/clock-check.json',
        JSON.stringify({
          categories: ['$extends:clock', 'time'],
          aliases: [{ name: 'alarm-check' }],
        }),
      ],
    ],
  );
  await importIconSet(f.options);
  let groups = f.store.value.imageLibrary.groups;
  assert.deepEqual(
    groups.map((g) => g.name),
    ['Lucide: Devices', 'Lucide: Time & calendar'],
  );
  assert(groups.every((g) => g.images.length === 3));
  groups[0].name = 'Favorite devices';
  groups[0].images.push({ file: 'manual.svg' });
  groups.push({ id: 'personal', name: 'Personal', images: [{ file: 'Lucide Icon/clock.svg' }] });
  await importIconSet(f.options);
  groups = f.store.value.imageLibrary.groups;
  assert.deepEqual(
    groups.map((g) => g.name),
    ['Favorite devices', 'Lucide: Time & calendar', 'Personal'],
  );
  assert.equal(groups[0].images.length, 4);
  assert.equal(groups[2].images.length, 1);
});

test('invalid, unavailable or mismatched metadata is rejected before publishing originals or groups', async (t) => {
  for (const source of [
    [],
    [['lucide-1.2.3/icons/heart.json', 'invalid json']],
    [['lucide-1.2.3/icons/heart.json', JSON.stringify({ categories: ['missing'] })]],
    [['lucide-1.2.3/icons/heart.json', JSON.stringify({ categories: ['$extends:heart'] })]],
    [['lucide-9.9.9/icons/heart.json', JSON.stringify({ categories: [] })]],
    [['lucide-1.2.3/icons/heart.json', JSON.stringify({ categories: [] }), '2']],
  ]) {
    const f = await setup(t, undefined, source);
    await assert.rejects(importIconSet(f.options));
    assert.deepEqual(await fs.readdir(f.directory), []);
    assert.equal(f.store.writes, 0);
  }
  const f = await setup(t),
    fetch = f.options.fetch;
  f.options.fetch = (url) =>
    url.startsWith('https://codeload.github.com/')
      ? Promise.resolve(new Response('not found', { status: 404 }))
      : fetch(url);
  await assert.rejects(importIconSet(f.options));
  assert.deepEqual(await fs.readdir(f.directory), []);
});

test('failed image conflicts are not classified, and a group-save failure remains retryable', async (t) => {
  const f = await setup(t);
  await fs.mkdir(path.join(f.directory, 'Lucide Icon'));
  await fs.writeFile(path.join(f.directory, 'Lucide Icon/heart.svg'), 'user image');
  assert.equal((await importIconSet(f.options)).failed, 1);
  assert.equal(f.store.writes, 0);
  await fs.unlink(path.join(f.directory, 'Lucide Icon/heart.svg'));
  const save = f.options.groups;
  f.options.groups = () => {
    throw Error('save denied');
  };
  await assert.rejects(importIconSet(f.options), /save denied/);
  assert.deepEqual(await fs.readFile(path.join(f.directory, 'Lucide Icon/heart.svg')), svg);
  f.options.groups = save;
  assert.equal((await importIconSet(f.options)).reused, 1);
  assert.equal(f.store.value.imageLibrary.groups[0].images.length, 1);
});
