const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { parse } = require('smol-toml');
const { freePort } = require('./electron-main-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] && path.resolve(process.argv[2]);
const profile = path.join(
  root,
  '.artifacts',
  `codex-registration-${portable ? 'portable' : 'source'}-${Date.now()}`,
);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const checks = [],
  failures = [];
let child,
  browser,
  host,
  success = false,
  output = '';
fs.mkdirSync(profile, { recursive: true });
const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(initial.host, { theme: 'dark', hardwareAcceleration: false, closeToTray: false });
initial.keybindings = [];
initial.globalShortcutCommands = [];
initial.gestures.enabled = false;
initial.updates.checkHostOnAboutOpen = false;
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(initial));
const configFile = path.join(profile, 'codex', 'config.toml');
const original =
  '# unrelated settings\r\nmodel="example"\r\n[mcp_servers.other]\r\nurl="http://other/mcp"\r\n';
fs.mkdirSync(path.dirname(configFile));
fs.writeFileSync(configFile, original);
async function until(fn, label) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error(label);
}
const state = () =>
  host.evaluate(() => window.dock.automation({ kind: 'status' })).then((r) => r.state);
(async () => {
  try {
    const port = await freePort();
    const exe = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
    if (portable) {
      require('./copy-host.cjs').copyHost(portable, exe);
      assert.equal(hash(exe), hash(portable));
    }
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(
      exe,
      [
        ...(portable ? [] : [root]),
        `--test-profile=${profile}`,
        `--test-local-state=${path.join(profile, 'local')}`,
        `--remote-debugging-port=${port}`,
      ],
      { cwd: root, env, windowsHide: true, stdio: 'pipe' },
    );
    child.stdout.on('data', (data) => (output += data));
    child.stderr.on('data', (data) => (output += data));
    browser = await until(
      () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
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
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    const page = await settingsPage(host);
    await page.getByRole('button', { name: 'MCPサーバー', exact: true }).click();
    const section = page.getByTestId('codex-integration-settings');
    await section
      .getByRole('textbox', { name: 'Codexの設定ファイル', exact: true })
      .fill(configFile);
    await section.getByRole('button', { name: '設定先を変更', exact: true }).click();
    await until(async () => (await state()).configFile === configFile, 'config selected');
    await page.getByRole('switch', { name: 'Codex連携を有効にする' }).click();
    await until(async () => (await state()).running, 'server ready');
    const register = section.getByRole('button', {
      name: /^(Codexへ登録|登録を修復)$/,
      exact: true,
    });
    const unregister = section.getByRole('button', { name: '登録を解除', exact: true });
    const dialog = page.getByTestId('settings-dialog');
    await register.click();
    await until(async () => (await state()).registration === 'registered', 'registered');
    const registered = fs.readFileSync(configFile, 'utf8');
    fs.writeFileSync(configFile, registered.replaceAll(/\r?\n/g, '\r\n'));
    await register.click();
    await until(() => fs.readFileSync(configFile, 'utf8') === registered, 'format repaired');
    assert.equal(await dialog.count(), 0);
    checks.push('format-only edit repairs without confirmation and preserves unrelated bytes');

    const external =
      registered.replace('enabled = true', 'enabled = false').replace(/http_headers = .*\n/, '') +
      'disabled_tools=["dangerous"]\ntool_timeout_sec=45\n[mcp_servers.AppDock.http_headers]\nX-Test="keep"\n';
    fs.writeFileSync(configFile, external);
    await register.click();
    await dialog.waitFor();
    assert.equal(fs.readFileSync(configFile, 'utf8'), external);
    assert.equal((await dialog.innerText()).includes('Bearer '), false);
    await dialog.getByTestId('settings-dialog-cancel').click();
    await dialog.waitFor({ state: 'detached' });
    await until(
      () => register.evaluate((element) => document.activeElement === element),
      'focus restored',
    );
    assert.equal(fs.readFileSync(configFile, 'utf8'), external);
    checks.push(
      'changed registration opens secret-free confirmation; cancel preserves file and restores focus',
    );
    await register.click();
    await dialog.waitFor();
    await host.setViewportSize({ width: 1280, height: 840 });
    await dialog.screenshot({ path: path.join(profile, 'repair-dark-wide.png') });
    await dialog.getByTestId('settings-dialog-confirm').click();
    await dialog.waitFor({ state: 'detached' });
    const repaired = fs.readFileSync(configFile, 'utf8');
    assert(repaired.startsWith(original));
    assert.equal(fs.readFileSync(configFile + '.appdock-backup', 'utf8'), external);
    const server = parse(repaired).mcp_servers.AppDock;
    assert.equal(server.enabled, true);
    assert.equal(server.http_headers['X-Test'], 'keep');
    assert.deepEqual(server.disabled_tools, ['dangerous']);
    assert.equal(server.tool_timeout_sec, 45);
    assert.equal((await state()).registration, 'registered');
    checks.push(
      'confirmed repair restores connection, preserves tool policies/separate headers and exact backup',
    );
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const {
      StreamableHTTPClientTransport,
    } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const client = new Client({ name: 'registration-recovery-test', version: '1' });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(server.url), {
          requestInit: { headers: server.http_headers },
        }),
      );
      const info = await client.callTool({ name: 'appdock_get_info', arguments: {} });
      assert.equal(info.isError, undefined);
      assert(JSON.stringify(info.content).includes(require('../package.json').version));
    } finally {
      await client.close();
    }
    checks.push('repaired configuration authenticates a real SDK client and reads host version');

    fs.writeFileSync(configFile, repaired.replace('enabled = true', 'enabled = false'));
    await register.click();
    await dialog.waitFor();
    const concurrent = fs.readFileSync(configFile, 'utf8') + '# concurrent edit\n';
    fs.writeFileSync(configFile, concurrent);
    await dialog.getByTestId('settings-dialog-confirm').click();
    await until(
      async () => (await dialog.innerText()).includes('変更されました'),
      'stale error in dialog',
    );
    assert.equal(fs.readFileSync(configFile, 'utf8'), concurrent);
    await dialog.getByTestId('settings-dialog-cancel').click();
    checks.push('edit during confirmation stays untouched and reports error inside dialog');

    await host.evaluate(async () => {
      const snapshot = await window.dock.snapshot();
      snapshot.settings.value.host.theme = 'light';
      await window.dock.saveSettings(snapshot.settings.value, snapshot.settings.revision);
    });
    await host.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await host.setViewportSize({ width: 700, height: 840 });
    await unregister.click();
    await dialog.waitFor();
    assert.equal(fs.readFileSync(configFile, 'utf8'), concurrent);
    await dialog.screenshot({ path: path.join(profile, 'remove-light-narrow.png') });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await until(
      () => unregister.evaluate((element) => document.activeElement === element),
      'removal focus restored',
    );
    assert.equal(fs.readFileSync(configFile, 'utf8'), concurrent);
    checks.push('narrow light removal confirmation supports Escape cancel and focus return');
    await unregister.click();
    await dialog.waitFor();
    await dialog.getByTestId('settings-dialog-confirm').click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(fs.readFileSync(configFile, 'utf8'), original + '# concurrent edit\n');
    assert.equal(fs.readFileSync(configFile + '.appdock-backup', 'utf8'), concurrent);
    assert.equal((await state()).registration, 'absent');
    checks.push('confirmed removal deletes only owned server and retains unrelated edits/backup');
    assert.deepEqual(failures, []);
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack || String(error));
    console.error(error);
    await host?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await host?.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (child) {
      try {
        await until(() => child.exitCode !== null, 'shutdown');
      } catch {
        child.kill();
        success = false;
        process.exitCode = 1;
      }
    }
    await browser?.close();
    fs.writeFileSync(path.join(profile, 'process.log'), output);
    const result = {
      success,
      checks,
      profile,
      version: require('../package.json').version,
      portable,
      sha256: portable ? hash(portable) : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
