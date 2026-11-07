const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const {
  McpClientSettings,
  mcpEndpointIdentity,
  mcpStableDigest,
} = require('../out/main/main/core/mcp-client-settings');
const { McpClientService } = require('../out/main/main/core/mcp-client');
const { McpToolCommandService } = require('../out/main/main/core/mcp-tool-commands');
const { defaultMcpConnection } = require('../out/main/shared/mcp-client');
const {
  mcpToolCommandSettingsTarget,
} = require('../out/main/main/core/settings-mcp-tool-command-target');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const { parseSettings } = require('../out/main/shared/settings-schema');
const { parseMcpDeviceSettings } = require('../out/main/shared/mcp-device-settings');
function fixture(t) {
  const dir = path.resolve('.artifacts/mcp-device-unit', randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  const store = new DeviceSettingsStore(
    path.join(dir, 'data', 'settings.json'),
    path.join(dir, 'local'),
    'TEST',
  );
  store.load();
  t.after(() => store.close());
  const crypto = {
    encrypt: (v) => 'encrypted:' + Buffer.from(v).toString('base64'),
    decrypt: (v) => {
      if (!v.startsWith('encrypted:')) throw Error('foreign key');
      return Buffer.from(v.slice(10), 'base64').toString();
    },
  };
  const owner = new McpClientSettings(
    store,
    path.join(dir, 'local', 'mcp-client-secrets.json'),
    crypto,
    () => {},
  );
  const add = (extra = {}, secret = {}) => {
    const id = randomUUID();
    owner.update({
      op: 'save',
      expectedRevision: owner.revision(),
      item: { id, name: 'Connection', description: '' },
      connection: { ...defaultMcpConnection(), url: 'http://example.test/mcp', ...extra },
      ...secret,
    });
    return id;
  };
  return { dir, store, owner, crypto, add };
}
test('MCP credentials preserve long bearer and environment values without changing endpoint ownership', (t) => {
  const f = fixture(t),
    value = 'secret'.repeat(20000);
  const bearer = f.add({ authentication: 'bearer' }, { token: value });
  assert.equal(f.owner.secrets(bearer).token, value);
  const stdio = f.add(
    { transport: 'stdio', url: '', command: 'C:\\fixture.exe' },
    { environment: { CONTENT: value } },
  );
  assert.deepEqual(f.owner.secrets(stdio).env, { CONTENT: value });
});

test('MCP tab resets and local JSON replacement preserve unrelated definitions and secret bytes', (t) => {
  const f = fixture(t),
    serverId = f.add({ authentication: 'bearer' }, { token: 'key' });
  const item = {
    id: randomUUID(),
    title: 'Saved',
    description: '',
    enabled: false,
    automation: false,
    serverId,
    toolName: 'echo',
    arguments: {},
    timeoutMs: 60000,
    toolBinding: null,
  };
  f.owner.saveCommands([item], f.owner.revision());
  const initial = structuredClone(f.owner.block()),
    cipher = fs.readFileSync(f.owner.file);
  f.owner.reset(f.owner.revision(), 'mcp-commands');
  assert.deepEqual(f.owner.block().servers, initial.servers);
  assert.deepEqual(f.owner.block().commands, []);
  assert.deepEqual(fs.readFileSync(f.owner.file), cipher);
  f.owner.saveCommands([item], f.owner.revision());
  const next = structuredClone(f.owner.block());
  next.servers[0].name = 'JSON rename';
  const base = { ...f.store.value, host: { ...f.store.value.host, soundEnabled: false } };
  f.owner.replace(next, f.owner.revision(), base);
  assert.equal(f.store.value.host.soundEnabled, false);
  assert.deepEqual(fs.readFileSync(f.owner.file), cipher);
  next.servers[0].connection.url = 'http://example.test/other';
  f.owner.replace(next, f.owner.revision());
  assert.deepEqual(JSON.parse(fs.readFileSync(f.owner.file)).entries, {});
  assert.deepEqual(f.owner.block().commands, [item]);
  f.owner.reset(f.owner.revision(), 'mcp-connections');
  assert.deepEqual(f.owner.block().servers, []);
  assert.deepEqual(f.owner.block().commands, [item]);
  f.owner.reset(f.owner.revision());
  assert.deepEqual(f.owner.block(), { version: 1, servers: [], commands: [] });
});
test('JSON command replacement keeps approval readonly and validates edits against a current catalog', (t) => {
  const f = fixture(t),
    serverId = f.add({ enabled: true });
  const tool = {
    toolRevision: 'current',
    toolBinding: {
      version: 1,
      endpointFingerprint: mcpEndpointIdentity(f.owner.connection(serverId)),
      definitionFingerprint: 'a'.repeat(64),
    },
  };
  const item = {
    id: randomUUID(),
    title: 'JSON',
    description: '',
    enabled: true,
    automation: false,
    serverId,
    toolName: 'echo',
    arguments: { text: 'one' },
    timeoutMs: 60000,
    toolBinding: tool.toolBinding,
  };
  f.owner.saveCommands([item], f.owner.revision());
  let discovered = false;
  const service = new McpToolCommandService({
    settings: f.owner,
    actor: () => ({}),
    client: {
      cachedTool: () => (discovered ? tool : undefined),
      commandValidation: (row) =>
        row.toolRevision === tool.toolRevision && typeof row.arguments.text === 'string'
          ? null
          : 'Invalid arguments',
    },
  });
  assert.equal(
    service.replacement([{ ...item, title: 'Metadata' }], [serverId], f.owner.revision())[0].title,
    'Metadata',
  );
  assert.throws(
    () =>
      service.replacement(
        [{ ...item, arguments: { text: 'two' } }],
        [serverId],
        f.owner.revision(),
      ),
    { code: 'SCHEMA_CHANGED' },
  );
  discovered = true;
  assert.deepEqual(
    service.replacement(
      [{ ...item, arguments: { text: 'two' } }],
      [serverId],
      f.owner.revision(),
    )[0].toolBinding,
    tool.toolBinding,
  );
  assert.throws(
    () =>
      service.replacement([{ ...item, arguments: { text: 3 } }], [serverId], f.owner.revision()),
    { code: 'SCHEMA_CHANGED' },
  );
  assert.throws(
    () =>
      service.replacement(
        [{ ...item, toolBinding: { ...tool.toolBinding, definitionFingerprint: 'b'.repeat(64) } }],
        [serverId],
        f.owner.revision(),
      ),
    { code: 'INVALID_ARGUMENT' },
  );
  assert.throws(
    () => service.replacement([{ ...item, id: randomUUID() }], [serverId], f.owner.revision()),
    { code: 'INVALID_ARGUMENT' },
  );
  const draft = { ...item, id: randomUUID(), enabled: false, toolBinding: null };
  assert.equal(service.replacement([draft], [serverId], f.owner.revision())[0].toolBinding, null);
  assert.deepEqual(f.owner.block().commands, [item]);
});
test('JSON endpoint deletion rolls back with the device write and command reset works with corrupt secrets', (t) => {
  const f = fixture(t),
    id = f.add({ authentication: 'bearer' }, { token: 'secret' });
  const before = fs.readFileSync(f.owner.file),
    device = fs.readFileSync(f.store.device.file);
  const save = f.store.device.save;
  f.store.device.save = () => {
    throw Error('disk failure');
  };
  assert.throws(
    () => f.owner.replace({ version: 1, servers: [], commands: [] }, f.owner.revision()),
    { code: 'SAVE_FAILED' },
  );
  f.store.device.save = save;
  assert.deepEqual(fs.readFileSync(f.owner.file), before);
  assert.deepEqual(fs.readFileSync(f.store.device.file), device);
  fs.writeFileSync(f.owner.file, 'corrupt');
  f.owner.reset(f.owner.revision(), 'mcp-commands');
  assert.equal(f.owner.block().servers[0].id, id);
  assert.equal(fs.readFileSync(f.owner.file, 'utf8'), 'corrupt');
  assert.throws(() => f.owner.reset(f.owner.revision(), 'mcp-connections'), {
    code: 'CONFIGURATION_REQUIRED',
  });
});
test('same-name device restore retains IDs and bindings, another PC stays empty, and secrets stay local', (t) => {
  const f = fixture(t),
    id = f.add({ enabled: true, authentication: 'bearer' }, { token: 'private-token' }),
    command = {
      id: randomUUID(),
      title: 'Restore',
      description: '',
      enabled: true,
      automation: true,
      serverId: id,
      toolName: 'echo',
      arguments: { message: 'fixed' },
      timeoutMs: 60000,
      toolBinding: {
        version: 1,
        endpointFingerprint: mcpEndpointIdentity(f.owner.connection(id)),
        definitionFingerprint: 'a'.repeat(64),
      },
    };
  f.owner.saveCommands([command], f.owner.revision());
  const shared = fs.readFileSync(f.store.shared.file, 'utf8'),
    device = fs.readFileSync(f.store.device.file, 'utf8'),
    secret = fs.readFileSync(f.owner.file, 'utf8');
  for (const text of [shared, device, secret]) assert(!text.includes('private-token'));
  assert(!shared.includes(id));
  assert(!secret.includes('http://example.test'));
  const restored = new DeviceSettingsStore(
    f.store.shared.file,
    path.join(f.dir, 'restored'),
    'TEST',
  );
  restored.load();
  t.after(() => restored.close());
  const owner = new McpClientSettings(
    restored,
    path.join(f.dir, 'restored', 'mcp-client-secrets.json'),
    f.crypto,
    () => {},
  );
  assert.deepEqual(owner.block(), f.owner.block());
  assert.equal(owner.statuses()[0].state, 'credentials-required');
  assert.equal(owner.connection(id).enabled, true);
  assert(owner.publicConfiguration().protectedIds.includes(id));
  const other = new DeviceSettingsStore(f.store.shared.file, path.join(f.dir, 'other'), 'OTHER');
  other.load();
  t.after(() => other.close());
  assert.deepEqual(other.value.mcpClient.servers, []);
});
test('legacy MCP roster, custom kind, and PC file are not imported or deleted', (t) => {
  const f = fixture(t),
    legacyId = randomUUID(),
    legacyFile = path.join(f.dir, 'local', 'mcp-client.json');
  fs.writeFileSync(legacyFile, 'opaque legacy bytes');
  const old = {
    ...f.store.shared.value,
    mcpServers: { version: 1, items: [{ id: legacyId, name: 'Legacy', description: '' }] },
    customCommands: {
      version: 2,
      items: [
        {
          id: randomUUID(),
          title: 'Legacy',
          typeId: 'appdock.mcp.call',
          owner: { kind: 'host' },
          configVersion: 1,
          config: {},
          enabled: true,
          automation: true,
        },
        {
          id: randomUUID(),
          title: 'Keep',
          typeId: 'appdock.process.start',
          owner: { kind: 'host' },
          configVersion: 1,
          config: {},
          enabled: false,
          automation: false,
        },
      ],
    },
  };
  fs.writeFileSync(f.store.shared.file, JSON.stringify(old));
  f.store.reload();
  assert.deepEqual(f.owner.roster(), []);
  assert.equal(f.store.value.customCommands.items.length, 1);
  assert.equal(f.store.value.customCommands.items[0].title, 'Keep');
  const next = structuredClone(f.store.value);
  next.pinnedCommands = ['appdock.noop'];
  f.store.save(next, f.store.revision);
  const saved = JSON.parse(fs.readFileSync(f.store.shared.file));
  assert.equal(saved.mcpServers, undefined);
  assert.equal(saved.customCommands.items.length, 1);
  assert.equal(fs.readFileSync(legacyFile, 'utf8'), 'opaque legacy bytes');
  assert.throws(() =>
    parseSettings({ ...old, customCommands: { version: 2, items: [{ malformed: true }] } }),
  );
  assert.deepEqual(
    parseSettings({ ...old, customCommands: { version: 99, items: [{ malformed: true }] } })
      .customCommands,
    { version: 99, items: [{ malformed: true }] },
  );
});
test('device save failure rolls back the encrypted secret write and keeps unrelated cipher bytes', (t) => {
  const f = fixture(t),
    one = f.add({ authentication: 'bearer' }, { token: 'first' }),
    two = f.add({ authentication: 'bearer' }, { token: 'second' }),
    before = fs.readFileSync(f.owner.file),
    device = fs.readFileSync(f.store.device.file),
    save = f.store.device.save;
  f.store.device.save = () => {
    throw Error('device unavailable');
  };
  assert.throws(
    () =>
      f.owner.update({
        op: 'save',
        expectedRevision: f.owner.revision(),
        item: { ...f.owner.roster()[0], name: 'Failed' },
        connection: f.owner.connection(one),
        token: 'changed',
      }),
    { code: 'SAVE_FAILED' },
  );
  f.store.device.save = save;
  assert.deepEqual(fs.readFileSync(f.owner.file), before);
  assert.deepEqual(fs.readFileSync(f.store.device.file), device);
  assert.equal(f.owner.secrets(two).token, 'second');
  assert(!fs.existsSync(path.join(f.dir, 'local', 'settings-transactions', 'settings.json')));
});
test('interrupted device and secret transaction restores exact previous bytes including missing secret file', (t) => {
  for (const existed of [false, true]) {
    const f = fixture(t);
    f.add();
    if (existed) fs.writeFileSync(f.owner.file, 'corrupt original bytes');
    const before = fs.readFileSync(f.store.device.file),
      next = JSON.parse(before);
    next.mcpClient.servers[0].name = 'Half-written';
    const after = Buffer.from(JSON.stringify(next)),
      secret = Buffer.from(JSON.stringify({ version: 1, entries: {} }));
    const journal = path.join(f.dir, 'local', 'settings-transactions', 'settings.json');
    fs.mkdirSync(path.dirname(journal), { recursive: true });
    fs.writeFileSync(
      journal,
      JSON.stringify({
        version: 1,
        machineName: 'TEST',
        committed: false,
        files: [
          {
            scope: 'mcp-secrets',
            before: existed ? Buffer.from('corrupt original bytes').toString('base64') : null,
            after: secret.toString('base64'),
          },
          { scope: 'device', before: before.toString('base64'), after: after.toString('base64') },
        ],
      }),
    );
    fs.writeFileSync(f.owner.file, secret);
    fs.writeFileSync(f.store.device.file, after);
    f.store.reload();
    assert.deepEqual(fs.readFileSync(f.store.device.file), before);
    assert.equal(fs.existsSync(f.owner.file), existed);
    if (existed) assert.equal(fs.readFileSync(f.owner.file, 'utf8'), 'corrupt original bytes');
    assert(!fs.existsSync(journal));
  }
});
test('required missing environment prevents stdio launch and explicit re-entry retains desired enablement', async (t) => {
  const f = fixture(t),
    id = f.add(
      { transport: 'stdio', command: process.execPath, url: '', enabled: true },
      { environment: { PRIVATE_NAME: 'private-value' } },
    );
  const device = fs.readFileSync(f.store.device.file, 'utf8');
  assert(!device.includes('PRIVATE_NAME'));
  assert(!device.includes('private-value'));
  assert.equal(f.owner.server(id).requiresEnvironment, true);
  fs.unlinkSync(f.owner.file);
  const service = new McpClientService({ settings: f.owner, authorized: () => true });
  t.after(() => service.shutdown());
  await assert.rejects(
    service.tools({ owner: 'host', kind: 'host', external: false }, { serverId: id }),
    { code: 'AUTH_REQUIRED' },
  );
  assert.equal(service.sessions.size, 0);
  const detail = f.owner.getSettings(id);
  await service.updateForSettings(
    { owner: 'host', kind: 'host', external: false },
    {
      op: 'save',
      item: detail.item,
      connection: detail.connection,
      environment: { PRIVATE_NAME: 'restored' },
      expectedRevision: detail.revision,
    },
  );
  assert.equal(f.owner.connection(id).enabled, true);
  assert.equal(service.sessions.size, 0);
});
test('stable fingerprints ignore object property order but include arrays and complete tool metadata', () => {
  assert.equal(
    mcpStableDigest({
      name: 'echo',
      inputSchema: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } } },
    }),
    mcpStableDigest({
      inputSchema: { properties: { b: { type: 'number' }, a: { type: 'string' } }, type: 'object' },
      name: 'echo',
    }),
  );
  assert.notEqual(
    mcpStableDigest({ description: 'before' }),
    mcpStableDigest({ description: 'after' }),
  );
  assert.notEqual(mcpStableDigest([1, 2]), mcpStableDigest([2, 1]));
  assert.throws(() => parseMcpDeviceSettings({ version: 2, servers: [], commands: [] }));
});

test('secret-file replacement invalidates state and metadata edits preserve unreadable credentials', async (t) => {
  const f = fixture(t),
    id = f.add({ enabled: true, authentication: 'bearer' }, { token: 'first' });
  let notified = 0;
  f.owner.changed = () => notified++;
  f.owner.watch();
  t.after(() => f.owner.close());
  const beforeRevision = f.owner.revision(),
    raw = JSON.parse(fs.readFileSync(f.owner.file));
  raw.entries[id] = 'unreadable cipher';
  fs.writeFileSync(f.owner.file, JSON.stringify(raw));
  const deadline = Date.now() + 5000;
  while (!notified && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  assert(notified > 0);
  assert.notEqual(f.owner.revision(), beforeRevision);
  assert.equal(f.owner.statuses()[0].state, 'credentials-required');
  const before = fs.readFileSync(f.owner.file);
  f.owner.update({
    op: 'save',
    expectedRevision: f.owner.revision(),
    item: { ...f.owner.roster()[0], name: 'Metadata' },
    connection: f.owner.connection(id),
  });
  assert.deepEqual(fs.readFileSync(f.owner.file), before);
  assert.equal(f.owner.connection(id).enabled, true);
  f.owner.resetSecrets(f.owner.revision());
  assert.equal(f.owner.roster()[0].name, 'Metadata');
  assert.equal(f.owner.statuses()[0].state, 'credentials-required');
  assert(
    fs
      .readdirSync(path.join(f.dir, 'local', 'settings-backups', 'mcp-secrets'))
      .some((name) => name.startsWith('recovery-')),
  );
});

test('unsupported approval versions and known missing tools stay unavailable without losing definitions', (t) => {
  const f = fixture(t),
    serverId = f.add({ enabled: true });
  const item = {
    id: randomUUID(),
    title: 'Future',
    description: '',
    enabled: true,
    automation: true,
    serverId,
    toolName: 'gone',
    arguments: {},
    timeoutMs: 60000,
    toolBinding: {
      version: 2,
      endpointFingerprint: mcpEndpointIdentity(f.owner.connection(serverId)),
      definitionFingerprint: 'c'.repeat(64),
    },
  };
  f.owner.saveCommands([item], f.owner.revision());
  const client = {
    connectionError: () => undefined,
    cachedTool: () => null,
    commandStateVersion: () => 0,
  };
  const commands = new McpToolCommandService({
    settings: f.owner,
    client,
    actor: () => ({ owner: 'host', kind: 'host', external: false }),
  });
  assert.equal(commands.isAvailable('appdock.mcp.tool.' + item.id), false);
  assert.equal(commands.items()[0].toolBinding.version, 2);
  f.owner.saveCommands(
    [{ ...item, toolBinding: { ...item.toolBinding, version: 1 } }],
    f.owner.revision(),
  );
  assert.equal(commands.isAvailable('appdock.mcp.tool.' + item.id), false);
  assert.equal(commands.items()[0].id, item.id);
});
test('tool command settings use generic CRUD, virtual revisions, permission guards and stable command IDs', (t) => {
  const f = fixture(t),
    serverId = f.add({ enabled: true }),
    tool = {
      toolRevision: 'r1',
      toolBinding: {
        version: 1,
        endpointFingerprint: mcpEndpointIdentity(f.owner.connection(serverId)),
        definitionFingerprint: 'b'.repeat(64),
      },
    };
  let available = true,
    executions = 0;
  const client = {
    connectionError: () => undefined,
    cachedTool: () => (available ? tool : undefined),
    commandStateVersion: () => available,
    commandValidation: (raw) =>
      available && raw.toolRevision === tool.toolRevision ? null : 'Stale catalog',
    checkCommandAccess: () => {},
    start: () => {
      executions++;
      throw Error('must not execute');
    },
  };
  const commands = new McpToolCommandService({
    settings: f.owner,
    client,
    actor: () => ({ owner: 'host', kind: 'host', external: false }),
  });
  const settingsCommands = new SettingsCommands({
    settings: f.store,
    applets: () => [],
    save: (v, r) => f.store.save(v, r),
  });
  let writable = true;
  const api = new AppDockApi({
    settings: f.store,
    settingsCommands,
    mcpToolCommands: commands,
    serviceSettingsTargets: () => [
      mcpToolCommandSettingsTarget(commands, f.owner, (r) => settingsCommands.checkRevision(r)),
    ],
    save: (v, r) => f.store.save(v, r),
    ready: () => true,
    writable: () => writable,
    executable: () => true,
    version: 'test',
    instanceId: 'test',
    applets: () => [],
    commands: () => [],
    execute: () => {
      throw Error();
    },
  });
  const targetId = 'service.mcp.toolCommands',
    call = (method, args = {}) => api.call('settings.' + method, { targetId, ...args }),
    read = () => call('items.list'),
    schema = () => call('schema.get');
  const apply = (operations, dryRun = false) =>
    call('apply', {
      operations,
      dryRun,
      expectedRevision: read().revision,
      expectedSchemaRevision: schema().schemaRevision,
      requestId: randomUUID(),
    });
  assert.equal(schema().items.find((f) => f.key === 'id').writable, false);
  assert(!schema().items.some((f) => f.key === 'toolBinding'));
  const values = {
    title: 'Fixed MCP',
    serverId,
    toolName: 'echo',
    arguments: {},
    enabled: true,
    automation: true,
    toolRevision: 'r1',
  };
  apply([{ kind: 'add', values }], true);
  assert.equal(commands.items().length, 0);
  apply([{ kind: 'add', values }]);
  const id = commands.items()[0].id,
    commandId = 'appdock.mcp.tool.' + id;
  assert.equal(commands.publicCommands()[0].id, commandId);
  assert.equal(executions, 0);
  assert(!fs.readFileSync(f.store.device.file, 'utf8').includes('toolRevision'));
  available = false;
  apply([{ kind: 'update', itemRef: read().items[0].itemRef, changes: { title: 'Renamed' } }]);
  assert.equal(commands.items()[0].id, id);
  assert.throws(
    () =>
      apply([
        {
          kind: 'update',
          itemRef: read().items[0].itemRef,
          changes: { arguments: { message: 'new' } },
        },
      ]),
    { code: 'SCHEMA_CHANGED' },
  );
  apply([
    {
      kind: 'update',
      itemRef: read().items[0].itemRef,
      changes: { enabled: false, automation: false },
    },
  ]);
  apply([
    {
      kind: 'update',
      itemRef: read().items[0].itemRef,
      changes: { arguments: { message: 'draft' } },
    },
  ]);
  assert.equal(commands.items()[0].toolBinding, null);
  writable = false;
  assert.throws(() => apply([{ kind: 'remove', itemRef: read().items[0].itemRef }]), {
    code: 'WRITE_DISABLED',
  });
  writable = true;
  apply([{ kind: 'remove', itemRef: read().items[0].itemRef }]);
  assert.equal(commands.items().length, 0);
  assert.equal(executions, 0);
});
