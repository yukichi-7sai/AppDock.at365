const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  WindowsLaunch,
  psString,
  encodedScript,
  administratorAccountExpression,
} = require('../out/main/main/core/windows-launch');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const sid = 'S-1-5-21-123-456-789-1001';
test(
  'PowerShell preserves explicit Windows cancellation as a typed result',
  { skip: process.platform !== 'win32' },
  async () => {
    const {
      runPowerShell,
      WindowsOperationCancelled,
    } = require('../out/main/main/core/windows-launch');
    await assert.rejects(
      runPowerShell('throw [ComponentModel.Win32Exception]::new(1223)'),
      WindowsOperationCancelled,
    );
  },
);
test(
  'administrator membership includes enabled and deny-only user group claims without granting elevation',
  { skip: process.platform !== 'win32' },
  async () => {
    const { runPowerShell } = require('../out/main/main/core/windows-launch');
    const actual = JSON.parse(
      await runPowerShell(`
$cases=@(
  [pscustomobject]@{ UserClaims=@([Security.Claims.Claim]::new([Security.Claims.ClaimTypes]::GroupSid,'S-1-5-32-544')) },
  [pscustomobject]@{ UserClaims=@([Security.Claims.Claim]::new([Security.Claims.ClaimTypes]::DenyOnlySid,'S-1-5-32-544')) },
  [pscustomobject]@{ UserClaims=@([Security.Claims.Claim]::new([Security.Claims.ClaimTypes]::GroupSid,'S-1-5-32-545')) },
  [pscustomobject]@{ UserClaims=@([Security.Claims.Claim]::new([Security.Claims.ClaimTypes]::Name,'S-1-5-32-544')) },
  [pscustomobject]@{ UserClaims=@() }
)
@($cases | ForEach-Object { $identity=$_; ${administratorAccountExpression} }) | ConvertTo-Json -Compress`),
    );
    assert.deepEqual(actual, [true, true, false, false, false]);
  },
);
test(
  'real Windows startup read distinguishes account membership from the current filtered token',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const {
      runPowerShell,
      WindowsOperationCancelled,
    } = require('../out/main/main/core/windows-launch');
    const expected = JSON.parse(
      await runPowerShell(`
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
@{
  administratorAccount=[bool]((& whoami.exe /groups /fo csv /nh) -match '"S-1-5-32-544"')
  legacyMembership=($identity.Groups.Value -contains 'S-1-5-32-544')
  elevated=([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} | ConvertTo-Json -Compress`),
    );
    const directory = `C:\\AppDock-read-only-${require('node:crypto').randomUUID()}`;
    const service = new WindowsLaunch(`${directory}\\AppDock.exe`, directory, [], true);
    const actual = await service.read();
    assert.equal(actual.administratorAccount, expected.administratorAccount);
    assert.equal(actual.elevated, expected.elevated);
    assert.equal(actual.registered, false);
    if (expected.administratorAccount && !expected.elevated) {
      assert.equal(expected.legacyMembership, false);
      assert.equal(actual.administratorAccount, true);
      let elevationRequests = 0;
      const guarded = new WindowsLaunch(service.executable, directory, [], true, async (script) => {
        // Stop at the actual UAC boundary; never show or approve a prompt in this test.
        if (script.includes('-Verb RunAs')) {
          elevationRequests++;
          throw new WindowsOperationCancelled('test cancellation before UAC');
        }
        return runPowerShell(script);
      });
      const host = createDefaultSettings().host;
      await assert.rejects(
        guarded.save(
          { ...host, startAtLogon: true, runAsAdministrator: true },
          host,
          () => {},
          () => assert.fail('cancelled registration must not commit settings'),
        ),
        WindowsOperationCancelled,
      );
      await assert.rejects(
        guarded.restartElevated(['--restore-view', '--appdock-elevation-attempt']),
        WindowsOperationCancelled,
      );
      assert.equal(elevationRequests, 2);
      assert.equal((await guarded.read()).registered, false);
      t.diagnostic(
        'Filtered administrator reaches both UAC boundaries; no prompt, task or settings changed.',
      );
    }
  },
);
test('launch health excludes explicit UAC cancellation and preflight conflicts, reports operational failure', async () => {
  const { WindowsOperationCancelled } = require('../out/main/main/core/windows-launch');
  const host = createDefaultSettings().host;
  for (const [failure, expected] of [
    [new WindowsOperationCancelled('cancel'), 0],
    [Error('registration failure'), 1],
  ]) {
    let failed = 0,
      calls = 0;
    const service = new WindowsLaunch(
      'C:\\AppDock.exe',
      'C:\\test',
      [],
      true,
      async () => {
        if (calls++ === 0) return JSON.stringify(task());
        throw failure;
      },
      { failed: () => failed++, succeeded: () => {}, changed: () => {} },
    );
    await assert.rejects(
      service.save(
        { ...host, startAtLogon: true },
        host,
        () => {},
        () => {},
      ),
    );
    assert.equal(failed, expected);
    assert.equal(service.isBusy, false);
  }
  let failed = 0;
  const service = new WindowsLaunch(
    'C:\\AppDock.exe',
    'C:\\test',
    [],
    true,
    async () => assert.fail(),
    { failed: () => failed++, succeeded: () => {}, changed: () => {} },
  );
  await assert.rejects(
    service.save(
      host,
      host,
      () => {
        throw Error('revision conflict');
      },
      () => {},
    ),
  );
  assert.equal(failed, 0);
});
const task = (patch = {}) => ({
  administratorAccount: true,
  elevated: false,
  sid,
  xml: null,
  registered: false,
  taskElevated: false,
  ...patch,
});
function fixture(replies, supported = true, readyByte = 1) {
  const scripts = [];
  const service = new WindowsLaunch(
    "C:\\検証 folder\\Alice's AppDock.exe",
    'C:\\検証 folder',
    ['--test-profile=C:\\検証 folder'],
    supported,
    async (script) => {
      scripts.push(script);
      if (script.includes('-PassThru') && !script.includes('-Wait')) {
        const body = Buffer.from(
          script.match(/EncodedCommand ([A-Za-z0-9+/=]+)/)[1],
          'base64',
        ).toString('utf16le');
        const pipe = body.match(/NamedPipeClientStream\]::new\('\.','([^']+)'/)[1];
        const client = require('node:net').connect(`\\\\.\\pipe\\${pipe}`, () =>
          client.end(Buffer.from([readyByte])),
        );
      }
      const reply = replies.shift();
      if (reply instanceof Error) throw reply;
      return typeof reply === 'string' ? reply : JSON.stringify(reply);
    },
  );
  return { service, scripts };
}
test('launch settings migrate absent fields and reject nonboolean JSON', () => {
  const value = createDefaultSettings();
  delete value.host.startAtLogon;
  delete value.host.runAsAdministrator;
  assert.equal(parseSettings(value).host.startAtLogon, false);
  assert.equal(parseSettings(value).host.runAsAdministrator, false);
  for (const key of ['startAtLogon', 'runAsAdministrator']) {
    for (const bad of [null, 0, 'true', {}, []])
      assert.throws(
        () => parseSettings({ ...value, host: { ...value.host, [key]: bad } }),
        new RegExp(key),
      );
  }
});
test('a different-user helper cannot acknowledge elevated restart and standard users cannot save elevated preference', async () => {
  const other = fixture([task(), ''], true, 0);
  await assert.rejects(other.service.restartElevated([]), /同じWindowsユーザー/);
  const standard = fixture([task({ administratorAccount: false })]);
  const host = createDefaultSettings().host;
  await assert.rejects(
    standard.service.save(
      { ...host, runAsAdministrator: true },
      host,
      () => {},
      () => assert.fail('must not save'),
    ),
    /管理者ではありません/,
  );
  assert.equal(standard.scripts.length, 1);
});
test(
  'generated normal and elevated task scripts parse in Windows PowerShell',
  { skip: process.platform !== 'win32' },
  async () => {
    const { runPowerShell } = require('../out/main/main/core/windows-launch');
    const host = createDefaultSettings().host;
    const elevated = fixture([task(), '', task({ registered: true, taskElevated: true })]);
    await elevated.service.save(
      { ...host, startAtLogon: true, runAsAdministrator: true },
      host,
      () => {},
      () => {},
    );
    const restart = fixture([task(), '']);
    await restart.service.restartElevated(
      ['--restore-view', '--test-profile=C:\\日本語 trailing\\'],
      1234,
    );
    const scripts = [...elevated.scripts, ...restart.scripts];
    for (const script of [...scripts]) {
      const nested = script.match(/EncodedCommand ([A-Za-z0-9+/=]+)/);
      if (nested) scripts.push(Buffer.from(nested[1], 'base64').toString('utf16le'));
    }
    for (const script of scripts) {
      const result = await runPowerShell(
        `$tokens=$null; $errors=$null; $null=[System.Management.Automation.Language.Parser]::ParseInput(${psString(script)},[ref]$tokens,[ref]$errors); if ($errors.Count) { throw ($errors.Message -join '; ') }; [Console]::Write('ok')`,
      );
      assert.equal(result, 'ok');
    }
  },
);
test('quoted Unicode paths and encoded scripts round trip without script injection', () => {
  assert.equal(psString("a'; Start-Process x; '"), "'a''; Start-Process x; '''");
  const script = "日本語 $variable 'quoted'\n";
  assert.equal(Buffer.from(encodedScript(script), 'base64').toString('utf16le'), script);
});
test('normal startup registers interactive per-user logon task with exact portable path and restricted ACL', async () => {
  const { service, scripts } = fixture([task(), '', task({ registered: true, xml: '<Task/>' })]);
  const host = createDefaultSettings().host;
  assert.equal(
    await service.save(
      { ...host, startAtLogon: true },
      host,
      () => {},
      () => 42,
    ),
    42,
  );
  const mutation = scripts[1];
  for (const text of [
    'Principal.LogonType=3',
    'Principal.RunLevel=0',
    'Triggers.Create(9)',
    "Delay='PT3S'",
    'MultipleInstances=2',
    "ExecutionTimeLimit='PT0S'",
    'DisallowStartIfOnBatteries=$false',
    'D:P(A;;FA;;;SY)(A;;FA;;;BA)',
    "Alice''s AppDock.exe",
    'ownership mismatch',
  ])
    assert.ok(mutation.includes(text), text);
  assert.ok(!mutation.includes('-Verb RunAs'));
  assert.equal(service.state.registered, true);
});
test('UAC cancellation leaves settings uncommitted and releases save guard', async () => {
  const { service, scripts } = fixture([task(), Error('cancelled')]);
  const host = createDefaultSettings().host;
  let committed = 0;
  await assert.rejects(
    service.save(
      { ...host, startAtLogon: true, runAsAdministrator: true },
      host,
      () => {},
      () => committed++,
    ),
    /キャンセル/,
  );
  assert.equal(committed, 0);
  assert.match(scripts[1], /-Verb RunAs/);
  assert.match(
    Buffer.from(scripts[1].match(/EncodedCommand ([A-Za-z0-9+/=]+)/)[1], 'base64').toString(
      'utf16le',
    ),
    /Principal.RunLevel=1/,
  );
  assert.equal(
    await service.save(
      host,
      host,
      () => {},
      () => 42,
    ),
    42,
  );
});
test('disk conflict or commit failure restores the exact previous Windows task', async () => {
  const xml = '<Task><Settings><Enabled>false</Enabled></Settings></Task>';
  const { service, scripts } = fixture([
    task({ xml }),
    '',
    task({ registered: true }),
    '',
    task({ xml }),
  ]);
  const host = createDefaultSettings().host;
  let checks = 0;
  await assert.rejects(
    service.save(
      { ...host, startAtLogon: true },
      host,
      () => {
        if (++checks === 2) throw Error('revision conflict');
      },
      () => assert.fail('must not save'),
    ),
    /revision conflict/,
  );
  assert.ok(scripts[3].includes(psString(xml)));
  assert.match(scripts[3], /RegisterTask\(/);
  assert.equal(service.state.registered, false);
});
test('preflight conflict fails before Windows mutation, and concurrent saves are rejected', async () => {
  const { service, scripts } = fixture([]);
  const host = createDefaultSettings().host;
  await assert.rejects(
    service.save(
      { ...host, startAtLogon: true },
      host,
      () => {
        throw Error('conflict');
      },
      () => {},
    ),
    /conflict/,
  );
  assert.equal(scripts.length, 0);
  let release;
  const blocking = new WindowsLaunch(
    'C:\\AppDock.exe',
    'C:\\',
    [],
    true,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const first = blocking.save(
    { ...host, startAtLogon: true },
    host,
    () => {},
    () => {},
  );
  await assert.rejects(
    blocking.save(
      host,
      host,
      () => {},
      () => {},
    ),
    /変更中/,
  );
  release('invalid JSON');
  await assert.rejects(first);
});
test('administrator preference alone needs no Windows task; developer startup registration is rejected', async () => {
  const { service, scripts } = fixture([], false);
  const host = createDefaultSettings().host;
  assert.equal(
    await service.save(
      { ...host, runAsAdministrator: true },
      host,
      () => {},
      () => 7,
    ),
    7,
  );
  assert.equal(scripts.length, 0);
  await assert.rejects(
    service.save(
      { ...host, startAtLogon: true },
      host,
      () => {},
      () => {},
    ),
    /発行版/,
  );
});
test('elevated restart waits for current PID, preserves restore arguments, and refuses another account', async () => {
  const { service, scripts } = fixture([task(), '']);
  await service.restartElevated(['--restore-view', '--appdock-elevation-attempt'], 1234);
  const body = Buffer.from(
    scripts[1].match(/EncodedCommand ([A-Za-z0-9+/=]+)/)[1],
    'base64',
  ).toString('utf16le');
  for (const text of [
    'Get-Process -Id 1234',
    'WaitForExit(60000)',
    '--restore-view',
    '--appdock-elevation-attempt',
    sid,
    'IsInRole',
  ])
    assert.ok(body.includes(text), text);
  const standard = fixture([task({ administratorAccount: false })]);
  await assert.rejects(standard.service.restartElevated([]), /このWindowsユーザー/);
  assert.equal(standard.scripts.length, 1);
});
