const { getPublishDirectory } = require('./publish-paths.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net'),
  assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const { createHash, randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const { readStarterDefinition } = require('./starter-applets.cjs');
const version = require('../package.json').version;
const archive = path.resolve(
  process.argv[3] || path.join(getPublishDirectory(root), `AppDock.at365-starter-${version}.zip`),
);
const archiveSha256 = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
const profile = path.join(root, '.artifacts', `bundle-verify-${randomUUID()}`);
const extracted = spawnSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(__dirname, 'verify-starter.ps1'),
    '-Archive',
    archive,
    '-Destination',
    profile,
  ],
  { encoding: 'utf8', windowsHide: true },
);
assert.equal(extracted.status, 0, extracted.stdout + extracted.stderr);
const bundle = JSON.parse(
  fs.readFileSync(path.join(profile, 'bundle.json'), 'utf8').replace(/^\uFEFF/, ''),
);
assert.equal(bundle.hostVersion, version);
const roster = (items) =>
  items
    .map(({ repository, id }) => ({ repository, id }))
    .sort((a, b) => a.repository.localeCompare(b.repository));
assert.deepEqual(roster(bundle.applets), roster(readStarterDefinition(root)));
const reservedKey = /^(Pause|F1[3-9]|F2[0-4])$/;
const initial = require('../out/main/shared/settings-schema.js').createDefaultSettings();
initial.updates.checkHostOnAboutOpen = false;
// Keep published manifests intact. Suppress reserved default bindings only in
// this isolated test profile before the host can register them with Windows.
initial.keybindingDefaultsInitialized = bundle.applets
  .filter((applet) => {
    const manifest = JSON.parse(
      fs
        .readFileSync(path.join(profile, 'extensions', applet.repository, 'extension.json'), 'utf8')
        .replace(/^\uFEFF/, ''),
    );
    return (manifest.defaultKeybindings ?? []).some((row) =>
      row.key.split('+').some((key) => reservedKey.test(key)),
    );
  })
  .map((applet) => applet.id);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
assert.equal(
  createHash('sha256')
    .update(fs.readFileSync(path.join(profile, 'AppDock.at365.exe')))
    .digest('hex'),
  createHash('sha256')
    .update(
      fs.readFileSync(path.join(getPublishDirectory(root), 'win-unpacked', 'AppDock.at365.exe')),
    )
    .digest('hex'),
);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function connect(port) {
  let last;
  let browser;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      browser ??= await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 2500 });
      const pages = browser.contexts().flatMap((context) => context.pages());
      const page = pages.find((page) => page.url().startsWith('appdock://host/'));
      if (!page) {
        throw Error('host renderer not ready');
      }
      await require('./shell-overlay-helper.cjs').startupPage(page);
      return { browser, page };
    } catch (error) {
      last = error;
      if (browser && !browser.isConnected()) browser = undefined;
      await wait(200);
    }
  }
  await browser?.close().catch(() => {});
  throw last;
}
async function waitSnapshot(page, predicate) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(() => window.dock.snapshot());
    if (predicate(snapshot)) return snapshot;
    await wait(100);
  }
  throw Error('snapshot predicate timed out');
}
async function about(page) {
  await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  await require('./settings-host-helper.cjs').settingsPage(page);
  await page.getByTestId('settings-nav:about').click();
}
(async () => {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    path.join(profile, 'AppDock.at365.exe'),
    [
      `--test-profile=${profile}`,
      `--test-local-state=${path.join(profile, 'local')}`,
      `--remote-debugging-port=${port}`,
    ],
    { cwd: profile, env, windowsHide: true, stdio: 'ignore' },
  );
  let connected;
  try {
    connected = await connect(port);
    const page = connected.page;
    const s = await waitSnapshot(
      page,
      (s) =>
        s.startupReady &&
        bundle.applets.every((a) => {
          const e = s.extensions.find((e) => e.id === a.id);
          return e && (e.state === 'running' || e.error);
        }),
    );
    assert.equal(s.version, bundle.hostVersion);
    const bindings = require('../out/main/shared/keybindings.js').getKeybindings(s.settings.value);
    assert.ok(
      bindings.every((row) => row.key.split('+').every((key) => !reservedKey.test(key))),
      'Reserved test keys must not be registered',
    );
    const external = s.extensions.filter((e) => e.sourceKind !== 'builtin');
    const builtin = s.extensions.filter((e) => e.sourceKind === 'builtin');
    assert.deepEqual(
      builtin.map((e) => e.id),
      ['appdock.default-shell'],
    );
    assert.equal(builtin[0].state, 'running');
    assert.ok(!builtin[0].error, builtin[0].error);
    assert.deepEqual(external.map((e) => e.id).sort(), bundle.applets.map((a) => a.id).sort());
    for (const a of bundle.applets) {
      const e = s.extensions.find((e) => e.id === a.id);
      assert.equal(e.version, a.version);
      assert.equal(e.enabled, true);
      assert.equal(e.state, 'running');
      assert.ok(!e.error, e.error);
    }
    await about(page);
    await page.screenshot({ path: path.join(profile, 'starter-applets.png') });
    const saved = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')));
    const defaults = require('../out/main/shared/settings-schema.js').createDefaultSettings();
    assert.equal(
      saved.updates?.hostSource ?? defaults.updates.hostSource,
      'github:yukichi-7sai/AppDock.at365',
    );
    const report = {
      ok: true,
      profile,
      archiveSha256,
      bundle,
      version: s.version,
      applets: external.map((e) => ({ id: e.id, version: e.version, enabled: e.enabled })),
      builtin: builtin.map((e) => ({ id: e.id, version: e.version, state: e.state })),
      settingsSavedBesideExe: true,
      suppressedDefaultKeybindings: initial.keybindingDefaultsInitialized,
    };
    await page.evaluate(() => {
      void window.dock.executeCommand('appdock.quit');
    });
    await new Promise((resolve, reject) => {
      if (child.exitCode !== null) return resolve();
      const timer = setTimeout(() => reject(Error('Exit timed out')), 15000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    fs.writeFileSync(
      process.argv[2] || path.join(profile, 'result.json'),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify({ ok: true, profile, version, applets: report.applets }, null, 2));
  } finally {
    await connected?.page
      .evaluate(() => void window.dock.executeCommand('appdock.quit'))
      .catch(() => {});
    try {
      await connected?.browser.close();
    } catch {}
    if (child.exitCode === null) child.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
