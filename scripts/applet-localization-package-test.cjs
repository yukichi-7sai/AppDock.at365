// Exercise the production handoff and updater with local feeds, without starting a real host.
// A dedicated renamed helper is required as the transaction's restart executable; remove it
// and staged helpers after their processes exit, retaining the jobs, hashes and results.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const root = path.resolve(__dirname, '..');
const base = fs.mkdtempSync(path.join(root, '.artifacts/applet-localization-package-'));
const helper = path.join(root, '.artifacts/updater/AppDock.Updater.exe');
const executable = path.join(base, 'AppDock.at365.exe');
const source = path.join(base, 'source');
const feed = path.join(base, 'feed');
const destination = path.join(base, 'extensions/fixture.localized');
const dictionaries = path.join(base, 'translations/applets/fixture.localized');
const stages = [],
  children = [],
  jobs = [],
  checks = [];
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
};
const spawn = childProcess.spawn;
childProcess.spawn = (command, args, options) => {
  if (args?.[0] === '--apply') {
    const job = JSON.parse(fs.readFileSync(args[1]));
    jobs.push(structuredClone(job));
    stages.push(path.dirname(args[1]));
    // Only the progress window is disabled: the real ready/commit/apply/restart protocol runs.
    write(args[1], { ...job, showProgress: false });
    const child = spawn(command, args, options);
    children.push(
      new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) =>
          code === 0 ? resolve() : reject(Error('Updater exit ' + code)),
        );
      }),
    );
    return child;
  }
  return spawn(command, args, options);
};
const { PortableUpdates } = require('../out/main/main/core/portable-updates');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
let installedVersion;
const target = () => ({
  kind: 'applet',
  id: 'fixture.localized',
  name: 'Localized',
  version: installedVersion,
  source: 'https://fixture.invalid/',
  destination,
});
const updater = () =>
  new PortableUpdates({
    targets: () => (installedVersion ? [target()] : []),
    settings: () => createDefaultSettings().updates,
    hostVersion: '0.159.0',
    helper,
    executable,
    baseDirectory: base,
    restartArgs: ['--recover', base],
    processIds: () => [],
    changed() {},
    shutdown() {},
    confirm: async () => true,
    log() {},
    fetcher: async (url) =>
      new Response(
        fs.readFileSync(
          path.join(feed, new URL(url).pathname.endsWith('.zip') ? 'update.zip' : 'update.json'),
        ),
      ),
  });
function publish(version) {
  write(path.join(source, 'extension.json'), {
    apiVersion: 1,
    id: 'fixture.localized',
    name: 'Localized',
    version,
    minimumHostVersion: '0.159.0',
    runtime: 'node',
    entry: 'index.cjs',
    localization: { defaultLanguage: 'ja' },
  });
  fs.writeFileSync(path.join(source, 'index.cjs'), 'exports.activate = () => {};');
  for (const [file, title] of [
    ['applet.json', '基本'],
    ['applet_en.json', 'English'],
  ])
    write(path.join(source, 'resources/translations', file), { title: title + ' ' + version });
  const result = childProcess.spawnSync(helper, ['--pack', 'applet', source, version, feed], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
}
async function applied(version) {
  await children.at(-1);
  const result = JSON.parse(fs.readFileSync(path.join(base, 'data/update-result.json')));
  assert.equal(result.ok, true, result.message);
  assert.equal(result.updated.length, 1);
  assert.equal(result.updated[0].id, 'fixture.localized');
  if (version) {
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(destination, 'extension.json'))).version,
      version,
    );
    for (const file of ['applet.json', 'applet_en.json']) {
      assert.equal(
        digest(path.join(dictionaries, file)),
        digest(path.join(source, 'resources/translations', file)),
      );
      assert.equal(
        digest(path.join(destination, 'resources/translations', file)),
        digest(path.join(dictionaries, file)),
      );
    }
    installedVersion = version;
  } else assert.equal(fs.existsSync(destination), false);
  assert.equal(fs.existsSync(path.join(base, 'data/update-transaction.json')), false);
}
(async () => {
  // Production deliberately unrefs the updater before shutdown; retain this test until exit.
  const keepAlive = setInterval(() => {}, 1000);
  const result = { base, helperSha256: digest(helper), success: false, checks, jobs };
  try {
    fs.copyFileSync(helper, executable);
    fs.mkdirSync(path.join(base, 'extensions'));
    publish('1.0.0');
    let service = updater();
    const plan = await service.prepareAppletInstall(feed);
    assert.equal(fs.existsSync(dictionaries), false);
    await service.applyAppletPackage(plan.planId);
    await applied('1.0.0');
    checks.push(
      'Install stages and deploys bundled and external dictionaries through the production handoff',
    );
    write(path.join(dictionaries, 'applet_en.json'), { title: 'User edit', obsolete: 'remove' });
    write(path.join(dictionaries, 'applet_fr.json'), { title: 'Unbundled' });
    publish('2.0.0');
    service = updater();
    await service.install('fixture.localized');
    await applied('2.0.0');
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dictionaries, 'applet_fr.json'))).title,
      'Unbundled',
    );
    checks.push(
      'Single update overwrites shipped dictionaries entirely and preserves unbundled files',
    );
    publish('3.0.0');
    service = updater();
    await service.install('all');
    await applied('3.0.0');
    checks.push('All-update scope uses the same dictionary transaction');
    const retained = fs
      .readdirSync(dictionaries)
      .map((file) => [file, digest(path.join(dictionaries, file))]);
    service = updater();
    const removal = await service.prepareAppletUninstall('fixture.localized');
    await service.applyAppletPackage(removal.planId, 'fixture.localized');
    await applied();
    assert.deepEqual(
      fs.readdirSync(dictionaries).map((file) => [file, digest(path.join(dictionaries, file))]),
      retained,
    );
    assert.equal(jobs.at(-1).items.length, 1);
    checks.push('Uninstall preserves all external dictionaries and removes the Applet');
    result.success = true;
  } catch (error) {
    result.error = String(error.stack || error);
    process.exitCode = 1;
  } finally {
    await Promise.allSettled(children);
    fs.writeFileSync(path.join(base, 'result.json'), JSON.stringify(result, null, 2));
    for (const stage of stages) {
      assert(
        path.dirname(stage) === path.resolve(os.tmpdir()) &&
          path.basename(stage).startsWith('AppDock-update-'),
      );
      fs.rmSync(stage, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
    }
    fs.rmSync(executable, { force: true, maxRetries: 30, retryDelay: 100 });
    console.log(JSON.stringify({ ...result, jobs: jobs.length }, null, 2));
    clearInterval(keepAlive);
  }
})();
