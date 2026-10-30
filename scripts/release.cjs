const { getPublishDirectory } = require('./publish-paths.cjs');
// Release orchestration only. Builds and GUI checks stay in release.ps1.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { pruneReleases } = require('./release-retention.cjs');
const { starterSources } = require('./starter-applets.cjs');
const CHECKS = [
  'typecheck',
  'regression',
  'publish',
  'pack-starter',
  'portable-updates',
  'update-progress',
  'update-recovery',
  'starter',
];
const REPOSITORY = 'yukichi-7sai/AppDock.at365';
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const save = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(temporary, file);
};
const asset = (file) => ({
  path: file,
  name: path.basename(file),
  size: fs.statSync(file).size,
  sha256: hash(file),
});
const stable = (version) => {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Use a stable x.y.z version');
  return version.split('.').map(Number);
};
function createRelease(
  root,
  run = (exe, args) =>
    execFileSync(exe, args, {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }),
) {
  const git = (repo, ...args) =>
    run('git', ['-c', `safe.directory=${repo.replaceAll('\\', '/')}`, '-C', repo, ...args]).trim();
  const snapshot = (repo) => {
    assert.equal(
      git(repo, 'status', '--porcelain', '--untracked-files=normal'),
      '',
      `Commit or preserve outstanding changes before preparing: ${repo}`,
    );
    return { repository: path.basename(repo), commit: git(repo, 'rev-parse', 'HEAD') };
  };
  const sources = () => {
    const host = snapshot(root);
    const applets = starterSources(root)
      .map(({ directory, id, version }) => ({ ...snapshot(directory), id, version }))
      .sort((a, b) => a.repository.localeCompare(b.repository));
    assert.ok(applets.length, 'No local Applet repositories');
    assert.equal(
      new Set(applets.map((a) => a.id.toLowerCase())).size,
      applets.length,
      'Duplicate Applet ID',
    );
    return { host, applets };
  };
  const version = () => read(path.join(root, 'package.json')).version;
  function preflight(planPath, notesFile) {
    assert.ok(!fs.existsSync(planPath), 'Use a new plan path');
    stable(version());
    assert.ok(fs.readFileSync(notesFile, 'utf8').trim(), 'Release notes cannot be empty');
    const source = sources();
    save(planPath, {
      schemaVersion: 1,
      phase: 'preparing',
      root,
      repo: REPOSITORY,
      version: version(),
      tag: `v${version()}`,
      title: `AppDock.at365 v${version()}`,
      source,
      notes: asset(notesFile),
      createdAt: new Date().toISOString(),
    });
  }
  function local(plan, sealed = true) {
    assert.equal(plan.schemaVersion, 1);
    assert.equal(plan.root, root);
    assert.equal(plan.repo, REPOSITORY);
    assert.equal(plan.version, version());
    assert.equal(plan.tag, `v${version()}`);
    assert.deepEqual(sources(), plan.source, 'Sources changed after preparation');
    assert.deepEqual(asset(plan.notes.path), plan.notes, 'Release notes changed');
    if (sealed) {
      assert.ok(
        ['prepared', 'draft', 'published', 'verified'].includes(plan.phase),
        'Prepare must complete first',
      );
      for (const expected of [...plan.assets, ...plan.evidence])
        assert.deepEqual(asset(expected.path), expected, `Prepared file changed: ${expected.name}`);
      assert.deepEqual(
        plan.assets.map((a) => a.name),
        ['update.zip', 'update.json', `AppDock.at365-starter-${version()}.zip`],
      );
    }
  }
  function seal(planPath) {
    const plan = read(planPath),
      directory = path.dirname(planPath);
    assert.equal(plan.phase, 'preparing');
    local(plan, false);
    assert.deepEqual(read(path.join(directory, 'checks.json')), CHECKS, 'All checks must pass');
    const report = read(path.join(directory, 'bundle-ui.json'));
    assert.equal(report.ok, true);
    assert.equal(report.version, plan.version);
    const bundle = report.bundle;
    assert.equal(bundle.hostVersion, plan.version);
    assert.equal(bundle.hostCommit, plan.source.host.commit);
    assert.equal(bundle.hostDirty, false, 'Bundle contains uncommitted host changes');
    assert.deepEqual(
      bundle.applets
        .map(({ repository, commit, id, version }) => ({ repository, commit, id, version }))
        .sort((a, b) => a.repository.localeCompare(b.repository)),
      plan.source.applets,
      'Bundle roster or commits differ',
    );
    for (const item of bundle.applets) {
      assert.equal(item.dirty, false, `Uncommitted Applet: ${item.repository}`);
      assert.equal(
        hash(
          path.join(
            getPublishDirectory(path.join(path.dirname(root), item.repository)),
            'update.zip',
          ),
        ),
        item.updateZipSha256,
      );
    }
    plan.assets = ['update.zip', 'update.json', `AppDock.at365-starter-${version()}.zip`].map(
      (name) => asset(path.join(getPublishDirectory(root), name)),
    );
    assert.equal(report.archiveSha256, plan.assets[2].sha256, 'Bundle changed after UI check');
    const hostFile = bundle.files.find((file) => file.path === 'AppDock.at365.exe');
    assert.ok(hostFile, 'Bundle must contain the host executable');
    assert.equal(bundle.hostPayloadSha256, plan.assets[0].sha256, 'Bundle host package differs');
    const feed = read(plan.assets[1].path);
    assert.equal(feed.schemaVersion, 1);
    assert.equal(feed.kind, 'host');
    assert.equal(feed.id, 'host');
    assert.equal(feed.version, version());
    assert.deepEqual(feed.payload, {
      file: plan.assets[0].name,
      format: 'zip',
      size: plan.assets[0].size,
      sha256: plan.assets[0].sha256,
    });
    plan.evidence = ['checks.json', 'bundle-ui.json', ...CHECKS.map((name) => `${name}.log`)].map(
      (name) => asset(path.join(directory, name)),
    );
    // Only release preparation retires old bundles, after every check and asset
    // comparison has passed. Ordinary publish never creates or deletes bundles.
    const publish = path.join(getPublishDirectory(root));
    const publishInfo = fs.lstatSync(publish);
    assert.ok(
      publishInfo.isDirectory() && !publishInfo.isSymbolicLink(),
      'Publish cannot be a link',
    );
    const current = stable(plan.version);
    plan.removedOldBundles = [];
    for (const entry of fs.readdirSync(publish, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const match =
        /^AppDock\.at365-(?:starter|all-in-one)-((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\.zip$/.exec(
          entry.name,
        );
      if (!match) continue;
      const candidate = stable(match[1]);
      const differing = candidate.findIndex((part, index) => part !== current[index]);
      if (differing < 0 || candidate[differing] >= current[differing]) continue;
      const file = path.join(publish, entry.name);
      fs.unlinkSync(file);
      plan.removedOldBundles.push(entry.name);
    }
    plan.phase = 'prepared';
    save(planPath, plan);
  }
  function setVersion(next) {
    const requested = stable(next),
      current = stable(version());
    const differing = requested.findIndex((part, index) => part !== current[index]);
    assert.ok(differing >= 0 && requested[differing] > current[differing], 'Version must increase');
    const file = path.join(root, 'package.json');
    const content = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, content.replace(/("version"\s*:\s*")[^"]+(")/, `$1${next}$2`));
    console.log(
      `Version updated to ${next}. Review documentation/notes, test, and commit before Prepare.`,
    );
  }
  async function remote(mode, planPath, gh) {
    const plan = read(planPath);
    local(plan);
    const command = (...args) => run(gh, args);
    const api = (endpoint) => JSON.parse(command('api', endpoint));
    const origin = git(root, 'remote', 'get-url', 'origin');
    assert.ok(
      [
        `https://github.com/${plan.repo}.git`,
        `https://github.com/${plan.repo}`,
        `git@github.com:${plan.repo}.git`,
      ].includes(origin),
      'Unexpected origin',
    );
    assert.equal(
      api(`repos/${plan.repo}/commits/main`).sha,
      plan.source.host.commit,
      'Push the reviewed release commit to main first',
    );
    const tagRef = git(
      root,
      'ls-remote',
      '--tags',
      'origin',
      `refs/tags/${plan.tag}`,
      `refs/tags/${plan.tag}^{}`,
    );
    if (tagRef) {
      const refs = tagRef.split(/\r?\n/);
      const commit = (refs.find((line) => line.endsWith('^{}')) || refs[0]).split(/\s+/)[0];
      assert.equal(commit, plan.source.host.commit, 'Existing tag points to another commit');
    }
    const releases = JSON.parse(
      command('api', '--paginate', '--slurp', `repos/${plan.repo}/releases?per_page=100`),
    ).flat();
    const matches = releases.filter((release) => release.tag_name === plan.tag);
    assert.ok(matches.length <= 1, 'Duplicate release tag');
    let release = matches[0];
    const notes = fs.readFileSync(plan.notes.path, 'utf8').replace(/^\uFEFF/, '');
    const validate = (complete) => {
      assert.ok(release, 'Release does not exist');
      if (plan.releaseId) assert.equal(release.id, plan.releaseId, 'Release identity changed');
      assert.equal(release.target_commitish, plan.source.host.commit);
      assert.equal(release.name, plan.title);
      assert.equal(release.prerelease, false);
      assert.equal(
        (release.body || '').replaceAll('\r\n', '\n').trim(),
        notes.replaceAll('\r\n', '\n').trim(),
        'Release notes differ',
      );
      assert.equal(
        new Set(release.assets.map((a) => a.name)).size,
        release.assets.length,
        'Duplicate asset name',
      );
      for (const actual of release.assets) {
        const expected = plan.assets.find((item) => item.name === actual.name);
        assert.ok(expected, `Unexpected release asset: ${actual.name}`);
        assert.equal(actual.state, 'uploaded');
        assert.equal(actual.size, expected.size);
        assert.equal(
          actual.digest,
          `sha256:${expected.sha256}`,
          `Remote digest mismatch: ${actual.name}`,
        );
      }
      if (complete) assert.equal(release.assets.length, plan.assets.length, 'Missing assets');
    };
    if (mode === 'draft') {
      assert.ok(!release || release.draft, 'Published releases are never overwritten');
      if (!release) {
        // Creating only a draft also makes partial upload/network failures non-public.
        command(
          'release',
          'create',
          plan.tag,
          '--repo',
          plan.repo,
          '--target',
          plan.source.host.commit,
          '--title',
          plan.title,
          '--notes-file',
          plan.notes.path,
          '--draft',
        );
        const created = JSON.parse(
          command('api', '--paginate', '--slurp', `repos/${plan.repo}/releases?per_page=100`),
        )
          .flat()
          .filter((item) => item.tag_name === plan.tag);
        assert.equal(created.length, 1);
        release = created[0];
      }
      validate(false);
      assert.equal(release.draft, true);
      for (const expected of plan.assets) {
        if (!release.assets.some((item) => item.name === expected.name))
          command('release', 'upload', plan.tag, expected.path, '--repo', plan.repo);
      }
      release = api(`repos/${plan.repo}/releases/${release.id}`);
      validate(true);
      assert.equal(release.draft, true);
      plan.releaseId = release.id;
      plan.phase = 'draft';
    } else if (mode === 'publish') {
      assert.equal(plan.phase, 'draft', 'Draft verification must finish first');
      validate(true);
      assert.equal(release.draft, true, 'Already published: inspect state, then use Verify');
      // This is the only operation that exposes a release. Never retry blindly.
      command('release', 'edit', plan.tag, '--repo', plan.repo, '--draft=false', '--latest');
      release = api(`repos/${plan.repo}/releases/${release.id}`);
      validate(true);
      assert.equal(release.draft, false);
      plan.phase = 'published';
    } else if (mode === 'verify') {
      validate(true);
      assert.equal(release.draft, false);
      assert.ok(tagRef, 'Published tag is missing');
      const latestResponse = await fetch(
        `https://api.github.com/repos/${plan.repo}/releases/latest`,
        { signal: AbortSignal.timeout(30000) },
      );
      assert.equal(latestResponse.status, 200);
      assert.equal(
        (await latestResponse.json()).id,
        release.id,
        'Public latest points to another release',
      );
      for (const expected of plan.assets) {
        const url = `https://github.com/${plan.repo}/releases/download/${plan.tag}/${expected.name}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(300000) });
        assert.equal(response.status, 200, `Anonymous download failed: ${expected.name}`);
        const digest = crypto.createHash('sha256');
        let size = 0;
        for await (const chunk of response.body) {
          digest.update(chunk);
          size += chunk.length;
        }
        assert.equal(size, expected.size);
        assert.equal(digest.digest('hex'), expected.sha256);
      }
      const { PortableUpdates } = require(
        path.join(root, 'out/main/main/core/portable-updates.js'),
      );
      const { createDefaultSettings } = require(
        path.join(root, 'out/main/shared/settings-schema.js'),
      );
      const updater = new PortableUpdates({
        targets: () => [
          {
            id: 'host',
            name: 'AppDock',
            kind: 'host',
            version: '0.0.0',
            source: `github:${plan.repo}`,
            destination: path.join(path.dirname(planPath), 'unused'),
          },
        ],
        settings: () => createDefaultSettings().updates,
        hostVersion: plan.version,
        helper: '',
        baseDirectory: path.dirname(planPath),
        executable: '',
        restartArgs: [],
        changed() {},
        shutdown() {
          throw Error('Unexpected install');
        },
        confirm: async () => {
          throw Error('Unexpected install');
        },
        processIds: () => [],
        log() {},
      });
      const state = await updater.check();
      assert.equal(state.results[0]?.status, 'available', JSON.stringify(state.results));
      assert.equal(state.results[0]?.latestVersion, plan.version);
      assert.equal(state.results[0]?.installable, true);
      plan.applicationUpdateCheck = state.results[0];
      plan.phase = 'verified';
      plan.url = release.html_url;
      plan.retentionReport = path.join(
        path.dirname(planPath),
        `retention-${crypto.randomUUID()}.json`,
      );
      // Persist successful publication separately: a cleanup failure must not
      // make callers retry publication or overwrite public assets.
      save(planPath, plan);
      pruneReleases(plan, plan.retentionReport, command);
    } else throw Error(`Unknown remote mode: ${mode}`);
    plan.url = release.html_url;
    save(planPath, plan);
    console.log(`${plan.phase}: ${plan.url}`);
  }
  return { preflight, seal, setVersion, local, sources, remote };
}
module.exports = { createRelease, CHECKS, asset, read, save };
if (require.main === module) {
  const release = createRelease(path.resolve(__dirname, '..'));
  const [mode, first, second] = process.argv.slice(2);
  Promise.resolve()
    .then(() => {
      if (mode === 'version') return release.setVersion(first);
      if (mode === 'preflight') return release.preflight(first, second);
      if (mode === 'seal') return release.seal(first);
      return release.remote(mode, first, second);
    })
    .catch((error) => {
      console.error(error.message);
      console.error(
        'Stopped. If a publish request was sent, inspect GitHub state before retrying. Never replace public assets automatically.',
      );
      process.exitCode = 1;
    });
}
