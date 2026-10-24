const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { parseSettingDefinitions } = require('../out/main/shared/setting-definitions');
const { mergeSettingListDraft } = require('../out/main/shared/setting-list-draft');
const { settingListDraftAction } = require('../out/main/main/core/setting-list-draft');
const raw = {
  key: 'items',
  title: 'Sites',
  type: 'object-list',
  fields: [
    { key: 'id', title: 'ID', type: 'string' },
    { key: 'name', title: 'Name', type: 'string', default: 'New' },
    { key: 'url', title: 'URL', type: 'string', format: 'url', default: '' },
    {
      key: 'navigation',
      title: 'Navigation',
      type: 'select',
      options: [
        { value: 'none', label: 'None' },
        { value: 'same-origin', label: 'Same' },
      ],
      default: 'same-origin',
    },
    { key: 'image', title: 'Image', type: 'registered-image' },
  ],
  list: {
    columns: ['name'],
    titleKey: 'name',
    idKey: 'id',
    imageKey: 'image',
    draftAction: {
      id: 'discover',
      title: 'Discover',
      inputKey: 'url',
      fields: ['name', 'url', 'navigation'],
      historyKey: 'imported',
    },
  },
};
const definition = () => parseSettingDefinitions([structuredClone(raw)])[0];
function provider(reply = { name: 'Suggested', url: 'https://example.test/start' }) {
  const requests = [];
  const owner = {
    manifest: {
      id: 'fixture',
      settings: [definition()],
      capabilities: ['registered-images'],
      pageActions: [{ id: 'discover', parameters: { url: 'string' } }],
    },
    state: 'running',
    runtimeSession: 'one',
    peer: {
      closed: false,
      async request(method, params) {
        requests.push({ method, params });
        return reply;
      },
    },
  };
  return { owner, requests };
}
test('draft declarations reject foreign fields, record identity edits and unsafe history paths', () => {
  for (const patch of [
    { fields: ['id'] },
    { fields: ['missing'] },
    { fields: ['name', 'name'] },
    { historyKey: '__proto__' },
    { historyKey: 'name' },
    { inputKey: 'image' },
  ]) {
    const value = structuredClone(raw);
    Object.assign(value.list.draftAction, patch);
    assert.throws(() => parseSettingDefinitions([value]));
  }
});
test('draft fetch only invokes the bound list declaration and ignores unrelated provider values', async () => {
  const { owner, requests } = provider({
    name: 'Suggested',
    url: 'https://example.test/start',
    accountId: 'other',
    extensions: {},
    message: 'Ready',
  });
  let imported = 0;
  const result = await settingListDraftAction(
    owner,
    'items',
    { kind: 'fetch', input: 'https://example.test/' },
    async () => {
      imported++;
      return { file: 'image.png' };
    },
  );
  assert.deepEqual(result, {
    values: { name: 'Suggested', url: 'https://example.test/start' },
    message: 'Ready',
  });
  assert.equal(imported, 0);
  assert.deepEqual(requests, [
    {
      method: 'page.action',
      params: { id: 'discover', input: { url: 'https://example.test/' }, pageId: 'settings:items' },
    },
  ]);
});
test('stopped providers, missing lists and undeclared parameters never invoke the runtime', async () => {
  const { owner, requests } = provider();
  const image = async () => ({ file: 'image.png' });
  await assert.rejects(
    settingListDraftAction(owner, 'other', { kind: 'fetch', input: 'url' }, image),
  );
  owner.manifest.pageActions[0].parameters = { url: 'number' };
  await assert.rejects(
    settingListDraftAction(owner, 'items', { kind: 'fetch', input: 'url' }, image),
  );
  owner.manifest.pageActions[0].parameters = { url: 'string' };
  owner.state = 'disabled';
  await assert.rejects(
    settingListDraftAction(owner, 'items', { kind: 'fetch', input: 'url' }, image),
  );
  assert.equal(requests.length, 0);
});
test('results from a replaced runtime are rejected', async () => {
  const { owner } = provider();
  owner.peer.request = async () => {
    owner.runtimeSession = 'two';
    return { name: 'Stale' };
  };
  await assert.rejects(
    settingListDraftAction(owner, 'items', { kind: 'fetch', input: 'url' }, async () => ({
      file: 'image.png',
    })),
  );
});
test('malformed provider selections, messages and image bytes are rejected', async () => {
  for (const reply of [
    { navigation: 'any' },
    { message: 'x'.repeat(1001) },
    { imageBytes: [300] },
    { imageBytes: [1, 2, 3] },
  ]) {
    const { owner } = provider(reply);
    await assert.rejects(
      settingListDraftAction(owner, 'items', { kind: 'fetch', input: 'url' }, async () => ({
        file: 'image.png',
      })),
    );
  }
});
test('image suggestions stay in memory until a separate permitted import', async () => {
  const { owner } = provider({ imageBytes: [137, 80, 78, 71, 13, 10, 26, 10] });
  let calls = 0;
  const importer = async (input) => {
    calls++;
    assert.equal(typeof input.base64, 'string');
    return { file: 'image.png' };
  };
  const result = await settingListDraftAction(
    owner,
    'items',
    { kind: 'fetch', input: 'url' },
    importer,
  );
  assert.equal(calls, 0);
  assert(result.image.preview.startsWith('data:image/png;base64,'));
  assert.deepEqual(
    await settingListDraftAction(
      owner,
      'items',
      { kind: 'image', base64: result.image.base64 },
      importer,
    ),
    { file: 'image.png' },
  );
  assert.equal(calls, 1);
  owner.manifest.capabilities = [];
  await assert.rejects(
    settingListDraftAction(
      owner,
      'items',
      { kind: 'image', base64: result.image.base64 },
      importer,
    ),
  );
});
test('suggestions fill defaults while retaining manual values, identity, account and private metadata', () => {
  const before = {
    id: 'stable',
    name: 'Manual',
    url: 'https://example.test/',
    navigation: 'same-origin',
    accountId: 'keep',
    private: { retained: true },
  };
  const result = mergeSettingListDraft(
    definition(),
    before,
    before,
    { values: { name: 'Suggested', url: 'https://example.test/start', navigation: 'none' } },
    new Set(),
  );
  assert.equal(result.name, 'Manual');
  assert.equal(result.url, 'https://example.test/start');
  assert.equal(result.navigation, 'none');
  assert.equal(result.id, 'stable');
  assert.equal(result.accountId, 'keep');
  assert.deepEqual(result.private, { retained: true });
  assert.equal(before.url, 'https://example.test/');
});
test('later imports refresh earlier suggestions but preserve unconfirmed and in-flight edits', () => {
  const before = {
    name: 'Previous',
    url: 'https://example.test/',
    navigation: 'none',
    imported: { name: 'Previous', navigation: 'none', source: 'keep' },
  };
  const result = mergeSettingListDraft(
    definition(),
    before,
    before,
    { values: { name: 'Next', navigation: 'same-origin' } },
    new Set(['name']),
  );
  assert.equal(result.name, 'Previous');
  assert.equal(result.navigation, 'same-origin');
  assert.equal(result.imported.source, 'keep');
  assert.equal(before.imported.name, 'Previous');
  const edited = mergeSettingListDraft(
    definition(),
    { ...before, name: 'New local' },
    before,
    { values: { name: 'Next' } },
    new Set(),
  );
  assert.equal(edited.name, 'New local');
});
