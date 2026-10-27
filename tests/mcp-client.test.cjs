const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  http = require('node:http');
const { randomUUID } = require('node:crypto');
const {
  StreamableHTTPServerTransport,
} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { fixtureServer } = require('./fixtures/mcp-server.cjs');
const { SettingsStore } = require('../out/main/main/core/settings');
const { McpClientSettings } = require('../out/main/main/core/mcp-client-settings');
const { McpClientService } = require('../out/main/main/core/mcp-client');
const { parseMcpRoster, defaultMcpConnection } = require('../out/main/shared/mcp-client');
const { operationsFor } = require('../out/main/shared/appdock-api');
const { CustomCommandService } = require('../out/main/main/core/custom-commands');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { mcpCommandType } = require('../out/main/shared/mcp-command');
const host = { owner: 'host', kind: 'host', external: false },
  external = { owner: 'mcp:1', kind: 'mcp', external: true },
  applet = { owner: 'applet:a:1', kind: 'applet', external: false };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test('public settings and external metadata edits never decrypt a damaged cipher and keep its exact bytes', (t) => {
  const f = fixture(t),
    id = f.add(
      { url: 'http://127.0.0.1:12345/mcp', authentication: 'bearer' },
      { token: 'PRIVATE_TOKEN' },
    ),
    file = path.join(f.dir, 'mcp-client.json');
  const document = JSON.parse(fs.readFileSync(file));
  document.entries[id].secret = 'DAMAGED_CIPHER';
  fs.writeFileSync(file, JSON.stringify(document, null, 3));
  let crypts = 0,
    changes = 0;
  const owner = new McpClientSettings(
    f.store,
    file,
    {
      encrypt: () => {
        crypts++;
        throw Error('Unexpected encryption');
      },
      decrypt: () => {
        crypts++;
        throw Error('Unexpected decryption');
      },
    },
    () => changes++,
  );
  const detail = owner.publicSettings(id),
    before = fs.readFileSync(file);
  assert.equal(detail.connection.authentication, 'bearer');
  assert(!JSON.stringify(detail).includes('DAMAGED_CIPHER'));
  const request = {
    op: 'save',
    item: { ...detail.item, name: 'Renamed' },
    connection: detail.connection,
    expectedRevision: detail.revision,
  };
  assert.equal(owner.update({ ...request, dryRun: true }, true).validated, true);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(owner.update(request, true).saved, true);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(owner.roster()[0].name, 'Renamed');
  assert.throws(
    () => owner.update({ op: 'remove', id, expectedRevision: owner.revision() }, true),
    { code: 'PRIVATE_SETTING' },
  );
  const snapshot = owner.publicConfiguration();
  snapshot.rows[0].connection.url = 'http://other.test/mcp';
  assert.throws(() => owner.planPublicConfiguration(snapshot.rows, snapshot.revision), {
    code: 'PRIVATE_SETTING',
  });
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(crypts, 0);
  assert.equal(changes, 1);
});

test('external configuration excludes encrypted credentials and cannot erase or rebind them', (t) => {
  const f = fixture(t);
  const id = f.add(
    { url: 'http://127.0.0.1:12345/mcp', authentication: 'bearer' },
    { token: 'PRIVATE_TOKEN' },
  );
  const envId = f.add(
    {
      transport: 'stdio',
      command: path.join(f.dir, 'fixture.exe'),
      cwd: f.dir,
      args: [],
      authentication: 'none',
    },
    { environment: { PRIVATE_ENVIRONMENT: 'PRIVATE_VALUE' } },
  );
  const plainId = f.add({ url: 'http://127.0.0.1:12345/plain' });
  const file = path.join(f.dir, 'mcp-client.json');
  const before = fs.readFileSync(file, 'utf8'),
    settingsBefore = fs.readFileSync(f.store.file, 'utf8');
  for (const serverId of [undefined, id, envId]) {
    const publicValue = JSON.stringify(f.settings.publicSettings(serverId));
    for (const hidden of [
      'PRIVATE_TOKEN',
      'PRIVATE_ENVIRONMENT',
      'PRIVATE_VALUE',
      'environmentNames',
      'tokenConfigured',
      'secret',
    ])
      assert.equal(publicValue.includes(hidden), false);
  }
  for (const dryRun of [true, false]) {
    for (const serverId of [id, envId]) {
      const detail = f.settings.getSettings(serverId);
      const save = {
        op: 'save',
        item: detail.item,
        connection: detail.connection,
        expectedRevision: detail.revision,
        dryRun,
      };
      for (const request of [
        { ...save, token: '' },
        { ...save, environment: {} },
        {
          ...save,
          connection: {
            ...save.connection,
            ...(save.connection.transport === 'stdio'
              ? { command: path.join(f.dir, 'other.exe') }
              : { url: 'http://127.0.0.1:12345/other' }),
          },
        },
        { op: 'remove', id: serverId, expectedRevision: detail.revision, dryRun },
      ])
        assert.throws(() => f.settings.update(request, true), { code: 'PRIVATE_SETTING' });
    }
  }
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(fs.readFileSync(f.store.file, 'utf8'), settingsBefore);
  const detail = f.settings.getSettings(id);
  f.settings.update(
    {
      op: 'save',
      item: { ...detail.item, name: 'Renamed' },
      connection: { ...detail.connection, enabled: false },
      expectedRevision: detail.revision,
    },
    true,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(file)).entries[id].secret,
    JSON.parse(before).entries[id].secret,
  );
  f.settings.update(
    { op: 'reorder', ids: [plainId, envId, id], expectedRevision: f.settings.revision() },
    true,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(file)).entries[envId].secret,
    JSON.parse(before).entries[envId].secret,
  );
  f.settings.update({ op: 'remove', id: plainId, expectedRevision: f.settings.revision() }, true);
  assert.equal(f.settings.roster().length, 2);
  // Local settings retain the existing credential editor and removal path.
  f.settings.update({ op: 'remove', id, expectedRevision: f.settings.revision() });
  assert.equal(f.settings.roster().length, 1);
});

test('external repair cannot discard an unreadable encrypted entry', (t) => {
  const f = fixture(t),
    id = f.add({ url: 'http://127.0.0.1:12345/mcp' }),
    file = path.join(f.dir, 'mcp-client.json');
  const entries = JSON.parse(fs.readFileSync(file));
  entries.entries[id] = { connection: { invalid: true }, secret: 'UNREADABLE_CIPHERTEXT' };
  fs.writeFileSync(file, JSON.stringify(entries));
  const before = fs.readFileSync(file, 'utf8'),
    expectedRevision = f.settings.revision();
  assert.throws(
    () =>
      f.settings.update(
        {
          op: 'save',
          item: f.settings.roster()[0],
          connection: { ...defaultMcpConnection(), url: 'http://127.0.0.1:12345/mcp' },
          expectedRevision,
        },
        true,
      ),
    { code: 'PRIVATE_SETTING' },
  );
  assert.throws(() => f.settings.update({ op: 'remove', id, expectedRevision }, true), {
    code: 'PRIVATE_SETTING',
  });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
async function until(fn) {
  for (let i = 0; i < 250; i++) {
    const v = await fn();
    if (v) return v;
    await delay(20);
  }
  throw Error('Timed out');
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-mcp-'));
  const store = new SettingsStore(path.join(dir, 'settings.json'));
  store.load();
  let service,
    allowed = true,
    management = false;
  const settings = new McpClientSettings(
    store,
    path.join(dir, 'mcp-client.json'),
    {
      encrypt: (v) => randomUUID() + ':' + Buffer.from(v).toString('base64'),
      decrypt: (v) => Buffer.from(v.slice(37), 'base64').toString(),
    },
    () => service?.reconcile(),
  );
  const failures = [];
  service = new McpClientService({
    settings,
    authorized: (actor) => actor.kind === 'host' || (allowed && (!actor.management || management)),
    failed: (id, e) => failures.push(e),
  });
  t.after(async () => {
    await service.shutdown();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const add = (connection, extra = {}) => {
    const id = randomUUID();
    settings.update({
      op: 'save',
      expectedRevision: settings.revision(),
      item: { id, name: 'Fixture', description: 'Test' },
      connection: { ...defaultMcpConnection(), ...connection },
      ...extra,
    });
    return id;
  };
  return {
    dir,
    store,
    settings,
    service,
    failures,
    add,
    manage: (value) => {
      management = value;
    },
    revoke: () => {
      allowed = false;
      service.reconcile();
    },
  };
}
async function httpFixture(t, { json = true, bearer } = {}) {
  const state = { count: 0, changed: false },
    sessions = new Map(),
    received = [];
  const server = http.createServer(async (req, res) => {
    received.push({ method: req.method, authorization: req.headers.authorization });
    if (bearer && req.headers.authorization !== 'Bearer ' + bearer) {
      res.writeHead(401);
      res.end();
      return;
    }
    try {
      let entry = sessions.get(req.headers['mcp-session-id']);
      if (!entry) {
        const sdk = fixtureServer(state),
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: randomUUID,
            enableJsonResponse: json,
            onsessioninitialized: (id) => sessions.set(id, { sdk, transport }),
          });
        entry = { sdk, transport };
        await sdk.connect(transport);
      }
      await entry.transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await Promise.allSettled([...sessions.values()].map((v) => v.sdk.close()));
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  return { url: `http://127.0.0.1:${server.address().port}/mcp`, state, received };
}
async function call(f, actor, id, name, args = {}, extra = {}) {
  const { tool } = await f.service.tool(actor, { serverId: id, name });
  const job = await f.service.start(actor, {
    serverId: id,
    name,
    arguments: args,
    toolRevision: tool.toolRevision,
    requestId: randomUUID(),
    ...extra,
  });
  return until(() => {
    const j = f.service.get(actor, job.jobId);
    return j.state !== 'running' && j;
  });
}
test('management settings preview and save preserve unrelated data and keep credentials write-only', async (t) => {
  const f = fixture(t),
    server = await httpFixture(t),
    id = randomUUID();
  const initial = structuredClone(f.store.value),
    revision = f.settings.revision();
  const request = {
    op: 'save',
    expectedRevision: revision,
    item: { id, name: 'Managed fixture', description: '' },
    connection: { ...defaultMcpConnection(), url: server.url, authentication: 'bearer' },
    token: 'fixture-private-token',
  };
  const preview = f.settings.update({ ...request, dryRun: true });
  assert.deepEqual(preview, { saved: false, validated: true, revision });
  assert.deepEqual(f.store.value, initial);
  assert.equal(fs.existsSync(path.join(f.dir, 'mcp-client.json')), false);
  assert.equal(server.received.length, 0);
  assert.equal(f.settings.update(request).saved, true);
  assert.deepEqual(f.store.value, {
    ...initial,
    mcpServers: { version: 1, items: [request.item] },
  });
  const details = f.settings.getSettings(id);
  assert.deepEqual(details.connection, request.connection);
  assert.equal(details.tokenConfigured, true);
  assert(!JSON.stringify(details).includes(request.token));
  assert(!JSON.stringify(f.settings.getSettings()).includes(server.url));
  assert.equal(server.received.length, 0);
  const localBefore = fs.readFileSync(path.join(f.dir, 'mcp-client.json'), 'utf8');
  assert.throws(() => f.settings.update(request), { code: 'REVISION_CONFLICT' });
  assert.throws(() =>
    f.settings.update({ ...request, expectedRevision: details.revision, token: 'bad\ncredential' }),
  );
  assert.throws(() =>
    f.settings.update({
      op: 'remove',
      id,
      expectedRevision: details.revision,
      token: 'ignored-secret',
    }),
  );
  assert.equal(fs.readFileSync(path.join(f.dir, 'mcp-client.json'), 'utf8'), localBefore);
  const originalSave = f.store.save;
  f.store.save = () => {
    throw new (require('../out/main/main/core/settings').SettingsConflictError)('concurrent save');
  };
  assert.throws(() => f.settings.update({ op: 'remove', id, expectedRevision: details.revision }), {
    code: 'REVISION_CONFLICT',
  });
  f.store.save = originalSave;
  assert.equal(fs.readFileSync(path.join(f.dir, 'mcp-client.json'), 'utf8'), localBefore);
  f.store.save(
    { ...f.store.value, host: { ...f.store.value.host, theme: 'dark' } },
    f.store.revision,
  );
  assert.throws(() => f.settings.update({ op: 'remove', id, expectedRevision: details.revision }), {
    code: 'REVISION_CONFLICT',
  });
  f.settings.update({ op: 'remove', id, expectedRevision: f.settings.revision() });
  assert.equal(f.store.value.host.theme, 'dark');
  assert.deepEqual(f.settings.roster(), []);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(f.dir, 'mcp-client.json'), 'utf8')).entries,
    {},
  );
});
test('concurrent PC connection edits survive a management save conflict and rollback', (t) => {
  const f = fixture(t),
    id = f.add({ url: 'http://127.0.0.1:9876/mcp' });
  const file = path.join(f.dir, 'mcp-client.json'),
    revision = f.settings.revision();
  const sharedBefore = fs.readFileSync(f.store.file, 'utf8');
  const edited = JSON.parse(fs.readFileSync(file, 'utf8'));
  edited.entries[id].connection.enabled = true;
  const externalContent = JSON.stringify(edited);
  const originalSave = f.store.save.bind(f.store);
  f.store.save = (...args) => {
    fs.writeFileSync(file, externalContent);
    return originalSave(...args);
  };
  assert.throws(() => f.settings.update({ op: 'remove', id, expectedRevision: revision }), {
    code: 'REVISION_CONFLICT',
  });
  assert.equal(fs.readFileSync(file, 'utf8'), externalContent);
  assert.equal(fs.readFileSync(f.store.file, 'utf8'), sharedBefore);
});
test('management catalog can inspect unpublished tools but cannot execute or outlive permission revocation', async (t) => {
  const f = fixture(t),
    server = await httpFixture(t);
  const id = f.add({ enabled: true, url: server.url });
  await assert.rejects(() => f.service.inspectTools(external, { serverId: id }), {
    code: 'API_DISABLED',
  });
  assert.equal(server.received.length, 0);
  f.manage(true);
  const list = await f.service.inspectTools(external, { serverId: id });
  assert(list.items.some((i) => i.name === 'echo'));
  const { tool } = await f.service.inspectTools(external, { serverId: id, name: 'echo' });
  assert(tool.inputSchema);
  await assert.rejects(() => f.service.tool(external, { serverId: id, name: 'echo' }), {
    code: 'NOT_FOUND',
  });
  await assert.rejects(() => f.service.start({ ...external, management: true }, {}), {
    code: 'API_DISABLED',
  });
  assert.equal(server.state.count, 0);
  let release,
    entered = false;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  server.state.beforeList = async () => {
    entered = true;
    await gate;
  };
  const pending = f.service.inspectTools(external, { serverId: id, refresh: true });
  await until(() => entered);
  f.manage(false);
  release();
  await assert.rejects(() => pending, { code: 'API_DISABLED' });
  assert.equal(server.state.count, 0);
});
test('MCP roster, local binding, encryption and atomic revisions do not share endpoints or secrets', async (t) => {
  const f = fixture(t),
    id = f.add(
      { enabled: true, url: 'http://127.0.0.1:9876/mcp', authentication: 'bearer' },
      { token: 'secret-value' },
    );
  const shared = fs.readFileSync(f.store.file, 'utf8');
  assert(!shared.includes('secret-value'));
  assert(!shared.includes('9876'));
  assert(!fs.readFileSync(path.join(f.dir, 'mcp-client.json'), 'utf8').includes('secret-value'));
  const revision = f.settings.revision();
  assert.throws(
    () =>
      f.settings.update({
        op: 'save',
        expectedRevision: revision,
        item: f.settings.roster()[0],
        connection: { ...f.settings.connection(id), url: 'http://127.0.0.1:9877/mcp' },
      }),
    /再入力/,
  );
  assert.equal(f.settings.revision(), revision);
  assert.throws(
    () => f.settings.update({ op: 'enabled', id, enabled: false, expectedRevision: 'stale' }),
    /変更/,
  );
  assert.throws(() =>
    parseMcpRoster({ version: 1, items: [{ id, name: 'x', description: '', url: 'secret' }] }),
  );
  assert.throws(() => f.add({ transport: 'stdio', command: 'cmd.exe' }));
  const before = f.settings.revision(),
    save = f.store.save.bind(f.store);
  f.store.save = () => {
    throw Error('disk');
  };
  assert.throws(
    () => f.settings.update({ op: 'enabled', id, enabled: false, expectedRevision: before }),
    (e) => e.code === 'SAVE_FAILED' && !e.message.includes('disk'),
  );
  f.store.save = save;
  assert.equal(f.settings.revision(), before);
  const identity = f.settings.identity(id),
    encrypted = JSON.parse(fs.readFileSync(path.join(f.dir, 'mcp-client.json'), 'utf8')).entries[id]
      .secret;
  f.settings.update({
    op: 'save',
    expectedRevision: f.settings.revision(),
    item: { ...f.settings.roster()[0], name: 'Renamed' },
    connection: f.settings.connection(id),
  });
  assert.equal(f.settings.identity(id), identity);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.dir, 'mcp-client.json'), 'utf8')).entries[id].secret,
    encrypted,
  );
  f.settings.update({
    op: 'save',
    expectedRevision: f.settings.revision(),
    item: f.settings.roster()[0],
    connection: f.settings.connection(id),
    token: 'changed-secret',
  });
  assert.notEqual(f.settings.identity(id), identity);
});
test('MCP admits independent concurrent calls on one connection and retained results do not block later calls', async (t) => {
  const server = await httpFixture(t),
    f = fixture(t),
    id = f.add({ enabled: true, url: server.url });
  const { tool } = await f.service.tool(applet, { serverId: id, name: 'delay' });
  const request = {
    serverId: id,
    name: 'delay',
    arguments: { delay: 400 },
    toolRevision: tool.toolRevision,
  };
  const params = Array.from({ length: 12 }, () => ({ ...request, requestId: randomUUID() }));
  const jobs = await Promise.all(params.map((p) => f.service.start(applet, p)));
  assert.equal(new Set(jobs.map((j) => j.jobId)).size, 12);
  assert.equal((await f.service.start(applet, params[0])).jobId, jobs[0].jobId);
  f.service.cancel(applet, jobs[0].jobId);
  const results = await Promise.all(
    jobs.slice(1).map((job) =>
      until(() => {
        const result = f.service.get(applet, job.jobId);
        return result.state !== 'running' && result;
      }),
    ),
  );
  assert(results.every((r) => r.state === 'succeeded'));
  assert.equal(f.service.get(applet, jobs[0].jobId).state, 'cancelled');
  const echo = (await f.service.tool(applet, { serverId: id, name: 'echo' })).tool;
  const more = await Promise.all(
    Array.from({ length: 66 }, () =>
      f.service.start(applet, {
        serverId: id,
        name: 'echo',
        arguments: { message: 'parallel' },
        toolRevision: echo.toolRevision,
        requestId: randomUUID(),
      }),
    ),
  );
  await Promise.all(
    more.map((job) => until(() => f.service.get(applet, job.jobId).state === 'succeeded')),
  );
  assert.equal(
    (await call(f, applet, id, 'echo', { message: 'after retained jobs' })).state,
    'succeeded',
  );
});

test('stdio uses a real process, paginated tools and encrypted environment; errors and cancellation are distinct', async (t) => {
  const f = fixture(t),
    cancelFile = path.join(f.dir, 'cancelled'),
    startedFile = path.join(f.dir, 'started'),
    id = f.add(
      {
        enabled: true,
        transport: 'stdio',
        command: process.execPath,
        args: [path.resolve(__dirname, 'fixtures/mcp-server.cjs')],
      },
      {
        environment: {
          MCP_FIXTURE_SECRET: 'test',
          MCP_FIXTURE_CANCEL_FILE: cancelFile,
          MCP_FIXTURE_STARTED_FILE: startedFile,
        },
      },
    );
  const listed = await f.service.tools(applet, { serverId: id, limit: 2 });
  assert.equal(listed.items.length, 2);
  assert(listed.nextCursor);
  assert(!('inputSchema' in listed.items[0]));
  const result = await call(f, applet, id, 'echo', { message: 'hello' });
  assert.equal(result.result.structuredContent.message, 'hello');
  assert.equal(result.result.structuredContent.environment, true);
  assert.equal(result.effectVerified, false);
  assert.equal((await call(f, applet, id, 'fail')).state, 'tool-error');
  assert.equal((await call(f, applet, id, 'image')).result.content[0].type, 'image');
  assert.equal((await call(f, applet, id, 'annotated')).result.structuredContent.result, 'wrapped');
  const { tool } = await f.service.tool(applet, { serverId: id, name: 'delay' });
  const p = {
    serverId: id,
    name: 'delay',
    arguments: { delay: 3000 },
    toolRevision: tool.toolRevision,
    requestId: randomUUID(),
  };
  const [a, b] = await Promise.all([f.service.start(applet, p), f.service.start(applet, p)]);
  assert.equal(a.jobId, b.jobId);
  await until(() => fs.existsSync(startedFile));
  assert.equal(f.service.cancel(applet, a.jobId).state, 'cancelled');
  await until(() => fs.existsSync(cancelFile));
  assert.throws(
    () => f.service.get(external, a.jobId),
    (e) => e.code === 'NOT_FOUND',
  );
  assert.equal(f.failures.length, 1);
});
for (const json of [true, false])
  test(`HTTP ${json ? 'JSON' : 'SSE'} validates Bearer, dynamic schemas, results and caller scope`, async (t) => {
    const server = await httpFixture(t, { json, bearer: 'downstream-only' }),
      f = fixture(t),
      id = f.add(
        {
          enabled: true,
          url: server.url,
          authentication: 'bearer',
          published: true,
          publishedTools: ['echo', 'image', 'delay', 'schedule_off'],
        },
        { token: 'downstream-only' },
      );
    assert.equal(f.service.servers(external).items.length, 1);
    assert.deepEqual(
      (await f.service.tools(external, { serverId: id, limit: 50 })).items.map((v) => v.name),
      ['echo', 'delay', 'image', 'schedule_off'],
    );
    await assert.rejects(
      f.service.tool(external, { serverId: id, name: 'fail' }),
      (e) => e.code === 'NOT_FOUND',
    );
    const old = (await f.service.tool(host, { serverId: id, name: 'echo' })).tool;
    const p = {
      serverId: id,
      name: 'echo',
      arguments: { message: 'payload' },
      toolRevision: old.toolRevision,
      requestId: randomUUID(),
    };
    const result = await f.service.start(external, p);
    await until(() => f.service.get(external, result.jobId).state === 'succeeded');
    assert.equal((await f.service.start(external, p)).jobId, result.jobId);
    assert.equal(server.state.count, 1);
    await assert.rejects(
      f.service.start(external, { ...p, arguments: { message: 'other' } }),
      (e) => e.code === 'REQUEST_CONFLICT',
    );
    assert.throws(
      () => f.service.get(applet, result.jobId),
      (e) => e.code === 'NOT_FOUND',
    );
    await call(f, host, id, 'change_catalog');
    await assert.rejects(
      f.service.start(host, { ...p, requestId: randomUUID() }),
      (e) => e.code === 'SCHEMA_CHANGED',
    );
    assert(
      (await f.service.tools(host, { serverId: id, refresh: true, limit: 50 })).items.some(
        (v) => v.name === 'added',
      ),
    );
    const unsupported = (await f.service.tool(host, { serverId: id, name: 'unsupported' })).tool;
    assert(unsupported.unsupportedReason);
    await assert.rejects(
      f.service.start(host, {
        serverId: id,
        name: 'unsupported',
        arguments: {},
        toolRevision: unsupported.toolRevision,
        requestId: randomUUID(),
      }),
      (e) => e.code === 'UNSUPPORTED_SCHEMA',
    );
    assert.equal(
      (await call(f, external, id, 'schedule_off', { seconds: 600 })).result.structuredContent
        .scheduledSeconds,
      600,
    );
    assert(server.received.every((r) => r.authorization === 'Bearer downstream-only'));
    f.revoke();
    assert.throws(
      () => f.service.get(external, result.jobId),
      (e) => e.code === 'API_DISABLED',
    );
  });
test('timeout is outcome unknown without retry, revocation removes results, and connection edits invalidate revisions', async (t) => {
  const server = await httpFixture(t),
    f = fixture(t),
    id = f.add({ enabled: true, url: server.url });
  const result = await call(f, applet, id, 'delay', { delay: 4000 }, { timeoutMs: 1000 });
  assert.equal(result.state, 'outcome-unknown');
  assert.equal(server.state.count, 1);
  const tool = (await f.service.tool(applet, { serverId: id, name: 'echo' })).tool;
  f.settings.update({
    op: 'save',
    expectedRevision: f.settings.revision(),
    item: f.settings.roster()[0],
    connection: { ...f.settings.connection(id), published: true },
  });
  await assert.rejects(
    f.service.start(applet, {
      serverId: id,
      name: 'echo',
      arguments: {},
      toolRevision: tool.toolRevision,
      requestId: randomUUID(),
    }),
    (e) => e.code === 'SCHEMA_CHANGED',
  );
});
test('invalid output and oversized results are never success; auth failures and AppDock loops are rejected', async (t) => {
  const f = fixture(t),
    server = await httpFixture(t),
    id = f.add({ enabled: true, url: server.url });
  assert.equal((await call(f, host, id, 'invalid_output')).error.code, 'INVALID_RESULT');
  assert.equal((await call(f, host, id, 'oversized')).state, 'outcome-unknown');
  const secured = await httpFixture(t, { bearer: 'test-secret' }),
    secureId = f.add({ enabled: true, url: secured.url });
  await assert.rejects(
    f.service.tools(host, { serverId: secureId }),
    (e) => e.code === 'AUTH_REQUIRED',
  );
  assert.equal(f.service.statuses().find((s) => s.id === secureId).state, 'error');
  const loop = await httpFixture(t);
  loop.state.serverName = 'AppDock';
  const loopId = f.add({ enabled: true, url: loop.url });
  await assert.rejects(f.service.tools(host, { serverId: loopId }), (e) => e.code === 'HUB_CYCLE');
});
test('HTTP redirects never forward the downstream credential', async (t) => {
  let calls = 0;
  const target = http.createServer((req, res) => {
    calls++;
    res.end('{}');
  });
  await new Promise((r) => target.listen(0, '127.0.0.1', r));
  const redirect = http.createServer((req, res) => {
    res.writeHead(307, { Location: `http://127.0.0.1:${target.address().port}/other` });
    res.end();
  });
  await new Promise((r) => redirect.listen(0, '127.0.0.1', r));
  t.after(async () => {
    for (const s of [redirect, target]) {
      s.closeAllConnections();
      await new Promise((r) => s.close(r));
    }
  });
  const f = fixture(t),
    id = f.add(
      {
        enabled: true,
        url: `http://127.0.0.1:${redirect.address().port}/mcp`,
        authentication: 'bearer',
      },
      { token: 'secret' },
    );
  await assert.rejects(f.service.tools(host, { serverId: id }));
  assert.equal(calls, 0);
});

test('saved MCP commands validate without execution, retain identity, and detach accepted job lifetime', async (t) => {
  const remote = await httpFixture(t),
    f = fixture(t),
    serverId = f.add({
      enabled: true,
      url: remote.url,
      published: true,
      publishedTools: ['delay'],
    });
  const settingsCommands = new SettingsCommands({
    settings: f.store,
    applets: () => [],
    save: (v, r) => f.store.save(v, r),
  });
  const service = new CustomCommandService({
    settings: f.store,
    settingsCommands,
    providers: () => [],
    save: (v, r) => f.store.save(v, r),
  });
  service.registerHost(
    mcpCommandType,
    async (config, context) => {
      const job = await f.service.start(
        external,
        {
          serverId: config.serverId,
          name: config.toolName,
          arguments: config.arguments,
          toolRevision: config.toolRevision,
          requestId: randomUUID(),
        },
        context.signal,
        true,
      );
      return { completion: 'accepted', jobId: job.jobId };
    },
    {
      validateConfig: (c) => f.service.commandValidation(c),
      unavailableReason: (c) => f.service.commandUnavailable(c),
    },
  );
  const tool = (await f.service.tool(host, { serverId, name: 'delay' })).tool;
  const config = {
    serverId,
    toolName: 'delay',
    toolRevision: tool.toolRevision,
    arguments: { delay: 150 },
  };
  const id = randomUUID(),
    type = service.descriptors()[0];
  const operations = [
    {
      op: 'add',
      expectedTypeRevision: type.typeRevision,
      item: {
        id,
        typeId: type.id,
        title: 'Saved MCP',
        enabled: true,
        automation: true,
        configVersion: 1,
        config,
      },
    },
  ];
  const before = fs.readFileSync(path.join(f.dir, 'settings.json'), 'utf8');
  service.update({ expectedRevision: settingsCommands.revision(), operations, dryRun: true });
  assert.equal(fs.readFileSync(path.join(f.dir, 'settings.json'), 'utf8'), before);
  assert.equal(remote.state.count, 0);
  service.update({ expectedRevision: settingsCommands.revision(), operations });
  assert.equal(remote.state.count, 0);
  const accepted = await service.execute('appdock.custom.' + id, { origin: { kind: 'mcp' } });
  assert.equal(accepted.result.completion, 'accepted');
  const completed = await until(() => {
    const j = f.service.get(external, accepted.result.jobId);
    return j.state !== 'running' && j;
  });
  assert.equal(completed.state, 'succeeded');
  assert.equal(remote.state.count, 1);
  service.update({
    expectedRevision: settingsCommands.revision(),
    operations: [{ op: 'update', id, changes: { title: 'Renamed' } }],
  });
  assert.equal(service.summaries()[0].commandId, 'appdock.custom.' + id);
  assert.match(f.service.commandValidation({ ...config, arguments: { delay: 'bad' } }), /Schema/);
  assert.match(f.service.commandValidation({ ...config, toolRevision: '0'.repeat(64) }), /再取得/);
  f.settings.update({
    op: 'enabled',
    id: serverId,
    enabled: false,
    expectedRevision: f.settings.revision(),
  });
  assert.match(f.service.commandUnavailable(config), /OFF/);
  await assert.rejects(
    service.execute('appdock.custom.' + id),
    (e) => e.code === 'TYPE_UNAVAILABLE',
  );
  assert.equal(remote.state.count, 1);
});

test('saved MCP acceptance checks cancellation and external publication before sending', async (t) => {
  const remote = await httpFixture(t),
    f = fixture(t),
    id = f.add({ enabled: true, url: remote.url });
  const tool = (await f.service.tool(host, { serverId: id, name: 'echo' })).tool;
  const params = {
    serverId: id,
    name: 'echo',
    toolRevision: tool.toolRevision,
    arguments: {},
    requestId: randomUUID(),
  };
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    f.service.start(host, params, controller.signal, true),
    (e) => e.code === 'CANCELLED',
  );
  assert.throws(
    () => f.service.start(external, params, undefined, true),
    (e) => e.code === 'NOT_FOUND',
  );
  assert.equal(remote.state.count, 0);
});

test('the shared API can discover and execute a 128-character downstream tool name', async (t) => {
  const remote = await httpFixture(t),
    f = fixture(t);
  const name = (remote.state.longTool = 't'.repeat(128));
  const id = f.add({ enabled: true, url: remote.url, published: true, publishedTools: [name] });
  const { AppDockApi } = require('../out/main/main/core/appdock-api');
  const api = new AppDockApi({
    settings: f.store,
    applets: () => [],
    commands: () => [],
    execute: async () => {},
    save: (v, r) => f.store.save(v, r),
    ready: () => true,
    version: 'test',
    instanceId: 'test',
    executable: () => true,
    writable: () => true,
    mcpClientAllowed: () => true,
    handlers: {
      'mcp.tools.get': (p) => f.service.tool(external, p),
      'mcp.tools.call': (p) => f.service.start(external, p),
    },
  });
  const { tool } = await api.call('mcp.tools.get', { serverId: id, name });
  const accepted = await api.call('mcp.tools.call', {
    serverId: id,
    name,
    toolRevision: tool.toolRevision,
    arguments: { message: 'long-name' },
    requestId: randomUUID(),
  });
  const result = await until(() => {
    const j = f.service.get(external, accepted.jobId);
    return j.state !== 'running' && j;
  });
  assert.equal(result.state, 'succeeded');
  assert.equal(result.result.structuredContent.message, 'long-name');
});

test('damaged local MCP settings remain intact and expose a read-only health error', (t) => {
  const f = fixture(t),
    file = path.join(f.dir, 'mcp-client.json');
  f.add({ url: 'http://127.0.0.1:9876/mcp' });
  fs.writeFileSync(file, '{invalid');
  assert.equal(f.settings.health().revision, '');
  assert.match(f.settings.health().error, /読み取り専用/);
  assert.throws(() => f.settings.update({ op: 'remove', id: randomUUID(), expectedRevision: '' }));
  assert.equal(fs.readFileSync(file, 'utf8'), '{invalid');
  assert.equal(f.settings.statuses()[0].state, 'error');
  assert.equal(f.service.needsConfigurationAttention(), true);
});

test('shared-only and OFF connections need no warning, including unreadable OFF credentials', (t) => {
  const f = fixture(t),
    id = f.add({ url: 'http://127.0.0.1:9876/mcp', authentication: 'bearer' }, { token: 'secret' }),
    sharedId = randomUUID();
  f.store.save(
    {
      ...f.store.value,
      mcpServers: {
        version: 1,
        items: [...f.settings.roster(), { id: sharedId, name: 'Other PC', description: '' }],
      },
    },
    f.store.revision,
  );
  const file = path.join(f.dir, 'mcp-client.json'),
    local = JSON.parse(fs.readFileSync(file));
  local.entries[id].secret = 'damaged-credential';
  fs.writeFileSync(file, JSON.stringify(local));
  assert.equal(f.settings.statuses().find((s) => s.id === sharedId).state, 'unconfigured');
  assert.equal(f.settings.statuses().find((s) => s.id === id).state, 'disabled');
  assert.equal(f.service.needsConfigurationAttention(), false);
  f.settings.update({ op: 'enabled', id, enabled: true, expectedRevision: f.settings.revision() });
  assert.equal(f.settings.statuses().find((s) => s.id === id).connection.enabled, true);
  assert.equal(f.service.needsConfigurationAttention(), true);
});

test('one malformed local entry does not block healthy edits, reorder or explicit repair', async (t) => {
  const f = fixture(t),
    remote = await httpFixture(t),
    badId = f.add({ url: 'http://127.0.0.1:9876/mcp' }),
    goodId = f.add({ url: remote.url }),
    file = path.join(f.dir, 'mcp-client.json'),
    local = JSON.parse(fs.readFileSync(file));
  const broken = { connection: { enabled: false, url: 'damaged' }, secret: 'keep-exactly' };
  local.entries[badId] = broken;
  fs.writeFileSync(file, JSON.stringify(local));
  assert.equal(f.settings.health().error, undefined);
  assert.equal(f.settings.statuses().find((s) => s.id === badId).connection, undefined);
  assert.equal(f.service.needsConfigurationAttention(), false);
  const enabled = await f.service.updateForSettings(host, {
    op: 'enabled',
    id: goodId,
    enabled: true,
    expectedRevision: f.settings.revision(),
  });
  assert.equal(enabled.warning, undefined);
  assert.equal(f.service.statuses().find((s) => s.id === goodId).state, 'connected');
  f.settings.update({
    op: 'reorder',
    ids: [goodId, badId],
    expectedRevision: f.settings.revision(),
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(file)).entries[badId], broken);
  broken.connection.enabled = true;
  const edited = JSON.parse(fs.readFileSync(file));
  edited.entries[badId] = broken;
  fs.writeFileSync(file, JSON.stringify(edited));
  assert.equal(f.service.needsConfigurationAttention(), true);
  f.settings.update({
    op: 'save',
    item: { ...f.settings.roster().find((s) => s.id === goodId), name: 'Healthy rename' },
    connection: f.settings.connection(goodId),
    expectedRevision: f.settings.revision(),
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(file)).entries[badId], broken);
  f.settings.update({
    op: 'save',
    item: f.settings.roster().find((s) => s.id === badId),
    connection: { ...defaultMcpConnection(), url: remote.url },
    expectedRevision: f.settings.revision(),
  });
  assert.equal(f.settings.statuses().find((s) => s.id === badId).state, 'disabled');
});

test('UI activation checks the server and returns a warning with OFF persisted on failure', async (t) => {
  const f = fixture(t),
    remote = await httpFixture(t),
    id = f.add({ url: remote.url });
  const activate = () =>
    f.service.updateForSettings(host, {
      op: 'enabled',
      id,
      enabled: true,
      expectedRevision: f.settings.revision(),
    });
  assert.equal((await activate()).warning, undefined);
  assert.equal(f.settings.connection(id).enabled, true);
  assert.equal(f.service.statuses().find((s) => s.id === id).state, 'connected');
  f.settings.update({ op: 'enabled', id, enabled: false, expectedRevision: f.settings.revision() });
  const beforeShared = fs.readFileSync(f.store.file, 'utf8');
  f.service.options.fetcher = async () => {
    throw Error('private-network-detail');
  };
  const result = await activate();
  assert.equal(result.saved, true);
  assert.equal(result.warning.code, 'CONNECTION_FAILED');
  assert(!result.warning.message.includes('private-network-detail'));
  assert.equal(f.settings.connection(id).enabled, false);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.dir, 'mcp-client.json'))).entries[id].connection.enabled,
    false,
  );
  assert.equal(fs.readFileSync(f.store.file, 'utf8'), beforeShared);
  assert.equal(f.service.needsConfigurationAttention(), false);
  assert.deepEqual(f.failures, []);
});

test('UI save with ON checks authentication and keeps the saved connection OFF after failure', async (t) => {
  const f = fixture(t),
    remote = await httpFixture(t, { bearer: 'required' }),
    id = randomUUID();
  const result = await f.service.updateForSettings(host, {
    op: 'save',
    expectedRevision: f.settings.revision(),
    item: { id, name: 'New server', description: '' },
    connection: { ...defaultMcpConnection(), enabled: true, url: remote.url },
  });
  assert.equal(result.warning.code, 'AUTH_REQUIRED');
  assert.equal(f.settings.connection(id).enabled, false);
  assert.equal(f.settings.roster()[0].id, id);
  assert.deepEqual(f.failures, []);
});

test('UI connection inspection returns warning data without reporting a processing error', async (t) => {
  const f = fixture(t),
    id = f.add({ enabled: true, url: 'http://127.0.0.1:9876/mcp' });
  f.service.options.fetcher = async () => {
    throw Error('private-connection');
  };
  const result = await f.service.inspectForSettings(host, { serverId: id });
  assert.equal(result.warning.code, 'CONNECTION_FAILED');
  assert.equal(result.result, undefined);
  assert.deepEqual(f.failures, []);
});

test('temporary ON during UI activation does not publish persistent configuration warnings', async (t) => {
  const f = fixture(t),
    id = f.add({ url: 'http://127.0.0.1:9876/mcp', authentication: 'bearer' }, { token: 'secret' }),
    file = path.join(f.dir, 'mcp-client.json'),
    local = JSON.parse(fs.readFileSync(file));
  local.entries[id].secret = 'unreadable';
  fs.writeFileSync(file, JSON.stringify(local));
  const attention = [];
  f.settings.changed = () => {
    f.service.reconcile();
    attention.push(f.service.needsConfigurationAttention());
  };
  const result = await f.service.updateForSettings(host, {
    op: 'enabled',
    id,
    enabled: true,
    expectedRevision: f.settings.revision(),
  });
  assert(result.warning);
  assert.deepEqual(attention, [false, false]);
  assert.equal(f.settings.connection(id).enabled, false);
  assert.equal(f.service.needsConfigurationAttention(), false);
});

test('activation failure does not overwrite a concurrent replacement connection', async (t) => {
  const f = fixture(t),
    id = f.add({ url: 'http://127.0.0.1:9876/mcp' });
  f.service.options.fetcher = async () => {
    f.settings.update({
      op: 'save',
      expectedRevision: f.settings.revision(),
      item: f.settings.roster()[0],
      connection: { ...f.settings.connection(id), url: 'http://127.0.0.1:9877/mcp' },
    });
    throw Error('old connection failed');
  };
  const result = await f.service.updateForSettings(host, {
    op: 'enabled',
    id,
    enabled: true,
    expectedRevision: f.settings.revision(),
  });
  assert.equal(result.warning, undefined);
  assert.equal(f.settings.connection(id).enabled, true);
  assert.equal(f.settings.connection(id).url, 'http://127.0.0.1:9877/mcp');
});
