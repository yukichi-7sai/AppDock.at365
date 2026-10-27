// Start a fixed EXE without user settings. Network probes are installed before the main entry point.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { freePort, electronExpression } = require('./electron-main-helper.cjs');
const { appletApiPermissionLabels } = require('../out/main/shared/appdock-api');
const { settingsPage } = require('./settings-host-helper.cjs');
const root = path.resolve(__dirname, '..');
const source = process.argv[2] && path.resolve(process.argv[2]);
assert(source, 'Fixed distribution EXE required');
const profile = path.join(root, '.artifacts', `host-defaults-ui-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const exe = path.join(profile, 'AppDock.at365.exe');
require('./copy-host.cjs').copyHost(source, exe);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash(exe), hash(source));
assert(!fs.existsSync(path.join(profile, 'settings.json')));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(read, label) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    const value = await read();
    if (value) return value;
    await delay(50);
  }
  throw Error(label);
}
async function debuggerClient(port) {
  const targets = await until(async () => {
    try {
      return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    } catch {
      return undefined;
    }
  }, 'paused main inspector');
  const socket = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  const pending = new Map();
  const scripts = new Map();
  let paused;
  let id = 0;
  socket.onmessage = (event) => {
    const response = JSON.parse(event.data);
    if (response.method === 'Debugger.scriptParsed')
      scripts.set(response.params.scriptId, response.params.url);
    if (response.method === 'Debugger.paused') paused = response.params;
    if (response.method === 'Debugger.resumed') paused = undefined;
    const waiter = pending.get(response.id);
    if (!waiter) return;
    pending.delete(response.id);
    clearTimeout(waiter.timer);
    if (response.error || response.result?.exceptionDetails)
      waiter.reject(Error(JSON.stringify(response)));
    else waiter.resolve(response.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => {
        pending.delete(current);
        reject(Error(`Inspector timeout: ${method}`));
      }, 15000);
      pending.set(current, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: current, method, params }));
    });
  return {
    send,
    pause: () =>
      paused && {
        ...paused,
        url: scripts.get(paused.callFrames[0].location.scriptId) ?? '',
      },
    evaluate: async (expression) =>
      (
        await send(paused ? 'Debugger.evaluateOnCallFrame' : 'Runtime.evaluate', {
          expression,
          ...(paused ? { callFrameId: paused.callFrames[0].callFrameId } : { awaitPromise: true }),
          returnByValue: true,
        })
      ).result.value,
    close: () => socket.close(),
  };
}
let child,
  browser,
  main,
  host,
  output = '';
const result = { ok: false, source, profile, sha256: hash(source), checks: [] };
(async () => {
  try {
    const cdpPort = await freePort();
    const mainPort = await freePort();
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(
      exe,
      [
        `--test-profile=${profile}`,
        `--test-local-state=${path.join(profile, 'local')}`,
        `--remote-debugging-port=${cdpPort}`,
        `--inspect-brk=${mainPort}`,
      ],
      { cwd: root, env, windowsHide: true, stdio: 'pipe' },
    );
    child.stdout.on('data', (text) => {
      output += text;
    });
    child.stderr.on('data', (text) => {
      output += text;
    });
    main = await debuggerClient(mainPort);
    await main.send('Debugger.enable');
    const breakpoint = await main.send('Debugger.setBreakpointByUrl', {
      urlRegex: 'out[/\\\\]main[/\\\\]main[/\\\\]index\\.js$',
      lineNumber: 0,
    });
    await main.send('Runtime.runIfWaitingForDebugger');
    await until(async () => {
      const pause = main.pause();
      if (!pause) return false;
      if (/out[/\\]main[/\\]main[/\\]index\.js$/.test(pause.url)) return true;
      await main.send('Debugger.resume');
      return false;
    }, 'pause before the application main entry point');
    await main.evaluate(`(() => {
      const probe = globalThis.__hostDefaultsProbe = { requests: [], renderer: [], listens: [], manual: false };
      const net = process.getBuiltinModule('net');
      const listen = net.Server.prototype.listen;
      net.Server.prototype.listen = function(...args) {
        probe.listens.push(args.filter(a => typeof a === 'number' || typeof a === 'string'));
        return listen.apply(this, args);
      };
      globalThis.fetch = async (input) => {
        const url = String(input?.url ?? input);
        probe.requests.push(url);
        if (!probe.manual) throw Error('Unexpected automatic network request');
        const base = 'https://updates.example.invalid/';
        if (url === 'https://api.github.com/repos/yukichi-7sai/AppDock.at365/releases/latest')
          return new Response(JSON.stringify({assets:[
            {name:'update.json',browser_download_url:base+'update.json'},
            {name:'update.zip',browser_download_url:base+'update.zip'}
          ]}));
        if (url === base+'update.json') return new Response(JSON.stringify({
          schemaVersion:1,kind:'host',id:'host',version:'999.0.0',
          payload:{file:'update.zip',format:'zip',sha256:'a'.repeat(64),size:20}
        }));
        throw Error('Unexpected request, including package download: '+url);
      };
      const electron = ${electronExpression};
      const fetchLocal = electron.net.fetch.bind(electron.net);
      electron.net.fetch = (input, init) => /^https?:/i.test(String(input?.url ?? input))
        ? globalThis.fetch(input, init) : fetchLocal(input, init);
      electron.app.once('ready', () => electron.session.defaultSession.webRequest.onBeforeRequest(
        {urls:['http://*/*','https://*/*']}, (details, callback) => {
          probe.renderer.push(details.url);
          callback({cancel:true});
        }
      ));
      return true;
    })()`);
    await main.send('Debugger.removeBreakpoint', { breakpointId: breakpoint.breakpointId });
    await main.send('Debugger.resume');
    await main.send('Debugger.disable');
    browser = await until(async () => {
      try {
        return await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 1000 });
      } catch {
        return undefined;
      }
    }, 'renderer CDP');
    host = await until(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().startsWith('appdock://host/')),
      'host page',
    );
    const snapshot = () => host.evaluate(() => window.dock.snapshot());
    await until(async () => (await snapshot()).startupReady, 'fresh startup');
    const fresh = await snapshot();
    result.version = fresh.version;
    for (const key of ['checkHostOnAboutOpen', 'checkHostOnStartup', 'checkAppletsOnStartup'])
      assert.equal(fresh.settings.value.updates[key], false, key);
    assert.deepEqual(fresh.settings.value.trayCommands, ['appdock.open']);
    assert.equal(fresh.settings.value.gestures.wheelDelayMs, 20);
    assert.equal(fresh.settings.value.gestures.indicatorOpacity, 0.9);
    assert.deepEqual(fresh.settings.value.ribbon.bottom, ['theme', 'logs', 'notifications']);
    assert.equal(
      Object.keys(fresh.appletApi.permissions).length,
      Object.keys(appletApiPermissionLabels).length,
    );
    assert(Object.values(fresh.appletApi.permissions).every((value) => value === true));
    assert.equal(
      (await host.evaluate(() => window.dock.automation({ kind: 'status' }))).state.enabled,
      false,
    );
    result.checks.push('fresh host defaults and all Applet permissions ON; MCP server remains OFF');
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    const surface = await settingsPage(host);
    await surface.getByRole('button', { name: 'AppDockについて', exact: true }).click();
    // Observe beyond the configured startup delay, including About being opened repeatedly.
    await delay((fresh.settings.value.updates.startupDelaySeconds + 1) * 1000);
    const readProbe = () => main.evaluate('globalThis.__hostDefaultsProbe');
    const automatic = await readProbe();
    assert.deepEqual(automatic.requests, []);
    assert.deepEqual(automatic.renderer, []);
    assert.deepEqual(automatic.listens, []);
    result.automatic = automatic;
    result.checks.push(
      'initial startup and About: no fetch, renderer HTTP(S) request, or Node listener',
    );
    await host.screenshot({ path: path.join(profile, 'fresh-about.png') });
    await surface.getByRole('button', { name: '操作の許可', exact: true }).click();
    const panel = surface.getByRole('region', { name: '操作の許可', exact: true });
    for (const title of Object.values(appletApiPermissionLabels))
      assert.equal(
        await panel
          .getByRole('switch', { name: `Applet：${title}`, exact: true })
          .getAttribute('aria-checked'),
        'true',
      );
    await host.screenshot({ path: path.join(profile, 'fresh-permissions.png') });
    result.checks.push('permission UI shows every Applet switch ON');
    await main.evaluate('globalThis.__hostDefaultsProbe.manual=true; true');
    await host.evaluate(() => window.dock.executeCommand('appdock.updates.check'));
    await until(async () => {
      const updates = (await snapshot()).updates;
      return !updates.busy && updates.results.length;
    }, 'metadata update check completed');
    result.manual = await readProbe();
    result.updateState = (await snapshot()).updates;
    assert(
      result.updateState.results.some((r) => r.id === 'host' && r.status === 'available'),
      JSON.stringify(result.updateState),
    );
    assert.deepEqual(result.manual.requests, [
      'https://api.github.com/repos/yukichi-7sai/AppDock.at365/releases/latest',
      'https://updates.example.invalid/update.json',
    ]);
    assert.deepEqual(result.manual.renderer, []);
    assert.deepEqual(result.manual.listens, []);
    result.checks.push(
      'manual update check fetches release/feed metadata only; no ZIP fetch or installation',
    );
    result.ok = true;
  } catch (error) {
    result.error = error.stack;
    process.exitCode = 1;
  } finally {
    if (host) await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    main?.close();
    await browser?.close().catch(() => {});
    if (child) {
      await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(4000)]);
      if (child.exitCode === null) child.kill();
    }
    fs.writeFileSync(path.join(profile, 'process.log'), output);
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})();
