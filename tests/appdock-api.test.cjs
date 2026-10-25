const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { AppDockApi, automationMethods } = require('../out/main/main/core/appdock-api');
const { AppletApiAccess, callAppletApi } = require('../out/main/main/core/applet-api-access');
const { SettingsStore } = require('../out/main/main/core/settings');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { createAppDockClient } = require('../out/main/shared/appdock-api');
const { AutomationService } = require('../out/main/main/core/automation');
function setup(t) {
  const base = path.resolve('.artifacts/shared-api-unit');
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'case-'));
  const store = new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  const access = new AppletApiAccess(path.join(dir, 'applet-api.json'));
  const manifest = {
    id: 'test.caller',
    folder: dir,
    capabilities: ['appdock-api', 'settings'],
    settings: [
      { key: 'flag', type: 'boolean', default: false, automation: true },
      { key: 'private', automation: false, type: 'boolean', default: false },
    ],
  };
  const e = { manifest, state: 'running' };
  const settingsCommands = new SettingsCommands({
    settings: store,
    applets: () => [
      { ...manifest, displayName: 'Caller', runtime: 'node', enabled: true, state: e.state },
    ],
    save: (v, r) => store.save(v, r),
  });
  store.updateExtension(manifest.id, { enabled: true, settings: {} });
  const options = {
    settings: store,
    settingsCommands,
    save: (v, r) => store.save(v, r),
    applets: () => [],
    commands: () => [],
    execute: async () => {},
    executable: () => false,
    writable: () => false,
    ready: () => true,
    version: 'test',
    instanceId: 'test',
    appletPermissions: (id) => (id === manifest.id ? access.get(manifest) : {}),
  };
  const api = new AppDockApi(options),
    audit = [];
  const call = (method, params = {}) =>
    callAppletApi(api, e, { method, params }, (...args) => audit.push(args));
  return {
    dir,
    store,
    access,
    manifest,
    e,
    api,
    options,
    settingsCommands,
    audit,
    call,
    grant: (p) => access.set(p),
  };
}
test('internal publication IDs share the external catalog without granting execution', async (t) => {
  const f = setup(t);
  f.options.commands = () => [
    {
      id: 'test.public',
      title: 'Published',
      appletId: null,
      available: false,
      unavailableReason: 'stopped',
      completion: 'handlerReturned',
    },
  ];
  const published = f.api.publishedCommandIds();
  const listed = await f.call('commands.list');
  assert.equal(listed.ok, true);
  assert.deepEqual([...published].sort(), listed.value.commands.map((c) => c.id).sort());
  assert(published.has('test.public'));
  f.grant({});
  assert(f.api.publishedCommandIds().has('test.public'));
  assert.equal(
    (await f.call('commands.execute', { id: 'test.public' })).error.code,
    'API_DISABLED',
  );
});

test('Applet grants are default-on, persisted for all Applets, independent of MCP, and revoked immediately', async (t) => {
  const f = setup(t);
  assert.equal((await f.call('system.getInfo')).ok, true);
  assert.equal(f.access.get().useTts, false);
  assert.equal(f.access.get().useAi, false);
  assert.equal(f.access.get().useMcp, false);
  assert.equal(f.access.get().manageCustomCommands, undefined);
  assert.equal(f.access.get().manageMcpServers, undefined);
  assert.equal(f.access.get().runProcesses, false);
  assert.ok(
    Object.entries(f.access.get())
      .filter(
        ([k]) =>
          ![
            'useTts',
            'useAi',
            'useMcp',
            'manageCustomCommands',
            'manageMcpServers',
            'runProcesses',
          ].includes(k),
      )
      .every(([, v]) => v === true),
  );
  assert.equal(
    Object.keys(f.access.get()).length,
    Object.keys(require('../out/main/shared/appdock-api').appletApiPermissionLabels).length,
  );
  f.grant({});
  assert.deepEqual(new AppletApiAccess(path.join(f.dir, 'applet-api.json')).get(), {});
  assert.equal((await f.call('system.getInfo')).error.code, 'API_DISABLED');
  f.grant({ read: true, execute: true, write: true });
  for (const method of require('../out/main/shared/appdock-api')
    .operationsFor('applet')
    .map(([method]) => method)
    .filter(
      (m) =>
        !m.startsWith('tts.') &&
        !m.startsWith('customCommands.') &&
        !m.startsWith('mcp.') &&
        !m.startsWith('ai.') &&
        !m.startsWith('input.') &&
        !m.startsWith('processes.') &&
        !m.startsWith('ui.') &&
        m !== 'commands.execute' &&
        m !== 'applets.get',
    ))
    assert.equal((await f.call(method)).ok, true, method);
  assert.equal(f.api.call('system.getInfo').executable, false);
  assert.deepEqual(new AppletApiAccess(path.join(f.dir, 'applet-api.json')).get(f.manifest), {
    read: true,
    execute: true,
    write: true,
  });
  assert.deepEqual(
    f.access.get({ ...f.manifest, id: 'other', folder: path.join(f.dir, 'other') }),
    { read: true, execute: true, write: true },
  );
  f.grant({ read: true });
  assert.equal(
    (await f.call('commands.execute', { id: 'appdock.settings.closeToTray.off' })).error.code,
    'WRITE_DISABLED',
  );
  f.grant({});
  assert.equal((await f.call('system.getInfo')).error.code, 'API_DISABLED');
});
test('MCP configuration uses read/write while inspection uses execute/useMcp and intersects origin grants', async (t) => {
  const f = setup(t);
  const methods = [
    'mcp.servers.getSettings',
    'mcp.servers.updateSettings',
    'mcp.servers.inspectTools',
  ];
  const params = [
    {},
    { op: 'remove', id: 'server', expectedRevision: 'revision' },
    { serverId: 'server' },
  ];
  Object.assign(f.options, {
    executable: () => false,
    writable: () => true,
    mcpClientAllowed: () => false,
    handlers: Object.fromEntries(methods.map((m) => [m, async () => ({ called: true })])),
  });
  for (const i of [0, 1]) assert.equal((await f.api.call(methods[i], params[i])).called, true);
  await assert.rejects(async () => f.api.call(methods[2], params[2]), { code: 'API_DISABLED' });
  f.options.writable = () => false;
  f.grant({ read: true, write: true, execute: true, useMcp: true });
  assert.equal((await f.call(methods[1], params[1])).ok, true);
  await assert.rejects(
    async () => f.api.call(methods[1], params[1], f.manifest.id, { origin: { kind: 'mcp' } }),
    { code: 'API_DISABLED' },
  );
  f.options.writable = () => true;
  assert.equal(
    (await f.api.call(methods[1], params[1], f.manifest.id, { origin: { kind: 'mcp' } })).called,
    true,
  );
  f.options.executable = () => true;
  f.options.mcpClientAllowed = () => true;
  assert.equal((await f.api.call(methods[2], params[2])).called, true);
  f.grant({ read: true, write: false, execute: true, useMcp: true });
  assert.equal((await f.call(methods[1], params[1])).error.code, 'API_DISABLED');
  assert.equal((await f.call(methods[2], params[2])).ok, true);
  await assert.rejects(
    async () => f.api.call(methods[2], { serverId: 'server', management: true }),
    { code: 'INVALID_ARGUMENT' },
  );
});

test('Caller identity cannot be supplied, capability and lifetime are checked, audit excludes arguments', async (t) => {
  const f = setup(t);
  f.grant({ read: true, execute: true, write: true });
  const result = await callAppletApi(
    f.api,
    f.e,
    { method: 'settings.get', params: {}, appletId: 'other' },
    (...a) => f.audit.push(a),
  );
  assert.equal(result.error.code, 'INVALID_ARGUMENT');
  f.manifest.capabilities = [];
  assert.equal((await f.call('system.getInfo')).error.code, 'CAPABILITY_REQUIRED');
  f.manifest.capabilities = ['appdock-api'];
  f.e.state = 'stopped';
  assert.equal((await f.call('system.getInfo')).error.code, 'UNAVAILABLE');
  f.e.state = 'running';
  await f.call('commands.execute', { id: 'SECRET_VALUE' });
  assert.ok(!JSON.stringify(f.audit).includes('SECRET_VALUE'));
  assert.ok(f.audit.every((a) => a[1] === f.manifest.id));
});
test('Both transports share revision, dryRun, atomic validation, and settings permission', async (t) => {
  const f = setup(t);
  f.grant({ read: true, execute: true });
  const revision = f.api.call('settings.get').revision;
  const request = {
    id: 'appdock.settings.update',
    args: { expectedRevision: revision, changes: { closeToTray: false } },
  };
  assert.equal((await f.call('commands.execute', request)).error.code, 'WRITE_DISABLED');
  f.grant({ read: true, execute: true, write: true });
  assert.equal(
    (await f.call('commands.execute', { ...request, args: { ...request.args, dryRun: true } }))
      .value.dryRun,
    true,
  );
  assert.equal(f.api.call('settings.get').revision, revision);
  assert.equal((await f.call('commands.execute', request)).ok, true);
  assert.equal(f.api.call('settings.get').values.closeToTray, false);
  assert.equal((await f.call('commands.execute', request)).error.code, 'REVISION_CONFLICT');
  assert.equal(
    (await f.call('commands.execute', { id: 'appdock.tray.update', args: {} })).error.code,
    'INVALID_ARGUMENT',
  );
});
test('MCP -> Applet -> synchronous settings works while asynchronous reentry and self lifecycle are rejected', async (t) => {
  const f = setup(t);
  f.grant({ read: true, execute: true, write: true });
  f.options.executable = () => true;
  f.options.commands = () => [
    {
      id: 'test.caller.run',
      appletId: 'test.caller',
      title: 'Run',
      available: true,
      completion: 'handlerReturned',
    },
    {
      id: 'other.run',
      appletId: 'other',
      title: 'Other',
      available: true,
      completion: 'handlerReturned',
    },
    {
      id: 'test.self.restart',
      appletId: 'test.caller',
      title: 'Restart',
      permission: 'applets.manage',
      available: true,
    },
  ];
  f.options.execute = async () => {
    assert.equal(
      (await f.call('commands.execute', { id: 'appdock.settings.closeToTray.off' })).ok,
      true,
    );
    assert.equal((await f.call('commands.execute', { id: 'other.run' })).error.code, 'BUSY');
    assert.equal(
      (await f.call('commands.execute', { id: 'test.caller.run' })).error.code,
      'SELF_CALL',
    );
    assert.equal(
      (await f.call('commands.execute', { id: 'test.self.restart' })).error.code,
      'SELF_CALL',
    );
  };
  await f.api.call('commands.execute', { id: 'test.caller.run' });
  assert.equal(f.store.value.host.closeToTray, false);
});
test('Legacy self-setting uses shared validation and revision while keeping private keys and startup behavior', (t) => {
  const f = setup(t);
  const before = f.settingsCommands.revision();
  f.e.state = 'starting';
  f.settingsCommands.setOwnSetting(f.manifest, 'flag', true);
  f.settingsCommands.setOwnSetting(f.manifest, 'private', true);
  f.settingsCommands.setOwnSetting(f.manifest, 'undeclared', { legacy: true });
  assert.notEqual(f.settingsCommands.revision(), before);
  assert.throws(() => f.settingsCommands.setOwnSetting(f.manifest, 'flag', 'bad'));
  assert.deepEqual(f.settingsCommands.get(f.manifest.id).values, { flag: true });
  assert.deepEqual(f.store.value.extensions[f.manifest.id].settings, {
    flag: true,
    private: true,
    undeclared: { legacy: true },
  });
});
test('Malformed grants fail closed; invalid edits never change stored permissions', (t) => {
  const f = setup(t);
  f.grant({ read: true });
  const file = path.join(f.dir, 'applet-api.json'),
    before = fs.readFileSync(file, 'utf8');
  assert.throws(() => f.grant({ read: 'true' }));
  assert.throws(() => f.grant({ admin: true }));
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  fs.writeFileSync(file, '{}');
  const bad = new AppletApiAccess(file);
  assert.ok(bad.error);
  assert.deepEqual(bad.get(f.manifest), {});
  assert.throws(() => bad.set({ read: true }));
  // An access error must not be mistaken for a missing file by existsSync.
  const deniedFile = path.join(f.dir, 'denied.json');
  const statSync = fs.statSync;
  t.mock.method(fs, 'statSync', (name, ...args) => {
    if (name === deniedFile) throw Object.assign(new Error('denied'), { code: 'EACCES' });
    return statSync(name, ...args);
  });
  const inaccessible = new AppletApiAccess(deniedFile);
  assert.ok(inaccessible.error);
  assert.deepEqual(inaccessible.get(f.manifest), {});
});
test('Node SDK exposes structured error codes and unwraps the same result', async () => {
  const client = createAppDockClient(async (method, args) => {
    assert.equal(method, 'host.appdock.call');
    return args.method === 'settings.get'
      ? { ok: true, value: { revision: 'r' } }
      : { ok: false, error: { code: 'API_DISABLED', message: 'Disabled' } };
  });
  assert.deepEqual(await client.call('settings.get'), { revision: 'r' });
  await assert.rejects(client.call('system.getInfo'), { code: 'API_DISABLED' });
});

test('Applet-only operations require only their declared grant and cannot be called or discovered by MCP', async (t) => {
  const f = setup(t);
  const { operationsFor } = require('../out/main/shared/appdock-api');
  const calls = [];
  f.options.handlers = {
    'input.sendKeys': async (params, id) => {
      calls.push({ params, id });
      return { completion: 'inputSubmitted' };
    },
  };
  assert.ok(!operationsFor('mcp').some(([name]) => name.startsWith('input.')));
  assert.ok(operationsFor('applet').some(([name]) => name === 'input.sendKeys'));
  assert.throws(() => f.api.call('input.sendKeys', { keys: 'A' }), { code: 'NOT_FOUND' });
  f.grant({});
  assert.equal((await f.call('input.sendKeys', { keys: 'A' })).error.code, 'API_DISABLED');
  f.grant({ sendInput: true });
  assert.equal((await f.call('input.sendKeys', { keys: 'A' })).ok, true);
  for (const params of [{}, { keys: 5 }, { keys: '' }, { keys: 'A', window: '123' }])
    assert.equal((await f.call('input.sendKeys', params)).error.code, 'INVALID_ARGUMENT');
  assert.equal(calls.length, 1);
  f.options.executable = () => true;
  f.options.commands = () => [{ id: 'test.caller.send', title: 'Send', available: true }];
  f.options.execute = async () => {
    assert.equal((await f.call('input.sendKeys', { keys: 'A' })).ok, true);
  };
  await f.api.call('commands.execute', { id: 'test.caller.send' });
  assert.equal(
    calls.length,
    2,
    'explicitly published Applet command may delegate to its permitted input API',
  );
  f.grant({});
  assert.equal((await f.call('input.sendKeys', { keys: 'A' })).error.code, 'API_DISABLED');
});

test('old per-Applet grants never become a global grant automatically', (t) => {
  const f = setup(t),
    file = path.join(f.dir, 'applet-api.json');
  fs.writeFileSync(
    file,
    JSON.stringify({ version: 1, grants: { a: { folder: f.dir, permissions: { read: true } } } }),
  );
  const access = new AppletApiAccess(file);
  assert.equal(access.error, undefined);
  assert.deepEqual(access.get(), {});
  access.set({ sendInput: true });
  assert.equal(JSON.parse(fs.readFileSync(file)).version, 2);
});

test('host execution context isolates identities, expires on return, and cancels the matching gesture', async () => {
  const { CommandContexts } = require('../out/main/main/core/command-contexts');
  const contexts = new CommandContexts();
  let expired;
  await contexts.run('a', { session: 'one', window: '123', source: 'gesture' }, async (id) => {
    expired = id;
    assert.throws(() => contexts.get('b', id));
    const ctx = contexts.get('a', id);
    assert.equal(ctx.window, '123');
    contexts.cancel('other');
    assert.equal(ctx.signal.aborted, false);
    contexts.cancel('one');
    assert.equal(ctx.signal.aborted, true);
  });
  assert.throws(() => contexts.get('a', expired));
  await contexts.run('b', undefined, async (id) => {
    const c = contexts.get('b', id);
    contexts.stop('b');
    assert.equal(c.signal.aborted, true);
  });
});

test('MCP effective permission reporting retains execution and write prerequisites', (t) => {
  const f = setup(t);
  const config = {
    version: 1,
    enabled: true,
    allowWrite: false,
    allowExecute: false,
    allowManageApplets: true,
    allowEditShortcuts: true,
    allowEditGestures: true,
    allowEditRibbon: true,
    allowEditTray: true,
    port: 0,
    token: 'a'.repeat(64),
    configFile: path.join(f.dir, 'config.toml'),
    serverName: 'Test',
    owned: {},
  };
  const service = () => {
    fs.writeFileSync(path.join(f.dir, 'automation.json'), JSON.stringify(config));
    return new AutomationService({
      localDirectory: f.dir,
      baseDirectory: f.dir,
      version: 'test',
      encrypt: (v) => v,
      decrypt: (v) => v,
      changed: () => {},
      createApi: () => f.api,
    });
  };
  let s = service();
  assert.equal(s.allowed('allowManageApplets'), false);
  assert.equal(s.allowed('allowEditTray'), false);
  config.allowExecute = true;
  s = service();
  assert.equal(s.allowed('allowManageApplets'), false);
  assert.equal(s.allowed('allowEditTray'), false);
  config.allowWrite = true;
  s = service();
  assert.equal(s.allowed('allowEditTray'), true);
  config.enabled = false;
  s = service();
  assert.equal(s.allowed('allowWrite'), false);
  assert.equal(s.allowed('allowEditTray'), false);
});

test('legacy Applet grants load without writeback, never enable write, and compact only on explicit save', (t) => {
  const f = setup(t),
    file = path.join(f.dir, 'applet-api.json');
  for (const write of [false, true]) {
    const saved = JSON.stringify({
      version: 2,
      permissions: {
        read: true,
        write,
        execute: false,
        editShortcuts: !write,
        manageApplets: true,
        manageMcpServers: !write,
        editTray: false,
      },
    });
    fs.writeFileSync(file, saved);
    const access = new AppletApiAccess(file);
    assert.deepEqual(access.get(), { read: true, write, execute: false });
    assert.equal(fs.readFileSync(file, 'utf8'), saved);
    assert.throws(() => access.set({ write, editTray: false }));
    assert.equal(fs.readFileSync(file, 'utf8'), saved);
    access.set(access.get());
    assert.deepEqual(JSON.parse(fs.readFileSync(file)).permissions, {
      read: true,
      write,
      execute: false,
    });
  }
  for (const permissions of [
    { read: true, unknown: true },
    { read: true, editTray: 'false' },
  ]) {
    fs.writeFileSync(file, JSON.stringify({ version: 2, permissions }));
    assert(new AppletApiAccess(file).error);
  }
  assert.equal(
    Object.keys(require('../out/main/shared/appdock-api').appletApiPermissionLabels).length,
    8,
  );
});

test('legacy MCP flags cannot broaden write and are removed only by local permission save', async (t) => {
  const f = setup(t),
    file = path.join(f.dir, 'automation.json');
  const saved = JSON.stringify({
    version: 1,
    enabled: true,
    allowWrite: false,
    allowExecute: false,
    allowEditTray: true,
    allowManageMcpServers: true,
    port: 0,
    token: 'a'.repeat(64),
    configFile: path.join(f.dir, 'config.toml'),
    serverName: 'Test',
    owned: {},
  });
  fs.writeFileSync(file, saved);
  const service = new AutomationService({
    localDirectory: f.dir,
    baseDirectory: f.dir,
    version: 'test',
    encrypt: (v) => v,
    decrypt: (v) => v,
    changed: () => {},
    createApi: () => f.api,
  });
  t.after(() => service.close());
  assert.equal(service.allowed('allowEditTray'), false);
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
  await assert.rejects(service.action({ kind: 'setTrayEditing', allowed: true }), /個別/);
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
  await service.action({ kind: 'setExecution', allowed: true });
  const compact = JSON.parse(fs.readFileSync(file));
  assert.equal(compact.allowWrite, false);
  assert.equal(Object.hasOwn(compact, 'allowEditTray'), false);
  assert.equal(Object.hasOwn(compact, 'allowManageMcpServers'), false);
});
