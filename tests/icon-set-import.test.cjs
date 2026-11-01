const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { importIconSet } = require('../out/main/main/core/icon-set-import');
const { RegisteredImages } = require('../out/main/main/core/registered-images');
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
  const options = {
    id: 'lucide',
    images,
    signal: controller.signal,
    writable() {},
    progress(value) {
      progress.push(value);
    },
    async fetch(url) {
      requests.push(url);
      return new Response(url.endsWith('/latest') ? JSON.stringify(metadata) : bytes, {
        status: 200,
      });
    },
  };
  return { directory, images, controller, progress, requests, metadata, options };
}
test('verified explicit import keeps original SVG and license, reuses identical files and preserves edited files', async (t) => {
  const f = await setup(t);
  assert.deepEqual(f.requests, []);
  const first = await importIconSet(f.options);
  assert.equal(first.added, 1);
  assert.equal(first.failed, 0);
  assert.equal(f.requests.length, 2);
  const file = path.join(f.directory, 'Lucide Icon/heart.svg');
  assert.deepEqual(await fs.readFile(file), svg);
  assert.equal(
    await fs.readFile(path.join(f.directory, 'Lucide Icon/LICENSE-1.2.3.txt'), 'utf8'),
    'ISC license',
  );
  assert.equal((await importIconSet(f.options)).reused, 1);
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
  assert.deepEqual((await fs.readdir(path.dirname(f.directory))).sort(), ['images']);
  for (const entry of f.images.list())
    assert.deepEqual((await f.images.read(entry.ref)).bytes, svg);
});
