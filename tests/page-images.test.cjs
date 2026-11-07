const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PageImageRegistry } = require('../out/main/main/core/page-images');
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
function fixture(t) {
  const base = path.resolve(__dirname, '../.artifacts');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'page-images-'));
  t.after(() => {
    assert.equal(path.dirname(root), base);
    fs.rmSync(root, { recursive: true, force: true });
  });
  let active = true;
  const registry = new PageImageRegistry(root, 'test.pages', () => active);
  t.after(() => registry.clear());
  const file = path.join(root, 'cache/panel-images/test.pages/pixel.png');
  fs.writeFileSync(file, pixel);
  return {
    root,
    file,
    registry,
    stop: () => {
      active = false;
    },
  };
}
test('page images preserve bytes without a panel and isolate pages, release and provider lifetime', async (t) => {
  const a = fixture(t),
    b = fixture(t);
  const {
    images: [image],
  } = await a.registry.register([{ key: 'one', file: a.file }]);
  assert.match(image.url, /^appdock:\/\/page-images\/[\w-]{32}$/);
  const response = await a.registry.response(image.url);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pixel);
  assert.equal((await b.registry.response(image.url)).status, 404);
  assert.equal((await a.registry.response(image.url.replace('appdock:', 'https:'))).status, 404);
  assert.equal((await a.registry.response(image.url + '?path=' + a.file)).status, 404);
  a.registry.release([image.id]);
  a.registry.release([image.id]);
  assert.equal((await a.registry.response(image.url)).status, 404);
  const next = await a.registry.register([{ key: 'two', file: a.file }]);
  a.stop();
  assert.equal((await a.registry.response(next.images[0].url)).status, 404);
  assert.ok(fs.existsSync(a.file), 'host releases references without deleting Applet files');
});
test('invalid image batches are atomic and enforce cache ownership and raster format', async (t) => {
  const f = fixture(t);
  const outside = path.join(f.root, 'outside.png');
  fs.writeFileSync(outside, pixel);
  const invalid = path.join(path.dirname(f.file), 'bad.png');
  fs.writeFileSync(invalid, 'not an image');
  for (const bad of [outside, invalid, 'relative.png']) {
    await assert.rejects(
      f.registry.register([
        { key: 'good', file: f.file },
        { key: 'bad', file: bad },
      ]),
    );
    assert.equal(f.registry.size, 0);
  }
  await assert.rejects(
    f.registry.register([
      { key: 'same', file: f.file },
      { key: 'same', file: f.file },
    ]),
  );
  const pending = f.registry.register([{ key: 'one', file: f.file }]);
  f.stop();
  await assert.rejects(pending, /終了/);
  assert.equal(f.registry.size, 0);
});
test('replaced cache files and cleared views cannot reuse an image reference', async (t) => {
  const f = fixture(t);
  const {
    images: [image],
  } = await f.registry.register([{ key: 'one', file: f.file }]);
  fs.renameSync(f.file, f.file + '.old');
  fs.writeFileSync(f.file, pixel);
  assert.equal((await f.registry.response(image.url)).status, 404);
  const second = await f.registry.register([{ key: 'two', file: f.file }]);
  f.registry.clear();
  assert.equal((await f.registry.response(second.images[0].url)).status, 404);
});

test('page images scan JPEG metadata incrementally and preserve large file responses', async (t) => {
  const f = fixture(t);
  const segment = Buffer.alloc(65537);
  segment.writeUInt16BE(0xffe1, 0);
  segment.writeUInt16BE(65535, 2);
  const jpeg = Buffer.concat([
    Buffer.from([255, 216]),
    ...Array(6).fill(segment),
    Buffer.from([255, 192, 0, 8, 8, 16, 0, 16, 0, 1]),
    Buffer.from([255, 217]),
  ]);
  const file = path.join(path.dirname(f.file), 'metadata.jpg');
  fs.writeFileSync(file, jpeg);
  const registered = await f.registry.register([{ key: 'jpeg', file }]);
  const response = await f.registry.response(registered.images[0].url);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg);
  const large = Buffer.concat([pixel, Buffer.alloc(33 * 1024 * 1024)]);
  const original = path.join(path.dirname(f.file), 'large.png');
  fs.writeFileSync(original, large);
  const result = await f.registry.register(
    Array.from({ length: 65 }, (_, i) => ({ key: 'image' + i, file: original })),
  );
  assert.equal(result.images.length, 65);
  assert.deepEqual(
    Buffer.from(await (await f.registry.response(result.images[0].url)).arrayBuffer()),
    large,
  );
});
