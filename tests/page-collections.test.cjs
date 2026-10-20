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
  id: 'site.one',
  name: 'Site',
  enabled: true,
  display: 'page',
  url: 'https://example.test/',
  navigation: 'same-origin',
  allowedOrigins: [],
  accountId: 'account.11111111-1111-4111-8111-111111111111',
};
const owner = {
  id: 'fixture.web',
  capabilities: ['pages', 'dynamic-pages', 'web-profiles'],
  pageCollections: [{ key: 'items', source: 'remote', fields: [] }],
};
function fixture() {
  const before = defaults();
  before.extensions[owner.id] = { enabled: true, settings: { items: [structuredClone(row)] } };
  const calls = [];
  const manager = new PageCollectionManager({
    settings: () => before,
    parents: () => [owner],
    localRoot: 'unused',
    sharedRoot: 'unused',
    changed: () => {},
    failed: () => {},
    openLocal: async () => {
      throw Error('No page opening');
    },
  });
  manager.profiles = () => ({
    validateAccounts: (rows) => {
      calls.push(rows);
      throw Error('Account missing');
    },
  });
  return { before, manager, calls };
}
test('unrelated settings retain missing Web references; new and edited page rows still validate accounts', () => {
  const { before, manager, calls } = fixture(),
    next = structuredClone(before);
  next.ribbon.hidden = ['home'];
  assert.doesNotThrow(() => manager.validate(next, before));
  assert.equal(calls.length, 0);
  assert.throws(() => manager.validate(next), /Account missing/);
  const edit = structuredClone(before);
  edit.extensions[owner.id].settings.items[0].name = 'Changed';
  assert.throws(() => manager.validate(edit, before), /Account missing/);
  const add = structuredClone(before);
  add.extensions[owner.id].settings.items.push({ ...row, id: 'site.two' });
  assert.throws(() => manager.validate(add, before), /Account missing/);
  const remove = structuredClone(before);
  remove.extensions[owner.id].settings.items = [];
  assert.doesNotThrow(() => manager.validate(remove, before));
  const invalidBefore = structuredClone(before);
  invalidBefore.extensions[owner.id].settings.items[0].name = '';
  manager.profiles = () => ({ validateAccounts: () => {} });
  assert.doesNotThrow(() => manager.validate(before, invalidBefore));
});
test('ribbon saving succeeds with an unchanged missing Web account and never repairs or removes reference data', (t) => {
  const { before, manager } = fixture(),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-ribbon-reference-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  store.save(before, store.revision);
  const oldRows = JSON.stringify(store.value.extensions[owner.id]);
  const save = (next, revision) => {
    manager.validate(next, store.value);
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
    operations: [{ kind: 'update', id: 'home', changes: { visible: false } }],
  });
  assert.equal(result.changed, true);
  assert(store.value.ribbon.hidden.includes('home'));
  assert.equal(JSON.stringify(store.value.extensions[owner.id]), oldRows);
  assert.equal(store.value.migrations, undefined);
  assert.equal(JSON.parse(fs.readFileSync(store.file)).migrations, undefined);
});
