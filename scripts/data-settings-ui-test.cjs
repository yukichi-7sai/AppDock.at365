const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const assert = require('node:assert/strict');
const { isolatedHost, until } = require('./data-settings-host.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `data-settings-ui-${Date.now()}`);
const file = require('./test-settings.cjs').file;
const deviceFile = file(profile, `settings-${os.hostname()}.json`);
const disk = (name) => JSON.parse(fs.readFileSync(name, 'utf8'));
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, { closeToTray: false, soundEnabled: false });
settings.gestures.enabled = false;
settings.globalShortcutCommands = [];
settings.keybindings = [];
settings.updates.checkHostOnStartup = settings.updates.checkAppletsOnStartup = false;
const id = 'fixture.data-settings';
settings.extensions[id] = { enabled: true, settings: {}, pages: { main: { display: 'window' } } };
settings.extensions['appdock.dotnet-demo'] = { enabled: true, settings: {} };
fs.writeFileSync(file(profile), JSON.stringify(settings));
// An obsolete file is deliberately present to catch accidental legacy loading.
fs.writeFileSync(path.join(profile, 'settings.json'), '{"obsolete":true}');
const fixture = path.join(profile, 'extensions', id);
fs.mkdirSync(fixture, { recursive: true });
fs.cpSync(
  path.join(root, '.artifacts/test-extensions/dotnet-demo'),
  path.join(profile, 'extensions/dotnet-demo'),
  { recursive: true },
);
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id,
    name: 'Data settings fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'worker.cjs',
    startupDelaySeconds: 0,
    capabilities: ['storage', 'pages'],
    commands: [
      { id: id + '.open', title: 'Open data fixture', activateOnExecute: true },
      { id: id + '.storage', title: 'Check Storage' },
    ],
    pages: [
      {
        id: 'main',
        title: 'Data fixture',
        source: 'local',
        ui: 'page.html',
        openCommand: id + '.open',
      },
    ],
  }),
);
fs.writeFileSync(path.join(fixture, 'page.html'), '<!doctype html><h1>Data fixture</h1>');
fs.writeFileSync(
  path.join(fixture, 'worker.cjs'),
  `exports.activate=async c=>{
  c.commands.register('${id}.open','Open data fixture',()=>c.pages.open('main'));
  c.commands.register('${id}.storage','Check Storage',async()=>{
    await c.storage.set('item',{value:'node-device'});
    await c.storage.set('item',{value:'node-shared'},'shared');
    if((await c.storage.get('item')).value!=='node-device' || (await c.storage.get('item','device')).value!=='node-device' || (await c.storage.get('item','shared')).value!=='node-shared')throw Error('Storage scopes leaked');
  });
};`,
);
const app = isolatedHost(profile, process.argv[2]);
const checks = [];
let host;
const command = (name) => host.evaluate((name) => window.dock.executeCommand(name), name);
const pageWindow = (fn) =>
  app.evaluate(({ BrowserWindow }, source) => {
    const w = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Data fixture');
    return w ? eval('(' + source + ')')(w) : null;
  }, fn.toString());
(async () => {
  try {
    host = await app.start();
    for (const owner of [id, 'appdock.dotnet-demo'])
      await until(
        async () =>
          (await host.evaluate(() => window.dock.snapshot())).extensions.find((e) => e.id === owner)
            ?.state === 'running',
        owner + ' running',
      );
    assert.equal(disk(path.join(profile, 'settings.json')).obsolete, true);
    assert.equal(disk(deviceFile).machineName, os.hostname());
    checks.push('data settings loaded; obsolete root file ignored and unchanged');
    await command(id + '.storage');
    await command('appdock.dotnet-demo.verify-storage');
    const storage = (owner, scope, key) =>
      path.join(
        profile,
        'data/storage',
        owner,
        scope === 'shared' ? 'shared' : 'devices/' + os.hostname(),
        key + '.json',
      );
    assert.deepEqual(disk(storage(id, 'device', 'item')), { value: 'node-device' });
    assert.deepEqual(disk(storage(id, 'shared', 'item')), { value: 'node-shared' });
    assert.equal(disk(storage('appdock.dotnet-demo', 'device', 'check')), 'dotnet-ok');
    assert.equal(disk(storage('appdock.dotnet-demo', 'shared', 'check')), 'dotnet-shared');
    assert(!fs.existsSync(path.join(profile, 'data/secrets')));
    assert(fs.existsSync(path.join(profile, 'local/secrets')));
    checks.push('Node and .NET Storage default/device/shared round trips; Secrets stay local');
    await command(id + '.open');
    await until(() => pageWindow((w) => w.isVisible()), 'Applet window visible');
    const expected = await pageWindow((w) => {
      w.setBounds({ x: 110, y: 100, width: 960, height: 660 });
      return w.getNormalBounds();
    });
    await until(
      () =>
        JSON.stringify(
          disk(deviceFile).uiState?.windows?.['page:fixture.data-settings:main']?.bounds,
        ) === JSON.stringify(expected),
      'Applet bounds saved',
    );
    await host.screenshot({ path: path.join(profile, 'host.png') });
    await app.close();
    host = await app.start();
    await until(
      async () =>
        (await host.evaluate(() => window.dock.snapshot())).extensions.find((e) => e.id === id)
          ?.state === 'running',
      'restarted Applet',
    );
    await command(id + '.open');
    await until(() => pageWindow((w) => w.isVisible()), 'restored Applet window');
    assert.deepEqual(await pageWindow((w) => w.getNormalBounds()), expected);
    await host.evaluate((id) => window.dock.toggleExtension(id, false), id);
    await until(async () => !(await pageWindow((w) => w.isVisible())), 'Applet stopped');
    checks.push('Applet window geometry survives host restart; stopping closes surface');
    await app.close();
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          ok: true,
          mode: process.argv[2] ? 'fixed' : 'source',
          executableHash: app.executableHash,
          checks,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ ok: true, profile, checks }));
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
