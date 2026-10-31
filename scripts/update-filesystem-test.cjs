const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { getPublishDirectory } = require('./publish-paths.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.artifacts', `update-filesystem-${Date.now()}`);
const published = process.argv[2] && path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: true });

async function probe(load, directory, sourceAsar, helper, expectedHash) {
  const path = load('node:path'),
    { createHash } = load('node:crypto');
  const { physicalFs: fs } = load('./out/main/main/core/physical-fs.js');
  const { PortableUpdates } = load('./out/main/main/core/portable-updates.js');
  const { createDefaultSettings } = load('./out/main/shared/settings-schema.js');
  const check = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const source = path.join(directory, 'source'),
    destination = path.join(directory, 'extensions/fixture.asar');
  fs.mkdirSync(path.join(source, 'resources'), { recursive: true });
  fs.mkdirSync(destination, { recursive: true });
  const manifest = {
    apiVersion: 1,
    id: 'fixture.asar',
    name: 'ASAR fixture',
    version: '2.0.0',
    runtime: 'node',
    entry: 'index.cjs',
  };
  fs.writeFileSync(path.join(source, 'extension.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(source, 'index.cjs'), 'exports.activate = () => {};');
  fs.copyFileSync(sourceAsar, path.join(source, 'resources/app.asar'));
  fs.writeFileSync(path.join(destination, 'preserved.txt'), 'installed data');
  const settings = createDefaultSettings().updates;
  const notices = [],
    created = [];
  let approvals = 0,
    archive;
  const target = {
    id: manifest.id,
    name: manifest.name,
    kind: 'applet',
    version: '1.0.0',
    source,
    destination,
  };
  const options = {
    targets: () => [target],
    settings: () => settings,
    hostVersion: load('./package.json').version,
    helper,
    baseDirectory: directory,
    executable: path.join(directory, 'AppDock.exe'),
    restartArgs: [],
    changed() {},
    notified: (notice) => notices.push(notice.kind),
    shutdown() {
      throw Error('Cancelled operation restarted');
    },
    processIds: () => [],
    log() {},
    confirm: async () => {
      approvals++;
      check(created.length === 1, 'Expected one owned staging directory');
      archive = path.join(created[0], 'payload-0/resources/app.asar');
      check(fs.statSync(archive).isFile(), 'ASAR must be a physical file');
      check(hash(archive) === expectedHash, 'ASAR bytes changed while staging');
      return false;
    },
  };
  const mkdtemp = fs.promises.mkdtemp;
  fs.promises.mkdtemp = async (...args) => {
    const value = await mkdtemp(...args);
    created.push(value);
    return value;
  };
  try {
    await new PortableUpdates(options).install('all');
  } finally {
    fs.promises.mkdtemp = mkdtemp;
  }
  check(approvals === 1, 'Update never reached confirmation');
  check(
    created.every((file) => !fs.existsSync(file)),
    'Cancelled ASAR payload was not removed',
  );
  check(
    fs.readFileSync(path.join(destination, 'preserved.txt'), 'utf8') === 'installed data',
    'Cancellation changed installed data',
  );
  check(hash(path.join(source, 'resources/app.asar')) === expectedHash, 'Source ASAR changed');
  check(!notices.includes('error'), 'Unexpected update error');
  const unpublished = new PortableUpdates({
    ...options,
    targets: () => [{ ...target, source: 'github:fixture/unpublished' }],
    fetcher: async () => new Response('{}', { status: 404 }),
  });
  await unpublished.install('all');
  check(
    unpublished.state.results[0].status === 'unpublished',
    'Release 404 was treated as failure',
  );
  check(unpublished.state.notice.kind === 'info', 'No-update result must be informational');
  return {
    electron: process.versions.electron,
    physicalArchive: true,
    cancelledCleanup: true,
    originalPreserved: true,
    unpublished: unpublished.state.results[0].status,
    notice: unpublished.state.notice.kind,
    createdDirectories: created,
    archiveSha256: expectedHash,
  };
}

async function until(fn, message) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error(message);
}
(async () => {
  let child, inspector;
  const result = { ok: false, output, published };
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    if (!published) {
      const sourceAsar = path.join(getPublishDirectory(root), 'win-unpacked/resources/app.asar');
      const expected = createHash('sha256').update(fs.readFileSync(sourceAsar)).digest('hex');
      const bootstrap = path.join(output, 'main.cjs');
      fs.writeFileSync(
        bootstrap,
        `const {app}=require('electron');app.setPath('userData',${JSON.stringify(path.join(output, 'local'))});app.whenReady().then(async()=>{try{const load=require('node:module').createRequire(${JSON.stringify(path.join(root, 'package.json'))});const result=await(${probe.toString()})(load,${JSON.stringify(output)},${JSON.stringify(sourceAsar)},${JSON.stringify(path.join(root, '.artifacts/updater/AppDock.Updater.exe'))},${JSON.stringify(expected)});require('original-fs').writeFileSync(${JSON.stringify(path.join(output, 'probe.json'))},JSON.stringify(result,null,2));app.quit();}catch(error){console.error(error);app.exit(1);}});`,
      );
      child = spawn(require('electron'), [bootstrap], {
        env,
        cwd: root,
        windowsHide: true,
        stdio: 'inherit',
      });
      const code = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', resolve);
      });
      assert.equal(code, 0);
      result.probe = JSON.parse(fs.readFileSync(path.join(output, 'probe.json')));
    } else {
      const executable = path.join(output, 'runtime/AppDock.at365.exe');
      fs.mkdirSync(path.dirname(executable));
      require('./copy-host.cjs').copyHost(published, executable);
      const profile = path.join(output, 'profile');
      fs.mkdirSync(profile);
      const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
      Object.assign(settings.host, {
        hardwareAcceleration: false,
        notifications: false,
        soundEnabled: false,
        closeToTray: false,
      });
      settings.gestures.enabled = false;
      settings.touchpadGestures.enabled = false;
      settings.keybindings = [];
      settings.globalShortcutCommands = [];
      settings.updates.checkHostOnAboutOpen = false;
      fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
      inspector = await freePort();
      child = spawn(
        executable,
        [
          `--test-profile=${profile}`,
          `--test-local-state=${path.join(profile, 'local')}`,
          `--inspect=${inspector}`,
        ],
        { env, cwd: root, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      for (const stream of [child.stdout, child.stderr])
        stream.on('data', (chunk) => fs.appendFileSync(path.join(output, 'host.log'), chunk));
      const host = `${electronExpression}.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('appdock://host/'))`;
      await until(
        () =>
          inspect(
            inspector,
            `${host}?.webContents.executeJavaScript('window.dock.snapshot().then(s=>s.startupReady)')`,
          ),
        'fixed host startup',
      );
      const archive = path.join(path.dirname(executable), 'resources/app.asar');
      const expected = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
      result.probe = await inspect(
        inspector,
        `(${probe.toString()})(process.getBuiltinModule('module').createRequire(process.resourcesPath+'/app.asar/package.json'),${JSON.stringify(output)},${JSON.stringify(archive)},process.resourcesPath+'/updater/AppDock.Updater.exe',${JSON.stringify(expected)})`,
      );
      result.sha256 = createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
    }
    result.ok = true;
  } catch (error) {
    result.error = error.stack;
    process.exitCode = 1;
  } finally {
    if (inspector)
      await inspect(inspector, `${electronExpression}.app.quit();true`).catch(() => {});
    if (child && child.exitCode === null)
      await until(() => child.exitCode !== null, 'test shutdown');
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify(result));
})();
