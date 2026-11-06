const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { launch } = require('./page-test-host.cjs');
const { wave } = require('./sound-library-fixture.cjs');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(root, '.artifacts/audio-formats-ui-'));
const fixtureRoot = path.resolve(
  process.argv[3] || path.join(root, '.artifacts/audio-codec-fixtures'),
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.soundEnabled = true;
settings.host.closeToTray = false;
settings.keybindings = [];
settings.gestures.enabled = false;
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
const source = path.join(profile, 'source');
fs.mkdirSync(source);
for (const ext of ['mp3', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'webm'])
  fs.copyFileSync(path.join(fixtureRoot, 'sample.' + ext), path.join(source, 'sample.' + ext));
fs.copyFileSync(path.join(source, 'sample.ogg'), path.join(source, 'sample.oga'));
fs.writeFileSync(path.join(source, 'sample.wav'), wave(500));
// Large PCM playback is cancelled after it starts; the test never waits for the full duration.
const large = Buffer.alloc(44 + 18 * 1024 * 1024);
wave(1).copy(large, 0, 0, 44);
large.writeUInt32LE(large.length - 8, 4);
large.writeUInt32LE(large.length - 44, 40);
large.writeUInt16LE(2, 22);
large.writeUInt32LE(192000, 24);
large.writeUInt32LE(192000 * 8, 28);
large.writeUInt16LE(8, 32);
large.writeUInt16LE(32, 34);
fs.writeFileSync(path.join(source, 'large.wav'), large);
fs.writeFileSync(path.join(source, 'invalid.mp3'), Buffer.from('ID3invalid audio'));
let host,
  success = false,
  result;
(async () => {
  try {
    host = await launch(profile, process.argv[2]);
    result = await host.app.evaluate(
      async (electron, input) => {
        const req = process
          .getBuiltinModule('module')
          .createRequire(electron.app.getAppPath() + '/package.json');
        const fs = req('node:fs/promises'),
          path = req('node:path');
        const { RegisteredSoundLibrary } = req('./out/main/main/core/registered-sound-library');
        const { AssignedAssets } = req('./out/main/main/core/assigned-assets');
        const { audioPlayback } = req('./out/main/main/core/audio-service');
        const library = new RegisteredSoundLibrary(path.join(input.profile, 'data/assets/sounds'));
        const observed = [],
          checks = [];
        // Decode and run the real media pipeline without audible fixture sound.
        const created = (_event, window) => {
          window.webContents.setAudioMuted(true);
        };
        electron.app.on('browser-window-created', created);
        const original = audioPlayback.player;
        audioPlayback.player = async (request) => {
          observed.push({ file: request.file, bytes: !!request.bytes });
          return original(request);
        };
        try {
          for (const ext of ['wav', 'mp3', 'aac', 'm4a', 'flac', 'ogg', 'oga', 'opus', 'webm']) {
            const added = await library.addFile(
              path.join(input.source, 'sample.' + ext),
              '音/sample.' + ext,
            );
            const saved = await library.readFile(added.ref, added.generation);
            const retained = await new AssignedAssets(library.directory, 'sound').retainFile(
              added.ref,
              saved.hash,
              () => {},
            );
            await library.refresh(false, [retained.file]);
            const copy = await library.readFile(retained);
            let started = false;
            await audioPlayback.play({
              file: copy.file,
              hash: copy.hash,
              playbackTimeoutMs: 30000,
              beforePlay: () => {
                started = true;
              },
            });
            if (!started) throw Error('Playback did not start: ' + ext);
            checks.push({
              ext,
              duration: library.entry(added.ref).durationMs,
              hash: copy.hash,
              retained: retained.file,
            });
          }
          const big = await library.addFile(path.join(input.source, 'large.wav'), 'large.wav');
          const saved = await library.readFile(big.ref, big.generation);
          const controller = new AbortController();
          await audioPlayback.play({
            file: saved.file,
            hash: saved.hash,
            signal: controller.signal,
            playbackTimeoutMs: 30000,
            beforePlay: () => setTimeout(() => controller.abort(), 100),
          });
          let rejected = false;
          try {
            await library.addFile(path.join(input.source, 'invalid.mp3'), 'invalid.mp3');
          } catch {
            rejected = true;
          }
          if (!rejected || library.list().some((e) => e.ref.file === 'invalid.mp3'))
            throw Error('Invalid audio published');
          const windows = electron.BrowserWindow.getAllWindows().filter((w) =>
            w.getTitle().startsWith('AppDock Audio'),
          );
          if (windows.length) throw Error('Media windows leaked');
          return {
            checks,
            observed,
            largeBytes: (await fs.stat(saved.file)).size,
            rejected,
            version: electron.app.getVersion(),
            electron: process.versions.electron,
          };
        } finally {
          library.stop();
          audioPlayback.player = original;
          electron.app.removeListener('browser-window-created', created);
        }
      },
      { profile, source },
    );
    assert.equal(result.checks.length, 9);
    assert.ok(result.observed.every((r) => r.file && !r.bytes));
    assert.ok(result.largeBytes > 16 * 1024 * 1024);
    assert.equal(result.version, require('../package.json').version);
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'error.txt'), error.stack || String(error));
    throw error;
  } finally {
    if (host) await host.close();
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ success, ...result }, null, 2),
    );
    console.log(JSON.stringify({ success, profile, ...result }));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
