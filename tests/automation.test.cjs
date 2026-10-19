const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const { SettingsStore } = require('../out/main/main/core/settings');
const { AutomationApi } = require('../out/main/main/core/automation-api');
const { AutomationService } = require('../out/main/main/core/automation');
const {
  automationApplets,
  automationCommands,
} = require('../out/main/main/core/automation-commands');
const {
  changeRegistration,
  registrationBlock,
  registrationStatus,
} = require('../out/main/main/core/codex-registration');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const testRoot = process.env.APPDOCK_AUTOMATION_TEST_ROOT
  ? path.resolve(process.env.APPDOCK_AUTOMATION_TEST_ROOT)
  : path.resolve(__dirname, '../.artifacts/automation-unit');

test('manifest publication survives runtime replacement but excludes aliases and undeclared registrations', (t) => {
  const f = fixture(t);
  const { ExtensionManager } = require('../out/main/main/core/extensions');
  const {
    parseDeclaredCommands,
    parseExtensionCommands,
  } = require('../out/main/shared/extension-commands');
  const manager = new ExtensionManager({ roots: [], settings: f.settings, log: () => {} });
  const id = 'test.independent';
  const entry = {
    manifest: {
      id,
      commands: parseDeclaredCommands(id, [
        {
          id: id + '.run',
          title: 'Declared',
          automation: true,
          aliases: [id + '.old'],
          activateOnExecute: true,
        },
        { id: id + '.private', title: 'Private', automation: false },
        { id: id + '.missing', title: 'Missing handler', automation: true },
      ]),
    },
    state: 'running',
    commands: [],
  };
  const exposed = () =>
    automationCommands([
      { id, enabled: true, state: entry.state, commands: manager.commandCatalog(entry) },
    ]).filter((c) => c.appletId === id);
  const registrations = [
    { id: id + '.run', title: 'Runtime title' },
    { id: id + '.private', title: 'Private', automation: true },
    { id: id + '.dynamic', title: 'Dynamic', automation: true },
  ];
  entry.commands = parseExtensionCommands(id, registrations);
  assert.deepEqual(
    exposed().map((c) => [c.id, c.available]),
    [
      [id + '.run', true],
      [id + '.missing', false],
    ],
  );
  assert.equal(exposed()[0].title, 'Runtime title');
  entry.commands = parseExtensionCommands(id, registrations.slice(1));
  assert.equal(exposed()[0].available, false);
  entry.commands = parseExtensionCommands(id, registrations);
  assert.equal(exposed()[0].available, true);
  entry.manifest.commands[0].automation = false;
  assert.ok(!exposed().some((c) => c.id === id + '.run'));
  entry.manifest.commands = undefined;
  assert.deepEqual(exposed(), []);
});
function fixture(t) {
  fs.mkdirSync(testRoot, { recursive: true });
  const base = fs.mkdtempSync(path.join(testRoot, 'case-'));
  const settings = new SettingsStore(path.join(base, 'settings.json'), path.join(base, 'backups'));
  settings.load();
  t.after(() => settings.close());
  let write = true;
  const options = {
    settings,
    save: (v, r) => settings.save(v, r),
    applets: () => [],
    commands: () => [],
    execute: async () => {},
    executable: () => true,
    version: 'test',
    instanceId: 'instance',
    writable: () => write,
    ready: () => true,
  };
  const api = new AutomationApi(options);
  return { base, settings, api, options, setWrite: (v) => (write = v) };
}
test('basic patch preserves unrelated settings, validates atomically, dry run and stale/restart revisions', async (t) => {
  const f = fixture(t),
    initial = structuredClone(f.settings.value),
    rev = f.api.call('settings.get').revision;
  const preview = await f.api.call('commands.execute', {
    id: 'appdock.settings.update',
    args: {
      changes: { theme: 'dark', closeToTray: false },
      expectedRevision: rev,
      dryRun: true,
    },
  });
  assert.equal(preview.values.theme, 'dark');
  assert.deepEqual(f.settings.value, initial);
  await assert.rejects(
    () =>
      f.api.call('commands.execute', {
        id: 'appdock.settings.update',
        args: {
          changes: { theme: 'dark', runAsAdministrator: true },
          expectedRevision: rev,
        },
      }),
    { code: 'INVALID_ARGUMENT' },
  );
  assert.deepEqual(f.settings.value, initial);
  const saved = await f.api.call('commands.execute', {
    id: 'appdock.settings.update',
    args: {
      changes: { theme: 'dark' },
      expectedRevision: rev,
    },
  });
  assert.deepEqual(f.settings.value, { ...initial, host: { ...initial.host, theme: 'dark' } });
  await assert.rejects(
    () =>
      f.api.call('commands.execute', {
        id: 'appdock.settings.update',
        args: { changes: { theme: 'light' }, expectedRevision: rev },
      }),
    { code: 'REVISION_CONFLICT' },
  );
  await assert.rejects(
    () =>
      new AutomationApi(f.options).call('commands.execute', {
        id: 'appdock.settings.update',
        args: {
          changes: { theme: 'light' },
          expectedRevision: saved.revision,
        },
      }),
    { code: 'REVISION_CONFLICT' },
  );
  f.setWrite(false);
  await assert.rejects(
    () =>
      f.api.call('commands.execute', {
        id: 'appdock.settings.update',
        args: {
          changes: { theme: 'light' },
          expectedRevision: saved.revision,
        },
      }),
    { code: 'WRITE_DISABLED' },
  );
  assert.equal(f.api.call('settings.get').values.theme, 'dark');
});
test('unobserved disk edit and malformed file never get overwritten', async (t) => {
  const f = fixture(t),
    rev = f.api.call('settings.get').revision;
  const incoming = structuredClone(f.settings.value);
  incoming.host.closeToTray = false;
  fs.writeFileSync(f.settings.file, JSON.stringify(incoming));
  await assert.rejects(
    () =>
      f.api.call('commands.execute', {
        id: 'appdock.settings.update',
        args: { changes: { theme: 'dark' }, expectedRevision: rev },
      }),
    { code: 'REVISION_CONFLICT' },
  );
  assert.equal(JSON.parse(fs.readFileSync(f.settings.file)).host.theme, 'light');
  const next = f.api.call('settings.get').revision;
  fs.writeFileSync(f.settings.file, '{broken');
  await assert.rejects(
    () =>
      f.api.call('commands.execute', {
        id: 'appdock.settings.update',
        args: { changes: { theme: 'dark' }, expectedRevision: next },
      }),
    { code: 'REVISION_CONFLICT' },
  );
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), '{broken');
});
test('registration preserves exact unrelated TOML, detects ownership collisions and safely repairs/removes', (t) => {
  const f = fixture(t),
    file = path.join(f.base, 'config.toml'),
    id = 'appdock_0123456789abcdef';
  const original =
    '# Keep this comment\r\nmodel = "example"\r\n[mcp_servers.other]\r\nurl = "http://example.test/mcp"\r\n';
  fs.writeFileSync(file, original);
  const a = registrationBlock(id, 'http://127.0.0.1:34567/mcp', 'a'.repeat(64), id);
  let owned = changeRegistration(file, id, a);
  assert.ok(fs.readFileSync(file, 'utf8').startsWith(original));
  assert.equal(registrationStatus(file, id, a).registration, 'registered');
  const b = registrationBlock(id, 'http://127.0.0.1:34568/mcp', 'b'.repeat(64), id);
  assert.equal(registrationStatus(file, id, b, owned).registration, 'conflict');
  owned = changeRegistration(file, id, b, owned);
  const modified = fs.readFileSync(file, 'utf8').replace('required = false', 'required = true');
  fs.writeFileSync(file, modified);
  assert.throws(() => changeRegistration(file, id, b, owned, true));
  assert.equal(fs.readFileSync(file, 'utf8'), modified);
  fs.writeFileSync(file, original + b);
  changeRegistration(file, id, b, owned, true);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  fs.writeFileSync(file, original + `[mcp_servers.${id}]\nurl="http://other.test"\n`);
  assert.throws(() => changeRegistration(file, id, a));
});
test('external uninstall leaves one delimiter; owned comment alone can be repaired or removed', (t) => {
  const f = fixture(t),
    file = path.join(f.base, 'config.toml'),
    id = 'appdock_0123456789abcdef';
  const block = registrationBlock(id, 'http://127.0.0.1:34567/mcp', 'a'.repeat(64));
  const original =
    '# unrelated\r\nmodel = "example"\r\n[mcp_servers.other]\r\nurl = "http://example.test/mcp"\r\n';
  fs.writeFileSync(file, original);
  const owned = changeRegistration(file, id, block);
  for (const marker of ['BEGIN', 'END']) {
    for (const newline of ['\n', '\r\n', '']) {
      const removed = original + '# ' + marker + ' AppDock MCP ' + id + newline;
      fs.writeFileSync(file, removed);
      assert.equal(registrationStatus(file, id, block, owned).registration, 'absent');
      assert.equal(fs.readFileSync(file, 'utf8'), removed); // Status never writes.
      changeRegistration(file, id, block, owned);
      assert.equal(fs.readFileSync(file, 'utf8'), original + block);
      assert.equal(fs.readFileSync(file + '.appdock-backup', 'utf8'), removed);
      assert.equal(registrationStatus(file, id, block, owned).registration, 'registered');
      fs.writeFileSync(file, removed);
      changeRegistration(file, id, block, owned, true);
      assert.equal(fs.readFileSync(file, 'utf8'), original);
      assert.equal(changeRegistration(file, id, block, owned, true), undefined);
    }
  }
});
test('uninstall recovery never accepts missing ownership, live table, strings or ambiguous delimiters', (t) => {
  const f = fixture(t),
    file = path.join(f.base, 'config.toml'),
    id = 'appdock_0123456789abcdef';
  const block = registrationBlock(id, 'http://127.0.0.1:34567/mcp', 'a'.repeat(64));
  const owned = changeRegistration(file, id, block);
  const end = '# END AppDock MCP ' + id + '\n';
  const examples = [
    { text: end, hash: undefined },
    { text: '[mcp_servers.AppDock]\nurl = "http://other/mcp"\n' + end, hash: owned },
    { text: 'value = """\n' + end + '"""\n', hash: owned },
    { text: "value = '''\n" + end + "'''\n", hash: owned },
    { text: end + end, hash: owned },
    { text: end + '# BEGIN AppDock MCP ' + id + '\n', hash: owned },
    { text: '# END AppDock MCP ' + id + ' extra\n', hash: owned },
  ];
  for (const { text, hash } of examples) {
    fs.writeFileSync(file, text);
    assert.equal(registrationStatus(file, id, block, hash).registration, 'conflict');
    for (const remove of [false, true]) {
      assert.throws(() => changeRegistration(file, id, block, hash, remove));
      assert.equal(fs.readFileSync(file, 'utf8'), text);
    }
  }
});

test('marker inside multiline TOML string and malformed TOML are rejected without damage', (t) => {
  const f = fixture(t),
    file = path.join(f.base, 'config.toml'),
    id = 'appdock_0123456789abcdef';
  const b = registrationBlock(id, 'http://127.0.0.1:34567/mcp', 'a'.repeat(64));
  for (const text of [`description = '''\n${b}'''\n`, '[broken']) {
    fs.writeFileSync(file, text);
    assert.throws(() => changeRegistration(file, id, b, undefined, true));
    assert.equal(fs.readFileSync(file, 'utf8'), text);
  }
});
test('short names retain placement ownership, refuse collisions and require explicit unregister on rename', (t) => {
  const f = fixture(t),
    file = path.join(f.base, 'config.toml');
  const id = 'appdock_0123456789abcdef',
    other = 'appdock_fedcba9876543210';
  const short = registrationBlock(id, 'http://127.0.0.1:34567/mcp', 'a'.repeat(64));
  const legacy = registrationBlock(id, 'http://127.0.0.1:34567/mcp', 'a'.repeat(64), id);
  const original = '# retained\n[mcp_servers.other]\nurl="http://example.test"\n';
  fs.writeFileSync(file, original);
  const owned = changeRegistration(file, id, legacy);
  const oldBytes = fs.readFileSync(file, 'utf8');
  assert.equal(registrationStatus(file, id, short, owned).registration, 'conflict');
  assert.throws(() => changeRegistration(file, id, short, owned), /一度登録を解除/);
  assert.equal(fs.readFileSync(file, 'utf8'), oldBytes);
  changeRegistration(file, id, short, owned, true);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  const shortHash = changeRegistration(file, id, short);
  const shortBytes = fs.readFileSync(file, 'utf8');
  assert.ok(shortBytes.includes('[mcp_servers.AppDock]'));
  assert.equal(registrationStatus(file, id, short, shortHash).registration, 'registered');
  const duplicate = registrationBlock(other, 'http://127.0.0.1:34568/mcp', 'b'.repeat(64));
  assert.equal(registrationStatus(file, other, duplicate).registration, 'conflict');
  assert.throws(() => changeRegistration(file, other, duplicate), /同じ登録名/);
  assert.equal(fs.readFileSync(file, 'utf8'), shortBytes);
  const named = registrationBlock(
    other,
    'http://127.0.0.1:34568/mcp',
    'b'.repeat(64),
    'AppDock_Test',
  );
  const otherHash = changeRegistration(file, other, named);
  changeRegistration(file, other, named, otherHash, true);
  assert.equal(fs.readFileSync(file, 'utf8'), shortBytes);
  for (const name of ['', 'Bad.Name', 'Bad Name', 'a'.repeat(65), '1AppDock', 'AppDock\n'])
    assert.throws(() => registrationBlock(id, 'http://127.0.0.1:34567/mcp', 'a'.repeat(64), name));
});

test('corrupt local credentials remain untouched and expose a readable disabled state', async (t) => {
  const f = fixture(t);
  const localDirectory = path.join(f.base, 'local');
  fs.mkdirSync(localDirectory);
  const file = path.join(localDirectory, 'automation.json');
  const original = JSON.stringify({
    version: 1,
    enabled: true,
    allowWrite: true,
    port: 45678,
    token: Buffer.from('invalid-credential').toString('base64'),
    configFile: path.join(f.base, 'config.toml'),
    owned: {},
  });
  fs.writeFileSync(file, original);
  const service = new AutomationService({
    localDirectory,
    baseDirectory: f.base,
    version: 'test',
    encrypt: (s) => Buffer.from(s).toString('base64'),
    decrypt: (s) => Buffer.from(s, 'base64').toString(),
    changed: () => {},
    createApi: () => {
      throw Error('must not start');
    },
  });
  t.after(() => service.close());
  await service.initialize();
  assert.equal(service.state().enabled, false);
  assert.equal(service.state().serverId, 'AppDock');
  assert.equal(service.state().running, false);
  assert.ok(service.state().error);
  await assert.rejects(service.action({ kind: 'rotateToken' }));
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('command policy uses provider declarations, projects details and never activates disabled/stopped applets', async (t) => {
  const f = fixture(t);
  const make = (id, runtime, commands) => ({
    id,
    runtime,
    displayName: 'Public name',
    version: '1',
    state: 'running',
    enabled: true,
    description: 'Public description',
    error: null,
    commands: commands.map((id) => ({ id, title: id, available: true })),
    folder: 'SECRET_PATH',
    settings: [{ secret: 'SECRET_SETTING' }],
  });
  const native = make('test.new-provider', 'native', [
    'test.new-provider.next',
    'test.new-provider.start',
    'test.new-provider.stop',
    'test.new-provider.prepare-background',
  ]);
  native.commands.slice(0, 3).forEach((c) => {
    c.automation = true;
  });
  const web = make('web.11111111-2222-3333-4444-555555555555', 'node', [
    'web.11111111-2222-3333-4444-555555555555.open',
    'web.11111111-2222-3333-4444-555555555555.reload',
  ]);
  web.commands[0].automation = true;
  web.description = 'Public page description';
  web.collection = { owner: 'test.pages', key: 'items', itemId: 'site.one' };
  web.url = 'https://secret.test';
  web.settings = [{ key: 'accountId', default: 'SECRET_ACCOUNT' }];
  web.error = 'SECRET_TOKEN';
  const impostor = make('other', 'native', ['at365.gmail.open', 'other.open']);
  impostor.commands[0].automation = true;
  const legacy = make('at365.gmail', 'node', ['at365.gmail.open']);
  const input = [native, web, impostor, legacy];
  const catalog = automationCommands(input);
  assert.equal(catalog.length, 11);
  assert(catalog.some((c) => c.id === 'appdock.ribbon.settings.open' && c.available));
  assert.ok(
    !catalog.some(
      (c) =>
        c.id === 'appdock.quit' ||
        c.id.endsWith('prepare-background') ||
        c.id === 'other.open' ||
        c.id === 'at365.gmail.open',
    ),
  );
  assert.equal(
    catalog.find((c) => c.id === 'web.11111111-2222-3333-4444-555555555555.open').available,
    true,
  );
  const details = automationApplets(input);
  assert.ok(!JSON.stringify(details).includes('SECRET_'));
  assert.ok(!JSON.stringify(details).includes('secret.test'));
  assert.equal(details.find((item) => item.id === web.id).description, 'Public page description');
  f.options.applets = () => automationApplets(input);
  f.options.commands = () => automationCommands(input);
  let allowed = false,
    calls = 0,
    finish;
  f.options.executable = () => allowed;
  f.options.execute = () => {
    calls++;
    return new Promise((r) => {
      finish = r;
    });
  };
  const before = structuredClone(f.settings.value);
  const id = 'test.new-provider.next';
  assert.equal(
    f.api.call('applets.get', { id: native.id }).applet.description,
    'Public description',
  );
  assert.throws(() => f.api.call('applets.get', { id: 'missing' }), { code: 'NOT_FOUND' });
  assert.throws(() => f.api.call('commands.execute', { id, extra: true }), {
    code: 'INVALID_ARGUMENT',
  });
  await assert.rejects(f.api.call('commands.execute', { id }), { code: 'EXECUTION_DISABLED' });
  allowed = true;
  await assert.rejects(f.api.call('commands.execute', { id: 'appdock.quit' }), {
    code: 'NOT_FOUND',
  });
  for (const state of ['stopped', 'waiting', 'starting', 'stopping', 'error']) {
    native.state = state;
    assert.equal(f.api.call('commands.list').commands.find((c) => c.id === id).available, false);
    await assert.rejects(f.api.call('commands.execute', { id }), { code: 'UNAVAILABLE' });
  }
  native.state = 'running';
  native.enabled = false;
  await assert.rejects(f.api.call('commands.execute', { id }), { code: 'UNAVAILABLE' });
  native.enabled = true;
  native.commands[0].automation = false;
  await assert.rejects(f.api.call('commands.execute', { id }), { code: 'NOT_FOUND' });
  native.commands[0].automation = true;
  native.commands[0].available = false;
  await assert.rejects(f.api.call('commands.execute', { id }), { code: 'UNAVAILABLE' });
  native.commands[0].available = true;
  const pending = f.api.call('commands.execute', { id });
  await assert.rejects(f.api.call('commands.execute', { id }), { code: 'BUSY' });
  finish({ secret: 'SECRET_RESULT' });
  const result = await pending;
  assert.equal(result.completion, 'handlerReturned');
  assert.equal(result.effectVerified, false);
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(result).includes('SECRET_RESULT'));
  f.options.execute = async () => {
    throw Error('SECRET_FAILURE');
  };
  await assert.rejects(
    f.api.call('commands.execute', { id }),
    (e) => e.code === 'COMMAND_FAILED' && !e.message.includes('SECRET_FAILURE'),
  );
  f.options.execute = async () => {};
  assert.equal(
    (await f.api.call('commands.execute', { id: 'appdock.open' })).completion,
    'accepted',
  );
  assert.deepEqual(f.settings.value, before);
});

test('real SDK HTTP client: auth, tools, writes, revocation, persisted endpoint, isolation and shutdown', async (t) => {
  const f = fixture(t);
  const audit = [];
  let executions = 0;
  f.options.commands = () => [
    {
      id: 'appdock.open',
      title: 'Open',
      appletId: null,
      available: true,
      unavailableReason: null,
      completion: 'accepted',
    },
  ];
  f.options.execute = async () => {
    executions++;
  };
  const options = {
    localDirectory: path.join(f.base, 'local'),
    baseDirectory: f.base,
    version: 'test',
    encrypt: (s) => Buffer.from(s).toString('base64'),
    decrypt: (s) => Buffer.from(s, 'base64').toString(),
    changed: () => {},
    audit: (level, message) => audit.push({ level, message }),
    informed: (message) => audit.push({ level: 'information', message }),
    failed: (code, message) => audit.push({ level: 'failure', code, message }),
    createApi: (
      writable,
      instanceId,
      executable,
      manageable,
      shortcutsEditable,
      gesturesEditable,
      ribbonEditable,
      trayEditable,
    ) =>
      new AutomationApi({
        ...f.options,
        writable,
        instanceId,
        executable,
        manageable,
        shortcutsEditable,
        gesturesEditable,
        ribbonEditable,
        trayEditable,
      }),
  };
  const service = new AutomationService(options);
  t.after(() => service.close());
  assert.equal(service.state().enabled, false);
  assert.equal(service.state().allowExecute, false);
  assert.equal(service.state().allowManageApplets, false);
  assert.equal(service.state().allowEditShortcuts, false);
  assert.equal(service.state().allowEditGestures, false);
  assert.equal(service.state().allowEditRibbon, false);
  assert.equal(service.state().allowEditTray, false);
  await service.action({ kind: 'setTrayEditing', allowed: true });
  await service.action({ kind: 'setRibbonEditing', allowed: true });
  await service.action({ kind: 'setGestureEditing', allowed: true });
  await service.action({ kind: 'setShortcutEditing', allowed: true });
  await service.action({ kind: 'setAppletManagement', allowed: true });
  const file = path.join(f.base, 'codex', 'config.toml');
  await service.action({ kind: 'selectConfig', file });
  const savedSelection = new AutomationService(options);
  assert.equal(savedSelection.state().error, undefined);
  await savedSelection.close();
  const localConfigFile = path.join(options.localDirectory, 'automation.json');
  const legacyConfig = JSON.parse(fs.readFileSync(localConfigFile));
  delete legacyConfig.allowManageApplets;
  delete legacyConfig.allowEditShortcuts;
  delete legacyConfig.allowEditGestures;
  delete legacyConfig.allowEditRibbon;
  delete legacyConfig.allowEditTray;
  fs.writeFileSync(localConfigFile, JSON.stringify(legacyConfig));
  const legacyService = new AutomationService(options);
  assert.equal(legacyService.state().allowManageApplets, false);
  assert.equal(legacyService.state().allowEditShortcuts, false);
  assert.equal(legacyService.state().allowEditGestures, false);
  assert.equal(legacyService.state().allowEditRibbon, false);
  assert.equal(legacyService.state().allowEditTray, false);
  await legacyService.close();
  await service.action({ kind: 'configure', enabled: true, allowWrite: false, port: 0 });
  let s = service.state();
  assert.equal(s.running, true);
  await service.action({ kind: 'register' });
  assert.equal(service.state().registration, 'registered');
  t.diagnostic('registered');
  const { parse } = require('smol-toml');
  const headers = parse(fs.readFileSync(file, 'utf8')).mcp_servers[s.serverId].http_headers;
  assert.equal((await fetch(s.endpoint, { method: 'POST' })).status, 401);
  assert.equal(
    (
      await fetch(s.endpoint, {
        method: 'POST',
        headers: { ...headers, Origin: 'https://evil.test' },
      })
    ).status,
    403,
  );
  await service.action({ kind: 'test' });
  assert.equal(
    audit.filter((e) => e.level === 'information' && e.message.includes('疎通に成功')).length,
    1,
  );
  const informationCount = audit.filter((e) => e.level === 'information').length;
  await service.action({ kind: 'status' });
  assert.equal(audit.filter((e) => e.level === 'information').length, informationCount);
  assert.equal(service.state().lastClientAt, undefined);
  assert.equal((await fetch(s.endpoint, { headers })).status, 405);
  assert.equal(
    (
      await fetch(s.endpoint, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ large: 'x'.repeat(65536) }),
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await fetch(s.endpoint, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': 'invalid',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      })
    ).status,
    400,
  );
  t.diagnostic('self test');
  const client = new Client({ name: 'automation-regression', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL(s.endpoint), {
    requestInit: { headers },
  });
  await client.connect(transport);
  t.after(() => client.close());
  t.diagnostic('SDK connected');
  assert.ok(service.state().lastClientAt);
  const tools = (await client.listTools()).tools;
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    require('../out/main/shared/appdock-api')
      .operationsFor('mcp')
      .map(([, d]) => d.name)
      .sort(),
  );
  for (const name of [
    'appdock_ai_generate_text',
    'appdock_ai_get_job',
    'appdock_ai_cancel_job',
    'appdock_ai_list_models',
  ])
    assert(tools.some((tool) => tool.name === name));
  for (const name of [
    'appdock_tts_speak',
    'appdock_tts_list_voices',
    'appdock_tts_get_job',
    'appdock_tts_stop',
  ])
    assert.ok(tools.some((t) => t.name === name));
  for (const name of [
    'appdock_get_ribbon_view',
    'appdock_get_ui_asset',
    'appdock_invoke_ui_action',
  ])
    assert.ok(
      tools.some((tool) => tool.name === name),
      name,
    );
  assert.equal(tools.find((t) => t.name === 'appdock_get_tray').annotations.readOnlyHint, true);
  assert.ok(
    Array.isArray(
      (await client.callTool({ name: 'appdock_get_tray', arguments: {} })).structuredContent.menu,
    ),
  );
  assert.equal(tools.find((t) => t.name === 'appdock_get_ribbon').annotations.readOnlyHint, true);
  assert.ok(
    Array.isArray(
      (await client.callTool({ name: 'appdock_get_ribbon', arguments: {} })).structuredContent
        .items,
    ),
  );
  assert.equal(tools.find((t) => t.name === 'appdock_get_gestures').annotations.readOnlyHint, true);
  assert.ok(
    Array.isArray(
      (await client.callTool({ name: 'appdock_get_gestures', arguments: {} })).structuredContent
        .bindings,
    ),
  );
  assert.equal(
    tools.find((t) => t.name === 'appdock_get_shortcuts').annotations.readOnlyHint,
    true,
  );
  assert.ok(
    Array.isArray(
      (await client.callTool({ name: 'appdock_get_shortcuts', arguments: {} })).structuredContent
        .bindings,
    ),
  );
  assert.equal(
    tools.find((t) => t.name === 'appdock_execute_command').annotations.idempotentHint,
    false,
  );
  assert.equal(
    (await client.callTool({ name: 'appdock_execute_command', arguments: { id: 'appdock.open' } }))
      .structuredContent.code,
    'EXECUTION_DISABLED',
  );
  assert.equal(executions, 0);
  await service.action({ kind: 'setExecution', allowed: true });
  const execution = await client.callTool({
    name: 'appdock_execute_command',
    arguments: { id: 'appdock.open' },
  });
  assert.equal(execution.structuredContent.completion, 'accepted');
  assert.equal(executions, 1);
  assert.equal(service.state().allowWrite, false);
  await client.callTool({ name: 'SECRET_UNKNOWN_TOOL', arguments: { secret: 'SECRET_ARGUMENT' } });
  await client.callTool({ name: 'appdock_get_applet', arguments: { id: 'SECRET_UNKNOWN_ID' } });
  assert.ok(
    audit.some(
      (a) =>
        a.message.includes('API=commands.execute') &&
        a.message.includes('result=success') &&
        a.message.includes('target=appdock.open'),
    ),
  );
  assert.ok(audit.some((a) => a.level === 'warn' && a.message.includes('EXECUTION_DISABLED')));
  assert.ok(!JSON.stringify(audit).includes('SECRET_'));
  assert.ok(!JSON.stringify(audit).includes(headers.Authorization));
  await service.action({ kind: 'setExecution', allowed: false });
  assert.equal(
    (await client.callTool({ name: 'appdock_execute_command', arguments: { id: 'appdock.open' } }))
      .structuredContent.code,
    'EXECUTION_DISABLED',
  );
  assert.equal(
    (await client.callTool({ name: 'appdock_get_settings', arguments: { secret: true } }))
      .structuredContent.code,
    'INVALID_ARGUMENT',
  );
  await service.action({ kind: 'setExecution', allowed: true });
  let get = await client.callTool({ name: 'appdock_get_settings', arguments: {} });
  assert.equal(
    (
      await client.callTool({
        name: 'appdock_execute_command',
        arguments: {
          id: 'appdock.settings.update',
          args: {
            changes: { theme: 'dark' },
            expectedRevision: get.structuredContent.revision,
          },
        },
      })
    ).structuredContent.code,
    'WRITE_DISABLED',
  );
  await service.action({ kind: 'configure', enabled: true, allowWrite: true, port: s.port });
  get = await client.callTool({ name: 'appdock_get_settings', arguments: {} });
  const patch = await client.callTool({
    name: 'appdock_execute_command',
    arguments: {
      id: 'appdock.settings.update',
      args: { changes: { theme: 'dark' }, expectedRevision: get.structuredContent.revision },
    },
  });
  assert.equal(patch.structuredContent.values.theme, 'dark');
  t.diagnostic('patched');
  await service.action({ kind: 'setExecution', allowed: false });
  await service.action({ kind: 'rotateToken' });
  assert.equal((await fetch(s.endpoint, { method: 'POST', headers })).status, 401);
  await service.action({ kind: 'register' });
  assert.equal(service.state().registration, 'registered');
  await service.action({ kind: 'unregister' });
  assert.equal(service.state().registration, 'absent');
  await service.close();
  await assert.rejects(fetch(s.endpoint));
  const restarted = new AutomationService(options);
  t.after(() => restarted.close());
  await restarted.initialize();
  assert.equal(restarted.state().port, s.port);
  assert.equal(restarted.state().running, true);
  assert.equal(restarted.state().allowExecute, false);
  assert.equal(restarted.state().allowManageApplets, true);
  assert.equal(restarted.state().allowEditShortcuts, true);
  assert.equal(restarted.state().allowEditGestures, true);
  assert.equal(restarted.state().allowEditRibbon, true);
  assert.equal(restarted.state().allowEditTray, true);
  const conflict = new AutomationService({
    ...options,
    localDirectory: path.join(f.base, 'other-local'),
    baseDirectory: path.join(f.base, 'other'),
  });
  t.after(() => conflict.close());
  await conflict.action({ kind: 'configure', enabled: true, allowWrite: false, port: s.port });
  assert.equal(conflict.state().running, false);
  assert.ok(conflict.state().error);
  assert.notEqual(conflict.id, restarted.id);
  await restarted.action({ kind: 'selectName', name: 'AppDock_Test' });
  await restarted.close();
  const renamed = new AutomationService(options);
  assert.equal(renamed.state().serverId, 'AppDock_Test');
  assert.equal(renamed.id, service.id);
  await renamed.close();
});
