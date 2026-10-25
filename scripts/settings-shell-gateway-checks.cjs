const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { shellRegions, defaultShellId } = require('../out/main/shared/shell');
const active = 'fixture.settings-shell-active',
  disabled = 'fixture.settings-shell-disabled';
module.exports = async ({ page, client, profile, local, checks, tool, value, until }) => {
  const tools = JSON.stringify((await client.listTools()).tools),
    target = (await value('appdock_settings_list_targets', { query: 'shell' })).items.find(
      (item) => item.category === 'shell',
    );
  assert(target);
  const targetId = target.targetId,
    read = () => value('appdock_settings_get_values', { targetId }),
    deviceFile = path.join(profile, `settings-${require('node:os').hostname()}.json`),
    saved = () => JSON.parse(fs.readFileSync(deviceFile));
  const request = async (operations, dryRun = false) => {
    const state = await read();
    return {
      targetId,
      operations,
      dryRun,
      expectedRevision: state.revision,
      expectedSchemaRevision: state.schemaRevision,
      requestId: randomUUID(),
    };
  };
  const apply = async (operations, dryRun = false) =>
    value('appdock_settings_apply', await request(operations, dryRun));
  const schema = await value('appdock_settings_get_schema', { targetId });
  assert.deepEqual(
    schema.items.map((field) => field.key),
    shellRegions.map((region) => region.id),
  );
  for (const { id } of shellRegions) {
    const candidates = await value('appdock_settings_list_options', { targetId, key: id });
    assert.deepEqual(
      candidates.items.map((option) => option.value),
      [defaultShellId, active, disabled],
    );
  }
  const aiBytes = fs.readFileSync(path.join(local, 'ai-keys.json')),
    ttsBytes = fs.readFileSync(path.join(local, 'tts-key.json')),
    before = fs.readFileSync(path.join(profile, 'settings.json')),
    changes = Object.fromEntries(shellRegions.map(({ id }) => [id, active]));
  const preview = await apply([{ kind: 'set', changes }], true);
  assert.equal(preview.completion, 'validated');
  assert.equal(preview.effectVerified, false);
  assert.deepEqual(fs.readFileSync(path.join(profile, 'settings.json')), before);
  const snapshot = () => page.evaluate(() => window.dock.snapshot());
  assert(
    (await snapshot()).shellRegions.regions.every(
      (region) => region.configuredProvider === defaultShellId,
    ),
  );
  const saveRequest = await request([{ kind: 'set', changes }]),
    result = await value('appdock_settings_apply', saveRequest);
  assert.equal(result.completion, 'settingsSaved');
  assert.deepEqual(await value('appdock_settings_apply', saveRequest), result);
  await until(async () => {
    const state = (await snapshot()).shellRegions.regions;
    return (
      state.every((region) => region.configuredProvider === active) &&
      state
        .filter((region) => ['titlebar', 'ribbon', 'statusbar'].includes(region.region))
        .every((region) => region.boundProvider === active && region.ready)
    );
  }, 'MCP Shell save reaches existing hosts');
  assert.deepEqual(saved().host.shellProviders, changes);
  assert.deepEqual(fs.readFileSync(path.join(profile, 'settings.json')), before);
  checks.push(
    'Shell MCP derives all regions and per-region choices from shared declarations; dryRun is inert, save/replay switches existing bars and ribbon, and dotted region IDs persist intact',
  );

  await page.evaluate(() => window.dock.navigate('settings'));
  await page.getByTestId('settings-nav:appearance').click();
  const titlebar = page.getByTestId('shell-provider-titlebar');
  await until(
    async () => (await titlebar.inputValue()) === active,
    'Shell selection UI received MCP save',
  );
  const stale = await request([{ kind: 'set', changes: { titlebar: disabled } }]);
  await titlebar.selectOption(defaultShellId);
  await until(
    async () =>
      (await read()).fields.find((field) => field.key === 'titlebar').value === defaultShellId,
    'Shell UI save reaches MCP',
  );
  assert.equal(
    (await tool('appdock_settings_apply', stale)).structuredContent.code,
    'REVISION_CONFLICT',
  );
  await apply([{ kind: 'set', changes: { statusbar: disabled } }]);
  await until(async () => {
    const state = (await snapshot()).shellRegions.regions.find(
      (region) => region.region === 'statusbar',
    );
    return (
      state.configuredProvider === disabled && state.boundProvider === defaultShellId && state.ready
    );
  }, 'disabled Shell keeps assignment and uses existing fallback');
  await until(
    async () => (await page.getByTestId('shell-provider-statusbar').inputValue()) === disabled,
    'disabled selection shown in UI',
  );
  assert.equal((await value('appdock_get_applet', { id: disabled })).applet.enabled, false);
  assert.notEqual((await value('appdock_get_applet', { id: disabled })).applet.state, 'running');
  await page.getByTestId('shell-provider-statusbar').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(profile, 'shell-selection.png') });
  checks.push(
    'Shell native UI and MCP share immediate saves and stale-edit rejection; disabled selection remains disabled and falls back per region without enabling or starting its Applet',
  );

  await apply([{ kind: 'reset', keys: shellRegions.map((region) => region.id) }]);
  await until(
    async () =>
      (await snapshot()).shellRegions.regions.every(
        (region) => region.configuredProvider === defaultShellId,
      ),
    'Shell reset restores default assignments',
  );
  assert((await read()).fields.every((field) => field.inherited && field.value === defaultShellId));
  assert.equal(saved().host?.shellProviders, undefined);
  assert.deepEqual(fs.readFileSync(path.join(profile, 'settings.json')), before);
  assert.deepEqual(fs.readFileSync(path.join(local, 'ai-keys.json')), aiBytes);
  assert.deepEqual(fs.readFileSync(path.join(local, 'tts-key.json')), ttsBytes);
  assert.equal(JSON.stringify((await client.listTools()).tools), tools);
  assert.equal((await value('appdock_get_info')).executable, false);
  checks.push(
    'Shell reset removes overrides without touching encrypted credentials or execute permission; fixed MCP tool definitions remain unchanged',
  );
};
module.exports.install = (root, profile) => {
  const file = path.join(profile, 'settings.json'),
    settings = JSON.parse(fs.readFileSync(file));
  for (const id of [active, disabled]) {
    const folder = path.join(profile, 'extensions', id);
    fs.cpSync(path.join(root, 'out/shells/default'), folder, { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'extension.json')));
    Object.assign(manifest, {
      id,
      name: 'Settings Shell fixture',
      minimumHostVersion: require('../package.json').version,
    });
    fs.writeFileSync(path.join(folder, 'extension.json'), JSON.stringify(manifest));
    settings.extensions[id] = { enabled: id === active, settings: {} };
  }
  fs.writeFileSync(file, JSON.stringify(settings));
};
