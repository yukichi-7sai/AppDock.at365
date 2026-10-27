const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { freePort } = require('./electron-main-helper.cjs');
const { waitForHost, settingsPage } = require('./settings-host-helper.cjs');
const { copyHost } = require('./copy-host.cjs');
const root = path.resolve(__dirname, '..'),
  source = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
const profile = path.join(root, '.artifacts', 'host-startup-timing-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const result = { success: false, profile, cases: [] };
const until = async (fn, label) => {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 60));
  }
  throw Error(label);
};
async function run(name, padding, theme) {
  const folder = path.join(profile, name);
  fs.mkdirSync(folder, { recursive: true });
  const exe = source ? path.join(folder, 'AppDock.at365.exe') : require('electron');
  if (source) copyHost(source, exe);
  const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
  Object.assign(settings.host, {
    startMinimized: false,
    closeToTray: false,
    hardwareAcceleration: false,
    soundEnabled: false,
    theme,
  });
  settings.globalShortcutCommands = [];
  settings.keybindings = [];
  settings.triggerStacks = { version: 1, items: [] };
  settings.gestures.enabled = false;
  settings.touchpadGestures.enabled = false;
  settings.keybindingDefaultsInitialized = ['appdock.default-shell'];
  settings.gestureDefaultsInitialized = ['appdock.default-shell'];
  Object.assign(settings.updates, {
    checkHostOnStartup: false,
    checkHostOnAboutOpen: false,
    checkAppletsOnStartup: false,
  });
  if (padding)
    settings.extensions['test.startup-padding'] = {
      enabled: false,
      settings: { padding: 'STARTUP_PADDING_'.repeat(padding) },
    };
  const bytes = JSON.stringify(settings);
  fs.writeFileSync(path.join(folder, 'settings.json'), bytes);
  const port = await freePort(),
    env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    exe,
    [
      ...(source ? [] : [root]),
      `--test-profile=${folder}`,
      `--test-local-state=${path.join(folder, 'local')}`,
      `--remote-debugging-port=${port}`,
    ],
    { cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  child.stderr.on('data', (data) => fs.appendFileSync(path.join(folder, 'process.log'), data));
  let browser, host;
  try {
    browser = await until(async () => {
      try {
        return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
      } catch {
        return false;
      }
    }, 'CDP');
    host = await until(
      () =>
        browser
          .contexts()
          .flatMap((context) => context.pages())
          .find((page) => page.url().startsWith('appdock://host/')),
      'host page',
    );
    await waitForHost(
      host,
      async () => !!window.dock && (await window.dock.snapshot()).startupReady,
    );
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    const page = await settingsPage(host);
    await page.getByTestId('settings-nav:about').click();
    const panel = page.getByTestId('host-startup-timing');
    await panel.waitFor();
    assert.equal(await panel.getAttribute('open'), null, 'startup section initially collapsed');
    await panel.locator(':scope > summary').click();
    await panel.locator('.settings-section-row > summary').click();
    const data = panel.getByTestId('host-startup-json');
    const timing = await until(async () => {
      const value = JSON.parse(await data.inputValue());
      return value.complete && value;
    }, 'startup measurements complete');
    assert.equal(timing.counts.sharedBytes, Buffer.byteLength(bytes));
    assert(timing.milestones.shown >= 0);
    assert(timing.milestones.ready >= timing.milestones.shown);
    assert(timing.elapsedMs >= timing.milestones.ready);
    assert(timing.processEntryMs >= 0);
    assert(timing.phases.length >= 16);
    assert(
      timing.phases.every(
        (row) => row.state !== 'running' && row.durationMs >= 0 && row.startMs >= 0,
      ),
    );
    for (const id of [
      'modules',
      'settings',
      'images',
      'document',
      'hotkeys',
      'indicator',
      'ui',
      'integration',
    ])
      assert(timing.phases.some((row) => row.id === id));
    assert(timing.work.some((row) => row.id === 'settingsSnapshot' && row.calls > 0));
    assert(!JSON.stringify(timing).includes('STARTUP_PADDING_'));
    await host.evaluate(async () => {
      await window.dock.snapshot();
      await window.dock.snapshot();
    });
    assert.deepEqual(
      JSON.parse(await data.inputValue()),
      timing,
      'post-startup reads do not change counters',
    );
    await host.setViewportSize({ width: name === 'small' ? 1100 : 620, height: 800 });
    await panel.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await host.screenshot({ path: path.join(folder, 'startup-panel.png') });
    await data.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await host.screenshot({ path: path.join(folder, 'startup-data.png') });
    const overflow = await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    assert.equal(overflow, false, 'panel stays inside settings body');
    return { name, folder, timing, sharedBytes: Buffer.byteLength(bytes), theme };
  } finally {
    if (host) await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (child.exitCode === null)
      await until(() => child.exitCode !== null, 'exit').catch(() => child.kill());
    await browser?.close().catch(() => {});
  }
}
(async () => {
  try {
    result.cases.push(await run('small', 0, 'light'));
    result.cases.push(await run('large', 2200, 'dark'));
    assert(result.cases[1].sharedBytes > result.cases[0].sharedBytes);
    result.success = true;
  } catch (error) {
    result.error = String(error.stack || error);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify(
        {
          success: result.success,
          profile,
          cases: result.cases.map((c) => ({
            name: c.name,
            ms: c.timing.milestones.shown,
            bytes: c.sharedBytes,
          })),
          error: result.error,
        },
        null,
        2,
      ),
    );
  }
})();
