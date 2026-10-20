const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { SettingsStore, defaults } = require('../out/main/main/core/settings');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { ExtensionManager } = require('../out/main/main/core/extensions');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const root = path.resolve(__dirname, '..');
function temporary() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-applet-defaults-'));
  return dir;
}

test('new PC entries default ON while saved OFF and independent collection flags survive saves and restart', (t) => {
  const dir = temporary(),
    file = path.join(dir, 'settings.json'),
    shared = defaults();
  shared.extensions['fixture.saved-off'] = { enabled: false, settings: { retained: 7 } };
  fs.writeFileSync(file, JSON.stringify(shared));
  const collections = [
    {
      owner: 'fixture.fresh',
      definition: { key: 'items', source: 'local', ui: 'main.html', fields: [] },
    },
  ];
  const settings = new DeviceSettingsStore(
    file,
    path.join(dir, 'local'),
    'PC-A',
    () => collections,
  );
  t.after(() => {
    settings.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  settings.load();
  shared.extensions['fixture.fresh'] = {
    enabled: false,
    settings: { items: [{ id: 'new', name: 'New', enabled: false, display: 'page' }] },
  };
  fs.writeFileSync(file, JSON.stringify(shared));
  settings.reload();
  assert.equal(settings.value.extensions['fixture.fresh'].enabled, true);
  assert.equal(settings.value.extensions['fixture.fresh'].settings.items[0].enabled, true);
  assert.equal(settings.value.extensions['fixture.saved-off'].enabled, false);
  const next = structuredClone(settings.value);
  next.host.showHints = false;
  settings.save(next, settings.revision);
  assert.equal(settings.value.extensions['fixture.fresh'].enabled, true);
  settings.setLocalSettings('fixture.fresh', true, settings.revision);
  assert.equal(settings.value.extensions['fixture.fresh'].enabled, true);
  const off = structuredClone(settings.value);
  off.extensions['fixture.fresh'].enabled = false;
  off.extensions['fixture.fresh'].settings.items[0].enabled = false;
  settings.save(off, settings.revision);
  settings.reload();
  assert.equal(settings.value.extensions['fixture.fresh'].enabled, false);
  assert.equal(settings.value.extensions['fixture.fresh'].settings.items[0].enabled, false);
  assert.equal(settings.value.extensions['fixture.saved-off'].enabled, false);
  assert.equal(JSON.parse(fs.readFileSync(file)).extensions['fixture.fresh'].enabled, false);
});

test('unconfigured Applets start immediately or after their delay; saved OFF never starts or restarts', async (t) => {
  const dir = temporary(),
    settings = new SettingsStore(path.join(dir, 'settings.json'));
  settings.load();
  const directory = path.join(dir, 'extensions');
  for (const [id, delay] of [
    ['fixture.direct', 0],
    ['fixture.delayed', 1],
    ['fixture.off', 0],
  ]) {
    const target = path.join(directory, id);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(
      path.join(target, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id,
        name: id,
        version: '1.0.0',
        runtime: 'node',
        entry: 'index.cjs',
        startupDelaySeconds: delay,
        capabilities: ['settings'],
        settings: [
          {
            key: 'flag',
            title: 'Flag',
            type: 'boolean',
            default: false,
            automation: true,
            generateCommands: ['on', 'off', 'toggle'],
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(target, 'index.cjs'),
      'exports.activate=async()=>{};exports.deactivate=async()=>{};',
    );
  }
  settings.updateExtension('fixture.off', { enabled: false });
  const manager = new ExtensionManager({
    roots: [directory],
    settings,
    hostVersion: '0.69.1',
    nodeExecutable: process.execPath,
    nodeWorker: path.join(root, 'out/main/main/node-worker.js'),
    dotnetHost: path.join(root, '.artifacts/dotnet-host'),
    log: () => {},
    api: async () => null,
  });
  t.after(async () => {
    await manager.shutdown();
    settings.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  manager.discover();
  assert.equal(manager.snapshot().find((a) => a.id === 'fixture.direct').enabled, true);
  assert.equal(manager.shellProviders().find((a) => a.id === 'fixture.delayed').enabled, true);
  await manager.reconcile();
  assert.equal(manager.items.get('fixture.direct').state, 'running');
  assert.equal(manager.items.get('fixture.delayed').state, 'waiting');
  const end = Date.now() + 10000;
  while (manager.items.get('fixture.delayed').state === 'waiting' && Date.now() < end)
    await new Promise((r) => setTimeout(r, 25));
  while (manager.items.get('fixture.delayed').state === 'starting' && Date.now() < end)
    await new Promise((r) => setTimeout(r, 25));
  assert.equal(manager.items.get('fixture.delayed').state, 'running');
  assert.equal(manager.items.get('fixture.off').child, undefined);
  const generated = manager
    .commandCatalog(manager.items.get('fixture.direct'))
    .filter((c) => c.id.includes('.settings.'));
  assert.equal(generated.length, 3);
  assert(generated.every((c) => c.available));
  const commands = new SettingsCommands({
    settings,
    applets: () => manager.snapshot(),
    save: (v, r) => settings.save(v, r),
  });
  commands.execute('fixture.direct.settings.flag.on');
  assert.equal(settings.value.extensions['fixture.direct'].enabled, true);
  assert.equal(settings.value.extensions['fixture.direct'].settings.flag, true);
  const pid = manager.items.get('fixture.delayed').child.pid;
  await manager.restart('fixture.delayed', true);
  assert.equal(manager.items.get('fixture.delayed').state, 'running');
  assert.notEqual(manager.items.get('fixture.delayed').child.pid, pid);
  settings.updateExtension('fixture.direct', { enabled: false });
  await manager.reconcile();
  await manager.restart('fixture.direct', true);
  assert.equal(manager.items.get('fixture.direct').state, 'stopped');
  settings.updateExtension('fixture.off', { settings: { retained: 7 } });
  assert.equal(settings.value.extensions['fixture.off'].enabled, false);
  settings.updateExtension('fixture.partial', { settings: { retained: 7 } });
  assert.equal(settings.value.extensions['fixture.partial'].enabled, true);
});
