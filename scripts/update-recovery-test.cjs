// Interrupt an instrumented copy at transaction boundaries, then recover with the shipping helper.
// No checkpoint switches or fault-injection code are added to the production executable.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.artifacts', `update-recovery-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const helper = path.join(root, '.artifacts/updater/AppDock.Updater.exe');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const treeHash = (dir) =>
  hash(
    fs
      .readdirSync(dir)
      .sort()
      .map((name) => `${name}\0${hash(fs.readFileSync(path.join(dir, name)))}\n`)
      .join(''),
  );
let source = fs
  .readFileSync(path.join(root, 'dotnet/AppDock.Updater/Program.cs'), 'utf8')
  .replace(/\r\n/g, '\n');
const checkpoints = [
  'Write(journal, new { executable, helper = Path.Combine(stage, "AppDock.Updater.exe"), swaps });',
  'Verify(swap.Item with { Source = swap.Next });',
  'Move(swap.Item.Destination, swap.Backup, swap.Item.Kind); changed = true;',
  'Move(swap.Next, swap.Item.Destination, swap.Item.Kind);',
  'committed = true;',
];
for (const marker of checkpoints) {
  assert.equal(source.split(marker).length, 2, marker);
  source = source.replace(marker, marker + '\n            Checkpoint();');
}
source = source.replace(
  'private const long Limit',
  `private static int checkpoint;
    private static void Checkpoint() {
        if (++checkpoint != int.Parse(Environment.GetEnvironmentVariable("APPDOCK_PROBE_STEP")!)) return;
        File.WriteAllText(Environment.GetEnvironmentVariable("APPDOCK_PROBE_READY")!, checkpoint.ToString());
        Thread.Sleep(Timeout.Infinite);
    }
    private const long Limit`,
);
source = source.replace(
  'public static int Main(string[] args)\n    {',
  `public static int Main(string[] args)
    {
        if (args.Length == 3 && args[0] == "--hold") {
            using var locked = new FileStream(args[1], FileMode.Open, FileAccess.Read, FileShare.Read);
            File.WriteAllText(args[2], "locked"); Thread.Sleep(Timeout.Infinite);
        }`,
);
assert.ok(source.includes('args[0] == "--hold"'));
fs.writeFileSync(path.join(output, 'Program.cs'), source);
for (const name of [
  'PackageTransactions.cs',
  'HostPackage.cs',
  'UpdateProgressWindow.cs',
  'UpdateStartupWait.cs',
])
  require('./copy-host.cjs').copyHost(
    path.join(root, 'dotnet/AppDock.Updater', name),
    path.join(output, name),
  );
fs.writeFileSync(
  path.join(output, 'Probe.csproj'),
  `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><AssemblyName>RecoveryProbe</AssemblyName></PropertyGroup><ItemGroup><EmbeddedResource Include="${path.join(root, 'src/shared/locales/ja/host.json')}" LogicalName="AppDock.Updater.Messages.json" /></ItemGroup></Project>`,
);
const build = spawnSync(
  'dotnet',
  ['build', path.join(output, 'Probe.csproj'), '-c', 'Release', '-o', path.join(output, 'bin')],
  { windowsHide: true, encoding: 'utf8' },
);
assert.equal(build.status, 0, build.stdout + build.stderr);
const results = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  // journal, two prepared copies, two moves per target, committed journal = eight boundaries.
  for (let step = 1; step <= 8; step++) {
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'AppDock-update-recovery-'));
    const base = path.join(output, `case-${step}`);
    const applet = path.join(base, 'extensions/fixture');
    fs.mkdirSync(applet, { recursive: true });
    fs.mkdirSync(path.join(base, 'data/web-accounts'), { recursive: true });
    fs.writeFileSync(path.join(base, 'settings.json'), 'preserved settings');
    fs.writeFileSync(path.join(base, 'data/web-accounts/cookie'), 'preserved fixture');
    const executable = path.join(base, 'AppDock.at365.exe');
    fs.writeFileSync(executable, 'old exe fixture');
    const hostSource = path.join(stage, 'new.exe');
    fs.writeFileSync(hostSource, 'new exe fixture');
    const appletSource = path.join(stage, 'applet');
    fs.mkdirSync(appletSource);
    for (const [dir, version] of [
      [applet, '1.0.0'],
      [appletSource, '2.0.0'],
    ]) {
      fs.writeFileSync(
        path.join(dir, 'extension.json'),
        JSON.stringify({ id: 'fixture', version }),
      );
      fs.writeFileSync(path.join(dir, 'payload.dll'), version);
    }
    const items = [
      {
        kind: 'host',
        id: 'host',
        version: '2.0.0',
        source: hostSource,
        destination: executable,
        sha256: hash(fs.readFileSync(hostSource)),
      },
      {
        kind: 'applet',
        id: 'fixture',
        version: '2.0.0',
        source: appletSource,
        destination: applet,
        sha256: treeHash(appletSource),
      },
    ];
    const result = path.join(base, 'data/update-result.json');
    const job = path.join(stage, 'job.json');
    const paused = path.join(stage, 'paused');
    fs.writeFileSync(
      job,
      JSON.stringify({
        schemaVersion: 1,
        baseDirectory: base,
        executable,
        args: [],
        processIds: [],
        result,
        items,
      }),
    );
    fs.writeFileSync(job + '.commit', 'apply');
    const child = spawn(path.join(output, 'bin/RecoveryProbe.exe'), ['--apply', job], {
      windowsHide: true,
      stdio: 'pipe',
      env: { ...process.env, APPDOCK_PROBE_STEP: String(step), APPDOCK_PROBE_READY: paused },
    });
    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    const exited = new Promise((resolve) => child.once('exit', resolve));
    try {
      for (let n = 0; !fs.existsSync(paused); n++) {
        assert.ok(n < 200 && child.exitCode === null, stderr || `checkpoint ${step} not reached`);
        await wait(20);
      }
      child.kill();
      await exited;
      const journal = path.join(base, 'data/update-transaction.json');
      assert.ok(fs.existsSync(journal));
      const savedJournal = fs.readFileSync(journal);
      fs.writeFileSync(path.join(base, 'interrupted-journal.json'), savedJournal);
      if (step === 7) {
        const lockReady = path.join(stage, 'locked');
        const locker = spawn(
          path.join(output, 'bin/RecoveryProbe.exe'),
          ['--hold', executable, lockReady],
          { windowsHide: true, stdio: 'ignore' },
        );
        const lockExited = new Promise((resolve) => locker.once('exit', resolve));
        try {
          for (let n = 0; !fs.existsSync(lockReady); n++) {
            assert.ok(n < 200 && locker.exitCode === null, 'lock not acquired');
            await wait(20);
          }
          const blocked = spawnSync(helper, ['--recover', base], {
            windowsHide: true,
            encoding: 'utf8',
          });
          assert.notEqual(blocked.status, 0);
          assert.ok(fs.existsSync(journal), 'failed recovery must retain journal');
          assert.ok(
            fs.existsSync(JSON.parse(savedJournal).swaps[0].backup),
            'host backup must survive a locked destination',
          );
        } finally {
          locker.kill();
          await lockExited;
        }
      }
      const recover = spawnSync(helper, ['--recover', base], {
        windowsHide: true,
        encoding: 'utf8',
      });
      assert.equal(recover.status, 0, recover.stderr);
      const committed = step === 8;
      assert.equal(
        fs.readFileSync(executable, 'utf8'),
        committed ? 'new exe fixture' : 'old exe fixture',
      );
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(applet, 'extension.json'))).version,
        committed ? '2.0.0' : '1.0.0',
      );
      assert.equal(
        fs.readFileSync(path.join(applet, 'payload.dll'), 'utf8'),
        committed ? '2.0.0' : '1.0.0',
      );
      assert.equal(fs.readFileSync(path.join(base, 'settings.json'), 'utf8'), 'preserved settings');
      assert.equal(
        fs.readFileSync(path.join(base, 'data/web-accounts/cookie'), 'utf8'),
        'preserved fixture',
      );
      const report = JSON.parse(fs.readFileSync(result));
      assert.equal(report.ok, committed);
      assert.equal(report.restored, !committed);
      assert.equal(fs.existsSync(journal), false);
      for (const swap of JSON.parse(savedJournal).swaps) {
        assert.equal(fs.existsSync(swap.next), false);
        assert.equal(fs.existsSync(swap.backup), false);
      }
      // A second recovery, including a replayed journal, must not change the chosen version.
      fs.writeFileSync(journal, savedJournal);
      assert.equal(spawnSync(helper, ['--recover', base], { windowsHide: true }).status, 0);
      assert.equal(
        fs.readFileSync(executable, 'utf8'),
        committed ? 'new exe fixture' : 'old exe fixture',
      );
      results.push({ checkpoint: step, committed, lockedDestinationRetry: step === 7, ok: true });
    } finally {
      if (child.exitCode === null) {
        child.kill();
        await exited;
      }
      // stage was created by mkdtemp above; never delete an inferred install directory.
      assert.equal(path.dirname(stage).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
      assert.ok(path.basename(stage).startsWith('AppDock-update-recovery-'));
      fs.rmSync(stage, { recursive: true, force: true });
    }
  }
  fs.writeFileSync(
    path.join(output, 'result.json'),
    JSON.stringify({ ok: true, output, results }, null, 2),
  );
  console.log(JSON.stringify({ ok: true, output, results }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
