const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHostApi } = require('../out/main/main/core/host-api.js');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ExtensionManager } = require('../out/main/main/core/extensions.js');

test('local panel images use capability-protected cache files without image byte caps', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-images-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const api = createHostApi(
    {},
    root,
    () => {},
    () => {},
  );
  const e = { manifest: { id: 'test', capabilities: ['ui', 'local-images'] }, state: 'running' };
  const folder = await api(e, 'host.ui.imageDirectory', {});
  const file = path.join(folder, 'large.png');
  fs.writeFileSync(file, Buffer.alloc(3 * 1024 * 1024));
  await api(e, 'host.ui.panel', {
    title: 'Images',
    images: [
      {
        title: 'Large',
        imageFile: file,
        actions: [{ title: 'Delete', command: '', actionId: 'test.delete.opaque-id' }],
      },
    ],
  });
  assert.match(e.panel.images[0].image, /^appdock:\/\/host\/panel-images\/test\//);
  assert.equal(e.panel.images[0].imageFile, file);
  const previous = e.panel;
  const outside = path.join(root, 'outside.png');
  fs.writeFileSync(outside, 'keep');
  await assert.rejects(
    api(e, 'host.ui.panel', { title: 'Bad', images: [{ title: 'Bad', imageFile: outside }] }),
    /専用キャッシュ/,
  );
  assert.equal(e.panel, previous);
  e.manifest.capabilities = ['ui'];
  await assert.rejects(api(e, 'host.ui.imageDirectory', {}), /capabilities/);
  await assert.rejects(
    api(e, 'host.ui.panel', { title: 'Bad', images: [{ title: 'Bad', imageFile: file }] }),
    /サムネイル/,
  );
});
test('only actions from the current running panel are callable and they are separate from commands', async () => {
  const calls = [];
  const manager = new ExtensionManager({
    roots: [],
    settings: { value: { extensions: {} } },
    log: () => {},
  });
  const e = {
    state: 'running',
    manifest: { id: 'test' },
    commands: [],
    peer: { closed: false, request: async (...args) => calls.push(args) },
    panel: {
      title: 'History',
      images: [
        {
          title: 'Image',
          actions: [{ title: 'Delete', command: '', actionId: 'test.delete.current' }],
        },
      ],
    },
  };
  manager.items.set('test', e);
  assert.throws(() => manager.execute('test.delete.current'), /利用/);
  await manager.executePanelAction('test', 'test.delete.current');
  assert.deepEqual(calls, [['panel.action', { id: 'test.delete.current' }]]);
  assert.throws(() => manager.executePanelAction('test', 'test.delete.stale'), /更新/);
  e.state = 'stopped';
  assert.throws(() => manager.executePanelAction('test', 'test.delete.current'), /更新/);
});
test('image panel metadata accepts SDK null defaults and rejects embedded image input', async () => {
  const api = createHostApi(
    {},
    '',
    () => {},
    () => {},
  );
  const e = { manifest: { id: 'test', capabilities: ['ui'] }, state: 'running' };
  const panel = { title: 'History', description: '', facts: [], actions: [], images: null };
  await api(e, 'host.ui.panel', panel);
  const image = {
    title: 'Image',
    description: 'Info',
    actions: [{ title: 'Open', command: 'test.open' }],
  };
  await api(e, 'host.ui.panel', { ...panel, images: [image] });
  const previous = e.panel;
  for (const images of [
    Array(1001).fill(image),
    [{ ...image, image: 'https://example.com/image.png' }],
    [{ ...image, image: 'data:image/svg+xml;base64,AA==' }],
    [{ ...image, actions: [{ title: 'Open', command: 'other.open' }] }],
  ]) {
    await assert.rejects(api(e, 'host.ui.panel', { ...panel, images }), /サムネイル/);
    assert.equal(e.panel, previous, 'invalid images must preserve the last valid panel');
  }
  await api(e, 'host.ui.panel', {
    ...panel,
    images: [{ title: 'Missing', description: null, actions: null }],
  });
  e.manifest.capabilities = [];
  await assert.rejects(api(e, 'host.ui.panel', panel), /capabilities/);
});
