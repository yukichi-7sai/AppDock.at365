const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { managedApplets, reorderManagedApplets } = require('../out/main/shared/applet-management');
const { PortableUpdates } = require('../out/main/main/core/portable-updates');
const { ExtensionManager } = require('../out/main/main/core/extensions');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const root = path.resolve(__dirname, '..');
const helper = path.join(root, '.artifacts/updater/AppDock.Updater.exe');
const digest = (data) => createHash('sha256').update(data).digest('hex');
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'AppDock-update-test-'));
  t.after(() => {
    assert(path.resolve(base).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(base, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(base, 'extensions'));
  fs.mkdirSync(path.join(base, 'data'));
  fs.copyFileSync(helper, path.join(base, 'AppDock.at365.exe'));
  fs.writeFileSync(path.join(base, 'settings.json'), '{"keep":true}');
  fs.writeFileSync(path.join(base, 'data/keep.txt'), 'retained data');
  return base;
}
function applet(folder, version = '1.0.0') {
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: 'fixture.package',
      name: 'Package',
      version,
      runtime: 'node',
      entry: 'index.js',
    }),
  );
  fs.writeFileSync(path.join(folder, 'index.js'), `exports.activate = () => {}; // ${version}`);
}
function localizedApplet(folder, version = '1.0.0') {
  applet(folder, version);
  const file = path.join(folder, 'extension.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(file)),
      minimumHostVersion: '0.159.0',
      localization: { defaultLanguage: 'ja' },
    }),
  );
  const dictionaries = path.join(folder, 'resources/translations');
  fs.mkdirSync(dictionaries, { recursive: true });
  fs.writeFileSync(
    path.join(dictionaries, 'applet.json'),
    JSON.stringify({ title: `基本 ${version}` }),
  );
  fs.writeFileSync(
    path.join(dictionaries, 'applet_en.json'),
    JSON.stringify({ title: `English ${version}` }),
  );
}
function translationPlan(source, base) {
  const result = spawnSync(helper, ['--plan-applet-translations', source, base], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('dictionary recovery refuses a different owner, destination or source before modifying files', (t) => {
  const base = fixture(t),
    source = path.join(base, 'incoming'),
    destination = path.join(base, 'extensions/fixture.package');
  localizedApplet(source, '2.0.0');
  localizedApplet(destination);
  const owner = {
    kind: 'applet',
    operation: 'update',
    id: 'fixture.package',
    version: '2.0.0',
    source,
    destination,
    sha256: treeHash(source),
    previousSha256: treeHash(destination),
  };
  const resource = translationPlan(source, base)[0];
  const original = treeHash(destination);
  for (const change of [
    { id: 'foreign.applet' },
    { destination: path.join(base, 'translations/host.json') },
    { source: path.join(source, 'index.js') },
  ]) {
    const operationId = randomUUID();
    const swaps = [owner, { ...resource, ...change }].map((item, index) => {
      const directory = path.join(
        base,
        'extensions/.transactions',
        operationId.replaceAll('-', ''),
        String(index),
      );
      return { item, next: path.join(directory, 'next'), backup: path.join(directory, 'previous') };
    });
    fs.writeFileSync(
      path.join(base, 'data/update-transaction.json'),
      JSON.stringify({
        schemaVersion: 2,
        operationId,
        executable: path.join(base, 'AppDock.at365.exe'),
        swaps,
      }),
    );
    const result = spawnSync(helper, ['--recover', base], { encoding: 'utf8', windowsHide: true });
    assert.notEqual(result.status, 0);
    assert.equal(treeHash(destination), original);
    assert.equal(fs.existsSync(path.join(base, 'translations')), false);
  }
});

test('Applet packages carry dictionaries and plan only their own external files', (t) => {
  const base = fixture(t),
    source = path.join(base, 'incoming');
  localizedApplet(source);
  const output = path.join(base, 'feed');
  const pack = spawnSync(helper, ['--pack', 'applet', source, 'unused', output], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(pack.status, 0, pack.stderr);
  const extracted = path.join(base, 'extracted');
  assert.equal(
    spawnSync(helper, ['--extract', path.join(output, 'update.zip'), extracted], {
      windowsHide: true,
    }).status,
    0,
  );
  assert.equal(
    fs.readFileSync(path.join(extracted, 'resources/translations/applet_en.json'), 'utf8'),
    '{"title":"English 1.0.0"}',
  );
  const plans = translationPlan(extracted, base);
  assert.equal(plans.length, 2);
  assert.ok(
    plans.every(
      (item) =>
        item.kind === 'applet-resource' &&
        item.id === 'fixture.package' &&
        item.operation === 'install',
    ),
  );
  assert.equal(
    fs.existsSync(path.join(base, 'translations')),
    false,
    'planning does not copy files',
  );
  for (const item of plans)
    assert.equal(
      path.dirname(item.destination),
      path.join(base, 'translations/applets/fixture.package'),
    );
  fs.mkdirSync(path.dirname(plans[0].destination), { recursive: true });
  fs.writeFileSync(plans[0].destination, '{"edited":true}');
  fs.writeFileSync(
    path.join(path.dirname(plans[0].destination), 'applet_fr.json'),
    '{"custom":true}',
  );
  const next = translationPlan(extracted, base);
  assert.equal(next[0].operation, 'update');
  assert.equal(next[0].previousSha256, digest(Buffer.from('{"edited":true}')));
  assert.equal(next.length, 2, 'unbundled user dictionary is not part of the update');
});

for (const committed of [false, true])
  for (const phase of committed ? ['all'] : ['before', 'applet', 'first-dictionary', 'all'])
    test(`Applet and external dictionary recovery stays consistent: ${phase}, committed=${committed}`, (t) => {
      const base = fixture(t),
        source = path.join(base, 'incoming'),
        destination = path.join(base, 'extensions/fixture.package');
      localizedApplet(source, '2.0.0');
      localizedApplet(destination);
      const dictionaryRoot = path.join(base, 'translations/applets/fixture.package');
      fs.mkdirSync(dictionaryRoot, { recursive: true });
      fs.writeFileSync(path.join(dictionaryRoot, 'applet.json'), '{"title":"edited old"}');
      fs.writeFileSync(path.join(dictionaryRoot, 'applet_fr.json'), '{"title":"custom"}');
      const originalHash = treeHash(destination);
      const items = [
        {
          kind: 'applet',
          operation: 'update',
          id: 'fixture.package',
          version: '2.0.0',
          source,
          destination,
          sha256: treeHash(source),
          previousSha256: originalHash,
        },
        ...translationPlan(source, base),
      ];
      const operationId = randomUUID();
      const swaps = items.map((item, index) => {
        const directory = path.join(
          base,
          'extensions/.transactions',
          operationId.replaceAll('-', ''),
          String(index),
        );
        fs.mkdirSync(directory, { recursive: true });
        return {
          item,
          next: path.join(directory, 'next'),
          backup: path.join(directory, 'previous'),
        };
      });
      const count = { before: 0, applet: 1, 'first-dictionary': 2, all: 3 }[phase];
      for (let index = 0; index < swaps.length; index++) {
        const { item, next, backup } = swaps[index];
        fs.cpSync(item.source, next, { recursive: true });
        if (index >= count) continue;
        if (item.operation === 'update') fs.renameSync(item.destination, backup);
        fs.renameSync(next, item.destination);
      }
      fs.writeFileSync(
        path.join(base, 'data/update-transaction.json'),
        JSON.stringify({
          schemaVersion: 2,
          operationId,
          executable: path.join(base, 'AppDock.at365.exe'),
          committed,
          swaps,
        }),
      );
      const recovered = spawnSync(helper, ['--recover', base], {
        encoding: 'utf8',
        windowsHide: true,
      });
      assert.equal(recovered.status, 0, recovered.stderr);
      assert.equal(treeHash(destination), committed ? treeHash(source) : originalHash);
      assert.equal(
        fs.readFileSync(path.join(dictionaryRoot, 'applet.json'), 'utf8'),
        committed ? '{"title":"基本 2.0.0"}' : '{"title":"edited old"}',
      );
      assert.equal(fs.existsSync(path.join(dictionaryRoot, 'applet_en.json')), committed);
      assert.equal(
        fs.readFileSync(path.join(dictionaryRoot, 'applet_fr.json'), 'utf8'),
        '{"title":"custom"}',
      );
    });

test('translation packaging and planning reject broken bases, foreign filenames and junction targets', (t) => {
  const base = fixture(t),
    source = path.join(base, 'incoming');
  localizedApplet(source);
  const folder = path.join(source, 'resources/translations');
  fs.writeFileSync(path.join(folder, 'host.json'), '{}');
  assert.notEqual(
    spawnSync(helper, ['--pack', 'applet', source, 'unused', path.join(base, 'feed')], {
      windowsHide: true,
    }).status,
    0,
  );
  fs.unlinkSync(path.join(folder, 'host.json'));
  fs.writeFileSync(path.join(folder, 'applet.json'), '{"title":false}');
  assert.notEqual(
    spawnSync(helper, ['--plan-applet-translations', source, base], { windowsHide: true }).status,
    0,
  );
  fs.writeFileSync(path.join(folder, 'applet.json'), '{"title":"valid"}');
  const target = path.join(base, 'translations/applets');
  fs.mkdirSync(target, { recursive: true });
  fs.symlinkSync(path.join(base, 'data'), path.join(target, 'fixture.package'), 'junction');
  assert.notEqual(
    spawnSync(helper, ['--plan-applet-translations', source, base], { windowsHide: true }).status,
    0,
  );
  fs.unlinkSync(path.join(target, 'fixture.package'));
});
function packageUpdater(base, overrides = {}) {
  return new PortableUpdates({
    targets: () => [],
    settings: () => createDefaultSettings().updates,
    hostVersion: '99.0.0',
    helper,
    executable: path.join(base, 'AppDock.at365.exe'),
    baseDirectory: base,
    restartArgs: [],
    processIds: () => [],
    changed() {},
    shutdown() {},
    confirm: async () => true,
    log() {},
    fetcher: async () => {
      throw Error('A local package must not use the network');
    },
    ...overrides,
  });
}
function treeHash(directory) {
  const files = [];
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(file);
      else files.push(path.relative(directory, file).replaceAll('\\', '/'));
    }
  }
  walk(directory);
  return digest(
    files
      .sort()
      .map((file) => `${file}\0${digest(fs.readFileSync(path.join(directory, file)))}\n`)
      .join(''),
  );
}
test('package rows include WebApplet provider and exclude collection children; ordering retains excluded slots', () => {
  const rows = [
    { id: 'a' },
    { id: 'site', collection: { owner: 'at365.web-applet' } },
    { id: 'at365.web-applet' },
    { id: 'builtin', sourceKind: 'builtin' },
  ];
  assert.deepEqual(
    managedApplets(rows).map((a) => a.id),
    ['a', 'at365.web-applet'],
  );
  const saved = ['a', 'site', 'missing', 'at365.web-applet'];
  assert.deepEqual(
    reorderManagedApplets(rows, saved, ['at365.web-applet', 'a'], ['a', 'at365.web-applet']),
    ['at365.web-applet', 'site', 'missing', 'a', 'builtin'],
  );
  assert.throws(() => reorderManagedApplets(rows, saved, ['a', 'a'], ['a', 'at365.web-applet']));
  assert.throws(() =>
    reorderManagedApplets(
      [...rows, { id: 'new' }],
      saved,
      ['at365.web-applet', 'a'],
      ['a', 'at365.web-applet'],
    ),
  );
});

test('unreadable manifests and duplicate IDs are reported without creating manageable rows', (t) => {
  const base = fixture(t),
    extensions = path.join(base, 'extensions');
  applet(path.join(extensions, 'first'));
  applet(path.join(extensions, 'duplicate'));
  const broken = path.join(extensions, 'broken');
  fs.mkdirSync(broken);
  fs.writeFileSync(path.join(broken, 'extension.json'), '{');
  applet(path.join(extensions, '.transactions'));
  const messages = [];
  const manager = new ExtensionManager({
    roots: [extensions],
    settings: { value: createDefaultSettings() },
    log: (...args) => messages.push(args),
  });
  manager.discover();
  assert.equal(manager.discoveryIssueCount, 2);
  assert.equal(manager.snapshot().length, 0);
  assert.equal(messages.length, 2);
});

for (const operation of ['install', 'update', 'uninstall'])
  for (const committed of [false, true]) {
    test(`helper recovery ${operation}, committed=${committed} retains settings and exact original/new placement`, (t) => {
      const base = fixture(t),
        operationId = randomUUID();
      const incoming = path.join(base, 'incoming'),
        original = path.join(base, 'original');
      applet(incoming, '2.0.0');
      applet(original);
      const destination = path.join(base, 'extensions/fixture.package');
      const directory = path.join(
        base,
        'extensions/.transactions',
        operationId.replaceAll('-', ''),
        '0',
      );
      fs.mkdirSync(directory, { recursive: true });
      const backup = path.join(directory, 'previous'),
        next = path.join(directory, 'next');
      if (operation !== 'install') fs.cpSync(original, backup, { recursive: true });
      if (operation !== 'uninstall') fs.cpSync(incoming, destination, { recursive: true });
      const item = {
        operation,
        kind: 'applet',
        id: 'fixture.package',
        version: operation === 'uninstall' ? '1.0.0' : '2.0.0',
        destination,
        ...(operation !== 'uninstall' ? { source: incoming, sha256: treeHash(incoming) } : {}),
        ...(operation !== 'install' ? { previousSha256: treeHash(original) } : {}),
      };
      fs.writeFileSync(
        path.join(base, 'data/update-transaction.json'),
        JSON.stringify({
          schemaVersion: 2,
          operationId,
          executable: path.join(base, 'AppDock.at365.exe'),
          committed,
          swaps: [{ item, next, backup }],
        }),
      );
      const result = spawnSync(helper, ['--recover', base], {
        encoding: 'utf8',
        windowsHide: true,
      });
      assert.equal(result.status, 0, result.stderr);
      const present = committed ? operation !== 'uninstall' : operation !== 'install';
      assert.equal(fs.existsSync(destination), present);
      if (present) assert.equal(treeHash(destination), treeHash(committed ? incoming : original));
      assert.equal(fs.readFileSync(path.join(base, 'settings.json'), 'utf8'), '{"keep":true}');
      assert.equal(fs.readFileSync(path.join(base, 'data/keep.txt'), 'utf8'), 'retained data');
      assert.equal(fs.existsSync(path.join(base, 'data/update-transaction.json')), false);
    });
  }
test('recovery refuses a foreign replacement without touching any previous data', (t) => {
  const base = fixture(t),
    operationId = randomUUID();
  const destination = path.join(base, 'extensions/fixture.package');
  applet(destination, '9.0.0');
  const directory = path.join(
    base,
    'extensions/.transactions',
    operationId.replaceAll('-', ''),
    '0',
  );
  const backup = path.join(directory, 'previous'),
    next = path.join(directory, 'next');
  applet(backup);
  const journal = path.join(base, 'data/update-transaction.json');
  fs.writeFileSync(
    journal,
    JSON.stringify({
      schemaVersion: 2,
      operationId,
      executable: path.join(base, 'AppDock.at365.exe'),
      swaps: [
        {
          item: {
            operation: 'uninstall',
            kind: 'applet',
            id: 'fixture.package',
            version: '1.0.0',
            destination,
            previousSha256: treeHash(backup),
          },
          next,
          backup,
        },
      ],
    }),
  );
  const result = spawnSync(helper, ['--recover', base], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert(fs.existsSync(journal));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(destination, 'extension.json'))).version,
    '9.0.0',
  );
  assert(fs.existsSync(backup));
});
test('partial incoming copy is discarded before commit, without losing an untouched installed package', (t) => {
  const base = fixture(t),
    operationId = randomUUID();
  const destination = path.join(base, 'extensions/fixture.package');
  applet(destination);
  const source = path.join(base, 'incoming');
  applet(source, '2.0.0');
  const directory = path.join(
    base,
    'extensions/.transactions',
    operationId.replaceAll('-', ''),
    '0',
  );
  const next = path.join(directory, 'next'),
    backup = path.join(directory, 'previous');
  fs.mkdirSync(next, { recursive: true });
  fs.writeFileSync(path.join(next, 'partial'), 'interrupted');
  fs.writeFileSync(
    path.join(base, 'data/update-transaction.json'),
    JSON.stringify({
      schemaVersion: 2,
      operationId,
      executable: path.join(base, 'AppDock.at365.exe'),
      swaps: [
        {
          item: {
            operation: 'update',
            kind: 'applet',
            id: 'fixture.package',
            version: '2.0.0',
            destination,
            source,
            sha256: treeHash(source),
            previousSha256: treeHash(destination),
          },
          next,
          backup,
        },
      ],
    }),
  );
  const result = spawnSync(helper, ['--recover', base], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert(!fs.existsSync(next));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(destination, 'extension.json'))).version,
    '1.0.0',
  );
});
test('URL preparation validates package without activation; cancellation and changed uninstall target are safe', async (t) => {
  const base = fixture(t),
    source = path.join(base, 'publish'),
    output = path.join(base, 'feed');
  applet(source);
  const pack = spawnSync(helper, ['--pack', 'applet', source, '1.0.0', output], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(pack.status, 0, pack.stderr);
  const feed = JSON.parse(fs.readFileSync(path.join(output, 'update.json')));
  const targets = [];
  const updater = new PortableUpdates({
    targets: () => targets,
    settings: () => createDefaultSettings().updates,
    hostVersion: '99.0.0',
    helper,
    executable: path.join(base, 'AppDock.at365.exe'),
    baseDirectory: base,
    restartArgs: [],
    processIds: () => [],
    changed() {},
    shutdown() {},
    confirm: async () => true,
    log() {},
    fetcher: async (url) =>
      new Response(
        fs.readFileSync(
          path.join(
            output,
            new URL(url).pathname.endsWith('.zip') ? feed.payload.file : 'update.json',
          ),
        ),
      ),
  });
  await assert.rejects(updater.prepareAppletInstall('file:///C:/package.zip'));
  const plan = await updater.prepareAppletInstall('https://fixture.invalid/feed/');
  assert.equal(plan.id, 'fixture.package');
  assert.equal(plan.operation, 'install');
  assert(!('folder' in plan));
  assert(!fs.existsSync(path.join(base, 'extensions/fixture.package')));
  await assert.rejects(updater.applyAppletPackage(plan.planId, plan.id), /アンインストール/);
  await assert.rejects(updater.discardPackagePlan(plan.planId, plan.id), /アンインストール/);
  assert.equal(updater.packageStatus(plan.planId).status, 'prepared');
  await assert.rejects(updater.check(), /パッケージ操作/);
  await updater.discardPackagePlan(plan.planId);
  await assert.rejects(updater.applyAppletPackage(plan.planId), /古く/);
  const destination = path.join(base, 'extensions/fixture.package');
  applet(destination);
  targets.push({
    id: plan.id,
    name: plan.name,
    version: plan.version,
    kind: 'applet',
    source: '',
    destination,
  });
  await assert.rejects(updater.prepareAppletInstall('https://fixture.invalid/feed/'), /同じID/);
  const removal = await updater.prepareAppletUninstall(plan.id);
  await assert.rejects(
    updater.applyAppletPackage(removal.planId, 'other.applet'),
    /アンインストール/,
  );
  await assert.rejects(
    updater.discardPackagePlan(removal.planId, 'other.applet'),
    /アンインストール/,
  );
  assert.equal(updater.packageStatus(removal.planId).status, 'prepared');
  fs.appendFileSync(path.join(destination, 'index.js'), '// external modification');
  await assert.rejects(updater.applyAppletPackage(removal.planId, plan.id), /変更/);
  assert(fs.existsSync(destination));
  assert.equal(fs.readFileSync(path.join(base, 'data/keep.txt'), 'utf8'), 'retained data');
  await updater.discardPackagePlans();
});

for (const format of ['distribution directory', 'feed file', 'unpacked directory'])
  test(`new installation stages a validated ${format} without activation or source modification`, async (t) => {
    const base = fixture(t),
      source = path.join(base, '配布 元'),
      feed = path.join(base, 'feed');
    applet(source, '1.2.3');
    const before = treeHash(source);
    const packed = spawnSync(helper, ['--pack', 'applet', source, '1.2.3', feed], {
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(packed.status, 0, packed.stderr);
    const updater = packageUpdater(base);
    const location =
      format === 'unpacked directory'
        ? source
        : format === 'feed file'
          ? path.join(feed, 'update.json')
          : feed;
    const plan = await updater.prepareAppletInstall(location);
    assert.equal(plan.id, 'fixture.package');
    assert.equal(plan.version, '1.2.3');
    assert.equal(plan.operation, 'install');
    assert.equal(updater.packageStatus(plan.planId).status, 'prepared');
    assert(!fs.existsSync(path.join(base, 'extensions/fixture.package')));
    assert.equal(treeHash(source), before);
    await updater.discardPackagePlan(plan.planId);
    assert.equal(updater.packageStatus(plan.planId).status, 'unknown');
    assert.equal(fs.readFileSync(path.join(base, 'settings.json'), 'utf8'), '{"keep":true}');
  });

test('local installation refuses invalid sources and failed package validation without changing installed files', async (t) => {
  const base = fixture(t),
    source = path.join(base, 'source'),
    feed = path.join(base, 'feed');
  applet(source);
  const updater = packageUpdater(base);
  for (const location of ['', './source', 'file:///C:/source', 'C:relative', '\\\\?\\C:\\source'])
    await assert.rejects(updater.prepareAppletInstall(location));
  const packed = spawnSync(helper, ['--pack', 'applet', source, '1.0.0', feed], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(packed.status, 0, packed.stderr);
  const feedFile = path.join(feed, 'update.json'),
    info = JSON.parse(fs.readFileSync(feedFile));
  fs.appendFileSync(path.join(feed, info.payload.file), 'corrupt');
  await assert.rejects(updater.prepareAppletInstall(feed), /サイズ・ハッシュ/);
  const manifestFile = path.join(source, 'extension.json'),
    manifest = JSON.parse(fs.readFileSync(manifestFile));
  fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, minimumHostVersion: '999.0.0' }));
  await assert.rejects(updater.prepareAppletInstall(source), /本体バージョン/);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  applet(path.join(base, 'extensions/already-installed'));
  await assert.rejects(updater.prepareAppletInstall(source), /同じID/);
  assert(!fs.existsSync(path.join(base, 'extensions/fixture.package')));
  assert.equal(fs.readFileSync(path.join(base, 'data/keep.txt'), 'utf8'), 'retained data');
  await updater.discardPackagePlans();
});

test('unpacked installation rejects links at the source root and inside the package', async (t) => {
  const base = fixture(t),
    source = path.join(base, 'source'),
    linked = path.join(base, 'linked'),
    outside = path.join(base, 'outside');
  applet(source);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'retained.txt'), 'outside');
  fs.symlinkSync(source, linked, 'junction');
  const updater = packageUpdater(base);
  await assert.rejects(updater.prepareAppletInstall(linked), /リンク/);
  fs.symlinkSync(outside, path.join(source, 'linked'), 'junction');
  await assert.rejects(updater.prepareAppletInstall(source), /リンク/);
  assert(!fs.existsSync(path.join(base, 'extensions/fixture.package')));
  assert.equal(fs.readFileSync(path.join(outside, 'retained.txt'), 'utf8'), 'outside');
});
