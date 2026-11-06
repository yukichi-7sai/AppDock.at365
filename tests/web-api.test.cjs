const { siblingManifest } = require('./fixtures/sibling-manifest.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { SettingsStore } = require('../out/main/main/core/settings');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const webAppletSettingDefinitions = siblingManifest('Applet.WebApplet.at365')
  .pageCollections[0].fields;

test('WebApplet public settings share revision, validation and caller permissions without exposing private fields', async (t) => {
  const root = path.resolve('.artifacts/web-api-unit');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const store = new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  const itemId = '11111111-2222-3333-4444-555555555555';
  const id = 'at365.web-applet.sites.' + itemId;
  const next = structuredClone(store.value);
  next.extensions['at365.web-applet'] = { enabled: true, settings: { sites: [] } };
  next.extensions['at365.web-applet'].settings.sites.push({
    id: itemId,
    name: 'Before',
    display: 'page',
    enabled: true,
    url: 'https://example.test/?PRIVATE_QUERY#PRIVATE_FRAGMENT',
    navigation: 'same-origin',
    allowedOrigins: [],
    icon: '',
    imported: { name: 'Original' },
  });
  store.save(next, store.revision);
  const applets = () =>
    store.value.extensions['at365.web-applet'].settings.sites.map((a) => ({
      ...a,
      id: 'at365.web-applet.sites.' + a.id,
      displayName: a.name,
      runtime: 'node',
      collection: { owner: 'at365.web-applet', key: 'sites', itemId: a.id },
      state: a.enabled ? 'running' : 'stopped',
      settings: webAppletSettingDefinitions,
    }));
  const options = { settings: store, applets, save: (v, r) => store.save(v, r) };
  const commands = new SettingsCommands(options);
  let write = false;
  const api = new AppDockApi({
    ...options,
    settingsCommands: commands,
    commands: () => [],
    execute: async () => {
      throw Error('Wrong dispatcher');
    },
    writable: () => write,
    executable: () => true,
    ready: () => true,
    version: 'test',
    instanceId: 'test',
    appletPermissions: () => ({ read: true, write: true, execute: true }),
  });
  const read = () => api.call('settings.get', { appletId: id });
  const run = (changes, extra = {}, caller) =>
    api.call(
      'commands.execute',
      {
        id: id + '.settings.update',
        args: { changes, expectedRevision: read().revision, ...extra },
      },
      caller,
    );
  assert.deepEqual(Object.keys(api.call('settings.getSchema', { appletId: id }).fields), [
    'name',
    'display',
  ]);
  assert.deepEqual(read().values, { name: 'Before', display: 'page' });
  assert.ok(!JSON.stringify(read()).includes('PRIVATE'));
  assert.ok(api.call('commands.list').commands.some((c) => c.id === id + '.settings.update'));
  await assert.rejects(run({ name: 'Denied' }), { code: 'WRITE_DISABLED' });
  const bytes = fs.readFileSync(store.file, 'utf8');
  const dry = await run({ name: '  After  ', display: 'window' }, { dryRun: true }, 'test.caller');
  assert.equal(dry.completion, 'validated');
  assert.deepEqual(dry.values, { name: 'After', display: 'window' });
  assert.equal(fs.readFileSync(store.file, 'utf8'), bytes);
  write = true;
  for (const changes of [
    { name: ' ' },
    { name: 'x'.repeat(81) },
    { name: 'x\ny' },
    { name: 'Good', url: 'https://other.test' },
    { accountId: 'other' },
    { navigation: 'any' },
    { allowedOrigins: [] },
    { enabled: false },
    { icon: '' },
    { display: 'other' },
  ]) {
    await assert.rejects(run(changes), { code: 'INVALID_ARGUMENT' });
    assert.equal(fs.readFileSync(store.file, 'utf8'), bytes);
  }
  const revision = read().revision;
  const saved = await run({ name: ' After ', display: 'window' }, {}, 'test.caller');
  assert.equal(saved.completion, 'settingsSaved');
  assert.deepEqual(saved.changed, ['name', 'display']);
  assert.equal(store.value.extensions[id], undefined);
  assert.equal(
    store.value.extensions['at365.web-applet'].settings.sites[0].url,
    next.extensions['at365.web-applet'].settings.sites[0].url,
  );
  assert.deepEqual(store.value.extensions['at365.web-applet'].settings.sites[0].imported, {
    name: 'Original',
  });
  await assert.rejects(run({ name: 'Stale' }, { expectedRevision: revision }), {
    code: 'REVISION_CONFLICT',
  });
  const noOp = await run({ name: ' After ' });
  assert.deepEqual(noOp.changed, []);
  const disabled = structuredClone(store.value);
  disabled.extensions['at365.web-applet'].settings.sites[0].enabled = false;
  store.save(disabled, store.revision);
  await assert.rejects(run({ name: 'Disabled' }), { code: 'UNAVAILABLE' });
  assert.deepEqual(read().values, { name: 'After', display: 'window' });
  const removed = structuredClone(store.value);
  removed.extensions['at365.web-applet'].settings.sites = [];
  store.save(removed, store.revision);
  assert.throws(read, { code: 'NOT_FOUND' });
});
