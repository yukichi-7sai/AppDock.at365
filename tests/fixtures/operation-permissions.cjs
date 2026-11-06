const path = require('node:path');
const { DeviceSettingsStore } = require('../../out/main/main/core/device-settings-store');

exports.openOperationPermissions = (t, base, machineName = 'PermissionTest') => {
  const settings = new DeviceSettingsStore(
    path.join(base, 'data', 'settings.json'),
    path.join(base, 'local'),
    machineName,
  );
  settings.load();
  t.after(() => settings.close());
  return settings;
};
