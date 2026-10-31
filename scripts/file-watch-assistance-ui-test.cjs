const { _electron: electron, chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { settingsAwarePage } = require('./settings-aware-page.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] && path.resolve(process.argv[2]);
const profile = fs.mkdtempSync(path.join(root, '.artifacts/file-watch-assistance-ui-'));
const settingsFile = require('./test-settings.cjs').file(profile, 'settings.json');
const settings = createDefaultSettings();
settings.keybindings = [];
settings.globalShortcutCommands = [];
settings.gestures.enabled = false;
fs.writeFileSync(settingsFile, JSON.stringify(settings));
const markers = ['.appdock/secrets/preserved.json', 'data/chromium/preserved.json'];
for (const name of markers) {
  const file = path.join(profile, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'fixture must remain unchanged');
}
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const markerHashes = markers.map((name) => hash(path.join(profile, name)));
const executable = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) require('./copy-host.cjs').copyHost(portable, executable);
const checks = [];
let app, browser, child, host;
async function until(predicate, label) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error(label);
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const snapshot = () => host.evaluate(() => window.dock.snapshot());
async function main() {
  const debug = await freePort();
  const env = { ...process.env, CODEX_HOME: path.join(profile, 'codex') };
  delete env.ELECTRON_RUN_AS_NODE;
  const args = [
    ...(portable ? [] : [root]),
    `--test-profile=${profile}`,
    `--test-local-state=${path.join(profile, 'local')}`,
    `--remote-debugging-port=${debug}`,
  ];
  if (portable) {
    child = spawn(executable, args, { cwd: profile, env, windowsHide: true, stdio: 'ignore' });
    await until(async () => {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${debug}`, { timeout: 1000 });
      return true;
    }, 'CDP ready');
    await until(() => {
      host = browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => page.url().startsWith('appdock://host/'));
      return host;
    }, 'host page');
  } else {
    app = await electron.launch({ executablePath: executable, args, env, timeout: 45000 });
    await until(() => {
      host = app.windows().find((page) => page.url().startsWith('appdock://host/'));
      return host;
    }, 'host page');
  }
  host.setDefaultTimeout(15000);
  await until(async () => (await snapshot()).startupReady, 'startup ready');
  assert.equal(Object.hasOwn(await snapshot(), 'legacyLocalData'), false);
  assert(!(await snapshot()).logs.some((entry) => entry.message.includes('LEGACY_LOCAL_DATA')));
  checks.push('retired residual-data status and automatic warning are absent');
  await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  const ui = settingsAwarePage(host);
  await ui.getByRole('button', { name: '一般', exact: true }).click();
  await ui.getByRole('heading', { name: 'ファイル監視', exact: true }).waitFor();
  const enabled = ui.getByRole('switch', { name: 'ファイル監視の補助確認', exact: true });
  const interval = ui.getByLabel('補助確認の待機時間（秒）', { exact: true });
  assert.equal(await enabled.isChecked(), false);
  assert.equal(await interval.inputValue(), '300');
  assert.equal(await interval.isDisabled(), true);
  checks.push('default OFF and disabled 300-second field');
  await enabled.click();
  await settleSettings(host);
  assert.equal((await snapshot()).settings.value.host.fileWatchAssistanceEnabled, true);
  await interval.fill('2.5');
  await interval.press('Enter');
  await settleSettings(host);
  await until(
    async () => (await snapshot()).settings.value.host.fileWatchAssistanceIntervalSeconds === 2.5,
    'fractional interval saved',
  );
  await interval.fill('4');
  await interval.press('Escape');
  assert.equal(await interval.inputValue(), '2.5');
  await interval.fill('1');
  await interval.press('Enter');
  await settleSettings(host).catch(() => {});
  assert.equal((await snapshot()).settings.value.host.fileWatchAssistanceIntervalSeconds, 2.5);
  assert.equal(await interval.inputValue(), '1');
  await interval.fill('2');
  await interval.press('Enter');
  await settleSettings(host);
  await until(
    async () => (await snapshot()).settings.value.host.fileWatchAssistanceIntervalSeconds === 2,
    'minimum interval saved',
  );
  checks.push('fractional/minimum values save; Escape cancels; rejected value remains visible');
  await enabled.click();
  await settleSettings(host);
  assert.equal((await snapshot()).settings.value.host.fileWatchAssistanceEnabled, false);
  assert.equal(await interval.inputValue(), '2');
  assert.equal(await interval.isDisabled(), true);
  const data = path.dirname(settingsFile);
  const deviceFile = path.join(
    data,
    fs.readdirSync(data).find((name) => /^settings-.+\.json$/.test(name)),
  );
  const device = JSON.parse(fs.readFileSync(deviceFile));
  device.hostPages.general.configuration.host.closeToTray = false;
  fs.writeFileSync(deviceFile + '.received', JSON.stringify(device));
  fs.renameSync(deviceFile + '.received', deviceFile);
  await until(
    async () => (await snapshot()).settings.value.host.closeToTray === false,
    'native watch remains active with assistance OFF',
  );
  checks.push('OFF retains interval and native watcher receives an external settings replacement');
  await host.setViewportSize({ width: 1200, height: 820 });
  await ui.locator('[data-testid="file-watch-settings"]').scrollIntoViewIfNeeded();
  await host.screenshot({ path: path.join(profile, 'wide.png') });
  await host.setViewportSize({ width: 640, height: 760 });
  await ui.locator('[data-testid="file-watch-settings"]').scrollIntoViewIfNeeded();
  await host.screenshot({ path: path.join(profile, 'narrow.png') });
  assert.deepEqual(
    markers.map((name) => hash(path.join(profile, name))),
    markerHashes,
  );
  checks.push('wide/narrow layouts and residual fixture data preserved');
  const result = {
    ok: true,
    profile,
    mode: portable ? 'portable' : 'source',
    version: (await snapshot()).version,
    executableHash: portable && hash(executable),
    checks,
  };
  fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main()
  .catch(async (error) => {
    if (host && !host.isClosed())
      await host.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (host && !host.isClosed())
      await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (app) await app.close().catch(() => {});
    if (child)
      await until(() => child.exitCode !== null, 'portable exits').catch(() => {
        child.kill();
        process.exitCode = 1;
      });
  });
