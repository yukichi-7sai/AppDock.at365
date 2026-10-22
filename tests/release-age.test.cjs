const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const toolchain = require('../toolchain.json');
const pnpm = path.join(root, '.tools', 'pnpm', toolchain.pnpm, 'node_modules', 'pnpm', 'pnpm.exe');

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      env: { ...process.env, CI: 'true' },
    });
    let output = '';
    child.stdout.on('data', (data) => (output += data));
    child.stderr.on('data', (data) => (output += data));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

test('toolchain release boundaries, LTS and exact exceptions', async () => {
  const result = await run(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__dirname, 'toolchain-policy.tests.ps1'),
    ],
    root,
  );
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /checks passed/);
});

test('package update selects latest stable runtimes and stops safely on failure', async () => {
  const invalid = await run(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(root, 'scripts/update-packages.ps1'),
      '-CheckOnly',
      '-UnknownUpdateOption',
    ],
    root,
  );
  assert.notEqual(invalid.code, 0, invalid.output);
  const result = await run(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__dirname, 'package-update.tests.ps1'),
    ],
    root,
  );
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /checks passed/);
});

test('real pnpm enforces age for direct, transitive and frozen dependencies', async () => {
  const folder = fs.mkdtempSync(path.join(root, '.artifacts', 'release-age-'));
  const old = new Date(Date.now() - 30 * 86400000).toISOString();
  const recent = new Date(Date.now() - 60000).toISOString();
  let registry;
  const packages = {};
  function manifest(name, version, dependencies) {
    return {
      name,
      version,
      ...(dependencies ? { dependencies } : {}),
      dist: {
        tarball: `${registry}/${name}/-/${name}-${version}.tgz`,
        integrity: 'sha512-' + Buffer.alloc(64).toString('base64'),
      },
    };
  }
  const server = http.createServer((request, response) => {
    const name = decodeURIComponent(request.url.split('?')[0].slice(1));
    if (!packages[name]) {
      response.writeHead(404);
      response.end('{}');
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(packages[name]));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  registry = `http://127.0.0.1:${server.address().port}`;
  packages['age-direct'] = {
    name: 'age-direct',
    'dist-tags': { latest: '2.0.0' },
    time: { '1.0.0': old, '2.0.0': recent },
    versions: {
      '1.0.0': manifest('age-direct', '1.0.0'),
      '2.0.0': manifest('age-direct', '2.0.0'),
    },
  };
  packages['age-parent'] = {
    name: 'age-parent',
    'dist-tags': { latest: '1.0.0' },
    time: { '1.0.0': old },
    versions: { '1.0.0': manifest('age-parent', '1.0.0', { 'age-direct': '2.0.0' }) },
  };
  packages['age-undated'] = {
    name: 'age-undated',
    'dist-tags': { latest: '1.0.0' },
    versions: { '1.0.0': manifest('age-undated', '1.0.0') },
  };
  packages.electron = {
    name: 'electron',
    'dist-tags': { latest: '45.0.0', beta: '46.0.0-beta.1' },
    time: { '44.9.3': old, '45.0.0': recent, '46.0.0-beta.1': recent },
    versions: {
      '44.9.3': manifest('electron', '44.9.3'),
      '45.0.0': manifest('electron', '45.0.0'),
      '46.0.0-beta.1': manifest('electron', '46.0.0-beta.1'),
    },
  };
  const policy = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
  function fixture(name, dependencies, extra = '') {
    const cwd = path.join(folder, name);
    fs.mkdirSync(cwd);
    fs.writeFileSync(
      path.join(cwd, 'package.json'),
      JSON.stringify({ name: 'release-age-fixture', private: true, dependencies }),
    );
    fs.writeFileSync(
      path.join(cwd, 'pnpm-workspace.yaml'),
      policy + `\nregistry: ${registry}\n` + extra,
    );
    return cwd;
  }
  async function install(cwd, extra = []) {
    return run(
      pnpm,
      ['install', '--lockfile-only', '--ignore-scripts', '--reporter=append-only', ...extra],
      cwd,
    );
  }
  try {
    const safe = fixture('select-old', { 'age-direct': '*' });
    const selected = await install(safe);
    assert.equal(selected.code, 0, selected.output);
    assert.match(fs.readFileSync(path.join(safe, 'pnpm-lock.yaml'), 'utf8'), /version: 1\.0\.0/);
    const direct = await install(fixture('reject-direct', { 'age-direct': '2.0.0' }));
    assert.notEqual(direct.code, 0, direct.output);
    assert.match(direct.output, /RELEASE_AGE|release age|minimumReleaseAge/i);
    const transitive = await install(fixture('reject-transitive', { 'age-parent': '1.0.0' }));
    assert.notEqual(transitive.code, 0, transitive.output);
    assert.match(transitive.output, /RELEASE_AGE|release age|minimumReleaseAge/i);
    const missing = await install(fixture('reject-undated', { 'age-undated': '1.0.0' }));
    assert.notEqual(missing.code, 0, missing.output);
    assert.match(missing.output, /MISSING_TIME|publication|publish.*time/i);
    const frozen = fixture('reject-frozen', { 'age-direct': '2.0.0' });
    const policyPath = path.join(frozen, 'pnpm-workspace.yaml');
    const strictPolicy = fs.readFileSync(policyPath, 'utf8');
    fs.writeFileSync(
      policyPath,
      strictPolicy.replace('minimumReleaseAge: 10080', 'minimumReleaseAge: 0'),
    );
    const poison = await install(frozen);
    assert.equal(poison.code, 0, poison.output);
    fs.writeFileSync(policyPath, strictPolicy);
    const restore = await install(frozen, ['--frozen-lockfile']);
    assert.notEqual(restore.code, 0, restore.output);
    assert.match(restore.output, /RELEASE_AGE|release age|minimumReleaseAge/i);
    const runtime = fixture('electron-latest', { electron: '44.9.3' });
    const initialRuntime = await install(runtime);
    assert.equal(initialRuntime.code, 0, initialRuntime.output);
    const updatedRuntime = await run(
      pnpm,
      ['update', '--latest', '--lockfile-only', '--ignore-scripts', '--reporter=append-only'],
      runtime,
    );
    assert.equal(updatedRuntime.code, 0, updatedRuntime.output);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(runtime, 'package.json'), 'utf8')).dependencies.electron,
      '45.0.0',
    );
    assert.match(
      fs.readFileSync(path.join(runtime, 'pnpm-lock.yaml'), 'utf8'),
      /version: 45\.0\.0/,
    );
    assert.match(
      fs.readFileSync(path.join(runtime, 'pnpm-workspace.yaml'), 'utf8'),
      /- 'electron'/,
    );
    fs.writeFileSync(
      path.join(folder, 'result.json'),
      JSON.stringify({ checks: 6, passed: true }, null, 2),
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
