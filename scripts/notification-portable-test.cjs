const { getPublishDirectory } = require('./publish-paths.cjs');
// Real single-EXE / Windows Shell activation, using synthetic notifications only.
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const hostWindow =
  "electron.BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('appdock://host/'))";
const main = (copy, expression) =>
  inspect(
    copy.inspectPort,
    '(()=>{const electron=' + electronExpression + ';return (' + expression + ');})()',
  );
async function centerReady(copy) {
  return (
    (await copy.dock.evaluate(
      async () => (await window.dock.snapshot()).navigation.route === 'notifications',
    )) &&
    (await copy.dock.getByTestId('notification-center').isVisible()) &&
    (await main(copy, hostWindow + '.isVisible() && !' + hostWindow + '.isMinimized()'))
  );
}
const assert = require('node:assert/strict');
const { notificationProtocol } = require('../out/main/main/core/notification-routing');
const root = path.resolve(__dirname, '..');
const source = path.resolve(
  process.argv[2] || path.join(getPublishDirectory(root), 'AppDock.at365.exe'),
);
const profile = path.join(root, '.artifacts', `notification-portable-${Date.now()}`);
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const powershell = (code) => {
  try {
    return execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-EncodedCommand',
        Buffer.from("$ProgressPreference='SilentlyContinue';" + code, 'utf16le').toString('base64'),
      ],
      { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
  } catch (error) {
    const detail = String(error.stderr || error.message).replaceAll(
      '#< CLIXML',
      'PowerShell diagnostic',
    );
    fs.writeFileSync(path.join(profile, 'powershell-error.txt'), code + '\n' + detail);
    throw Error(detail);
  }
};
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const activationPids = new Set();
const copies = ['installed', 'test'].map((name) => {
  const folder = path.join(profile, name),
    exe = path.join(folder, 'AppDock.at365.exe');
  fs.mkdirSync(path.join(folder, 'extensions/notification'), { recursive: true });
  fs.copyFileSync(source, exe);
  const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
  settings.host.hardwareAcceleration = false;
  settings.globalShortcutCommands = [];
  settings.extensions['test.notification'] = { enabled: true, settings: {} };
  settings.extensions['test.notification.legacy'] = { enabled: true, settings: {} };
  settings.extensions['fixture.notifications.native'] = { enabled: true, settings: {} };
  settings.notificationPreferences = {
    overrides: [
      {
        ownerKind: 'host',
        ownerId: 'updates',
        typeId: 'applied',
        targets: ['windows'],
        durationSeconds: null,
      },
    ],
  };
  fs.mkdirSync(path.join(folder, 'data'), { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'data/update-result.json'),
    JSON.stringify({ ok: true, message: 'Synthetic update completion' }),
  );
  fs.writeFileSync(path.join(folder, 'settings.json'), JSON.stringify(settings));
  fs.writeFileSync(
    path.join(folder, 'extensions/notification/extension.json'),
    JSON.stringify({
      id: 'test.notification',
      name: 'Synthetic notification',
      version: '1.0.0',
      apiVersion: 1,
      runtime: 'node',
      entry: 'index.js',
      capabilities: ['notifications', 'storage'],
      minimumHostVersion: '0.32.0',
      notificationTypes: [
        {
          typeId: 'message',
          title: 'Typed notice',
          description: 'Fixture',
          levels: ['info'],
          defaultLevel: 'info',
          defaultEnabled: true,
          canDisable: true,
          disabledControlReason: '',
          allowedTargets: ['windows', 'banner'],
          defaultTargets: ['windows'],
          requiredTargets: [],
          lifetimePolicy: 'userDuration',
          defaultDurationSeconds: null,
          history: 'persistent',
        },
      ],
      commands: [
        { id: 'test.notification.typed', title: 'Typed' },
        { id: 'test.notification.end', title: 'End' },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(folder, 'extensions/notification/index.js'),
    `
exports.activate = async context => {
  let id, n=0;
  context.commands.register('test.notification.typed','Typed',async()=>{const result=await context.notifications.publish({typeId:'message',title:'Typed '+(++n),body:'Windows fixture',dedupeKey:'same',historyText:{title:'Safe typed',body:'Safe'}}); id=result.notificationId; await context.storage.set('typed',id);});
  context.commands.register('test.notification.end','End',async()=>context.notifications.end(id));
};`,
  );
  const legacy = path.join(folder, 'extensions/legacy');
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(
    path.join(legacy, 'extension.json'),
    JSON.stringify({
      id: 'test.notification.legacy',
      name: 'Legacy notification fixture',
      version: '1.0.0',
      apiVersion: 1,
      runtime: 'node',
      entry: 'index.js',
      capabilities: ['notifications', 'storage'],
      commands: [
        { id: 'test.notification.legacy.send', title: 'Send' },
        { id: 'test.notification.legacy.open', title: 'Open' },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(legacy, 'index.js'),
    `
exports.activate = async context => {
  context.commands.register('test.notification.legacy.open', 'Open', async () => {
    const count = (await context.storage.get('clicks')) || 0;
    await context.storage.set('clicks', count + 1);
  });
  context.commands.register('test.notification.legacy.send', 'Send', () => context.notifications.show(
    'AppDock synthetic ${name}', 'Gmail-style command notification <&>',
    { silent: true, command: 'test.notification.legacy.open' }));
};`,
  );
  const native = path.join(folder, 'extensions/native');
  fs.mkdirSync(native, { recursive: true });
  fs.cpSync(
    path.join(root, 'tests/fixtures/dotnet/AppDock.Notifications/bin/Release/net10.0'),
    native,
    { recursive: true },
  );
  fs.writeFileSync(
    path.join(native, 'extension.json'),
    JSON.stringify({
      id: 'fixture.notifications.native',
      name: 'Native Windows fixture',
      version: '1.0.0',
      apiVersion: 1,
      minimumHostVersion: '0.32.0',
      runtime: 'native',
      entry: 'NotificationFixture.exe',
      capabilities: ['notifications', 'storage'],
      commands: [
        { id: 'fixture.notifications.native.publish', title: 'Native publish' },
        { id: 'fixture.notifications.native.action', title: 'Native action' },
        { id: 'fixture.notifications.native.policy', title: 'Native policy' },
      ],
      notificationTypes: [
        {
          typeId: 'message',
          title: 'Native notice',
          description: 'Fixture',
          levels: ['info', 'warning'],
          defaultLevel: 'info',
          defaultEnabled: true,
          canDisable: true,
          disabledControlReason: '',
          allowedTargets: ['windows'],
          defaultTargets: ['windows'],
          requiredTargets: [],
          lifetimePolicy: 'userDuration',
          defaultDurationSeconds: null,
          history: 'persistent',
        },
      ],
    }),
  );
  return { folder, exe, protocol: notificationProtocol(exe, folder, true) };
});
const hash = sha256(source);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await wait(100);
  }
  throw Error(label);
}
async function start(copy, initialUri) {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  copy.inspectPort = await freePort();
  copy.child = spawn(
    copy.exe,
    [
      `--test-profile=${copy.folder}`,
      `--remote-debugging-port=${port}`,
      `--inspect=${copy.inspectPort}`,
      ...(initialUri ? [initialUri] : []),
    ],
    { cwd: copy.folder, env, windowsHide: true, stdio: 'ignore' },
  );
  // Launch the OS toast URI as soon as the startup update result reaches Windows.
  // This intentionally races initial renderer/Window readiness.
  if (!initialUri) {
    const activation = powershell(`$ErrorActionPreference='Stop';
    [Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null;
    $deadline=[DateTime]::UtcNow.AddSeconds(25); do {
      foreach($toast in [Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory('at365.appdock')) {
        if(!$toast.Content -or !$toast.Content.DocumentElement){continue};
        $uri=[string]$toast.Content.DocumentElement.GetAttribute('launch');
        if($uri.StartsWith('${copy.protocol}://notification/')) {
          $p=Start-Process -FilePath $uri -WindowStyle Hidden -PassThru;
          ConvertTo-Json -Compress @{uri=$uri;pid=$p.Id}; return
        }
      }; Start-Sleep -Milliseconds 20
    } while([DateTime]::UtcNow -lt $deadline); throw 'Startup toast missing'`);
    copy.startupActivation = JSON.parse(activation);
    if (copy.startupActivation.pid) activationPids.add(copy.startupActivation.pid);
  }
  copy.browser = await until(
    () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }),
    'portable CDP',
  );
  copy.dock = await until(
    () =>
      copy.browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().startsWith('appdock://host/')),
    'host renderer',
  );
  await until(
    async () => (await copy.dock.evaluate(() => window.dock.snapshot())).startupReady,
    'startup ready',
  );
  const snapshot = await copy.dock.evaluate(() => window.dock.snapshot());
  if (!initialUri)
    for (const id of ['test.notification', 'test.notification.legacy'])
      assert.equal(snapshot.extensions.find((e) => e.id === id)?.state, 'running', id);
}
async function stop(copy) {
  if (copy.dock && !copy.dock.isClosed())
    await copy.dock.evaluate(() => {
      void window.dock.executeCommand('appdock.quit');
    });
  if (copy.child) await until(() => copy.child.exitCode !== null, 'portable exit');
  await copy.browser?.close();
  copy.browser = undefined;
}
const count = (copy) => {
  const file = path.join(copy.folder, 'data/storage/test.notification.legacy/clicks.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : 0;
};
function historyUri(copy) {
  return powershell(`$ErrorActionPreference='Stop';
    [Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] | Out-Null;
    foreach($toast in [Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory('at365.appdock')) {
      if(!$toast.Content -or !$toast.Content.DocumentElement) { continue }
      $uri=[string]$toast.Content.DocumentElement.GetAttribute('launch');
      if($uri.StartsWith('${copy.protocol}://notification/')) { $uri; break }
    }`);
}
function activate(copy, uri) {
  assert.ok(uri.startsWith(`${copy.protocol}://notification/`));
  assert.match(uri, /^appdock-notify-[a-f0-9]{32}:\/\/notification\/[a-f0-9-]{36}$/);
  const pid = Number(
    powershell(`(Start-Process -FilePath '${uri}' -WindowStyle Hidden -PassThru).Id`),
  );
  if (pid) activationPids.add(pid);
}
const programs = powershell('[Environment]::GetFolderPath("Programs")');
const shortcuts = ['AppDock.at365.lnk', 'Electron.lnk'].map((name) => {
  const file = path.join(programs, name);
  return { file, bytes: fs.existsSync(file) ? fs.readFileSync(file) : undefined };
});
const registrySnapshot =
  powershell(`$root=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Classes\\CLSID');
  $items=@(); foreach($id in $root.GetSubKeyNames()) { $k=$root.OpenSubKey($id);
    if($k.GetValue('') -eq 'Electron Notification Activator') {
      $s=$k.OpenSubKey('LocalServer32'); if($s){$items+=@{id=$id;target=$s.GetValue('')};$s.Close()}
    }; $k.Close()
  };$root.Close(); ConvertTo-Json -Compress -InputObject $items`);
fs.writeFileSync(path.join(profile, 'registry-before.json'), registrySnapshot);
const checks = [];
(async () => {
  for (const copy of copies) {
    assert.equal(sha256(copy.exe), hash);
    await start(copy);
    await until(() => centerReady(copy), 'startup update notification opens AppDock');
  }
  await until(() => {
    const rows = JSON.parse(
      powershell(
        `$rows=@(); foreach($id in @(${[...activationPids].join(',')})) { $p=Get-Process -Id $id -ErrorAction SilentlyContinue; if($p){$rows+=@{pid=$id;title=$p.MainWindowTitle}} }; ConvertTo-Json -Compress -InputObject $rows`,
      ),
    );
    if (rows.length)
      fs.writeFileSync(
        path.join(profile, 'activation-processes.json'),
        JSON.stringify(rows, null, 2),
      );
    return rows.length === 0;
  }, 'startup notification launchers exit without an error dialog');
  checks.push(
    'startup update completion notification opens the correct host and the secondary launcher exits without an error dialog',
  );
  const copy = copies[0];
  const typedTag = () => {
    const file = path.join(copy.folder, 'data/storage/test.notification/typed.json');
    return (
      fs.existsSync(file) &&
      createHash('sha256')
        .update(JSON.parse(fs.readFileSync(file)))
        .digest('hex')
        .slice(0, 16)
    );
  };
  const toastRows = () =>
    JSON.parse(
      powershell(
        `[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null; $rows=@(); foreach($t in [Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory('at365.appdock')){if($t.Content -and $t.Content.DocumentElement -and ([string]$t.Content.DocumentElement.GetAttribute('launch')).StartsWith('${copy.protocol}://notification/')){$rows+=@{tag=$t.Tag;group=$t.Group;xml=$t.Content.GetXml()}}};ConvertTo-Json -Compress -InputObject $rows`,
      ),
    );
  await copy.dock.evaluate(() => window.dock.executeCommand('test.notification.typed'));
  const first = await until(
    () => toastRows().find((r) => r.tag === typedTag()),
    'typed Windows toast',
  );
  assert.equal(first.group, copy.protocol.slice(-16));
  assert.ok(first.xml.includes('Typed 1'));
  await copy.dock.evaluate(() => window.dock.executeCommand('test.notification.typed'));
  await until(() => {
    const rows = toastRows().filter((r) => r.tag === first.tag);
    return rows.length === 1 && rows[0].xml.includes('Typed 2');
  }, 'same-ID Windows replacement');
  await copy.dock.evaluate(() => window.dock.executeCommand('test.notification.end'));
  await until(
    () => !toastRows().some((r) => r.tag === first.tag),
    'Windows end removes owned toast',
  );
  checks.push(
    'typed Node Windows delivery uses stable tag/group, updates replace one OS entry, explicit end retracts it',
  );
  await copy.dock.evaluate(() =>
    window.dock.executeCommand('fixture.notifications.native.publish'),
  );
  const native = await until(
    () => toastRows().find((r) => r.xml.includes('Native notification')),
    'real .NET typed Windows toast',
  );
  const nativeUri = native.xml.match(/launch="([^"]+)"/)[1];
  await copy.dock.evaluate(() => window.dock.navigate('logs'));
  await main(copy, hostWindow + '.hide()');
  activate(copy, nativeUri);
  await until(() => centerReady(copy), 'typed toast opens notification center');
  await copy.dock.evaluate(() =>
    window.dock.toggleExtension('fixture.notifications.native', false),
  );
  await until(
    () => !toastRows().some((r) => r.tag === native.tag),
    'native owner stop retracts Windows toast',
  );
  checks.push(
    'real .NET typed Windows delivery and Shell activation open the notification center; stopping the owner retracts its OS entry',
  );
  for (const copy of copies) {
    await copy.dock.evaluate(() => window.dock.executeCommand('test.notification.legacy.send'));
    copy.uri = await until(() => historyUri(copy), 'native toast in Action Center');
    const command = powershell(
      `$k=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Classes\\${copy.protocol}\\shell\\open\\command'); $k.GetValue(''); $k.Close()`,
    );
    assert.ok(command.includes(copy.exe));
    assert.ok(command.includes(`--test-profile=${copy.folder}`));
  }
  assert.notEqual(copies[0].protocol, copies[1].protocol);
  checks.push(
    'native synthetic toast XML and protocol registrations target each original single EXE/profile',
  );
  await main(copies[0], hostWindow + '.hide()');
  activate(copies[0], copies[0].uri);
  await until(() => count(copies[0]) === 1, 'installed callback');
  assert.equal(await main(copies[0], hostWindow + '.isVisible()'), true);
  assert.equal(count(copies[1]), 0);
  await main(copies[1], hostWindow + '.minimize()');
  activate(copies[1], copies[1].uri);
  await until(() => count(copies[1]) === 1, 'test callback');
  assert.equal(
    await main(copies[1], hostWindow + '.isVisible() && !' + hostWindow + '.isMinimized()'),
    true,
  );
  assert.equal(count(copies[0]), 1);
  activate(copies[0], copies[0].uri);
  await until(() => centerReady(copies[0]), 'old URI opens center');
  assert.equal(count(copies[0]), 1);
  checks.push(
    'Windows Shell activation returns to the matching running copy; command runs once and never in the other copy',
  );
  await copies[0].dock.evaluate(() => window.dock.executeCommand('test.notification.legacy.send'));
  const stale = await until(() => {
    const uri = historyUri(copies[0]);
    return uri && uri !== copies[0].uri && uri;
  }, 'fresh native toast');
  await copies[0].dock.evaluate(() =>
    window.dock.toggleExtension('test.notification.legacy', false),
  );
  await copies[0].dock.evaluate(() => window.dock.navigate('logs'));
  await main(copies[0], hostWindow + '.hide()');
  activate(copies[0], stale);
  await until(() => centerReady(copies[0]), 'stopped notification opens center');
  assert.equal(count(copies[0]), 1);
  checks.push('notification from a stopped Applet cannot execute its old callback');
  for (const copy of copies) await stop(copy);
  await start(copies[0], copies[0].uri);
  await until(() => centerReady(copies[0]), 'cold notification arguments open center');
  assert.equal(count(copies[0]), 1);
  await stop(copies[0]);
  checks.push(
    'cold URI arguments restore the host and open the center without replaying an action',
  );
  // An old notification after shutdown launches the correct portable host. No
  // previous-process callback is replayed. CDP is deliberately not persisted.
  activate(copies[0], copies[0].uri);
  await until(
    () =>
      fs.existsSync(path.join(copies[0].folder, 'data/chromium/SingletonLock')) ||
      powershell(
        `@(Get-CimInstance Win32_Process | Where-Object {$_.CommandLine -like '*--test-profile=${copies[0].folder}*' -and $_.Name -eq 'AppDock.at365.exe'}).Count`,
      ) !== '0',
    'cold portable activation',
  );
  checks.push(
    'cold Windows Shell activation starts the original portable launcher with the original profile',
  );
  powershell(
    `Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'AppDock.at365.exe' -and $_.CommandLine -like '*--test-profile=${copies[0].folder}*'} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force}`,
  );
  for (const copy of copies) assert.equal(sha256(copy.exe), hash);
  const result = {
    ok: true,
    profile,
    sha256: hash,
    checks,
    limitation:
      'Native toast submission/history and Windows Shell URI dispatch verified. Physical toast click and real Gmail receipt not automated.',
  };
  fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const pid of activationPids)
      powershell(
        `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if($p -and $p.Name -eq 'AppDock.at365.exe' -and $p.ExecutablePath.StartsWith('${profile}\\')) { Stop-Process -Id ${pid} -Force }`,
      );
    for (const copy of copies) {
      if (copy.browser) await stop(copy).catch(() => {});
      if (copy.child?.exitCode === null) copy.child.kill();
      powershell(`[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] | Out-Null;
      foreach($toast in [Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory('at365.appdock')) {
        if(!$toast.Content -or !$toast.Content.DocumentElement) { continue }
        $uri=[string]$toast.Content.DocumentElement.GetAttribute('launch');
        if($uri.StartsWith('${copy.protocol}://notification/')) {
          [Windows.UI.Notifications.ToastNotificationManager]::History.Remove($toast.Tag,$toast.Group,'at365.appdock')
        }
      }`);
      // Remove only this test's URI key, and only if it still points at this copy.
      powershell(`$root=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Classes',$true);
      $key=$root.OpenSubKey('${copy.protocol}\\shell\\open\\command');
      if($key){$target=$key.GetValue('');$key.Close();if($target.Contains('${copy.exe}')){$root.DeleteSubKeyTree('${copy.protocol}')}};$root.Close()`);
    }
    // Electron itself rewrites its shared automatic shortcut/COM registration.
    // Restore the pre-test state after all test processes have exited.
    const before = JSON.parse(registrySnapshot);
    for (const item of before) {
      powershell(`$k=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Classes\\CLSID\\${item.id}\\LocalServer32',$true);
      if($k){$current=$k.GetValue('');if($current -like '*AppDock.at365*' -and $current -ne '${item.target.replace(/'/g, "''")}'){$k.SetValue('','${item.target.replace(/'/g, "''")}')};$k.Close()}`);
    }
    for (const shortcut of shortcuts) {
      if (shortcut.bytes) fs.writeFileSync(shortcut.file, shortcut.bytes);
    }
  });
