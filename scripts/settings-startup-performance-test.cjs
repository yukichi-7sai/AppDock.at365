// Compare identical isolated Applets with 2 KiB and 34 KiB settings. No live settings or accounts.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { freePort, inspect } = require('./electron-main-helper.cjs');
const { copyHost } = require('./copy-host.cjs');
const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[2]);
const idleMode = process.argv.includes('--idle');
const expectQuiet = process.argv.includes('--expect-quiet');
const output = path.join(
  root,
  '.artifacts',
  `${idleMode ? 'settings-idle-update' : 'settings-startup-performance'}-${Date.now()}`,
);
const executable = path.join(output, 'host', 'AppDock.at365.exe');
const ids = Array.from({ length: 8 }, (_, i) => `test.startup.${i}`);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await delay(100);
  }
  throw Error(label);
}
const probe = `(() => {
  const fs = process.getBuiltinModule('fs');
  const result = globalThis.__settingsStartupProbe = { clones: 0, cloneMs: 0, reads: {} };
  const clone = globalThis.structuredClone;
  globalThis.structuredClone = function(value, ...args) {
    if (!value?.extensions?.['test.padding']) return clone(value, ...args);
    const start = performance.now();
    try { return clone(value, ...args); }
    finally { result.clones++; result.cloneMs += performance.now() - start; }
  };
  for (const name of ['readFileSync', 'statSync']) {
    const original = fs[name];
    fs[name] = function(file, ...args) {
      const start = performance.now();
      try { return original.call(this, file, ...args); }
      finally {
        const category = String(file).endsWith('extension.json') ? 'manifest' : /settings[^/\\\\]*\\.json$/.test(String(file)) ? 'settings' : 'other';
        const metric = result.reads[name + ':' + category] ??= { calls: 0, ms: 0 };
        metric.calls++; metric.ms += performance.now() - start;
      }
    };
  }
  return true;
})()`;

async function phase(kib) {
  const profile = path.join(output, `${kib}kib`);
  fs.mkdirSync(profile, { recursive: true });
  const settings = {
    schemaVersion: 1,
    keybindingDefaultsInitialized: ['appdock.default-shell', ...ids],
    gestureDefaultsInitialized: ['appdock.default-shell', ...ids],
    trayMenu: [],
    trayCommands: [],
    host: { soundEnabled: false, hardwareAcceleration: false, closeToTray: false },
    keybindings: [],
    globalShortcutCommands: [],
    gestures: { enabled: false },
    touchpadGestures: { enabled: false },
    updates: {
      checkHostOnAboutOpen: false,
      checkHostOnStartup: false,
      checkAppletsOnStartup: false,
    },
    extensions: { 'test.padding': { enabled: false, settings: { padding: '' } } },
  };
  for (const id of ids) {
    const folder = path.join(profile, 'extensions', id);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id,
        name: id,
        version: '1.0.0',
        runtime: 'node',
        entry: 'index.cjs',
        capabilities: idleMode && id === ids[0] ? ['settings', 'tray-attention'] : ['settings'],
        settings: [{ key: 'sample', title: 'Sample', type: 'number', default: 1 }],
      }),
    );
    fs.writeFileSync(
      path.join(folder, 'index.cjs'),
      idleMode && id === ids[0]
        ? `exports.activate = async (context) => {
          let pulses = 0;
          const file = require('node:path').join(__dirname, 'pulses.txt');
          require('node:fs').writeFileSync(file, '0');
          context.scheduler.every(2000, async () => {
            await context.tray.attention(false);
            require('node:fs').writeFileSync(file, String(++pulses));
          });
        };\n`
        : 'exports.activate = async (context) => { context.settings.get("sample", 1); };\n',
    );
    settings.extensions[id] = { enabled: true, settings: { sample: 1 } };
  }
  settings.extensions['test.padding'].settings.padding = 'x'.repeat(
    kib * 1024 - Buffer.byteLength(JSON.stringify(settings)),
  );
  const file = require('./test-settings.cjs').file(profile, 'settings.json');
  fs.writeFileSync(file, JSON.stringify(settings));
  require('../out/main/shared/settings-schema').parseSettings(settings);
  assert.equal(fs.statSync(file).size, kib * 1024);
  const settingsHash = hash(file);
  const port = await freePort(),
    inspector = await freePort();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    executable,
    [
      `--test-profile=${profile}`,
      `--test-local-state=${path.join(profile, 'local')}`,
      `--remote-debugging-port=${port}`,
      `--inspect=${inspector}`,
    ],
    { cwd: root, env, windowsHide: true, stdio: 'ignore' },
  );
  let browser, page;
  const errors = [];
  child.on('error', (error) => errors.push(error.message));
  try {
    browser = await until(async () => {
      try {
        return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
      } catch {
        return false;
      }
    }, 'CDP connection');
    page = await until(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().startsWith('appdock://host/')),
      'Host page',
    );
    page.on('pageerror', (error) => errors.push(error.message));
    const snapshot = () => page.evaluate(() => window.dock.snapshot());
    await until(async () => (await snapshot()).startupReady, 'Startup completion');
    const initial = await snapshot();
    await page.evaluate(() => window.dock.executeCommand('appdock.applets.open'));
    await page.getByRole('heading', { name: 'Applet管理', exact: true }).waitFor();
    await delay(500);
    await inspect(inspector, probe);
    if (idleMode) {
      const pulseFile = path.join(profile, 'extensions', ids[0], 'pulses.txt');
      const beforePulses = Number(fs.readFileSync(pulseFile, 'utf8'));
      await page.evaluate(() => {
        const state = (window.__idleUpdateProbe = {
          updates: 0,
          frames: 0,
          maximumFrameGapMs: 0,
          running: true,
        });
        state.off = window.dock.onChanged(() => state.updates++);
        let previous = performance.now();
        const cell = document.querySelector('[data-testid="applet-startup-time"]');
        let scroll = cell?.parentElement;
        while (scroll && scroll.scrollHeight <= scroll.clientHeight + 20)
          scroll = scroll.parentElement;
        const frame = (now) => {
          if (!state.running) return;
          state.frames++;
          state.maximumFrameGapMs = Math.max(state.maximumFrameGapMs, now - previous);
          previous = now;
          if (scroll)
            scroll.scrollTop =
              (scroll.scrollTop + 3) % Math.max(1, scroll.scrollHeight - scroll.clientHeight);
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      await delay(6500);
      const idle = await page.evaluate(() => {
        const state = window.__idleUpdateProbe;
        state.running = false;
        state.off();
        return {
          updates: state.updates,
          frames: state.frames,
          maximumFrameGapMs: state.maximumFrameGapMs,
        };
      });
      idle.pulses = Number(fs.readFileSync(pulseFile, 'utf8')) - beforePulses;
      assert(idle.pulses >= 2);
      assert(idle.frames > 100);
      if (expectQuiet)
        assert.equal(idle.updates, 0, 'Identical attention must not broadcast a full host update');
      assert.equal(hash(file), settingsHash);
      return {
        kib,
        version: initial.version,
        idle,
        work: await inspect(inspector, 'globalThis.__settingsStartupProbe'),
      };
    }
    const rounds = [];
    for (let round = 0; round < 3; round++) {
      await page.evaluate(async (ids) => {
        for (const id of ids) await window.dock.restartExtension(id);
      }, ids);
      const state = await snapshot();
      rounds.push(
        Object.fromEntries(
          ids.map((id) => {
            const a = state.extensions.find((a) => a.id === id);
            assert.equal(a.state, 'running');
            assert.equal(a.startupTiming.outcome, 'success');
            return [id, a.startupTiming.durationMs];
          }),
        ),
      );
      await delay(100);
    }
    const work = await inspect(inspector, 'globalThis.__settingsStartupProbe');
    assert.deepEqual(errors, []);
    assert.equal(hash(file), settingsHash);
    return {
      kib,
      version: initial.version,
      errors,
      settingsPreserved: true,
      initial: Object.fromEntries(
        ids.map((id) => [id, initial.extensions.find((a) => a.id === id).startupTiming.durationMs]),
      ),
      initialPhases: Object.fromEntries(
        ids.map((id) => [id, initial.extensions.find((a) => a.id === id).startupTiming.phases]),
      ),
      rounds,
      work,
    };
  } finally {
    if (page)
      await page
        .evaluate(() => {
          void window.dock.executeCommand('appdock.quit');
        })
        .catch(() => {});
    await until(() => child.exitCode !== null, 'Shutdown', 10000).catch(() => {});
    if (child.exitCode === null) {
      child.kill();
      await until(() => child.exitCode !== null, 'Forced test shutdown', 5000);
    }
    if (browser) await browser.close();
  }
}
(async () => {
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  copyHost(source, executable);
  assert.equal(hash(source), hash(executable));
  const asar = (exe) => path.join(path.dirname(exe), 'resources', 'app.asar');
  assert.equal(hash(asar(source)), hash(asar(executable)));
  const result = {
    ok: false,
    source,
    sha256: hash(executable),
    appAsarSha256: hash(asar(executable)),
    output,
    scope: idleMode
      ? 'Unchanged tray attention every 2 seconds in an isolated Node Applet while the settings view auto-scrolls; no live Gmail or touchpad operations.'
      : 'Synthetic Node Applets, fixed distribution, isolated profiles, identical settings except padding; instrumented restart timings are diagnostic, not live-Applet performance.',
    cases: [],
  };
  try {
    if (!idleMode) result.cases.push(await phase(2));
    result.cases.push(await phase(34));
    result.ok = true;
  } catch (error) {
    result.error = error.stack;
    process.exitCode = 1;
  }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
})();
