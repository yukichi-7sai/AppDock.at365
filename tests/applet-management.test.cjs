const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { SettingsStore } = require('../out/main/main/core/settings');
const { AppletManagement } = require('../out/main/main/core/applet-management');
const { AutomationApi } = require('../out/main/main/core/automation-api');
const { appletManagementId } = require('../out/main/shared/applet-management');
const { trayCommandGroups } = require('../out/main/main/core/tray-commands');
const { trayCommandCatalog, resolveTrayMenu } = require('../out/main/shared/tray-menu');
function fixture(t) {
  const root = path.resolve('.artifacts/applet-management-unit');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const settings = new SettingsStore(path.join(dir, 'settings.json'), path.join(dir, 'backups'));
  settings.load();
  t.after(() => settings.close());
  settings.updateExtension('test.provider', { enabled: true, settings: { retained: 7 } });
  let state = 'running',
    restarts = 0,
    finish;
  const applets = () => [
    {
      id: 'test.provider',
      displayName: 'Provider',
      runtime: 'node',
      enabled: settings.value.extensions['test.provider'].enabled,
      state,
      commands: [],
      tray: [],
    },
  ];
  const management = new AppletManagement({
    settings,
    applets,
    ready: () => true,
    reconcile: async () => {
      state = applets()[0].enabled ? 'running' : 'stopped';
    },
    restart: async () => {
      restarts++;
      if (finish) await finish;
    },
  });
  return {
    settings,
    management,
    applets,
    dir,
    restarts: () => restarts,
    hold: (p) => (finish = p),
  };
}
test('enable/disable persist and preserve settings; redundant changes and restart do not save', async (t) => {
  const f = fixture(t),
    revision = f.settings.revision;
  assert.equal((await f.management.run('test.provider', 'enable')).changed, false);
  await f.management.run('test.provider', 'restart');
  assert.equal(f.settings.revision, revision);
  assert.equal(f.restarts(), 1);
  await f.management.run('test.provider', 'disable');
  assert.deepEqual(JSON.parse(fs.readFileSync(f.settings.file)).extensions['test.provider'], {
    enabled: false,
    settings: { retained: 7 },
  });
  await assert.rejects(f.management.run('test.provider', 'restart'), { code: 'UNAVAILABLE' });
  assert.equal(f.restarts(), 1);
  await f.management.run('test.provider', 'enable');
  assert.equal(f.applets()[0].enabled, true);
});
test('unobserved external edit is adopted and rejected, never overwritten', async (t) => {
  const f = fixture(t),
    value = structuredClone(f.settings.value);
  value.host.theme = 'dark';
  fs.writeFileSync(f.settings.file, JSON.stringify(value));
  await assert.rejects(f.management.run('test.provider', 'disable'), { code: 'CONFLICT' });
  assert.equal(
    JSON.parse(fs.readFileSync(f.settings.file)).extensions['test.provider'].enabled,
    true,
  );
  assert.equal(f.settings.value.host.theme, 'dark');
});
test('local and external operations share per-Applet busy guard', async (t) => {
  const f = fixture(t);
  let release;
  f.hold(new Promise((r) => (release = r)));
  const pending = f.management.run('test.provider', 'restart');
  await assert.rejects(f.management.run('test.provider', 'disable'), { code: 'BUSY' });
  assert.equal(
    f.management.commands().every((c) => !c.available),
    true,
  );
  release();
  await pending;
  assert.equal(
    f.management.commands().every((c) => c.available),
    true,
  );
});
test('enable and disable use write while restart uses execute and rejects args without side effects', async (t) => {
  const f = fixture(t);
  let allowed = false,
    executable = true;
  const api = new AutomationApi({
    settings: f.settings,
    save: (v, r) => f.settings.save(v, r),
    appletManagement: f.management,
    manageable: () => allowed,
    executable: () => executable,
    writable: () => allowed,
    ready: () => true,
    applets: () => [],
    commands: () => [],
    execute: async () => {},
    version: 'test',
    instanceId: 'test',
  });
  const id = appletManagementId('test.provider', 'disable');
  await assert.rejects(api.call('commands.execute', { id }), {
    code: 'WRITE_DISABLED',
  });
  allowed = true;
  await assert.rejects(api.call('commands.execute', { id, args: { enabled: true } }), {
    code: 'INVALID_ARGUMENT',
  });
  assert.equal((await api.call('commands.execute', { id })).applet.enabled, false);
  allowed = false;
  await assert.rejects(
    api.call('commands.execute', { id: appletManagementId('test.provider', 'enable') }),
    { code: 'WRITE_DISABLED' },
  );
  allowed = true;
  executable = false;
  await api.call('commands.execute', { id: appletManagementId('test.provider', 'enable') });
  await assert.rejects(
    api.call('commands.execute', { id: appletManagementId('test.provider', 'restart') }),
    { code: 'EXECUTION_DISABLED' },
  );
  allowed = false;
  executable = true;
  await api.call('commands.execute', { id: appletManagementId('test.provider', 'restart') });
});
test('generated host commands stay discoverable while disabled and work as opt-in tray entries', async (t) => {
  const f = fixture(t),
    id = appletManagementId('test.provider', 'enable');
  f.settings.save({ ...f.settings.value, trayCommands: [id] }, f.settings.revision);
  await f.management.run('test.provider', 'disable');
  const list = f.management.commands();
  assert.equal(list.find((c) => c.id === id).available, true);
  assert.equal(list.find((c) => c.operation === 'restart').available, false);
  assert.equal(
    list.every((c) => c.extensionId === null),
    true,
  );
  assert.equal(trayCommandGroups(f.settings.value, f.applets())[0].commands[0].enabled, true);
  assert.equal(
    resolveTrayMenu(
      [{ id: 'test', type: 'command', command: id }],
      trayCommandCatalog(f.applets()),
    )[0].enabled,
    true,
  );
});
