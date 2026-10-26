const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getPublishDirectory } = require('./publish-paths.cjs');
const root = path.resolve(__dirname, '..');
const output = getPublishDirectory(root);
const staged = path.join(root, '.artifacts/host-build/win-unpacked');
const helper = path.join(root, '.artifacts/updater/AppDock.Updater.exe');
function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
// The builder may clean its output. Only the private staging directory is passed
// to it; the runnable publish folder can contain validation/user data.
run(helper, ['--seal-host', staged, require('../package.json').version]);
fs.mkdirSync(path.join(output, 'win-unpacked'), { recursive: true });
run(helper, ['--deploy-host', staged, path.join(output, 'win-unpacked')]);
run(process.execPath, [path.join(__dirname, 'pack-update.cjs'), 'host', staged, output]);
run('powershell.exe', [
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  path.join(__dirname, 'publish-deployment.ps1'),
]);
