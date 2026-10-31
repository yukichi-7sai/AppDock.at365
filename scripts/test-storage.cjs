const path = require('node:path');
const { hostname } = require('node:os');
const { appletStorageFile } = require('../out/main/main/core/applet-storage');
const file = (profile, owner, key, scope) =>
  appletStorageFile(path.join(profile, 'data'), owner, key, scope, hostname());
module.exports = {
  file,
  directory: (profile, owner, scope) => path.dirname(file(profile, owner, 'fixture', scope)),
};
