const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.artifacts', 'dotnet-host');
const hosts = [
  ['AppDock.ExtensionHost', ''],
  ['AppDock.InputHost', 'input'],
  ['AppDock.ProcessHost', 'process'],
  ['AppDock.FileWatchHost', 'file-watch'],
];
const processOnly = process.argv.includes('--process-only');
// A partial test build must also remove files from an earlier self-contained publish.
const clean = processOnly ? path.join(output, 'process') : output;
let existing = clean;
while (!fs.lstatSync(existing, { throwIfNoEntry: false })) existing = path.dirname(existing);
if (
  path.relative(fs.realpathSync(root), fs.realpathSync(existing)).toLowerCase() !==
  path.relative(root, existing).toLowerCase()
)
  throw new Error('Unexpected .NET publish directory: ' + clean);
fs.rmSync(clean, { recursive: true, force: true });
for (const [name, directory] of hosts) {
  if (processOnly && directory !== 'process') continue;
  const result = spawnSync(
    'dotnet',
    [
      'publish',
      `dotnet/${name}/${name}.csproj`,
      '-c',
      'Release',
      '-r',
      'win-x64',
      '--self-contained',
      'false',
      '-o',
      path.join(output, directory),
    ],
    { cwd: root, stdio: 'inherit', windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
