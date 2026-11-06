const fs = require('node:fs');
const path = require('node:path');
const machineName = require('node:os').hostname();

/** Settings fixture paths follow the production data layout. No legacy file import. */
exports.file = (profile, name = 'settings.json') => {
  if (!/^settings(?:-[^\\/]+)?\.json$/.test(name)) throw Error('Invalid settings fixture name');
  const directory = path.join(profile, 'data');
  fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, name);
};

exports.deviceFile = (profile) => exports.file(profile, 'settings-' + machineName + '.json');

/** Seed shared and device settings using the current on-disk layout. */
exports.write = (profile, value) => {
  const {
    generationSettings,
    withoutGenerationSettings,
  } = require('../out/main/main/core/generation-settings');
  const { mcpClient, ...shared } = withoutGenerationSettings(value);
  fs.writeFileSync(exports.file(profile), JSON.stringify(shared));
  const deviceFile = exports.deviceFile(profile);
  const {
    initialDeviceSettings,
    readDeviceCollections,
  } = require('../out/main/main/core/device-settings');
  const device = fs.existsSync(deviceFile)
    ? JSON.parse(fs.readFileSync(deviceFile))
    : initialDeviceSettings(
        machineName,
        require('../out/main/shared/settings-schema').parseSettings(value),
        readDeviceCollections([path.join(profile, 'extensions')]),
      );
  if (mcpClient !== undefined) device.mcpClient = mcpClient;
  device.generationAi = generationSettings(value);
  fs.writeFileSync(deviceFile, JSON.stringify(device));
};
exports.read = (profile) => {
  const {
    withGenerationSettings,
    parseGenerationSettings,
  } = require('../out/main/main/core/generation-settings');
  const device = JSON.parse(fs.readFileSync(exports.deviceFile(profile)));
  const result = withGenerationSettings(
    JSON.parse(fs.readFileSync(exports.file(profile))),
    parseGenerationSettings(device.generationAi ?? { version: 1 }),
  );
  result.mcpClient = device.mcpClient;
  return result;
};
