const { getPublishDirectory } = require('../scripts/publish-paths.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const helper = path.join(root, '.artifacts/updater/AppDock.Updater.exe');

test(
  'starter selects its declared Applets and preserves the last archive on invalid inputs',
  { skip: process.platform !== 'win32', timeout: 120000 },
  (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'AppDock-bundle-test-'));
    t.after(() => {
      assert.equal(path.dirname(directory), os.tmpdir());
      fs.rmSync(directory, { recursive: true, force: true });
    });
    const host = path.join(directory, '30.PROJECT/host');
    const applets = path.join(directory, '30.PROJECT');
    const applet = path.join(applets, 'Applet.Fixture');
    function run(exe, args, cwd = host) {
      return spawnSync(exe, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    }
    function init(repo) {
      fs.mkdirSync(repo, { recursive: true });
      const args = ['-c', `safe.directory=${repo.replaceAll('\\', '/')}`, '-C', repo];
      for (const command of [
        ['init'],
        [
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.test',
          'commit',
          '--allow-empty',
          '-m',
          'Fixture',
        ],
      ]) {
        const r = run('git', [...args, ...command], repo);
        assert.equal(r.status, 0, r.stderr);
      }
    }
    init(host);
    init(applet);
    fs.mkdirSync(path.join(host, 'scripts'));
    fs.mkdirSync(getPublishDirectory(host), { recursive: true });
    fs.mkdirSync(path.join(host, '.artifacts/updater'), { recursive: true });
    fs.copyFileSync(helper, path.join(host, '.artifacts/updater/AppDock.Updater.exe'));
    fs.copyFileSync(
      path.join(root, 'scripts/build-starter.ps1'),
      path.join(host, 'scripts/build-starter.ps1'),
    );
    fs.copyFileSync(
      path.join(root, 'scripts/publish-paths.ps1'),
      path.join(host, 'scripts/publish-paths.ps1'),
    );
    for (const file of ['verify-starter.ps1', 'starter-applets.ps1']) {
      fs.copyFileSync(path.join(root, 'scripts', file), path.join(host, 'scripts', file));
    }
    const definition = [{ repository: 'Applet.Fixture', id: 'fixture.applet' }];
    const writeDefinition = (applets) =>
      fs.writeFileSync(
        path.join(host, 'scripts/starter-applets.json'),
        JSON.stringify({ schemaVersion: 1, applets }),
      );
    writeDefinition(definition);
    fs.writeFileSync(path.join(host, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    const hostFolder = path.join(getPublishDirectory(host), 'win-unpacked');
    fs.mkdirSync(path.join(hostFolder, 'resources'), { recursive: true });
    fs.writeFileSync(path.join(hostFolder, 'resources/app.asar'), 'fixture');
    const exe = path.join(hostFolder, 'AppDock.at365.exe');
    fs.writeFileSync(exe, 'MZ-host-fixture');
    assert.equal(
      run(helper, ['--pack', 'host', hostFolder, '1.0.0', path.join(getPublishDirectory(host))])
        .status,
      0,
    );
    const manifest = {
      apiVersion: 1,
      id: 'fixture.applet',
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.js',
      minimumHostVersion: '1.0.0',
    };
    fs.mkdirSync(path.join(applet, 'payload'));
    const writeManifest = (value) =>
      fs.writeFileSync(path.join(applet, 'extension.json'), JSON.stringify(value));
    writeManifest(manifest);
    fs.writeFileSync(path.join(applet, 'payload/extension.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(applet, 'payload/index.js'), 'exports.activate = () => {};');
    const publisher = `@echo off\r\nfor %%I in ("%~dp0.") do set "REPO=%%~nxI"\r\n"${helper}" --pack applet "%~dp0payload" unused "%~dp0..\\..\\40.ARTIFACT\\%REPO%"\r\nexit /b %errorlevel%\r\n`;
    fs.writeFileSync(path.join(applet, 'publish.bat'), publisher, 'ascii');
    const build = () =>
      run('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(host, 'scripts/build-starter.ps1'),
        '-AppletRoot',
        applets,
      ]);
    let result = build();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const zip = path.join(getPublishDirectory(host), 'AppDock.at365-starter-1.0.0.zip');
    const hash = () => createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
    fs.writeFileSync(
      path.join(applet, 'payload/index.js'),
      'exports.activate = () => { return 2; };',
    );
    const first = hash();
    result = build();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.notEqual(hash(), first, 'republish must replace the previous complete archive');
    // A newly added sibling must stay outside the starter until explicitly selected.
    const added = path.join(applets, 'Applet.AddedLater');
    init(added);
    fs.mkdirSync(path.join(added, 'payload'));
    const addedManifest = { ...manifest, id: 'fixture.added-later' };
    for (const name of ['extension.json', 'payload/extension.json']) {
      fs.writeFileSync(path.join(added, name), JSON.stringify(addedManifest));
    }
    fs.writeFileSync(path.join(added, 'payload/index.js'), 'exports.activate = () => {};');
    fs.writeFileSync(path.join(added, 'publish.bat'), '@echo off\r\nexit /b 19\r\n', 'ascii');
    result = build();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const extracted = path.join(directory, 'verified-bundle');
    const inspection = run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(host, 'scripts/verify-starter.ps1'),
      '-Archive',
      zip,
      '-Destination',
      extracted,
    ]);
    assert.equal(inspection.status, 0, inspection.stdout + inspection.stderr);
    const bundle = JSON.parse(fs.readFileSync(path.join(extracted, 'bundle.json')));
    assert.deepEqual(bundle.applets.map((item) => item.id).sort(), ['fixture.applet']);
    assert.equal(fs.existsSync(path.join(extracted, 'extensions/Applet.AddedLater')), false);
    assert.equal(
      fs.existsSync(getPublishDirectory(added)),
      false,
      'unlisted Applets must not be published',
    );
    const complete = hash();
    function fails(pattern) {
      const r = build();
      assert.notEqual(r.status, 0);
      assert.match(r.stdout + r.stderr, pattern);
      assert.equal(hash(), complete, 'failed builds must not replace the last successful package');
    }
    fs.writeFileSync(path.join(applet, 'publish.bat'), '@echo off\r\nexit /b 19\r\n', 'ascii');
    writeDefinition([...definition, { repository: 'Applet.Missing', id: 'fixture.missing' }]);
    fails(/Missing starter repository/);
    writeDefinition(definition);
    fails(/Applet publish failed/);
    fs.writeFileSync(path.join(applet, 'publish.bat'), '@echo off\r\nexit /b 0\r\n', 'ascii');
    fs.appendFileSync(path.join(getPublishDirectory(applet), 'update.zip'), 'tampered');
    fails(/Payload hash\/size mismatch/);
    fs.writeFileSync(path.join(applet, 'publish.bat'), publisher, 'ascii');
    writeManifest({ ...manifest, minimumHostVersion: '2.0.0' });
    fails(/Applet requires a newer host/);
    writeManifest(manifest);
    writeManifest({ ...manifest, id: 'wrong.id' });
    fails(/Starter Applet ID mismatch/);
    writeManifest(manifest);
    const duplicate = path.join(applets, 'Applet.Duplicate');
    init(duplicate);
    fs.copyFileSync(path.join(applet, 'extension.json'), path.join(duplicate, 'extension.json'));
    fs.copyFileSync(path.join(applet, 'publish.bat'), path.join(duplicate, 'publish.bat'));
    writeDefinition([...definition, { repository: 'Applet.Duplicate', id: manifest.id }]);
    fails(/Duplicate Applet ID/);
    writeDefinition([...definition, definition[0]]);
    fails(/Duplicate starter repository/);
    writeDefinition([{ repository: '../outside', id: 'outside' }]);
    fails(/Invalid starter repository/);
    writeDefinition([]);
    fails(/Invalid or empty starter definition/);
    writeDefinition([...definition, { repository: 'Applet.AddedLater', id: addedManifest.id }]);
    const rejected = run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(host, 'scripts/verify-starter.ps1'),
      '-Archive',
      zip,
      '-Destination',
      path.join(directory, 'wrong-roster'),
    ]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stdout + rejected.stderr, /Starter roster differs/);
    fs.writeFileSync(path.join(added, 'publish.bat'), publisher, 'ascii');
    result = build();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const selected = path.join(directory, 'selected-bundle');
    result = run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(host, 'scripts/verify-starter.ps1'),
      '-Archive',
      zip,
      '-Destination',
      selected,
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(selected, 'bundle.json')))
        .applets.map((item) => item.id)
        .sort(),
      ['fixture.added-later', 'fixture.applet'],
    );
  },
);
