const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `smoke-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const portable = !!process.argv[2];
const executable = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) fs.copyFileSync(path.resolve(process.argv[2]), executable);
const args = portable ? ['--smoke-test'] : [root, '--smoke-test', `--smoke-dir=${profile}`];
const childEnvironment = { ...process.env };
delete childEnvironment.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, args, {
  cwd: root,
  // The UI check must allow the first native window to be shown on Windows.
  windowsHide: false,
  stdio: 'pipe',
  env: childEnvironment,
});
let output = '';
child.stdout.on('data', (d) => {
  output += d;
});
child.stderr.on('data', (d) => {
  output += d;
});
const timer = setTimeout(() => {
  child.kill();
  console.error('Smoke test timed out.\n' + output);
  process.exitCode = 1;
}, 90000);
child.on('error', (error) => {
  clearTimeout(timer);
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  clearTimeout(timer);
  const file = path.join(profile, 'smoke-result.json');
  if (!fs.existsSync(file)) {
    console.error(output);
    console.error('No smoke result, exit code ' + code);
    process.exitCode = 1;
    return;
  }
  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (
    result.ok &&
    path.resolve(result.settingsPath).toLowerCase() !==
      path.join(profile, 'settings.json').toLowerCase()
  ) {
    result.ok = false;
    result.error = 'Settings were not saved beside the original executable.';
  }
  if (
    result.ok &&
    (!fs.existsSync(path.join(profile, 'data/assets/images/smoke-image.png')) ||
      path.resolve(result.registeredImage).toLowerCase() !==
        path.join(profile, 'data/assets/images/smoke-image.png').toLowerCase())
  ) {
    result.ok = false;
    result.error = 'Registered image was not saved under data/assets/images.';
  }
  console.log(JSON.stringify({ profile, portable, ...result }, null, 2));
  if (!result.ok) {
    console.error(output);
    process.exitCode = 1;
  }
});
