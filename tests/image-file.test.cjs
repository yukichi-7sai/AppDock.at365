const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { inspectImageFile } = require('../out/main/main/core/image-file');
const { ImageFileSources } = require('../out/main/main/core/image-file-source');
const { RegisteredImages } = require('../out/main/main/core/registered-images');
const { writePng } = require('../scripts/image-file-fixture.cjs');
const root = path.resolve('.artifacts/image-file-unit-' + Date.now());
async function directory(t) {
  await fs.mkdir(root, { recursive: true });
  return fs.mkdtemp(path.join(root, 'case-'));
}
test('File header inspection accepts large dimensions and rejects animation, truncation and disguised content', async (t) => {
  const dir = await directory(t),
    file = path.join(dir, 'image.png');
  await writePng(file, 10000, 2000);
  assert.deepEqual(await inspectImageFile(file), { format: 'png', width: 10000, height: 2000 });
  await assert.rejects(inspectImageFile(file, 'image.jpg'), /extension/);
  const bytes = await fs.readFile(file);
  const animated = Buffer.concat([
    bytes.subarray(0, 33),
    Buffer.from('000000086163544c000000010000000000000000', 'hex'),
    bytes.subarray(33),
  ]);
  await fs.writeFile(file, animated);
  await assert.rejects(inspectImageFile(file), /Animated/);
  await fs.writeFile(file, bytes.subarray(0, 40));
  await assert.rejects(inspectImageFile(file), /Truncated/);
  await fs.writeFile(
    file,
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );
  await assert.rejects(inspectImageFile(file, 'image.svg'));
  const webp = Buffer.alloc(30);
  webp.write('RIFF');
  webp.writeUInt32LE(22, 4);
  webp.write('WEBPVP8X', 8);
  webp.writeUInt32LE(10, 16);
  webp[20] = 2;
  await fs.writeFile(file, webp);
  await assert.rejects(inspectImageFile(file, 'image.webp'), /Animated/);
  webp[20] = 0;
  webp.writeUInt32LE(1, 16);
  await fs.writeFile(file, webp);
  await assert.rejects(inspectImageFile(file, 'image.webp'), /header/);
});
test('Original image URLs serve ranges only while the requesting view owns the file', async (t) => {
  const dir = await directory(t),
    file = path.join(dir, 'image.png');
  await writePng(file, 32, 24);
  const sources = new ImageFileSources('appdock://host/library-original/');
  const source = await sources.open(file, 'image/png');
  const response = sources.response(new Request(source.url, { headers: { range: 'bytes=0-7' } }));
  assert.equal(response.status, 206);
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    Buffer.from('89504e470d0a1a0a', 'hex'),
  );
  assert.equal(sources.response(new Request(source.url + '?path=' + file)).status, 404);
  await source.close();
  await source.close();
  assert.equal(sources.response(new Request(source.url)).status, 404);
  await assert.rejects(sources.open(file, 'image/png', 'bad-hash'), /changed/);
  await assert.rejects(
    sources.open(file, 'image/png', undefined, () => false),
    /closed/,
  );
});
test('Concurrent file reads share validation and one closed view does not cancel another', async (t) => {
  const dir = await directory(t),
    file = path.join(dir, 'image.png');
  await writePng(file, 32, 24);
  let calls = 0,
    release,
    started;
  const entered = new Promise((resolve) => (started = resolve));
  const decode = Object.assign(
    () => {
      throw Error('Byte decoder used');
    },
    {
      file: async () => {
        calls++;
        started();
        await new Promise((resolve) => (release = resolve));
        return { width: 32, height: 24, thumbnail: 'preview', circle: 'circle' };
      },
    },
  );
  const images = new RegisteredImages(dir, decode);
  t.after(() => images.stop());
  let live = true;
  const first = images.readFile({ file: 'image.png' }, undefined, { active: () => live });
  const rejection = assert.rejects(first);
  await entered;
  const second = images.readFile({ file: 'image.png' });
  // Wait until the second caller has joined the current validation.
  while ([...images.entries.values()][0].filePending.interests.size < 2)
    await new Promise((resolve) => setImmediate(resolve));
  live = false;
  release();
  await rejection;
  assert.equal((await second).thumbnail, 'preview');
  assert.equal(calls, 1);
  assert.equal(images.entry({ file: 'image.png' }).available, true);
});
