const fs = require('node:fs');
const path = require('node:path');
const { TestHostRuntime, managedEntries } = require('./test-host-runtime.cjs');
const runtime = new TestHostRuntime(path.resolve(__dirname, '../.artifacts'));
const appletRuntimes = new Map();
process.once('exit', () => {
  runtime.close();
  for (const applet of appletRuntimes.values()) applet.close();
});

// Test fixtures must copy the fixed distribution, not just its executable.
function copyHost(source, destination, mode) {
  if (path.resolve(destination).toLowerCase() === runtime.path.toLowerCase())
    return runtime.copy(source, (input, output) => copyDistribution(input, output));
  return copyDistribution(source, destination, mode);
}

function copyDistribution(source, destination, mode) {
  if (path.basename(source).toLowerCase() !== 'appdock.at365.exe')
    return fs.copyFileSync(source, destination, mode);
  const directory = path.dirname(source);
  const manifest = path.join(directory, 'appdock-host.json');
  if (!fs.existsSync(manifest)) {
    const unpacked = path.join(directory, 'win-unpacked', path.basename(source));
    if (!fs.existsSync(source) && fs.existsSync(unpacked))
      return copyDistribution(unpacked, destination);
    return fs.copyFileSync(source, destination, mode);
  }
  const entries = managedEntries(directory);
  for (const entry of entries) {
    if (path.basename(entry) !== entry || ['settings.json', 'data', 'extensions'].includes(entry))
      throw Error('Unsafe host fixture entry');
    fs.cpSync(
      path.join(directory, entry),
      entry === 'AppDock.at365.exe' ? destination : path.join(path.dirname(destination), entry),
      {
        recursive: true,
      },
    );
  }
}
exports.copyHost = copyHost;
exports.testHostPath = (profile, artifacts) => runtime.executable(profile, artifacts);
exports.prepareTestHost = (source, profile, artifacts) => {
  const executable = runtime.executable(profile, artifacts);
  copyHost(source, executable);
  return executable;
};
exports.prepareTestApplet = (source, profile, artifacts) => {
  artifacts = path.resolve(artifacts);
  source = path.resolve(source);
  const executableName = path.basename(source);
  if (
    !/^Applet\.[a-z0-9.-]+\.exe$/i.test(executableName) ||
    path.basename(artifacts).toLowerCase() !== '.artifacts'
  )
    throw Error('Invalid native Applet test runtime');
  const slot = executableName
    .replace(/\.exe$/i, '')
    .toLowerCase()
    .replaceAll('.', '-');
  const key = path.join(artifacts, slot).toLowerCase();
  if (!appletRuntimes.has(key))
    appletRuntimes.set(
      key,
      new TestHostRuntime(artifacts, undefined, { slot, executableName, native: true }),
    );
  const applet = appletRuntimes.get(key);
  const executable = applet.executable(profile);
  applet.copy(source, (input, output, entries) => {
    for (const entry of entries)
      fs.cpSync(path.join(path.dirname(input), entry), path.join(path.dirname(output), entry), {
        recursive: true,
      });
  });
  return executable;
};
