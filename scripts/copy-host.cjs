const fs = require('node:fs');
const path = require('node:path');

// Test fixtures must copy the fixed distribution, not just its executable.
function copyHost(source, destination, mode) {
  if (path.basename(source).toLowerCase() !== 'appdock.at365.exe')
    return fs.copyFileSync(source, destination, mode);
  const directory = path.dirname(source);
  const manifest = path.join(directory, 'appdock-host.json');
  if (!fs.existsSync(manifest)) {
    const unpacked = path.join(directory, 'win-unpacked', path.basename(source));
    if (!fs.existsSync(source) && fs.existsSync(unpacked)) return copyHost(unpacked, destination);
    return fs.copyFileSync(source, destination, mode);
  }
  const { entries } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
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
