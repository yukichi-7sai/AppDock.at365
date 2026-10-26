const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'shells/default/extension.json'), 'utf8'),
);
manifest.version = version;
fs.writeFileSync(
  path.join(root, 'out/shells/default/extension.json'),
  JSON.stringify(manifest, null, 2),
);
require('./copy-host.cjs').copyHost(
  path.join(root, 'shells/default/worker.cjs'),
  path.join(root, 'out/shells/default/worker.cjs'),
);
