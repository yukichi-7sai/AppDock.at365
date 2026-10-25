const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { PageCollectionManager } = require('../out/main/main/core/page-collections');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
test('Web profile options and page validation read the owner roster without creating services or changing session files', (t) => {
  const dir = path.resolve('.artifacts/settings-list-options-unit', randomUUID()),
    sharedRoot = path.join(dir, 'data'),
    localRoot = path.join(dir, 'local');
  const owner = {
    id: 'fixture.web',
    capabilities: ['web-profiles'],
    pageCollections: [{ key: 'items', source: 'remote', fields: [] }],
  };
  const accountId = 'account.11111111-1111-4111-8111-111111111111';
  const row = {
    id: 'site.one',
    name: 'Site',
    enabled: true,
    display: 'page',
    url: 'https://example.test/',
    accountId,
    navigation: 'same-origin',
    allowedOrigins: [],
  };
  const before = createDefaultSettings();
  before.extensions[owner.id] = { enabled: true, settings: { items: [row] } };
  const file = path.join(sharedRoot, 'web-profiles', owner.id, 'accounts.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 1,
      accounts: [{ id: accountId, name: 'Account', unrelated: 'ignored' }],
    }),
  );
  const session = path.join(
    localRoot,
    'web-profiles',
    owner.id,
    'sessions',
    accountId,
    'CookieFixture',
  );
  fs.mkdirSync(path.dirname(session), { recursive: true });
  fs.writeFileSync(session, 'PRIVATE_SESSION_FIXTURE');
  const manager = new PageCollectionManager({
    settings: () => before,
    parents: () => [owner],
    sharedRoot,
    localRoot,
    changed: () => {
      throw Error('Unexpected state change');
    },
    failed: () => {
      throw Error('Unexpected failure notification');
    },
    openLocal: () => {
      throw Error('Unexpected opening');
    },
  });
  t.after(() => manager.close());
  manager.profiles = () => {
    throw Error('Profile service creation is a side effect');
  };
  const tree = () =>
    fs
      .readdirSync(dir, { recursive: true })
      .filter((item) => fs.statSync(path.join(dir, item)).isFile())
      .map((item) => [item, fs.readFileSync(path.join(dir, item), 'utf8')]);
  const original = tree();
  assert.deepEqual(manager.settingOptions(owner.id), [{ value: accountId, label: 'Account' }]);
  assert.deepEqual(manager.settingOptions('other.owner'), []);
  const after = structuredClone(before);
  after.extensions[owner.id].settings.items[0].name = 'Changed';
  assert.doesNotThrow(() => manager.validate(after, before));
  assert.deepEqual(tree(), original);
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, accounts: [] }));
  assert.deepEqual(manager.settingOptions(owner.id), []);
  assert.throws(() => manager.validate(after, before));
  assert.equal(fs.readFileSync(session, 'utf8'), 'PRIVATE_SESSION_FIXTURE');
});
