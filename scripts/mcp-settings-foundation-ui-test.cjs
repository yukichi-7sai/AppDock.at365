const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { parse } = require('smol-toml');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] && path.resolve(process.argv[2]);
const profile = path.join(
  root,
  '.artifacts',
  `mcp-settings-foundation-${portable ? 'portable' : 'source'}-${Date.now()}`,
);
const local = path.join(profile, 'local'),
  fixtureId = 'test.settings-foundation';
const fixture = path.join(profile, 'extensions', 'fixture');
const checks = [],
  hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(fixture, { recursive: true });
fs.mkdirSync(local, { recursive: true });
const configFile = path.join(profile, 'codex', 'config.toml');
fs.mkdirSync(path.dirname(configFile), { recursive: true });
fs.writeFileSync(configFile, '# isolated test configuration\n');
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, { soundEnabled: false, closeToTray: false });
Object.assign(settings.updates, {
  checkHostOnStartup: false,
  checkAppletsOnStartup: false,
  checkHostOnAboutOpen: false,
});
settings.keybindings = [];
settings.gestures.enabled = false;
settings.ai = {
  commonPrompt: 'Initial policy',
  connections: [
    {
      ...require('../out/main/shared/ai').newAiConnection('service-fixture'),
      name: 'Service fixture',
      baseUrl: 'http://127.0.0.1:9/v1',
      defaultModel: 'fixture-model',
    },
  ],
};
Object.assign(settings.tts, {
  baseUrl: 'http://127.0.0.1:9/tts',
  model: 'fixture-model',
  defaultVoice: 'fixture-voice',
  voicesSource: 'manual',
  manualVoices: [{ id: 'fixture-voice', name: 'Fixture voice' }],
});
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    minimumHostVersion: '0.88.5',
    id: fixtureId,
    name: 'Settings fixture',
    updateRepository: 'fixture-owner/settings-fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.cjs',
    capabilities: ['settings'],
    commands: [{ id: fixtureId + '.run', title: 'Run', automation: true }],
    settings: [
      { key: 'flag', title: 'Flag', type: 'boolean', default: false, generateCommands: ['toggle'] },
      { key: 'text', title: 'Text', type: 'string', default: '' },
      { key: 'opaque', title: 'Opaque config', type: 'json', default: '{"native":true}' },
      {
        key: 'monitor',
        title: 'Monitor',
        type: 'select',
        dynamic: true,
        options: [{ value: 'primary', label: 'Primary' }],
        default: 'primary',
      },
      {
        key: 'records',
        title: 'Records',
        type: 'object-list',
        default: [
          { id: 'one', name: 'Same', enabled: false, unknown: { retained: 7 } },
          { id: 'two', name: 'Same', enabled: true },
        ],
        fields: [
          { key: 'id', title: 'ID', type: 'string' },
          { key: 'name', title: 'Record name', type: 'string', default: 'New', minLength: 1 },
          { key: 'enabled', title: 'Enabled', type: 'boolean', default: false },
        ],
        list: { idKey: 'id', titleKey: 'name', columns: ['name'], enabledKey: 'enabled' },
      },
      {
        key: 'protectedRecords',
        title: 'Protected records',
        type: 'object-list',
        default: [{ name: 'Protected', credential: 'PRIVATE_LIST_VALUE' }],
        fields: [
          { key: 'name', title: 'Name', type: 'string', default: 'New' },
          { key: 'credential', title: 'PRIVATE_LIST_TITLE', type: 'string', secret: true },
        ],
      },
      {
        key: 'private',
        title: 'Private',
        type: 'boolean',
        default: false,
        automation: false,
        generateCommands: ['toggle'],
      },
      {
        key: 'secret',
        title: 'Secret',
        type: 'string',
        default: 'PRIVATE_FIXTURE_VALUE',
        automation: true,
        secret: true,
      },
      {
        key: 'local',
        title: 'Local',
        type: 'boolean',
        default: false,
        automation: true,
        localOnly: true,
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.cjs'),
  `exports.activate=async context=>{context.commands.register('${fixtureId}.run','Run',async()=>{});await context.settings.setOptions('monitor',[{value:'primary',label:'Primary'},{value:'secondary',label:'Secondary'}]);};`,
);
require('./settings-shell-gateway-checks.cjs').install(root, profile);
require('./settings-applet-common-gateway-checks.cjs').install(profile);
require('./settings-applet-management-gateway-checks.cjs').install(profile);
require('./settings-image-gateway-checks.cjs').install(profile);
require('./settings-web-profile-gateway-checks.cjs').install(profile);
let child, browser, page, client;
async function until(fn, label) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(label);
}
async function tool(name, args = {}) {
  return client.callTool({ name, arguments: args });
}
async function value(name, args = {}) {
  const r = await tool(name, args);
  assert.equal(r.isError, undefined, JSON.stringify(r.structuredContent));
  return r.structuredContent;
}
async function permissions() {
  await page.evaluate(() => window.dock.navigate('settings'));
  await page.getByRole('button', { name: '操作の許可', exact: true }).click();
  await page.getByTestId('permission-row-write').waitFor();
}
async function toggle(key, caller, on) {
  const control = page
    .getByTestId('permission-row-' + key)
    .locator(`td[data-caller="${caller}"]`)
    .getByRole('switch');
  await until(() => control.isEnabled(), 'permission enabled');
  if ((await control.isChecked()) !== on) await control.click();
  await until(
    async () => (await control.isChecked()) === on && (await control.isEnabled()),
    'permission persisted',
  );
}
async function main() {
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const executable = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
  if (portable) {
    fs.copyFileSync(portable, executable);
    assert.equal(hash(executable), hash(portable));
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(
    executable,
    [
      ...(portable ? [] : [root]),
      `--test-profile=${profile}`,
      `--test-local-state=${local}`,
      `--remote-debugging-port=${port}`,
    ],
    { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
  );
  browser = await until(
    () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
    'CDP',
  );
  page = await until(
    () =>
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().startsWith('appdock://host/')),
    'host',
  );
  page = require('./settings-aware-page.cjs').settingsAwarePage(page);
  page.setDefaultTimeout(15000);
  await until(
    () => page.evaluate(async () => (await window.dock.snapshot()).startupReady),
    'startup',
  );
  await permissions();
  assert.equal(await page.locator('[data-testid^="permission-row-"]').count(), 8);
  await toggle('write', 'MCP', true);
  await toggle('execute', 'MCP', false);
  await toggle('write', 'Applet', false);
  const grants = JSON.parse(fs.readFileSync(path.join(local, 'applet-api.json'))).permissions;
  assert.equal(grants.write, false);
  let state = (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state;
  assert.equal(state.allowWrite, true);
  assert.equal(state.allowExecute, false);
  assert.equal(
    await page
      .getByTestId('permission-row-write')
      .locator('td[data-caller="MCP"] .permission-pending')
      .count(),
    1,
  );
  checks.push('8 permission rows; independent Applet/MCP write; execute remains OFF');
  await page.evaluate(async (file) => {
    await window.dock.automation({ kind: 'selectConfig', file });
    const s = (await window.dock.automation({ kind: 'status' })).state;
    await window.dock.automation({
      kind: 'configure',
      enabled: true,
      allowWrite: s.allowWrite,
      port: 0,
    });
    await window.dock.automation({ kind: 'register' });
  }, configFile);
  state = (await page.evaluate(() => window.dock.automation({ kind: 'status' }))).state;
  const registration = parse(fs.readFileSync(configFile, 'utf8')).mcp_servers[state.serverId];
  client = new Client({ name: 'Settings foundation regression', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(state.endpoint), {
      requestInit: { headers: registration.http_headers },
    }),
  );
  await until(
    async () => (await value('appdock_get_applet', { id: fixtureId })).applet.state === 'running',
    'fixture running',
  );
  await permissions();
  await until(
    async () =>
      (await page.getByTestId('permission-row-write').locator('.permission-pending').count()) === 0,
    'settings edit has no execution prerequisite',
  );
  const info = await value('appdock_get_info');
  assert.equal(info.version, require('../package.json').version);
  assert.equal(info.writable, true);
  assert.equal(info.executable, false);
  const toolsBefore = JSON.stringify((await client.listTools()).tools);
  const gatewayReplay = await require('./settings-gateway-checks.cjs')({
    client,
    page,
    fixtureId,
    checks,
    tool,
    value,
  });
  await require('./settings-service-gateway-checks.cjs')({
    page,
    client,
    profile,
    local,
    checks,
    tool,
    value,
    until,
  });
  await require('./settings-ai-list-gateway-checks.cjs')({
    page,
    client,
    profile,
    local,
    checks,
    tool,
    value,
    until,
  });
  await require('./settings-tts-list-gateway-checks.cjs')({
    page,
    client,
    profile,
    local,
    checks,
    tool,
    value,
    until,
  });
  await require('./settings-update-gateway-checks.cjs')({
    page,
    client,
    profile,
    local,
    fixtureId,
    checks,
    tool,
    value,
    until,
  });
  await require('./settings-shell-gateway-checks.cjs')({
    page,
    client,
    profile,
    local,
    checks,
    tool,
    value,
    until,
  });
  await require('./settings-applet-common-gateway-checks.cjs')({
    page,
    client,
    profile,
    local,
    checks,
    tool,
    value,
    until,
  });
  await require('./settings-applet-management-gateway-checks.cjs')({
    page,
    client,
    profile,
    local,
    checks,
    tool,
    value,
    until,
  });
  await require('./settings-browser-options-gateway-checks.cjs')({
    page,
    client,
    profile,
    local,
    checks,
    tool,
    value,
    until,
  });
  const values = await value('appdock_get_settings', { appletId: fixtureId });
  assert.deepEqual(values.values, { flag: false, text: '' });
  const schema = await value('appdock_get_settings_schema', { appletId: fixtureId });
  assert.equal(JSON.stringify(schema).includes('PRIVATE_FIXTURE_VALUE'), false);
  const request = {
    id: fixtureId + '.settings.update',
    args: { changes: { text: 'saved' }, expectedRevision: values.revision, dryRun: true },
  };
  assert.equal((await value('appdock_execute_command', request)).completion, 'validated');
  assert.equal(
    (await value('appdock_get_settings', { appletId: fixtureId })).revision,
    values.revision,
  );
  delete request.args.dryRun;
  assert.equal((await value('appdock_execute_command', request)).completion, 'settingsSaved');
  assert.equal((await value('appdock_get_settings', { appletId: fixtureId })).values.text, 'saved');
  assert.equal(
    (await tool('appdock_execute_command', { id: fixtureId + '.run' })).structuredContent.code,
    'EXECUTION_DISABLED',
  );
  assert.equal(
    (await tool('appdock_execute_command', { id: fixtureId + '.settings.private.toggle' }))
      .structuredContent.code,
    'NOT_FOUND',
  );
  assert.equal(
    (await tool('appdock_execute_command', { id: `appdock.applets.${fixtureId}.restart` }))
      .structuredContent.code,
    'EXECUTION_DISABLED',
  );
  checks.push(
    'real MCP: default-public fields; explicit private/secret/local excluded; dryRun/save without execute; independent actions denied',
  );
  await page.getByRole('button', { name: 'MCPクライアント', exact: true }).click();
  await page.getByTestId('mcp-client-connections').waitFor();
  await page.getByRole('button', { name: '接続先を追加', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: '名前', exact: true }).fill('Credential fixture');
  await dialog
    .getByRole('textbox', { name: 'MCPのURL', exact: true })
    .fill('http://127.0.0.1:1/mcp');
  await dialog.getByRole('combobox', { name: '認証', exact: true }).selectOption('bearer');
  await dialog.getByLabel('Bearer token', { exact: true }).fill('PRIVATE_CREDENTIAL_FIXTURE');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await until(async () => (await page.getByRole('dialog').count()) === 0, 'local credential saved');
  const secretId = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).mcpServers
    .items[0].id;
  const detail = await value('appdock_mcp_get_server_settings', { serverId: secretId });
  for (const hidden of ['PRIVATE_CREDENTIAL_FIXTURE', 'tokenConfigured', 'environmentNames'])
    assert.equal(JSON.stringify(detail).includes(hidden), false);
  const secretFile = path.join(local, 'mcp-client.json'),
    secretBytes = fs.readFileSync(secretFile, 'utf8');
  assert.equal(secretBytes.includes('PRIVATE_CREDENTIAL_FIXTURE'), false);
  for (const dryRun of [true, false]) {
    for (const request of [
      { op: 'remove', id: secretId, expectedRevision: detail.revision, dryRun },
      {
        op: 'save',
        item: detail.item,
        connection: { ...detail.connection, url: 'http://127.0.0.1:1/changed' },
        expectedRevision: detail.revision,
        dryRun,
      },
    ])
      assert.equal(
        (await tool('appdock_mcp_update_server_settings', request)).structuredContent.code,
        'PRIVATE_SETTING',
      );
    assert.equal(
      (
        await tool('appdock_mcp_update_server_settings', {
          op: 'save',
          item: detail.item,
          connection: detail.connection,
          expectedRevision: detail.revision,
          dryRun,
          token: '',
        })
      ).structuredContent.code,
      'INVALID_ARGUMENT',
    );
  }
  assert.equal(fs.readFileSync(secretFile, 'utf8'), secretBytes);
  const renamed = await value('appdock_mcp_update_server_settings', {
    op: 'save',
    item: { ...detail.item, name: 'Renamed credential fixture' },
    connection: detail.connection,
    expectedRevision: detail.revision,
  });
  assert.equal(renamed.saved, true);
  assert.equal(
    JSON.parse(fs.readFileSync(secretFile)).entries[secretId].secret,
    JSON.parse(secretBytes).entries[secretId].secret,
  );
  checks.push(
    'local credential dialog encrypts; real MCP hides secrets, rejects secret input/removal/rebinding including dryRun, and preserves cipher on rename',
  );
  await require('./settings-mcp-client-gateway-checks.cjs')({
    page,
    client,
    profile,
    local,
    secretId,
    checks,
    tool,
    value,
    until,
  });
  await require('./settings-launch-gateway-checks.cjs')({
    page,
    client,
    profile,
    local,
    checks,
    tool,
    value,
    until,
  });
  await require('./settings-image-gateway-checks.cjs').check({
    page,
    profile,
    local,
    client,
    checks,
    tool,
    value,
    until,
  });
  await require('./settings-mcp-lock-checks.cjs')({
    page,
    profile,
    local,
    checks,
    tool,
    value,
    until,
    fixtureId,
  });
  await require('./settings-web-profile-gateway-checks.cjs').check({
    page,
    profile,
    local,
    client,
    checks,
    tool,
    value,
    until,
  });
  await permissions();
  await toggle('write', 'MCP', false);
  assert.equal(
    (await tool('appdock_settings_apply', gatewayReplay)).structuredContent.code,
    'WRITE_DISABLED',
  );
  const revision = (await value('appdock_get_settings')).revision;
  const refused = await tool('appdock_execute_command', {
    id: 'appdock.settings.update',
    args: { changes: { theme: 'dark' }, expectedRevision: revision, dryRun: true },
  });
  assert.equal(refused.structuredContent.code, 'WRITE_DISABLED');
  assert.equal((await value('appdock_get_settings')).revision, revision);
  assert.equal(JSON.stringify((await client.listTools()).tools), toolsBefore);
  checks.push(
    'write revocation immediate; read remains available; MCP tool definitions unchanged by permission/value changes',
  );
  fs.writeFileSync(
    path.join(profile, 'result.json'),
    JSON.stringify(
      {
        version: info.version,
        portable: !!portable,
        executableHash: portable ? hash(portable) : null,
        checks,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ profile, checks }));
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client?.close().catch(() => {});
    if (page) await page.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (child && child.exitCode === null)
      await until(() => child.exitCode !== null, 'host exit').catch(() => {
        child.kill();
        process.exitCode = 1;
      });
    await browser?.close().catch(() => {});
  });
