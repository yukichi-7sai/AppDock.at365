const path = require('node:path');
const { getPrimaryCheckout } = require('../../scripts/publish-paths.cjs');

const workspace = path.dirname(getPrimaryCheckout(path.resolve(__dirname, '../..')));

function siblingManifest(repository) {
  return require(path.join(workspace, repository, 'extension.json'));
}

module.exports = { siblingManifest };
