const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MemoryStorage } = require('../out/main/main/core/memory-storage');
const { createHostApi } = require('../out/main/main/core/host-api');
const { PageSourceImages } = require('../out/main/main/core/page-source-images');
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

test('memory Storage uses the existing API, isolates owners and releases values without creating files', async (t) => {
  const base = path.resolve(__dirname, '../.artifacts');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'memory-storage-'));
  t.after(() => {
    assert.equal(path.dirname(root), base);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const api = createHostApi(
    {},
    root,
    () => {},
    () => {},
  );
  const applet = (id) => ({ state: 'running', manifest: { id, capabilities: ['storage'] } });
  const a = applet('test.memory-a'),
    b = applet('test.memory-b');
  const input = { entries: ['original.png'], nested: { value: 3 } };
  await api(a, 'host.storage.set', { key: 'history', value: input, scope: 'memory' });
  input.entries.push('mutated');
  assert.deepEqual(await api(a, 'host.storage.get', { key: 'history', scope: 'memory' }), {
    entries: ['original.png'],
    nested: { value: 3 },
  });
  assert.equal(await api(b, 'host.storage.get', { key: 'history', scope: 'memory' }), null);
  const copy = await api(a, 'host.storage.get', { key: 'history', scope: 'memory' });
  copy.nested.value = 9;
  assert.equal(
    (await api(a, 'host.storage.get', { key: 'history', scope: 'memory' })).nested.value,
    3,
  );
  await assert.rejects(
    api(a, 'host.storage.set', { key: '../outside', value: 1, scope: 'memory' }),
  );
  await assert.rejects(
    api(a, 'host.storage.set', { key: 'history', value: 'x'.repeat(1024 * 1024), scope: 'memory' }),
  );
  assert.equal(
    (await api(a, 'host.storage.get', { key: 'history', scope: 'memory' })).nested.value,
    3,
  );
  await api(a, 'host.storage.set', { key: 'history', value: null, scope: 'memory' });
  assert.equal(a.memoryStorage.size, 0);
  await api(a, 'host.storage.set', { key: 'history', value: [1], scope: 'memory' });
  a.memoryStorage.clear();
  assert.equal(await api(a, 'host.storage.get', { key: 'history', scope: 'memory' }), null);
  assert.deepEqual(fs.readdirSync(root), [], 'memory never creates a data/cache/Storage directory');
});

function sources(t) {
  const base = path.resolve(__dirname, '../.artifacts');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'source-images-'));
  t.after(() => {
    assert.equal(path.dirname(root), base);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const file = path.join(root, 'original.png');
  fs.writeFileSync(file, pixel);
  const storage = new MemoryStorage();
  storage.set('paths', [file]);
  const operations = [];
  let active = true;
  const registry = new PageSourceImages(storage, () => active, {
    open: async (file) => operations.push(['open', file]),
    trash: async (file) => {
      operations.push(['trash', file]);
      fs.unlinkSync(file);
    },
    removed: async (file) => operations.push(['removed', file]),
  });
  t.after(() => registry.clear());
  const request = { key: 'paths', pointer: '/0', file };
  return {
    registry,
    request,
    file,
    storage,
    operations,
    hide: () => {
      active = false;
      registry.clear();
    },
  };
}
test('source images accept only publisher-owned image paths and stream current original bytes without a cache', async (t) => {
  const a = sources(t),
    b = sources(t);
  await assert.rejects(a.registry.register({ ...a.request, file: b.file }));
  await assert.rejects(a.registry.register({ ...a.request, pointer: '/missing' }));
  a.storage.set('renderer-data', [a.file], false);
  await assert.rejects(a.registry.register({ ...a.request, key: 'renderer-data' }));
  const image = await a.registry.register(a.request);
  const response = await a.registry.response(image.url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pixel);
  assert.equal((await b.registry.response(image.url)).status, 404);
  assert.equal((await a.registry.response(image.url + '?path=' + b.file)).status, 404);
  a.storage.set('paths', null);
  await a.registry.operate(image.id, 'open');
  assert.deepEqual(
    a.operations,
    [['open', a.file]],
    'an issued reference retains its exact target until the view closes',
  );
  fs.unlinkSync(a.file);
  assert.equal(
    (await a.registry.response(image.url)).status,
    404,
    'removed originals never fall back to old pixels',
  );
  await assert.rejects(a.registry.operate(image.id, 'open'));
});
test('source image close cancels readers and late registration; a deleted reference cannot run twice', async (t) => {
  const a = sources(t);
  const pending = a.registry.register(a.request);
  a.registry.clear();
  await assert.rejects(pending);
  assert.equal(a.registry.size, 0);
  const image = await a.registry.register(a.request);
  await a.registry.operate(image.id, 'trash');
  assert.deepEqual(a.operations, [
    ['trash', a.file],
    ['removed', a.file],
  ]);
  await assert.rejects(a.registry.operate(image.id, 'trash'));
  assert.equal(a.registry.size, 0);
  const b = sources(t);
  const owned = await b.registry.register(b.request);
  b.hide();
  assert.equal((await b.registry.response(owned.url)).status, 404);
  await assert.rejects(b.registry.register(b.request));
});
test('a publication changing during file validation keeps the captured target and cannot redirect it', async (t) => {
  const a = sources(t);
  const pending = a.registry.register(a.request);
  a.storage.set('paths', [a.file + '.different']);
  const image = await pending;
  const response = await a.registry.response(image.url);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pixel);
  await a.registry.operate(image.id, 'open');
  assert.deepEqual(a.operations, [['open', a.file]]);
});
test('releasing a source while an operation is validating prevents its external effect', async (t) => {
  const a = sources(t);
  const source = await a.registry.register(a.request);
  const pending = a.registry.operate(source.id, 'trash');
  a.registry.release([source.id]);
  await assert.rejects(pending);
  assert.deepEqual(a.operations, []);
  assert(fs.existsSync(a.file));
});
test('normal stop and crash clear the owning Applet memory without depending on deactivate', async () => {
  const { ExtensionManager } = require('../out/main/main/core/extensions');
  const manager = {
    executions: { stop() {} },
    cancelStart() {},
    finishStartup() {},
    log() {},
    emit() {},
  };
  const applet = () => ({
    state: 'running',
    manifest: { id: 'test.memory-lifetime' },
    memoryStorage: new MemoryStorage(),
  });
  const normal = applet();
  normal.memoryStorage.set('history', [1]);
  await ExtensionManager.prototype.stop.call(manager, normal);
  assert.equal(normal.state, 'stopped');
  assert.equal(normal.memoryStorage.size, 0);
  const crashed = applet();
  crashed.memoryStorage.set('history', [1]);
  ExtensionManager.prototype.crashed.call(manager, crashed, 'fixture');
  assert.equal(crashed.state, 'error');
  assert.equal(crashed.memoryStorage.size, 0);
});
