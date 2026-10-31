const { getPublishDirectory } = require('./publish-paths.cjs');
// Only generated profiles/icons are used. No production tray preference is changed.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { buildPortable } = require('./build-portable.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'tray-identity-' + Date.now(), '日本語 profile');
const executable = path.join(profile, 'AppDock.at365.exe');
const originalExe = path.join(getPublishDirectory(root), 'win-unpacked', 'AppDock.at365.exe');
const updatedOutput = path.join(profile, 'update-build');
const updatedVersion = require('../package.json').version.replace(/\d+$/, (value) =>
  String(Number(value) + 1),
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
fs.mkdirSync(profile, { recursive: true });
require('./copy-host.cjs').copyHost(originalExe, executable);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
let socket, child, evaluate, fixtureIcon;
const children = new Set();
const checkpoints = [];
const registryRoot = String.raw`HKCU:\Control Panel\NotifyIconSettings`;
const quote = (text) => "'" + text.replace(/'/g, "''") + "'";
const powershell = (script) =>
  execFileSync('pwsh.exe', ['-NoProfile', '-Command', "$ErrorActionPreference='Stop';" + script], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
async function until(check, message) {
  const end = Date.now() + 45000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error('Timeout: ' + message);
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function run(args) {
  const process = spawn(executable, args, {
    env,
    windowsHide: true,
    stdio: 'ignore',
    cwd: profile,
  });
  children.add(process);
  return process;
}
async function connect(port) {
  let endpoint;
  await until(async () => {
    try {
      endpoint = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json())[0]
        ?.webSocketDebuggerUrl;
      return !!endpoint;
    } catch {
      return false;
    }
  }, 'main inspector');
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const item = pending.get(message.id);
    pending.delete(message.id);
    if (message.error || message.result.exceptionDetails)
      item.reject(
        Error(
          'Inspector evaluation failed: ' +
            JSON.stringify(message.result?.exceptionDetails || message.error),
        ),
      );
    else item.resolve(message.result.result.value);
  });
  evaluate = (expression) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    });
  await until(async () => {
    try {
      return await evaluate(
        `(()=>{globalThis.electron=process.mainModule.require('electron');globalThis.dock=electron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('appdock://host'));return !!dock && !dock.webContents.isLoading();})()`,
      );
    } catch {
      return false;
    }
  }, 'dock UI');
  await evaluate(
    `(()=>{const original=electron.Tray.prototype.setContextMenu;electron.Tray.prototype.setContextMenu=function(menu){globalThis.testTray=this;return original.call(this,menu);};return true;})()`,
  );
  await evaluate(
    `dock.webContents.executeJavaScript('(async()=>{const {settings}=await window.dock.snapshot();await window.dock.saveSettings(settings.value,settings.revision);return true;})()')`,
  );
  await until(() => evaluate('!!globalThis.testTray'), 'real tray');
  return evaluate(
    `({version:electron.app.getVersion(),guid:testTray.getGUID(),exe:electron.app.getPath('exe'),pid:process.pid,parent:process.ppid,bounds:testTray.getBounds()})`,
  );
}
async function launch() {
  const port = await freePort();
  child = run(['--test-profile=' + profile, '--inspect=' + port]);
  return { ...(await connect(port)), port };
}
function registry(exe) {
  return JSON.parse(
    powershell(
      `$icons=@(Get-ChildItem -LiteralPath ${quote(registryRoot)} | ForEach-Object {$v=Get-ItemProperty -LiteralPath $_.PSPath;if($v.ExecutablePath -eq ${quote(exe)}){[pscustomobject]@{key=$_.PSChildName;promoted=$v.IsPromoted}}});ConvertTo-Json -InputObject $icons -Compress`,
    ),
  );
}
async function quit() {
  const pid = await evaluate('process.pid');
  await evaluate(`setTimeout(()=>electron.app.quit(),50);true`);
  socket.close();
  await until(() => {
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      return true;
    }
  }, 'host shutdown');
}
function assertIdentity(current, baseline) {
  assert.equal(current.exe, baseline.exe);
  assert.equal(current.guid, baseline.guid);
  const records = registry(current.exe);
  assert.equal(records.length, 1);
  assert.equal(records[0].key, fixtureIcon.key);
  assert.equal(records[0].promoted, 1);
}
(async () => {
  try {
    // Change the packed app version in a separate test build, never package.json.
    const startStopOnly = process.argv.includes('--start-stop-only');
    if (!startStopOnly)
      await buildPortable({
        compression: 'store',
        directories: { output: updatedOutput },
        extraMetadata: { version: updatedVersion },
      });
    if (!startStopOnly)
      execFileSync(
        path.join(root, '.artifacts/updater/AppDock.Updater.exe'),
        ['--pack', 'host', path.join(updatedOutput, 'win-unpacked'), updatedVersion, updatedOutput],
        { windowsHide: true },
      );
    const first = await launch();
    assert.match(first.guid, /^[a-f0-9-]{36}$/i);
    assert.equal(path.resolve(first.exe).toLowerCase(), path.resolve(executable).toLowerCase());
    await until(() => registry(first.exe).length === 1, 'Windows tray registration');
    fixtureIcon = registry(first.exe)[0];
    // Model "always show" only on the exact new icon created by this fixture.
    assert.match(fixtureIcon.key, /^\d+$/);
    powershell(
      `Set-ItemProperty -LiteralPath ${quote(registryRoot + '\\' + fixtureIcon.key)} -Name IsPromoted -Value 1 -Type DWord`,
    );
    checkpoints.push({ stage: 'first', ...first, iconKey: fixtureIcon.key });
    await quit();
    assert.ok(fs.existsSync(first.exe));
    if (startStopOnly) {
      fs.writeFileSync(
        path.join(profile, 'result.json'),
        JSON.stringify({ ok: true, checkpoints, startStopOnly }),
      );
      console.log(JSON.stringify({ ok: true, profile, startStopOnly }));
      return;
    }
    const repeated = await launch();
    assertIdentity(repeated, first);
    checkpoints.push({ stage: 'cold restart', ...repeated });
    const runtimeHash = require('node:crypto')
      .createHash('sha256')
      .update(fs.readFileSync(path.join(path.dirname(first.exe), 'resources/app.asar')))
      .digest('hex');
    const duplicates = [run(['--test-profile=' + profile]), run(['--test-profile=' + profile])];
    for (const duplicate of duplicates) {
      await until(() => duplicate.exitCode !== null, 'duplicate launch');
      assert.equal(duplicate.exitCode, 0);
    }
    assert.equal(await evaluate('process.pid'), repeated.pid);
    assert.equal(
      require('node:crypto')
        .createHash('sha256')
        .update(fs.readFileSync(path.join(path.dirname(first.exe), 'resources/app.asar')))
        .digest('hex'),
      runtimeHash,
    );
    await evaluate(
      `dock.webContents.executeJavaScript('setTimeout(()=>window.dock.executeCommand("appdock.restart"),50);true')`,
    );
    socket.close();
    // Wait for the old debugger endpoint to disappear before connecting to its replacement.
    await until(() => {
      try {
        process.kill(repeated.pid, 0);
        return false;
      } catch {
        return true;
      }
    }, 'restart old host');
    const restarted = await connect(repeated.port);
    assertIdentity(restarted, first);
    checkpoints.push({ stage: 'command restart', ...restarted });
    await quit();
    assert.ok(fs.existsSync(first.exe));
    require('./copy-host.cjs').copyHost(path.join(updatedOutput, 'AppDock.at365.exe'), executable);
    const updated = await launch();
    assert.notEqual(updated.version, first.version);
    assertIdentity(updated, first);
    checkpoints.push({ stage: 'version update', ...updated });
    // A killed host releases the single-instance lock without removing program files.
    child.kill();
    await until(() => child.signalCode !== null || child.exitCode !== null, 'host termination');
    socket.close();
    const recovered = await launch();
    assertIdentity(recovered, first);
    checkpoints.push({ stage: 'host crash recovery', ...recovered });
    await quit();
    assert.ok(fs.existsSync(first.exe));
    const result = {
      ok: true,
      checkpoints,
      checks: [
        'stable GUID and executable path',
        'same Windows icon record and IsPromoted across version update',
        'Japanese/spaced profile',
        'simultaneous second launches preserve running files',
        'command restart',
        'host crash recovery',
        'program files persist after shutdown',
      ],
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ok: true, profile, checks: result.checks }));
  } finally {
    if (socket?.readyState === WebSocket.OPEN) await quit().catch(() => {});
    for (const process of children)
      if (process.exitCode === null && process.signalCode === null) process.kill();
    if (fixtureIcon) {
      const key = quote(registryRoot + '\\' + fixtureIcon.key);
      if (fixtureIcon.promoted == null)
        powershell(
          `Remove-ItemProperty -LiteralPath ${key} -Name IsPromoted -ErrorAction SilentlyContinue`,
        );
      else
        powershell(
          `Set-ItemProperty -LiteralPath ${key} -Name IsPromoted -Value ${fixtureIcon.promoted} -Type DWord`,
        );
    }
  }
})().catch((error) => {
  fs.writeFileSync(path.join(profile, 'failure.txt'), String(error));
  console.error(error);
  process.exit(1);
});
