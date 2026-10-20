const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'out', 'main');
// Rebuild only generated host files, including removal of obsolete modules.
for (const folder of [path.dirname(output), output]) {
  if (
    fs.existsSync(folder) &&
    path.relative(fs.realpathSync(root), fs.realpathSync(folder)).toLowerCase() !==
      path.relative(root, folder).toLowerCase()
  )
    throw new Error('Host build output must be inside this project: ' + folder);
}
fs.rmSync(output, { recursive: true, force: true });
const typescriptPackage = require.resolve('typescript/package.json');
const typescript = require(typescriptPackage);
const result = spawnSync(
  process.execPath,
  [path.resolve(path.dirname(typescriptPackage), typescript.bin.tsc), '-p', 'tsconfig.main.json'],
  { cwd: root, stdio: 'inherit', windowsHide: true },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
// Sandboxed Electron preloads support require('electron'), but no local runtime imports.
// Share one self-contained appearance bridge without duplicating it in eight sources.
const appearance = fs.readFileSync(path.join(output, 'main/appearance-preload.js'), 'utf8');
for (const name of [
  'preload',
  'shell-preload',
  'shell-page-preload',
  'shell-bar-preload',
  'overlay-preload',
  'notification-surface-preload',
  'applet-page-preload',
  'web-account-preload',
]) {
  fs.appendFileSync(
    path.join(output, 'main', name + '.js'),
    '\n;(() => {\n' + appearance + '\n})();\n',
  );
}
