const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GalleryImages } = require('../out/main/main/core/gallery-images');

function fixture(decode) {
  let decodes = 0,
    reads = 0;
  const images = {
    refresh: async () => {},
    contentHash: () => 'content',
    entry: () => ({ available: true, generation: 'v1' }),
    read: async (_ref, generation, options) => {
      assert.equal(options.cachePreview, false);
      assert(options.active());
      reads++;
      return { bytes: Buffer.from('original'), hash: 'content', generation, thumbnail: 'small' };
    },
  };
  const gallery = new GalleryImages(images, async () => {
    decodes++;
    await decode?.();
    return { width: 100, height: 100, thumbnail: 'data:image/png;base64,AA==' };
  });
  return {
    gallery,
    get decodes() {
      return decodes;
    },
    get reads() {
      return reads;
    },
  };
}
const ref = { file: 'gallery.png' };

test('visible previews reuse their pixels across settings updates and release them on close', async () => {
  const f = fixture(),
    preview = f.gallery.session();
  assert.equal(await preview.preview(ref), 'small');
  assert.equal(await preview.preview(ref), 'small');
  assert.equal(f.reads, 1);
  preview.dispose();
  await assert.rejects(preview.preview(ref));
  const reopened = f.gallery.session();
  assert.equal(await reopened.preview(ref), 'small');
  assert.equal(f.reads, 2);
  reopened.dispose();
});

test('closing one gallery preserves shared images; closing the final owner releases and reloads them', async () => {
  const f = fixture(),
    first = f.gallery.session(),
    second = f.gallery.session();
  const source = await first.get(ref, 'v1', 512);
  assert.equal(await second.get(ref, 'v1', 512), source);
  first.dispose();
  assert.equal(await second.get(ref, 'v1', 512), source);
  assert.equal(f.decodes, 1);
  second.dispose();
  assert.equal(f.gallery.cache.size, 0);
  assert.equal(f.gallery.bytes, 0);
  assert.equal(await f.gallery.queue, undefined);
  const reopened = f.gallery.session();
  assert.equal(await reopened.get(ref, 'v1', 512), source);
  assert.equal(f.decodes, 2);
  reopened.dispose();
});

test('closing during decode cancels queued work and prevents late results from retaining images', async () => {
  let release, enter;
  const started = new Promise((resolve) => {
    enter = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture(async () => {
    enter();
    await gate;
  });
  const closed = f.gallery.session();
  const first = assert.rejects(closed.get(ref, 'v1', 512));
  await started;
  const queued = assert.rejects(closed.get(ref, 'v1', 1024));
  closed.dispose();
  const reopened = f.gallery.session();
  const fresh = reopened.get(ref, 'v1', 512);
  release();
  await Promise.all([first, queued, fresh]);
  assert.equal(f.decodes, 2);
  assert.equal(f.reads, 2);
  assert.equal(f.gallery.cache.size, 1);
  reopened.dispose();
  assert.equal(f.gallery.cache.size, 0);
  assert.equal(f.gallery.pending.size, 0);
  await assert.rejects(closed.get(ref, 'v1', 512));
});

test('a closed requester does not cancel another surface sharing the same pending decode', async () => {
  let release, enter;
  const started = new Promise((resolve) => {
    enter = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture(async () => {
    enter();
    await gate;
  });
  const first = f.gallery.session(),
    second = f.gallery.session();
  const cancelled = assert.rejects(first.get(ref, 'v1', 512));
  await started;
  const shared = second.get(ref, 'v1', 512);
  first.dispose();
  release();
  await cancelled;
  assert.match(await shared, /^data:image/);
  assert.equal(f.decodes, 1);
  second.dispose();
  assert.equal(f.gallery.cache.size, 0);
});
