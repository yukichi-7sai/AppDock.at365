const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process'),
  { createHash } = require('node:crypto');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'audio-playback-ui-' + Date.now());
const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.mkdirSync(profile, { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.soundEnabled = false;
settings.keybindings = [];
settings.gestures.enabled = false;
settings.extensions['test.sound-lifetime'] = { enabled: true, settings: {} };
fs.writeFileSync(
  require('./test-settings.cjs').file(profile, 'settings.json'),
  JSON.stringify(settings),
);
const wave = Buffer.alloc(44 + 8000);
wave.write('RIFF');
wave.writeUInt32LE(wave.length - 8, 4);
wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20);
wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(8000, 24);
wave.writeUInt32LE(16000, 28);
wave.writeUInt16LE(2, 32);
wave.writeUInt16LE(16, 34);
wave.write('data', 36);
wave.writeUInt32LE(8000, 40);
const wav = path.join(profile, 'fixture.wav');
fs.writeFileSync(wav, wave);
const fixture = path.join(profile, 'extensions/test.sound-lifetime');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(path.join(fixture, 'fixture.wav'), wave);
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'test.sound-lifetime',
    name: 'Sound lifetime fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.cjs',
    capabilities: ['audio'],
    commands: [
      { id: 'test.sound-lifetime.play', title: 'Play sound' },
      { id: 'test.sound-lifetime.crash', title: 'Crash fixture' },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.cjs'),
  `exports.activate=async c=>{
    c.commands.register('test.sound-lifetime.play','Play sound',()=>c.audio.play(require('node:path').join(__dirname,'fixture.wav')));
    c.commands.register('test.sound-lifetime.crash','Crash fixture',()=>{setImmediate(()=>process.exit(1));});
  };`,
);
const until = async (fn, label) => {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    await new Promise((r) => setTimeout(r, 80));
  }
  throw Error(label);
};
let child,
  port,
  output = '',
  success = false,
  checks = [];
(async () => {
  try {
    port = await freePort();
    const env = { ...process.env, CODEX_HOME: path.join(profile, 'codex') };
    delete env.ELECTRON_RUN_AS_NODE;
    const exe = process.argv[2] ? path.join(profile, 'AppDock.at365.exe') : require('electron');
    if (process.argv[2]) {
      require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), exe);
      assert.equal(hash(exe), hash(process.argv[2]));
    }
    child = spawn(
      exe,
      [
        ...(process.argv[2] ? [] : [root]),
        '--test-profile=' + profile,
        '--test-local-state=' + path.join(profile, 'local'),
        '--inspect=' + port,
      ],
      { cwd: root, env, windowsHide: true, stdio: 'pipe' },
    );
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    await until(() => inspect(port, `${electronExpression}.app.isReady()`), 'host ready');
    await until(
      () =>
        inspect(
          port,
          `(async()=>{
      const e=${electronExpression};
      const w=e.webContents.getAllWebContents().find(w=>w.getURL().startsWith('appdock://host/'));
      return w ? w.executeJavaScript('window.dock.snapshot().then(s=>s.startupReady)') : false;
    })()`,
        ),
      'host startup complete',
    );
    await inspect(
      port,
      `(()=>{
      const e=${electronExpression};
      const req=process.getBuiltinModule('module').createRequire(e.app.getAppPath()+'/package.json');
      globalThis.audioFixture={req, events:[], active:0, peak:0, errors:[], windows:0};
      const f=globalThis.audioFixture, q=req('./out/main/main/core/audio-service').audioPlayback;
      f.version=e.app.getVersion();
      f.shellVersion=req('./out/shells/default/extension.json').version;
      const original=q.player;
      q.player=async r=>{
        f.active++; f.peak=Math.max(f.peak,f.active); f.events.push('start');
        try {await original(r);} finally {f.events.push('end');f.active--;}
      };
      e.app.on('browser-window-created',(_event,w)=>{
        w.webContents.on('page-title-updated',(_event,title)=>{if(title==='AppDock Audio')f.windows++;});
      });
      return true;
    })()`,
    );
    const versions = await inspect(
      port,
      '({host:audioFixture.version,shell:audioFixture.shellVersion})',
    );
    assert.equal(versions.host, require('../package.json').version);
    assert.equal(versions.shell, versions.host);
    fs.writeFileSync(path.join(profile, 'versions.json'), JSON.stringify(versions, null, 2));
    const command = (action) =>
      inspect(
        port,
        `(async()=>{
      const e=${electronExpression};
      const w=e.webContents.getAllWebContents().find(w=>w.getURL().startsWith('appdock://host/'));
      return w.executeJavaScript(${JSON.stringify("window.dock.executeCommand('appdock.settings.soundEnabled.")}+${JSON.stringify(action)}+"')");
    })()`,
      );
    await inspect(
      port,
      `(async()=>{
      const f=audioFixture,q=f.req('./out/main/main/core/audio-service').audioPlayback;
      await q.play({bytes:f.req('node:fs').readFileSync(${JSON.stringify(wav)}),playbackTimeoutMs:30000});
      return true;
    })()`,
    );
    assert.equal(await inspect(port, 'audioFixture.events.length'), 0);
    checks.push('saved OFF takes effect before first playback at startup and creates no player');
    await command('on');
    await inspect(
      port,
      `(()=>{
      const f=globalThis.audioFixture, bytes=f.req('node:fs').readFileSync(${JSON.stringify(wav)});
      const sound=f.req('./out/main/main/core/sounds').queueSound;
      const tts=f.req('./out/main/main/core/tts-player').playTtsWave;
      sound(${JSON.stringify(wav)},()=>true,()=>f.errors.push('notification'));
      tts(bytes,0.5,new AbortController().signal,1.5).catch(()=>f.errors.push('tts'));
      sound(${JSON.stringify(wav)},()=>true,()=>f.errors.push('preview'));
      sound('',()=>true,()=>f.errors.push('empty'));
      return true;
    })()`,
    );
    const result = await until(async () => {
      const f = await inspect(
        port,
        '({events:audioFixture.events,peak:audioFixture.peak,errors:audioFixture.errors,windows:audioFixture.windows})',
      );
      fs.writeFileSync(path.join(profile, 'playback-state.json'), JSON.stringify(f, null, 2));
      if (f.events.length < 6) {
        const states = await inspect(
          port,
          `(async()=>{
          const e=${electronExpression};
          return Promise.all(e.webContents.getAllWebContents().filter(w=>w.getTitle()==='AppDock Audio').map(async w=>({id:w.id,loading:w.isLoading(),state:await w.executeJavaScript('(()=>{const a=document.querySelector("audio");return a?{paused:a.paused,ended:a.ended,time:a.currentTime,duration:a.duration,ready:a.readyState,error:a.error?.code}:null})()')})));
        })()`,
        );
        fs.writeFileSync(path.join(profile, 'player-state.json'), JSON.stringify(states, null, 2));
      }
      return f.events.length >= 6 && f;
    }, 'three real playbacks');
    assert.deepEqual(result.events, ['start', 'end', 'start', 'end', 'start', 'end']);
    assert.equal(result.peak, 1);
    assert.deepEqual(result.errors, []);
    assert.equal(result.windows, 3);
    checks.push(
      'TTS, notification and preview use one real Electron player at a time; empty WAV creates none',
    );
    await inspect(
      port,
      `(()=>{
      const f=audioFixture, q=f.req('./out/main/main/core/audio-service').audioPlayback;
      const bytes=f.req('node:fs').readFileSync(${JSON.stringify(wav)});
      const active=new AbortController(), waiting=new AbortController();
      f.stopped=false;
      const one=q.play({bytes,signal:active.signal,playbackTimeoutMs:30000});
      const two=q.play({bytes,signal:waiting.signal,playbackTimeoutMs:30000});
      waiting.abort(); setTimeout(()=>active.abort(),100);
      Promise.all([one,two]).then(()=>f.stopped=true).catch(()=>f.errors.push('cancel'));
      return true;
    })()`,
    );
    await until(() => inspect(port, 'audioFixture.stopped'), 'cancellation');
    const canceled = await inspect(
      port,
      '({events:audioFixture.events,peak:audioFixture.peak,errors:audioFixture.errors})',
    );
    assert.equal(canceled.events.length, 8);
    assert.equal(canceled.peak, 1);
    assert.deepEqual(canceled.errors, []);
    checks.push(
      'queued cancellation creates no player; active cancellation destroys player before release',
    );
    await inspect(
      port,
      `(()=>{
      const f=audioFixture,q=f.req('./out/main/main/core/audio-service').audioPlayback;
      const bytes=f.req('node:fs').readFileSync(${JSON.stringify(wav)});
      f.mutedSettled=false;
      Promise.all([q.play({bytes,playbackTimeoutMs:30000}),q.play({bytes,playbackTimeoutMs:30000})])
        .then(()=>f.mutedSettled=true).catch(()=>f.errors.push('mute'));
      const sounds=f.req('./out/main/main/core/sounds');
      sounds.notificationSounds.setPaused(true);
      sounds.queueSound(${JSON.stringify(wav)},()=>true,()=>f.errors.push('locked'));
      return true;
    })()`,
    );
    await until(() => inspect(port, 'audioFixture.events.length===9'), 'active sound before OFF');
    await command('off');
    await until(
      () => inspect(port, 'audioFixture.mutedSettled'),
      'active and waiting settle after OFF',
    );
    await inspect(
      port,
      `(async()=>{
      const f=audioFixture,q=f.req('./out/main/main/core/audio-service').audioPlayback;
      await q.play({bytes:f.req('node:fs').readFileSync(${JSON.stringify(wav)}),playbackTimeoutMs:30000});
      f.req('./out/main/main/core/sounds').queueSound(${JSON.stringify(wav)},()=>true,()=>f.errors.push('muted'));
      return true;
    })()`,
    );
    await command('toggle');
    await inspect(
      port,
      `audioFixture.req('./out/main/main/core/sounds').notificationSounds.setPaused(false);true`,
    );
    // Allow deferred file reads to expose any incorrectly retained locked sound.
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(await inspect(port, 'audioFixture.events.length'), 10);
    await inspect(
      port,
      `(async()=>{
      const f=audioFixture,q=f.req('./out/main/main/core/audio-service').audioPlayback;
      await q.play({bytes:f.req('node:fs').readFileSync(${JSON.stringify(wav)}),playbackTimeoutMs:30000});
      return true;
    })()`,
    );
    const muted = await inspect(
      port,
      '({events:audioFixture.events,peak:audioFixture.peak,errors:audioFixture.errors})',
    );
    assert.equal(muted.events.length, 12);
    assert.equal(muted.peak, 1);
    assert.deepEqual(muted.errors, []);
    const persisted =
      new (require('../out/main/main/core/device-settings-store').DeviceSettingsStore)(
        require('./test-settings.cjs').file(profile),
        path.join(profile, 'local'),
        require('node:os').hostname(),
      );
    persisted.load();
    assert.equal(persisted.value.host.soundEnabled, true);
    checks.push(
      'generated OFF stops active, clears waiting/locked/new sounds; toggle ON plays fresh audio only',
    );
    await until(
      () =>
        inspect(
          port,
          `!audioFixture.req('./out/main/main/core/audio-service').audioPlayback.active`,
        ),
      'previous audio completed',
    );
    await inspect(
      port,
      `(()=>{
      const f=audioFixture, q=f.req('./out/main/main/core/audio-service').audioPlayback;
      f.lifetimeStarts=0; f.lifetimeStops=0; f.originalPlayer=q.player;
      q.player=async r=>{
        r.beforePlay?.();
        if(r.signal.aborted)return;
        f.lifetimeStarts++;
        await new Promise(resolve=>r.signal.addEventListener('abort',()=>{f.lifetimeStops++;resolve();},{once:true}));
      };
      return true;
    })()`,
    );
    const execute = (id) =>
      inspect(
        port,
        `(async()=>{
      const e=${electronExpression};
      const w=e.webContents.getAllWebContents().find(w=>w.getURL().startsWith('appdock://host/'));
      await w.executeJavaScript(${JSON.stringify(`window.dock.executeCommand(${JSON.stringify(id)})`)});
      return true;
    })()`,
      );
    await execute('test.sound-lifetime.play');
    await until(() => inspect(port, 'audioFixture.lifetimeStarts===1'), 'owner playback started');
    await execute('test.sound-lifetime.play');
    assert.equal(
      await inspect(
        port,
        `audioFixture.req('./out/main/main/core/sounds').notificationSounds.pending.length`,
      ),
      1,
    );
    await execute('appdock.applets.test.sound-lifetime.restart');
    await until(
      () =>
        inspect(
          port,
          `audioFixture.lifetimeStops===1 && !audioFixture.req('./out/main/main/core/sounds').notificationSounds.active`,
        ),
      'restart cancels active owner sound',
    );
    assert.equal(
      await inspect(
        port,
        `audioFixture.req('./out/main/main/core/sounds').notificationSounds.pending.length`,
      ),
      0,
    );
    await execute('test.sound-lifetime.play');
    await until(
      () => inspect(port, 'audioFixture.lifetimeStarts===2'),
      'replacement owner can play',
    );
    await execute('test.sound-lifetime.crash');
    await until(
      () =>
        inspect(
          port,
          `audioFixture.lifetimeStops===2 && !audioFixture.req('./out/main/main/core/sounds').notificationSounds.active`,
        ),
      'crash cancels active owner sound',
    );
    assert.equal(await inspect(port, 'audioFixture.lifetimeStarts'), 2);
    assert.deepEqual(await inspect(port, 'audioFixture.errors'), []);
    await inspect(
      port,
      `(()=>{audioFixture.req('./out/main/main/core/audio-service').audioPlayback.player=audioFixture.originalPlayer;return true;})()`,
    );
    checks.push(
      'real Applet restart and crash cancel active/queued sounds; the replacement generation plays fresh audio',
    );
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'error.txt'), error.stack);
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (child) {
      await inspect(port, `${electronExpression}.app.quit()`).catch(() => {});
      try {
        await until(() => child.exitCode !== null, 'shutdown');
      } catch {
        child.kill();
        success = false;
        process.exitCode = 1;
      }
    }
    fs.writeFileSync(path.join(profile, 'process.log'), output);
    const result = {
      success,
      profile,
      checks,
      version: require('../package.json').version,
      portable: process.argv[2] ? { sha256: hash(process.argv[2]) } : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
