const { testHostPath } = require('./copy-host.cjs');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { freePort, inspect } = require('./electron-main-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] && path.resolve(process.argv[2]);
const profile = path.join(
  root,
  '.artifacts',
  `mcp-server-startup-${portable ? 'portable' : 'source'}-${Date.now()}`,
);
const checks = [],
  failures = [];
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let child,
  browser,
  host,
  mainPort,
  blocker,
  success = false,
  output = '';
fs.mkdirSync(profile, { recursive: true });
const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(initial.host, {
  theme: 'dark',
  hardwareAcceleration: false,
  closeToTray: false,
  soundEnabled: false,
});
initial.keybindings = [];
initial.keybindingOptions.enabled = false;
initial.gestures.enabled = false;
initial.touchpadGestures.enabled = false;
initial.updates.checkHostOnStartup = false;
initial.updates.checkAppletsOnStartup = false;
initial.updates.checkHostOnAboutOpen = false;
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(initial));
const exe = portable ? testHostPath(profile) : require('electron');
if (portable) {
  require('./copy-host.cjs').copyHost(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
async function until(fn, label) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error(label);
}
async function launch(restore = false, category = 'MCPサーバー') {
  const port = await freePort();
  mainPort = await freePort();
  const env = { ...process.env, CODEX_HOME: path.join(profile, 'codex') };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(
    exe,
    [
      ...(portable ? [] : [root]),
      `--test-profile=${profile}`,
      `--test-local-state=${path.join(profile, 'local')}`,
      `--remote-debugging-port=${port}`,
      `--inspect=${mainPort}`,
      ...(restore ? ['--restore-view'] : []),
    ],
    { cwd: root, env, windowsHide: true, stdio: 'pipe' },
  );
  child.stdout.on('data', (data) => (output += data));
  child.stderr.on('data', (data) => (output += data));
  browser = await until(
    () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }).catch(() => null),
    'CDP',
  );
  host = await until(
    () =>
      browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => page.url().startsWith('appdock://host/')),
    'host',
  );
  host.setDefaultTimeout(15000);
  host.on('pageerror', (error) => failures.push(error.message));
  await until(
    async () => (await host.evaluate(() => window.dock.snapshot())).startupReady,
    'startup',
  );
  await host.setViewportSize({ width: 1280, height: 840 });
  if (!restore) await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  await settingsPage(host);
  if (!restore) await host.getByRole('button', { name: 'MCPサーバー', exact: true }).click();
  await host.getByRole('heading', { name: category, exact: true }).waitFor();
}
async function stop() {
  if (host && !host.isClosed())
    await host.evaluate(() => window.dock.executeCommand('appdock.quit'));
  if (child) await until(() => child.exitCode !== null, 'shutdown');
  await browser?.close();
  browser = host = child = undefined;
}
async function model() {
  return host.evaluate(async () => {
    const surface = document.querySelector('.settings-surface[data-settings-connection]');
    return surface ? window.dock.settingsPage.get(surface.dataset.settingsConnection) : null;
  });
}
const state = () =>
  host.evaluate(() => window.dock.automation({ kind: 'status' })).then((r) => r.state);
const retryField = () => host.getByRole('group', { name: 'MCPサーバーの起動', exact: true });
async function waitRunning() {
  await until(
    async () => (await model())?.content.auxiliary.automation?.running,
    'live server state',
  );
  await until(
    async () =>
      (
        await host.getByRole('group', { name: '連携を有効にする', exact: true }).innerText()
      ).includes('サーバー: 稼働中'),
    'running text',
  );
  assert.equal(await host.getByRole('button', { name: '接続を再試行', exact: true }).count(), 0);
}
async function pauseNextStartup() {
  const packagePath = portable ? null : path.join(root, 'package.json');
  await inspect(
    mainPort,
    `(() => {
      const load = process.getBuiltinModule('module').createRequire(${packagePath ? JSON.stringify(packagePath) : "process.resourcesPath + '/app.asar/package.json'"});
      const { AutomationMcp } = load('./out/main/main/core/automation-mcp.js');
      const original = AutomationMcp.prototype.verifyLoopback;
      AutomationMcp.prototype.verifyLoopback = async function (...args) {
        AutomationMcp.prototype.verifyLoopback = original;
        await original.apply(this, args);
        await new Promise((resolve) => globalThis.__mcpStartupUiRelease = resolve);
      };
      return true;
    })()`,
  );
}
const releaseStartup = () =>
  inspect(
    mainPort,
    'globalThis.__mcpStartupUiRelease?.(); delete globalThis.__mcpStartupUiRelease; true',
  );
async function checkPermissions() {
  await host.setViewportSize({ width: 1280, height: 840 });
  await host.evaluate(async () => {
    const { state } = await window.dock.automation({ kind: 'status' });
    await window.dock.automation({
      kind: 'configure',
      enabled: false,
      allowWrite: true,
      port: state.port,
    });
    await window.dock.automation({ kind: 'setExecution', allowed: true });
  });
  await pauseNextStartup();
  await host.evaluate(async () => {
    const { state } = await window.dock.automation({ kind: 'status' });
    window.__permissionStartup = window.dock
      .automation({
        kind: 'configure',
        enabled: true,
        allowWrite: state.allowWrite,
        port: state.port,
      })
      .then(
        () => null,
        (error) => String(error),
      );
  });
  await until(
    () => inspect(mainPort, "typeof globalThis.__mcpStartupUiRelease === 'function'"),
    'permissions startup gate',
  );
  await host.getByRole('button', { name: '操作の許可', exact: true }).click();
  await host.getByRole('heading', { name: '操作の許可', exact: true }).waitFor();
  const mcp = (key) => host.getByTestId(`permission-row-${key}`).locator('[data-caller="MCP"]');
  await mcp('write').getByText('起動中…', { exact: true }).waitFor();
  assert.equal(await host.getByText('連携が停止中です', { exact: true }).count(), 0);
  assert.equal(await mcp('write').getByRole('switch').isChecked(), true);
  assert.equal(await mcp('execute').getByRole('switch').isChecked(), true);
  assert.equal(await mcp('write').getByRole('switch').isDisabled(), true);
  assert.equal(
    await host
      .getByTestId('permission-row-read')
      .locator('[data-caller="Applet"]')
      .getByRole('switch')
      .isEnabled(),
    true,
  );
  const starting = await model();
  assert.equal(starting.content.auxiliary.automation.starting, true);
  await host.screenshot({ path: path.join(profile, 'permissions-starting.png') });
  checks.push('permissions opened during startup show progress and keep saved grants');
  await releaseStartup();
  assert.equal(await host.evaluate(() => window.__permissionStartup), null);
  const waitPermissionsRunning = async () => {
    await until(
      async () => (await model())?.content.auxiliary.automation?.running,
      'permissions running projection',
    );
    await until(
      async () =>
        (await host.getByText('起動中…', { exact: true }).count()) === 0 &&
        (await host.getByText('連携が停止中です', { exact: true }).count()) === 0 &&
        (await mcp('write').getByRole('switch').isEnabled()),
      'permissions running display',
    );
    assert.equal((await model()).content.page.id, 'permissions');
  };
  await waitPermissionsRunning();
  const ready = await model();
  assert.equal(ready.id, starting.id);
  assert(ready.revision > starting.revision);
  assert.equal(ready.content.editing.editRevision, starting.content.editing.editRevision);
  checks.push('startup completion clears the permissions warning without navigation or editing');
  const permissionKeys = [
    'allowWrite',
    'allowExecute',
    'allowSendInput',
    'allowRunProcesses',
    'allowUseMcp',
    'allowUseAi',
    'allowUseTts',
  ];
  const permissionValues = (value) =>
    Object.fromEntries(permissionKeys.map((key) => [key, value[key]]));
  const saved = await state();
  const applet = await host.evaluate(async () => (await window.dock.snapshot()).appletApi);
  await mcp('execute').getByRole('switch').uncheck();
  await until(async () => (await state()).allowExecute === false, 'saved MCP permission');
  assert.deepEqual(permissionValues(await state()), {
    ...permissionValues(saved),
    allowExecute: false,
  });
  assert.deepEqual(
    await host.evaluate(async () => (await window.dock.snapshot()).appletApi),
    applet,
  );
  await mcp('execute').getByRole('switch').check();
  await until(async () => (await state()).allowExecute === true, 'restored MCP permission');
  const appletRead = host
    .getByTestId('permission-row-read')
    .locator('[data-caller="Applet"]')
    .getByRole('switch');
  await appletRead.setChecked(!applet.permissions.read);
  await until(
    async () =>
      (await host.evaluate(
        async () => (await window.dock.snapshot()).appletApi.permissions.read,
      )) === !applet.permissions.read,
    'saved Applet permission',
  );
  assert.deepEqual(permissionValues(await state()), permissionValues(saved));
  await appletRead.setChecked(applet.permissions.read);
  await until(
    async () =>
      (await host.evaluate(
        async () => (await window.dock.snapshot()).appletApi.permissions.read,
      )) === applet.permissions.read,
    'restored Applet permission',
  );
  checks.push(
    'permission switches save immediately and keep the other caller and unrelated grants unchanged',
  );
  await stop();
  await launch(true, '操作の許可');
  await waitPermissionsRunning();
  assert.deepEqual(permissionValues(await state()), permissionValues(saved));
  assert.deepEqual(
    await host.evaluate(async () => (await window.dock.snapshot()).appletApi),
    applet,
  );
  await host.screenshot({ path: path.join(profile, 'permissions-restored.png') });
  checks.push('process restart restores the permissions page with live status and saved grants');
  await stop();
  blocker = net.createServer((socket) => socket.destroy());
  await new Promise((resolve, reject) =>
    blocker.once('error', reject).listen(saved.port, '127.0.0.1', resolve),
  );
  await launch(true, '操作の許可');
  await until(
    async () => (await model())?.content.auxiliary.automation?.error,
    'permissions startup failure',
  );
  await mcp('write').getByText('連携が停止中です', { exact: true }).waitFor();
  assert.equal(await mcp('write').getByRole('switch').isChecked(), true);
  assert.equal(await host.getByText('起動中…', { exact: true }).count(), 0);
  assert.deepEqual(permissionValues(await state()), permissionValues(saved));
  checks.push(
    'a real startup failure remains visible on permissions without clearing saved grants',
  );
  await new Promise((resolve) => blocker.close(resolve));
  blocker = undefined;
  await host.evaluate(() => window.dock.automation({ kind: 'retryStart' }));
  await waitPermissionsRunning();
  assert.equal((await state()).error, undefined);
  assert.deepEqual(permissionValues(await state()), permissionValues(saved));
  await host.evaluate(async () => {
    const { state } = await window.dock.automation({ kind: 'status' });
    await window.dock.automation({
      kind: 'configure',
      enabled: false,
      allowWrite: state.allowWrite,
      port: state.port,
    });
  });
  await mcp('write').getByText('連携が停止中です', { exact: true }).waitFor();
  assert.deepEqual(permissionValues(await state()), permissionValues(saved));
  checks.push('recovery and disabling update the open permissions page and preserve all grants');
}
(async () => {
  try {
    await launch();
    await until(
      async () => (await model())?.content.auxiliary.automation?.enabled === false,
      'disabled projection',
    );
    assert.equal(await retryField().count(), 0);
    checks.push('disabled server has no retry action');
    await host.getByRole('combobox', { name: '接続範囲', exact: true }).selectOption('network');
    await until(async () => (await state()).connectionScope === 'network', 'network scope');

    await pauseNextStartup();
    await host.getByRole('switch', { name: 'Codex連携を有効にする', exact: true }).click();
    await until(
      () => inspect(mainPort, "typeof globalThis.__mcpStartupUiRelease === 'function'"),
      'startup gate',
    );
    await until(async () => {
      const value = await model();
      return value?.content.auxiliary.automation?.starting && value;
    }, 'starting projection');
    await until(
      async () =>
        (
          await host.getByRole('group', { name: '連携を有効にする', exact: true }).innerText()
        ).includes('サーバー: 起動中…'),
      'starting text',
    );
    assert.equal(await retryField().count(), 0);
    assert.equal(
      await host.getByRole('switch', { name: 'Codex連携を有効にする', exact: true }).isDisabled(),
      true,
    );
    checks.push('in-flight startup shows progress, disables changes and offers no retry');
    const pendingState = await state();
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.notifications.open'));
    await settingsPage(host);
    await host.getByTestId('settings-page:notifications').waitFor();
    assert.equal((await model()).content.page.id, 'notifications');
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.codex.open'));
    await settingsPage(host);
    await until(async () => {
      const value = await model();
      return value?.content.page.id === 'codex' && value.content.auxiliary.automation?.starting;
    }, 'startup projection after navigation');
    assert.equal(await retryField().count(), 0);
    assert.equal(
      await host.getByRole('switch', { name: 'Codex連携を有効にする', exact: true }).isDisabled(),
      true,
    );
    assert.equal((await state()).port, pendingState.port);
    checks.push(
      'settings navigation remains available during startup and returning keeps the live progress',
    );
    const starting = await model();
    await releaseStartup();
    await waitRunning();
    const ready = await model();
    assert(ready.revision > starting.revision);
    assert.equal(ready.content.page.id, 'codex');
    assert.equal(ready.content.editing.editRevision, starting.content.editing.editRevision);
    checks.push(
      'startup completion advances the page revision and updates the open page without navigation',
    );

    const saved = await state();
    await stop();
    await launch(true);
    await waitRunning();
    assert.equal((await state()).port, saved.port);
    checks.push('restart restores the MCP server page and clears retry without switching settings');
    await stop();
    blocker = net.createServer((socket) => socket.destroy());
    await new Promise((resolve, reject) =>
      blocker.once('error', reject).listen(saved.port, '127.0.0.1', resolve),
    );
    await launch(true);
    await until(
      async () => (await model())?.content.auxiliary.automation?.error,
      'startup failure',
    );
    await retryField().waitFor();
    assert(
      (await retryField().innerText()).includes(
        '保存済みの接続設定で、MCPサーバーの起動を再試行します。',
      ),
    );
    assert.equal(
      await retryField().getByRole('button', { name: '接続を再試行', exact: true }).isEnabled(),
      true,
    );
    await retryField().screenshot({ path: path.join(profile, 'retry-dark-wide.png') });
    checks.push(
      'a real port conflict presents a named retry field with its purpose and an enabled action',
    );
    await host.evaluate(async () => {
      const snapshot = await window.dock.snapshot();
      snapshot.settings.value.host.theme = 'light';
      await window.dock.saveSettings(snapshot.settings.value, snapshot.settings.revision);
    });
    await host.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await host.setViewportSize({ width: 700, height: 840 });
    await retryField().getByRole('button', { name: '接続を再試行', exact: true }).focus();
    await retryField().screenshot({ path: path.join(profile, 'retry-light-narrow.png') });
    await new Promise((resolve) => blocker.close(resolve));
    blocker = undefined;
    await retryField().getByRole('button', { name: '接続を再試行', exact: true }).press('Enter');
    await waitRunning();
    const recovered = await state();
    assert.equal(recovered.error, undefined);
    for (const key of [
      'port',
      'connectionScope',
      'enabled',
      'allowWrite',
      'serverId',
      'configFile',
    ])
      assert.equal(recovered[key], saved[key]);
    checks.push(
      'narrow light retry is keyboard accessible, recovers the server and preserves connection settings',
    );
    await checkPermissions();
    assert.deepEqual(failures, []);
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack || String(error));
    console.error(error);
    await host?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    process.exitCode = 1;
  } finally {
    if (blocker) await new Promise((resolve) => blocker.close(resolve));
    if (host && !host.isClosed()) await releaseStartup().catch(() => {});
    await stop().catch((error) => {
      output += String(error);
      child?.kill();
      success = false;
      process.exitCode = 1;
    });
    fs.writeFileSync(path.join(profile, 'process.log'), output);
    const result = {
      success,
      checks,
      failures,
      profile,
      version: require('../package.json').version,
      portable,
      sha256: portable ? hash(portable) : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
