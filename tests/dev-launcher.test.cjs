const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('local launcher preserves success, policy failure and native crash status without retrying', (t) => {
  const root = path.resolve(__dirname, '..');
  const folder = fs.mkdtempSync(path.join(root, '.artifacts/dev-launcher-'));
  fs.mkdirSync(path.join(folder, '.tools'));
  fs.copyFileSync(path.join(root, 'dev.bat'), path.join(folder, 'dev.bat'));
  fs.writeFileSync(
    path.join(folder, '.tools/environment.bat'),
    '@echo off\r\nset "APPDOCK_NODE_DIR=%~dp0"\r\nset "APPDOCK_PNPM_DIR=%~dp0"\r\n',
  );
  const placeholder = path.join(folder, '.tools/node.exe');
  fs.writeFileSync(placeholder, 'existence-check-only');
  t.after(() => fs.unlinkSync(placeholder));
  const checks = [];
  for (const code of [0, 1, -1073741571]) {
    fs.writeFileSync(
      path.join(folder, '.tools/pnpm.cmd'),
      `@echo off\r\necho called\r\nexit /b ${code}\r\n`,
    );
    const result = spawnSync('cmd.exe', ['/d', '/c', 'dev.bat install --frozen-lockfile'], {
      cwd: folder,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.error) throw result.error;
    assert.equal(result.status >>> 0, code >>> 0);
    assert.equal(result.stdout.match(/called/g)?.length, 1);
    assert.equal(result.stderr.includes('execution approval'), code === -1073741571);
    checks.push({ code, status: result.status });
  }
  fs.writeFileSync(path.join(folder, 'result.json'), JSON.stringify({ ok: true, checks }));
});

test('publish synchronizes fixed dependencies and preserves failures from either step', () => {
  const root = path.resolve(__dirname, '..');
  const folder = fs.mkdtempSync(path.join(root, '.artifacts/publish launcher-'));
  fs.copyFileSync(path.join(root, 'publish.bat'), path.join(folder, 'publish.bat'));
  const checks = [];
  for (const [installCode, distCode] of [
    [0, 0],
    [7, 0],
    [-1073741571, 0],
    [0, 19],
    [0, -1073741571],
  ]) {
    fs.writeFileSync(path.join(folder, 'calls.txt'), '');
    fs.writeFileSync(
      path.join(folder, 'dev.bat'),
      '@echo off\r\n' +
        'echo %*>>"%~dp0calls.txt"\r\n' +
        `if "%~1"=="install" exit /b ${installCode}\r\n` +
        `if "%~1"=="run" exit /b ${distCode}\r\n` +
        'exit /b 87\r\n',
    );
    const result = spawnSync(
      'cmd.exe',
      ['/d', '/c', `call "${path.join(folder, 'publish.bat')}"`],
      {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
        windowsVerbatimArguments: true,
        timeout: 30000,
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status >>> 0, (installCode || distCode) >>> 0);
    const calls = fs.readFileSync(path.join(folder, 'calls.txt'), 'utf8').trim().split(/\r?\n/);
    assert.deepEqual(
      calls,
      installCode === 0 ? ['install --frozen-lockfile', 'run dist'] : ['install --frozen-lockfile'],
    );
    checks.push({ installCode, distCode, status: result.status, calls });
  }
  fs.writeFileSync(path.join(folder, 'result.json'), JSON.stringify({ ok: true, checks }));
});
