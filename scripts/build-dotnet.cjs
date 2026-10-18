const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.artifacts', 'dotnet-host');
function run(args) {
  const result = spawnSync('dotnet', args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
// Remove the previous publish output so bundled runtime files cannot survive the switch.
if (
  fs.existsSync(output) &&
  path.relative(fs.realpathSync(root), fs.realpathSync(output)).toLowerCase() !==
    path.join('.artifacts', 'dotnet-host')
)
  throw new Error('.NET publish output must be inside this project: ' + output);
fs.rmSync(output, { recursive: true, force: true });
run([
  'publish',
  'dotnet/AppDock.ExtensionHost/AppDock.ExtensionHost.csproj',
  '-c',
  'Release',
  '-r',
  'win-x64',
  '--self-contained',
  'false',
  '-o',
  output,
]);
run([
  'publish',
  'dotnet/AppDock.InputHost/AppDock.InputHost.csproj',
  '-c',
  'Release',
  '-r',
  'win-x64',
  '--self-contained',
  'true',
  '-o',
  path.join(output, 'input'),
]);
run([
  'publish',
  'dotnet/AppDock.ProcessHost/AppDock.ProcessHost.csproj',
  '-c',
  'Release',
  '-r',
  'win-x64',
  '--self-contained',
  'true',
  '-o',
  path.join(output, 'process'),
]);
