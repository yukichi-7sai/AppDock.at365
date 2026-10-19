const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const typescriptPackage = require.resolve('typescript/package.json');
const typescript = require(typescriptPackage);
run(process.execPath, [
  path.resolve(path.dirname(typescriptPackage), typescript.bin.tsc),
  '-p',
  'tsconfig.extensions.json',
]);
run('dotnet', [
  'build',
  'tests/fixtures/dotnet/AppDock.Extensions.Demo/AppDock.Extensions.Demo.csproj',
  '-c',
  'Release',
]);
run('dotnet', [
  'build',
  'tests/fixtures/dotnet/AppDock.Notifications/AppDock.Notifications.csproj',
  '-c',
  'Release',
]);
for (const name of ['AppDock.ShellProbe', 'AppDock.ShellProbe.Native', 'AppDock.RibbonBadge', 'AppDock.PageProbe', 'AppDock.PageProbe.Native'])
  run('dotnet', [
    'build',
    'tests/fixtures/dotnet/' + name + '/' + name + '.csproj',
    '-c',
    'Release',
  ]);
for (const name of ['welcome', 'dotnet-demo']) {
  const folder = path.join(root, '.artifacts/test-extensions', name);
  fs.mkdirSync(folder, { recursive: true });
  fs.copyFileSync(
    path.join(root, 'tests/fixtures/extensions', name, 'extension.json'),
    path.join(folder, 'extension.json'),
  );
}
fs.copyFileSync(
  path.join(root, '.artifacts/node-extensions/tests/fixtures/extensions/welcome/index.js'),
  path.join(root, '.artifacts/test-extensions/welcome/index.js'),
);
fs.copyFileSync(
  path.join(
    root,
    'tests/fixtures/dotnet/AppDock.Extensions.Demo/bin/Release/net10.0/AppDock.Extensions.Demo.dll',
  ),
  path.join(root, '.artifacts/test-extensions/dotnet-demo/AppDock.Extensions.Demo.dll'),
);
