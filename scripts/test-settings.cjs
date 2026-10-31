const fs = require('node:fs');
const path = require('node:path');

/** Settings fixture paths follow the production data layout. No legacy file import. */
exports.file = (profile, name = 'settings.json') => {
  if (!/^settings(?:-[^\\/]+)?\.json$/.test(name)) throw Error('Invalid settings fixture name');
  const directory = path.join(profile, 'data');
  fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, name);
};
