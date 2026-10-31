// Visibility integration uses a simulated bridge and accelerated timer, never native key registration.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const root = path.resolve(__dirname, '..');
const source = process.argv[2] && path.resolve(process.argv[2]);
assert(source, 'Fixed distribution EXE required');
const profile = path.join(root, '.artifacts', `touchpad-polling-ui-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const exe = path.join(profile, 'AppDock.at365.exe');
require('./copy-host.cjs').copyHost(source, exe);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash(exe), hash(source));
const settings = createDefaultSettings();
Object.assign(settings.host, {
  hardwareAcceleration: false,
  soundEnabled: false,
  notifications: false,
  closeToTray: true,
});
settings.gestures.enabled = false;
settings.touchpadGestures.enabled = false;
settings.keybindings = [];
settings.globalShortcutCommands = [];
settings.updates.checkHostOnAboutOpen = false;
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
const checks = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(read, label) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    const value = await read();
    if (value) return value;
    await wait(50);
  }
  throw Error(label);
}
let child,
  browser,
  host,
  mainPort,
  output = '';
const windowExpression = `${electronExpression}.BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('appdock://host/'))`;
const probe = () =>
  inspect(
    mainPort,
    `(() => { const p=globalThis.__touchpadPollProbe; return {checks:p.checks,visible:p.manager?.settingsVisible,timer:!!p.manager?.timer,intervals:p.intervals}; })()`,
  );
async function assertPaused(label) {
  await until(async () => {
    const p = await probe();
    return p.visible === false && !p.timer;
  }, label);
  const count = (await probe()).checks;
  await wait(350);
  assert.equal((await probe()).checks, count, label);
  checks.push(label);
}
async function assertActive(label) {
  const count = (await probe()).checks;
  await until(async () => {
    const p = await probe();
    return p.visible === true && p.timer && p.checks > count;
  }, label);
  const before = (await probe()).checks;
  await until(async () => (await probe()).checks > before, 'periodic check while visible');
  checks.push(label);
}
(async () => {
  const result = {
    ok: false,
    profile,
    source,
    checks,
    sha256: hash(source),
    nativeInput: 'simulated bridge only; no keys registered or sent',
    timer: '60 seconds accelerated to 100ms only for this bridge',
  };
  try {
    const port = await freePort();
    mainPort = await freePort();
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(
      exe,
      [
        `--test-profile=${profile}`,
        `--test-local-state=${path.join(profile, 'local')}`,
        `--remote-debugging-port=${port}`,
        `--inspect=${mainPort}`,
      ],
      { cwd: root, env, windowsHide: true, stdio: 'pipe' },
    );
    child.stdout.on('data', (text) => {
      output += text;
    });
    child.stderr.on('data', (text) => {
      output += text;
    });
    browser = await until(async () => {
      try {
        return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
      } catch {
        return undefined;
      }
    }, 'CDP');
    host = await until(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().startsWith('appdock://host/')),
      'host page',
    );
    await until(
      async () => (await host.evaluate(() => window.dock.snapshot())).startupReady,
      'startup',
    );
    result.version = (await host.evaluate(() => window.dock.snapshot())).version;
    await inspect(
      mainPort,
      `(() => {
      const e=${electronExpression};
      const require=process.getBuiltinModule('module').createRequire(e.app.getAppPath()+'/package.json');
      const Bridge=require('./out/main/main/core/touchpad-bridge.js').TouchpadBridgeManager;
      const p=globalThis.__touchpadPollProbe={checks:0,intervals:[]};
      const interval=globalThis.setInterval;
      globalThis.setInterval=function(fn,ms,...args){
        if(ms===60000 && new Error().stack.includes('touchpad-bridge.js')) {p.intervals.push(ms);ms=100;}
        return interval(fn,ms,...args);
      };
      const visible=Bridge.prototype.setSettingsVisible;
      Bridge.prototype.setSettingsVisible=function(value){
        if(!p.manager){
          p.manager=this;
          const settings=structuredClone(this.options.settings());
          settings.touchpadGestures.enabled=true;
          settings.touchpadGestures.bindings=[{gesture:'three.tap'}];
          this.options.settings=()=>settings;
          this.options.input={syncTouchpad:async()=>[],touchpadRequest:async()=>true};
          this.inspect=async()=>{p.checks++;};
        }
        return visible.call(this,value);
      };
      return true;
    })()`,
    );
    await host.evaluate(() => window.dock.executeCommand('appdock.logs.open'));
    await assertPaused('no supplementary polling outside settings');
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await assertActive('opening settings checks immediately and starts one-minute polling');
    await inspect(mainPort, `${windowExpression}.close(); true`);
    assert.equal(await inspect(mainPort, `${windowExpression}.isVisible()`), false);
    await assertPaused('closing to the tray stops supplementary polling');
    await inspect(mainPort, `${windowExpression}.show(); true`);
    await assertActive('showing settings from the tray resumes checks');
    await inspect(mainPort, `${windowExpression}.minimize(); true`);
    await assertPaused('minimizing settings stops supplementary polling');
    await inspect(mainPort, `${windowExpression}.restore(); true`);
    await assertActive('restoring settings resumes checks');
    await host.evaluate(() => window.dock.executeCommand('appdock.logs.open'));
    await assertPaused('leaving settings stops supplementary polling');
    const before = (await probe()).checks;
    await inspect(
      mainPort,
      'globalThis.__touchpadPollProbe.manager.windowsChanged(); globalThis.__touchpadPollProbe.manager.queue.then(()=>true)',
    );
    assert.equal((await probe()).checks, before + 1);
    assert.equal((await probe()).timer, false);
    checks.push('Windows change notification still checks while settings are closed');
    const state = await probe();
    assert(state.intervals.length >= 3);
    assert(state.intervals.every((ms) => ms === 60000));
    result.observed = state;
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.touchpadGestures.enabled,
      false,
    );
    result.ok = true;
  } catch (error) {
    result.error = error.stack;
    process.exitCode = 1;
  } finally {
    if (host && !host.isClosed())
      await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (child) await until(() => child.exitCode !== null, 'exit').catch(() => child.kill());
    if (browser) await browser.close().catch(() => {});
    fs.writeFileSync(path.join(profile, 'process.log'), output);
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
