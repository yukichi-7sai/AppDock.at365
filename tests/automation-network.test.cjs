const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { once } = require('node:events');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {
  networkHostnames,
  networkAddresses,
  networkEndpointAddresses,
  validMcpHeaders,
} = require('../out/main/main/core/automation-network');
const { AutomationService } = require('../out/main/main/core/automation');
const { AutomationMcp } = require('../out/main/main/core/automation-mcp');
const { AutomationError } = require('../out/main/main/core/automation-api');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const {
  changeRegistration,
  registrationBlock,
} = require('../out/main/main/core/codex-registration');
const { parse } = require('smol-toml');
const root = path.resolve(__dirname, '../.artifacts/automation-network-unit');

function headers(host, origin) {
  return {
    headers: { host, ...(origin === undefined ? {} : { origin }) },
    rawHeaders: ['Host', host, ...(origin === undefined ? [] : ['Origin', origin])],
  };
}

test('network names, addresses and strict authority/origin validation', () => {
  assert.deepEqual(networkHostnames(['DOCK.Example.', 'dock.example']), ['dock.example']);
  for (const value of [
    null,
    'dock',
    [null],
    [''],
    ['*.example'],
    ['https://dock'],
    ['dock:1234'],
    ['127.0.0.1'],
    ['2130706433'],
    ['0x7f000001'],
    ['0177.0.0.1'],
    ['a..b'],
    ['-abc'],
    ['abc-'],
    ['a'.repeat(64)],
  ])
    assert.throws(() => networkHostnames(value));
  assert.deepEqual(networkHostnames(Array(1000).fill('dock')), ['dock']);
  const addresses = ['192.168.1.2', '100.100.1.2'];
  const check = (req, scope = 'network', names = ['dock.example']) =>
    validMcpHeaders(req, 34567, scope, names, addresses, 'DOCK');
  for (const name of ['127.0.0.1', ...addresses, 'dock', 'DOCK.EXAMPLE.']) {
    assert(check(headers(`${name}:34567`)), name);
    assert(check(headers(`${name}:34567`, `http://${name}:34567`)), name);
  }
  for (const name of [
    'evil.example',
    '192.168.1.3',
    '0.0.0.0',
    '2130706433',
    '0x7f000001',
    '127.1',
    '[::1]',
    'user@dock',
    'dock/path',
    'dock?x',
    'dock#x',
    ' dock',
    'dock\n',
  ])
    assert.equal(check(headers(`${name}:34567`)), false, name);
  for (const value of ['dock', 'dock:0', 'dock:034567', 'dock:65536', 'dock:34568'])
    assert.equal(check(headers(value)), false);
  for (const origin of [
    '',
    'null',
    'https://dock:34567',
    'http://evil.example:34567',
    'http://dock:34567/',
    'http://dock:34567?x',
    'http://dock:34567#x',
    'http://user@dock:34567',
  ])
    assert.equal(check(headers('dock:34567', origin)), false, origin);
  for (const duplicate of ['Host', 'Origin', 'Authorization']) {
    const req = headers('dock:34567', 'http://dock:34567');
    req.rawHeaders.push('Authorization', 'Bearer test', duplicate, 'test');
    assert.equal(check(req), false, duplicate);
  }
  assert(check(headers('127.0.0.1:34567'), 'local'));
  assert.equal(check(headers('dock:34567'), 'local'), false);
  assert.equal(check(headers('127.0.0.1:34567', 'http://dock:34567'), 'local'), false);
  const nic = (address, internal = false) => ({ address, family: 'IPv4', internal });
  assert.deepEqual(
    networkAddresses({
      nic: [
        nic('192.168.1.2'),
        nic('192.168.1.2'),
        nic('127.0.0.1', true),
        nic('0.0.0.0'),
        nic('169.254.1.2'),
        nic('224.0.0.1'),
      ],
    }),
    ['192.168.1.2'],
  );
  assert.equal(check(headers('dock.example:34567'), 'network', []), false);
  assert.equal(
    validMcpHeaders(headers('192.168.1.2:34567'), 34567, 'network', [], [], 'dock'),
    false,
  );
});

test('connection suggestions hide only the default Hyper-V switch, while Host validation retains it', () => {
  const nic = (address) => ({ address, family: 'IPv4', internal: false });
  const interfaces = {
    Tailscale: [nic('100.81.209.22')],
    'vEthernet (外部ネットワーク)': [nic('192.168.2.4')],
    'vEthernet (Default Switch)': [nic('192.168.192.1')],
    Ethernet: [nic('10.0.0.1')],
  };
  assert.deepEqual(networkEndpointAddresses(interfaces), [
    '10.0.0.1',
    '100.81.209.22',
    '192.168.2.4',
  ]);
  assert(networkAddresses(interfaces).includes('192.168.192.1'));
  assert(
    validMcpHeaders(
      headers('192.168.192.1:34567'),
      34567,
      'network',
      [],
      networkAddresses(interfaces),
      'dock',
    ),
  );
});

function fixture(t) {
  fs.mkdirSync(root, { recursive: true });
  const base = fs.mkdtempSync(path.join(root, 'case-'));
  const failures = [],
    audit = [];
  const settings = new DeviceSettingsStore(
    path.join(base, 'data', 'settings.json'),
    path.join(base, 'local'),
    'TEST-DEVICE',
  );
  settings.load();
  t.after(() => settings.close());
  let copied,
    apiCount = 0,
    revoked = 0,
    executions = 0;
  const options = {
    localDirectory: path.join(base, 'local'),
    baseDirectory: base,
    settings,
    version: 'test',
    encrypt: (s) => Buffer.from(s).toString('base64'),
    decrypt: (s) => Buffer.from(s, 'base64').toString(),
    changed() {},
    mcpServer: {
      read: () => settings.readMcpServer(),
      save: (next, previous) => settings.saveMcpServer(next, previous),
    },
    failed: (code, message) => failures.push({ code, message }),
    audit: (level, message) => audit.push({ level, message }),
    writeClipboard: (s) => {
      copied = s;
    },
    authorizationChanged: () => {
      revoked++;
    },
    createApi: (writable, id, executable) => {
      apiCount++;
      return {
        auditTarget: () => undefined,
        call: async (method) => {
          if (method === 'commands.execute') {
            if (!executable()) throw new AutomationError('EXECUTION_DISABLED', 'disabled');
            executions++;
            return { completion: 'accepted' };
          }
          return { instanceId: id, writable: writable(), executable: executable() };
        },
      };
    },
  };
  const service = new AutomationService(options);
  t.after(() => service.close());
  const file = path.join(options.localDirectory, 'automation.json');
  const read = () => JSON.parse(fs.readFileSync(file));
  return {
    service,
    options,
    file,
    base,
    failures,
    audit,
    read,
    deviceFile: settings.device.file,
    readServer: () => JSON.parse(fs.readFileSync(settings.device.file)).mcpServer,
    copied: () => copied,
    counts: () => ({ apiCount, revoked, executions }),
  };
}
async function request(
  endpoint,
  authorization,
  extra = {},
  body = { jsonrpc: '2.0', id: 1, method: 'ping' },
) {
  const url = new URL(endpoint);
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: 'POST',
        agent: false,
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...extra,
        },
      },
      (res) => {
        let text = '';
        res.on('data', (s) => (text += s));
        res.on('end', () => resolve({ status: res.statusCode, text }));
      },
    );
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(Error('timeout')));
    req.end(JSON.stringify(body));
  });
}
async function connect(endpoint, authorization) {
  const client = new Client({ name: 'network-regression', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: authorization } },
    }),
  );
  return client;
}

test('version 1 retains the external port and token and repairs Codex onto an independent loopback receiver', async (t) => {
  const f = fixture(t);
  const device = f.options.settings.device;
  device.save(
    { ...device.value, generationAi: { version: 1, notificationConnectionId: 'device-voice' } },
    device.revision,
  );
  const generation = structuredClone(device.value.generationAi);
  const configFile = path.join(f.base, 'codex', 'config.toml');
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  const unrelated = '# unrelated\n[mcp_servers.other]\nurl = "http://other.test/mcp"\n';
  fs.writeFileSync(configFile, unrelated);
  const reservation = net.createServer();
  await new Promise((resolve, reject) =>
    reservation.once('error', reject).listen(0, '127.0.0.1', resolve),
  );
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const endpoint = 'http://127.0.0.1:' + port + '/mcp';
  const externalToken = 'a'.repeat(64);
  const oldBlock = registrationBlock(f.service.id, endpoint, externalToken);
  const hash = changeRegistration(configFile, f.service.id, oldBlock);
  const oldToml = fs.readFileSync(configFile, 'utf8');
  const legacy = {
    version: 1,
    enabled: true,
    port,
    connectionScope: 'network',
    networkHostnames: ['dock.example'],
    allowWrite: true,
    token: f.options.encrypt(externalToken),
    configFile,
    owned: { [configFile]: hash },
  };
  fs.writeFileSync(f.file, JSON.stringify(legacy));

  const service = new AutomationService(f.options);
  t.after(() => service.close());
  await service.initialize();
  const state = service.state();
  assert.equal(state.running, true);
  assert.equal(state.endpoint, endpoint);
  assert.equal(state.codex.running, true);
  assert.notEqual(state.codex.port, port);
  assert.equal(new URL(state.codex.endpoint).hostname, '127.0.0.1');
  assert.deepEqual(f.readServer(), {
    enabled: true,
    port,
    connectionScope: 'network',
    networkHostnames: ['dock.example'],
  });
  const saved = f.read();
  assert.equal(saved.version, 2);
  assert.equal(saved.token, legacy.token);
  assert.equal(saved.codex.port, state.codex.port);
  assert(!fs.readFileSync(f.deviceFile, 'utf8').includes(legacy.token));
  assert(!Object.hasOwn(saved, 'connectionScope'));
  const externalAuth = 'Bearer ' + externalToken;
  const localAuth = 'Bearer ' + f.options.decrypt(saved.codex.token);
  assert.notEqual(localAuth, externalAuth);
  assert.equal(state.codex.registration, 'conflict');
  assert.equal(fs.readFileSync(configFile, 'utf8'), oldToml);
  await service.action({ kind: 'register' });
  const repaired = fs.readFileSync(configFile, 'utf8');
  assert(repaired.startsWith(unrelated));
  assert.equal(parse(repaired).mcp_servers.AppDock.url, state.codex.endpoint);
  assert.equal(parse(repaired).mcp_servers.AppDock.http_headers.Authorization, localAuth);
  assert.equal(state.allowWrite, false, 'ignore permissions previously stored in LocalAppData');
  assert(!Object.hasOwn(saved, 'allowWrite'));
  const registeredConfig = fs.readFileSync(f.file);
  await service.action({ kind: 'setWrite', allowed: true });
  assert.equal(f.options.settings.operationPermissions().mcp.allowWrite, true);
  assert(
    fs.readFileSync(f.file).equals(registeredConfig),
    'permission save changed connection settings',
  );
  assert.equal(f.readServer().port, port);
  const external = await connect(endpoint, externalAuth);
  t.after(() => external.close());
  const codex = await connect(state.codex.endpoint, localAuth);
  t.after(() => codex.close());
  const info = (client) => client.callTool({ name: 'appdock_get_info', arguments: {} });
  assert.deepEqual((await info(external)).structuredContent, (await info(codex)).structuredContent);
  assert.equal(f.counts().apiCount, 1);
  assert.equal((await request(endpoint, localAuth)).status, 401);
  assert.equal((await request(state.codex.endpoint, externalAuth)).status, 401);
  assert.equal(
    (await request(state.codex.endpoint, localAuth, { Host: 'dock.example:' + state.codex.port }))
      .status,
    403,
  );
  await assert.rejects(
    service.action({ kind: 'configure', receiver: 'codex', enabled: true, port }),
    /異なるポート/,
  );
  await service.action({ kind: 'rotateToken' });
  assert.equal((await request(endpoint, externalAuth)).status, 401);
  assert.equal((await request(state.codex.endpoint, localAuth)).status, 200);
  assert.equal(fs.readFileSync(configFile, 'utf8'), repaired);
  const renewedExternalAuth = 'Bearer ' + f.options.decrypt(f.read().token);
  await service.action({ kind: 'configure', enabled: false, port });
  assert.deepEqual(device.value.generationAi, generation);
  assert.deepEqual(device.value.operationPermissions?.mcp, { allowWrite: true });
  await assert.rejects(request(endpoint, renewedExternalAuth));
  assert.equal((await request(state.codex.endpoint, localAuth)).status, 200);
  assert.equal((await info(codex)).structuredContent.writable, true);

  await service.action({ kind: 'configure', enabled: true, port });
  await service.action({ kind: 'rotateToken', receiver: 'codex' });
  assert.equal((await request(state.codex.endpoint, localAuth)).status, 401);
  assert.equal((await request(endpoint, renewedExternalAuth)).status, 200);
  const renewedLocalAuth = 'Bearer ' + f.options.decrypt(f.read().codex.token);
  await service.close();
  const restarted = new AutomationService(f.options);
  t.after(() => restarted.close());
  await restarted.initialize();
  assert.equal(restarted.state().codex.port, state.codex.port);
  assert.equal((await request(restarted.state().codex.endpoint, renewedLocalAuth)).status, 200);
  assert.equal((await request(endpoint, renewedExternalAuth)).status, 200);
});

test('a migration interrupted after the device save retries without overwriting the device settings or old token', async (t) => {
  const f = fixture(t);
  const legacy = JSON.stringify({
    version: 1,
    enabled: true,
    port: 0,
    connectionScope: 'local',
    allowWrite: false,
    token: f.options.encrypt('b'.repeat(64)),
    configFile: path.join(f.base, 'config.toml'),
    owned: {},
  });
  fs.writeFileSync(f.file, legacy);
  const interrupted = new AutomationService({
    ...f.options,
    encrypt: () => {
      throw Error('fixture encryption failure');
    },
  });
  t.after(() => interrupted.close());
  await interrupted.initialize();
  assert.equal(interrupted.state().running, false);
  assert.equal(interrupted.state().codex.running, false);
  assert.equal(fs.readFileSync(f.file, 'utf8'), legacy);
  const before = f.readServer();
  assert.equal(before.enabled, true);
  f.options.mcpServer.save(
    { ...before, enabled: false, networkHostnames: ['saved.example'] },
    before,
  );
  await interrupted.close();

  const recovered = new AutomationService(f.options);
  t.after(() => recovered.close());
  await recovered.initialize();
  assert.equal(recovered.state().running, false);
  assert.equal(recovered.state().codex.running, true);
  assert.deepEqual(f.readServer().networkHostnames, ['saved.example']);
  assert.equal(f.read().token, JSON.parse(legacy).token);
  assert.equal(f.read().version, 2);
});

test('scope switching preserves credentials, permission state and exact Codex registration; shared SDK API', async (t) => {
  const f = fixture(t),
    service = f.service;
  await service.action({ kind: 'setWrite', allowed: true });
  await service.action({ kind: 'configure', enabled: true, port: 0 });
  await service.action({ kind: 'configure', receiver: 'codex', enabled: true, port: 0 });
  await service.action({ kind: 'selectConfig', file: path.join(f.base, 'codex', 'config.toml') });
  await service.action({ kind: 'register' });
  const configFile = service.state().codex.configFile;
  const original = fs.readFileSync(configFile),
    before = f.read(),
    { endpoint, port } = service.state();
  const token = f.options.decrypt(before.token),
    auth = `Bearer ${token}`;
  assert(
    parse(original.toString()).mcp_servers.AppDock.http_headers.Authorization ===
      'Bearer ' + f.options.decrypt(before.codex.token),
    'a freshly selected Codex port must persist the same credential as its registration',
  );
  let client = await connect(endpoint, auth);
  t.after(() => client.close());
  assert(service.state().lastLocalClientAt);
  await service.action({ kind: 'setNetworkHostnames', hostnames: ['DOCK.EXAMPLE.'] });
  await service.action({ kind: 'setConnectionScope', scope: 'network' });
  assert.equal(service.state().activeConnectionScope, 'network');
  assert.equal(service.state().lastClientAt, undefined);
  await client.close();
  client = await connect(endpoint, auth);
  assert.equal(service.state().endpoint, endpoint);
  assert.deepEqual(fs.readFileSync(configFile), original);
  assert.deepEqual(f.read().codex, before.codex);
  assert.equal(f.read().token, before.token);
  assert.equal(Object.hasOwn(f.read(), 'allowWrite'), false);
  assert.equal(service.state().allowWrite, true);
  assert.equal((await request(endpoint, auth, { Host: `dock.example:${port}` })).status, 200);
  assert.equal(
    (await request(endpoint, 'Bearer wrong', { Host: `dock.example:${port}` })).status,
    401,
  );
  const info = (await client.callTool({ name: 'appdock_get_info', arguments: {} }))
    .structuredContent;
  assert.equal(info.writable, true);
  assert.equal(
    (await client.callTool({ name: 'appdock_execute_command', arguments: { id: 'appdock.open' } }))
      .structuredContent.code,
    'EXECUTION_DISABLED',
  );
  await service.action({ kind: 'setExecution', allowed: true });
  await client.callTool({ name: 'appdock_execute_command', arguments: { id: 'appdock.open' } });
  assert.equal(f.counts().executions, 1);
  const endpoints = service.state().networkEndpoints;
  if (endpoints.length) {
    const remote = await connect(endpoints[0], auth);
    await remote.listTools();
    await remote.close();
    assert(service.state().lastNetworkClientAt);
    await service.action({ kind: 'copyEndpoint', endpoint: endpoints[0] });
    assert.equal(f.copied(), endpoints[0]);
  } else t.diagnostic('No external interface: same-host NIC request not exercised');
  const reply = await service.action({ kind: 'copyToken' });
  assert.equal(f.copied(), token);
  assert(!JSON.stringify(reply).includes(token));
  await assert.rejects(service.action({ kind: 'copyEndpoint', endpoint: 'http://evil.test/' }));
  await service.action({ kind: 'setWrite', allowed: false });
  assert.equal(service.state().connectionScope, 'network');
  await service.action({ kind: 'setConnectionScope', scope: 'local' });
  await client.close();
  client = await connect(endpoint, auth);
  assert.equal((await request(endpoint, auth, { Host: `dock.example:${port}` })).status, 403);
  assert.equal(
    (await client.callTool({ name: 'appdock_get_info', arguments: {} })).structuredContent.writable,
    false,
  );
  assert.deepEqual(fs.readFileSync(configFile), original);
  assert.deepEqual(f.counts(), { apiCount: 1, revoked: 0, executions: 1 });
  if (endpoints.length) await assert.rejects(request(endpoints[0], auth));
  await service.action({ kind: 'rotateToken' });
  assert.equal((await request(endpoint, auth)).status, 401);
  assert(!JSON.stringify([...f.audit, ...f.failures, service.state()]).includes(token));
});

test('restored enabled server reports startup progress and publishes readiness without settings edits', async (t) => {
  const f = fixture(t);
  assert.equal(f.service.state().starting, false);
  await f.service.action({ kind: 'configure', enabled: true, port: 0 });
  await f.service.close();
  const changes = [];
  const restarted = new AutomationService({
    ...f.options,
    changed: () => changes.push(restarted.state()),
  });
  t.after(() => restarted.close());
  assert.equal(restarted.state().starting, true);
  assert.equal(restarted.state().running, false);
  const ready = restarted.initialize();
  assert.equal((await restarted.action({ kind: 'status' })).state.starting, true);
  await assert.rejects(restarted.action({ kind: 'retryStart' }), /処理中/);
  await ready;
  assert.equal(restarted.state().starting, false);
  assert.equal(restarted.state().running, true);
  assert(changes.some((state) => state.starting && !state.running));
  assert(changes.some((state) => !state.starting && state.running));
  assert.equal(f.readServer().enabled, true);
  assert.equal(Object.hasOwn(f.read(), 'allowWrite'), false);
});

test('legacy migration and invalid scope/hostnames fail closed without rewriting files', async (t) => {
  const f = fixture(t);
  const saved = {
    version: 1,
    enabled: false,
    port: 0,
    token: f.options.encrypt('a'.repeat(64)),
    configFile: path.join(f.base, 'config.toml'),
    owned: {},
  };
  fs.writeFileSync(f.file, JSON.stringify(saved));
  const original = fs.readFileSync(f.file);
  const legacy = new AutomationService(f.options);
  assert.equal(legacy.state().connectionScope, 'local');
  assert.deepEqual(fs.readFileSync(f.file), original);
  await legacy.close();
  for (const change of [
    { connectionScope: 'all' },
    { connectionScope: null },
    { networkHostnames: null },
    { networkHostnames: ['*'] },
  ]) {
    fs.writeFileSync(f.file, JSON.stringify({ ...saved, ...change }));
    const before = fs.readFileSync(f.file),
      bad = new AutomationService(f.options);
    await bad.initialize();
    assert(bad.state().error);
    assert.equal(bad.state().running, false);
    assert.equal(bad.state().starting, false);
    assert.equal(bad.state().canCopyToken, false);
    await assert.rejects(bad.action({ kind: 'retryStart' }));
    assert.deepEqual(fs.readFileSync(f.file), before);
    await bad.close();
  }
});

test('startup preparation failure clears progress and permits recovery without leaking its cause', async (t) => {
  const f = fixture(t);
  await f.service.action({ kind: 'configure', enabled: true, port: 0 });
  await f.service.close();
  let fail = true;
  const restarted = new AutomationService({
    ...f.options,
    createApi: (...args) => {
      if (fail) throw Error('PRIVATE_STARTUP_CAUSE');
      return f.options.createApi(...args);
    },
  });
  t.after(() => restarted.close());
  await restarted.initialize();
  assert.equal(restarted.state().starting, false);
  assert.equal(restarted.state().running, false);
  assert(restarted.state().error);
  assert.equal(
    JSON.stringify([restarted.state(), f.failures]).includes('PRIVATE_STARTUP_CAUSE'),
    false,
  );
  fail = false;
  await restarted.action({ kind: 'retryStart' });
  assert.equal(restarted.state().starting, false);
  assert.equal(restarted.state().running, true);
  assert.equal(restarted.state().error, undefined);
});

test('save failure retains existing network listener; bind failure persists scope and permits retry', async (t) => {
  const f = fixture(t),
    service = f.service;
  await service.action({ kind: 'setConnectionScope', scope: 'network' });
  await service.action({ kind: 'configure', enabled: true, port: 0 });
  const { endpoint, port } = service.state(),
    saved = f.read(),
    auth = `Bearer ${f.options.decrypt(saved.token)}`;
  const save = f.options.mcpServer.save;
  f.options.mcpServer.save = () => {
    throw Error('fixture write failed');
  };
  await assert.rejects(service.action({ kind: 'setConnectionScope', scope: 'local' }), /保存/);
  assert.equal(service.state().activeConnectionScope, 'network');
  assert.equal((await request(endpoint, auth)).status, 200);
  f.options.mcpServer.save = save;
  assert.equal(f.failures.length, 1);
  await service.action({ kind: 'configure', enabled: false, port });
  const blocker = net.createServer();
  await new Promise((resolve, reject) =>
    blocker.once('error', reject).listen(port, '127.0.0.1', resolve),
  );
  t.after(() => blocker.close());
  await service.action({ kind: 'setConnectionScope', scope: 'local' });
  await service.action({ kind: 'configure', enabled: true, port });
  assert.equal(service.state().running, false);
  assert.equal(service.state().starting, false);
  assert(service.state().error);
  assert.equal(service.state().activeConnectionScope, null);
  assert.equal(f.readServer().connectionScope, 'local');
  assert.equal(f.readServer().enabled, true);
  assert.equal(f.readServer().port, port);
  await new Promise((resolve) => blocker.close(resolve));
  const retry = service.action({ kind: 'retryStart' });
  await Promise.resolve();
  assert.equal(service.state().starting, true);
  assert.equal(service.state().error, undefined);
  await retry;
  assert.equal(service.state().starting, false);
  assert.equal(service.state().running, true);
  assert.equal((await request(endpoint, auth)).status, 200);
  assert.equal(f.failures.length, 2);
});

test('uncommitted listener cannot execute; stopped or changed requests cannot execute late', async (t) => {
  let executions = 0,
    names = ['dock.example'],
    token = 'a'.repeat(64);
  const server = new AutomationMcp(
    {
      auditTarget: () => undefined,
      call: async () => {
        executions++;
        return {};
      },
    },
    () => token,
    () => {},
    'test',
  );
  t.after(() => server.close());
  await server.start(0, 'network', () => names, true);
  const port = server.port,
    endpoint = `http://127.0.0.1:${port}/mcp`;
  assert.equal((await request(endpoint, `Bearer ${token}`)).status, 503);
  server.activate();
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'appdock_get_info', arguments: {} },
  });
  async function partial(change, expected) {
    const socket = net.connect(port, '127.0.0.1');
    await once(socket, 'connect');
    let response = '';
    socket.on('data', (data) => (response += data));
    socket.on('error', () => {});
    const closed = new Promise((resolve) => socket.once('close', resolve));
    socket.write(
      `POST /mcp HTTP/1.1\r\nHost: dock.example:${port}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body.slice(0, 10)}`,
    );
    // Let headers reach the server while the JSON body is still incomplete.
    await new Promise((r) => setTimeout(r, 30));
    await change();
    if (!socket.destroyed) socket.end(body.slice(10));
    await closed;
    if (expected) assert(response.includes(` ${expected} `), response);
  }
  await partial(async () => {
    names = [];
  }, 403);
  names = ['dock.example'];
  await partial(async () => {
    token = 'b'.repeat(64);
  }, 401);
  await partial(() => server.close());
  assert.equal(executions, 0);
});

test('the two receivers share the HTTP request limit and closing one releases its requests', async (t) => {
  const budget = new Set();
  const auth = 'Bearer ' + 'a'.repeat(64);
  const make = () =>
    new AutomationMcp(
      { auditTarget: () => undefined, call: () => ({}) },
      () => 'a'.repeat(64),
      () => {},
      'test',
      undefined,
      undefined,
      undefined,
      budget,
    );
  const first = make();
  const second = make();
  t.after(() => Promise.all([first.close(), second.close()]));
  await first.start(0);
  await second.start(0);
  const sockets = Array.from({ length: 8 }, () => net.connect(first.port, '127.0.0.1'));
  t.after(() => sockets.forEach((socket) => socket.destroy()));
  await Promise.all(
    sockets.map(async (socket) => {
      await once(socket, 'connect');
      socket.on('error', () => {});
      socket.write(
        'POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:' +
          first.port +
          '\r\nAuthorization: ' +
          auth +
          '\r\nContent-Type: application/json\r\nContent-Length: 20\r\n\r\n{',
      );
    }),
  );
  const deadline = Date.now() + 5000;
  while (budget.size !== 8 && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(budget.size, 8);
  const url = 'http://127.0.0.1:' + second.port + '/mcp';
  assert.equal((await request(url, auth)).status, 429);
  await first.close();
  assert.equal((await request(url, auth)).status, 200);
});

test('wildcard startup fails closed if another listener owns the loopback endpoint', async (t) => {
  const sockets = new Set();
  const blocker = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) =>
    blocker.once('error', reject).listen(0, '127.0.0.1', resolve),
  );
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    blocker.close();
  });
  const f = fixture(t);
  await f.service.action({ kind: 'setConnectionScope', scope: 'network' });
  await f.service.action({
    kind: 'configure',
    enabled: true,
    port: blocker.address().port,
  });
  assert.equal(f.service.state().running, false);
  assert.equal(f.service.state().activeConnectionScope, null);
  assert.equal(f.readServer().connectionScope, 'network');
  assert.equal(f.failures.length, 1);
});

test('port zero persistence failure closes the provisional listener and retains the durable setting', async (t) => {
  const f = fixture(t);
  const save = f.options.mcpServer.save;
  let provisional;
  f.options.mcpServer.save = (next, previous) => {
    if (next.port > 0) {
      provisional = next.port;
      throw Error('fixture write failed');
    }
    save(next, previous);
  };
  await f.service.action({ kind: 'configure', enabled: true, port: 0 });
  assert.equal(f.service.state().running, false);
  assert.equal(f.service.state().port, 0);
  assert.equal(f.service.state().enabled, true);
  assert.equal(f.failures[0].code, 'MCP_SAVE_FAILED');
  assert.equal(f.readServer().port, 0);
  await assert.rejects(request('http://127.0.0.1:' + provisional + '/mcp', 'Bearer wrong'));
  f.options.mcpServer.save = save;
  await f.service.action({ kind: 'retryStart' });
  assert.equal(f.service.state().running, true);
  assert(f.readServer().port > 0);
});
