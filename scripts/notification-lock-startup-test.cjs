const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const assert = require('node:assert/strict'),
  { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'notification-lock-startup-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, label) => {
  const end = Date.now() + 30000;
  let lastError;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw Error(label + (lastError ? ': ' + lastError.message : ''));
};
async function prepareStartup(port, expression) {
  const [target] = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 0,
    paused;
  const pending = new Map(),
    scripts = new Map();
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error('inspector command: ' + method));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  let reached = false;
  let callFrameId;
  const mainPaused = new Promise((resolve) => {
    paused = resolve;
  });
  socket.onmessage = (event) => {
    const reply = JSON.parse(event.data);
    if (reply.id) {
      const request = pending.get(reply.id);
      pending.delete(reply.id);
      if (request) clearTimeout(request.timer);
      if (request)
        reply.error
          ? request.reject(Error(JSON.stringify(reply.error)))
          : request.resolve(reply.result);
    } else if (reply.method === 'Debugger.scriptParsed')
      scripts.set(reply.params.scriptId, reply.params.url);
    else if (reply.method === 'Debugger.paused') {
      const frame = reply.params.callFrames[0],
        url = frame.url || scripts.get(frame.location.scriptId) || '';
      if (url.replaceAll('\\', '/').endsWith('/out/main/main/index.js')) {
        reached = true;
        callFrameId = frame.callFrameId;
        paused();
      } else void call('Debugger.resume').catch(() => {});
    }
  };
  let timer;
  try {
    await call('Debugger.enable');
    await call('Debugger.setBreakpointByUrl', {
      urlRegex: 'out[/\\\\]main[/\\\\]main[/\\\\]index\\.js$',
      lineNumber: 0,
    });
    void call('Runtime.runIfWaitingForDebugger').catch(() => {});
    await Promise.race([
      mainPaused,
      new Promise(
        (_, reject) => (timer = setTimeout(() => reject(Error('main entry breakpoint')), 15000)),
      ),
    ]);
    const result = await call('Debugger.evaluateOnCallFrame', {
      callFrameId,
      expression,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    assert.equal(reached, true);
    await call('Debugger.resume');
  } finally {
    clearTimeout(timer);
    for (const request of pending.values()) clearTimeout(request.timer);
    socket.close();
  }
}
function wave() {
  const bytes = Buffer.alloc(4844);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
let child,
  server,
  port,
  output = '',
  requests = 0,
  success = false;
const checks = [];
(async () => {
  try {
    server = http.createServer(async (req, res) => {
      for await (const _chunk of req) {
      }
      requests++;
      res.setHeader('Content-Type', 'audio/wav');
      res.end(wave());
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
    settings.keybindings = [];
    settings.gestures.enabled = false;
    settings.host.hardwareAcceleration = false;
    settings.tts = {
      ...settings.tts,
      baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1',
      model: 'fixture',
      defaultVoice: 'fixture',
    };
    const id = 'fixture.lockstartup',
      folder = path.join(profile, 'extensions', id);
    fs.mkdirSync(folder, { recursive: true });
    settings.extensions[id] = { enabled: true, settings: {} };
    settings.notificationPreferences = {
      overrides: [
        {
          ownerKind: 'applet',
          ownerId: id,
          typeId: 'message',
          targets: ['banner', 'desktop', 'windows'],
          speak: true,
          durationSeconds: 1,
        },
      ],
    };
    fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
    const sound = path.join(profile, 'notice.wav');
    fs.writeFileSync(sound, wave());
    fs.writeFileSync(
      path.join(folder, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id,
        name: 'Locked startup fixture',
        version: '1.0.0',
        minimumHostVersion: '0.42.0',
        runtime: 'node',
        entry: 'index.cjs',
        capabilities: ['notifications', 'audio'],
        notificationTypes: [
          {
            typeId: 'message',
            title: 'Startup notice',
            description: 'Fixture',
            levels: ['info'],
            defaultLevel: 'info',
            allowedTargets: ['banner', 'desktop', 'windows'],
            defaultTargets: ['banner'],
            requiredTargets: [],
            lifetimePolicy: 'userDuration',
            defaultDurationSeconds: 1,
            history: 'session',
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(folder, 'index.cjs'),
      `exports.activate=async c=>{await c.notifications.publish({typeId:'message',title:'Locked startup fixture',body:'Body'});await c.audio.play(${JSON.stringify(sound)});};`,
    );
    const portable = process.argv[2],
      exe = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
    if (portable) {
      require('./copy-host.cjs').copyHost(path.resolve(portable), exe);
      assert.equal(hash(exe), hash(path.resolve(portable)));
    }
    port = await freePort();
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(
      exe,
      [...(portable ? [] : [root]), '--test-profile=' + profile, '--inspect-brk=' + port],
      { cwd: root, env, windowsHide: true, stdio: 'pipe' },
    );
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    await until(
      async () => (await fetch('http://127.0.0.1:' + port + '/json/list')).ok,
      'startup inspector',
    );
    await prepareStartup(
      port,
      `(()=>{
      const e=${electronExpression},req=process.getBuiltinModule('module').createRequire(${portable ? "process.resourcesPath+'/app.asar/package.json'" : JSON.stringify(path.join(root, 'package.json'))});
      e.powerMonitor.getSystemIdleState=()=> 'locked';
      const prototype=req('./out/main/main/core/notification-service').NotificationService.prototype, setPaused=prototype.setPaused;
      prototype.setPaused=function(p){globalThis.lockService=this;return setPaused.call(this,p);};
      globalThis.lockAudio=0;globalThis.lockWindows=0;
      const audio=req('./out/main/main/core/audio-service').audioPlayback,player=audio.player;
      audio.player=async r=>{globalThis.lockAudio++;await player(r);};
      req('./out/main/main/core/notifications').showNotification=()=>{globalThis.lockWindows++;return{close(){},release(){}};};
      return true;
    })()`,
    );
    await until(
      () =>
        inspect(port, `globalThis.lockService?.list().some(i=>i.title==='Locked startup fixture')`),
      'startup notification',
    );
    await delay(1500);
    const held = await inspect(
      port,
      `({paused:lockService.isPaused(),notice:lockService.list().find(i=>i.title==='Locked startup fixture'),targets:['banner','desktop','windows'].map(t=>lockService.targetItems(t).length),audio:lockAudio,windows:lockWindows})`,
    );
    assert.equal(held.paused, true);
    assert.equal(held.notice.status, 'active');
    assert.equal(held.notice.expiresAt, undefined);
    assert.deepEqual(held.targets, [0, 0, 0]);
    assert.equal(held.audio, 0);
    assert.equal(held.windows, 0);
    assert.equal(requests, 0);
    checks.push(
      'locked initial snapshot holds all visual targets, sound and speech beyond display lifetime',
    );
    await inspect(port, `${electronExpression}.powerMonitor.emit('unlock-screen')`);
    await until(
      () => inspect(port, 'lockAudio===2 && lockWindows===1'),
      'deferred sound, speech and Windows projection',
    );
    assert.equal(requests, 1);
    await until(
      () =>
        inspect(
          port,
          `lockService.list().find(i=>i.title==='Locked startup fixture').status==='expired'`,
        ),
      'unlocked display lifetime',
    );
    checks.push(
      'unlock delivers sound and speech once, posts Windows notice once and starts display lifetime',
    );
    await inspect(
      port,
      `${electronExpression}.powerMonitor.emit('lock-screen');${electronExpression}.powerMonitor.emit('unlock-screen')`,
    );
    await delay(350);
    assert.equal(await inspect(port, 'lockAudio'), 2);
    assert.equal(requests, 1);
    checks.push('subsequent lock cycle does not replay an ended episode');
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'error.txt'), error.stack || String(error));
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (child) {
      if (child.exitCode === null)
        await inspect(port, `${electronExpression}.app.quit()`).catch(() => {});
      try {
        await until(() => child.exitCode !== null, 'shutdown');
      } catch {
        child.kill();
        success = false;
        process.exitCode = 1;
      }
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.writeFileSync(path.join(profile, 'process.log'), output);
    const result = {
      success,
      checks,
      profile,
      portable: process.argv[2]
        ? { path: path.resolve(process.argv[2]), sha256: hash(path.resolve(process.argv[2])) }
        : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
