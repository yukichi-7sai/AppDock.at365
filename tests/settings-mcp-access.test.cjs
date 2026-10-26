const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { SettingsStore } = require('../out/main/main/core/settings');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { settingsMcpAccess } = require('../out/main/main/core/settings-mcp-access');
const { settingsUiFields, settingsUiGroup } = require('../out/main/shared/settings-mcp-access');
const { settingsCatalog, settingsItemId } = require('../out/main/shared/settings-catalog');
const { hostSettingDefinitions } = require('../out/main/shared/host-settings');

function fixture(t, definitions = [], { bridge = false } = {}) {
  const dir = path.resolve('.artifacts/settings-mcp-access-unit', randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  const store = new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  const owner = {
    id: 'fixture.access',
    displayName: 'Access fixture',
    enabled: true,
    state: 'running',
    settings: definitions,
  };
  const state = {
    enabled: true,
    write: true,
    ready: true,
    available: true,
    execute: false,
    services: [],
  };
  let saves = 0;
  const options = {
    settings: store,
    applets: () => [owner],
    save: (...args) => {
      saves++;
      return store.save(...args);
    },
  };
  const api = new AppDockApi({
    ...options,
    settingsCommands: new SettingsCommands(options),
    mcpEnabled: () => state.enabled,
    mcpAvailable: () => state.available,
    writable: () => state.write,
    ready: () => state.ready,
    serviceSettingsTargets: () => state.services,
    executable: () => state.execute,
    touchpadBridge: bridge
      ? {
          snapshot: () => ({}),
          connect: async () => {
            throw Error('No Windows changes permitted');
          },
          afterLocalEdit: async () => {
            throw Error('No Windows changes permitted');
          },
        }
      : undefined,
    version: 'test',
    instanceId: randomUUID(),
    commands: () => [],
    execute: async () => {
      throw Error('No execution permitted');
    },
  });
  const page = (id) => settingsCatalog([owner], store.value).find((page) => page.id === id);
  return { api, owner, state, store, page, saves: () => saves };
}
const reason = (access, page, key) => access.items[settingsItemId(page, key)]?.reason ?? null;

test('ordinary host fields and later declarations share MCP schema and native setting identities', (t) => {
  const f = fixture(t),
    page = f.page('appearance');
  const access = f.api.settingsAccess(page);
  const target = f.api
    .call('settings.targets.list', { ownerId: 'appdock' })
    .items.find((item) => item.category === 'appearance');
  const schema = f.api.call('settings.schema.get', { targetId: target.targetId });
  for (const field of schema.items) {
    const definition = hostSettingDefinitions.find((entry) => entry.key === field.key);
    assert.equal(
      access.items[settingsItemId('appearance', definition.catalogKey ?? field.key)].reason,
      null,
    );
  }
  const added = {
    key: 'futureText',
    pageId: 'appearance',
    title: 'Later setting',
    type: 'string',
    default: '',
  };
  hostSettingDefinitions.push(added);
  t.after(() => hostSettingDefinitions.splice(hostSettingDefinitions.indexOf(added), 1));
  assert.equal(
    f.api.settingsAccess(f.page('appearance')).items[settingsItemId('appearance', 'futureText')]
      .reason,
    null,
  );
  assert.equal(f.saves(), 0);
});

test('Applet additions are automatically discovered; private, secret, local and unsupported fields are not writable', (t) => {
  const definitions = [
    { key: 'text', title: 'Text', type: 'string', default: '' },
    { key: 'private', title: 'Private', type: 'boolean', automation: false },
    { key: 'secret', title: 'Secret', type: 'string', secret: true, default: 'PRIVATE_DEFAULT' },
    { key: 'local', title: 'Local', type: 'boolean', localOnly: true },
    { key: 'opaque', title: 'Opaque', type: 'json' },
  ];
  const f = fixture(t, definitions),
    id = 'applet:' + f.owner.id;
  let access = f.api.settingsAccess(f.page(id));
  assert.equal(reason(access, id, 'setting:text'), null);
  for (const key of ['private', 'secret', 'local'])
    assert.equal(reason(access, id, 'setting:' + key), 'private');
  assert.equal(Object.hasOwn(access.items, settingsItemId(id, 'setting:opaque')), false);
  definitions.push({ key: 'later', title: 'Later', type: 'number', default: 1 });
  access = f.api.settingsAccess(f.page(id));
  assert.equal(access.items[settingsItemId(id, 'setting:later')].reason, null);
  f.owner.state = 'stopped';
  assert.equal(reason(f.api.settingsAccess(f.page(id)), id, 'setting:text'), 'unavailable');
  assert.doesNotMatch(JSON.stringify(access), /PRIVATE_DEFAULT|Later|default|inputSchema/);
  assert.equal(f.saves(), 0);
});

test('permission, connection and startup state update without changing definitions or granting permissions', (t) => {
  const f = fixture(t),
    page = f.page('general');
  const original = JSON.stringify(f.store.value);
  assert.equal(f.api.settingsAccess(page).reason, null);
  f.state.write = false;
  assert.equal(f.api.settingsAccess(page).reason, 'permission');
  f.state.enabled = false;
  assert.equal(f.api.settingsAccess(page).reason, 'disabled');
  f.state.enabled = true;
  f.state.write = true;
  f.state.ready = false;
  assert.equal(f.api.settingsAccess(page).reason, 'unavailable');
  f.state.ready = true;
  f.state.available = false;
  assert.equal(f.api.settingsAccess(page).reason, 'unavailable');
  assert.equal(JSON.stringify(f.store.value), original);
  assert.equal(f.saves(), 0);
});

test('metadata does not invoke values, persistence, overrides or unrelated list owners', () => {
  const forbidden = () => {
    throw Error('Forbidden side effect');
  };
  const target = {
    ui: settingsUiFields('general'),
    available: true,
    fields: [{ key: 'flag', title: 'Flag', type: 'boolean', default: 'DO_NOT_RETURN_DEFAULT' }],
    values: forbidden,
    overrides: forbidden,
    plan: forbidden,
  };
  const unrelated = {
    ...target,
    kind: 'list',
    ui: settingsUiGroup('elsewhere', 'rows'),
    definition: { list: { idKey: 'id' } },
    itemWritable: forbidden,
    rows: forbidden,
  };
  const access = settingsMcpAccess({ id: 'general', items: [] }, [target, unrelated]);
  assert.equal(reason(access, 'general', 'flag'), null);
  assert.doesNotMatch(JSON.stringify(access), /DO_NOT_RETURN_DEFAULT/);
});

test('read-only and unavailable services use the same owner restrictions as settings.apply', (t) => {
  const f = fixture(t);
  const fields = ['editable', 'bound'].map((key) => ({ key, title: key, type: 'string' }));
  f.state.services = [
    {
      targetId: 'service.fixture',
      ownerId: 'appdock',
      category: 'fixture',
      available: true,
      fields,
      ui: settingsUiFields('general'),
      writable: (field) => field.key !== 'bound',
      values: () => ({ editable: '', bound: '' }),
      overrides: () => ({}),
      applies: () => 'nextStart',
      plan: () => {
        throw Error('Not requested');
      },
    },
  ];
  let access = f.api.settingsAccess(f.page('general'));
  assert.equal(reason(access, 'general', 'editable'), null);
  assert.equal(reason(access, 'general', 'bound'), 'readOnly');
  const schema = f.api.call('settings.schema.get', { targetId: 'service.fixture' });
  assert.equal(schema.items.find((field) => field.key === 'bound').writable, false);
  f.state.services[0].available = false;
  access = f.api.settingsAccess(f.page('general'));
  assert.equal(reason(access, 'general', 'editable'), 'unavailable');
});

test('list identities and per-row restrictions are projected without values or hidden columns', (t) => {
  const f = fixture(t, [
    {
      key: 'rows',
      title: 'Rows',
      type: 'object-list',
      fields: [
        { key: 'id', title: 'ID', type: 'string' },
        { key: 'name', title: 'Name', type: 'string' },
        { key: 'secret', title: 'Secret', type: 'string', secret: true },
      ],
      list: { idKey: 'id', titleKey: 'name', columns: ['name'] },
      default: [],
    },
  ]);
  const id = 'applet:' + f.owner.id;
  const access = f.api.settingsAccess(f.page(id)).items[settingsItemId(id, 'setting:rows')];
  assert.equal(access.reason, null);
  assert.equal(access.fields.id.reason, 'readOnly');
  assert.equal(access.fields.name.reason, null);
  assert.equal(Object.hasOwn(access.fields, 'secret'), false);
  const group = {
    kind: 'list',
    available: true,
    ui: settingsUiGroup('ai', 'connections'),
    fields: [
      { key: 'id', title: 'ID', type: 'string' },
      { key: 'baseUrl', title: 'URL', type: 'string' },
    ],
    definition: { list: { idKey: 'id' } },
    writable: (field) => field.key !== 'id',
    itemWritable: (row, field) => field.key !== 'id' && !row.protected,
    rows: () => [
      { id: 'one', baseUrl: 'PRIVATE_URL', protected: true },
      { id: 'two', baseUrl: 'OTHER_URL' },
    ],
  };
  const projected = settingsMcpAccess({ id: 'ai', items: [] }, [group]).items[
    settingsItemId('ai', 'connections')
  ];
  assert.equal(projected.rows.one.baseUrl.reason, 'readOnly');
  assert.equal(projected.rows.two.baseUrl.reason, null);
  assert.doesNotMatch(JSON.stringify(projected), /PRIVATE_URL|OTHER_URL|protected/);
});

test('reorder-only lists stay editable as a list while their columns stay read-only', () => {
  const target = {
    kind: 'list',
    available: true,
    ui: settingsUiGroup('applets', 'order'),
    operations: ['reorder'],
    definition: { list: { idKey: 'id' } },
    fields: [{ key: 'id', title: 'ID', type: 'string' }],
    writable: () => false,
  };
  const item = settingsMcpAccess({ id: 'applets', items: [] }, [target]).items[
    settingsItemId('applets', 'order')
  ];
  assert.equal(item.reason, null);
  assert.equal(item.fields.id.reason, 'readOnly');
  target.operations = [];
  assert.equal(
    settingsMcpAccess({ id: 'applets', items: [] }, [target]).items[
      settingsItemId('applets', 'order')
    ].reason,
    'readOnly',
  );
});

test('dedicated input and ribbon schemas describe MCP-editable native controls', (t) => {
  const f = fixture(t);
  for (const [page, keys] of [
    ['shortcuts', ['executionMode', 'excludedProcesses']],
    ['gestures', ['enabled', 'distance', 'indicatorStyle']],
    ['touchpad-gestures', ['executionMode']],
  ]) {
    const access = f.api.settingsAccess(f.page(page));
    for (const key of keys)
      assert.equal(access.items[settingsItemId(page, key)]?.reason, null, page + '/' + key);
  }
  assert.equal(
    reason(f.api.settingsAccess(f.page('touchpad-gestures')), 'touchpad-gestures', 'enabled'),
    'unavailable',
  );
  const access = f.api.settingsAccess(f.page('command-triggers'));
  const binding = access.items[settingsItemId('command-triggers', 'bindings')];
  for (const key of ['key', 'gesture', 'when', 'enabled'])
    assert.equal(binding.fields[key].reason, null);
  const ribbon = f.api.settingsAccess(f.page('ribbon')).items[settingsItemId('ribbon', 'ribbon')];
  for (const key of ['title', 'icon', 'image', 'iconOnly', 'displayModeIcons'])
    assert.equal(ribbon.fields[key].reason, null, key);
  assert.equal(f.saves(), 0);
});

test('touchpad setting commands share the consolidated write permission even when command execution is OFF', async (t) => {
  const f = fixture(t, [], { bridge: true });
  const access = () => f.api.settingsAccess(f.page('touchpad-gestures'));
  assert.equal(reason(access(), 'touchpad-gestures', 'enabled'), null);
  const request = {
    id: 'appdock.touchpadGestures.set-enabled',
    args: {
      expectedRevision: f.api.call('touchpadGestures.get').revision,
      enabled: false,
      dryRun: true,
    },
  };
  assert.equal((await f.api.call('commands.execute', request)).completion, 'validated');
  f.state.write = false;
  assert.equal(access().reason, 'permission');
  await assert.rejects(
    f.api.call('commands.execute', request),
    (error) => error.code === 'WRITE_DISABLED',
  );
  assert.equal(f.saves(), 0);
});
