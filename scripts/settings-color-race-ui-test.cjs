const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { freePort } = require('./electron-main-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { accentPalettes } = require('../out/main/shared/appearance');
const source = process.argv[2] && path.resolve(process.argv[2]);
assert(source, 'A fixed distribution EXE is required');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `settings-color-race-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const exe = path.join(profile, 'AppDock.at365.exe');
require('./copy-host.cjs').copyHost(source, exe);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash(exe), hash(source));
const initial = createDefaultSettings();
Object.assign(initial.host, {
  hardwareAcceleration: false,
  soundEnabled: false,
  notifications: false,
  closeToTray: false,
});
initial.keybindings = [];
initial.globalShortcutCommands = [];
initial.gestures.enabled = false;
initial.touchpadGestures.enabled = false;
initial.updates.checkHostOnAboutOpen = false;
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
const checks = [];
let child,
  browser,
  host,
  output = '';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(read, label) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    const result = await read();
    if (result) return result;
    await delay(50);
  }
  throw Error(label);
}
async function start() {
  const port = await freePort();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(
    exe,
    [
      `--test-profile=${profile}`,
      `--test-local-state=${path.join(profile, 'local')}`,
      `--remote-debugging-port=${port}`,
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
  }, 'CDP connection');
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
}
async function stop() {
  if (host && !host.isClosed())
    await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
  if (child) await until(() => child.exitCode !== null, 'process exit');
  if (browser) await browser.close();
  browser = undefined;
}
(async () => {
  const result = { ok: false, output: profile, source, checks, clicks: 120, sha256: hash(source) };
  try {
    await start();
    result.version = (await host.evaluate(() => window.dock.snapshot())).version;
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await host
      .locator('.settings-categories button')
      .filter({ has: host.locator('span[title="表示"]') })
      .click();
    await host.locator('.accent-palettes button').first().waitFor();
    await host.evaluate(() => {
      window.__colorRaceErrors = [];
      window.__colorRaceOff = window.dock.settingsPage.onChanged((connection) => {
        const error = connection.snapshot?.content?.editing?.error;
        if (error) window.__colorRaceErrors.push(error);
      });
      window.__colorRaceObserver = new MutationObserver(() => {
        for (const node of document.querySelectorAll('[role="alert"]')) {
          const text = node.textContent.trim();
          if (text) window.__colorRaceErrors.push(text);
        }
      });
      window.__colorRaceObserver.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });
    await host.evaluate(async () => {
      const gaps = [0, 1, 8, 17, 35, 70];
      for (let i = 0; i < 120; i++) {
        document.querySelectorAll('.accent-palettes button')[i % 5].click();
        await new Promise((resolve) => setTimeout(resolve, gaps[i % gaps.length]));
      }
    });
    await settleSettings(host);
    result.errors = await host.evaluate(() => {
      window.__colorRaceOff();
      window.__colorRaceObserver.disconnect();
      return window.__colorRaceErrors;
    });
    assert.deepEqual(result.errors, []);
    const last = accentPalettes[4].id;
    const state = await host.evaluate(() => window.dock.snapshot());
    assert.equal(state.settings.value.host.accentColor, last);
    assert.equal(state.settings.syncError, undefined);
    const saved = JSON.parse(
      fs.readFileSync(path.join(profile, `settings-${require('node:os').hostname()}.json`), 'utf8'),
    );
    assert.equal(saved.hostPages.appearance.useLocalSettings, true);
    assert.equal(saved.hostPages.appearance.configuration.host.accentColor, last);
    const log = fs.readFileSync(
      path.join(profile, 'data', 'logs', require('node:os').hostname(), 'host.log'),
      'utf8',
    );
    assert(!/dock:settingsPage:act:|save-failed/.test(log), 'No setting action error was logged');
    await host.screenshot({ path: path.join(profile, 'colors.png') });
    checks.push(
      '120 palette clicks across mixed delays preserve the last color without transient UI or log errors',
    );
    await stop();
    await start();
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.host.accentColor,
      last,
    );
    checks.push('the last confirmed color survives an actual process restart');
    result.ok = true;
  } catch (error) {
    result.error = error.stack;
    process.exitCode = 1;
  } finally {
    await stop().catch((error) => {
      result.cleanupError = error.message;
      process.exitCode = 1;
    });
    fs.writeFileSync(path.join(profile, 'process.log'), output);
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
