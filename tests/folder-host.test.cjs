const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const helper = path.resolve(__dirname, '../.artifacts/updater/AppDock.Updater.exe');
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(args) {
  return spawnSync(helper, args, { encoding: 'utf8', windowsHide: true, timeout: 30000 });
}
function ok(args) {
  const r = run(args);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout;
}
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'AppDock-folder-fixture-'));
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'AppDock-update-'));
  t.after(() => {
    for (const dir of [base, stage])
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
  });
  const source = path.join(stage, 'payload');
  fs.mkdirSync(path.join(source, 'resources'), { recursive: true });
  fs.copyFileSync(helper, path.join(source, 'AppDock.at365.exe'));
  fs.writeFileSync(path.join(source, 'resources/app.asar'), 'new resources');
  fs.writeFileSync(path.join(source, 'ffmpeg.dll'), 'new DLL');
  ok(['--pack', 'host', source, '2.0.0', path.join(stage, 'feed')]);
  fs.copyFileSync(helper, path.join(base, 'AppDock.at365.exe'));
  for (const name of [
    'settings.json',
    'settings-device.json',
    'data/keep.txt',
    'extensions/unrelated/keep.txt',
  ]) {
    fs.mkdirSync(path.dirname(path.join(base, name)), { recursive: true });
    fs.writeFileSync(path.join(base, name), 'preserve');
  }
  const plan = () => JSON.parse(ok(['--plan-host', source, base, '2.0.0']));
  const preserved = () => {
    for (const name of [
      'settings.json',
      'settings-device.json',
      'data/keep.txt',
      'extensions/unrelated/keep.txt',
    ])
      assert.equal(fs.readFileSync(path.join(base, name), 'utf8'), 'preserve');
  };
  return { base, stage, source, plan, preserved };
}
test('folder host packs ZIP and deploys program files while preserving user data', (t) => {
  const f = fixture(t);
  const feed = JSON.parse(fs.readFileSync(path.join(f.stage, 'feed/update.json')));
  assert.equal(feed.payload.format, 'zip');
  assert.equal(feed.payload.file, 'update.zip');
  assert.equal(feed.payload.sha256, digest(path.join(f.stage, 'feed/update.zip')));
  ok(['--deploy-host', f.source, f.base]);
  assert.equal(
    digest(path.join(f.base, 'AppDock.at365.exe')),
    digest(path.join(f.source, 'AppDock.at365.exe')),
  );
  assert.equal(fs.readFileSync(path.join(f.base, 'resources/app.asar'), 'utf8'), 'new resources');
  f.preserved();
  fs.writeFileSync(path.join(f.base, 'resources/obsolete.dll'), 'old');
  ok(['--deploy-host', f.source, f.base]);
  assert(!fs.existsSync(path.join(f.base, 'resources/obsolete.dll')));
  f.preserved();
});
test('folder host update adds/removes managed assets in the existing transaction', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.base, 'dxil.dll'), 'old DLL');
  const items = f.plan();
  assert(items.some((i) => i.id === 'resources' && i.operation === 'install'));
  assert(items.some((i) => i.id === 'dxil.dll' && i.operation === 'uninstall'));
  const job = path.join(f.stage, 'job.json');
  fs.writeFileSync(
    job,
    JSON.stringify({
      schemaVersion: 2,
      operationId: randomUUID(),
      baseDirectory: f.base,
      executable: path.join(f.base, 'AppDock.at365.exe'),
      args: ['--recover', f.base],
      processIds: [],
      result: path.join(f.base, 'data/update-result.json'),
      items,
    }),
  );
  fs.writeFileSync(job + '.commit', 'apply');
  ok(['--apply', job]);
  assert(!fs.existsSync(path.join(f.base, 'dxil.dll')));
  assert.equal(fs.readFileSync(path.join(f.base, 'resources/app.asar'), 'utf8'), 'new resources');
  const result = JSON.parse(fs.readFileSync(path.join(f.base, 'data/update-result.json')));
  assert(result.ok);
  assert.deepEqual(
    result.updated.map((item) => item.id),
    ['host'],
  );
  f.preserved();
});
test('folder host rejects protected paths, unexpected files, and changed versions before handoff', (t) => {
  const f = fixture(t);
  assert.notEqual(run(['--plan-host', f.source, f.base, '9.0.0']).status, 0);
  const manifest = path.join(f.source, 'appdock-host.json');
  const value = JSON.parse(fs.readFileSync(manifest));
  fs.writeFileSync(path.join(f.source, 'settings.json'), 'overwrite');
  assert.notEqual(run(['--plan-host', f.source, f.base, '2.0.0']).status, 0);
  value.entries.push('settings.json');
  fs.writeFileSync(manifest, JSON.stringify(value));
  assert.notEqual(run(['--plan-host', f.source, f.base, '2.0.0']).status, 0);
  assert.notEqual(run(['--deploy-host', f.source, f.base]).status, 0);
  f.preserved();
});
test('folder host recovery rolls back interrupted installs and retains committed updates', (t) => {
  for (const committed of [false, true]) {
    const f = fixture(t);
    const operationId = randomUUID();
    fs.mkdirSync(path.join(f.base, 'resources'));
    fs.writeFileSync(path.join(f.base, 'resources/app.asar'), 'old resources');
    const items = f.plan();
    const transaction = path.join(
      f.base,
      'extensions/.transactions',
      operationId.replaceAll('-', ''),
    );
    const swaps = items.map((item, index) => ({
      item,
      next: path.join(transaction, String(index), 'next'),
      backup: path.join(transaction, String(index), 'previous'),
    }));
    for (const swap of swaps) {
      fs.mkdirSync(path.dirname(swap.next), { recursive: true });
      fs.cpSync(swap.item.source, swap.next, { recursive: true });
      if (swap.item.operation === 'update') fs.renameSync(swap.item.destination, swap.backup);
      fs.renameSync(swap.next, swap.item.destination);
    }
    fs.writeFileSync(
      path.join(f.base, 'data/update-transaction.json'),
      JSON.stringify({
        schemaVersion: 2,
        operationId,
        executable: path.join(f.base, 'AppDock.at365.exe'),
        swaps,
        committed,
      }),
    );
    ok(['--recover', f.base]);
    assert.equal(
      fs.readFileSync(path.join(f.base, 'resources/app.asar'), 'utf8'),
      committed ? 'new resources' : 'old resources',
    );
    assert(!fs.existsSync(path.join(f.base, 'data/update-transaction.json')));
    f.preserved();
  }
});
