const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHostApi } = require('../out/main/main/core/host-api');

test('Applet settings navigation only opens the running caller and preserves the details entry', async () => {
  const opened = [];
  const callbacks = {
    openDetails: async (id) => {
      opened.push(['details', id]);
      return { accepted: true };
    },
    openSettings: async (id) => {
      opened.push(['settings', id]);
      return { accepted: true };
    },
  };
  const options = [{}, path.resolve('.artifacts'), () => {}, () => {}];
  options[14] = callbacks;
  const api = createHostApi(...options);
  const caller = { state: 'running', manifest: { id: 'test.own-settings', capabilities: ['ui'] } };
  assert.deepEqual(await api(caller, 'host.ui.openSettings', {}), { accepted: true });
  for (const input of [
    { id: 'another.applet' },
    { pageId: 'general' },
    { url: 'https://example.com' },
    null,
    [],
    'settings',
  ])
    await assert.rejects(api(caller, 'host.ui.openSettings', input));
  await assert.rejects(
    api(
      { ...caller, manifest: { ...caller.manifest, capabilities: [] } },
      'host.ui.openSettings',
      {},
    ),
  );
  for (const state of ['stopped', 'stopping', 'error'])
    await assert.rejects(api({ ...caller, state }, 'host.ui.openSettings', {}));
  await api(caller, 'host.ui.openDetails', {});
  assert.deepEqual(opened, [
    ['settings', caller.manifest.id],
    ['details', caller.manifest.id],
  ]);
  options[14] = { openDetails: callbacks.openDetails };
  await assert.rejects(createHostApi(...options)(caller, 'host.ui.openSettings', {}));
  await createHostApi(...options)(caller, 'host.ui.openDetails', {});
  options[14] = undefined;
  await assert.rejects(createHostApi(...options)(caller, 'host.ui.openSettings', {}));
});
