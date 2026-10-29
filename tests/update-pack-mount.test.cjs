const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { spawnSync } = require('node:child_process'),
  { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  base = path.join(root, '.artifacts');
const helper = path.join(base, 'updater/AppDock.Updater.exe');
const run = (...args) => {
  const result = spawnSync(helper, ['--pack', ...args], { windowsHide: true });
  return { ...result, stderr: new TextDecoder('shift_jis').decode(result.stderr) };
};
test(
  'pack works below the existing mounted development root; linked payloads and ordinary junction ancestors remain rejected',
  { skip: process.platform !== 'win32' },
  (t) => {
    fs.mkdirSync(base, { recursive: true });
    const dir = fs.mkdtempSync(path.join(base, 'pack-mounted-'));
    t.after(() => {
      assert.equal(path.dirname(dir), base);
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const host = path.join(dir, 'AppDock.at365.exe');
    fs.writeFileSync(host, 'MZ-host-fixture');
    const out = path.join(dir, 'host-feed');
    const result = run('host', host, '1.0.0', out);
    assert.equal(result.status, 0, result.stderr);
    const feed = JSON.parse(fs.readFileSync(path.join(out, 'update.json')));
    assert.equal(
      feed.payload.sha256,
      createHash('sha256').update(fs.readFileSync(host)).digest('hex'),
    );
    const source = path.join(dir, 'payload');
    fs.mkdirSync(source);
    fs.writeFileSync(
      path.join(source, 'extension.json'),
      JSON.stringify({ apiVersion: 1, id: 'fixture', version: '1.0.0', entry: 'index.js' }),
    );
    fs.writeFileSync(path.join(source, 'index.js'), 'module.exports={}');
    assert.equal(run('applet', source, 'unused', path.join(dir, 'applet-feed')).status, 0);
    const alias = path.join(dir, 'alias');
    fs.symlinkSync(source, alias, 'junction');
    assert.notEqual(run('applet', alias, 'unused', path.join(dir, 'bad-feed')).status, 0);
    // A file below a junction is also rejected, not only a linked leaf.
    assert.notEqual(
      run('host', path.join(alias, 'index.js'), '1.0.0', path.join(dir, 'bad-host')).status,
      0,
    );
    const nested = path.join(source, 'linked');
    fs.symlinkSync(out, nested, 'junction');
    const blocked = run('applet', source, 'unused', path.join(dir, 'bad-applet'));
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /リンク/);
    fs.unlinkSync(nested);
    const outputAlias = path.join(dir, 'output-alias');
    fs.symlinkSync(out, outputAlias, 'junction');
    assert.notEqual(run('host', host, '1.0.0', outputAlias).status, 0);
  },
);

test(
  'apply/recovery and extraction accept mounted storage but reject junction ancestors',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const os = require('node:os');
    const directory = fs.mkdtempSync(path.join(base, 'updater-mounted-'));
    t.after(() => {
      assert.equal(path.dirname(directory), base);
      fs.rmSync(directory, { recursive: true, force: true });
    });
    const decode = (r) => ({ ...r, stderr: new TextDecoder('shift_jis').decode(r.stderr) });
    const invoke = (...args) => decode(spawnSync(helper, args, { windowsHide: true }));
    const installed = path.join(directory, 'installed');
    fs.mkdirSync(installed);
    assert.equal(invoke('--recover', installed).status, 0);
    const alias = path.join(directory, 'alias');
    fs.symlinkSync(installed, alias, 'junction');
    assert.notEqual(invoke('--recover', path.join(alias, 'child')).status, 0);
    const source = path.join(directory, 'source');
    fs.mkdirSync(source);
    fs.writeFileSync(
      path.join(source, 'extension.json'),
      JSON.stringify({ apiVersion: 1, id: 'fixture', version: '1.0.0', entry: 'index.js' }),
    );
    fs.writeFileSync(path.join(source, 'index.js'), 'fixture');
    const feed = path.join(directory, 'feed');
    assert.equal(run('applet', source, 'unused', feed).status, 0);
    const extracted = path.join(directory, 'extracted');
    assert.equal(invoke('--extract', path.join(feed, 'update.zip'), extracted).status, 0);
    assert.equal(fs.readFileSync(path.join(extracted, 'index.js'), 'utf8'), 'fixture');
    assert.notEqual(
      invoke('--extract', path.join(feed, 'update.zip'), path.join(alias, 'new')).status,
      0,
    );
    // The apply job is in its required Temp staging root; the destination is the mounted drive.
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'AppDock-update-mounted-'));
    const job = path.join(stage, 'job.json'),
      payload = path.join(stage, 'payload');
    const destination = path.join(installed, 'extensions', 'fixture');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true });
    fs.cpSync(source, payload, { recursive: true });
    const files = ['extension.json', 'index.js'].sort();
    const digest = createHash('sha256')
      .update(
        files
          .map(
            (f) =>
              f +
              '\0' +
              createHash('sha256')
                .update(fs.readFileSync(path.join(payload, f)))
                .digest('hex') +
              '\n',
          )
          .join(''),
      )
      .digest('hex');
    fs.writeFileSync(
      job,
      JSON.stringify({
        schemaVersion: 1,
        baseDirectory: installed,
        executable: path.join(process.env.SystemRoot, 'System32', 'cmd.exe'),
        args: ['/c', 'exit', '0'],
        processIds: [],
        result: path.join(installed, 'data', 'update-result.json'),
        items: [
          {
            kind: 'applet',
            id: 'fixture',
            version: '1.0.0',
            source: payload,
            destination,
            sha256: digest,
          },
        ],
      }),
    );
    const child = require('node:child_process').spawn(helper, ['--apply', job], {
      windowsHide: true,
    });
    let output = '';
    child.stderr.on('data', (x) => (output += x));
    const exited = new Promise((resolve) => child.once('exit', resolve));
    t.after(() => {
      if (child.exitCode === null) child.kill();
      assert.equal(path.dirname(stage), os.tmpdir());
      fs.rmSync(stage, { recursive: true, force: true });
    });
    for (let attempt = 0; !fs.existsSync(job + '.ready'); attempt++) {
      if (child.exitCode !== null || attempt > 100)
        throw Error(output || 'apply readiness timeout');
      await new Promise((r) => setTimeout(r, 30));
    }
    fs.writeFileSync(job + '.commit', 'apply');
    assert.equal(await exited, 0, output);
    const result = JSON.parse(fs.readFileSync(path.join(installed, 'data', 'update-result.json')));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(invoke('--recover', installed).status, 0);
  },
);
