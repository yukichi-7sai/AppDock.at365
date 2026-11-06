const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { PageCollectionManager } = require('../out/main/main/core/page-collections');
const { SettingsStore, defaults } = require('../out/main/main/core/settings');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { RibbonCommands } = require('../out/main/main/core/ribbon-commands');
const row = {
  id: '11111111-2222-3333-4444-555555555555',
  name: 'Site',
  enabled: true,
  display: 'page',
  url: 'https://example.test/',
  navigation: 'same-origin',
  allowedOrigins: [],
};
const owner = {
  id: 'fixture.web',
  capabilities: ['pages', 'dynamic-pages'],
  pageCollections: [{ key: 'items', source: 'remote', fields: [] }],
};
function fixture() {
  const before = defaults();
  before.extensions[owner.id] = { enabled: true, settings: { items: [structuredClone(row)] } };
  const manager = new PageCollectionManager({
    settings: () => before,
    parents: () => [owner],
    localRoot: 'unused',
    sources: () => { throw Error('Unexpected read'); },
    changed: () => {},
    failed: () => {},
    openLocal: async () => {
      throw Error('No page opening');
    },
  });
  return { before, manager };
}
test('site registration, validation and listing do not open an account session', () => {
  const { before, manager } = fixture();
  manager.remote = () => { throw Error('Unexpected WebContents'); };
  assert.doesNotThrow(() => manager.validate(before));
  assert.equal(manager.snapshot()[0].collection.itemId, row.id);
  assert.equal(fs.existsSync('unused'), false);
});
test('ribbon saving preserves site registration and does not access session data', (t) => {
  const { before, manager } = fixture(),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-ribbon-reference-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  store.save(before, store.revision);
  const oldRows = JSON.stringify(store.value.extensions[owner.id]);
  const save = (next, revision) => {
    manager.validate(next);
    return store.save(next, revision);
  };
  const settingsCommands = new SettingsCommands({ settings: store, applets: () => [owner], save });
  const ribbon = new RibbonCommands({
    settings: store,
    settingsCommands,
    ribbonApplets: () => [owner],
    save,
  });
  const result = ribbon.execute({
    expectedRevision: settingsCommands.revision(),
    operations: [{ kind: 'update', id: 'image-library', changes: { visible: false } }],
  });
  assert.equal(result.changed, true);
  assert(store.value.ribbon.hidden.includes('image-library'));
  assert.equal(JSON.stringify(store.value.extensions[owner.id]), oldRows);
  assert.equal(store.value.migrations, undefined);
  assert.equal(JSON.parse(fs.readFileSync(store.file)).migrations, undefined);
});
