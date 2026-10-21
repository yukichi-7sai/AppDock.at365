const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { SettingsStore } = require('../out/main/main/core/settings');
const { AutomationApi } = require('../out/main/main/core/automation-api');
const { parseSettingDefinitions } = require('../out/main/shared/setting-definitions');
const {
  generatedSettingCommands,
  validateSettingCommandIds,
} = require('../out/main/shared/settings-commands');
const { hostCommands } = require('../out/main/shared/commands');
const { readManifest, ExtensionManager } = require('../out/main/main/core/extensions');

function fixture(t) {
  const root = path.resolve('.artifacts/settings-command-unit');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const settings = new SettingsStore(path.join(dir, 'settings.json'), path.join(dir, 'backups'));
  settings.load();
  t.after(() => settings.close());
  const fields = parseSettingDefinitions([
    {
      key: 'enabledFeature',
      title: 'Feature',
      type: 'boolean',
      default: true,
      automation: true,
      generateCommands: ['on', 'off', 'toggle'],
    },
    {
      key: 'privateFeature',
      title: 'Private',
      type: 'boolean',
      default: false,
      generateCommands: ['toggle'],
    },
    {
      key: 'count',
      title: 'Count',
      type: 'number',
      default: 5,
      minimum: 1,
      maximum: 10,
      automation: true,
    },
    {
      key: 'mode',
      title: 'Mode',
      type: 'select',
      default: 'a',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      automation: true,
    },
    { key: 'secret', title: 'Secret', type: 'string', default: 'SECRET_DEFAULT' },
  ]);
  const applet = {
    id: 'test.unrelated-provider',
    displayName: 'Provider',
    runtime: 'node',
    enabled: true,
    state: 'running',
    settings: fields,
  };
  const next = structuredClone(settings.value);
  next.extensions[applet.id] = { enabled: true, settings: { secret: 'SECRET_VALUE' } };
  settings.save(next, settings.revision);
  const options = { settings, applets: () => [applet], save: (v, r) => settings.save(v, r) };
  const commands = new SettingsCommands(options);
  let write = true,
    execute = true;
  const api = new AutomationApi({
    ...options,
    settingsCommands: commands,
    commands: () => [],
    execute: async () => {
      throw Error('wrong dispatcher');
    },
    executable: () => execute,
    writable: () => write,
    ready: () => true,
    instanceId: 'test',
    version: 'test',
  });
  const run = (suffix, args) =>
    api.call('commands.execute', {
      id: applet.id + '.settings.' + suffix,
      ...(args === undefined ? {} : { args }),
    });
  return {
    settings,
    applet,
    commands,
    api,
    run,
    options,
    setWrite: (v) => (write = v),
    setExecute: (v) => (execute = v),
  };
}
test('custom accent API validates HEX in dryRun, saves the pair atomically, and retains revision/permission checks', async (t) => {
  const f = fixture(t);
  const changes = {
    accentColor: 'custom',
    customAccentDark: '#123456',
    customAccentLight: '#FEDCBA',
  };
  const revision = f.commands.revision();
  const before = fs.readFileSync(f.settings.file, 'utf8');
  for (const key of ['customAccentDark', 'customAccentLight'])
    assert.throws(
      () =>
        f.commands.execute('appdock.settings.update', {
          changes: { ...changes, [key]: '#xyz123' },
          expectedRevision: revision,
          dryRun: true,
        }),
      (e) => e.code === 'INVALID_ARGUMENT',
    );
  const dry = f.commands.execute('appdock.settings.update', {
    changes,
    expectedRevision: revision,
    dryRun: true,
  });
  assert.equal(dry.values.customAccentDark, changes.customAccentDark);
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), before);
  f.setWrite(false);
  await assert.rejects(() =>
    f.api.call('commands.execute', {
      id: 'appdock.settings.update',
      args: { changes, expectedRevision: revision },
    }),
  );
  assert.equal(f.commands.revision(), revision);
  f.setWrite(true);
  await f.api.call('commands.execute', {
    id: 'appdock.settings.update',
    args: { changes, expectedRevision: revision },
  });
  for (const [key, value] of Object.entries(changes))
    assert.equal(f.settings.value.host[key], value);
  assert.throws(
    () =>
      f.commands.execute('appdock.settings.update', {
        changes: { accentColor: 'mint' },
        expectedRevision: revision,
      }),
    (e) => e.code === 'REVISION_CONFLICT',
  );
});
for (const field of ['soundEnabled', 'showHints'])
  test(`${field} generates public ON/OFF/toggle commands with immediate persisted effects`, async (t) => {
    const f = fixture(t);
    const schema = f.api.call('settings.getSchema').fields[field];
    assert.equal(schema.type, 'boolean');
    assert.equal(schema.applies, 'immediate');
    assert.deepEqual(schema.generateCommands, ['on', 'off', 'toggle']);
    const catalog = f.api.call('commands.list').commands;
    for (const action of ['off', 'off', 'on', 'toggle']) {
      const id = 'appdock.settings.' + field + '.' + action;
      assert.ok(catalog.some((c) => c.id === id));
      assert.ok(hostCommands.some((c) => c.id === id));
      const result = await f.api.call('commands.execute', { id });
      assert.equal(result.completion, 'settingsSaved');
      assert.equal(f.settings.value.host[field], action === 'on');
      const raw = JSON.parse(fs.readFileSync(f.settings.file));
      assert.equal(raw.host?.[field], action === 'on' ? undefined : false);
      assert.equal(
        require('../out/main/shared/settings-schema').parseSettings(raw).host[field],
        action === 'on',
      );
    }
    f.setWrite(false);
    await assert.rejects(() =>
      f.api.call('commands.execute', { id: 'appdock.settings.' + field + '.on' }),
    );
    assert.equal(f.settings.value.host[field], false);
  });

test('manifest accepts generated shortcut references and reserves host namespace', (t) => {
  const f = fixture(t),
    dir = path.dirname(f.settings.file);
  fs.writeFileSync(path.join(dir, 'entry.cjs'), 'exports.activate=async()=>{};');
  const id = f.applet.id,
    command = id + '.settings.enabledFeature.toggle';
  const manifest = {
    apiVersion: 1,
    id,
    name: 'Settings fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'entry.cjs',
    capabilities: ['settings'],
    settings: f.applet.settings,
    commands: [],
    defaultKeybindings: [
      { command, key: 'Ctrl+F10', enabled: true, when: { scope: 'owner', appletIds: [] } },
    ],
  };
  const read = () => {
    fs.writeFileSync(path.join(dir, 'extension.json'), JSON.stringify(manifest));
    return readManifest(dir);
  };
  const parsed = read();
  assert.equal(parsed.defaultKeybindings[0].command, command);
  const manager = new ExtensionManager({ roots: [], settings: f.settings, log: () => {} });
  const entry = { manifest: parsed, state: 'running', commands: [] };
  assert.equal(manager.commandCatalog(entry).find((c) => c.id === command).available, true);
  entry.state = 'stopped';
  assert.equal(manager.commandCatalog(entry).find((c) => c.id === command).available, false);
  manifest.commands = [{ id: command, title: 'Collision' }];
  assert.throws(read);
  manifest.commands = [];
  manifest.capabilities = [];
  assert.throws(read);
  manifest.capabilities = ['settings'];
  manifest.id = 'appdock';
  assert.throws(read);
});
test('Applet declarations drive schemas, updates and generated commands without exposing private data', async (t) => {
  const f = fixture(t),
    scope = { appletId: f.applet.id };
  assert.deepEqual(Object.keys(f.api.call('settings.getSchema', scope).fields), [
    'enabledFeature',
    'count',
    'mode',
  ]);
  const read = f.api.call('settings.get', scope);
  assert.deepEqual(read.values, { enabledFeature: true, count: 5, mode: 'a' });
  const catalog = f.api.call('commands.list').commands;
  assert.equal(catalog.filter((c) => c.appletId === f.applet.id).length, 4);
  const update = catalog.find((c) => c.id === f.applet.id + '.settings.update');
  assert.deepEqual(update.inputSchema.required, ['changes', 'expectedRevision']);
  assert.ok(!JSON.stringify([catalog, read]).includes('SECRET'));
  const preview = await f.run('update', {
    changes: { count: 9, mode: 'b' },
    expectedRevision: read.revision,
    dryRun: true,
  });
  assert.equal(preview.completion, 'validated');
  assert.equal(f.api.call('settings.get', scope).values.count, 5);
  const saved = await f.run('update', {
    changes: { count: 9, mode: 'b' },
    expectedRevision: read.revision,
  });
  assert.equal(saved.completion, 'settingsSaved');
  assert.equal(saved.effectVerified, false);
  assert.deepEqual(saved.changed, ['count', 'mode']);
  assert.equal(saved.applies.count, 'settingsChanged');
  assert.equal(f.settings.value.extensions[f.applet.id].settings.secret, 'SECRET_VALUE');
  await assert.rejects(
    f.run('update', { changes: { count: 3 }, expectedRevision: read.revision }),
    { code: 'REVISION_CONFLICT' },
  );
});
test('switch commands share persistence, preserve no-ops, and private switches stay local', async (t) => {
  const f = fixture(t);
  const revision = f.commands.revision();
  assert.deepEqual((await f.run('enabledFeature.on')).changed, []);
  assert.equal(f.commands.revision(), revision);
  assert.equal((await f.run('enabledFeature.off')).values.enabledFeature, false);
  assert.equal((await f.run('enabledFeature.toggle')).values.enabledFeature, true);
  f.commands.execute(f.applet.id + '.settings.enabledFeature.toggle', {}, false);
  assert.equal(f.commands.get(f.applet.id).values.enabledFeature, false);
  await assert.rejects(f.run('privateFeature.toggle'), { code: 'NOT_FOUND' });
  f.commands.execute(f.applet.id + '.settings.privateFeature.toggle', {}, false);
  assert.equal(f.settings.value.extensions[f.applet.id].settings.privateFeature, true);
  assert.equal(
    hostCommands.some((c) => c.id.startsWith('appdock.settings.notifications.')),
    false,
  );
  assert.equal(generatedSettingCommands(f.applet.id, f.applet.settings, true).length, 4);
});
test('writes and switches require both permissions and current running/public state', async (t) => {
  const f = fixture(t),
    before = structuredClone(f.settings.value);
  f.setWrite(false);
  await assert.rejects(f.run('enabledFeature.toggle'), { code: 'WRITE_DISABLED' });
  f.setWrite(true);
  f.setExecute(false);
  await assert.rejects(f.run('enabledFeature.toggle'), { code: 'EXECUTION_DISABLED' });
  f.setExecute(true);
  for (const state of ['stopped', 'waiting', 'starting', 'stopping', 'error']) {
    f.applet.state = state;
    await assert.rejects(f.run('enabledFeature.toggle'), { code: 'UNAVAILABLE' });
  }
  f.applet.state = 'running';
  f.applet.enabled = false;
  await assert.rejects(f.run('enabledFeature.toggle'), { code: 'UNAVAILABLE' });
  f.applet.enabled = true;
  f.applet.settings[0].automation = false;
  await assert.rejects(f.run('enabledFeature.toggle'), { code: 'NOT_FOUND' });
  assert.deepEqual(f.settings.value, before);
});
test('invalid args/unknown keys/types/ranges/options cannot partially update settings', async (t) => {
  const f = fixture(t),
    before = structuredClone(f.settings.value),
    expectedRevision = f.commands.revision();
  for (const changes of [
    { count: 0 },
    { count: 11 },
    { count: NaN },
    { count: '2' },
    { mode: 'missing' },
    { enabledFeature: 'true' },
    { count: 2, secret: 'leak' },
    JSON.parse('{"__proto__":true}'),
  ])
    await assert.rejects(f.run('update', { changes, expectedRevision }), {
      code: 'INVALID_ARGUMENT',
    });
  for (const args of [
    null,
    [],
    true,
    { extra: true },
    { changes: {} },
    { changes: { count: 2 }, expectedRevision, extra: true },
  ])
    await assert.rejects(f.run('update', args), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(f.run('enabledFeature.toggle', { value: true }), {
    code: 'INVALID_ARGUMENT',
  });
  assert.deepEqual(f.settings.value, before);
  assert.throws(() => f.api.call('settings.get', { appletId: 'unknown' }), { code: 'NOT_FOUND' });
  assert.throws(() => f.api.call('settings.patch'), { code: 'NOT_FOUND' });
});
test('toggle detects unseen disk changes and never retries or overwrites invalid files', async (t) => {
  const f = fixture(t),
    incoming = structuredClone(f.settings.value);
  incoming.extensions[f.applet.id].settings.enabledFeature = false;
  fs.writeFileSync(f.settings.file, JSON.stringify(incoming));
  await assert.rejects(f.run('enabledFeature.toggle'), { code: 'REVISION_CONFLICT' });
  assert.deepEqual(JSON.parse(fs.readFileSync(f.settings.file)), incoming);
  fs.writeFileSync(f.settings.file, '{broken');
  await assert.rejects(f.run('enabledFeature.on'), { code: 'REVISION_CONFLICT' });
  assert.equal(fs.readFileSync(f.settings.file, 'utf8'), '{broken');
});
test('invalid publication metadata and collisions with declared/runtime IDs or aliases are rejected', () => {
  const field = {
    key: 'flag',
    title: 'Flag',
    type: 'boolean',
    default: false,
    automation: true,
    generateCommands: ['toggle'],
  };
  for (const variant of [
    { automation: 'yes' },
    { generateCommands: [] },
    { generateCommands: ['bad'] },
    { generateCommands: ['on', 'on'] },
    { type: 'number' },
    { default: undefined },
    { dynamic: true },
  ])
    assert.throws(() => parseSettingDefinitions([{ ...field, ...variant }]));
  assert.throws(() => parseSettingDefinitions([{ ...field, type: 'object-list', fields: [] }]));
  assert.throws(() => parseSettingDefinitions([field], 1));
  for (const registered of [
    [{ id: 'test.settings.flag.toggle' }],
    [{ id: 'test.settings.update' }],
    [{ id: 'test.old', aliases: ['test.settings.flag.toggle'] }],
  ])
    assert.throws(() => validateSettingCommandIds('test', [field], registered));
  validateSettingCommandIds('test', [field], [{ id: 'test.run' }]);
});
