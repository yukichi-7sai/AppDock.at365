const fs = require('node:fs');
const path = require('node:path');

/** Settings fixture paths follow the production data layout. No legacy file import. */
exports.file = (profile, name = 'settings.json') => {
  if (!/^settings(?:-[^\\/]+)?\.json$/.test(name)) throw Error('Invalid settings fixture name');
  const directory = path.join(profile, 'data');
  fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, name);
};

/** Seed current local generation settings explicitly; this is not legacy-data migration. */
exports.write = (profile, value, localRoot = path.join(profile, 'data')) => {
  const {
    generationSettings,
    withoutGenerationSettings,
  } = require('../out/main/main/core/generation-settings');
  fs.writeFileSync(exports.file(profile), JSON.stringify(withoutGenerationSettings(value)));
  fs.mkdirSync(localRoot, { recursive: true });
  fs.writeFileSync(
    path.join(localRoot, 'generation-ai.json'),
    JSON.stringify(generationSettings(value)),
  );
};
exports.read = (profile, localRoot = path.join(profile, 'data')) => {
  const {
    withGenerationSettings,
    parseGenerationSettings,
  } = require('../out/main/main/core/generation-settings');
  return withGenerationSettings(
    JSON.parse(fs.readFileSync(exports.file(profile))),
    parseGenerationSettings(
      JSON.parse(fs.readFileSync(path.join(localRoot, 'generation-ai.json'))),
    ),
  );
};
