const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { AppDockApi, automationMethods } = require('../out/main/main/core/appdock-api');
const { AppletApiAccess, callAppletApi } = require('../out/main/main/core/applet-api-access');
const { SettingsStore } = require('../out/main/main/core/settings');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const {
  appletApiPermissionLabels,
  createAppDockClient,
} = require('../out/main/shared/appdock-api');
const { AutomationService } = require('../out/main/main/core/automation');
const { openOperationPermissions } = require('./fixtures/operation-permissions.cjs');
function setup(t) {
  const base = path.resolve('.artifacts/shared-api-unit');
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'case-'));
  const store = new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  t.after(() => store.close());
  const permissions = openOperationPermissions(t, dir);
  const access = new AppletApiAccess(permissions);
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
    permissions,
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
test('raw image generation stays private; shared image jobs preserve read and cancel permissions', async (t) => {
  const f = setup(t);
  f.grant(Object.fromEntries(Object.keys(appletApiPermissionLabels).map((key) => [key, true])));
  const methods = ['ai.image.generate', 'ai.image.results.read'];
  let invoked = false;
  f.options.handlers = Object.fromEntries(
    methods.map((method) => [
      method,
      async () => {
        invoked = true;
        return {};
      },
    ]),
  );
  const connections = { connections: [], defaultConnectionId: null };
  f.options.handlers['ai.image.connections.list'] = async () => connections;
  const job = { jobId: 'owned', state: 'running' };
  for (const method of ['ai.image.jobs.get', 'ai.image.jobs.cancel']) {
    f.options.handlers[method] = async (params, owner) => {
      assert.deepEqual(params, { jobId: 'owned' });
      assert(owner === undefined || owner === f.manifest.id);
      return job;
    };
    assert.equal((await f.call(method, { jobId: 'owned' })).value, job);
    if (method.endsWith('.get')) assert.equal(await f.api.call(method, { jobId: 'owned' }), job);
    else
      await assert.rejects(async () => f.api.call(method, { jobId: 'owned' }), {
        code: 'API_DISABLED',
      });
  }
  assert.equal(f.access.get().useImageAi, true);
  const info = await f.call('system.getInfo');
  assert.equal(info.ok, true);
  for (const method of methods) {
    assert(!info.value.methods.includes(method));
    assert.equal((await f.call(method)).error.code, 'INVALID_ARGUMENT');
    await assert.rejects(async () => f.api.call(method, {}, f.manifest.id), { code: 'NOT_FOUND' });
    await assert.rejects(async () => f.api.call(method), { code: 'NOT_FOUND' });
  }
  assert.equal(invoked, false);
  assert(info.value.methods.includes('ai.text.generate'));
  assert(info.value.methods.includes('tts.speak'));
  assert(info.value.methods.includes('ai.image.connections.list'));
  await assert.rejects(async () => f.api.call('ai.image.connections.list'), {
    code: 'API_DISABLED',
  });
  for (const useImageAi of [false, true]) {
    f.grant({ read: true, execute: true, useImageAi });
    const reloaded = new AppletApiAccess(openOperationPermissions(t, f.dir));
    assert.equal(reloaded.error, undefined);
    assert.equal(reloaded.get().useImageAi, useImageAi);
    const listed = await f.call('ai.image.connections.list');
    if (useImageAi) assert.deepEqual(listed, { ok: true, value: connections });
    else assert.equal(listed.error.code, 'API_DISABLED');
    assert.equal((await f.call('ai.image.generate')).error.code, 'INVALID_ARGUMENT');
  }
  f.grant({ read: true, execute: false, useImageAi: false });
  assert.equal((await f.call('ai.image.jobs.get', { jobId: 'owned' })).value, job);
  assert.equal(
    (await f.call('ai.image.jobs.cancel', { jobId: 'owned' })).error.code,
    'API_DISABLED',
  );
  f.grant({ read: false, execute: true, useImageAi: true });
  assert.equal((await f.call('ai.image.jobs.get', { jobId: 'owned' })).error.code, 'API_DISABLED');
});

test('image registration requires independent write, execute and image grants across Applet and MCP', async (t) => {
  const f = setup(t);
  const method = 'ai.image.generateAndRegister';
  const params = { requestId: 'one', destination: { folder: '' }, input: 'fixture' };
  let calls = 0;
  f.options.handlers = {
    [method]: async () => {
      calls++;
      return { completion: 'accepted', jobId: 'one' };
    },
  };
  const all = { read: true, write: true, execute: true, useImageAi: true };
  for (const key of Object.keys(all)) {
    f.grant({ ...all, [key]: false });
    assert.equal((await f.call(method, params)).error.code, 'API_DISABLED');
  }
  assert.equal(calls, 0);
  f.grant(all);
  assert.equal((await f.call(method, params)).value.completion, 'accepted');
  let mcp = { ...all };
  f.options.executable = () => mcp.execute;
  f.options.writable = () => mcp.write;
  f.options.imageAiAllowed = () => mcp.useImageAi;
  for (const key of ['write', 'execute', 'useImageAi']) {
    mcp = { ...all, [key]: false };
    await assert.rejects(async () => f.api.call(method, params), { code: 'API_DISABLED' });
    await assert.rejects(
      async () =>
        f.api.call(method, params, f.manifest.id, { origin: { kind: 'mcp', lease: 'fixture' } }),
      { code: 'API_DISABLED' },
    );
  }
  mcp = { ...all };
  assert.equal((await f.api.call(method, params)).completion, 'accepted');
  assert.equal(calls, 2);
  await assert.rejects(async () => f.api.call(method, { ...params, model: 'override' }), {
    code: 'INVALID_ARGUMENT',
  });
});

test('internal publication IDs share the external catalog without granting execution', async (t) => {
  const f = setup(t);
  f.grant({ read: true });
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
  const mcpListed = await f.api.call('commands.list');
  assert.deepEqual([...published].sort(), mcpListed.commands.map((c) => c.id).sort());
  const listed = await f.call('commands.list');
  assert.equal(listed.ok, true);
  const appletIds = new Set(listed.value.commands.map((c) => c.id));
  assert([...appletIds].every((id) => published.has(id)));
  // Hardware acceleration keeps its MCP-only setting scope when commands are generated.
  for (const action of ['on', 'off', 'toggle']) {
    const id = `appdock.settings.hardwareAcceleration.${action}`;
    assert(published.has(id));
    assert(!appletIds.has(id));
  }
  assert(published.has('test.public'));
  f.grant({});
  assert(f.api.publishedCommandIds().has('test.public'));
  assert.equal(
    (await f.call('commands.execute', { id: 'test.public' })).error.code,
    'API_DISABLED',
  );
});

test('Applet grants default OFF, persist per device for all Applets, and are revoked immediately', async (t) => {
  const f = setup(t);
  assert.deepEqual(f.access.get(), {});
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
  assert.deepEqual(new AppletApiAccess(openOperationPermissions(t, f.dir)).get(f.manifest), {
    read: true,
    execute: true,
    write: true,
  });
  assert.deepEqual(
    new AppletApiAccess(openOperationPermissions(t, f.dir, 'OtherDevice')).get(f.manifest),
    {},
  );
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
test('MCP -> Applet can call settings and another command while cycles and self lifecycle are rejected', async (t) => {
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
  f.options.execute = async (id) => {
    if (id === 'other.run') {
      await assert.rejects(f.api.call('commands.execute', { id: 'test.caller.run' }), {
        code: 'SELF_CALL',
      });
      return;
    }
    assert.equal(
      (await f.call('commands.execute', { id: 'appdock.settings.closeToTray.off' })).ok,
      true,
    );
    assert.equal((await f.call('commands.execute', { id: 'other.run' })).ok, true);
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
test('host stack children retain publication, caller authority and cycle guards without refusing other calls', async (t) => {
  const f = setup(t),
    calls = [];
  f.grant({ read: true, execute: true });
  f.options.commands = () =>
    ['stack', 'leaf', 'test.caller.self'].map((id) => ({
      id,
      title: id,
      appletId: id === 'test.caller.self' ? 'test.caller' : null,
      available: true,
      completion: 'handlerReturned',
    }));
  f.options.executable = () => true;
  f.options.execute = async (id, context) => {
    calls.push(id);
    if (id === 'stack') {
      assert.equal(f.api.canExecuteStack('stack', context), true);
      await f.api.executeStackEntry('leaf', context);
      await assert.rejects(
        f.api.executeStackEntry('private', context),
        (error) => error.code === 'NOT_FOUND',
      );
      await assert.rejects(
        f.api.executeStackEntry('test.caller.self', context),
        (error) => error.code === 'SELF_CALL',
      );
      assert.equal((await f.call('commands.execute', { id: 'leaf' })).ok, true);
      assert.equal((await f.call('commands.execute', { id: 'stack' })).error.code, 'SELF_CALL');
      f.grant({ read: true, execute: false });
      assert.equal(f.api.canExecuteStack('stack', context), false);
      await assert.rejects(
        f.api.executeStackEntry('leaf', context),
        (error) => error.code === 'EXECUTION_DISABLED',
      );
    } else assert.equal(context.origin.appletId, 'test.caller');
  };
  assert.equal((await f.call('commands.execute', { id: 'stack' })).ok, true);
  assert.deepEqual(calls, ['stack', 'leaf', 'leaf']);
});

test('API command calls isolate simultaneous roots and restore Applet queue ancestry', async (t) => {
  const f = setup(t),
    releases = [];
  f.options.commands = () =>
    ['one', 'two'].map((id) => ({
      id,
      title: id,
      appletId: 'other',
      available: true,
      completion: 'handlerReturned',
    }));
  f.options.executable = () => true;
  f.options.execute = async () => new Promise((release) => releases.push(release));
  const runs = ['one', 'one', 'two'].map((id) => f.api.call('commands.execute', { id }));
  assert.equal(releases.length, 3);
  releases.forEach((release) => release());
  await Promise.all(runs);
  await assert.rejects(
    f.api.call('commands.execute', { id: 'two' }, undefined, {
      commandChain: ['one'],
      commandApplets: ['other'],
    }),
    { code: 'SELF_CALL' },
  );
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
test('Malformed and unavailable device files fail closed even with a last-good grant', (t) => {
  const f = setup(t);
  f.grant({ read: true, write: true });
  const file = f.permissions.device.file,
    before = fs.readFileSync(file, 'utf8');
  assert.throws(() => f.grant({ read: 'true' }));
  assert.throws(() => f.grant({ admin: true }));
  assert.throws(() => f.access.set({ read: false }, { read: true }));
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  fs.writeFileSync(file, '{}');
  const bad = new AppletApiAccess(openOperationPermissions(t, f.dir));
  assert.ok(bad.error);
  assert.deepEqual(bad.get(f.manifest), {});
  assert.throws(() => bad.set({ read: true }));
  assert.equal(fs.readFileSync(file, 'utf8'), '{}');
  fs.writeFileSync(file, before);
  const readFileSync = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (name, ...args) => {
    if (name === file) throw Object.assign(new Error('denied'), { code: 'EACCES' });
    return readFileSync(name, ...args);
  });
  const inaccessible = new AppletApiAccess(openOperationPermissions(t, f.dir));
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

test('old per-Applet and global grants are ignored and never written back', (t) => {
  const f = setup(t),
    file = path.join(f.dir, 'local', 'applet-api.json');
  for (const old of [
    { version: 1, grants: { a: { folder: f.dir, permissions: { read: true } } } },
    { version: 2, permissions: { read: true, write: true, editTray: true } },
  ]) {
    const saved = JSON.stringify(old);
    fs.writeFileSync(file, saved);
    const access = new AppletApiAccess(openOperationPermissions(t, f.dir));
    assert.equal(access.error, undefined);
    assert.deepEqual(access.get(), {});
    assert.throws(() => access.set({ editTray: true }));
    access.set({ sendInput: true });
    assert.equal(fs.readFileSync(file, 'utf8'), saved);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(f.permissions.device.file)).operationPermissions.applet,
      { sendInput: true },
    );
    access.set({});
  }
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
    version: 2,
    token: '',
    codex: {
      enabled: true,
      port: 0,
      token: '',
      configFile: path.join(f.dir, 'config.toml'),
      owned: {},
    },
  };
  const service = () => {
    fs.writeFileSync(path.join(f.dir, 'automation.json'), JSON.stringify(config));
    return new AutomationService({
      localDirectory: f.dir,
      baseDirectory: f.dir,
      settings: f.permissions,
      mcpServer: require('./fixtures/mcp-receiver-settings.cjs').mcpReceiverSettings(),
      version: 'test',
      encrypt: (v) => v,
      decrypt: (v) => v,
      changed: () => {},
      createApi: () => f.api,
    });
  };
  let s = service();
  const enabled = s;
  t.after(() => enabled.close());
  assert.equal(s.allowed('allowManageApplets'), false);
  assert.equal(s.allowed('allowEditTray'), false);
  f.permissions.saveOperationPermissions({ mcp: { allowExecute: true } });
  assert.equal(s.allowed('allowManageApplets'), false);
  assert.equal(s.allowed('allowEditTray'), false);
  f.permissions.saveOperationPermissions({ mcp: { allowExecute: true, allowWrite: true } });
  assert.equal(s.allowed('allowEditTray'), true);
  config.codex.enabled = false;
  s = service();
  t.after(() => s.close());
  assert.equal(s.allowed('allowWrite'), false);
  assert.equal(s.allowed('allowEditTray'), false);
});

test('MCP ignores old grants and saves new grants independently of its connection', async (t) => {
  const f = setup(t),
    file = path.join(f.dir, 'automation.json');
  const saved = JSON.stringify({
    version: 1,
    enabled: true,
    allowWrite: true,
    allowExecute: true,
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
    settings: f.permissions,
    mcpServer: {
      read: () => f.permissions.readMcpServer(),
      save: (next, previous) => f.permissions.saveMcpServer(next, previous),
    },
    version: 'test',
    encrypt: (v) => v,
    decrypt: (v) => v,
    changed: () => {},
    createApi: () => f.api,
  });
  t.after(() => service.close());
  assert.equal(service.allowed('allowEditTray'), false);
  assert.equal(service.allowed('allowExecute'), false);
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
  await assert.rejects(service.action({ kind: 'setTrayEditing', allowed: true }), /個別/);
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
  await service.initialize();
  const migrated = fs.readFileSync(file, 'utf8');
  await service.action({ kind: 'setExecution', allowed: true });
  assert.equal(fs.readFileSync(file, 'utf8'), migrated);
  assert.deepEqual(f.permissions.operationPermissions(), { mcp: { allowExecute: true } });
  assert.equal(service.state().allowWrite, false);
  const compact = JSON.parse(migrated);
  assert.equal(f.permissions.readMcpServer().enabled, true);
  assert.equal(compact.codex.enabled, true);
  assert.equal(compact.token, 'a'.repeat(64));
  assert.equal(Object.hasOwn(compact, 'allowWrite'), false);
  assert.equal(Object.hasOwn(compact, 'allowExecute'), false);
  assert.equal(Object.hasOwn(compact, 'allowEditTray'), false);
  assert.equal(Object.hasOwn(compact, 'allowManageMcpServers'), false);
});
