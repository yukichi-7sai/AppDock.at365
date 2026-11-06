const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const original = Module._load;
let pageApi;
Module._load = function (name, ...args) {
  if (name === './applet-pages')
    return {
      ...original.call(this, name, ...args),
      openLocalPage: async (_options, api) => {
        pageApi = api;
      },
    };
  return original.call(this, name, ...args);
};
const { createHostApi } = require('../out/main/main/core/host-api');
Module._load = original;
const { createDefaultSettings } = require('../out/main/shared/settings-schema');

test('Applet RPC and local-page bridge reject direct import while image selection remains available', async () => {
  const image = { file: 'fixture.png' };
  let imports = 0;
  const options = Array(16).fill(undefined);
  options[0] = { value: createDefaultSettings(), uiStateStorage: () => 'fixture-state' };
  options[1] = path.resolve('.artifacts/registered-images-api');
  options[2] = options[3] = () => {};
  options[15] = {
    import: async () => {
      imports++;
      return image;
    },
    snapshot: async () => ({ images: [{ ref: image, thumbnail: 'hidden-by-bridge' }] }),
    images: {
      preview: async (ref) => {
        assert.deepEqual(ref, image);
        return 'preview';
      },
    },
    pick: async (current, alive) => {
      assert.deepEqual(current, image);
      assert.equal(alive(), true);
      return { cancelled: false, image };
    },
    copyToCache: async () => 'fixture-cache.png',
  };
  const e = {
    state: 'running',
    runtimeSession: 'one',
    commands: [],
    manifest: {
      id: 'fixture.images',
      folder: path.resolve('tests'),
      capabilities: ['registered-images', 'pages'],
      pages: [
        { id: 'main', source: 'local', title: 'Images', ui: 'registered-images-api.test.cjs' },
      ],
    },
  };
  const api = createHostApi(...options);
  const request = { filename: 'removed.png', base64: 'aW1hZ2U=' };
  await assert.rejects(
    api(e, 'host.registeredImages.import', request),
    /host\.registeredImages\.import/,
  );
  await assert.rejects(
    api(e, 'host.registeredImages.import', request, true),
    /host\.registeredImages\.import/,
  );
  await api(e, 'host.pages.open', { id: 'main' });
  await assert.rejects(pageApi.call('registeredImages.import', request));
  assert.deepEqual(await pageApi.call('registeredImages.snapshot', {}), {
    images: [{ ref: image, thumbnail: '' }],
  });
  assert.equal(await pageApi.call('registeredImages.preview', { image }), 'preview');
  assert.deepEqual(await pageApi.call('registeredImages.pick', { current: image }), {
    cancelled: false,
    image,
  });
  assert.equal(await api(e, 'host.registeredImages.copyToCache', { image }), 'fixture-cache.png');
  assert.equal(imports, 0);
});
