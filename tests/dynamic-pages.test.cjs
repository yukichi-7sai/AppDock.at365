const { siblingManifest } = require('./fixtures/sibling-manifest.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseDynamicPages } = require('../out/main/shared/dynamic-pages');
const { parsePageCollections, collectionPages } = require('../out/main/shared/page-collections');
const { parseSettings, createDefaultSettings } = require('../out/main/shared/settings-schema');
const { initializeCollectionDefaults } = require('../out/main/shared/keybindings');
const manifest = siblingManifest('Applet.WebApplet.at365');
const page = {
  id: 'one',
  title: 'One',
  source: 'local',
  ui: 'page.html',
  context: { document: 'one' },
};
test('dynamic pages validate capabilities, collisions, limits and copy context atomically', () => {
  const owner = {
    id: 'test.pages',
    capabilities: ['pages', 'dynamic-pages'],
    pages: [{ id: 'fixed' }],
  };
  const parsed = parseDynamicPages(owner, [page]);
  assert.throws(() =>
    parseDynamicPages(
      { ...owner, commands: [{ id: 'test.pages.other', aliases: ['test.pages.pages.one.open'] }] },
      [page],
    ),
  );
  assert.throws(() =>
    parseDynamicPages(owner, [{ ...page, context: { text: 'あ'.repeat(6000) } }]),
  );
  assert.equal(parsed[0].openCommand, 'test.pages.pages.one.open');
  parsed[0].context.document = 'changed';
  assert.equal(page.context.document, 'one');
  for (const rows of [
    [page, page],
    [{ ...page, id: 'fixed' }],
    [{ ...page, source: 'remote' }],
    [{ ...page, context: { text: 'x'.repeat(16385) } }],
    Array.from({ length: 65 }, (_, i) => ({ ...page, id: 'p' + i })),
  ])
    assert.throws(() => parseDynamicPages(owner, rows));
  assert.throws(() => parseDynamicPages({ ...owner, capabilities: ['pages'] }, [page]));
});
test('legacy sites retain identities, commands and private data; repeated parse is stable', () => {
  const settings = createDefaultSettings();
  const id = 'web.11111111-2222-3333-4444-555555555555';
  const item = {
    id,
    name: 'Original',
    enabled: true,
    display: 'window',
    url: 'https://example.test/?private',
    accountId: 'account.11111111-2222-3333-4444-555555555555',
    navigation: 'same-origin',
    allowedOrigins: [],
    icon: '',
  };
  settings.extensions[manifest.id] = { enabled: true, settings: { items: [item] } };
  settings.migrations = { webApplet: { version: 1, owner: manifest.id, ids: [id] } };
  settings.pinnedCommands = [id + '.open'];
  const migrated = parseSettings(settings);
  assert.deepEqual(migrated.extensions[manifest.id].settings.items, [item]);
  assert.equal(migrated.webApplets, undefined);
  assert.deepEqual(parseSettings(migrated), migrated);
  assert.deepEqual(migrated.pinnedCommands, [id + '.open']);
  const pages = collectionPages(migrated, [manifest]);
  assert.equal(pages[0].id, id);
  assert.deepEqual(
    parseSettings({ ...migrated, webApplets: { items: [] } }).extensions,
    migrated.extensions,
  );
});
test('collection declarations validate ownership and templates; new rows receive defaults once', () => {
  const owner = { ...manifest, pageCollections: parsePageCollections(manifest) };
  for (const change of [
    { key: 'missing' },
    { automation: ['eval'] },
    { shortcutDefaultsKey: 'missing' },
  ])
    assert.throws(() =>
      parsePageCollections({
        ...manifest,
        pageCollections: [{ ...manifest.pageCollections[0], ...change }],
      }),
    );
  const previous = createDefaultSettings(),
    next = structuredClone(previous);
  next.extensions[owner.id] = {
    enabled: true,
    settings: {
      items: [
        {
          id: 'site.one',
          name: 'One',
          enabled: true,
          display: 'page',
          url: 'https://example.test/',
          accountId: 'account.11111111-2222-3333-4444-555555555555',
          navigation: 'same-origin',
          allowedOrigins: [],
        },
      ],
    },
  };
  const result = initializeCollectionDefaults(next, previous, [owner]);
  assert.equal(
    result.keybindings.filter((b) => b.command.startsWith(owner.id + '.items.site.one.')).length,
    3,
  );
  assert.deepEqual(initializeCollectionDefaults(result, result, [owner]), result);
  const local = {
    ...owner,
    id: 'test.local',
    pageCollections: [{ key: 'items', source: 'local', ui: 'index.html', fields: [] }],
  };
  next.extensions[local.id] = {
    enabled: true,
    settings: { items: [{ id: 'document', name: 'Document', enabled: true, display: 'page' }] },
  };
  assert.equal(collectionPages(next, [local])[0].id, 'test.local.items.document');
});
test('collection settings projection exposes declared fields and writes only the owning row', () => {
  const {
    settingsCatalog,
    settingsProjection,
    applySettingsJson,
  } = require('../out/main/shared/settings-catalog');
  const value = createDefaultSettings();
  const item = {
    id: 'site.one',
    name: 'One',
    enabled: true,
    display: 'page',
    url: 'https://private.test/secret',
    accountId: 'account.11111111-2222-3333-4444-555555555555',
    navigation: 'same-origin',
    allowedOrigins: [],
  };
  value.extensions[manifest.id] = { enabled: true, settings: { items: [item] } };
  const id = manifest.id + '.items.site.one';
  const applet = {
    id,
    displayName: 'One',
    runtime: 'node',
    collection: { owner: manifest.id, key: 'items', itemId: item.id },
    settings: manifest.pageCollections[0].fields,
  };
  const page = settingsCatalog([applet], value).find((p) => p.owner === id);
  const projection = settingsProjection(value, page, [applet]);
  assert.ok(!JSON.stringify(projection).includes('private.test'));
  projection.extensions[id].settings.name = 'Changed';
  const saved = applySettingsJson(value, page, [applet], JSON.stringify(projection));
  assert.equal(saved.extensions[manifest.id].settings.items[0].name, 'Changed');
  assert.equal(saved.extensions[id], undefined);
  assert.equal(saved.extensions[manifest.id].settings.items[0].url, item.url);
  projection.extensions[id].settings.url = 'https://other.test/';
  assert.throws(() => applySettingsJson(value, page, [applet], JSON.stringify(projection)));
});

test('legacy settings are ignored without importing or enabling the provider', () => {
  const old = createDefaultSettings();
  old.webApplets = { items: [{ id: 'legacy', name: 'Old' }], accounts: [{ id: 'old' }] };
  const parsed = parseSettings(old);
  assert.equal(parsed.webApplets, undefined);
  assert.equal(parsed.migrations, undefined);
  assert.equal(parsed.extensions[manifest.id], undefined);
  const saved = {
    ...old,
    extensions: {
      [manifest.id]: { enabled: false, settings: { items: [], shortcutDefaults: [] } },
    },
  };
  assert.deepEqual(parseSettings(saved).extensions, saved.extensions);
});
