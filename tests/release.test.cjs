const { getPublishDirectory } = require('../scripts/publish-paths.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRelease, CHECKS, asset, read, save } = require('../scripts/release.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'AppDock-release-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, '30.PROJECT/AppDock.at365');
  const applet = path.join(directory, '30.PROJECT/Applet.Fixture');
  for (const repo of [root, applet]) {
    fs.mkdirSync(repo, { recursive: true });
    fs.mkdirSync(getPublishDirectory(repo), { recursive: true });
  }
  fs.mkdirSync(path.join(applet, '.git'));
  save(path.join(root, 'scripts/starter-applets.json'), {
    schemaVersion: 1,
    applets: [{ repository: 'Applet.Fixture', id: 'fixture' }],
  });
  fs.writeFileSync(path.join(applet, 'publish.bat'), '@echo off\r\n');
  save(path.join(root, 'package.json'), { version: '1.2.3' });
  save(path.join(applet, 'extension.json'), { id: 'fixture', version: '1.0.0' });
  fs.writeFileSync(path.join(getPublishDirectory(applet), 'update.zip'), 'applet fixture');
  const notes = path.join(root, 'notes.md');
  fs.writeFileSync(notes, 'Reviewed release notes\n');
  const planPath = path.join(root, '.artifacts/plan.json');
  const commit = 'a'.repeat(40);
  const state = {
    calls: [],
    release: null,
    dirty: false,
    commit,
    remoteCommit: commit,
    corruptUpload: false,
    uploadFailure: false,
    tag: '',
    olderReleases: [],
  };
  const run = (exe, args) => {
    state.calls.push([exe, ...args]);
    if (exe === 'git') {
      const command = args.slice(4);
      if (command[0] === 'status') return state.dirty ? ' M file' : '';
      if (command[0] === 'rev-parse') return state.commit;
      if (command[0] === 'remote') return 'https://github.com/yukichi-7sai/AppDock.at365.git';
      if (command[0] === 'ls-remote') return state.tag;
    }
    if (exe === 'gh') {
      if (args[0] === 'api') {
        if (args.at(-1).endsWith('/commits/main'))
          return JSON.stringify({ sha: state.remoteCommit });
        if (args.includes('--slurp'))
          return JSON.stringify([state.release ? [state.release, ...state.olderReleases] : []]);
        if (args.includes('DELETE')) {
          if (state.retentionFailure) throw Error('simulated retention failure');
          const id = Number(args.at(-1).split('/').at(-1));
          assert.ok(state.olderReleases.some((item) => item.id === id));
          state.olderReleases = state.olderReleases.filter((item) => item.id !== id);
          return '';
        }
        if (args[1].endsWith('/releases/latest')) return JSON.stringify(state.release);
        if (args[1].endsWith('/releases/42')) return JSON.stringify(state.release);
        const older = state.olderReleases.find((item) => args[1].endsWith(`/releases/${item.id}`));
        if (older) return JSON.stringify(older);
      }
      if (args[0] === 'release') {
        if (args[1] === 'create') {
          state.release = {
            id: 42,
            tag_name: 'v1.2.3',
            target_commitish: commit,
            name: 'AppDock.at365 v1.2.3',
            body: fs.readFileSync(notes, 'utf8'),
            draft: true,
            prerelease: false,
            published_at: '2026-10-09T00:00:00Z',
            assets: [],
            html_url: 'https://github.com/fixture/release',
          };
        } else if (args[1] === 'upload') {
          if (state.uploadFailure) throw Error('simulated interrupted upload');
          const item = asset(args[3]);
          state.release.assets.push({
            name: item.name,
            size: item.size,
            state: 'uploaded',
            digest: `sha256:${state.corruptUpload ? '0'.repeat(64) : item.sha256}`,
          });
        } else if (args[1] === 'edit') {
          assert.ok(args.includes('--draft=false'));
          state.release.draft = false;
        } else throw Error(`Unexpected mutation: ${args}`);
        return '';
      }
    }
    throw Error(`Unexpected command: ${exe} ${args}`);
  };
  const release = createRelease(root, run);
  release.preflight(planPath, notes);
  const exe = path.join(getPublishDirectory(root), 'update.zip');
  const archive = path.join(getPublishDirectory(root), 'AppDock.at365-starter-1.2.3.zip');
  fs.writeFileSync(exe, 'host fixture');
  fs.writeFileSync(archive, 'archive fixture');
  const host = asset(exe);
  save(path.join(getPublishDirectory(root), 'update.json'), {
    schemaVersion: 1,
    kind: 'host',
    id: 'host',
    version: '1.2.3',
    payload: { file: host.name, size: host.size, sha256: host.sha256, format: 'zip' },
  });
  save(path.join(root, '.artifacts/checks.json'), CHECKS);
  for (const name of CHECKS) fs.writeFileSync(path.join(root, `.artifacts/${name}.log`), 'passed');
  save(path.join(root, '.artifacts/bundle-ui.json'), {
    ok: true,
    version: '1.2.3',
    archiveSha256: asset(archive).sha256,
    bundle: {
      hostVersion: '1.2.3',
      hostPayloadSha256: host.sha256,
      hostCommit: commit,
      hostDirty: false,
      applets: [
        {
          repository: 'Applet.Fixture',
          commit,
          id: 'fixture',
          version: '1.0.0',
          dirty: false,
          updateZipSha256: asset(path.join(getPublishDirectory(applet), 'update.zip')).sha256,
        },
      ],
      files: [{ path: 'AppDock.at365.exe', size: host.size, sha256: host.sha256 }],
    },
  });
  return { root, state, release, planPath, archive };
}
const mutations = (state) =>
  state.calls.filter((call) => call[0] === 'gh' && call[1] === 'release');

test('starter distribution selects the requested six repositories', () => {
  const { readStarterDefinition } = require('../scripts/starter-applets.cjs');
  assert.deepEqual(
    readStarterDefinition(path.resolve(__dirname, '..')).map((item) => item.repository),
    [
      'Applet.WebApplet.at365',
      'Applet.WebBrowserTools.at365',
      'Applet.WindowsTools.at365',
      'Applet.Watch.at365',
      'Applet.WallpaperSlideshow.at365',
      'Applet.Profile.at365',
    ],
  );
});

test('release ignores unlisted siblings and refuses missing or substituted starter inputs', (t) => {
  const { root, release, state, planPath } = fixture(t);
  const extra = path.join(path.dirname(root), 'Applet.Unlisted');
  fs.mkdirSync(path.join(extra, '.git'), { recursive: true });
  fs.writeFileSync(path.join(extra, 'extension.json'), 'invalid JSON');
  assert.deepEqual(release.sources(), read(planPath).source);
  assert.equal(
    state.calls.some((call) => call.includes(extra)),
    false,
  );
  const definitionFile = path.join(root, 'scripts/starter-applets.json');
  const definition = read(definitionFile);
  save(definitionFile, {
    schemaVersion: 1,
    applets: [...definition.applets, { repository: 'Applet.Missing', id: 'missing' }],
  });
  assert.throws(() => release.sources(), /Missing starter repository/);
  save(definitionFile, definition);
  const manifest = path.join(path.dirname(root), 'Applet.Fixture/extension.json');
  save(manifest, { id: 'substituted', version: '1.0.0' });
  assert.throws(() => release.sources(), /Starter Applet ID mismatch/);
  assert.equal(mutations(state).length, 0);
});

test('release stages every verified asset before the single publication operation', async (t) => {
  const { state, release, planPath } = fixture(t);
  release.seal(planPath);
  await release.remote('draft', planPath, 'gh');
  assert.equal(state.release.draft, true);
  assert.equal(state.release.assets.length, 3);
  const beforeResume = mutations(state).length;
  await release.remote('draft', planPath, 'gh');
  assert.equal(mutations(state).length, beforeResume, 'Resume must not overwrite assets');
  await release.remote('publish', planPath, 'gh');
  assert.deepEqual(
    mutations(state).map((call) => call[2]),
    ['create', 'upload', 'upload', 'upload', 'edit'],
  );
  assert.equal(read(planPath).phase, 'published');
  await assert.rejects(release.remote('draft', planPath, 'gh'), /Published releases/);
});

test('failed or incomplete preparation cannot make any GitHub mutation', async (t) => {
  const { root, state, release, planPath } = fixture(t);
  save(path.join(root, '.artifacts/checks.json'), CHECKS.slice(0, 2));
  assert.throws(() => release.seal(planPath), /All checks/);
  await assert.rejects(release.remote('draft', planPath, 'gh'), /Prepare must complete/);
  assert.equal(mutations(state).length, 0);
});

test('changed assets, sources and remote main stop before creating a draft', async (t) => {
  const { state, release, planPath, archive } = fixture(t);
  release.seal(planPath);
  state.remoteCommit = 'b'.repeat(40);
  await assert.rejects(release.remote('draft', planPath, 'gh'), /Push the reviewed/);
  state.remoteCommit = state.commit;
  state.dirty = true;
  await assert.rejects(release.remote('draft', planPath, 'gh'), /outstanding changes/);
  state.dirty = false;
  state.commit = 'c'.repeat(40);
  await assert.rejects(release.remote('draft', planPath, 'gh'), /Sources changed/);
  state.commit = 'a'.repeat(40);
  fs.appendFileSync(archive, 'changed');
  await assert.rejects(release.remote('draft', planPath, 'gh'), /Prepared file changed/);
  assert.equal(mutations(state).length, 0);
});

test('interrupted uploads remain draft and resume without replacing completed assets', async (t) => {
  const { state, release, planPath } = fixture(t);
  release.seal(planPath);
  state.uploadFailure = true;
  await assert.rejects(release.remote('draft', planPath, 'gh'), /interrupted upload/);
  assert.equal(state.release.draft, true);
  await assert.rejects(release.remote('publish', planPath, 'gh'), /Draft verification/);
  state.uploadFailure = false;
  await release.remote('draft', planPath, 'gh');
  assert.equal(state.release.assets.length, 3);
  assert.equal(mutations(state).filter((call) => call[2] === 'edit').length, 0);
});

test('bad remote digest or a missing asset prevents publication', async (t) => {
  const { state, release, planPath } = fixture(t);
  release.seal(planPath);
  state.corruptUpload = true;
  await assert.rejects(release.remote('draft', planPath, 'gh'), /Remote digest mismatch/);
  assert.equal(state.release.draft, true);
  state.corruptUpload = false;
  state.release.assets = [];
  await release.remote('draft', planPath, 'gh');
  state.release.assets.pop();
  await assert.rejects(release.remote('publish', planPath, 'gh'), /Missing assets/);
  assert.equal(state.release.draft, true);
  assert.equal(mutations(state).filter((call) => call[2] === 'edit').length, 0);
});

test('version update increases stable version and leaves other package data unchanged', (t) => {
  const { root, release } = fixture(t);
  release.setVersion('1.3.0');
  assert.deepEqual(read(path.join(root, 'package.json')), { version: '1.3.0' });
  assert.throws(() => release.setVersion('1.2.9'), /must increase/);
  assert.throws(() => release.setVersion('2.0.0-beta.1'), /stable/);
});

test('successful release preparation removes only older stable bundles in publish', (t) => {
  const { root, release, planPath, archive } = fixture(t);
  const publish = path.join(getPublishDirectory(root));
  const old = [
    'AppDock.at365-starter-0.26.2.zip',
    'AppDock.at365-starter-1.2.2.zip',
    'AppDock.at365-all-in-one-1.2.2.zip',
  ];
  const keep = [
    'AppDock.at365-all-in-one-1.2.3.zip',
    'AppDock.at365-all-in-one-2.0.0.zip',
    'AppDock.at365-starter-1.10.0.zip',
    'AppDock.at365-starter-2.0.0.zip',
    'AppDock.at365-starter-1.0.0-beta.1.zip',
    'AppDock.at365-starter-01.0.0.zip',
    'other-1.0.0.zip',
  ];
  for (const name of [...old, ...keep]) fs.writeFileSync(path.join(publish, name), name);
  const nested = path.join(publish, 'nested/AppDock.at365-starter-1.0.0.zip');
  fs.mkdirSync(path.dirname(nested));
  fs.writeFileSync(nested, 'nested');
  const directory = path.join(publish, 'AppDock.at365-starter-0.0.1.zip');
  fs.mkdirSync(directory);
  const backup = path.join(root, '.artifacts/previous-starter.zip');
  fs.writeFileSync(backup, 'backup');
  const current = asset(archive);
  const hostPackage = asset(path.join(publish, 'update.zip'));
  release.seal(planPath);
  assert.deepEqual(read(planPath).removedOldBundles.sort(), old.sort());
  for (const name of old) assert.equal(fs.existsSync(path.join(publish, name)), false);
  for (const name of keep) assert.equal(fs.readFileSync(path.join(publish, name), 'utf8'), name);
  assert.deepEqual(asset(archive), current);
  assert.deepEqual(asset(path.join(publish, 'update.zip')), hostPackage);
  assert.equal(fs.readFileSync(nested, 'utf8'), 'nested');
  assert.equal(fs.statSync(directory).isDirectory(), true);
  assert.equal(fs.readFileSync(backup, 'utf8'), 'backup');
});

test('failed preparation or changed bundle preserves older packages', (t) => {
  const { root, release, planPath, archive } = fixture(t);
  const old = path.join(getPublishDirectory(root), 'AppDock.at365-starter-1.2.2.zip');
  fs.writeFileSync(old, 'last complete package');
  const checks = path.join(root, '.artifacts/checks.json');
  save(
    checks,
    CHECKS.filter((name) => name !== 'pack-starter'),
  );
  assert.throws(() => release.seal(planPath), /All checks/);
  assert.equal(fs.readFileSync(old, 'utf8'), 'last complete package');
  save(checks, CHECKS);
  fs.appendFileSync(archive, 'changed after verification');
  assert.throws(() => release.seal(planPath), /Bundle changed/);
  assert.equal(fs.readFileSync(old, 'utf8'), 'last complete package');
  assert.equal(read(planPath).phase, 'preparing');
});

test('release cleanup refuses a redirected publish directory', (t) => {
  const { root, release, planPath } = fixture(t);
  const publish = path.join(getPublishDirectory(root));
  const redirected = path.join(root, 'redirected');
  const oldName = 'AppDock.at365-starter-1.2.2.zip';
  fs.writeFileSync(path.join(publish, oldName), 'keep');
  fs.renameSync(publish, redirected);
  fs.symlinkSync(redirected, publish, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => release.seal(planPath), /Publish cannot be a link/);
  assert.equal(fs.readFileSync(path.join(redirected, oldName), 'utf8'), 'keep');
  assert.equal(read(planPath).phase, 'preparing');
});

test('remote retention starts only after public downloads and application update verification', async (t) => {
  const { root, state, release, planPath } = fixture(t);
  state.olderReleases = [1, 2, 3, 4].map((id) => ({
    id,
    tag_name: `v0.${id}.0`,
    draft: false,
    prerelease: false,
    published_at: `2026-10-0${id}T00:00:00Z`,
    assets: [],
  }));
  release.seal(planPath);
  await release.remote('draft', planPath, 'gh');
  await release.remote('publish', planPath, 'gh');
  state.tag = `${state.commit}\trefs/tags/v1.2.3`;
  const deletes = () => state.calls.filter((args) => args.includes('DELETE'));
  assert.equal(deletes().length, 0);
  let badDownload = true;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/latest')) return Response.json({ id: 42 });
    const file = path.join(getPublishDirectory(root), url.split('/').at(-1));
    return new Response(badDownload ? 'corrupt' : fs.readFileSync(file));
  });
  await assert.rejects(release.remote('verify', planPath, 'gh'));
  assert.equal(deletes().length, 0);
  const updaterPath = path.join(root, 'out/main/main/core/portable-updates.js');
  const settingsPath = path.join(root, 'out/main/shared/settings-schema.js');
  fs.mkdirSync(path.dirname(updaterPath), { recursive: true });
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(
    updaterPath,
    `exports.PortableUpdates = class { async check() { return { results: [{ status: 'available', latestVersion: '1.2.3', installable: true }] }; } };`,
  );
  fs.writeFileSync(settingsPath, 'exports.createDefaultSettings = () => ({ updates: {} });');
  badDownload = false;
  state.retentionFailure = true;
  await assert.rejects(release.remote('verify', planPath, 'gh'), /simulated retention failure/);
  assert.equal(
    read(planPath).phase,
    'verified',
    'Cleanup failure must not undo successful verification',
  );
  assert.equal(read(read(planPath).retentionReport).phase, 'failed');
  assert.equal(state.olderReleases.length, 4);
  state.retentionFailure = false;
  await release.remote('verify', planPath, 'gh');
  assert.equal(read(planPath).phase, 'verified');
  assert.deepEqual(
    state.olderReleases.map((item) => item.id),
    [3, 4],
  );
  assert.equal(deletes().length, 3, 'One failed cleanup attempt, then two successful deletions');
  assert.equal(read(read(planPath).retentionReport).phase, 'complete');
});
