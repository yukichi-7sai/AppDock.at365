const { launchTestHost } = require('./electron-test-launcher.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(root, '.artifacts/file-watch-sounds-ui-'));
const sounds = path.join(profile, 'data/assets/applets/fixture.sounds/sounds');
const assets = path.join(profile, 'fixture-applet');
const local = path.join(profile, 'local');
fs.mkdirSync(sounds, { recursive: true });
fs.mkdirSync(assets);
fs.writeFileSync(path.join(assets, 'index.html'), '<!doctype html><title>Sound fixture</title>');
fs.writeFileSync(path.join(assets, 'observer.js'), '({ready:true})');
const wave = Buffer.alloc(44);
wave.write('RIFF');
wave.write('WAVE', 8);
fs.writeFileSync(path.join(sounds, 'Initial.WAV'), wave);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.keybindings = [];
settings.globalShortcutCommands = [];
settings.gestures.enabled = false;
fs.writeFileSync(
  require('./test-settings.cjs').file(profile, 'settings.json'),
  JSON.stringify(settings),
);
const portable = process.argv[2] && path.resolve(process.argv[2]);
const executable = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (portable) {
  require('./copy-host.cjs').copyHost(portable, executable);
  assert.equal(hash(portable), hash(executable));
}
const checks = [];
let app;
async function until(check, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw Error(label);
}
const inspect = () =>
  app.evaluate(() => ({
    files: soundFixture.controller.snapshot().registeredSounds,
    selected: soundFixture.controller.snapshot().accounts[0].sound,
    scans: soundFixture.scans,
    jobs: soundFixture.jobs.size,
    errors: soundFixture.errors,
  }));
async function main() {
  const env = { ...process.env, CODEX_HOME: path.join(profile, 'codex') };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await launchTestHost({
    portable: !!portable,
    mainInspector: true,
    executablePath: executable,
    args: [
      ...(portable ? [] : [root]),
      '--test-profile=' + profile,
      '--test-local-state=' + path.join(profile, 'host-local'),
    ],
    env,
  });
  await app.evaluate(
    async ({ app }, data) => {
      const path = process.mainModule.require('node:path');
      const native = process.mainModule.require('node:fs');
      const moduleAt = (name) =>
        process.mainModule.require(path.join(app.getAppPath(), 'out/main/main/core', name));
      const { FileWatchAssistance } = moduleAt('file-watch-assistance.js');
      const api = moduleAt('web-accounts.js');
      const fixture = (globalThis.soundFixture = {
        scans: 0,
        suppress: false,
        errors: [],
        jobs: new Set(),
      });
      fixture.originalWatch = native.watch;
      fixture.originalReadDirectory = native.promises.readdir;
      native.watch = (directory, callback) =>
        directory === data.sounds
          ? fixture.originalWatch(directory, (...event) => {
              if (!fixture.suppress) callback(...event);
            })
          : fixture.originalWatch(directory, callback);
      native.promises.readdir = async (directory, ...args) => {
        if (directory === data.sounds) fixture.scans++;
        return fixture.originalReadDirectory(directory, ...args);
      };
      fixture.assistance = new FileWatchAssistance({
        failed: () => fixture.errors.push('assistance failed'),
      });
      const register = fixture.assistance.register.bind(fixture.assistance);
      fixture.assistance.register = (id, check) => {
        fixture.jobs.add(id);
        const release = register(id, check);
        return () => {
          fixture.jobs.delete(id);
          release();
        };
      };
      app.on('session-created', (ses) => {
        if (ses.storagePath?.startsWith(data.local))
          ses.protocol.handle(
            'https',
            () =>
              new Response('<!doctype html><title>Offline</title>', {
                headers: { 'content-type': 'text/html' },
              }),
          );
      });
      fixture.api = api;
      fixture.create = () =>
        api.getWebAccounts(
          'fixture.sounds',
          'Sound fixture',
          data.assets,
          data.local,
          {
            url: 'https://sound.fixture.test/',
            observeOrigin: 'https://sound.fixture.test',
            origins: ['https://sound.fixture.test'],
            ui: 'index.html',
            observer: 'observer.js',
          },
          {
            soundsDirectory: data.sounds,
            assistance: fixture.assistance,
            capabilities: ['audio'],
            shortcut: () => false,
            failed: (message) => fixture.errors.push(message),
          },
        );
      fixture.controller = fixture.create();
      await fixture.controller.start();
      fixture.assistance.start();
      for (let i = 0; i < 4; i++) await fixture.controller.start();
      const account = fixture.controller.snapshot().accounts[0].id;
      await fixture.controller.invoke('setSound', [
        account,
        { enabled: true, file: 'Initial.WAV' },
      ]);
    },
    { sounds, assets, local },
  );
  let state = await inspect();
  assert.deepEqual(state.files, ['Initial.WAV']);
  assert.equal(state.jobs, 1);
  const idleScans = state.scans;
  await app.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2300)));
  assert.equal((await inspect()).scans, idleScans);
  checks.push(
    'initial names and selection are available; repeated start and idle OFF perform no periodic scan',
  );
  fs.writeFileSync(path.join(sounds, 'Arrived.wav'), wave);
  await until(async () => (await inspect()).files.includes('Arrived.wav'), 'OFF native arrival');
  fs.unlinkSync(path.join(sounds, 'Arrived.wav'));
  await until(async () => !(await inspect()).files.includes('Arrived.wav'), 'OFF native removal');
  checks.push('native notifications update arrival/removal while assistance is OFF');
  await app.evaluate(() => {
    soundFixture.suppress = true;
  });
  fs.writeFileSync(path.join(sounds, 'Missed.wav'), wave);
  const missedScans = (await inspect()).scans;
  await app.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2300)));
  state = await inspect();
  assert(!state.files.includes('Missed.wav'));
  assert.equal(state.scans, missedScans);
  await app.evaluate(() =>
    soundFixture.assistance.configure({ enabled: true, intervalSeconds: 2.5 }),
  );
  await until(async () => (await inspect()).files.includes('Missed.wav'), 'assisted missed event');
  checks.push(
    'a deliberately suppressed notification waits while OFF and is recovered by 2.5-second shared assistance',
  );
  await app.evaluate(async () => {
    await soundFixture.api.closeWebAccounts('fixture.sounds');
    if (soundFixture.jobs.size !== 0) throw Error('sound registration retained after stop');
    soundFixture.suppress = false;
    soundFixture.controller = soundFixture.create();
    await soundFixture.controller.start();
  });
  state = await inspect();
  assert.equal(state.jobs, 1);
  assert.equal(state.selected.file, 'Initial.WAV');
  assert.equal(state.selected.enabled, true);
  assert(state.files.includes('Missed.wav'));
  assert.deepEqual(state.errors, []);
  assert(fs.readFileSync(path.join(sounds, 'Initial.WAV')).equals(wave));
  checks.push(
    'stop releases registration; reactivation preserves selected sound, files and initial listing',
  );
  const result = {
    passed: true,
    profile,
    mode: portable ? 'portable' : 'source',
    executableHash: portable && hash(executable),
    checks,
  };
  fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!app) return;
    await app
      .evaluate(async () => {
        const f = globalThis.soundFixture;
        if (!f) return;
        await f.api.closeWebAccounts('fixture.sounds');
        f.assistance.dispose();
        const native = process.mainModule.require('node:fs');
        native.watch = f.originalWatch;
        native.promises.readdir = f.originalReadDirectory;
      })
      .catch(() => {});
    await app.close();
  });
