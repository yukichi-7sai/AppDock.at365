// Real helper + a controlled restarted process. UI inspection is optional and uses the native window.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.artifacts', `updater-window-${Date.now()}`);
const helper = path.resolve(
  process.argv.find((arg) => arg.endsWith('AppDock.Updater.exe')) ||
    path.join(root, '.artifacts/updater/AppDock.Updater.exe'),
);
const pause = process.argv.includes('--pause');
fs.mkdirSync(output, { recursive: true });
const build = spawnSync(
  'dotnet',
  [
    'build',
    path.join(root, 'tests/fixtures/updater-window/Probe.csproj'),
    '-c',
    'Release',
    '-o',
    path.join(output, 'probe'),
  ],
  { windowsHide: true, encoding: 'utf8' },
);
assert.equal(build.status, 0, build.stdout + build.stderr);
const checks = [];
const hash = (data) => createHash('sha256').update(data).digest('hex');
function treeHash(directory) {
  return hash(
    fs
      .readdirSync(directory)
      .sort()
      .map((name) => `${name}\0${hash(fs.readFileSync(path.join(directory, name)))}\n`)
      .join(''),
  );
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, label);
    await wait(50);
  }
}
function control(stage, details) {
  fs.writeFileSync(
    path.join(output, 'control.json'),
    JSON.stringify({ stage, ...details }, null, 2),
  );
  console.log(JSON.stringify({ output, stage, ...details }));
}
async function scenario(schema, mode = 'host') {
  const base = path.join(output, `${schema}-${mode}`);
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'AppDock-update-'));
  fs.cpSync(path.join(output, 'probe'), base, { recursive: true });
  const executable = path.join(base, 'AppDock.at365.exe');
  fs.renameSync(path.join(base, 'Probe.exe'), executable);
  const destination = path.join(base, 'extensions/fixture');
  const source = path.join(stage, 'source');
  for (const [folder, version] of [
    [destination, '1.0.0'],
    [source, '2.0.0'],
  ]) {
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'extension.json'),
      JSON.stringify({ id: 'fixture', version }),
    );
    fs.writeFileSync(path.join(folder, 'payload.txt'), version);
  }
  fs.mkdirSync(path.join(base, 'data'));
  fs.writeFileSync(require('./test-settings.cjs').file(base, 'settings.json'), 'preserved');
  const old = spawn(executable, ['hold', base], { windowsHide: true, stdio: 'ignore' });
  const job = path.join(stage, 'job.json');
  fs.writeFileSync(
    job,
    JSON.stringify({
      schemaVersion: schema,
      operationId: randomUUID(),
      showProgress: true,
      baseDirectory: base,
      executable,
      result: path.join(base, 'data/update-result.json'),
      args: [mode, base],
      processIds: [old.pid],
      items: [
        {
          kind: 'applet',
          id: 'fixture',
          version: '2.0.0',
          source,
          destination,
          sha256: treeHash(source),
          ...(schema === 2 ? { operation: 'update', previousSha256: treeHash(destination) } : {}),
        },
      ],
    }),
  );
  const child = spawn(helper, ['--apply', job], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', (data) => {
    diagnostics += data;
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try {
    await until(
      () => fs.existsSync(job + '.ready') || child.exitCode !== null,
      'helper did not prepare',
    );
    assert.equal(child.exitCode, null, diagnostics);
    fs.writeFileSync(job + '.commit', 'apply');
    assert.equal(fs.readFileSync(path.join(destination, 'payload.txt'), 'utf8'), '1.0.0');
    if (pause && schema === 2 && mode === 'host') {
      control('waiting', { base, helperPid: child.pid });
      await until(
        () => fs.existsSync(path.join(output, 'continue-shutdown')),
        'manual shutdown observation timed out',
        240000,
      );
    }
    fs.writeFileSync(path.join(base, 'exit-old'), 'exit');
    await until(
      () => fs.existsSync(path.join(base, 'started.json')),
      'replacement host was not started',
    );
    const started = JSON.parse(fs.readFileSync(path.join(base, 'started.json')));
    assert.match(started.pipe, /^AppDock\.UpdateReady\.[a-f0-9]{32}$/);
    assert.equal(child.exitCode, null, 'helper must remain until display acknowledgment');
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(base, 'data/update-result.json'))).ok,
      true,
      diagnostics,
    );
    assert.equal(fs.readFileSync(path.join(destination, 'payload.txt'), 'utf8'), '2.0.0');
    if (mode === 'host') {
      // A different same-user process cannot impersonate the process launched by the helper.
      await new Promise((resolve, reject) => {
        const spoof = net.createConnection('\\\\.\\pipe\\' + started.pipe);
        spoof.on('error', resolve);
        spoof.once('connect', () => {
          spoof.end('shown\n');
          resolve();
        });
        spoof.setTimeout(2000, () => {
          spoof.destroy();
          reject(Error('spoof connection timed out'));
        });
      });
      assert.equal(child.exitCode, null);
      if (pause && schema === 2) {
        control('starting', { base, helperPid: child.pid, restartedPid: started.pid });
        await until(
          () => fs.existsSync(path.join(output, 'continue-startup')),
          'manual startup observation timed out',
          240000,
        );
      }
      fs.writeFileSync(path.join(base, 'show-new'), 'shown');
      await until(
        () => fs.existsSync(path.join(base, 'acknowledged')),
        'display acknowledgment did not reach helper',
      );
    } else {
      control('startup-exit', { base, helperPid: child.pid });
      await until(
        () => child.exitCode !== null,
        'close the startup failure window after observing it',
        240000,
      );
    }
    assert.equal(await exited, 0, diagnostics);
    assert.equal(JSON.parse(fs.readFileSync(path.join(base, 'data/update-result.json'))).ok, true);
    assert.equal(fs.readFileSync(require('./test-settings.cjs').file(base, 'settings.json'), 'utf8'), 'preserved');
    checks.push(
      `schema ${schema}: ${mode === 'host' ? 'waits for old process, rejects spoof, applies, waits for launched process acknowledgment and exits' : 'startup exit leaves an honest dismissible message without reverting committed files'}`,
    );
  } finally {
    fs.writeFileSync(path.join(base, 'show-new'), 'release fixture');
    if (old.exitCode === null) old.kill();
    if (child.exitCode === null) child.kill();
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
(async () => {
  await scenario(2);
  await scenario(1);
  if (pause) await scenario(2, 'exit');
  const result = { ok: true, helper, helperSha256: hash(fs.readFileSync(helper)), checks };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, ...result }, null, 2));
})().catch((error) => {
  fs.writeFileSync(
    path.join(output, 'result.json'),
    JSON.stringify({ ok: false, error: String(error), checks }, null, 2),
  );
  console.error(error);
  process.exitCode = 1;
});
