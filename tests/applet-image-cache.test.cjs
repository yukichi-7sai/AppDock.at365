const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { createHostApi } = require('../out/main/main/core/host-api');
const { PageImageRegistry } = require('../out/main/main/core/page-images');
test('page image cache remains capability-protected and registers through the current page API', async (t) => {
  const root = fs.mkdtempSync(path.resolve('.artifacts/applet-image-cache-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const api = createHostApi(
      {},
      root,
      () => {},
      () => {},
    ),
    owner = { state: 'running', manifest: { id: 'fixture.cache', capabilities: ['local-images'] } };
  const directory = await api(owner, 'host.ui.imageDirectory', {});
  const file = path.join(directory, 'pixel.png');
  fs.writeFileSync(
    file,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  const registry = new PageImageRegistry(root, 'fixture.cache', () => true);
  t.after(() => registry.clear());
  const registered = await registry.register([{ key: 'pixel', file }]);
  assert.equal(registered.images.length, 1);
  assert.deepEqual(
    Buffer.from(await (await registry.response(registered.images[0].url)).arrayBuffer()),
    fs.readFileSync(file),
  );
  owner.manifest.capabilities = [];
  await assert.rejects(api(owner, 'host.ui.imageDirectory', {}), /capabilities/);
});
