const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { PortableUpdates, safeRelative } = require('../out/main/main/core/portable-updates.js');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema.js');
const { validateUpdateSource } = require('../out/main/shared/update-sources.js');
const root = path.resolve(__dirname, '..');
const helper = path.join(root, '.artifacts/updater/AppDock.Updater.exe');
const hash = (data) => createHash('sha256').update(data).digest('hex');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'AppDock-update-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'publish');
  fs.mkdirSync(source);
  const manifest = {
    apiVersion: 1,
    id: 'fixture',
    name: 'Fixture',
    version: '2.0.0',
    runtime: 'node',
    entry: 'index.js',
  };
  fs.writeFileSync(path.join(source, 'extension.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(source, 'index.js'), 'module.exports = {};');
  const settings = createDefaultSettings().updates;
  const target = {
    id: 'fixture',
    name: 'Fixture',
    kind: 'applet',
    version: '1.0.0',
    source,
    destination: path.join(directory, 'extensions/fixture'),
  };
  const notices = [];
  const updater = new PortableUpdates({
    targets: () => [target],
    settings: () => settings,
    hostVersion: '0.22.0',
    helper,
    baseDirectory: directory,
    executable: '',
    restartArgs: [],
    changed() {},
    notified: (notice, safeMessage) => notices.push({ notice, safeMessage }),
    shutdown() {},
    confirm: async () => false,
    processIds: () => [],
    log() {},
  });
  return { directory, source, manifest, settings, target, updater, notices };
}

test('manual update events publish once with safe counts; silent checks do not replay', async (t) => {
  const f = fixture(t);
  f.target.name = 'PRIVATE_ACCOUNT';
  await f.updater.check();
  assert.equal(f.notices.length, 1);
  assert.equal(f.notices[0].notice.kind, 'available');
  assert.equal(f.notices[0].safeMessage, '1件の更新があります。');
  await f.updater.check(undefined, true);
  assert.equal(f.notices.length, 1);
  f.target.source = path.join(f.directory, 'PRIVATE_PATH');
  await f.updater.check();
  assert.equal(f.notices[1].notice.kind, 'error');
  assert(!f.notices[1].safeMessage.includes('PRIVATE'));
  assert.notEqual(f.notices[0].notice.id, f.notices[1].notice.id);
});

test('available updates are notified even when another target fails its check', async (t) => {
  const f = fixture(t);
  const failed = { ...f.target, id: 'broken', source: path.join(f.directory, 'missing') };
  f.updater.options.targets = () => [f.target, failed];
  await f.updater.check();
  assert.deepEqual(
    f.notices.map((n) => n.notice.kind),
    ['available', 'error'],
  );
  assert.equal(f.notices[0].safeMessage, '1件の更新があります。');
  assert.equal(f.updater.state.notice.kind, 'error');
});
test('localized update summaries preserve target names, external details and count-only notifications', (t) => {
  const f = fixture(t);
  const name = 'language.ja {{name}} $t(common.cancel) <&>';
  const message = 'external {{message}} $t(language.ja)';
  const available = { id: 'available', status: 'available', name, latestVersion: '2.0.0' };
  const skipped = { id: 'skipped', status: 'unsupported' };
  f.updater.checkedNotice([available, skipped]);
  assert.equal(
    f.notices[0].notice.message,
    `${name} 2.0.0 に更新できます。 1件は更新元が未設定または未公開です。`,
  );
  assert.equal(
    f.notices[0].safeMessage,
    '1件の更新があります。 1件は更新元が未設定または未公開です。',
  );
  f.updater.checkedNotice([available, { id: 'failed', status: 'error', name, message }]);
  assert.equal(
    f.notices.at(-1).notice.message,
    `${name} 2.0.0 に更新できます。 1件の更新を確認できませんでした。${name}: ${message}`,
  );
  assert(!f.notices.at(-1).safeMessage.includes(name));
  f.updater.checkedNotice([skipped], true);
  assert.equal(
    f.notices.at(-1).notice.message,
    '確認できた対象に更新はありません。1件は更新元が未設定または未公開です。',
  );
  f.updater.checkedNotice([], true);
  assert.equal(f.notices.at(-1).notice.message, '更新を確認する対象がありません。');
});

test('update settings migrate old settings and validate local, UNC, HTTP and GitHub sources', () => {
  const value = createDefaultSettings();
  delete value.updates;
  assert.equal(parseSettings(value).updates.checkHostOnStartup, false);
  for (const source of [
    'A:\\repo\\publish',
    '\\\\server\\share\\publish',
    'https://example.org/update.json',
    'http://localhost:7777/feed/',
    'github:owner/repo',
    'https://github.com/owner/repo/releases',
  ])
    assert.doesNotThrow(() => validateUpdateSource(source));
  for (const source of [
    'relative/path',
    'file:///C:/x',
    'ftp://host/file',
    'https://user:secret@example.org/',
    '\\\\?\\C:\\device',
    'github:owner/repo/evil',
  ])
    assert.throws(() => validateUpdateSource(source));
  value.updates = { ...createDefaultSettings().updates, startupDelaySeconds: -1 };
  assert.throws(() => parseSettings(value));
  for (const name of ['../x', 'a/../../x', 'C:/x', 'a\\b', 'x:stream', 'con.exe', 'a./b'])
    assert.equal(safeRelative(name), false);
});
test('existing local publish directories, ID, minimum host and same-version reapply', async (t) => {
  const f = fixture(t);
  await f.updater.check();
  assert.equal(f.updater.state.results[0].status, 'available');
  f.target.version = '2.0.0';
  await f.updater.check();
  assert.equal(f.updater.state.results[0].installable, false);
  f.settings.allowSameVersion = true;
  await f.updater.check();
  assert.equal(f.updater.state.results[0].installable, true);
  f.target.version = '3.0.0';
  await f.updater.check();
  assert.equal(f.updater.state.results[0].installable, false);
  f.manifest.minimumHostVersion = '99.0.0';
  fs.writeFileSync(path.join(f.source, 'extension.json'), JSON.stringify(f.manifest));
  await f.updater.check();
  assert.equal(f.updater.state.results[0].status, 'incompatible');
  f.manifest.id = 'other';
  fs.writeFileSync(path.join(f.source, 'extension.json'), JSON.stringify(f.manifest));
  await f.updater.check();
  assert.match(f.updater.state.results[0].message, /ID/);
});
test('startup checks only read metadata, do not download or apply, and include disabled Applets', async (t) => {
  const f = fixture(t);
  f.settings.checkAppletsOnStartup = true;
  f.settings.startupDelaySeconds = 0;
  let notifications = 0;
  let applies = 0;
  f.updater.install = async () => {
    applies++;
  };
  await new Promise((resolve) => {
    f.updater.scheduleStartup(false, (results) => {
      assert.equal(results.length, 1);
      notifications++;
      resolve();
    });
  });
  assert.equal(applies, 0);
  assert.equal(notifications, 1);
  assert.equal(
    f.updater.scheduleStartup(true, () => assert.fail()),
    undefined,
  );
});
test('HTTP feeds and GitHub release assets share identity/hash validation; checks never fetch payloads', async (t) => {
  const f = fixture(t);
  const calls = [];
  const feed = {
    schemaVersion: 1,
    kind: 'applet',
    id: 'fixture',
    version: '2.0.0',
    payload: { file: 'update.zip', sha256: 'a'.repeat(64), size: 20, format: 'zip' },
  };
  f.target.source = 'github:owner/repo';
  const updater = new PortableUpdates({
    ...f.updater.options,
    fetcher: async (url) => {
      calls.push(url);
      return new Response(
        JSON.stringify(
          url.includes('/releases/latest')
            ? {
                tag_name: 'v2.0.0',
                assets: [
                  { name: 'update.json', browser_download_url: 'https://example.org/update.json' },
                  { name: 'update.zip', browser_download_url: 'https://example.org/update.zip' },
                ],
              }
            : feed,
        ),
      );
    },
  });
  await updater.check();
  assert.equal(updater.state.results[0].status, 'available');
  assert.equal(calls.length, 2);
  assert.equal(
    calls.some((url) => url.endsWith('.zip')),
    false,
  );
  f.target.source = 'https://example.org/feed/';
  calls.length = 0;
  await updater.check();
  assert.equal(calls[0], 'https://example.org/feed/update.json');
  feed.payload.file = '../escape.zip';
  await updater.check();
  assert.match(updater.state.results[0].message, /配布ファイル/);
});
test('a GitHub source without a public Release is skipped without an update failure', async (t) => {
  const f = fixture(t);
  f.target.version = f.manifest.version;
  const watch = {
    ...f.target,
    id: 'watch',
    name: 'Watch',
    source: 'github:owner/watch',
    destination: path.join(f.directory, 'extensions/watch'),
  };
  const approvals = [],
    calls = [];
  const updater = new PortableUpdates({
    ...f.updater.options,
    executable: path.join(f.directory, 'AppDock.exe'),
    targets: () => [f.target, watch],
    fetcher: async (url) => {
      calls.push(url);
      return new Response('{}', { status: 404 });
    },
    confirm: async (names) => {
      approvals.push(names);
      return false;
    },
    shutdown: () =>
      assert.fail('An unpublished source or a cancelled update cannot restart the host'),
  });
  await updater.check();
  assert.equal(updater.state.results.find((r) => r.id === 'watch').status, 'unpublished');
  assert.equal(updater.state.results.find((r) => r.id === 'fixture').installable, false);
  assert.equal(f.notices.length, 0);
  await updater.install('all');
  assert.equal(updater.state.notice.kind, 'info');
  assert.deepEqual(approvals, []);
  f.settings.allowSameVersion = true;
  await updater.install('all');
  assert.deepEqual(approvals, [['Fixture 2.0.0 → 2.0.0']]);
  assert.equal(updater.state.results.find((r) => r.id === 'watch').status, 'unpublished');
  f.settings.allowSameVersion = false;
  f.target.version = '1.0.0';
  await updater.install('all');
  assert.deepEqual(approvals, [['Fixture 2.0.0 → 2.0.0'], ['Fixture 1.0.0 → 2.0.0']]);
  assert(!f.notices.some((n) => n.notice.kind === 'error'));
  assert(calls.every((url) => url === 'https://api.github.com/repos/owner/watch/releases/latest'));
});

test('HTTP failures for permissions, service errors, feeds and explicit tags remain errors', async (t) => {
  for (const [source, status] of [
    ['github:owner/repo', 403],
    ['github:owner/repo', 503],
    ['https://example.org/update.json', 404],
    ['https://github.com/owner/repo/releases/tag/v9.0.0', 404],
  ])
    await t.test(`${source} HTTP ${status}`, async (t) => {
      const f = fixture(t);
      f.target.source = source;
      const updater = new PortableUpdates({
        ...f.updater.options,
        fetcher: async () => new Response('{}', { status }),
      });
      await updater.check();
      assert.equal(updater.state.results[0].status, 'error');
      assert.match(updater.state.results[0].message, new RegExp(`HTTP ${status}`));
      assert.equal(updater.state.notice.kind, 'error');
    });
});

test('a broken published update.json asset is not classified as an unpublished Release', async (t) => {
  const f = fixture(t);
  f.target.source = 'github:owner/repo';
  const updater = new PortableUpdates({
    ...f.updater.options,
    fetcher: async (url) =>
      url.endsWith('/releases/latest')
        ? new Response(
            JSON.stringify({
              assets: [
                { name: 'update.json', browser_download_url: 'https://example.org/missing.json' },
              ],
            }),
          )
        : new Response('{}', { status: 404 }),
  });
  await updater.check();
  assert.equal(updater.state.results[0].status, 'error');
  assert.equal(updater.state.notice.kind, 'error');
});

test('turning startup checks off during the delay prevents access to update origins', async (t) => {
  const f = fixture(t);
  f.settings.checkAppletsOnStartup = true;
  f.settings.startupDelaySeconds = 0;
  await new Promise((resolve) => {
    f.updater.scheduleStartup(false, (results) => {
      assert.deepEqual(results, []);
      resolve();
    });
    f.settings.checkAppletsOnStartup = false;
  });
  assert.deepEqual(f.updater.state.results, []);
});
test('a corrupt downloaded payload never reaches approval or shutdown', async (t) => {
  const f = fixture(t);
  f.target.source = 'https://example.org/update.json';
  const feed = {
    schemaVersion: 1,
    kind: 'applet',
    id: 'fixture',
    version: '2.0.0',
    payload: { file: 'update.zip', sha256: 'a'.repeat(64), size: 9, format: 'zip' },
  };
  let approvals = 0;
  let shutdowns = 0;
  const updater = new PortableUpdates({
    ...f.updater.options,
    executable: process.execPath,
    fetcher: async (url) =>
      new Response(url.endsWith('update.json') ? JSON.stringify(feed) : 'bad bytes'),
    confirm: async () => {
      approvals++;
      return true;
    },
    shutdown() {
      shutdowns++;
    },
  });
  await assert.rejects(updater.install('fixture'), /ハッシュ/);
  assert.equal(approvals, 0);
  assert.equal(shutdowns, 0);
  assert.equal(updater.state.busy, false);
});
function combinedFixture(t, minimumHostVersion, packaged = false) {
  const f = fixture(t);
  f.manifest.minimumHostVersion = minimumHostVersion;
  fs.writeFileSync(path.join(f.source, 'extension.json'), JSON.stringify(f.manifest));
  if (packaged) {
    const packed = path.join(f.directory, 'package');
    assert.equal(
      spawnSync(helper, ['--pack', 'applet', f.source, 'unused', packed], { windowsHide: true })
        .status,
      0,
    );
    f.target.source = packed;
  }
  const hostSource = path.join(f.directory, 'host-publish');
  fs.mkdirSync(hostSource);
  const payload = Buffer.from('MZhost-fixture');
  fs.writeFileSync(path.join(hostSource, 'AppDock.exe'), payload);
  const feed = {
    schemaVersion: 1,
    kind: 'host',
    id: 'host',
    version: '0.23.0',
    payload: { file: 'AppDock.exe', format: 'exe', sha256: hash(payload), size: payload.length },
  };
  const saveFeed = () =>
    fs.writeFileSync(path.join(hostSource, 'update.json'), JSON.stringify(feed));
  saveFeed();
  const host = {
    id: 'host',
    name: 'AppDock',
    kind: 'host',
    version: '0.22.0',
    source: hostSource,
    destination: path.join(f.directory, 'AppDock.exe'),
  };
  fs.writeFileSync(host.destination, 'installed-host');
  fs.mkdirSync(f.target.destination, { recursive: true });
  fs.writeFileSync(path.join(f.target.destination, 'preserved.txt'), 'installed-applet');
  let approvals = [],
    shutdowns = 0;
  const updater = new PortableUpdates({
    ...f.updater.options,
    // Deliberately put the Applet first: compatibility must use the host in this job.
    targets: () => [f.target, host],
    executable: host.destination,
    confirm: async (names) => {
      approvals.push(names);
      return false;
    },
    shutdown: () => {
      shutdowns++;
    },
  });
  const preserved = () => {
    assert.equal(fs.readFileSync(host.destination, 'utf8'), 'installed-host');
    assert.equal(
      fs.readFileSync(path.join(f.target.destination, 'preserved.txt'), 'utf8'),
      'installed-applet',
    );
    assert.equal(shutdowns, 0);
    assert.equal(updater.state.busy, false);
  };
  return { ...f, updater, host, feed, hostSource, saveFeed, approvals, preserved };
}
test('combined update prepares host and Applet against the new host version in one approval', async (t) => {
  for (const packaged of [false, true]) {
    await t.test(packaged ? 'feed and extracted manifest' : 'local manifest', async (t) => {
      const f = combinedFixture(t, '0.23.0', packaged);
      await f.updater.check();
      assert.equal(f.updater.state.results.find((r) => r.id === 'fixture').status, 'incompatible');
      await f.updater.install('all');
      assert.deepEqual(f.approvals, [['AppDock 0.22.0 → 0.23.0', 'Fixture 1.0.0 → 2.0.0']]);
      assert.equal(f.updater.state.results.find((r) => r.id === 'fixture').installable, true);
      f.preserved();
    });
  }
});
test('combined updates never assume an unavailable or insufficient host upgrade', async (t) => {
  for (const scenario of ['disabled', 'error', 'same', 'older', 'insufficient']) {
    await t.test(scenario, async (t) => {
      const f = combinedFixture(t, scenario === 'insufficient' ? '0.24.0' : '0.23.0');
      if (scenario === 'disabled') f.host.source = '';
      if (scenario === 'error') f.feed.id = 'wrong';
      if (scenario === 'same') f.feed.version = '0.22.0';
      if (scenario === 'older') f.feed.version = '0.21.0';
      f.saveFeed();
      await f.updater.install('all');
      assert.equal(f.updater.state.results.find((r) => r.id === 'fixture').status, 'incompatible');
      assert.equal(f.approvals.length, scenario === 'insufficient' ? 1 : 0);
      if (f.approvals.length) assert.deepEqual(f.approvals[0], ['AppDock 0.22.0 → 0.23.0']);
      f.preserved();
    });
  }
});
test('combined preparation failure leaves both host and Applet installed files intact', async (t) => {
  for (const corrupt of ['host', 'applet']) {
    await t.test(corrupt, async (t) => {
      const f = combinedFixture(t, '0.23.0', true);
      fs.appendFileSync(
        path.join(
          corrupt === 'host' ? f.hostSource : f.target.source,
          corrupt === 'host' ? 'AppDock.exe' : 'update.zip',
        ),
        'corrupt',
      );
      await assert.rejects(f.updater.install('all'), /ハッシュ/);
      assert.deepEqual(f.approvals, []);
      f.preserved();
    });
  }
});
function digestTree(directory) {
  const names = [];
  function walk(current) {
    for (const name of fs.readdirSync(current)) {
      const file = path.join(current, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else names.push(path.relative(directory, file).replace(/\\/g, '/'));
    }
  }
  walk(directory);
  return hash(
    names
      .sort()
      .map((name) => `${name}\0${hash(fs.readFileSync(path.join(directory, name)))}\n`)
      .join(''),
  );
}
async function applyJob(directory, items, afterReady = () => {}) {
  const job = path.join(directory, 'job.json');
  const base = path.join(directory, 'installed');
  fs.mkdirSync(path.join(base, 'data'), { recursive: true });
  const result = path.join(base, 'data/update-result.json');
  fs.writeFileSync(
    job,
    JSON.stringify({
      schemaVersion: 1,
      baseDirectory: base,
      executable: path.join(process.env.SystemRoot, 'System32/cmd.exe'),
      args: ['/c', 'exit', '0'],
      items,
      processIds: [],
      result,
    }),
  );
  const child = spawn(helper, ['--apply', job], { windowsHide: true });
  let output = '';
  child.stderr.on('data', (data) => {
    output += data;
  });
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  for (let i = 0; !fs.existsSync(job + '.ready'); i++) {
    if (i > 100 || child.exitCode !== null) throw Error(output || 'helper did not become ready');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  afterReady();
  fs.writeFileSync(job + '.commit', 'apply');
  assert.equal(await exited, 0, output);
  return JSON.parse(fs.readFileSync(result));
}
test('shared updater swaps two Applet folders, removes obsolete payload files, and preserves host data', async (t) => {
  assert.ok(fs.existsSync(helper), 'Build the updater before running tests');
  const f = fixture(t);
  const base = path.join(f.directory, 'installed');
  const items = [];
  for (const id of ['one', 'two']) {
    const staged = path.join(f.directory, id);
    const installed = path.join(base, 'extensions', id);
    fs.mkdirSync(staged, { recursive: true });
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(staged, 'extension.json'), JSON.stringify({ id, version: '2.0.0' }));
    fs.writeFileSync(path.join(staged, 'new.dll'), 'new');
    fs.writeFileSync(
      path.join(installed, 'extension.json'),
      JSON.stringify({ id, version: '1.0.0' }),
    );
    fs.writeFileSync(path.join(installed, 'obsolete.dll'), 'old');
    items.push({
      kind: 'applet',
      id,
      version: '2.0.0',
      source: staged,
      destination: installed,
      sha256: digestTree(staged),
    });
  }
  fs.mkdirSync(path.join(base, 'data/web-accounts'), { recursive: true });
  fs.writeFileSync(path.join(base, 'settings.json'), 'user settings');
  fs.writeFileSync(path.join(base, 'data/web-accounts/cookie'), 'cookie');
  const result = await applyJob(f.directory, items);
  assert.equal(result.ok, true);
  for (const item of items) {
    assert.ok(fs.existsSync(path.join(item.destination, 'new.dll')));
    assert.equal(fs.existsSync(path.join(item.destination, 'obsolete.dll')), false);
  }
  assert.equal(fs.readFileSync(path.join(base, 'settings.json'), 'utf8'), 'user settings');
  assert.equal(fs.readFileSync(path.join(base, 'data/web-accounts/cookie'), 'utf8'), 'cookie');
});
test('shared updater restores the first Applet if the second destination changes after preparation', async (t) => {
  const f = fixture(t);
  const base = path.join(f.directory, 'installed');
  const items = [];
  for (const id of ['one', 'two']) {
    const staged = path.join(f.directory, id);
    const installed = path.join(base, 'extensions', id);
    fs.mkdirSync(staged, { recursive: true });
    fs.mkdirSync(installed, { recursive: true });
    for (const [folder, version] of [
      [staged, '2.0.0'],
      [installed, '1.0.0'],
    ])
      fs.writeFileSync(path.join(folder, 'extension.json'), JSON.stringify({ id, version }));
    items.push({
      kind: 'applet',
      id,
      version: '2.0.0',
      source: staged,
      destination: installed,
      sha256: digestTree(staged),
    });
  }
  const moved = items[1].destination + '-moved';
  const result = await applyJob(f.directory, items, () =>
    fs.renameSync(items[1].destination, moved),
  );
  assert.equal(result.ok, false);
  assert.equal(result.restored, true);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(items[0].destination, 'extension.json'))).version,
    '1.0.0',
  );
  assert.ok(fs.existsSync(moved));
});
test('published Applet packages are consumable and corrupted ZIP paths are rejected', (t) => {
  const f = fixture(t);
  const output = path.join(f.directory, 'feed');
  const packed = spawnSync(helper, ['--pack', 'applet', f.source, 'unused', output], {
    windowsHide: true,
    encoding: 'utf8',
  });
  assert.equal(packed.status, 0, packed.stderr);
  const feed = JSON.parse(fs.readFileSync(path.join(output, 'update.json')));
  assert.equal(feed.version, '2.0.0');
  assert.equal(feed.payload.sha256, hash(fs.readFileSync(path.join(output, 'update.zip'))));
  const extracted = path.join(f.directory, 'extracted');
  assert.equal(
    spawnSync(helper, ['--extract', path.join(output, 'update.zip'), extracted], {
      windowsHide: true,
    }).status,
    0,
  );
  assert.equal(fs.readFileSync(path.join(extracted, 'index.js'), 'utf8'), 'module.exports = {};');
  // Same byte length changes both ZIP file-name records without invalidating their layout.
  const zip = fs.readFileSync(path.join(output, 'update.zip'));
  const corrupt = Buffer.from(zip.toString('latin1').replaceAll('index.js', '../bad.x'), 'latin1');
  fs.writeFileSync(path.join(output, 'bad.zip'), corrupt);
  assert.notEqual(
    spawnSync(helper, ['--extract', path.join(output, 'bad.zip'), path.join(f.directory, 'bad')], {
      windowsHide: true,
    }).status,
    0,
  );
  assert.equal(fs.existsSync(path.join(f.directory, 'bad.x')), false);
});

test('streaming download reports bytes, cancels without applying, and can be retried', async (t) => {
  const f = fixture(t);
  const packed = path.join(f.directory, 'package');
  assert.equal(
    spawnSync(helper, ['--pack', 'applet', f.source, 'unused', packed], { windowsHide: true })
      .status,
    0,
  );
  const feed = fs.readFileSync(path.join(packed, 'update.json'));
  const zip = fs.readFileSync(path.join(packed, 'update.zip'));
  let slow = true,
    approvals = 0,
    shutdowns = 0,
    closed = false;
  const server = require('node:http').createServer((request, response) => {
    if (request.url === '/update.json') {
      response.end(feed);
      return;
    }
    if (!slow) {
      response.end(zip);
      return;
    }
    response.write(zip.subarray(0, 20));
    response.on('close', () => {
      closed = true;
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  f.target.source = `http://127.0.0.1:${server.address().port}/update.json`;
  fs.mkdirSync(f.target.destination, { recursive: true });
  fs.writeFileSync(path.join(f.target.destination, 'preserved.txt'), 'installed');
  const seen = [];
  let reached;
  const ready = new Promise((resolve) => {
    reached = resolve;
  });
  const updater = new PortableUpdates({
    ...f.updater.options,
    executable: process.execPath,
    changed() {
      if (updater.state.progress?.receivedBytes) {
        seen.push(structuredClone(updater.state.progress));
        reached();
      }
    },
    confirm: async () => {
      approvals++;
      assert.equal(updater.cancel(), false);
      return false;
    },
    shutdown() {
      shutdowns++;
    },
  });
  const installing = updater.install('fixture');
  await ready;
  assert.equal(updater.cancel(), true);
  assert.equal(updater.cancel(), false);
  const cancelled = await installing;
  assert.equal(cancelled.busy, false);
  assert.equal(cancelled.progress, undefined);
  assert.match(cancelled.phase, /取り消しました/);
  assert.equal(approvals, 0);
  assert.equal(shutdowns, 0);
  assert.equal(seen[0].receivedBytes, 20);
  assert.equal(seen[0].totalBytes, zip.length);
  for (let i = 0; i < 50 && !closed; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(closed, true);
  assert.equal(
    fs.readFileSync(path.join(f.target.destination, 'preserved.txt'), 'utf8'),
    'installed',
  );
  slow = false;
  assert.equal((await updater.install('fixture')).busy, false);
  assert.equal(approvals, 1);
  assert.equal(shutdowns, 0);
  assert.ok(seen.some((p) => p.receivedBytes === zip.length));
});

test('metadata cancellation does not become an origin error or request a later target', async (t) => {
  const f = fixture(t);
  f.target.source = 'https://example.test/update.json';
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  let calls = 0;
  const updater = new PortableUpdates({
    ...f.updater.options,
    targets: () => [f.target, { ...f.target, id: 'later' }],
    fetcher: (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        calls++;
        entered();
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
  });
  const checking = updater.check();
  await ready;
  assert.equal(updater.cancel(), true);
  const result = await checking;
  assert.equal(result.busy, false);
  assert.equal(calls, 1);
  assert.deepEqual(result.results, []);
  assert.match(result.phase, /取り消しました/);
});

test('recovery stores journals and results in isolated local state and rejects an unrelated location', (t) => {
  const f = fixture(t),
    base = path.join(f.directory, 'installed'),
    local = path.join(base, 'local-state');
  const destination = path.join(base, 'extensions', 'fixture'),
    suffix = 'b'.repeat(32),
    backup = destination + '.previous-' + suffix;
  fs.mkdirSync(destination, { recursive: true });
  fs.mkdirSync(backup);
  fs.mkdirSync(local);
  fs.writeFileSync(path.join(destination, 'payload'), 'new');
  fs.writeFileSync(path.join(backup, 'payload'), 'old');
  const journal = path.join(local, 'update-transaction.json');
  fs.writeFileSync(
    journal,
    JSON.stringify({
      swaps: [
        {
          item: {
            kind: 'applet',
            id: 'fixture',
            version: '2.0.0',
            source: f.source,
            destination,
            sha256: null,
          },
          next: destination + '.update-' + suffix,
          backup,
        },
      ],
    }),
  );
  assert.equal(spawnSync(helper, ['--recover', base, local], { windowsHide: true }).status, 0);
  assert.equal(fs.readFileSync(path.join(destination, 'payload'), 'utf8'), 'old');
  assert.equal(JSON.parse(fs.readFileSync(path.join(local, 'update-result.json'))).restored, true);
  assert.equal(fs.existsSync(path.join(base, 'data')), false);
  assert.notEqual(
    spawnSync(helper, ['--recover', base, path.join(f.directory, 'unrelated')], {
      windowsHide: true,
    }).status,
    0,
  );
});
test('native recovery accepts the at365 namespace and rejects the old namespace without creating state', (t) => {
  const f = fixture(t);
  const id = hash(randomUUID());
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const state = path.join(local, 'at365', 'AppDock', 'profiles', id);
  const old = path.join(local, 'AppDock', 'profiles', id);
  const other = path.join(local, 'at365', 'AnotherApp', 'profiles', id);
  for (const candidate of [state, old, other]) assert.equal(fs.existsSync(candidate), false);
  // No journal exists at these random IDs. Recover only validates the namespace and returns.
  assert.equal(
    spawnSync(helper, ['--recover', f.directory, state], { windowsHide: true }).status,
    0,
  );
  for (const candidate of [old, other])
    assert.notEqual(
      spawnSync(helper, ['--recover', f.directory, candidate], { windowsHide: true }).status,
      0,
    );
  for (const candidate of [state, old, other]) assert.equal(fs.existsSync(candidate), false);
});
test('recovery validates the complete journal before touching an installed Applet', (t) => {
  const f = fixture(t);
  const base = path.join(f.directory, 'installed');
  const destination = path.join(base, 'extensions/fixture');
  const suffix = 'a'.repeat(32);
  const backup = destination + '.previous-' + suffix;
  for (const [dir, value] of [
    [destination, 'new'],
    [backup, 'old'],
  ]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'payload'), value);
  }
  const safe = {
    item: {
      kind: 'applet',
      id: 'fixture',
      version: '2.0.0',
      source: f.source,
      destination,
      sha256: 'a'.repeat(64),
    },
    next: destination + '.update-' + suffix,
    backup,
  };
  const outside = path.join(f.directory, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'preserved'), 'untouched');
  const invalid = { ...safe, item: { ...safe.item, destination: outside } };
  fs.mkdirSync(path.join(base, 'data'), { recursive: true });
  const journal = path.join(base, 'data/update-transaction.json');
  // Reverse-order recovery used to touch the safe item before rejecting the invalid one.
  const contents = JSON.stringify({ swaps: [invalid, safe] });
  fs.writeFileSync(journal, contents);
  assert.notEqual(spawnSync(helper, ['--recover', base], { windowsHide: true }).status, 0);
  assert.equal(fs.readFileSync(path.join(destination, 'payload'), 'utf8'), 'new');
  assert.equal(fs.readFileSync(path.join(backup, 'payload'), 'utf8'), 'old');
  assert.equal(fs.readFileSync(path.join(outside, 'preserved'), 'utf8'), 'untouched');
  assert.equal(fs.readFileSync(journal, 'utf8'), contents);
});
