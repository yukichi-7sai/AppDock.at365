const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Settings fixture paths follow the production data layout. No legacy file import. */
exports.file = (profile, name = 'settings.json') => {
  if (!/^settings(?:-[^\\/]+)?\.json$/.test(name)) throw Error('Invalid settings fixture name');
  const directory = path.join(profile, 'data');
  fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, name);
};
exports.deviceFile = (profile) => exports.file(profile, `settings-${os.hostname()}.json`);

/** Seed the current settings files for an isolated profile. */
exports.write = (profile, value, localRoot = path.join(profile, 'data')) => {
  const {
    generationSettings,
    withoutGenerationSettings,
  } = require('../out/main/main/core/generation-settings');
  const { mcpClient, operationPermissions, ...shared } = withoutGenerationSettings(value);
  fs.writeFileSync(exports.file(profile), JSON.stringify(shared));
  if (mcpClient !== undefined || operationPermissions !== undefined) {
    const deviceFile = exports.deviceFile(profile);
    const { initialDeviceSettings } = require('../out/main/main/core/device-settings');
    const device = fs.existsSync(deviceFile)
      ? JSON.parse(fs.readFileSync(deviceFile))
      : initialDeviceSettings(
          os.hostname(),
          require('../out/main/shared/settings-schema').parseSettings(value),
        );
    if (mcpClient !== undefined) device.mcpClient = mcpClient;
    if (operationPermissions !== undefined) device.operationPermissions = operationPermissions;
    fs.writeFileSync(deviceFile, JSON.stringify(device));
  }
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
  const result = withGenerationSettings(
    JSON.parse(fs.readFileSync(exports.file(profile))),
    parseGenerationSettings(
      JSON.parse(fs.readFileSync(path.join(localRoot, 'generation-ai.json'))),
    ),
  );
  const deviceFile = exports.deviceFile(profile);
  if (fs.existsSync(deviceFile))
    result.mcpClient = JSON.parse(fs.readFileSync(deviceFile)).mcpClient;
  return result;
};
